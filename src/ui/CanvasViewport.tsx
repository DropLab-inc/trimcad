import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type WheelEvent,
} from 'react'
import { applyDrawTool, currentPrompt, previewTrimExtend, useCadStore } from '../core/store'
import { formatPrompt, matchKeyword } from '../core/prompts'
import { applyOrtho, applyPolarTracking, findBestSnap, trackingAppliesTo } from '../core/snap'
import { rectFromPoints, selectEntitiesInRect, selectionModeFor } from '../core/selection'
import {
  fieldsForTool,
  hasTypedValue,
  resolveDynamicPoint,
  type DynamicField,
} from '../core/dynamicInput'
import { isTransformTool, transformedBy } from '../core/commands'
import { editableEntities, lineweightPixels, visibleEntities as visibleOnLayers } from '../core/layers'
import { getEntityAnchorPoints, isPointNearEntity, mirrorEntity } from '../core/geometry'
import { canFillet, chamferCorner, filletCorner, hasStraightSegments, offsetEntity } from '../core/modify'
import { canBeTangent, circleOnDiameter, circleThroughPoints, cornerRadius, polygonOnEdge } from '../core/construct'
import { polarArrayCopies, rectangularArrayCopies } from '../core/array'
import type { CadEntity, DimensionEntity, PolylineEntity, SnapMode } from '../core/types'
import type { Vec2 } from '../core/math/vec2'
import { COMMAND_INPUT_ID } from './CommandLine'
import { HatchDefs } from './HatchDefs'
import { renderDimension, renderEntity, splinePath } from './renderers'
import { readableOnCanvas, useCanvasPalette } from './theme'

type Camera = { x: number; y: number; zoom: number }

type TypedState = { step: string; values: Record<string, string>; field: number }

/** Stable empty object so memo dependencies do not change on every render. */
const NO_VALUES: Record<string, string> = {}

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

/** AutoCAD draws a distinct glyph per snap type; this keeps the marker readable at a glance. */
const SnapGlyph = ({ mode, at, color }: { mode: SnapMode; at: Vec2; color: string }) => {
  const size = 7
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
  const setCamera = useCadStore((state) => state.setCamera)
  const applySelection = useCadStore((state) => state.applySelection)
  const selectAll = useCadStore((state) => state.selectAll)
  const undo = useCadStore((state) => state.undo)
  const redo = useCadStore((state) => state.redo)
  const setStatusMessage = useCadStore((state) => state.setStatusMessage)
  const snapModes = useCadStore((state) => state.snapModes)
  const osnapEnabled = useCadStore((state) => state.osnapEnabled)
  const polarEnabled = useCadStore((state) => state.polarEnabled)
  const lwDisplay = useCadStore((state) => state.lwDisplay)
  const draftPoints = useCadStore((state) => state.draftPoints)
  const polygonSides = useCadStore((state) => state.polygonSides)
  const polygonFit = useCadStore((state) => state.polygonFit)
  const circleMode = useCadStore((state) => state.circleMode)
  const tangentPicks = useCadStore((state) => state.tangentPicks)
  const arrayType = useCadStore((state) => state.arrayType)
  const arrayRows = useCadStore((state) => state.arrayRows)
  const arrayColumns = useCadStore((state) => state.arrayColumns)
  const arrayCount = useCadStore((state) => state.arrayCount)
  const arrayFillAngle = useCadStore((state) => state.arrayFillAngle)
  const arrayRotateItems = useCadStore((state) => state.arrayRotateItems)
  const dimensionType = useCadStore((state) => state.dimensionType)
  const dimScale = useCadStore((state) => state.dimScale)
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

  const frameRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [cursorScreen, setCursorScreen] = useState<Vec2 | null>(null)
  const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null)
  const [activeSnap, setActiveSnap] = useState<SnapMode | null>(null)
  const [trackingLabel, setTrackingLabel] = useState<string | null>(null)
  const [orthoHeld, setOrthoHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const [lastMouse, setLastMouse] = useState<Vec2 | null>(null)
  const [boxStart, setBoxStart] = useState<Vec2 | null>(null)
  const [boxEnd, setBoxEnd] = useState<Vec2 | null>(null)
  const [fenceStart, setFenceStart] = useState<Vec2 | null>(null)
  const [fenceEnd, setFenceEnd] = useState<Vec2 | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [typedState, setTypedState] = useState<TypedState>({ step: '', values: NO_VALUES, field: 0 })
  const [size, setSize] = useState({ width: 1000, height: 700 })

  /** TRIM and EXTEND are the same command with the roles reversed; Shift flips which one you get. */
  const editingEdges = activeTool === 'trim' || activeTool === 'extend'
  const swapped = editingEdges && orthoHeld
  const promptText = useCadStore((state) => formatPrompt(currentPrompt(state, swapped)))

  const visibleEntities = useMemo(() => visibleOnLayers(doc), [doc])

  /** What a click may actually pick: locked layers stay on screen but refuse selection. */
  const pickableEntities = useMemo(() => editableEntities(doc), [doc])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setSize({ width: Math.max(320, rect.width), height: Math.max(240, rect.height) })
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setOrthoHeld(true)
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

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
        // Escape leaves whatever command is running and drops back to the selection prompt.
        // Pressing it again from there clears the selection, as AutoCAD does.
        if (activeTool !== 'select' || draftPoints.length > 0 || pickingEdges) cancelCommand()
        else applySelection([], 'replace')
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
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
    cancelCommand,
    commandPoint,
    deleteSelection,
    draftPoints.length,
    endCommand,
    dynamicFields,
    fieldIndex,
    finishDraft,
    finishEdgeSelection,
    pickingEdges,
    redo,
    repeatLastCommand,
    selectAll,
    setCommandInput,
    stepKey,
    swapped,
    typedValues,
    undo,
  ])

  const resolvePoint = (screenPoint: Vec2): { point: Vec2; snap: SnapMode | null; tracking: string | null } => {
    const raw = screenToWorld(screenPoint, camera)
    const basePoint = draftPoints.at(-1)

    // FILLET and CHAMFER read a click as "this edge, on this side" rather than as a position, so
    // pulling it onto a nearby vertex throws away the one thing being asked. On a polygon, whose
    // sides are short, both picks would land on the shared corner and name the same edge, and the
    // command would give up on a corner that is perfectly good.
    const picksAnEdge = activeTool === 'fillet' || activeTool === 'chamfer'

    if (osnapEnabled && !picksAnEdge) {
      const snap = findBestSnap(raw, visibleEntities, snapModes, 12 / camera.zoom, basePoint)
      if (snap) {
        return { point: snap.point, snap: snap.mode, tracking: null }
      }
    }
    if (!basePoint || !trackingAppliesTo(activeTool)) {
      return { point: raw, snap: null, tracking: null }
    }
    // Shift forces ortho on temporarily; the status bar toggle latches it on.
    if (orthoHeld || orthoEnabled) {
      return { point: applyOrtho(basePoint, raw), snap: null, tracking: 'ortho' }
    }
    if (polarEnabled) {
      const tracked = applyPolarTracking(basePoint, raw, 45)
      if (tracked.snapped) {
        const angle = (Math.atan2(tracked.point.y - basePoint.y, tracked.point.x - basePoint.x) * 180) / Math.PI
        return { point: tracked.point, snap: null, tracking: `polar ${((angle + 360) % 360).toFixed(0)}°` }
      }
    }
    return { point: raw, snap: null, tracking: null }
  }

  const localPoint = (event: MouseEvent): Vec2 => {
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
    const local = localPoint(event)
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
    applyDrawTool(resolvePoint(local).point)
  }

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const local = localPoint(event)
    setCursorScreen(local)
    if (boxStart) setBoxEnd(local)
    if (fenceStart) setFenceEnd(local)
    if (panning && lastMouse) {
      setCamera({ x: camera.x + (event.clientX - lastMouse.x), y: camera.y + (event.clientY - lastMouse.y) })
      setLastMouse({ x: event.clientX, y: event.clientY })
      return
    }
    const { point, snap, tracking } = resolvePoint(local)
    setCursorWorld(point)
    setActiveSnap(snap)
    setTrackingLabel(tracking)

    // Rollover highlight: show which object a click would pick before committing to it.
    if (activeTool === 'select' || pickingEdges) {
      const hit = [...pickableEntities].reverse().find((entity) => isPointNearEntity(point, entity, 8 / camera.zoom))
      setHoverId(hit?.id ?? null)
    } else if (hoverId) {
      setHoverId(null)
    }
  }

  // The store needs the crosshair position so a typed distance knows which way to go.
  useEffect(() => {
    publishCursorWorld(cursorWorld)
  }, [cursorWorld, publishCursorWorld])

  const handleMouseUp = (event: MouseEvent<SVGSVGElement>) => {
    setPanning(false)
    setLastMouse(null)

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

    if ((activeTool === 'select' || pickingEdges) && boxStart && boxEnd) {
      const modifier = event.shiftKey ? 'add' : event.ctrlKey ? 'remove' : 'replace'
      const dragged = Math.hypot(boxEnd.x - boxStart.x, boxEnd.y - boxStart.y)

      if (dragged < 4) {
        const { point } = resolvePoint(boxStart)
        const hit = [...pickableEntities].reverse().find((entity) => isPointNearEntity(point, entity, 8 / camera.zoom))
        applySelection(hit ? [hit.id] : [], hit ? modifier : 'replace')
        setStatusMessage(hit ? `Selected ${hit.type}` : 'Nothing selected')
      } else {
        const start = screenToWorld(boxStart, camera)
        const end = screenToWorld(boxEnd, camera)
        const mode = selectionModeFor(start, end)
        const ids = selectEntitiesInRect(pickableEntities, rectFromPoints(start, end), mode)
        applySelection(ids, modifier)
        setStatusMessage(`${mode === 'window' ? 'Window' : 'Crossing'} selected ${ids.length} object(s)`)
      }
    }

    setBoxStart(null)
    setBoxEnd(null)
  }

  const handleMouseLeave = () => {
    setPanning(false)
    setLastMouse(null)
    setBoxStart(null)
    setBoxEnd(null)
    setFenceStart(null)
    setFenceEnd(null)
    setHoverId(null)
    setCursorScreen(null)
    setCursorWorld(null)
    setActiveSnap(null)
  }

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    const local = localPoint(event)
    const worldBefore = screenToWorld(local, camera)
    const zoom = Math.min(50, Math.max(0.02, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1)))
    setCamera({ zoom, x: local.x - worldBefore.x * zoom, y: local.y - worldBefore.y * zoom })
  }

  const { width, height } = size

  const grid = useMemo(() => {
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
  }, [camera, width, height])

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
                isPointNearEntity(cursorWorld, entity, 8 / camera.zoom),
            )
        : undefined

    if (chosen.length === 0 && !hovered) return null

    return (
      <g>
        {hovered && (
          <g>{renderEntity(hovered, { selected: false, color: palette.preview, dash: '6 4', width: 3, dimStyle: doc.dimStyle, palette })}</g>
        )}
        {chosen.map(({ pick, entity }) => (
          <g key={entity.id}>
            {renderEntity(entity, { selected: false, color: palette.confirm, width: 3, dimStyle: doc.dimStyle, palette })}
            <circle cx={pick.point.x} cy={pick.point.y} r={5 / camera.zoom} fill={palette.confirm} />
          </g>
        ))}
      </g>
    )
  }, [activeTool, camera.zoom, circleMode, cursorWorld, doc, tangentPicks])

  const modifyPreview = useMemo(() => {
    if (!cursorWorld) return null
    const ghost = { selected: false, color: palette.preview, dash: '6 4', dimStyle: doc.dimStyle, palette }

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
        .find((entity) => eligible(entity) && isPointNearEntity(cursorWorld, entity, 8 / camera.zoom))
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
      if (draftPoints.length !== 1) return null
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
    arrayCount,
    arrayFillAngle,
    arrayRotateItems,
    arrayRows,
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
      case 'rect':
        return (
          <rect
            x={Math.min(first.x, cursorWorld.x)}
            y={Math.min(first.y, cursorWorld.y)}
            width={Math.abs(cursorWorld.x - first.x)}
            height={Math.abs(cursorWorld.y - first.y)}
            {...style}
          />
        )
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
        if (draftPoints.length === 1) {
          return (
            <g>
              <circle cx={first.x} cy={first.y} r={radius} {...style} strokeDasharray="2 4" />
              <line x1={first.x} y1={first.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
            </g>
          )
        }
        const start = draftPoints[1]
        const arcRadius = Math.hypot(start.x - first.x, start.y - first.y)
        const startAngle = Math.atan2(start.y - first.y, start.x - first.x)
        const endAngle = Math.atan2(cursorWorld.y - first.y, cursorWorld.x - first.x)
        return <path d={arcPreviewPath(first, arcRadius, startAngle, endAngle)} {...style} />
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
      default:
        return null
    }
  }, [
    activeTool,
    circleMode,
    commandPoint,
    dimScale,
    dimensionType,
    doc.dimStyle,
    draftPoints,
    polygonFit,
    polygonSides,
  ])

  const grips = useMemo(() => {
    if (selectedIds.length === 0) return []
    const gripSize = 4 / camera.zoom
    return visibleEntities
      .filter((entity) => selectedIds.includes(entity.id))
      .flatMap((entity) =>
        getEntityAnchorPoints(entity).map((point, index) => (
          <rect
            key={`${entity.id}-grip-${index}`}
            x={point.x - gripSize / 2}
            y={point.y - gripSize / 2}
            width={gripSize}
            height={gripSize}
            fill={palette.handle}
            stroke={palette.handleEdge}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        )),
      )
  }, [camera.zoom, selectedIds, visibleEntities])

  const snapScreen = cursorWorld ? worldToScreen(cursorWorld, camera) : null

  const selectionBox = useMemo(() => {
    if (!boxStart || !boxEnd) return null
    if (Math.hypot(boxEnd.x - boxStart.x, boxEnd.y - boxStart.y) < 4) return null
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
  }, [boxEnd, boxStart])

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
        onWheel={handleWheel}
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
        <HatchDefs />
        <rect x={0} y={0} width={width} height={height} fill={palette.background} />

        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
          {grid}
          <line x1={-1e5} y1={0} x2={1e5} y2={0} stroke={palette.axisX} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={-1e5} x2={0} y2={1e5} stroke={palette.axisY} strokeWidth={1} vectorEffect="non-scaling-stroke" />

          {visibleEntities.map((entity) => {
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
              palette,
            })
          })}

          {grips}
          {trimExtendPreview}
          {tangentHighlight}
          {modifyPreview}
          {preview}
        </g>

        {selectionBox}
        {fenceLine}

        {cursorScreen && snapScreen && (
          <g pointerEvents="none">
            <line x1={0} y1={snapScreen.y} x2={width} y2={snapScreen.y} stroke={palette.crosshair} strokeWidth={1} />
            <line x1={snapScreen.x} y1={0} x2={snapScreen.x} y2={height} stroke={palette.crosshair} strokeWidth={1} />
            <rect
              x={snapScreen.x - 5}
              y={snapScreen.y - 5}
              width={10}
              height={10}
              fill="none"
              stroke={palette.crosshair}
              strokeWidth={1}
            />
            {activeSnap && (
              <>
                <SnapGlyph mode={activeSnap} at={snapScreen} color={palette.snap} />
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
            {dynamicFields.map((field, index) => {
              const top = snapScreen.y + 14 + index * 21
              const isActive = index === fieldIndex
              const typed = field.typed !== undefined && field.typed !== ''
              return (
                <g key={field.key}>
                  <rect
                    x={snapScreen.x + 14}
                    y={top}
                    width={140}
                    height={19}
                    rx={3}
                    fill={palette.tooltipBackground}
                    stroke={isActive ? palette.typed : palette.hint}
                    strokeWidth={1}
                  />
                  <text x={snapScreen.x + 21} y={top + 13} fill={palette.hint} fontSize={11}>
                    {field.label}
                  </text>
                  <text
                    x={snapScreen.x + 147}
                    y={top + 13}
                    textAnchor="end"
                    fill={typed ? palette.typed : palette.hint}
                    fontSize={11}
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
