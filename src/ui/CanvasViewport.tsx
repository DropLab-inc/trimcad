import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type SyntheticEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent,
} from 'react'
import { applyDrawTool, currentPrompt, previewTrimExtend, useCadStore } from '../core/store'
import { usePreferences } from '../core/preferences'
import { normalizeBounds, pageSizeMm } from '../core/print'
import {
  cancelPlotWindow,
  finishPlotWindow,
  setViewportSize,
  usePrintSession,
} from '../core/printSession'
import { formatPrompt, matchKeyword } from '../core/prompts'
import { applyOrtho, applyPolarTracking, findBestSnap, trackingAppliesTo } from '../core/snap'
import {
  boundsIndex,
  entitiesInBounds,
  entitiesNearPoint,
  entityBounds,
  rectFromPoints,
  selectEntitiesInRect,
  selectionModeFor,
} from '../core/selection'
import {
  fieldsForTool,
  hasTypedValue,
  resolveDynamicPoint,
  type DynamicField,
} from '../core/dynamicInput'
import { isTransformTool, transformedBy } from '../core/commands'
import { editableEntities, lineweightPixels, visibleEntities as visibleOnLayers } from '../core/layers'
import { isPointNearEntity, mirrorEntity, moveEntity } from '../core/geometry'
import { canFillet, chamferCorner, filletCorner, hasStraightSegments, offsetEntity } from '../core/modify'
import { canBeTangent, circleOnDiameter, circleThroughPoints, cornerRadius, polygonOnEdge, rectFromCenter, rectFromCorners, arcFromCenterStartEnd, arcFromStartCenterEnd, arcThroughPoints } from '../core/construct'
import { polarArrayCopies, rectangularArrayCopies } from '../core/array'
import { dragGrip, entityGrips, findGripAt, type Grip } from '../core/grips'
import type { BlockDefinition, CadEntity, DimensionEntity, Layout, PolylineEntity, SnapMode, Viewport } from '../core/types'
import type { Vec2 } from '../core/math/vec2'
import { COMMAND_INPUT_ID, focusCommandInput } from './commandFocus'
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery'
import { renderDimension, renderEntity, splinePath } from './renderers'
import { readableOnCanvas, useCanvasPalette } from './theme'
import { snapToSpacing } from '../core/store'

type Camera = { x: number; y: number; zoom: number }

/**
 * The wheel's zoom limits, shared with the two-finger pinch so a gesture cannot travel further than a
 * mouse can.
 *
 * Deliberately extreme now. At the old ceiling of 50 pixels to the unit you could not get close
 * enough to draw or snap a microscopic feature, which is most of what a CAD drawing is for. A floor
 * and a ceiling still exist — zoom is a floating-point scale, and with no bound at all it eventually
 * reaches infinity or zero and the view cannot be got back — but at a million to one either way
 * nobody reaches them by accident.
 */
/**
 * How many objects the canvas will hand to the DOM at once. Chosen to sit comfortably inside what a
 * browser renders without stalling — a few tens of thousands of SVG nodes is already a lot — so a
 * drawing with more in view draws a capped view and says so.
 */
export const MAX_RENDERED_ENTITIES = 20000

/** What one object costs the DOM: a block insert costs what it expands to. */
const renderCost = (entity: CadEntity, blocks: BlockDefinition[], depth = 0): number => {
  if (entity.type !== 'insert' || depth > 8) return 1
  const block = blocks.find((candidate) => candidate.id === entity.blockId)
  if (!block) return 1
  return block.entities.reduce((total, member) => total + renderCost(member, blocks, depth + 1), 0)
}

/**
 * The objects the canvas will draw, under a budget measured in DOM nodes rather than in objects.
 *
 * Counting objects is not enough: one insert of a title block expands into hundreds of nodes, so a
 * sheet of blocks passed an object cap and still handed the DOM a hundred thousand elements. The
 * budget is spent on what each object actually costs.
 */
export const withinRenderBudget = (entities: CadEntity[], blocks: BlockDefinition[]): CadEntity[] => {
  const kept: CadEntity[] = []
  let spent = 0
  for (const entity of entities) {
    const cost = renderCost(entity, blocks)
    // One object heavier than the whole budget still draws itself: a canvas showing one thing beats
    // a canvas showing nothing.
    if (spent > 0 && spent + cost > MAX_RENDERED_ENTITIES) break
    spent += cost
    kept.push(entity)
  }
  return kept
}

export const ZOOM_MIN = 1e-6
export const ZOOM_MAX = 1e6

/** Where a two-finger gesture stood when it began, so each move is measured from its start. */
type Pinch = {
  /** Finger separation in screen pixels. Held above zero so the ratio is always finite. */
  spread: number
  /** The zoom the gesture began at; the change in separation scales this. */
  zoom: number
  /** The drawing point under the fingers when the gesture began. */
  anchor: Vec2
}

/** Stable empty object so memo dependencies do not change on every render. */
const NO_VALUES: Record<string, string> = {}

/** Whether a point on the sheet falls inside a viewport's frame — the frame a press lands in. */
const inViewportFrame = (viewport: Viewport, paper: Vec2): boolean =>
  Math.abs(paper.x - viewport.center.x) <= viewport.widthMm / 2 &&
  Math.abs(paper.y - viewport.center.y) <= viewport.heightMm / 2

const screenToWorld = (point: Vec2, camera: Camera): Vec2 => ({
  x: (point.x - camera.x) / camera.zoom,
  y: (point.y - camera.y) / camera.zoom,
})

const worldToScreen = (point: Vec2, camera: Camera): Vec2 => ({
  x: point.x * camera.zoom + camera.x,
  y: point.y * camera.zoom + camera.y,
})

/** Below this drag distance a press-and-release counts as a pick rather than a fence. */
const FENCE_THRESHOLD = 5

/** How far a press has to travel before it counts as dragging rather than clicking. */
const DRAG_THRESHOLD = 4

/** AutoCAD draws a distinct glyph per snap type; this keeps the marker readable at a glance. */
const SnapGlyph = ({ mode, at, color, size = 7 }: { mode: SnapMode; at: Vec2; color: string; size?: number }) => {
  const props = { stroke: color, strokeWidth: 1.6, fill: 'none' }
  switch (mode) {
    case 'endpoint':
      return <rect x={at.x - size} y={at.y - size} width={size * 2} height={size * 2} {...props} />
    case 'midpoint':
      return <polygon points={`${at.x},${at.y - size} ${at.x - size},${at.y + size} ${at.x + size},${at.y + size}`} {...props} />
    case 'center':
      return <circle cx={at.x} cy={at.y} r={size} {...props} />
    case 'quadrant':
      return <polygon points={`${at.x},${at.y - size} ${at.x + size},${at.y} ${at.x},${at.y + size} ${at.x - size},${at.y}`} {...props} />
    case 'intersection':
      return (
        <g {...props}>
          <line x1={at.x - size} y1={at.y - size} x2={at.x + size} y2={at.y + size} />
          <line x1={at.x + size} y1={at.y - size} x2={at.x - size} y2={at.y + size} />
        </g>
      )
    case 'perpendicular':
      return (
        <g {...props}>
          <line x1={at.x - size} y1={at.y + size} x2={at.x + size} y2={at.y + size} />
          <line x1={at.x - size} y1={at.y - size} x2={at.x - size} y2={at.y + size} />
          <line x1={at.x - size} y1={at.y} x2={at.x} y2={at.y} />
        </g>
      )
    case 'tangent':
      return (
        <g {...props}>
          <circle cx={at.x} cy={at.y + 1} r={size - 1} />
          <line x1={at.x - size} y1={at.y - size} x2={at.x + size} y2={at.y - size} />
        </g>
      )
    case 'node':
      return (
        <g {...props}>
          <circle cx={at.x} cy={at.y} r={size} />
          <line x1={at.x - size} y1={at.y} x2={at.x + size} y2={at.y} />
          <line x1={at.x} y1={at.y - size} x2={at.x} y2={at.y + size} />
        </g>
      )
    default:
      return <rect x={at.x - size} y={at.y - size} width={size * 2} height={size * 2} {...props} strokeDasharray="3 2" />
  }
}

const polygonPoints = (center: Vec2, radius: number, sides: number): Vec2[] =>
  Array.from({ length: Math.max(3, sides) }, (_, index) => {
    const angle = (index / Math.max(3, sides)) * Math.PI * 2
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
  })

const arcPreviewPath = (center: Vec2, radius: number, startAngle: number, endAngle: number): string => {
  const sx = center.x + Math.cos(startAngle) * radius
  const sy = center.y + Math.sin(startAngle) * radius
  const ex = center.x + Math.cos(endAngle) * radius
  const ey = center.y + Math.sin(endAngle) * radius
  let sweep = endAngle - startAngle
  while (sweep < 0) sweep += Math.PI * 2
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${ex} ${ey}`
}

export function CanvasViewport() {
  const palette = useCanvasPalette()
  const doc = useCadStore((state) => state.doc)
  const selectedIds = useCadStore((state) => state.selectedIds)
  const activeTool = useCadStore((state) => state.activeTool)
  const camera = useCadStore((state) => state.camera)
  const activeLayoutId = useCadStore((state) => state.activeLayoutId)
  const activeViewportId = useCadStore((state) => state.activeViewportId)
  const selectViewport = useCadStore((state) => state.selectViewport)
  const updateViewport = useCadStore((state) => state.updateViewport)
  const enteredViewportId = useCadStore((state) => state.enteredViewportId)
  const enterViewport = useCadStore((state) => state.enterViewport)
  const editTextAt = useCadStore((state) => state.editTextAt)
  const zoomViewport = useCadStore((state) => state.zoomViewport)
  const panViewport = useCadStore((state) => state.panViewport)
  const setCamera = useCadStore((state) => state.setCamera)
  const applySelection = useCadStore((state) => state.applySelection)
  const selectAll = useCadStore((state) => state.selectAll)
  const undo = useCadStore((state) => state.undo)
  const redo = useCadStore((state) => state.redo)
  const setStatusMessage = useCadStore((state) => state.setStatusMessage)
  const snapModes = useCadStore((state) => state.snapModes)
  const osnapEnabled = useCadStore((state) => state.osnapEnabled)
  const snapEnabled = useCadStore((state) => state.snapEnabled)
  const snapSpacing = useCadStore((state) => state.snapSpacing)
  const polarEnabled = useCadStore((state) => state.polarEnabled)
  const lwDisplay = useCadStore((state) => state.lwDisplay)
  const draftPoints = useCadStore((state) => state.draftPoints)
  const polygonSides = useCadStore((state) => state.polygonSides)
  const polygonFit = useCadStore((state) => state.polygonFit)
  const circleMode = useCadStore((state) => state.circleMode)
  const arcMode = useCadStore((state) => state.arcMode)
  const rectMode = useCadStore((state) => state.rectMode)
  const rectRotation = useCadStore((state) => state.rectRotation)
  const tangentPicks = useCadStore((state) => state.tangentPicks)
  const arrayType = useCadStore((state) => state.arrayType)
  const arrayRows = useCadStore((state) => state.arrayRows)
  const arrayColumns = useCadStore((state) => state.arrayColumns)
  const arrayRowSpacing = useCadStore((state) => state.arrayRowSpacing)
  const arrayColumnSpacing = useCadStore((state) => state.arrayColumnSpacing)
  const arrayCount = useCadStore((state) => state.arrayCount)
  const arrayFillAngle = useCadStore((state) => state.arrayFillAngle)
  const arrayRotateItems = useCadStore((state) => state.arrayRotateItems)
  const dimensionType = useCadStore((state) => state.dimensionType)
  const dimScale = useCadStore((state) => state.dimScale)
  const textHeightState = useCadStore((state) => state.textHeight)
  const zoomExtentsToken = useCadStore((state) => state.zoomExtentsToken)
  const modifyTargetId = useCadStore((state) => state.modifyTargetId)
  const offsetDistance = useCadStore((state) => state.offsetDistance)
  const filletRadius = useCadStore((state) => state.filletRadius)
  const chamferDistance = useCadStore((state) => state.chamferDistance)
  const edgeIds = useCadStore((state) => state.edgeIds)
  const pickingEdges = useCadStore((state) => state.pickingEdges)
  const finishEdgeSelection = useCadStore((state) => state.finishEdgeSelection)
  const applyFence = useCadStore((state) => state.applyFence)
  const applyKeyword = useCadStore((state) => state.applyKeyword)
  const finishDraft = useCadStore((state) => state.finishDraft)
  const endCommand = useCadStore((state) => state.endCommand)
  const cancelCommand = useCadStore((state) => state.cancelCommand)
  const deleteSelection = useCadStore((state) => state.deleteSelection)
  const setCommandInput = useCadStore((state) => state.setCommandInput)
  const repeatLastCommand = useCadStore((state) => state.repeatLastCommand)
  const publishCursorWorld = useCadStore((state) => state.setCursorWorld)
  const orthoEnabled = useCadStore((state) => state.orthoEnabled)
  const stretchGrip = useCadStore((state) => state.stretchGrip)
  const moveSelectionBy = useCadStore((state) => state.moveSelectionBy)

  const frameRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [cursorScreen, setCursorScreen] = useState<Vec2 | null>(null)
  const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null)
  const [activeSnap, setActiveSnap] = useState<SnapMode | null>(null)
  const [trackingLabel, setTrackingLabel] = useState<string | null>(null)
  const [orthoHeld, setOrthoHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const [lastMouse, setLastMouse] = useState<Vec2 | null>(null)
  /** The live two-finger gesture, or null while fewer than two fingers are down. */
  const pinch = useRef<Pinch | null>(null)
  /** A viewport being dragged around its sheet, and where inside it the grab landed. */
  const [viewportDrag, setViewportDrag] = useState<{ id: string; grab: Vec2 } | null>(null)
  /** A drawing being slid inside an entered viewport, and where the pointer last was on the sheet. */
  const [viewportPan, setViewportPan] = useState<{ id: string; last: Vec2 } | null>(null)
  const [boxStart, setBoxStart] = useState<Vec2 | null>(null)
  const [boxEnd, setBoxEnd] = useState<Vec2 | null>(null)
  /**
   * A selection window whose first corner has been clicked and let go of. The far corner then
   * follows the cursor with no button held until a second click closes it, which is how AutoCAD
   * behaves when PICKDRAG allows it.
   */
  const [boxLatched, setBoxLatched] = useState(false)
  const [fenceStart, setFenceStart] = useState<Vec2 | null>(null)
  const [fenceEnd, setFenceEnd] = useState<Vec2 | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  /** A grip being dragged: which object it belongs to, which handle it is, and where it is now. */
  const [gripDrag, setGripDrag] = useState<{ entityId: string; grip: Grip; to: Vec2 } | null>(null)
  /** A press on an already-selected object, which becomes a move once the cursor travels. */
  const [objectDrag, setObjectDrag] = useState<{ from: Vec2; to: Vec2 } | null>(null)
  const [hoverGrip, setHoverGrip] = useState<{ entityId: string; grip: Grip } | null>(null)
  /*
   * The dynamic input's field state lives in the store rather than here, because the command
   * line writes to it as well: on a phone the keyboard belongs to that input, so the canvas
   * never sees the keystrokes that fill a box.
   */
  const typedState = useCadStore((state) => state.typed)
  const setTypedState = useCadStore((state) => state.setTypedState)
  const [size, setSize] = useState({ width: 1000, height: 700 })
  const preferences = usePreferences()
  const printSession = usePrintSession()
  const pickingPlotWindow = printSession.pickingWindow
  /** The pick box, grip reach and snap aperture are set in screen pixels but used in drawing units. */
  const pickTolerance = preferences.pickBoxSize / camera.zoom
  /** Whether clicking one corner and then the other is an accepted way to draw a window out. */
  const clickWindows = preferences.windowSelection !== 'drag'
  /**
   * What a pick does to what is already chosen. With "use Shift to add" off, every pick adds, as
   * AutoCAD's PICKADD does; Ctrl still takes things back out either way.
   */
  const selectionModifier = (event: { shiftKey: boolean; ctrlKey: boolean }) =>
    event.ctrlKey ? 'remove' : event.shiftKey || !preferences.shiftToAdd ? 'add' : 'replace'
  /**
   * How far each arm of the crosshair reaches, from AutoCAD's CURSORSIZE. At 100 it spans the whole
   * viewport, which is the full-screen crosshair; below that it becomes a cross around the cursor.
   */
  const crosshairReach = (Math.max(size.width, size.height) * preferences.crosshairSize) / 100

  /** TRIM and EXTEND are the same command with the roles reversed; Shift flips which one you get. */
  const editingEdges = activeTool === 'trim' || activeTool === 'extend'
  const swapped = editingEdges && orthoHeld
  const promptText = useCadStore((state) => formatPrompt(currentPrompt(state, swapped)))

  /** The sheet being worked on, or null while model space is showing. */
  const activeLayout = activeLayoutId
    ? doc.layouts.find((layout) => layout.id === activeLayoutId) ?? null
    : null

  /** The model's own visible objects, which is exactly what a viewport puts onto a sheet. */
  const modelVisible = useMemo(() => visibleOnLayers(doc), [doc])

  /*
   * While a sheet is open the canvas works on the sheet: its own geometry is what is drawn on the
   * paper, what a click may pick and what a snap may catch. Snapping to the model from paper space
   * would drop points in the wrong space altogether — paper millimetres against drawing units — and
   * the border of a title block has nothing to snap to in a drawing.
   */
  const spaceDoc = useMemo(
    () => (activeLayout ? { ...doc, entities: activeLayout.entities } : doc),
    [doc, activeLayout],
  )

  const visibleEntities = useMemo(
    () => (activeLayout ? visibleOnLayers(spaceDoc) : modelVisible),
    [activeLayout, spaceDoc, modelVisible],
  )

  const drawnBounds = useMemo(
    () => boundsIndex(visibleEntities, doc.blocks, doc.textStyles),
    [visibleEntities, doc.blocks, doc.textStyles],
  )

  /** What a click may actually pick: locked layers stay on screen but refuse selection. */
  const pickableEntities = useMemo(() => editableEntities(spaceDoc), [spaceDoc])

  /** The objects showing grips, and so the only ones that can be reshaped by hand. */
  const selectedEntities = useMemo(
    () => pickableEntities.filter((entity) => selectedIds.includes(entity.id)),
    [pickableEntities, selectedIds],
  )

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      const next = { width: Math.max(320, rect.width), height: Math.max(240, rect.height) }
      setSize(next)
      setViewportSize(next.width, next.height)
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // Plot window picking tells the command line what it is waiting for.
  useEffect(() => {
    if (!pickingPlotWindow) return
    setStatusMessage('Specify first corner of plot window:')
  }, [pickingPlotWindow, setStatusMessage])

  // Typed values belong to a single step of a command, so anything captured for a previous step
  // is simply ignored rather than cleared from an effect.
  const stepKey = `${activeTool}:${draftPoints.length}`
  const typedValues = typedState.step === stepKey ? typedState.values : NO_VALUES
  const activeFieldIndex = typedState.step === stepKey ? typedState.field : 0

  const dynamicFields = useMemo<DynamicField[]>(() => {
    if (!cursorWorld) return []
    const fields = fieldsForTool(activeTool, draftPoints, cursorWorld)
    if (!fields) return []
    return fields.map((field) => ({ ...field, typed: typedValues[field.key] }))
  }, [activeTool, cursorWorld, draftPoints, typedValues])

  /** The point a click or Enter would use: typed field values override the cursor. */
  const commandPoint = useMemo(() => {
    if (!cursorWorld) return null
    if (!hasTypedValue(dynamicFields)) return cursorWorld
    return resolveDynamicPoint(activeTool, dynamicFields, draftPoints, cursorWorld)
  }, [activeTool, cursorWorld, draftPoints, dynamicFields])

  const fieldIndex = Math.min(activeFieldIndex, Math.max(0, dynamicFields.length - 1))

  /*
   * A phone has no cursor to hover with, so the dimension boxes are the only thing
   * that says what a command is waiting for, and they are the only way to type a
   * value. That makes them a control rather than a readout: sized for a finger, kept
   * inside the viewport, and tappable anywhere on the row — label and number included,
   * because that is what "tapping the box" actually means.
   */
  const narrow = useMediaQuery(NARROW_QUERY)
  const boxHeight = narrow ? 36 : 19
  const boxWidth = narrow ? 176 : 140
  const boxGap = narrow ? 8 : 2
  const boxFont = narrow ? 13 : 11
  const boxPad = narrow ? 11 : 7
  const boxOffset = narrow ? 18 : 14

  /** Screen-space top-left for the Nth box, flipped rather than run off the edge. */
  const boxAt = (anchor: Vec2, index: number, total: number) => {
    const stack = total * boxHeight + (total - 1) * boxGap
    const below = anchor.y + boxOffset
    const top = below + stack <= height - 4 ? below : Math.max(4, anchor.y - boxOffset - stack)
    const left =
      anchor.x + boxOffset + boxWidth <= width - 4
        ? anchor.x + boxOffset
        : Math.max(4, anchor.x - boxOffset - boxWidth)
    return { x: left, y: top + index * (boxHeight + boxGap) }
  }

  /**
   * Tapping a box makes that field the active one and raises the command input, where
   * the value is typed. Without this the tap reached the canvas.
   */
  const tapField = (index: number) => (event: SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setTypedState({ step: stepKey, values: typedValues, field: index })
    focusCommandInput()
  }

  /**
   * A tap on a phone also synthesises a mousedown, and the canvas places a point on
   * mousedown. The pointer event is cancelled above; this is the belt to that braces,
   * for the browsers that send the compatibility events anyway.
   */
  const blockTap = (event: SyntheticEvent) => event.stopPropagation()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        document.activeElement?.id === COMMAND_INPUT_ID ||
        (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'))
      /*
       * The element that has focus matters more than the event's own target. Some phone keyboards
       * dispatch key events to the document rather than to the field that is focused, and when that
       * happens this handler and the browser both write the same character: the value comes out
       * doubled or, because this handler focuses the input halfway through, out of order — "20"
       * arriving as "02". While the command input has the caret, its text is the input's business.
       */
      if (typing) return
      // Ortho belongs to the drawing, so Shift only arms it when the keyboard is not on a field.
      if (event.key === 'Shift') setOrthoHeld(true)

      // Ctrl and Cmd chords are application-wide accelerators, handled by useGlobalShortcuts.
      if (event.ctrlKey || event.metaKey) return

      const clearTyped = () => setTypedState({ step: stepKey, values: NO_VALUES, field: 0 })
      const writeTyped = (values: Record<string, string>, field: number) =>
        setTypedState({ step: stepKey, values, field })

      if (dynamicFields.length > 0) {
        const key = dynamicFields[fieldIndex].key
        if (event.key === 'Tab') {
          event.preventDefault()
          writeTyped(typedValues, (fieldIndex + 1) % dynamicFields.length)
          return
        }
        if (/^[0-9.-]$/.test(event.key)) {
          event.preventDefault()
          writeTyped({ ...typedValues, [key]: (typedValues[key] ?? '') + event.key }, fieldIndex)
          return
        }
        if (event.key === 'Backspace') {
          event.preventDefault()
          writeTyped({ ...typedValues, [key]: (typedValues[key] ?? '').slice(0, -1) }, fieldIndex)
          return
        }
      }

      if (event.key === 'Escape') {
        clearTyped()
        // A drag in progress is abandoned first, leaving the shape as it was and the selection alone.
        if (gripDrag || objectDrag) {
          setGripDrag(null)
          setObjectDrag(null)
          return
        }
        // A plot window being picked is called off and the Plot dialog comes back.
        if (pickingPlotWindow) {
          setBoxLatched(false)
          setBoxStart(null)
          setBoxEnd(null)
          cancelPlotWindow()
          return
        }
        // A window waiting for its second corner is called off, leaving the selection untouched.
        if (boxLatched) {
          setBoxLatched(false)
          setBoxStart(null)
          setBoxEnd(null)
          setStatusMessage('*Cancel*')
          return
        }
        // Escape leaves whatever command is running and drops back to the selection prompt.
        // Pressing it again from there clears the selection, as AutoCAD does.
        if (activeTool !== 'select' || draftPoints.length > 0 || pickingEdges) cancelCommand()
        else applySelection([], 'replace')
        return
      }
      /*
       * Enter accepts the point, as it does in AutoCAD. Space does the same, but only from a
       * keyboard that cannot insert a space by itself: predictive keyboards add one as the user
       * types, and treating that as Enter commits a half-typed value.
       */
      // A space accepts a command, never a prompt that is waiting for words: a note is mostly spaces.
      const spaceAccepts =
        event.key === ' ' && !navigator.maxTouchPoints && currentPrompt(useCadStore.getState()).kind !== 'text'
      if (event.key === 'Enter' || spaceAccepts) {
        event.preventDefault()
        if (pickingEdges) {
          finishEdgeSelection()
          return
        }
        if (commandPoint && hasTypedValue(dynamicFields)) {
          applyDrawTool(commandPoint)
          clearTyped()
          return
        }
        // Enter and Space accept the running command and return to the selection prompt; from
        // there they repeat whatever ran last.
        if (draftPoints.length > 0) finishDraft()
        if (activeTool !== 'select') endCommand()
        else repeatLastCommand()
        return
      }

      // A single letter that names one of the current prompt's options picks it, so `F` starts a
      // fence during TRIM without having to click into the command line first.
      if (/^[a-zA-Z]$/.test(event.key)) {
        const store = useCadStore.getState()
        const keyword = matchKeyword(event.key, currentPrompt(store, swapped).keywords)
        if (keyword) {
          event.preventDefault()
          applyKeyword(keyword)
          return
        }
      }

      if (event.key === 'Delete') {
        deleteSelection()
        return
      }

      // Anything else printable belongs to the command line, so typing anywhere starts a command
      // without having to click into the input first.
      if (event.key.length === 1 && !event.altKey) {
        event.preventDefault()
        setCommandInput(useCadStore.getState().commandInput + event.key)
        document.getElementById(COMMAND_INPUT_ID)?.focus()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setOrthoHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [
    activeTool,
    applyKeyword,
    applySelection,
    boxLatched,
    cancelCommand,
    commandPoint,
    deleteSelection,
    draftPoints.length,
    endCommand,
    dynamicFields,
    fieldIndex,
    finishDraft,
    finishEdgeSelection,
    gripDrag,
    objectDrag,
    pickingEdges,
    pickingPlotWindow,
    redo,
    repeatLastCommand,
    selectAll,
    setCommandInput,
    stepKey,
    swapped,
    typedValues,
    undo,
  ])

  const resolvePoint = (
    screenPoint: Vec2,
    options?: { ignoreId?: string; from?: Vec2; osnap?: boolean },
  ): { point: Vec2; snap: SnapMode | null; tracking: string | null } => {
    const raw = screenToWorld(screenPoint, camera)
    const basePoint = options?.from ?? draftPoints.at(-1)

    // FILLET and CHAMFER read a click as "this edge, on this side" rather than as a position, so
    // pulling it onto a nearby vertex throws away the one thing being asked. On a polygon, whose
    // sides are short, both picks would land on the shared corner and name the same edge, and the
    // command would give up on a corner that is perfectly good.
    const picksAnEdge = activeTool === 'fillet' || activeTool === 'chamfer'

    if (osnapEnabled && !picksAnEdge && options?.osnap !== false) {
      // A shape being reshaped is left out of the candidates, or a dragged corner would keep
      // catching on the very object it belongs to instead of on what it is being lined up with.
      const aperture = preferences.apertureSize / camera.zoom
      /*
       * Only what the aperture could reach is a candidate. Object snap used to consider every object
       * in the drawing on every pointer move — on a consultant's sheet that is tens of thousands of
       * objects per mouse event, and the canvas stops answering. The bounds index narrows it to the
       * handful actually under the cursor.
       */
      const candidates = entitiesNearPoint(visibleEntities, drawnBounds, raw, aperture, options?.ignoreId)
      const snap = findBestSnap(raw, candidates, snapModes, aperture, basePoint)
      if (snap) {
        return { point: snap.point, snap: snap.mode, tracking: null }
      }
    }
    /*
     * Grid snap sits below object snap and above ortho and polar. A vertex is a better answer than a
     * grid crossing, which is why it defers to object snap; but ortho and polar have the last word on
     * direction, so they are applied to the snapped cursor rather than the raw one.
     */
    const landed = snapEnabled ? snapToSpacing(raw, snapSpacing) : raw

    // A drag tracks from where it began, so ortho and polar apply to it even with no draft running.
    const tracks = options?.from ? true : trackingAppliesTo(activeTool)
    if (!basePoint || !tracks) {
      return { point: landed, snap: null, tracking: null }
    }
    // Shift forces ortho on temporarily; the status bar toggle latches it on.
    if (orthoHeld || orthoEnabled) {
      return { point: applyOrtho(basePoint, landed), snap: null, tracking: 'ortho' }
    }
    if (polarEnabled) {
      const tracked = applyPolarTracking(basePoint, landed, preferences.polarAngle)
      if (tracked.snapped) {
        const angle = (Math.atan2(tracked.point.y - basePoint.y, tracked.point.x - basePoint.x) * 180) / Math.PI
        return { point: tracked.point, snap: null, tracking: `polar ${((angle + 360) % 360).toFixed(0)}°` }
      }
    }
    return { point: landed, snap: null, tracking: null }
  }

  const localPoint = (event: { clientX: number; clientY: number }): Vec2 => {
    const box = svgRef.current!.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  const handleMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (event.button === 1) {
      event.preventDefault()
      setPanning(true)
      setLastMouse({ x: event.clientX, y: event.clientY })
      return
    }
    if (event.button !== 0) return
    if (activeLayout && activeTool === 'select') {
      const paper = screenToWorld(localPoint(event), camera)
      const hit = viewportAt(paper)
      if (!hit) {
        selectViewport(null)
        // Pressing the desk lets go of the viewport being worked in, which is how you get back out
        // of a view without hunting for the right double-click.
        enterViewport(null)
        return
      }
      selectViewport(hit.id)
      /*
       * Inside the viewport being worked in, a drag slides the drawing under a frame that stays put;
       * anywhere else on a sheet, a drag moves the frame itself across the paper.
       */
      if (hit.id === enteredViewportId && !hit.locked) {
        setViewportPan({ id: hit.id, last: paper })
        return
      }
      if (!hit.locked) {
        setViewportDrag({
          id: hit.id,
          grab: { x: paper.x - hit.center.x, y: paper.y - hit.center.y },
        })
      }
      return
    }
    const local = localPoint(event)
    // A window whose first corner is already down is waiting for its second click, and nothing
    // else may take that click: not a grip, not an object under it. Mouse up closes the window.
    if (boxLatched && (pickingPlotWindow || activeTool === 'select' || pickingEdges)) {
      setBoxEnd(local)
      return
    }
    // Plot window picking uses the same two-corner gesture as a selection window, but never
    // takes hold of a grip or moves the selection.
    if (pickingPlotWindow) {
      setBoxStart(local)
      setBoxEnd(local)
      return
    }
    if (activeTool === 'select' && !pickingEdges) {
      // Pressing on a grip or on something already picked reshapes or drags it; anywhere else
      // still starts a selection window, so the two never get in each other's way.
      const world = screenToWorld(local, camera)
      const held = findGripAt(world, selectedEntities, preferences.gripSize / camera.zoom)
      if (held) {
        setGripDrag({ entityId: held.entity.id, grip: held.grip, to: held.grip.point })
        return
      }
      const onSelection = selectedEntities.some((entity) =>
        isPointNearEntity(world, entity, pickTolerance),
      )
      if (onSelection) {
        setObjectDrag({ from: world, to: world })
        return
      }
    }
    if (activeTool === 'select' || pickingEdges) {
      setBoxStart(local)
      setBoxEnd(local)
      return
    }
    // A press during TRIM or EXTEND may still turn into a fence, so commit nothing until mouse up.
    if (editingEdges) {
      setFenceStart(local)
      setFenceEnd(local)
      return
    }
    /*
     * A value typed for this step wins over the press position: typing a length and then tapping
     * the direction is how a phone places an exact segment, since there is no cursor to hover and
     * no second click to measure from. With nothing typed this is the press point as before.
     */
    applyDrawTool(hasTypedValue(dynamicFields) ? commandPoint ?? resolvePoint(local).point : resolvePoint(local).point)
  }

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) =>
    trackCursor(event.clientX, event.clientY)

  /**
   * A phone has no hover, so the finger is the only thing that says where the cursor is.
   * Touch has to feed the same path as the mouse or the dimension boxes never appear at
   * all on a touch screen: they are positioned from the cursor, and a tap produces no
   * mousemove of its own. A touch drag does produce compatibility mouse events, but only
   * while it stays inside the browser's tap slop.
   */
  const trackTouch = (event: ReactTouchEvent<SVGSVGElement>) => {
    // Two fingers are a pinch, not a cursor: following the first one would drag the crosshair
    // and the dimension boxes along behind a view that is already moving.
    if (event.touches.length > 1) return
    const touch = event.touches[0] ?? event.changedTouches[0]
    if (touch) trackCursor(touch.clientX, touch.clientY)
  }

  /*
   * Two fingers move the view: the spread between them scales the zoom, and their midpoint
   * carries the drawing along with it, so one gesture both zooms and pans — the gesture every
   * map and drawing app has already taught the hand. On a phone it is the only way to do
   * either, because panning is bound to the middle mouse button and zooming to the wheel, and
   * a touch screen has neither.
   *
   * These are native listeners rather than React's onTouchStart on purpose: the browser's own
   * pinch-zoom has to be cancelled for the gesture to reach us at all, and React registers
   * touch listeners as passive, so a preventDefault() inside its handler is ignored.
   */
  useEffect(() => {
    const element = svgRef.current
    if (!element) return

    const middle = (touches: TouchList) => ({
      clientX: (touches[0].clientX + touches[1].clientX) / 2,
      clientY: (touches[0].clientY + touches[1].clientY) / 2,
    })
    const separation = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    const toLocal = (point: { clientX: number; clientY: number }): Vec2 => {
      const box = element.getBoundingClientRect()
      return { x: point.clientX - box.left, y: point.clientY - box.top }
    }

    const begin = (touches: TouchList) => {
      const { camera: current } = useCadStore.getState()
      pinch.current = {
        spread: Math.max(1, separation(touches)),
        zoom: current.zoom,
        anchor: screenToWorld(toLocal(middle(touches)), current),
      }
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return
      // Without this the browser zooms the whole page rather than the drawing.
      if (event.cancelable) event.preventDefault()
      begin(event.touches)
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length < 2) return
      if (event.cancelable) event.preventDefault()
      if (!pinch.current) {
        begin(event.touches)
        return
      }
      const gesture = pinch.current
      const zoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, gesture.zoom * (separation(event.touches) / gesture.spread)),
      )
      const centre = toLocal(middle(event.touches))
      // Holding the anchored drawing point under the fingers does both jobs at once: the
      // drawing scales about the pinch centre and follows it as the centre travels.
      setCamera({
        zoom,
        x: centre.x - gesture.anchor.x * zoom,
        y: centre.y - gesture.anchor.y * zoom,
      })
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch.current = null
    }

    element.addEventListener('touchstart', onTouchStart, { passive: false })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd)
    element.addEventListener('touchcancel', onTouchEnd)
    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
      element.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [setCamera])

  const trackCursor = (clientX: number, clientY: number) => {
    const local = localPoint({ clientX, clientY })
    setCursorScreen(local)
    if (boxStart) setBoxEnd(local)
    if (fenceStart) setFenceEnd(local)

    if (gripDrag) {
      const { point, snap, tracking } = resolvePoint(local, {
        ignoreId: gripDrag.entityId,
        from: gripDrag.grip.point,
      })
      setGripDrag({ ...gripDrag, to: point })
      setCursorWorld(point)
      setActiveSnap(snap)
      setTrackingLabel(tracking)
      return
    }
    if (objectDrag) {
      // Dragging a whole object has no base point to measure a snap from, so only ortho and polar
      // apply; otherwise the shape would jump as the cursor passed over unrelated geometry.
      const { point, snap, tracking } = resolvePoint(local, { from: objectDrag.from, osnap: false })
      setObjectDrag({ ...objectDrag, to: point })
      setCursorWorld(point)
      setActiveSnap(snap)
      setTrackingLabel(tracking)
      return
    }
    if (viewportPan && activeLayout) {
      const paper = screenToWorld(local, camera)
      panViewport(activeLayout.id, viewportPan.id, {
        x: paper.x - viewportPan.last.x,
        y: paper.y - viewportPan.last.y,
      })
      setViewportPan({ id: viewportPan.id, last: paper })
      return
    }

    if (viewportDrag && activeLayout) {
      // The grab point stays under the cursor, so the frame moves with the hand rather than jumping
      // its centre to wherever the press happened to land.
      const paper = screenToWorld(local, camera)
      const target = activeLayout.viewports.find((viewport) => viewport.id === viewportDrag.id)
      if (target) {
        updateViewport(activeLayout.id, target.id, {
          center: { x: paper.x - viewportDrag.grab.x, y: paper.y - viewportDrag.grab.y },
        })
      }
      return
    }
    if (panning && lastMouse) {
      setCamera({ x: camera.x + (clientX - lastMouse.x), y: camera.y + (clientY - lastMouse.y) })
      setLastMouse({ x: clientX, y: clientY })
      return
    }
    const { point, snap, tracking } = resolvePoint(local)
    setCursorWorld(point)
    setActiveSnap(snap)
    setTrackingLabel(tracking)

    // Rollover highlight: show which object a click would pick before committing to it.
    if (activeTool === 'select' || pickingEdges) {
      const hit = [...pickableEntities].reverse().find((entity) => isPointNearEntity(point, entity, pickTolerance))
      setHoverId(hit?.id ?? null)
    } else if (hoverId) {
      setHoverId(null)
    }

    // A grip swells under the cursor so it is clear the press will take hold of it.
    const overGrip =
      activeTool === 'select' && !pickingEdges
        ? findGripAt(screenToWorld(local, camera), selectedEntities, preferences.gripSize / camera.zoom)
        : null
    setHoverGrip(overGrip ? { entityId: overGrip.entity.id, grip: overGrip.grip } : null)
  }

  /*
   * Switching to a sheet frames it. Without this the camera is wherever model space left it, so a
   * 297 mm sheet can open half off-screen. Keyed on the space alone on purpose: re-running whenever
   * the document changed would yank the view back every time a viewport was nudged.
   */
  useEffect(() => {
    const layout = activeLayoutId
      ? useCadStore.getState().doc.layouts.find((candidate) => candidate.id === activeLayoutId)
      : null
    const box = svgRef.current?.getBoundingClientRect()
    if (!layout || !box || box.width < 10 || box.height < 10) return
    const page = pageSizeMm(layout.paper, layout.orientation)
    // A little air around the sheet, so its edge is visibly an edge rather than the window frame.
    const zoom = Math.min(box.width / (page.width * 1.15), box.height / (page.height * 1.15))
    setCamera({ zoom, x: (box.width - page.width * zoom) / 2, y: (box.height - page.height * zoom) / 2 })
  }, [activeLayoutId, setCamera])

  /*
   * ZOOM Extents, and what OPEN does to a freshly loaded drawing. The bounds come from the objects
   * the space actually shows, so a frozen layer cannot drag the view off to nowhere, and the fit
   * leaves a margin so the drawing is not flush against the window frame.
   */
  useEffect(() => {
    if (zoomExtentsToken === 0) return
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width < 10 || box.height < 10) return
    const state = useCadStore.getState()
    const entities = visibleEntities
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const entity of entities) {
      const bounds = entityBounds(entity, state.doc.blocks, state.doc.textStyles)
      if (!bounds) continue
      minX = Math.min(minX, bounds.min.x)
      minY = Math.min(minY, bounds.min.y)
      maxX = Math.max(maxX, bounds.max.x)
      maxY = Math.max(maxY, bounds.max.y)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return
    // A single point, a zero-length line or a horizontal run have no extent in one direction: give
    // the fit something to work with rather than dividing by zero.
    const spanX = Math.max(maxX - minX, 1e-6)
    const spanY = Math.max(maxY - minY, 1e-6)
    const margin = 1.1
    const zoom = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, Math.min(box.width / (spanX * margin), box.height / (spanY * margin))),
    )
    setCamera({
      zoom,
      x: box.width / 2 - ((minX + maxX) / 2) * zoom,
      y: box.height / 2 - ((minY + maxY) / 2) * zoom,
    })
    setStatusMessage(`Zoom extents — ${entities.length} object(s) in view`)
  }, [zoomExtentsToken, visibleEntities, setCamera, setStatusMessage])

  // The store needs the crosshair position so a typed distance knows which way to go.
  useEffect(() => {
    publishCursorWorld(cursorWorld)
  }, [cursorWorld, publishCursorWorld])

  // Starting a command puts an open selection window away, rather than leaving it hanging over the
  // drawing waiting for a second corner that will never come.
  useEffect(() => {
    if (activeTool === 'select' || pickingEdges) return
    setBoxLatched(false)
    setBoxStart(null)
    setBoxEnd(null)
  }, [activeTool, pickingEdges])

  const handleMouseUp = (event: MouseEvent<SVGSVGElement>) => {
    setPanning(false)
    setLastMouse(null)
    setViewportDrag(null)
    setViewportPan(null)

    if (gripDrag) {
      const travelled = Math.hypot(gripDrag.to.x - gripDrag.grip.point.x, gripDrag.to.y - gripDrag.grip.point.y)
      // A press that never moved was someone clicking on a grip, which should not disturb the shape.
      if (travelled > 0) stretchGrip(gripDrag.entityId, gripDrag.grip, gripDrag.to)
      setGripDrag(null)
      return
    }

    if (objectDrag) {
      const delta = { x: objectDrag.to.x - objectDrag.from.x, y: objectDrag.to.y - objectDrag.from.y }
      if (Math.hypot(delta.x, delta.y) * camera.zoom >= DRAG_THRESHOLD) {
        moveSelectionBy(delta)
      } else {
        // A press that went nowhere was a plain click, so it picks in the usual way rather than
        // quietly doing nothing just because it landed on something already chosen.
        const modifier = selectionModifier(event)
        const hit = [...pickableEntities]
          .reverse()
          .find((entity) => isPointNearEntity(objectDrag.from, entity, pickTolerance))
        applySelection(hit ? [hit.id] : [], hit ? modifier : 'replace')
        setStatusMessage(hit ? `Selected ${hit.type}` : 'Nothing selected')
      }
      setObjectDrag(null)
      return
    }

    if (fenceStart && fenceEnd) {
      const dragged = Math.hypot(fenceEnd.x - fenceStart.x, fenceEnd.y - fenceStart.y)
      if (dragged < FENCE_THRESHOLD) {
        applyDrawTool(resolvePoint(fenceStart).point, { swapped: event.shiftKey })
      } else {
        applyFence(screenToWorld(fenceStart, camera), screenToWorld(fenceEnd, camera), event.shiftKey)
      }
      setFenceStart(null)
      setFenceEnd(null)
      return
    }

    if (pickingPlotWindow && boxStart && boxEnd) {
      const dragged = Math.hypot(boxEnd.x - boxStart.x, boxEnd.y - boxStart.y)
      const closePlotWindow = () => {
        const start = screenToWorld(boxStart, camera)
        const end = screenToWorld(boxEnd, camera)
        finishPlotWindow(normalizeBounds(start, end))
        setBoxLatched(false)
        setBoxStart(null)
        setBoxEnd(null)
        setStatusMessage('Plot window set')
      }
      if (boxLatched) {
        closePlotWindow()
      } else if (dragged >= DRAG_THRESHOLD) {
        closePlotWindow()
      } else {
        setBoxLatched(true)
        setStatusMessage('Specify opposite corner of plot window:')
      }
      return
    }

    if ((activeTool === 'select' || pickingEdges) && boxStart && boxEnd) {
      const modifier = selectionModifier(event)
      const dragged = Math.hypot(boxEnd.x - boxStart.x, boxEnd.y - boxStart.y)
      const closeWindow = () => {
        const start = screenToWorld(boxStart, camera)
        const end = screenToWorld(boxEnd, camera)
        const mode = selectionModeFor(start, end)
        const ids = selectEntitiesInRect(pickableEntities, rectFromPoints(start, end), mode, doc.blocks, doc.textStyles)
        applySelection(ids, modifier)
        setStatusMessage(`${mode === 'window' ? 'Window' : 'Crossing'} selected ${ids.length} object(s)`)
      }

      if (boxLatched) {
        // The second click of a click-then-click window, which closes it however small it is.
        closeWindow()
        setBoxLatched(false)
      } else if (dragged >= DRAG_THRESHOLD && preferences.windowSelection !== 'click') {
        closeWindow()
      } else {
        const { point } = resolvePoint(boxStart)
        const hit = [...pickableEntities].reverse().find((entity) => isPointNearEntity(point, entity, pickTolerance))
        if (hit) {
          applySelection([hit.id], modifier)
          setStatusMessage(`Selected ${hit.type}`)
        } else if (clickWindows) {
          // A click on bare paper opens a window rather than clearing the selection, which is what
          // AutoCAD does. Escape is then the way to clear, and it also calls the window off.
          setBoxLatched(true)
          setStatusMessage('Specify opposite corner:')
          return
        } else {
          applySelection([], 'replace')
          setStatusMessage('Nothing selected')
        }
      }
    }

    setBoxStart(null)
    setBoxEnd(null)
  }

  const handleMouseLeave = () => {
    setPanning(false)
    setLastMouse(null)
    setViewportDrag(null)
    setViewportPan(null)
    setBoxStart(null)
    setBoxEnd(null)
    setBoxLatched(false)
    setFenceStart(null)
    setFenceEnd(null)
    setGripDrag(null)
    setObjectDrag(null)
    setHoverGrip(null)
    setHoverId(null)
    /*
     * The cursor survives a leave while a command is running. A finger lifting off the glass
     * synthesises a mouseleave even though it never left the canvas, and the dimension boxes
     * hang off the cursor — so clearing it here is what made them unreachable on a phone:
     * they appeared with the tap and vanished the moment it ended. With a mouse this only
     * means the crosshair waits where it was instead of disappearing, which is no worse.
     */
    if (activeTool !== 'select' || draftPoints.length > 0) return
    setCursorScreen(null)
    setCursorWorld(null)
    setActiveSnap(null)
  }

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    const local = localPoint(event)
    /*
     * Inside the viewport being worked in, the wheel resizes the view rather than the sheet: the
     * frame stays where it is and the drawing grows or shrinks within it, which is the whole point
     * of entering it. A locked viewport holds its view, so the wheel is swallowed rather than
     * falling through to the page.
     */
    const entered =
      activeLayout && enteredViewportId
        ? activeLayout.viewports.find((viewport) => viewport.id === enteredViewportId)
        : undefined
    if (activeLayout && entered) {
      if (!entered.locked) {
        zoomViewport(
          activeLayout.id,
          entered.id,
          screenToWorld(local, camera),
          event.deltaY > 0 ? 0.9 : 1.1,
        )
      }
      return
    }

    const worldBefore = screenToWorld(local, camera)
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1)))
    setCamera({ zoom, x: local.x - worldBefore.x * zoom, y: local.y - worldBefore.y * zoom })
  }

  /** Which viewport a point on the sheet falls in — the frame a press or a double-click means. */
  const viewportAt = (paper: Vec2): Viewport | undefined =>
    activeLayout
      ? [...activeLayout.viewports].reverse().find((viewport) => inViewportFrame(viewport, paper))
      : undefined

  const handleDoubleClick = (event: MouseEvent<SVGSVGElement>) => {
    /*
     * A double-click on a note opens its words, which is AutoCAD's DDEDIT and the only way to change
     * text that does not involve hunting for the command first. On a sheet this has to be tried before
     * the frame handling below, or the click would enter the viewport instead.
     */
    const world = resolvePoint(localPoint(event)).point
    if (editTextAt(world)) return

    if (!activeLayout) return
    const hit = viewportAt(screenToWorld(localPoint(event), camera))
    // Double-clicking a frame enters it; double-clicking the desk leaves, as does double-clicking
    // the frame already being worked in.
    enterViewport(hit && hit.id !== enteredViewportId ? hit.id : null)
  }

  const { width, height } = size

  /*
   * Only what the view can show is handed to the DOM.
   *
   * A consultant's sheet is blocks and dimensions, and every insert expands to its members, so a
   * real drawing reaches the renderer as far more objects than the file holds. Rendering all of
   * them — as this did — is what a large file crashed the tab on. Bounds are indexed once per
   * document (not per frame, or a pan would re-measure everything) and the filter is a rectangle
   * test, so the cost of a big drawing is paid in memory rather than in DOM nodes.
   */
  const modelEntities = (entities: CadEntity[] = modelVisible) =>
    entities.map((entity) => {
      const layer = doc.layers.find((candidate) => candidate.id === entity.layerId)
      const linetypeId = entity.linetypeId ?? layer?.linetypeId
      const linetype = doc.linetypes.find((candidate) => candidate.id === linetypeId)
      const selected = selectedIds.includes(entity.id)
      const hovered = !selected && entity.id === hoverId
      return renderEntity(entity, {
        selected,
        color: readableOnCanvas(entity.color ?? layer?.color ?? palette.fallbackEntity, palette),
        dash: linetype?.pattern.length ? linetype.pattern.join(' ') : undefined,
        width: hovered ? 2.5 : lwDisplay ? lineweightPixels(layer?.lineweight) : undefined,
        dimStyle: doc.dimStyle,
        textStyles: doc.textStyles,
        palette,
        blocks: doc.blocks,
      })
    })

  const viewBounds = useMemo(() => {
    const topLeft = screenToWorld({ x: 0, y: 0 }, camera)
    const bottomRight = screenToWorld({ x: width, y: height }, camera)
    return {
      min: { x: Math.min(topLeft.x, bottomRight.x), y: Math.min(topLeft.y, bottomRight.y) },
      max: { x: Math.max(topLeft.x, bottomRight.x), y: Math.max(topLeft.y, bottomRight.y) },
    }
  }, [camera, width, height])

  const onScreen = useMemo(() => {
    // A margin of a tenth of the view keeps an object that is just off the edge ready to appear.
    const margin = Math.max(viewBounds.max.x - viewBounds.min.x, viewBounds.max.y - viewBounds.min.y) * 0.1
    return entitiesInBounds(visibleEntities, drawnBounds, viewBounds, margin)
  }, [visibleEntities, drawnBounds, viewBounds])

  /*
   * The last resort: a drawing small enough to fit on screen as a whole, but far too big to hand to
   * the DOM. Zooming out to the extents of a survey or a panel drawing puts every object in view at
   * once, and culling cannot help there — there is nothing left to cull. So the list is capped and
   * the status line says so, rather than the tab dying: a drawing that draws most of itself with a
   * notice is usable, and one that kills the page is not.
   */
  const drawn = useMemo(() => withinRenderBudget(onScreen, doc.blocks), [onScreen, doc.blocks])
  const simplified = drawn.length < onScreen.length
  useEffect(() => {
    if (!simplified) return
    setStatusMessage(
      `Large drawing: drawing ${drawn.length.toLocaleString()} of ${onScreen.length.toLocaleString()} objects in view — zoom in to draw the rest.`,
    )
  }, [simplified, drawn.length, onScreen.length, setStatusMessage])

  const grid = useMemo(() => {
    if (!preferences.showGrid) return []
    const lines: ReactElement[] = []
    let spacing = 10
    let guard = 0
    while (spacing * camera.zoom < 8 && guard < 12) {
      spacing *= 5
      guard += 1
    }
    while (spacing * camera.zoom > 90 && guard < 24) {
      spacing /= 5
      guard += 1
    }
    const topLeft = screenToWorld({ x: 0, y: 0 }, camera)
    const bottomRight = screenToWorld({ x: width, y: height }, camera)
    const startX = Math.floor(topLeft.x / spacing) * spacing
    const endX = Math.ceil(bottomRight.x / spacing) * spacing
    const startY = Math.floor(topLeft.y / spacing) * spacing
    const endY = Math.ceil(bottomRight.y / spacing) * spacing
    const major = spacing * 5

    for (let x = startX; x <= endX; x += spacing) {
      const isMajor = Math.abs(x % major) < spacing / 100
      lines.push(
        <line
          key={`gx-${x}`}
          x1={x}
          y1={startY}
          x2={x}
          y2={endY}
          stroke={isMajor ? palette.gridMajor : palette.gridMinor}
          strokeWidth={isMajor ? 1 : 0.6}
          vectorEffect="non-scaling-stroke"
        />,
      )
    }
    for (let y = startY; y <= endY; y += spacing) {
      const isMajor = Math.abs(y % major) < spacing / 100
      lines.push(
        <line
          key={`gy-${y}`}
          x1={startX}
          y1={y}
          x2={endX}
          y2={y}
          stroke={isMajor ? palette.gridMajor : palette.gridMinor}
          strokeWidth={isMajor ? 1 : 0.6}
          vectorEffect="non-scaling-stroke"
        />,
      )
    }
    return lines
  }, [camera, width, height, preferences.showGrid])

  /**
   * Shading the piece under the crosshair is what makes trimming feel safe: you can see the exact
   * length that would vanish, or the stub that would be gained, before committing to the click.
   */
  const trimExtendPreview = useMemo(() => {
    if (!editingEdges || pickingEdges || !cursorWorld) return null
    const result = previewTrimExtend(useCadStore.getState(), cursorWorld, swapped)
    if (!result) return null
    return (
      <g opacity={0.95}>
        {renderEntity(result.ghost, {
          selected: false,
          color: result.extending ? palette.confirm : palette.reject,
          dash: result.extending ? undefined : '5 4',
          width: 3,
          dimStyle: doc.dimStyle,
          textStyles: doc.textStyles,
          palette,
        })}
      </g>
    )
    // `doc` and `edgeIds` are read through getState, so they stay in the dependency list.
  }, [cursorWorld, doc, edgeIds, editingEdges, pickingEdges, swapped])

  const fenceLine = useMemo(() => {
    if (!fenceStart || !fenceEnd) return null
    if (Math.hypot(fenceEnd.x - fenceStart.x, fenceEnd.y - fenceStart.y) < FENCE_THRESHOLD) return null
    return (
      <line
        x1={fenceStart.x}
        y1={fenceStart.y}
        x2={fenceEnd.x}
        y2={fenceEnd.y}
        stroke={swapped === (activeTool === 'trim') ? palette.confirm : palette.reject}
        strokeWidth={1.5}
        strokeDasharray="7 4"
      />
    )
  }, [activeTool, fenceEnd, fenceStart, swapped])

  /**
   * A Ttr circle is the one construction that picks objects rather than places points, so nothing
   * appears on the drawing to show how far it has got. The objects already chosen are picked out in
   * green with a marker where each was clicked, and the one under the crosshair is outlined so it is
   * clear what the next click would take.
   */
  const tangentHighlight = useMemo(() => {
    if (activeTool !== 'circle' || circleMode !== 'ttr') return null

    const chosen = tangentPicks
      .map((pick) => ({ pick, entity: doc.entities.find((entity) => entity.id === pick.id) }))
      .filter((found): found is { pick: (typeof tangentPicks)[number]; entity: CadEntity } => Boolean(found.entity))
    const takenIds = new Set(chosen.map((found) => found.entity.id))

    const hovered =
      cursorWorld && chosen.length < 2
        ? [...editableEntities(doc)]
            .reverse()
            .find(
              (entity) =>
                !takenIds.has(entity.id) &&
                canBeTangent(entity) &&
                isPointNearEntity(cursorWorld, entity, pickTolerance),
            )
        : undefined

    if (chosen.length === 0 && !hovered) return null

    return (
      <g>
        {hovered && (
          <g>
            {renderEntity(hovered, {
              selected: false,
              color: palette.preview,
              dash: '6 4',
              width: 3,
              dimStyle: doc.dimStyle,
              textStyles: doc.textStyles,
              palette,
            })}
          </g>
        )}
        {chosen.map(({ pick, entity }) => (
          <g key={entity.id}>
            {renderEntity(entity, {
              selected: false,
              color: palette.confirm,
              width: 3,
              dimStyle: doc.dimStyle,
              textStyles: doc.textStyles,
              palette,
            })}
            <circle cx={pick.point.x} cy={pick.point.y} r={5 / camera.zoom} fill={palette.confirm} />
          </g>
        ))}
      </g>
    )
  }, [activeTool, camera.zoom, circleMode, cursorWorld, doc, tangentPicks])

  const modifyPreview = useMemo(() => {
    if (!cursorWorld) return null
    const ghost = { selected: false, color: palette.preview, dash: '6 4', dimStyle: doc.dimStyle,
          textStyles: doc.textStyles, palette }

    if (activeTool === 'offset' && modifyTargetId) {
      const target = doc.entities.find((entity) => entity.id === modifyTargetId)
      const result = target ? offsetEntity(target, offsetDistance, cursorWorld) : null
      return result ? renderEntity(result, ghost) : null
    }

    // Once one line is chosen it is picked out in green, and hovering the second shows the corner
    // that would result, so the radius can be judged before committing to it.
    if ((activeTool === 'fillet' || activeTool === 'chamfer') && modifyTargetId && draftPoints.length === 1) {
      const first = doc.entities.find((entity) => entity.id === modifyTargetId)
      if (!first) return null

      const eligible = activeTool === 'fillet' ? canFillet : hasStraightSegments
      const second = [...editableEntities(doc)]
        .reverse()
        .find((entity) => eligible(entity) && isPointNearEntity(cursorWorld, entity, pickTolerance))
      const picks = second
        ? ([
            { entity: first, point: draftPoints[0] },
            { entity: second, point: cursorWorld },
          ] as const)
        : null
      const result = picks
        ? activeTool === 'fillet'
          ? filletCorner(picks[0], picks[1], filletRadius)
          : chamferCorner(picks[0], picks[1], chamferDistance, chamferDistance)
        : null

      return (
        <g>
          <g>{renderEntity(first, { ...ghost, color: palette.confirm, dash: undefined })}</g>
          {result && (
            // Fresh ids every frame would remount the preview, so they are pinned by position.
            <g>{result.pieces.map((piece, index) => renderEntity({ ...piece, id: `corner-preview-${index}` }, ghost))}</g>
          )}
        </g>
      )
    }

    // MOVE, COPY, ROTATE and SCALE drag a ghost of the selection so you can see where it lands.
    if (isTransformTool(activeTool) && draftPoints.length === 1 && selectedIds.length > 0) {
      const base = draftPoints[0]
      const chosen = doc.entities.filter((entity) => selectedIds.includes(entity.id))
      const moved = transformedBy(activeTool, chosen, selectedIds, base, cursorWorld)
      return (
        <g>
          <line
            x1={base.x}
            y1={base.y}
            x2={cursorWorld.x}
            y2={cursorWorld.y}
            stroke={palette.preview}
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          {moved.map((entity) => renderEntity(entity, ghost))}
        </g>
      )
    }

    if (activeTool === 'mirror' && draftPoints.length === 1 && selectedIds.length > 0) {
      const axisStart = draftPoints[0]
      return (
        <g>
          <line
            x1={axisStart.x}
            y1={axisStart.y}
            x2={cursorWorld.x}
            y2={cursorWorld.y}
            stroke={palette.preview}
            strokeWidth={1}
            strokeDasharray="8 4"
            vectorEffect="non-scaling-stroke"
          />
          {doc.entities
            .filter((entity) => selectedIds.includes(entity.id))
            .map((entity) => renderEntity(mirrorEntity(entity, axisStart, cursorWorld), ghost))}
        </g>
      )
    }

    // ARRAY shows the whole repeat before it is committed, since the counts are easy to misjudge.
    if (activeTool === 'array' && selectedIds.length > 0) {
      const sources = doc.entities.filter((entity) => selectedIds.includes(entity.id))
      if (arrayType === 'polar') {
        const copies = polarArrayCopies(sources, cursorWorld, {
          count: arrayCount,
          fillAngle: arrayFillAngle,
          rotateItems: arrayRotateItems,
        })
        return (
          <g>
            <circle cx={cursorWorld.x} cy={cursorWorld.y} r={4 / camera.zoom} fill={palette.preview} />
            {copies.map((entity) => renderEntity(entity, ghost))}
          </g>
        )
      }
      // Before a base point is picked the grid stands on the typed spacing, so the numbers in the
      // ribbon can be judged against the drawing rather than guessed at.
      if (draftPoints.length === 0) {
        const copies = rectangularArrayCopies(sources, {
          rows: arrayRows,
          columns: arrayColumns,
          rowSpacing: arrayRowSpacing,
          columnSpacing: arrayColumnSpacing,
        })
        return <g>{copies.map((entity) => renderEntity(entity, ghost))}</g>
      }

      const base = draftPoints[0]
      const copies = rectangularArrayCopies(sources, {
        rows: arrayRows,
        columns: arrayColumns,
        rowSpacing: cursorWorld.y - base.y,
        columnSpacing: cursorWorld.x - base.x,
      })
      return (
        <g>
          <line
            x1={base.x}
            y1={base.y}
            x2={cursorWorld.x}
            y2={cursorWorld.y}
            stroke={palette.preview}
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          {copies.map((entity) => renderEntity(entity, ghost))}
        </g>
      )
    }

    return null
  }, [
    activeTool,
    arrayColumns,
    arrayColumnSpacing,
    arrayCount,
    arrayFillAngle,
    arrayRotateItems,
    arrayRows,
    arrayRowSpacing,
    arrayType,
    camera.zoom,
    chamferDistance,
    cursorWorld,
    doc,
    draftPoints,
    filletRadius,
    modifyTargetId,
    offsetDistance,
    selectedIds,
  ])

  const preview = useMemo(() => {
    const cursorWorld = commandPoint
    if (!cursorWorld || draftPoints.length === 0) return null
    const style = {
      stroke: palette.preview,
      strokeWidth: 1,
      strokeDasharray: '6 4',
      fill: 'none',
      vectorEffect: 'non-scaling-stroke' as const,
    }
    const first = draftPoints[0]
    const last = draftPoints.at(-1)!
    const radius = Math.hypot(cursorWorld.x - first.x, cursorWorld.y - first.y)

    switch (activeTool) {
      case 'line':
        return <line x1={last.x} y1={last.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
      case 'rect': {
        if (rectMode === 'dimensions') return null
        const outline =
          rectMode === 'center'
            ? rectFromCenter(first, cursorWorld, rectRotation)
            : rectFromCorners(first, cursorWorld, rectRotation)
        return <polygon points={outline.map((p) => `${p.x},${p.y}`).join(' ')} {...style} />
      }
      case 'circle': {
        // Three points need two of them down before there is a circle to show, so until then the
        // preview is just the chord being dragged out.
        const shape =
          circleMode === '2p'
            ? circleOnDiameter(first, cursorWorld)
            : circleMode === '3p'
              ? draftPoints.length >= 2
                ? circleThroughPoints(first, draftPoints[1], cursorWorld)
                : null
              : { center: first, radius: circleMode === 'diameter' ? radius / 2 : radius }
        if (!shape) {
          return <line x1={last.x} y1={last.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
        }
        return (
          <g>
            <circle cx={shape.center.x} cy={shape.center.y} r={shape.radius} {...style} />
            <line x1={first.x} y1={first.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} strokeDasharray="2 4" />
          </g>
        )
      }
      case 'ellipse':
        return (
          <ellipse
            cx={first.x}
            cy={first.y}
            rx={Math.abs(cursorWorld.x - first.x)}
            ry={Math.abs(cursorWorld.y - first.y)}
            {...style}
          />
        )
      case 'polygon': {
        const outline =
          polygonFit === 'edge'
            ? (polygonOnEdge('preview', first, cursorWorld, polygonSides) as PolylineEntity | null)?.points
            : polygonPoints(first, cornerRadius(polygonFit, radius, polygonSides), polygonSides)
        if (!outline) return null
        return <polygon points={outline.map((p) => `${p.x},${p.y}`).join(' ')} {...style} />
      }
      case 'arc': {
        if (arcMode === '3p') {
          if (draftPoints.length === 1) {
            return <line x1={first.x} y1={first.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
          }
          const shape = arcThroughPoints(first, draftPoints[1], cursorWorld)
          if (!shape) {
            return (
              <polyline
                points={[first, draftPoints[1], cursorWorld].map((p) => `${p.x},${p.y}`).join(' ')}
                {...style}
              />
            )
          }
          return <path d={arcPreviewPath(shape.center, shape.radius, shape.startAngle, shape.endAngle)} {...style} />
        }
        if (arcMode === 'sce' || arcMode === 'sca') {
          if (draftPoints.length === 1) {
            return (
              <g>
                <line x1={first.x} y1={first.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
                <circle
                  cx={cursorWorld.x}
                  cy={cursorWorld.y}
                  r={Math.hypot(cursorWorld.x - first.x, cursorWorld.y - first.y)}
                  {...style}
                  strokeDasharray="2 4"
                />
              </g>
            )
          }
          const shape = arcFromStartCenterEnd(first, draftPoints[1], cursorWorld)
          if (!shape) return null
          return (
            <g>
              <line
                x1={draftPoints[1].x}
                y1={draftPoints[1].y}
                x2={first.x}
                y2={first.y}
                {...style}
                strokeDasharray="2 4"
              />
              <path d={arcPreviewPath(shape.center, shape.radius, shape.startAngle, shape.endAngle)} {...style} />
            </g>
          )
        }
        if (draftPoints.length === 1) {
          return (
            <g>
              <circle cx={first.x} cy={first.y} r={radius} {...style} strokeDasharray="2 4" />
              <line x1={first.x} y1={first.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
            </g>
          )
        }
        const shape = arcFromCenterStartEnd(first, draftPoints[1], cursorWorld)
        if (!shape) return null
        return <path d={arcPreviewPath(shape.center, shape.radius, shape.startAngle, shape.endAngle)} {...style} />
      }
      case 'polyline':
        return <polyline points={[...draftPoints, cursorWorld].map((p) => `${p.x},${p.y}`).join(' ')} {...style} />
      case 'spline':
        return <path d={splinePath([...draftPoints, cursorWorld])} {...style} />
      case 'dimension': {
        const points = [...draftPoints, cursorWorld]
        if (dimensionType === 'angular') {
          if (points.length < 4) {
            return (
              <polyline
                points={[points[1] ?? points[0], points[0], points[2] ?? cursorWorld]
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ')}
                {...style}
              />
            )
          }
          const dimension: DimensionEntity = {
            id: 'preview',
            type: 'dimension',
            layerId: '',
            dimType: 'angular',
            p1: points[0],
            p2: points[1],
            p3: points[2],
            placement: cursorWorld,
            scale: dimScale,
          }
          return renderDimension(dimension, doc.dimStyle, palette.preview, 'preview', true)
        }
        if (draftPoints.length < 2) {
          return <line x1={first.x} y1={first.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
        }
        const dimension: DimensionEntity = {
          id: 'preview',
          type: 'dimension',
          layerId: '',
          dimType: dimensionType,
          p1: draftPoints[0],
          p2: draftPoints[1],
          placement: cursorWorld,
          scale: dimScale,
        }
        return renderDimension(dimension, doc.dimStyle, palette.preview, 'preview', true)
      }
      case 'leader': {
        // Arrow to the cursor, then a horizontal landing: the shape MLEADER settles into, ghosted.
        const arrow = draftPoints[0] ?? cursorWorld
        const landing = { x: cursorWorld.x, y: draftPoints.length > 0 ? cursorWorld.y : cursorWorld.y }
        return (
          <g>
            <polyline points={[arrow, landing, cursorWorld].map((p) => `${p.x},${p.y}`).join(' ')} {...style} />
          </g>
        )
      }
      case 'tolerance': {
        // A ghost frame sized like the real one, so its footprint is visible before the words exist.
        const h = textHeightState || 2.5
        const half = h * 2.5
        return (
          <g>
            <rect x={cursorWorld.x - half} y={cursorWorld.y - h / 2} width={half * 2} height={h} {...style} fill="none" />
          </g>
        )
      }
      default:
        return null
    }
  }, [
    activeTool,
    arcMode,
    circleMode,
    commandPoint,
    dimScale,
    dimensionType,
    doc.dimStyle,
    draftPoints,
    polygonFit,
    polygonSides,
    rectMode,
    rectRotation,
    textHeightState,
  ])

  const grips = useMemo(() => {
    if (selectedEntities.length === 0) return []
    const gripSize = preferences.gripSize / camera.zoom
    // The grip under the cursor, or the one being dragged, fills with the selection colour so it
    // is obvious which handle a press has taken hold of.
    const held = gripDrag ?? hoverGrip
    const isHot = (entityId: string, grip: Grip) =>
      held !== null && held.entityId === entityId && held.grip.kind === grip.kind && held.grip.index === grip.index
    return selectedEntities.flatMap((entity) =>
      entityGrips(entity).map((grip, index) => {
        const hot = isHot(entity.id, grip)
        return (
          <rect
            key={`${entity.id}-grip-${index}`}
            data-grip={grip.kind}
            x={grip.point.x - gripSize / 2}
            y={grip.point.y - gripSize / 2}
            width={gripSize}
            height={gripSize}
            fill={hot ? palette.selection : palette.handle}
            stroke={palette.handleEdge}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        )
      }),
    )
  }, [camera.zoom, gripDrag, hoverGrip, palette, preferences.gripSize, selectedEntities])

  /** What the drag in progress would leave behind, drawn over the unchanged original. */
  const dragPreview = useMemo(() => {
    const ghost = { selected: false, color: palette.preview, dash: '6 4', dimStyle: doc.dimStyle,
          textStyles: doc.textStyles, palette }
    if (gripDrag) {
      const target = selectedEntities.find((entity) => entity.id === gripDrag.entityId)
      if (!target) return null
      return <g>{renderEntity(dragGrip(target, gripDrag.grip, gripDrag.to), ghost)}</g>
    }
    if (objectDrag) {
      const delta = { x: objectDrag.to.x - objectDrag.from.x, y: objectDrag.to.y - objectDrag.from.y }
      if (delta.x === 0 && delta.y === 0) return null
      return (
        <g>
          {selectedEntities.map((entity) => (
            <g key={entity.id}>{renderEntity(moveEntity(entity, delta), ghost)}</g>
          ))}
        </g>
      )
    }
    return null
  }, [doc.dimStyle, gripDrag, objectDrag, palette, selectedEntities])

  const snapScreen = cursorWorld ? worldToScreen(cursorWorld, camera) : null

  const selectionBox = useMemo(() => {
    if (!boxStart || !boxEnd) return null
    // A latched window is drawn from the moment its first corner is put down, so it is obvious the
    // next click will close it rather than pick something.
    if (!boxLatched && Math.hypot(boxEnd.x - boxStart.x, boxEnd.y - boxStart.y) < DRAG_THRESHOLD) return null
    const isWindow = boxEnd.x >= boxStart.x
    return (
      <rect
        x={Math.min(boxStart.x, boxEnd.x)}
        y={Math.min(boxStart.y, boxEnd.y)}
        width={Math.abs(boxEnd.x - boxStart.x)}
        height={Math.abs(boxEnd.y - boxStart.y)}
        fill={isWindow ? palette.windowFill : palette.crossingFill}
        stroke={isWindow ? palette.windowSelect : palette.crossingSelect}
        strokeWidth={1}
        strokeDasharray={isWindow ? undefined : '6 4'}
      />
    )
  }, [boxEnd, boxLatched, boxStart, palette])

  /**
   * The drawing in model coordinates. Model space drops it straight onto the grid; a layout
   * repeats the very same nodes inside each viewport's transform, so what a sheet shows can
   * never drift from what the model actually holds.
   */
  /**
   * Inside a sheet's frame, the model is culled to what that frame can see: the frame is a window
   * onto the drawing, and its scale says how much of the drawing is behind it. Drawing the whole
   * model inside every frame is how one title-block sheet ends up rendering a city.
   */
  const modelBounds = useMemo(
    () => boundsIndex(modelVisible, doc.blocks, doc.textStyles),
    [modelVisible, doc.blocks, doc.textStyles],
  )

  const viewportModelElements = useMemo(() => {
    if (!activeLayout) return []
    const shown: CadEntity[] = []
    for (const viewport of activeLayout.viewports) {
      const halfWidth = viewport.widthMm / 2 / viewport.unitsPerMm
      const halfHeight = viewport.heightMm / 2 / viewport.unitsPerMm
      const view = {
        min: { x: viewport.modelCenter.x - halfWidth, y: viewport.modelCenter.y - halfHeight },
        max: { x: viewport.modelCenter.x + halfWidth, y: viewport.modelCenter.y + halfHeight },
      }
      const inside = entitiesInBounds(modelVisible, modelBounds, view, 0)
      shown.push(...inside)
      if (shown.length > MAX_RENDERED_ENTITIES) break
    }
    return modelEntities(withinRenderBudget(shown, doc.blocks))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayout, modelVisible, modelBounds, doc.blocks, doc, selectedIds, hoverId, palette, lwDisplay])


  /**
   * The drawing, as elements, rebuilt only when the drawing or its appearance changes.
   *
   * The pointer moves a state value on every mouse event, so this component re-renders constantly;
   * without this buffer a pan or a crosshair sweep over a large drawing would re-create every one of
   * its nodes each frame. Identical element references let React skip the subtree entirely.
   */
  const drawnElements = useMemo(
    () => modelEntities(drawn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawn, doc, selectedIds, hoverId, palette, lwDisplay, activeLayoutId],
  )

  /**
   * The active sheet. Paper space is measured in millimetres from the paper's bottom-left corner,
   * which is the same unit the camera pans over, so nothing needs converting. A viewport clips the
   * model to its frame and then applies its own scale about its own centre — inside it are the
   * very same nodes model space draws, so the sheet cannot show something the drawing does not.
   */
  const paperSheet = (layout: Layout) => {
    const page = pageSizeMm(layout.paper, layout.orientation)
    const margin = layout.marginMm
    return (
      <g>
        {/*
         * Paper is white whatever the theme is, because this is what goes on the page — but a
         * white sheet on a light canvas would be invisible, so it carries a visible edge.
         */}
        <rect x={0} y={0} width={page.width} height={page.height} fill="#ffffff" />
        <rect
          x={0}
          y={0}
          width={page.width}
          height={page.height}
          fill="none"
          stroke={palette.gridMajor}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={margin}
          y={margin}
          width={Math.max(1, page.width - margin * 2)}
          height={Math.max(1, page.height - margin * 2)}
          fill="none"
          stroke={palette.gridMajor}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />

        {layout.viewports.map((viewport) => {
          const left = viewport.center.x - viewport.widthMm / 2
          const bottom = viewport.center.y - viewport.heightMm / 2
          const clipId = `viewport-clip-${viewport.id}`
          const current = viewport.id === activeViewportId
          /*
           * The viewport being worked in draws heaviest, so it is never in doubt which frame the
           * wheel and a drag will act on — a sheet can carry any number of them.
           */
          const entered = viewport.id === enteredViewportId
          return (
            <g key={viewport.id}>
              <defs>
                <clipPath id={clipId}>
                  <rect x={left} y={bottom} width={viewport.widthMm} height={viewport.heightMm} />
                </clipPath>
              </defs>
              <g
                clipPath={`url(#${clipId})`}
                transform={`translate(${viewport.center.x}, ${viewport.center.y}) scale(${1 / viewport.unitsPerMm}) translate(${-viewport.modelCenter.x}, ${-viewport.modelCenter.y})`}
              >
                {viewportModelElements}
              </g>
              <rect
                x={left}
                y={bottom}
                width={viewport.widthMm}
                height={viewport.heightMm}
                fill="none"
                stroke={entered || current ? palette.selection : palette.gridMajor}
                strokeWidth={entered ? 3 : current ? 2 : 1}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: entered ? 'move' : 'pointer' }}
                onPointerDown={() => selectViewport(viewport.id)}
              />
            </g>
          )
        })}

        {/*
         * The sheet's own objects, drawn after the viewports so a border and a title block sit on top
         * of the frames' edges rather than under them. They are measured in paper millimetres, so
         * they land on the page exactly as they were drawn — the sheet's unit is the page.
         */}
        <g>{drawnElements}</g>
      </g>
    )
  }

  return (
    <div className="viewport-shell" ref={frameRef}>
      <svg
        ref={svgRef}
        className="viewport"
        viewBox={`0 0 ${width} ${height}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={trackTouch}
        onTouchMove={trackTouch}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(event) => {
          // Right-click stands in for Enter, matching AutoCAD with shortcut menus turned off.
          event.preventDefault()
          const store = useCadStore.getState()
          if (store.pickingEdges) {
            finishEdgeSelection()
            return
          }
          if (store.draftPoints.length > 0) finishDraft()
          if (store.activeTool !== 'select') endCommand()
          else repeatLastCommand()
        }}
      >
        {/*
         * Paper space sits on a tinted desk rather than the drawing's own background, which is the
         * cue AutoCAD uses: white paper cannot be told from a white canvas any other way.
         */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={activeLayout ? palette.gridMinor : palette.background}
        />

        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
          {activeLayout ? (
            paperSheet(activeLayout)
          ) : (
            <>
              {grid}
              <line x1={-1e5} y1={0} x2={1e5} y2={0} stroke={palette.axisX} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line x1={0} y1={-1e5} x2={0} y2={1e5} stroke={palette.axisY} strokeWidth={1} vectorEffect="non-scaling-stroke" />

              {drawnElements}

              {grips}
              {dragPreview}
              {trimExtendPreview}
              {tangentHighlight}
              {modifyPreview}
              {preview}
            </>
          )}
        </g>

        {selectionBox}
        {fenceLine}

        {cursorScreen && snapScreen && (
          <g pointerEvents="none">
            <line
              x1={snapScreen.x - crosshairReach}
              y1={snapScreen.y}
              x2={snapScreen.x + crosshairReach}
              y2={snapScreen.y}
              stroke={palette.crosshair}
              strokeWidth={1}
            />
            <line
              x1={snapScreen.x}
              y1={snapScreen.y - crosshairReach}
              x2={snapScreen.x}
              y2={snapScreen.y + crosshairReach}
              stroke={palette.crosshair}
              strokeWidth={1}
            />
            <rect
              x={snapScreen.x - preferences.pickBoxSize / 2}
              y={snapScreen.y - preferences.pickBoxSize / 2}
              width={preferences.pickBoxSize}
              height={preferences.pickBoxSize}
              fill="none"
              stroke={palette.crosshair}
              strokeWidth={1}
            />
            {activeSnap && (
              <>
                <SnapGlyph mode={activeSnap} at={snapScreen} color={palette.snap} size={preferences.snapMarkerSize} />
                <text x={snapScreen.x + 14} y={snapScreen.y - 12} fill={palette.snap} fontSize={11}>
                  {activeSnap}
                </text>
              </>
            )}
            {!activeSnap && trackingLabel && (
              <text x={snapScreen.x + 14} y={snapScreen.y - 12} fill={palette.snap} fontSize={11}>
                {trackingLabel}
              </text>
            )}
          </g>
        )}

        {/*
         * The dimension boxes sit outside that overlay on purpose. Everything above is
         * a readout and must not intercept the pointer; these are controls, so they take
         * pointer events and the whole row — box, label and number — is the target.
         */}
        {cursorScreen && snapScreen && dynamicFields.length > 0 && (
          <g className="dynamic-input">
            {dynamicFields.map((field, index) => {
              const box = boxAt(snapScreen, index, dynamicFields.length)
              const isActive = index === fieldIndex
              const typed = field.typed !== undefined && field.typed !== ''
              const middle = box.y + boxHeight / 2 + boxFont * 0.36
              return (
                <g
                  key={field.key}
                  className={isActive ? 'dynamic-field is-active' : 'dynamic-field'}
                  style={{ cursor: 'text', touchAction: 'none' }}
                  onPointerDown={tapField(index)}
                  /*
                   * iOS raises the keyboard for a focus taken in a touch handler, not always for one
                   * taken in pointerdown, so the tap is honoured again at the end of the gesture.
                   * Focusing what is already focused costs nothing.
                   */
                  onTouchEnd={(event) => {
                    event.stopPropagation()
                    focusCommandInput()
                  }}
                  onClick={() => focusCommandInput()}
                  onMouseDown={blockTap}
                  onTouchStart={blockTap}
                >
                  <rect
                    x={box.x}
                    y={box.y}
                    width={boxWidth}
                    height={boxHeight}
                    rx={narrow ? 8 : 3}
                    fill={palette.tooltipBackground}
                    stroke={isActive ? palette.typed : palette.hint}
                    strokeWidth={1}
                  />
                  <text x={box.x + boxPad} y={middle} fill={palette.hint} fontSize={boxFont}>
                    {field.label}
                  </text>
                  <text
                    x={box.x + boxWidth - boxPad}
                    y={middle}
                    textAnchor="end"
                    fill={typed ? palette.typed : palette.hint}
                    fontSize={boxFont}
                  >
                    {`${typed ? field.typed : field.tracked.toFixed(2)}${field.suffix ?? ''}`}
                  </text>
                </g>
              )
            })}
          </g>
        )}
      </svg>

      <div className="viewport-status">
        <span className="prompt">{promptText}</span>
        {cursorWorld && (
          <span className="coords">
            X {cursorWorld.x.toFixed(2)} Y {cursorWorld.y.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}
