import { create } from 'zustand'
import {
  createArc,
  createCircle,
  createClosedPoly,
  createLine,
  createPolygon,
  isTransformTool,
  moveEntities,
  rotateEntities,
  scaleEntities,
  transformedBy,
} from './commands'
import { clearAutosave, currentSessionId, decideRecovery, describeAge, loadAutosave, saveAutosave } from './autosave'
import { DocumentController, makeDefaultDocument } from './document'
import { findRegionBoundary } from './boundary'
import { DRAWING_EXTENSION } from './fileIo'
import {
  countEntitiesOnLayer,
  editableEntities,
  isLayerEditable,
  isLayerVisible,
  layerOf,
  makeLayer,
  nextLayerName,
} from './layers'
import { findHatchBoundary, getEntityAnchorPoints, isPointNearEntity, mirrorEntity, uid } from './geometry'
import {
  arcFromCenterStartEnd,
  arcFromStartCenterAngle,
  arcFromStartCenterEnd,
  arcThroughPoints,
  canBeTangent,
  circleOnDiameter,
  circleTangentToTwo,
  circleThroughPoints,
  cornerRadius,
  polygonOnEdge,
  rectFromCenter,
  rectFromCorners,
  rectFromDimensions,
} from './construct'
import {
  clampHatchAngle,
  clampHatchScale,
  HATCH_PATTERN_LABELS,
  nextHatchPattern,
} from './hatch'
import { joinSelection, overkill, type CombineOptions } from './combine'
import { explodeSelection } from './explode'
import { getPreferences } from './preferences'
import { distanceToEntity } from './flatten'
import { dragGrip, type Grip } from './grips'
import { fieldsForTool, parseCoordinate, resolveDynamicPoint } from './dynamicInput'
import {
  canFillet,
  chamferCorner,
  extendResult,
  fenceHits,
  filletCorner,
  hasStraightSegments,
  offsetEntity,
  trimResult,
} from './modify'
import { COMMANDS, resolveCommand, type CommandDef } from './commandRegistry'
import {
  formatPrompt,
  matchKeyword,
  promptFor,
  type ArrayOption,
  type Keyword,
  type Prompt,
  type PromptContext,
  type RectPending,
} from './prompts'
import { applySelectionModifier, expandSelectionToGroups, type SelectionModifier } from './selection'
import { polarArrayCopies, rectangularArrayCopies } from './array'
import { distance as distanceBetween, sub, type Vec2 } from './math/vec2'
import type {
  ArcMode,
  ArrayType,
  CadEntity,
  CircleMode,
  PolygonFit,
  DimensionType,
  DrawingDocument,
  HatchEntity,
  HatchPattern,
  Layer,
  RectMode,
  SnapMode,
  ToolMode,
} from './types'

const controller = new DocumentController(makeDefaultDocument())

type CameraState = {
  x: number
  y: number
  zoom: number
}

/**
 * The dynamic input's state: the command step the typed values belong to, the values keyed by
 * field, and which field is active. Keyed by step so a value typed for one prompt cannot leak
 * into the next, and it is a fresh object each time so nothing mutates in place.
 */
export type TypedState = {
  step: string
  values: Record<string, string>
  field: number
}

export const EMPTY_TYPED: TypedState = { step: '', values: {}, field: 0 }

const defaultSnapModes: SnapMode[] = [
  'endpoint',
  'midpoint',
  'center',
  'quadrant',
  'intersection',
  'perpendicular',
  'tangent',
  'node',
]

/** One line in the command line's scrollback. */
export type HistoryLine = {
  id: number
  kind: 'input' | 'prompt' | 'result' | 'error'
  text: string
}

/** How many scrollback lines are kept; older ones fall off the top. */
const HISTORY_LIMIT = 200

let historyCounter = 0

type CadState = {
  doc: DrawingDocument
  selectedIds: string[]
  activeTool: ToolMode
  activeLayerId: string
  commandInput: string
  statusMessage: string
  /** OFFSET asks for a distance first; true while it is still waiting for one. */
  offsetPending: boolean
  /** OFFSET's Through option: the copy passes through the picked point instead of a set distance. */
  offsetThrough: boolean
  /** OFFSET's Erase option: remove the source object once the copy is made. */
  offsetErase: boolean
  /** OFFSET's Layer option: put the copy on the current layer rather than the source's. */
  offsetToCurrentLayer: boolean
  /** Name the drawing saves under, shown in the title bar. */
  fileName: string
  /** Objects held by COPYCLIP or CUTCLIP, kept out of the document until pasted. */
  clipboard: CadEntity[]
  camera: CameraState
  draftPoints: Vec2[]
  /**
   * What the dynamic input is holding: which step of which command the typed values belong
   * to, the values themselves, and which field is active. It lives here rather than in the
   * canvas because the command line writes to it too — on a phone the keyboard is attached
   * to that input, so the canvas never sees the keystrokes.
   */
  typed: TypedState
  snapModes: SnapMode[]
  osnapEnabled: boolean
  polarEnabled: boolean
  /** AutoCAD's LWT: draw each object at its layer's plotted width instead of a hairline. */
  lwDisplay: boolean
  polygonSides: number
  /** Whether a polygon's corners or its flats sit on the circle its radius describes. */
  polygonFit: PolygonFit
  /** Which of CIRCLE's constructions is running. */
  circleMode: CircleMode
  /** CIRCLE's Ttr option is waiting for its radius, after both tangent objects are picked. */
  circlePending: boolean
  /** The two objects picked for a Ttr circle, with the point each was clicked at. */
  tangentPicks: { id: string; point: Vec2 }[]
  /** Which of ARC's constructions is running. */
  arcMode: ArcMode
  /** Start-centre-angle is waiting for the included angle. */
  arcPending: boolean
  /** Which of RECTANG's constructions is running. */
  rectMode: RectMode
  /** RECTANG is waiting for a typed length, width, or rotation. */
  rectPending: RectPending | null
  /** Length typed for a Dimensions rectangle, held until the width arrives. */
  rectLength: number
  /** Rotation applied to the next rectangle corner or dimensions, in radians. */
  rectRotation: number
  /** Whether ARRAY repeats the selection in a grid or around a centre. */
  arrayType: ArrayType
  arrayRows: number
  arrayColumns: number
  /** Centre-to-centre distance between rows and between columns, in drawing units. */
  arrayRowSpacing: number
  arrayColumnSpacing: number
  /** How many items a polar array holds, counting the original. */
  arrayCount: number
  /** How much of a turn a polar array spans, in degrees. */
  arrayFillAngle: number
  /** Whether a polar array turns each copy to follow the sweep. */
  arrayRotateItems: boolean
  /** Which of ARRAY's counts is waiting to be typed, or null while it wants a point. */
  arrayPending: ArrayOption | null
  dimensionType: DimensionType
  /** Size given to the next dimension, as a multiple of the drawing's dimension style. */
  dimScale: number
  hatchPattern: HatchPattern
  /** Spacing given to the next hatch, as a multiple of the pattern's built-in tile. */
  hatchScale: number
  /** Extra rotation given to the next hatch pattern, in degrees. */
  hatchAngle: number
  /** HATCH is waiting for a typed scale or angle. */
  hatchPending: 'scale' | 'angle' | null
  offsetDistance: number
  /** Radius FILLET rounds a corner with. Zero squares the corner off instead. */
  filletRadius: number
  /** How far back along each line CHAMFER cuts. Zero squares the corner off instead. */
  chamferDistance: number
  /** FILLET or CHAMFER is waiting for a typed radius or distance. */
  cornerPending: boolean
  mirrorKeepSource: boolean
  modifyTargetId: string | null
  /** Cutting or boundary edges for TRIM and EXTEND; null means every object counts. */
  edgeIds: string[] | null
  /** True while TRIM or EXTEND is collecting its edges instead of editing objects. */
  pickingEdges: boolean
  /** Scrollback shown above the command input. */
  history: HistoryLine[]
  /** The last command that ran, which Enter or Space at an empty prompt repeats. */
  lastCommand: string | null
  /** Where the crosshair sits in world units, so typed distances know which way to go. */
  cursorWorld: Vec2 | null
  /** Whether orthogonal tracking is latched on, independently of holding Shift. */
  orthoEnabled: boolean
  log: (kind: HistoryLine['kind'], text: string) => void
  repeatLastCommand: () => void
  setCursorWorld: (point: Vec2 | null) => void
  toggleOrtho: () => void
  beginEdgeSelection: () => void
  finishEdgeSelection: () => void
  useAllEdges: () => void
  applyFence: (from: Vec2, to: Vec2, swapped: boolean) => void
  applyKeyword: (keyword: Keyword) => void
  setOffsetDistance: (distance: number) => void
  toggleMirrorKeepSource: () => void
  setPolygonSides: (sides: number) => void
  setPolygonFit: (fit: PolygonFit) => void
  /** Switches CIRCLE between its constructions, starting the new one from scratch. */
  setCircleMode: (mode: CircleMode) => void
  /** Switches ARC between its constructions, starting the new one from scratch. */
  setArcMode: (mode: ArcMode) => void
  /** Switches RECTANG between its constructions, starting the new one from scratch. */
  setRectMode: (mode: RectMode) => void
  setArrayType: (type: ArrayType) => void
  /** Changes one of ARRAY's counts or angles, keeping it inside a sensible range. */
  setArrayOption: (option: ArrayOption, value: number) => void
  toggleArrayRotateItems: () => void
  setDimensionType: (dimType: DimensionType) => void
  /** Sets the size the next dimension will be drawn at. Existing ones keep their own. */
  setDimScale: (scale: number) => void
  setFilletRadius: (radius: number) => void
  setChamferDistance: (distance: number) => void
  /** Resizes dimensions that are already drawn, as the properties panel does. */
  resizeDimensions: (ids: string[], scale: number) => void
  setHatchPattern: (pattern: HatchPattern) => void
  setHatchScale: (scale: number) => void
  setHatchAngle: (angle: number) => void
  /** Updates pattern, scale or angle on hatches that are already drawn. */
  updateHatches: (
    ids: string[],
    patch: Partial<Pick<HatchEntity, 'pattern' | 'scale' | 'angle'>>,
  ) => void
  toggleSnapMode: (mode: SnapMode) => void
  finishDraft: () => void
  closeDraft: () => void
  cancelDraft: () => void
  /** Ends the running command normally and returns to the idle selection prompt. */
  endCommand: () => void
  /** Abandons the running command, as Escape does. */
  cancelCommand: () => void
  setTool: (tool: ToolMode) => void
  setActiveLayerId: (layerId: string) => void
  setCamera: (camera: Partial<CameraState>) => void
  setCommandInput: (input: string) => void
  setStatusMessage: (message: string) => void
  toggleOsnap: () => void
  togglePolar: () => void
  toggleLwDisplay: () => void
  setSelection: (ids: string[]) => void
  applySelection: (ids: string[], modifier: SelectionModifier) => void
  selectAll: () => void
  clearDraft: () => void
  addDraftPoint: (point: Vec2) => void
  setTypedState: (typed: TypedState) => void
  executeCommand: (line: string) => void
  addEntity: (entity: CadEntity) => void
  updateDocument: (updater: (doc: DrawingDocument) => DrawingDocument) => void
  undo: () => void
  redo: () => void
  deleteSelection: () => void
  maybeRecoverAutosave: () => void
  /** Starts an empty drawing, discarding whatever is open. */
  newDrawing: () => void
  /** Replaces the whole drawing, as opening or importing a file does. */
  loadDrawing: (doc: DrawingDocument, fileName: string) => void
  setFileName: (fileName: string) => void
  addLayer: () => void
  /** Changes one layer's settings, as the layer manager's columns do. */
  updateLayer: (id: string, patch: Partial<Layer>) => void
  /** Removes a layer and everything drawn on it. Layer 0 and the current layer stay. */
  deleteLayer: (id: string) => void
  /** Puts every selected object onto the named layer. */
  moveSelectionToLayer: (layerId: string) => boolean
  /** Makes the current layer the one the first selected object sits on. */
  setActiveLayerFromSelection: () => boolean
  /** Commits a grip drag: one object reshaped by one of its handles, as a single undo step. */
  stretchGrip: (entityId: string, grip: Grip, point: Vec2) => void
  /** Commits a drag of the whole selection, as a single undo step. */
  moveSelectionBy: (delta: Vec2) => void
  copySelection: () => void
  cutSelection: () => void
  /** Drops the clipboard at the crosshair, keeping the copied objects' relative spacing. */
  pasteClipboard: () => void
}

/**
 * Dimension sizes are a multiplier, so zero would erase the text and a negative would mirror the
 * arrowheads. Anything that is not a positive number falls back to full size, which is also what
 * an emptied input box sends while it is being retyped. The ceiling is wide enough for a site plan.
 */
const clampDimScale = (scale: number): number =>
  Number.isFinite(scale) && scale > 0 ? Math.min(1000, scale) : 1

/**
 * Options that last only as long as the command that set them. Leaving the command puts the next
 * CIRCLE back at the plain centre-and-radius prompt, and forgets a half-answered ARRAY count.
 */
const perCommandOptions = {
  circleMode: 'center' as CircleMode,
  circlePending: false,
  tangentPicks: [] as { id: string; point: Vec2 }[],
  arcMode: 'cse' as ArcMode,
  arcPending: false,
  rectMode: 'corners' as RectMode,
  rectPending: null as RectPending | null,
  rectLength: 0,
  rectRotation: 0,
  hatchPending: null as 'scale' | 'angle' | null,
  arrayPending: null as ArrayOption | null,
}

const autosaveDoc = (doc: DrawingDocument) => {
  if (!getPreferences().autosave) return
  try {
    saveAutosave(doc)
  } catch {
    // Storage errors should never crash editing.
  }
}

export const useCadStore = create<CadState>((set, get) => ({
  doc: controller.getDocument(),
  selectedIds: controller.getSelection(),
  activeTool: 'select',
  activeLayerId: controller.getDocument().layers[0].id,
  commandInput: '',
  statusMessage: 'Ready',
  offsetPending: false,
  offsetThrough: false,
  offsetErase: false,
  offsetToCurrentLayer: false,
  fileName: `Drawing1${DRAWING_EXTENSION}`,
  clipboard: [],
  camera: { x: 400, y: 300, zoom: 1 },
  draftPoints: [],
  typed: EMPTY_TYPED,
  snapModes: defaultSnapModes,
  osnapEnabled: true,
  polarEnabled: true,
  lwDisplay: false,
  polygonSides: 6,
  polygonFit: 'inscribed' as PolygonFit,
  circleMode: 'center' as CircleMode,
  circlePending: false,
  tangentPicks: [],
  arcMode: 'cse' as ArcMode,
  arcPending: false,
  rectMode: 'corners' as RectMode,
  rectPending: null,
  rectLength: 0,
  rectRotation: 0,
  arrayType: 'rect' as ArrayType,
  arrayRows: 3,
  arrayColumns: 4,
  arrayRowSpacing: 20,
  arrayColumnSpacing: 20,
  arrayCount: 6,
  arrayFillAngle: 360,
  arrayRotateItems: true,
  arrayPending: null as ArrayOption | null,
  dimensionType: 'linear',
  dimScale: 1,
  hatchPattern: 'ansi31',
  hatchScale: 1,
  hatchAngle: 0,
  hatchPending: null,
  offsetDistance: 10,
  filletRadius: 10,
  chamferDistance: 10,
  cornerPending: false,
  mirrorKeepSource: true,
  modifyTargetId: null,
  edgeIds: null,
  pickingEdges: false,
  history: [],
  lastCommand: null,
  cursorWorld: null,
  orthoEnabled: false,
  log: (kind, text) =>
    set((state) => ({
      history: [...state.history, { id: (historyCounter += 1), kind, text }].slice(-HISTORY_LIMIT),
    })),
  repeatLastCommand: () => {
    const { lastCommand, executeCommand } = get()
    if (!lastCommand) return
    executeCommand(lastCommand)
  },
  setCursorWorld: (cursorWorld) => set({ cursorWorld }),
  toggleOrtho: () => set((state) => ({ orthoEnabled: !state.orthoEnabled })),
  beginEdgeSelection: () => {
    controller.select([])
    set({
      pickingEdges: true,
      edgeIds: null,
      selectedIds: controller.getSelection(),
      statusMessage: 'Select edges, then press Enter.',
    })
  },
  finishEdgeSelection: () => {
    const chosen = get().selectedIds
    controller.select([])
    set({
      pickingEdges: false,
      edgeIds: chosen.length > 0 ? chosen : null,
      selectedIds: controller.getSelection(),
      statusMessage:
        chosen.length > 0 ? `${chosen.length} edge(s) selected.` : 'No edges picked, using every object.',
    })
  },
  useAllEdges: () => {
    controller.select([])
    set({
      pickingEdges: false,
      edgeIds: null,
      selectedIds: controller.getSelection(),
      statusMessage: 'Using every object as an edge.',
    })
  },
  applyFence: (from, to, swapped) => applyFenceEdit(get(), from, to, swapped),
  applyKeyword: (keyword) => runKeyword(get(), keyword),
  setOffsetDistance: (offsetDistance) => set({ offsetDistance: Math.abs(offsetDistance) || 1 }),
  toggleMirrorKeepSource: () => set((state) => ({ mirrorKeepSource: !state.mirrorKeepSource })),
  setPolygonSides: (polygonSides) => set({ polygonSides: Math.max(3, Math.round(polygonSides)) }),
  setPolygonFit: (polygonFit) => set({ polygonFit }),
  // Half-collected picks belong to the old construction, so they go with it.
  setCircleMode: (circleMode) => set({ circleMode, circlePending: false, tangentPicks: [], draftPoints: [] }),
  setArcMode: (arcMode) => set({ arcMode, arcPending: false, draftPoints: [] }),
  setRectMode: (rectMode) =>
    set({ rectMode, rectPending: null, rectLength: 0, rectRotation: 0, draftPoints: [] }),
  // Switching between a grid and a sweep abandons any base point picked for the other one.
  setArrayType: (arrayType) => set({ arrayType, draftPoints: [], arrayPending: null }),
  setArrayOption: (option, value) => {
    if (!Number.isFinite(value)) return
    switch (option) {
      case 'rows':
        return set({ arrayRows: Math.max(1, Math.round(value)) })
      case 'columns':
        return set({ arrayColumns: Math.max(1, Math.round(value)) })
      // A negative spacing is meaningful: it builds the grid down or to the left instead.
      case 'rowSpacing':
        return set({ arrayRowSpacing: value })
      case 'columnSpacing':
        return set({ arrayColumnSpacing: value })
      case 'count':
        return set({ arrayCount: Math.max(1, Math.round(value)) })
      // A sweep may run either way round, but more than a full turn just repeats itself.
      case 'fillAngle':
        return set({ arrayFillAngle: Math.max(-360, Math.min(360, value)) })
    }
  },
  toggleArrayRotateItems: () => set((state) => ({ arrayRotateItems: !state.arrayRotateItems })),
  setDimensionType: (dimensionType) => set({ dimensionType, draftPoints: [], activeTool: 'dimension' }),
  setDimScale: (scale) => set({ dimScale: clampDimScale(scale) }),
  // A corner may legitimately be squared off with zero, so only negatives and gaps are rejected.
  setFilletRadius: (radius) => set({ filletRadius: Number.isFinite(radius) ? Math.abs(radius) : 0 }),
  setChamferDistance: (distance) =>
    set({ chamferDistance: Number.isFinite(distance) ? Math.abs(distance) : 0 }),
  resizeDimensions: (ids, scale) => {
    const size = clampDimScale(scale)
    const wanted = new Set(ids)
    get().updateDocument((doc) => ({
      ...doc,
      entities: doc.entities.map((entity) =>
        entity.type === 'dimension' && wanted.has(entity.id) ? { ...entity, scale: size } : entity,
      ),
    }))
  },
  setHatchPattern: (hatchPattern) => set({ hatchPattern }),
  setHatchScale: (scale) => set({ hatchScale: clampHatchScale(scale) }),
  setHatchAngle: (angle) => set({ hatchAngle: clampHatchAngle(angle) }),
  updateHatches: (ids, patch) => {
    const wanted = new Set(ids)
    get().updateDocument((doc) => ({
      ...doc,
      entities: doc.entities.map((entity) => {
        if (entity.type !== 'hatch' || !wanted.has(entity.id)) return entity
        return {
          ...entity,
          ...(patch.pattern !== undefined ? { pattern: patch.pattern } : {}),
          ...(patch.scale !== undefined ? { scale: clampHatchScale(patch.scale) } : {}),
          ...(patch.angle !== undefined ? { angle: clampHatchAngle(patch.angle) } : {}),
        }
      }),
    }))
  },
  toggleSnapMode: (mode) =>
    set((state) => ({
      snapModes: state.snapModes.includes(mode)
        ? state.snapModes.filter((candidate) => candidate !== mode)
        : [...state.snapModes, mode],
    })),
  finishDraft: () => {
    const state = get()
    const { activeTool, draftPoints } = state
    if (finishArray(state)) return
    const layerId = state.activeLayerId || state.doc.layers[0].id
    // LINE has already committed each segment as it was drawn, so it only needs clearing.
    if (activeTool === 'polyline' && draftPoints.length >= 2) {
      state.addEntity({ id: uid(), type: 'polyline', layerId, points: draftPoints, closed: false })
    } else if (activeTool === 'spline' && draftPoints.length >= 2) {
      state.addEntity({ id: uid(), type: 'spline', layerId, controlPoints: draftPoints })
    }
    set({ draftPoints: [], statusMessage: 'Command completed' })
  },
  closeDraft: () => {
    const state = get()
    const { activeTool, draftPoints } = state
    if (draftPoints.length < 3) return
    const layerId = state.activeLayerId || state.doc.layers[0].id

    if (activeTool === 'line') {
      // Closing a run of lines just adds the segment back to where it started.
      state.addEntity(createLine(layerId, draftPoints.at(-1)!, draftPoints[0]))
      set({ draftPoints: [], statusMessage: 'Line closed' })
      return
    }
    if (activeTool !== 'polyline') return
    state.addEntity({ id: uid(), type: 'polyline', layerId, points: draftPoints, closed: true })
    set({ draftPoints: [], statusMessage: 'Polyline closed' })
  },
  cancelDraft: () =>
    set({ draftPoints: [], modifyTargetId: null, pickingEdges: false, statusMessage: '*Cancel*' }),
  endCommand: () =>
    set({
      activeTool: 'select',
      draftPoints: [],
      modifyTargetId: null,
      edgeIds: null,
      pickingEdges: false,
      cornerPending: false,
      ...perCommandOptions,
      statusMessage: 'Ready',
    }),
  cancelCommand: () => {
    get().log('result', '*Cancel*')
    set({
      activeTool: 'select',
      draftPoints: [],
      modifyTargetId: null,
      edgeIds: null,
      pickingEdges: false,
      cornerPending: false,
      ...perCommandOptions,
      commandInput: '',
      statusMessage: '*Cancel*',
    })
  },
  setTool: (tool) =>
    set({
      activeTool: tool,
      draftPoints: [],
      modifyTargetId: null,
      edgeIds: null,
      pickingEdges: false,
      // OFFSET opens by asking for its distance, the way AutoCAD does.
      offsetPending: tool === 'offset',
      offsetThrough: false,
      // FILLET and CHAMFER go straight to picking; the size is changed by its own option.
      cornerPending: false,
      ...perCommandOptions,
      // Edge is a one-off choice, but a polygon sized inside or around its circle stays that way.
      polygonFit: get().polygonFit === 'edge' ? 'inscribed' : get().polygonFit,
      statusMessage: `Tool: ${tool.toUpperCase()}`,
    }),
  setActiveLayerId: (activeLayerId) => set({ activeLayerId }),
  setCamera: (camera) => set((state) => ({ camera: { ...state.camera, ...camera } })),
  setCommandInput: (commandInput) => set({ commandInput }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  toggleOsnap: () => set((state) => ({ osnapEnabled: !state.osnapEnabled })),
  togglePolar: () => set((state) => ({ polarEnabled: !state.polarEnabled })),
  toggleLwDisplay: () => set((state) => ({ lwDisplay: !state.lwDisplay })),
  setSelection: (ids) => {
    controller.select(ids)
    set({ selectedIds: controller.getSelection() })
  },
  applySelection: (ids, modifier) => {
    const state = get()
    const expanded = expandSelectionToGroups(ids, state.doc)
    const next = applySelectionModifier(state.selectedIds, expanded, modifier)
    controller.select(next)
    set({ selectedIds: controller.getSelection() })
  },
  selectAll: () => {
    const selectable = editableEntities(get().doc).map((entity) => entity.id)
    controller.select(selectable)
    set({ selectedIds: controller.getSelection(), statusMessage: `Selected ${selectable.length} objects` })
  },
  clearDraft: () => set({ draftPoints: [] }),
  addDraftPoint: (point) => set((state) => ({ draftPoints: [...state.draftPoints, point] })),
  setTypedState: (typed) => set({ typed }),
  executeCommand: (line) => {
    const raw = line.trim()
    const state = get()

    // Enter on its own finishes the running command, or repeats the last one at an idle prompt.
    if (!raw) {
      if (state.draftPoints.length > 0 || state.pickingEdges) {
        if (state.pickingEdges) state.finishEdgeSelection()
        else state.finishDraft()
        return
      }
      state.repeatLastCommand()
      return
    }

    // A leading apostrophe runs a command transparently, without disturbing the one in progress.
    // AutoCAD also accepts a leading underscore for untranslated command names.
    const transparent = raw.startsWith("'")
    const cmd = raw.replace(/^['_.]+/, '').toUpperCase()
    if (!cmd) return
    state.log('input', raw.toUpperCase())

    if (transparent) {
      const inner = resolveCommand(cmd)
      if (inner && TRANSPARENT_COMMANDS.has(inner.name)) {
        runCommandDef(state, inner)
        // The interrupted command carries on, so its prompt is shown again.
        state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
        return
      }
      state.log('error', `${cmd} cannot be used transparently.`)
      return
    }

    // An option belonging to the running command wins over a command of the same name, which is
    // how `C` closes a polyline mid-command but starts CIRCLE at an empty prompt.
    const keyword = matchKeyword(cmd, currentPrompt(state).keywords)
    if (keyword) {
      runKeyword(state, keyword)
      return
    }

    // Typed coordinates feed the running command: `50,30`, `@50,30`, `@250<30`.
    const typedPoint = parseCoordinate(raw, state.draftPoints.at(-1))
    if (typedPoint) {
      applyDrawTool(typedPoint)
      state.log('result', `Point ${typedPoint.x.toFixed(2)}, ${typedPoint.y.toFixed(2)}`)
      return
    }

    // A bare number is a distance along the direction the crosshair is pointing, or the angle or
    // factor a transform is waiting for. Before that, it belongs to whichever dimension field the
    // drawing has active: that is what the dynamic input means, and it is the phone's only route
    // to a typed value, because tapping a box puts the keyboard on the command line and the canvas
    // never sees the keystrokes. Prompts that take a number of their own are left to the fallback.
    const value = Number(raw)
    if (Number.isFinite(value) && !promptTakesItsOwnNumber(state) && applyTypedFieldValue(state, value))
      return
    if (Number.isFinite(value) && applyTypedNumber(state, value)) return

    // Settings commands take their value on the same line, as `DIMSCALE 2`.
    const [head, ...rest] = cmd.split(/\s+/)
    const command = resolveCommand(head)
    if (command) {
      runCommandDef(state, command, rest.join(' '))
      return
    }

    state.log('error', `Unknown command "${cmd}".`)
    set({ statusMessage: `Unknown command: ${cmd}` })
  },
  addEntity: (entity) => {
    controller.addEntity(entity)
    const doc = controller.getDocument()
    autosaveDoc(doc)
    set({ doc, selectedIds: controller.getSelection() })
  },
  updateDocument: (updater) => {
    controller.mutate((draft) => {
      const next = updater(draft)
      Object.assign(draft, next)
    })
    const doc = controller.getDocument()
    autosaveDoc(doc)
    set({ doc, selectedIds: controller.getSelection() })
  },
  undo: () => {
    controller.undo()
    const doc = controller.getDocument()
    autosaveDoc(doc)
    set({ doc, selectedIds: controller.getSelection() })
  },
  redo: () => {
    controller.redo()
    const doc = controller.getDocument()
    autosaveDoc(doc)
    set({ doc, selectedIds: controller.getSelection() })
  },
  deleteSelection: () => {
    const ids = controller.getSelection()
    controller.deleteEntities(ids)
    const doc = controller.getDocument()
    autosaveDoc(doc)
    set({ doc, selectedIds: controller.getSelection(), statusMessage: `Deleted ${ids.length} entit${ids.length === 1 ? 'y' : 'ies'}` })
  },
  maybeRecoverAutosave: () => {
    if (!getPreferences().autosave) return
    const decision = decideRecovery(loadAutosave(), currentSessionId())
    if (decision.kind === 'none') return

    // Work from this same run is just a page reload, so it comes back quietly.
    if (decision.kind === 'offer') {
      const when = describeAge(decision.savedAt)
      if (!window.confirm(`TrimCAD closed with unsaved work from ${when}. Recover it?`)) {
        clearAutosave()
        return
      }
    }

    controller.setDocument(decision.document)
    const doc = controller.getDocument()
    set({
      doc,
      selectedIds: controller.getSelection(),
      activeLayerId: doc.layers[0].id,
      statusMessage: decision.kind === 'offer' ? 'Recovered unsaved work' : 'Ready',
    })
  },
  newDrawing: () => {
    controller.setDocument(makeDefaultDocument())
    const doc = controller.getDocument()
    autosaveDoc(doc)
    set({
      doc,
      selectedIds: controller.getSelection(),
      activeLayerId: doc.layers[0].id,
      activeTool: 'select',
      draftPoints: [],
      fileName: `Drawing1${DRAWING_EXTENSION}`,
      statusMessage: 'New drawing',
    })
    get().log('result', 'New drawing')
  },
  loadDrawing: (incoming, fileName) => {
    controller.setDocument(incoming)
    const doc = controller.getDocument()
    autosaveDoc(doc)
    set({
      doc,
      selectedIds: controller.getSelection(),
      activeLayerId: doc.layers[0].id,
      activeTool: 'select',
      draftPoints: [],
      fileName,
      statusMessage: `Opened ${fileName}`,
    })
  },
  setFileName: (fileName) => set({ fileName }),
  addLayer: () => {
    const state = get()
    const name = nextLayerName(state.doc.layers)
    state.updateDocument((doc) => ({
      ...doc,
      layers: [...doc.layers, makeLayer(uid(), name, doc.linetypes[0].id)],
    }))
    state.setStatusMessage(`Added layer ${name}`)
  },
  updateLayer: (id, patch) => {
    const state = get()
    state.updateDocument((doc) => ({
      ...doc,
      layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    }))
    // Anything now hidden or locked must not stay selected.
    const doc = get().doc
    const stillEditable = editableEntities(doc).map((entity) => entity.id)
    const kept = get().selectedIds.filter((selectedId) => stillEditable.includes(selectedId))
    controller.select(kept)
    set({ selectedIds: controller.getSelection() })
  },
  deleteLayer: (id) => {
    const state = get()
    if (state.doc.layers.length <= 1) {
      state.setStatusMessage('A drawing needs at least one layer.')
      return
    }
    if (id === state.activeLayerId) {
      state.setStatusMessage('That is the current layer. Make another one current first.')
      return
    }
    const layer = state.doc.layers.find((candidate) => candidate.id === id)
    const count = countEntitiesOnLayer(state.doc, id)
    if (count > 0 && !window.confirm(`Delete layer ${layer?.name} and the ${count} object(s) on it?`)) return

    state.updateDocument((doc) => ({
      ...doc,
      layers: doc.layers.filter((candidate) => candidate.id !== id),
      entities: doc.entities.filter((entity) => entity.layerId !== id),
    }))
    state.setStatusMessage(`Deleted layer ${layer?.name}`)
  },
  moveSelectionToLayer: (layerId) => {
    const state = get()
    const layer = state.doc.layers.find((candidate) => candidate.id === layerId)
    if (!layer) {
      state.setStatusMessage('No such layer.')
      return false
    }
    if (state.selectedIds.length === 0) {
      state.setStatusMessage('Select objects to move to a layer.')
      return false
    }
    const wanted = new Set(state.selectedIds)
    const already = state.doc.entities.filter((entity) => wanted.has(entity.id) && entity.layerId === layerId).length
    const moving = state.selectedIds.length - already
    state.updateDocument((doc) => ({
      ...doc,
      entities: doc.entities.map((entity) => (wanted.has(entity.id) ? { ...entity, layerId } : entity)),
    }))
    // Objects that landed on a locked or off layer can no longer stay selected.
    const stillEditable = editableEntities(get().doc).map((entity) => entity.id)
    const kept = get().selectedIds.filter((selectedId) => stillEditable.includes(selectedId))
    controller.select(kept)
    set({
      selectedIds: controller.getSelection(),
      statusMessage:
        moving === 0
          ? `Already on layer ${layer.name}`
          : `Moved ${describeCount(moving)} to layer ${layer.name}`,
    })
    return true
  },
  setActiveLayerFromSelection: () => {
    const state = get()
    const first = state.doc.entities.find((entity) => state.selectedIds.includes(entity.id))
    if (!first) {
      state.setStatusMessage('Select an object whose layer should become current.')
      return false
    }
    const layer = layerOf(state.doc, first)
    if (!layer) {
      state.setStatusMessage('That object has no layer.')
      return false
    }
    set({ activeLayerId: layer.id, statusMessage: `Current layer is now ${layer.name}` })
    return true
  },
  stretchGrip: (entityId, grip, point) => {
    const state = get()
    const target = state.doc.entities.find((entity) => entity.id === entityId)
    if (!target) return
    // A locked layer shows its grips but will not budge, which is what AutoCAD does.
    if (!isLayerEditable(layerOf(state.doc, target))) {
      state.setStatusMessage('That object is on a locked layer.')
      return
    }
    state.updateDocument((doc) => ({
      ...doc,
      entities: doc.entities.map((entity) => (entity.id === entityId ? dragGrip(entity, grip, point) : entity)),
    }))
    state.setStatusMessage(`Stretched ${target.type}`)
  },
  moveSelectionBy: (delta) => {
    const state = get()
    const editable = new Set(editableEntities(state.doc).map((entity) => entity.id))
    const ids = state.selectedIds.filter((id) => editable.has(id))
    if (ids.length === 0) return
    state.updateDocument((doc) => ({ ...doc, entities: moveEntities(doc.entities, ids, delta) }))
    state.setStatusMessage(`Moved ${describeCount(ids.length)}`)
  },
  copySelection: () => {
    const state = get()
    const chosen = state.doc.entities.filter((entity) => state.selectedIds.includes(entity.id))
    if (chosen.length === 0) {
      state.setStatusMessage('Select objects before copying.')
      return
    }
    set({ clipboard: structuredClone(chosen), statusMessage: `Copied ${describeCount(chosen.length)}` })
  },
  cutSelection: () => {
    const state = get()
    const chosen = state.doc.entities.filter((entity) => state.selectedIds.includes(entity.id))
    if (chosen.length === 0) {
      state.setStatusMessage('Select objects before cutting.')
      return
    }
    set({ clipboard: structuredClone(chosen) })
    state.deleteSelection()
    set({ statusMessage: `Cut ${describeCount(chosen.length)}` })
  },
  pasteClipboard: () => {
    const state = get()
    const { clipboard } = state
    if (clipboard.length === 0) {
      state.setStatusMessage('Nothing on the clipboard.')
      return
    }

    const pasted = structuredClone(clipboard).map((entity) => ({ ...entity, id: uid() }))
    state.updateDocument((doc) => ({ ...doc, entities: [...doc.entities, ...pasted] }))
    controller.select(pasted.map((entity) => entity.id))

    // AutoCAD hands the pasted objects to the crosshair rather than dropping them somewhere you
    // did not choose, so paste leaves MOVE running with its base point already set.
    set({
      selectedIds: controller.getSelection(),
      activeTool: 'move',
      draftPoints: [clipboardAnchor(pasted)],
      modifyTargetId: null,
      statusMessage: `Pasted ${describeCount(pasted.length)}. Specify insertion point:`,
    })
  },
}))

const describeCount = (count: number, noun = 'object'): string => `${count} ${noun}${count === 1 ? '' : 's'}`

/** Lower-left corner of the copied objects, used as the handle a paste is positioned by. */
const clipboardAnchor = (entities: CadEntity[]): Vec2 => {
  const points = entities.flatMap((entity) => getEntityAnchorPoints(entity))
  if (points.length === 0) return { x: 0, y: 0 }
  return {
    x: Math.min(...points.map((point) => point.x)),
    y: Math.min(...points.map((point) => point.y)),
  }
}

type CadStoreState = ReturnType<typeof useCadStore.getState>

const pickEntity = (state: CadStoreState, point: Vec2): CadEntity | undefined =>
  [...editableEntities(state.doc)]
    .reverse()
    .find((entity) => isPointNearEntity(point, entity, getPreferences().pickBoxSize / state.camera.zoom))

/* ------------------------------------------------------- trim and extend */

/**
 * The objects that act as cutting or boundary edges. AutoCAD's quick mode treats everything as an
 * edge, which is what `edgeIds === null` means here; picking edges narrows it to that set.
 */
export const edgesFor = (state: CadStoreState): CadEntity[] => {
  const editable = editableEntities(state.doc)
  if (state.edgeIds === null) return editable
  const chosen = new Set(state.edgeIds)
  return editable.filter((entity) => chosen.has(entity.id))
}

/** Whether a pick should extend rather than trim, given the tool and whether Shift is held. */
export const isExtending = (tool: ToolMode, swapped: boolean): boolean => (tool === 'extend') !== swapped

/**
 * What a single trim or extend pick would produce, without touching the document. The canvas uses
 * this to shade the piece under the crosshair before the user commits to it.
 */
export const previewTrimExtend = (
  state: CadStoreState,
  point: Vec2,
  swapped: boolean,
): { entity: CadEntity; ghost: CadEntity; extending: boolean } | null => {
  const target = pickEntity(state, point)
  if (!target) return null
  const extending = isExtending(state.activeTool, swapped)
  const edges = edgesFor(state).filter((edge) => edge.id !== target.id)

  if (extending) {
    const result = extendResult(target, edges, point)
    return result ? { entity: target, ghost: result.added, extending } : null
  }
  const result = trimResult(target, edges, point)
  return result ? { entity: target, ghost: result.removed, extending } : null
}

const runTrimExtend = (state: CadStoreState, point: Vec2, swapped: boolean) => {
  const target = pickEntity(state, point)
  if (!target) {
    state.setStatusMessage('No object found at that point.')
    return
  }
  const extending = isExtending(state.activeTool, swapped)
  const edges = edgesFor(state).filter((edge) => edge.id !== target.id)

  if (extending) {
    const result = extendResult(target, edges, point)
    if (!result) {
      state.setStatusMessage('No boundary found in that direction.')
      return
    }
    state.updateDocument((doc) => ({
      ...doc,
      entities: doc.entities.map((entity) => (entity.id === target.id ? result.entity : entity)),
    }))
    state.setStatusMessage('Extended')
    return
  }

  const result = trimResult(target, edges, point)
  if (!result) {
    state.setStatusMessage('That object does not meet an edge there.')
    return
  }
  state.updateDocument((doc) => ({
    ...doc,
    entities: doc.entities.flatMap((entity) => (entity.id === target.id ? result.remaining : [entity])),
  }))
  state.setStatusMessage(result.remaining.length === 0 ? 'Erased' : 'Trimmed')
}

/* ------------------------------------------------------ fillet and chamfer */

/**
 * FILLET and CHAMFER are the same two picks: choose one line, choose another, and the corner
 * between them is replaced by an arc or a bevel. The side of each line that was clicked is the
 * side that survives, so clicking either arm of a crossing picks which quarter gets cut.
 *
 * The command stays armed once a corner is done, so a run of them can be worked through without
 * restarting. Escape leaves, as it does everywhere else.
 */
const runCorner = (state: CadStoreState, point: Vec2) => {
  const rounding = state.activeTool === 'fillet'
  const target = pickEntity(state, point)
  if (!target) {
    state.setStatusMessage('No object found at that point.')
    return
  }
  const usable = rounding ? canFillet(target) : hasStraightSegments(target)
  if (!usable) {
    state.setStatusMessage(
      rounding
        ? 'Fillet needs a line, polyline, arc or circle.'
        : 'Chamfer needs a straight edge. Use fillet for arcs and circles.',
    )
    return
  }

  const firstPick = state.draftPoints[0]
  if (!state.modifyTargetId || !firstPick) {
    useCadStore.setState({ modifyTargetId: target.id, draftPoints: [point] })
    state.setStatusMessage('Select second object:')
    return
  }

  const first = state.doc.entities.find((entity) => entity.id === state.modifyTargetId)
  const forget = () => useCadStore.setState({ modifyTargetId: null, draftPoints: [] })

  if (!first) {
    forget()
    state.setStatusMessage('That object is no longer there.')
    return
  }

  const result = rounding
    ? filletCorner({ entity: first, point: firstPick }, { entity: target, point }, state.filletRadius)
    : chamferCorner(
        { entity: first, point: firstPick },
        { entity: target, point },
        state.chamferDistance,
        state.chamferDistance,
      )

  if (!result) {
    forget()
    state.setStatusMessage(
      first.id === target.id
        ? 'Pick two edges that meet at a corner.'
        : rounding
          ? 'Those edges cannot be filleted at this radius.'
          : 'Those edges cannot be chamfered at this distance.',
    )
    return
  }

  // The replacements take the place of the first object they stand in for, so the drawing order
  // of everything around them is left alone.
  const replaced = new Set(result.replacedIds)
  state.updateDocument((doc) => {
    let planted = false
    const entities = doc.entities.flatMap((entity) => {
      if (!replaced.has(entity.id)) return [entity]
      if (planted) return []
      planted = true
      return result.pieces
    })
    // Filleting two circles cuts neither of them, so the arc has nothing to stand in for and
    // simply joins the end of the drawing.
    if (!planted) entities.push(...result.pieces)
    return { ...doc, entities }
  })

  forget()
  const size = rounding ? state.filletRadius : state.chamferDistance
  state.setStatusMessage(
    size === 0 ? 'Corner squared off' : rounding ? `Filleted at radius ${size}` : `Chamfered at ${size}`,
  )
}

/**
 * CIRCLE, in whichever way it is being pinned down.
 *
 * Centre and radius is the plain case and finishes on the second pick. Two points take the ends of
 * a diameter, three take points on the rim, and Ttr picks two objects to sit tangent to and then
 * asks for the radius, which is the one construction that ends on a number rather than a point.
 */
const runCircle = (state: CadStoreState, point: Vec2, layerId: string): boolean => {
  const { draftPoints, circleMode } = state
  const place = (shape: { center: Vec2; radius: number } | null, refusal: string) => {
    if (!shape) {
      state.clearDraft()
      state.setStatusMessage(refusal)
      return
    }
    state.addEntity(createCircle(layerId, shape.center, shape.radius))
    state.clearDraft()
    state.endCommand()
  }

  if (circleMode === 'ttr') {
    const picked = pickEntity(state, point)
    if (!picked || !canBeTangent(picked)) {
      state.setStatusMessage('Pick a line, polyline, arc or circle to sit tangent to.')
      return true
    }
    const picks = [...state.tangentPicks, { id: picked.id, point }]
    if (picks.length < 2) {
      useCadStore.setState({ tangentPicks: picks })
      state.log('result', 'First tangent object selected.')
      state.setStatusMessage('First tangent object selected. Pick the second.')
      return true
    }
    // Both objects are in hand, so the radius is all that is left to ask for.
    useCadStore.setState({ tangentPicks: picks, circlePending: true })
    state.log('result', 'Second tangent object selected.')
    state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
    return true
  }

  if (circleMode === '2p') {
    if (draftPoints.length === 0) {
      state.addDraftPoint(point)
      return true
    }
    place(circleOnDiameter(draftPoints[0], point), 'Those two points are in the same place.')
    return true
  }

  if (circleMode === '3p') {
    if (draftPoints.length < 2) {
      state.addDraftPoint(point)
      return true
    }
    place(
      circleThroughPoints(draftPoints[0], draftPoints[1], point),
      'Those three points lie in a straight line, so no circle passes through them.',
    )
    return true
  }

  if (draftPoints.length === 0) {
    state.addDraftPoint(point)
    return true
  }
  const reach = distanceBetween(draftPoints[0], point)
  place({ center: draftPoints[0], radius: circleMode === 'diameter' ? reach / 2 : reach }, '')
  return true
}

/** Builds the Ttr circle once its radius is known. */
const finishTangentCircle = (state: CadStoreState, radius: number): boolean => {
  const [first, second] = state.tangentPicks
  const entityFor = (pick: { id: string }) => state.doc.entities.find((entity) => entity.id === pick.id)
  const a = first && entityFor(first)
  const b = second && entityFor(second)
  if (!a || !b) {
    useCadStore.setState({ circlePending: false, tangentPicks: [] })
    state.setStatusMessage('Those objects are no longer there.')
    return true
  }

  const shape = circleTangentToTwo({ entity: a, point: first.point }, { entity: b, point: second.point }, radius)
  useCadStore.setState({ circlePending: false, tangentPicks: [], draftPoints: [] })
  if (!shape) {
    state.setStatusMessage(`No circle of radius ${radius} touches both of those.`)
    return true
  }
  const layerId = state.activeLayerId || state.doc.layers[0].id
  state.addEntity(createCircle(layerId, shape.center, shape.radius))
  state.endCommand()
  return true
}

/** Places an arc from whichever construction ARC is currently using. */
const runArc = (state: CadStoreState, point: Vec2, layerId: string): boolean => {
  const { draftPoints, arcMode } = state

  const place = (shape: ReturnType<typeof arcThroughPoints>, emptyMessage: string) => {
    useCadStore.setState({ draftPoints: [], arcPending: false })
    if (!shape) {
      state.setStatusMessage(emptyMessage)
      return
    }
    state.addEntity(createArc(layerId, shape.center, shape.radius, shape.startAngle, shape.endAngle))
    state.endCommand()
  }

  if (arcMode === '3p') {
    if (draftPoints.length < 2) {
      state.addDraftPoint(point)
      return true
    }
    place(
      arcThroughPoints(draftPoints[0], draftPoints[1], point),
      'Those three points lie in a straight line, so no arc passes through them.',
    )
    return true
  }

  if (arcMode === 'sce' || arcMode === 'sca') {
    if (draftPoints.length === 0) {
      state.addDraftPoint(point)
      return true
    }
    if (draftPoints.length === 1) {
      state.addDraftPoint(point)
      if (arcMode === 'sca') {
        useCadStore.setState({ arcPending: true })
        state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      }
      return true
    }
    // A third pick finishes start-centre-angle the same way as start-centre-end: by an end ray.
    place(
      arcFromStartCenterEnd(draftPoints[0], draftPoints[1], point),
      'The start and centre are in the same place.',
    )
    return true
  }

  // Centre, start, end — the default.
  if (draftPoints.length < 2) {
    state.addDraftPoint(point)
    return true
  }
  place(
    arcFromCenterStartEnd(draftPoints[0], draftPoints[1], point),
    'The centre and start are in the same place.',
  )
  return true
}

/**
 * Trims or extends everything a dragged fence line crosses, in one undo step.
 *
 * Each crossing is treated as its own pick. Because a trim can split an object into several
 * pieces, later crossings are matched against the pieces produced by earlier ones rather than
 * against the original entity.
 */
const applyFenceEdit = (state: CadStoreState, from: Vec2, to: Vec2, swapped: boolean) => {
  const extending = isExtending(state.activeTool, swapped)
  const editable = editableEntities(state.doc)
  const hits = fenceHits(editable, from, to)
  if (hits.length === 0) {
    state.setStatusMessage('The fence did not cross anything.')
    return
  }

  const edges = edgesFor(state)
  const tolerance = getPreferences().pickBoxSize / state.camera.zoom
  const replacements = new Map<string, CadEntity[]>()
  let changed = 0

  for (const hit of hits) {
    const pieces = [...(replacements.get(hit.entity.id) ?? [hit.entity])]
    const index = pieces.findIndex((piece) => isPointNearEntity(hit.point, piece, tolerance))
    if (index === -1) continue

    const others = edges.filter((edge) => edge.id !== hit.entity.id)
    if (extending) {
      const result = extendResult(pieces[index], others, hit.point)
      if (!result) continue
      pieces[index] = result.entity
    } else {
      const result = trimResult(pieces[index], others, hit.point)
      if (!result) continue
      pieces.splice(index, 1, ...result.remaining)
    }
    replacements.set(hit.entity.id, pieces)
    changed += 1
  }

  if (changed === 0) {
    state.setStatusMessage(extending ? 'Nothing along the fence could be extended.' : 'Nothing along the fence met an edge.')
    return
  }

  state.updateDocument((doc) => ({
    ...doc,
    entities: doc.entities.flatMap((entity) => replacements.get(entity.id) ?? [entity]),
  }))
  state.setStatusMessage(`${extending ? 'Extended' : 'Trimmed'} ${changed} object(s) along the fence.`)
}

/* ---------------------------------------------------------- transforms */

/**
 * MOVE, COPY, ROTATE and SCALE all read as "pick a base point, then say where it goes". The
 * second pick is interpreted differently per command: a displacement for MOVE and COPY, an angle
 * for ROTATE and a ratio of distances for SCALE, which is exactly how AutoCAD reads them.
 */
const runTransform = (state: CadStoreState, point: Vec2) => {
  const { activeTool, selectedIds, draftPoints } = state
  if (selectedIds.length === 0) {
    state.setStatusMessage(`Select objects before running ${activeTool.toUpperCase()}.`)
    return
  }
  if (draftPoints.length === 0) {
    state.addDraftPoint(point)
    state.setStatusMessage('Specify second point:')
    return
  }

  if (!isTransformTool(activeTool)) return

  const base = draftPoints[0]
  const selected = new Set(selectedIds)

  state.updateDocument((doc) => {
    const transformed = transformedBy(activeTool, doc.entities, selectedIds, base, point)
    if (activeTool === 'copy') {
      const copies = transformed
        .filter((entity) => selected.has(entity.id))
        .map((entity) => ({ ...entity, id: uid() }))
      return { ...doc, entities: [...doc.entities, ...copies] }
    }
    return { ...doc, entities: transformed }
  })

  const finished = activeTool.toUpperCase()
  state.clearDraft()
  state.endCommand()
  state.setStatusMessage(`${finished} complete`)
}

/**
 * Applies a typed value to the second step of a transform: an angle for ROTATE, a factor for
 * SCALE and a distance along the current direction for MOVE and COPY.
 */
const applyTransformValue = (state: CadStoreState, value: number): boolean => {
  const { activeTool, selectedIds, draftPoints } = state
  if (draftPoints.length !== 1 || selectedIds.length === 0) return false

  const base = draftPoints[0]
  const selected = new Set(selectedIds)

  if (activeTool === 'rotate') {
    state.updateDocument((doc) => ({
      ...doc,
      entities: rotateEntities(doc.entities, selectedIds, base, value),
    }))
  } else if (activeTool === 'scale') {
    if (value <= 0) {
      state.setStatusMessage('The scale factor must be greater than zero.')
      return true
    }
    state.updateDocument((doc) => ({ ...doc, entities: scaleEntities(doc.entities, selectedIds, base, value) }))
  } else if (activeTool === 'move' || activeTool === 'copy') {
    // Without a cursor direction a bare number is taken along the X axis, as AutoCAD does.
    const direction = state.cursorWorld ? sub(state.cursorWorld, base) : { x: 1, y: 0 }
    const length = Math.hypot(direction.x, direction.y) || 1
    const delta = { x: (direction.x / length) * value, y: (direction.y / length) * value }
    state.updateDocument((doc) => {
      const moved = moveEntities(doc.entities, selectedIds, delta)
      if (activeTool === 'move') return { ...doc, entities: moved }
      const copies = moved.filter((entity) => selected.has(entity.id)).map((entity) => ({ ...entity, id: uid() }))
      return { ...doc, entities: [...doc.entities, ...copies] }
    })
  } else {
    return false
  }

  const finished = activeTool.toUpperCase()
  state.clearDraft()
  state.endCommand()
  state.setStatusMessage(`${finished} complete`)
  return true
}

/**
 * Prompts whose bare number answers the prompt itself rather than a dimension field: OFFSET's
 * distance, ARRAY's counts, RECTANG's length and width, HATCH's scale, and the pending steps of
 * ARC and a Ttr CIRCLE. Those keep precedence; everything else waiting for a point takes the
 * number into whichever dynamic field is active.
 */
const promptTakesItsOwnNumber = (state: CadStoreState): boolean =>
  Boolean(
    state.offsetPending ||
      state.arrayPending ||
      state.circlePending ||
      state.arcPending ||
      state.rectPending ||
      state.hatchPending,
  )

/** The command step the current draft is on: typed values belong to one step and no other. */
const typedStepKey = (state: CadStoreState) => `${state.activeTool}:${state.draftPoints.length}`

/**
 * Writes a number into the active dimension field and places the point the command was waiting
 * for — the same result as typing it over the drawing, which is what a phone user is doing when
 * they tap a box and type. Returns false when no field is waiting, so the caller can fall back to
 * reading the number as a command or a prompt answer.
 */
const applyTypedFieldValue = (state: CadStoreState, value: number): boolean => {
  // Without a cursor there is nothing to measure a field against, which is also what the canvas
  // requires before it draws the boxes at all.
  const cursor = state.cursorWorld
  if (!cursor) return false

  const fields = fieldsForTool(state.activeTool, state.draftPoints, cursor)
  if (!fields || fields.length === 0) return false

  const step = typedStepKey(state)
  const carried = state.typed.step === step ? state.typed : EMPTY_TYPED
  const index = Math.min(carried.field, fields.length - 1)
  const values = { ...carried.values, [fields[index].key]: String(value) }
  const withValues = fields.map((field) => ({ ...field, typed: values[field.key] }))
  const point = resolveDynamicPoint(state.activeTool, withValues, state.draftPoints, cursor)
  if (!point) return false

  // An angle on its own has no distance to travel: on a phone the finger is sitting on the last
  // point, so the tracked length is zero and the segment would be a speck. Record the value and
  // ask for the rest instead — the value stays in the box, and the next number submitted joins it,
  // so "set the angle, then the length" works in two steps.
  const anchor = state.draftPoints.at(-1)
  if (anchor && Math.abs(point.x - anchor.x) < 1e-9 && Math.abs(point.y - anchor.y) < 1e-9) {
    // The field advances so the next number submitted lands on the other one, as Tab does while
    // typing over the drawing. Together the two numbers describe a segment.
    state.setTypedState({ step, values, field: (index + 1) % fields.length })
    state.log('result', `${fields[index].label} ${value}${fields[index].suffix ?? ''}`)
    state.log('prompt', formatPrompt(currentPrompt(state)))
    return true
  }

  state.setTypedState(EMPTY_TYPED)
  applyDrawTool(point)
  const now = useCadStore.getState()
  now.log('result', `${fields[index].label} ${value}${fields[index].suffix ?? ''}`)
  now.log('prompt', formatPrompt(currentPrompt(now)))
  return true
}

/**
 * Interprets a bare number typed at the command line. During a transform it is the angle or
 * factor; while points are being collected it is AutoCAD's direct distance entry, meaning "this
 * far in the direction the crosshair is pointing".
 */
const applyTypedNumber = (state: CadStoreState, value: number): boolean => {
  // OFFSET asks for its distance before anything else, so a bare number answers that prompt.
  if (state.activeTool === 'offset' && state.offsetPending) {
    if (value <= 0) {
      state.log('error', 'The offset distance must be greater than zero.')
      return true
    }
    useCadStore.setState({ offsetDistance: value, offsetPending: false, offsetThrough: false, draftPoints: [] })
    state.log('result', `Offset distance ${value}`)
    state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
    return true
  }

  // ARRAY's counts are typed rather than picked, so a number lands on whichever was asked for.
  if (state.arrayPending && state.activeTool === 'array') {
    const option = state.arrayPending
    state.setArrayOption(option, value)
    useCadStore.setState({ arrayPending: null })
    const now = useCadStore.getState()
    const shown = {
      rows: `${now.arrayRows} rows`,
      columns: `${now.arrayColumns} columns`,
      rowSpacing: `Row spacing ${now.arrayRowSpacing}`,
      columnSpacing: `Column spacing ${now.arrayColumnSpacing}`,
      count: `${now.arrayCount} items`,
      fillAngle: `Fill angle ${now.arrayFillAngle}\u00b0`,
    }[option]
    state.log('result', shown)
    state.log('prompt', formatPrompt(currentPrompt(now)))
    return true
  }

  // A Ttr circle ends on its radius rather than on a point, so a typed number finishes it.
  if (state.circlePending && state.activeTool === 'circle') {
    if (value <= 0) {
      state.log('error', 'The radius must be greater than zero.')
      return true
    }
    return finishTangentCircle(state, value)
  }

  // Start-centre-angle finishes on a typed included angle once the two points are down.
  if (state.arcPending && state.activeTool === 'arc') {
    const [start, center] = state.draftPoints
    if (!start || !center) {
      useCadStore.setState({ arcPending: false })
      return true
    }
    const shape = arcFromStartCenterAngle(start, center, value)
    useCadStore.setState({ arcPending: false, draftPoints: [] })
    if (!shape) {
      state.setStatusMessage('The start and centre are in the same place, or the angle is zero.')
      return true
    }
    const layerId = state.activeLayerId || state.doc.layers[0].id
    state.addEntity(createArc(layerId, shape.center, shape.radius, shape.startAngle, shape.endAngle))
    state.endCommand()
    return true
  }

  // RECTANG's Dimensions and Rotation options take typed numbers rather than picks.
  if (state.rectPending && state.activeTool === 'rect') {
    if (state.rectPending === 'rotation') {
      useCadStore.setState({ rectRotation: (value * Math.PI) / 180, rectPending: null })
      state.log('result', `Rotation ${value}\u00b0`)
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return true
    }
    if (state.rectPending === 'length') {
      if (Math.abs(value) < 1e-9) {
        state.log('error', 'The length must not be zero.')
        return true
      }
      useCadStore.setState({ rectLength: value, rectPending: 'width' })
      state.log('result', `Length ${value}`)
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return true
    }
    if (state.rectPending === 'width') {
      if (Math.abs(value) < 1e-9) {
        state.log('error', 'The width must not be zero.')
        return true
      }
      const origin = state.draftPoints[0]
      if (!origin) {
        useCadStore.setState({ rectPending: null })
        return true
      }
      const points = rectFromDimensions(origin, state.rectLength, value, state.rectRotation)
      useCadStore.setState({ rectPending: null, draftPoints: [], rectLength: 0, rectRotation: 0 })
      if (!points) {
        state.setStatusMessage('Those dimensions do not make a rectangle.')
        return true
      }
      const layerId = state.activeLayerId || state.doc.layers[0].id
      state.addEntity(createClosedPoly(layerId, points))
      state.endCommand()
      return true
    }
  }

  if (state.hatchPending && state.activeTool === 'hatch') {
    if (state.hatchPending === 'scale') {
      if (value <= 0) {
        state.log('error', 'The hatch scale must be greater than zero.')
        return true
      }
      state.setHatchScale(value)
      useCadStore.setState({ hatchPending: null })
      state.log('result', `Hatch scale ${useCadStore.getState().hatchScale}`)
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return true
    }
    state.setHatchAngle(value)
    useCadStore.setState({ hatchPending: null })
    state.log('result', `Hatch angle ${useCadStore.getState().hatchAngle}\u00b0`)
    state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
    return true
  }

  if (state.cornerPending && (state.activeTool === 'fillet' || state.activeTool === 'chamfer')) {
    if (value < 0) {
      state.log('error', 'The size cannot be negative.')
      return true
    }
    const rounding = state.activeTool === 'fillet'
    if (rounding) state.setFilletRadius(value)
    else state.setChamferDistance(value)
    useCadStore.setState({ cornerPending: false, draftPoints: [] })
    state.log('result', rounding ? `Fillet radius ${value}` : `Chamfer distance ${value}`)
    state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
    return true
  }

  if (applyTransformValue(state, value)) return true

  const base = state.draftPoints.at(-1)
  if (!base || !state.cursorWorld) return false
  const direction = sub(state.cursorWorld, base)
  const length = Math.hypot(direction.x, direction.y)
  if (length < 1e-9) return false

  const target = { x: base.x + (direction.x / length) * value, y: base.y + (direction.y / length) * value }
  applyDrawTool(target)
  state.log('result', `Distance ${value}`)
  return true
}

/** The objects the selection points at, in the order the drawing holds them. */
const selectedEntities = (state: CadStoreState): CadEntity[] =>
  state.doc.entities.filter((entity) => state.selectedIds.includes(entity.id))

/** How JOIN and OVERKILL should read the drawing, taken from the preferences. */
const combineOptions = (): CombineOptions => {
  const preferences = getPreferences()
  return { tolerance: preferences.geometryTolerance, polylineSegments: preferences.polylineSegments }
}

/**
 * JOIN, which either produces one object or explains why the pieces do not belong together. The
 * result takes the place of the first object joined, so it keeps its position in the drawing order.
 */
const runJoin = (state: CadStoreState) => {
  const chosen = selectedEntities(state)
  if (chosen.length === 0) {
    state.log('error', 'Select objects before joining.')
    return
  }
  const outcome = joinSelection(chosen, combineOptions())
  if (!outcome.joined) {
    state.log('error', outcome.reason)
    state.setStatusMessage(outcome.reason)
    return
  }

  const consumed = new Set(outcome.consumed)
  let placed = false
  state.updateDocument((doc) => ({
    ...doc,
    entities: doc.entities.flatMap((entity) => {
      if (!consumed.has(entity.id)) return [entity]
      if (placed) return []
      placed = true
      return [outcome.entity]
    }),
  }))
  state.setSelection([outcome.entity.id])
  state.log('result', outcome.note)
  state.setStatusMessage(outcome.note)
}

/** EXPLODE, which also breaks up any groups the selection belongs to. */
const runExplode = (state: CadStoreState) => {
  if (state.selectedIds.length === 0) {
    state.log('error', 'Select objects before exploding.')
    return
  }

  const ids = new Set(state.selectedIds)
  const result = explodeSelection(state.doc.entities, state.selectedIds, state.doc.blocks)
  const groups = state.doc.groups.filter((group) => group.entityIds.some((id) => ids.has(id)))

  if (result.consumed.length === 0 && groups.length === 0) {
    const message = 'Nothing in the selection can be exploded.'
    state.log('error', message)
    state.setStatusMessage(message)
    return
  }

  state.updateDocument((doc) => ({
    ...doc,
    entities: result.entities,
    groups: doc.groups.filter((group) => !group.entityIds.some((id) => ids.has(id))),
  }))
  // The pieces are new objects, so the old selection would point at things that no longer exist.
  state.setSelection([])

  const parts = [
    result.consumed.length > 0
      ? `Exploded ${describeCount(result.consumed.length)} into ${describeCount(result.pieces, 'piece')}`
      : '',
    groups.length > 0 ? `Ungrouped ${describeCount(groups.length, 'group')}` : '',
  ].filter(Boolean)
  const message = parts.join(', ')
  state.log('result', message)
  state.setStatusMessage(message)
}

/** OVERKILL, which cleans up the selection rather than the whole drawing, as AutoCAD's does. */
const runOverkill = (state: CadStoreState) => {
  const chosen = selectedEntities(state)
  if (chosen.length === 0) {
    state.log('error', 'Select objects before running OVERKILL. Type ALL to take in the whole drawing.')
    return
  }

  const result = overkill(chosen, combineOptions())
  const removed = result.duplicates + result.merged
  if (removed === 0) {
    const message = 'Nothing to clean up: no duplicate or overlapping objects found.'
    state.log('result', message)
    state.setStatusMessage(message)
    return
  }

  const ids = new Set(state.selectedIds)
  let inserted = false
  state.updateDocument((doc) => ({
    ...doc,
    entities: doc.entities.flatMap((entity) => {
      if (!ids.has(entity.id)) return [entity]
      // What survives is dropped in where the first of the chosen objects sat, so the cleaned-up
      // geometry keeps its place in the drawing order rather than jumping to the front.
      if (inserted) return []
      inserted = true
      return result.entities
    }),
  }))
  state.setSelection(result.entities.map((entity) => entity.id))

  const parts = [
    result.duplicates > 0 ? `Deleted ${describeCount(result.duplicates, 'duplicate')}` : '',
    result.merged > 0 ? `merged ${describeCount(result.merged)} into a neighbour` : '',
  ].filter(Boolean)
  const message = parts.join(', ')
  state.log('result', message)
  state.setStatusMessage(message)
}

/** Runs a command from the registry, echoing what it is waiting for next. */
const runCommandDef = (state: CadStoreState, command: CommandDef, argument = '') => {
  useCadStore.setState({ lastCommand: command.name })

  if (command.tool) {
    state.setTool(command.tool)
    // ARRAYRECT and ARRAYPOLAR are the same command with the choice already made for you.
    if (command.name === 'ARRAYRECT') useCadStore.getState().setArrayType('rect')
    if (command.name === 'ARRAYPOLAR') useCadStore.getState().setArrayType('polar')
    state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
    return
  }

  switch (command.name) {
    case 'DIMLINEAR':
    case 'DIMALIGNED':
    case 'DIMRADIUS':
    case 'DIMDIAMETER':
    case 'DIMANGULAR': {
      const dimType = command.name.replace('DIM', '').toLowerCase()
      const mapped: Record<string, DimensionType> = {
        linear: 'linear',
        aligned: 'aligned',
        radius: 'radial',
        diameter: 'diameter',
        angular: 'angular',
      }
      state.setDimensionType(mapped[dimType] ?? 'linear')
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    }
    case 'DIMSCALE': {
      if (!argument) {
        state.log('result', `Dimension size is ${state.dimScale}. Type DIMSCALE followed by a size to change it.`)
        return
      }
      const size = Number(argument)
      if (!Number.isFinite(size) || size <= 0) {
        state.log('error', 'The dimension size must be a number greater than zero.')
        return
      }
      state.setDimScale(size)
      const applied = useCadStore.getState().dimScale
      // Changing a property with objects selected edits them, as the properties palette does.
      const chosen = state.selectedIds.filter(
        (id) => state.doc.entities.find((entity) => entity.id === id)?.type === 'dimension',
      )
      if (chosen.length > 0) {
        state.resizeDimensions(chosen, applied)
        state.log('result', `Dimension size ${applied}, applied to ${chosen.length} dimension(s)`)
        return
      }
      state.log('result', `Dimension size ${applied}`)
      return
    }
    case 'ERASE':
      state.deleteSelection()
      return
    case 'ALL':
      state.selectAll()
      return
    case 'UNDO':
      state.undo()
      state.log('result', 'Undone')
      return
    case 'REDO':
      state.redo()
      state.log('result', 'Redone')
      return
    case 'COPYCLIP':
      state.copySelection()
      state.log('result', useCadStore.getState().statusMessage)
      return
    case 'CUTCLIP':
      state.cutSelection()
      state.log('result', useCadStore.getState().statusMessage)
      return
    case 'PASTECLIP':
      state.pasteClipboard()
      state.log('result', useCadStore.getState().statusMessage)
      return
    case 'OSNAP':
      state.toggleOsnap()
      state.log('result', `Object snap ${useCadStore.getState().osnapEnabled ? 'on' : 'off'}`)
      return
    case 'ORTHO':
      state.toggleOrtho()
      state.log('result', `Ortho ${useCadStore.getState().orthoEnabled ? 'on' : 'off'}`)
      return
    case 'POLAR':
      state.togglePolar()
      state.log('result', `Polar tracking ${useCadStore.getState().polarEnabled ? 'on' : 'off'}`)
      return
    case 'LWDISPLAY':
      state.toggleLwDisplay()
      state.log('result', `Lineweight display ${useCadStore.getState().lwDisplay ? 'on' : 'off'}`)
      return
    case 'GROUP': {
      const ids = state.selectedIds
      if (ids.length === 0) {
        state.log('error', 'Select objects before grouping.')
        return
      }
      state.updateDocument((doc) => ({
        ...doc,
        groups: [...doc.groups, { id: uid(), name: `Group ${doc.groups.length + 1}`, entityIds: ids }],
      }))
      state.log('result', `Grouped ${ids.length} object(s)`)
      return
    }
    case 'UNGROUP': {
      const ids = new Set(state.selectedIds)
      const affected = state.doc.groups.filter((group) => group.entityIds.some((id) => ids.has(id)))
      if (affected.length === 0) {
        state.log('error', 'Nothing in the selection belongs to a group.')
        return
      }
      state.updateDocument((doc) => ({
        ...doc,
        groups: doc.groups.filter((group) => !group.entityIds.some((id) => ids.has(id))),
      }))
      state.log('result', `Ungrouped ${describeCount(affected.length, 'group')}`)
      return
    }
    case 'JOIN':
      runJoin(state)
      return
    case 'EXPLODE':
      runExplode(state)
      return
    case 'OVERKILL':
      runOverkill(state)
      return
    case 'LAYMOV':
    case 'MOVETOLAYER': {
      if (state.selectedIds.length === 0) {
        state.log('error', 'Select objects before moving them to a layer.')
        return
      }
      const named = argument.trim()
      const target = named
        ? state.doc.layers.find((layer) => layer.name.toLowerCase() === named.toLowerCase())
        : state.doc.layers.find((layer) => layer.id === state.activeLayerId)
      if (!target) {
        state.log('error', named ? `No layer named "${named}".` : 'No current layer.')
        return
      }
      if (state.moveSelectionToLayer(target.id)) {
        state.log('result', useCadStore.getState().statusMessage)
      }
      return
    }
    case 'LAYCUR':
    case 'LAYMCUR': {
      if (state.setActiveLayerFromSelection()) {
        state.log('result', useCadStore.getState().statusMessage)
      } else {
        state.log('error', useCadStore.getState().statusMessage)
      }
      return
    }
    case 'HELP':
      for (const entry of COMMANDS) {
        const aliases = entry.aliases.length > 0 ? ` (${entry.aliases.join(', ')})` : ''
        state.log('result', `${entry.name}${aliases} — ${entry.summary}`)
      }
      return
    default:
      state.log('error', `${command.name} is not wired up yet.`)
  }
}

/* ------------------------------------------------------------- prompts */

/** Everything the prompt engine needs to describe the current step. */
export const promptContextFor = (state: CadStoreState, swapped = false): PromptContext => ({
  tool: state.activeTool,
  // A Ttr circle counts its progress in picked objects rather than in points.
  step:
    state.activeTool === 'circle' && state.circleMode === 'ttr'
      ? state.tangentPicks.length
      : state.draftPoints.length,
  dimensionType: state.dimensionType,
  hasSelection: state.selectedIds.length > 0,
  hasTarget: state.modifyTargetId !== null,
  offsetDistance: state.offsetDistance,
  offsetPending: state.offsetPending,
  offsetThrough: state.offsetThrough,
  filletRadius: state.filletRadius,
  chamferDistance: state.chamferDistance,
  cornerPending: state.cornerPending,
  arrayType: state.arrayType,
  arrayRows: state.arrayRows,
  arrayColumns: state.arrayColumns,
  arrayRowSpacing: state.arrayRowSpacing,
  arrayColumnSpacing: state.arrayColumnSpacing,
  arrayCount: state.arrayCount,
  arrayFillAngle: state.arrayFillAngle,
  arrayPending: state.arrayPending,
  polygonSides: state.polygonSides,
  polygonFit: state.polygonFit,
  circleMode: state.circleMode,
  // The tangent picks count as steps of their own, so the radius prompt only shows once both are in.
  circlePending: state.circlePending,
  arcMode: state.arcMode,
  arcPending: state.arcPending,
  rectMode: state.rectMode,
  rectPending: state.rectPending,
  hatchPattern: state.hatchPattern,
  hatchScale: state.hatchScale,
  hatchAngle: state.hatchAngle,
  hatchPending: state.hatchPending,
  pickingEdges: state.pickingEdges,
  edgeCount: state.edgeIds === null ? null : state.edgeIds.length,
  swapped,
})

/**
 * Commands that may run inside another one, written with a leading apostrophe. They only change the
 * view or a drafting setting, so the command they interrupt is left exactly as it was.
 */
const TRANSPARENT_COMMANDS = new Set(['ZOOM', 'OSNAP', 'ORTHO', 'POLAR', 'LWDISPLAY', 'HELP'])

export const currentPrompt = (state: CadStoreState, swapped = false): Prompt =>
  promptFor(promptContextFor(state, swapped))

/** Applies an option the user picked from the bracketed list in the prompt. */
const runKeyword = (state: CadStoreState, keyword: Keyword) => {
  switch (keyword.label) {
    case 'cuTting edges':
    case 'Boundary edges':
      state.beginEdgeSelection()
      return
    case 'All':
      state.useAllEdges()
      return
    case 'Fence':
      state.setStatusMessage('Drag a fence line across the objects to edit.')
      return
    case 'Radius':
    case 'Distance':
      // The pick starts over, so a size typed midway through does not half-apply.
      useCadStore.setState({ cornerPending: true, modifyTargetId: null, draftPoints: [] })
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case '3 Point':
    case '2 Point':
    case 'Ttr (tangent tangent radius)':
      if (state.activeTool === 'arc') {
        state.setArcMode('3p')
      } else {
        state.setCircleMode(keyword.key === '3P' ? '3p' : keyword.key === '2P' ? '2p' : 'ttr')
      }
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Start':
      state.setArcMode('sce')
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Center':
      state.setRectMode('center')
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Dimensions':
      // Keep any first corner already picked, then ask for length.
      if (state.draftPoints.length > 0) {
        useCadStore.setState({ rectMode: 'dimensions', rectPending: 'length' })
      } else {
        state.setRectMode('dimensions')
      }
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Rotation':
      useCadStore.setState({ rectPending: 'rotation' })
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Pattern':
      state.setHatchPattern(nextHatchPattern(state.hatchPattern))
      state.log('result', `Pattern ${HATCH_PATTERN_LABELS[useCadStore.getState().hatchPattern]}`)
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Scale':
      useCadStore.setState({ hatchPending: 'scale' })
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Angle':
      if (state.activeTool === 'arc') {
        state.setArcMode('sca')
        state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
        return
      }
      useCadStore.setState({ hatchPending: 'angle' })
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Diameter':
      // Set directly rather than through setCircleMode, which would throw away the centre that has
      // already been picked and send the command back to its first prompt.
      useCadStore.setState({ circleMode: 'diameter' })
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Rectangular':
    case 'Polar':
      state.setArrayType(keyword.key === 'R' ? 'rect' : 'polar')
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Rows':
    case 'Columns':
    case 'Row spacing':
    case 'Column spacing':
    case 'Items':
    case 'Angle to fill': {
      const option: ArrayOption = {
        Rows: 'rows',
        Columns: 'columns',
        'Row spacing': 'rowSpacing',
        'Column spacing': 'columnSpacing',
        Items: 'count',
        'Angle to fill': 'fillAngle',
      }[keyword.label] as ArrayOption
      useCadStore.setState({ arrayPending: option })
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    }
    case 'Rotate items':
      state.toggleArrayRotateItems()
      state.log(
        'result',
        useCadStore.getState().arrayRotateItems
          ? 'Copies will turn to follow the sweep.'
          : 'Copies will keep the heading the original has.',
      )
      return
    case 'Inscribed in circle':
    case 'Circumscribed about circle':
      state.setPolygonFit(keyword.key === 'I' ? 'inscribed' : 'circumscribed')
      state.log('result', keyword.key === 'I' ? 'Inscribed in circle' : 'Circumscribed about circle')
      return
    case 'Edge':
      state.setPolygonFit('edge')
      useCadStore.setState({ draftPoints: [] })
      state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
      return
    case 'Undo':
      state.undo()
      // A run of lines commits a segment per pick, so stepping back also rewinds the rubber band.
      if (state.activeTool === 'line' && state.draftPoints.length > 1) {
        useCadStore.setState({ draftPoints: state.draftPoints.slice(0, -1) })
      }
      return
    case 'Close':
      state.closeDraft()
      return
    case 'Erase source':
      state.toggleMirrorKeepSource()
      state.setStatusMessage(state.mirrorKeepSource ? 'Source objects will be erased.' : 'Source objects will be kept.')
      return
    case 'Through':
      // The distance stops mattering: the copy is placed through whatever point is picked.
      useCadStore.setState({ offsetThrough: true, offsetPending: false })
      state.log('result', 'Offset through a picked point')
      return
    case 'Erase': {
      const erase = !useCadStore.getState().offsetErase
      useCadStore.setState({ offsetErase: erase })
      state.log('result', `Erase source after offsetting: ${erase ? 'Yes' : 'No'}`)
      return
    }
    case 'Layer': {
      const toCurrent = !useCadStore.getState().offsetToCurrentLayer
      useCadStore.setState({ offsetToCurrentLayer: toCurrent })
      state.log('result', `Offset objects go on the ${toCurrent ? 'current' : 'source'} layer`)
      return
    }
    case 'Exit':
      state.endCommand()
      return
    default:
      state.setStatusMessage(`Unhandled option: ${keyword.label}`)
  }
}

const applyModifyTool = (state: CadStoreState, point: Vec2, swapped: boolean): boolean => {
  const { activeTool } = state

  if (activeTool === 'offset') {
    if (!state.modifyTargetId) {
      const target = pickEntity(state, point)
      if (!target) {
        state.setStatusMessage('No object found at that point.')
        return true
      }
      useCadStore.setState({ modifyTargetId: target.id, statusMessage: 'Specify point on side to offset:' })
      return true
    }
    const target = state.doc.entities.find((entity) => entity.id === state.modifyTargetId)
    // Through mode ignores the set distance and puts the copy where the crosshair is instead.
    const distance = state.offsetThrough && target ? distanceToEntity(point, target) : state.offsetDistance
    const offset = target && distance > 0 ? offsetEntity(target, distance, point) : null
    if (!offset) {
      state.setStatusMessage('Cannot offset that object by this distance.')
      useCadStore.setState({ modifyTargetId: null })
      return true
    }

    const placed = state.offsetToCurrentLayer ? { ...offset, layerId: state.activeLayerId } : offset
    state.addEntity(placed)
    if (state.offsetErase && target) {
      state.updateDocument((doc) => ({
        ...doc,
        entities: doc.entities.filter((entity) => entity.id !== target.id),
      }))
    }

    useCadStore.setState({
      modifyTargetId: null,
      statusMessage: `Offset by ${distance.toFixed(2)}`,
    })
    return true
  }

  if (activeTool === 'trim' || activeTool === 'extend') {
    runTrimExtend(state, point, swapped)
    return true
  }

  if (activeTool === 'fillet' || activeTool === 'chamfer') {
    runCorner(state, point)
    return true
  }

  if (activeTool === 'move' || activeTool === 'copy' || activeTool === 'rotate' || activeTool === 'scale') {
    runTransform(state, point)
    return true
  }

  if (activeTool === 'mirror') {
    if (state.selectedIds.length === 0) {
      state.setStatusMessage('Select objects before mirroring.')
      return true
    }
    if (state.draftPoints.length === 0) {
      state.addDraftPoint(point)
      return true
    }
    const axisStart = state.draftPoints[0]
    const selected = new Set(state.selectedIds)
    state.updateDocument((doc) => {
      const mirrored = doc.entities
        .filter((entity) => selected.has(entity.id))
        .map((entity) => ({ ...mirrorEntity(entity, axisStart, point), id: uid() }))
      const kept = state.mirrorKeepSource
        ? doc.entities
        : doc.entities.filter((entity) => !selected.has(entity.id))
      return { ...doc, entities: [...kept, ...mirrored] }
    })
    state.clearDraft()
    state.endCommand()
    state.setStatusMessage(state.mirrorKeepSource ? 'Mirrored' : 'Mirrored and erased source')
    return true
  }

  if (activeTool === 'array') {
    runArray(state, point)
    return true
  }

  return false
}

/**
 * ARRAY, repeating the selection either in a grid or around a centre.
 *
 * A grid is spaced by a displacement, picked the way MOVE picks one: a base point and then where
 * the neighbouring item goes, so the gap can be snapped off existing geometry rather than guessed
 * at. A sweep needs only its centre. The counts come from the ribbon either way.
 */
const runArray = (state: CadStoreState, point: Vec2) => {
  if (state.selectedIds.length === 0) {
    state.setStatusMessage('Select objects before arraying them.')
    return
  }

  const selected = new Set(state.selectedIds)
  const commit = (make: (sources: CadEntity[]) => CadEntity[], describe: (added: number) => string) => {
    let added = 0
    state.updateDocument((doc) => {
      const copies = make(doc.entities.filter((entity) => selected.has(entity.id)))
      added = copies.length
      return { ...doc, entities: [...doc.entities, ...copies] }
    })
    state.clearDraft()
    state.endCommand()
    state.setStatusMessage(describe(added))
  }

  if (state.arrayType === 'polar') {
    const { arrayCount, arrayFillAngle, arrayRotateItems } = state
    if (arrayCount < 2) {
      state.setStatusMessage('A polar array needs at least two items.')
      return
    }
    commit(
      (sources) =>
        polarArrayCopies(sources, point, {
          count: arrayCount,
          fillAngle: arrayFillAngle,
          rotateItems: arrayRotateItems,
        }),
      (added) => `Array of ${arrayCount} around a centre, ${added} copies added.`,
    )
    return
  }

  if (state.draftPoints.length === 0) {
    state.addDraftPoint(point)
    state.setStatusMessage('Pick where the neighbouring item goes, to set the spacing.')
    return
  }

  const spacing = sub(point, state.draftPoints[0])
  if (Math.abs(spacing.x) < 1e-9 && Math.abs(spacing.y) < 1e-9) {
    state.setStatusMessage('The two points are in the same place, which leaves no room between items.')
    return
  }

  // Picking the spacing writes it back, so the ribbon shows what was just built and can repeat it.
  useCadStore.setState({ arrayRowSpacing: spacing.y, arrayColumnSpacing: spacing.x })
  buildGrid(state, commit, spacing.y, spacing.x)
}

const buildGrid = (
  state: CadStoreState,
  commit: (make: (sources: CadEntity[]) => CadEntity[], describe: (added: number) => string) => void,
  rowSpacing: number,
  columnSpacing: number,
) => {
  const { arrayRows, arrayColumns } = state
  commit(
    (sources) =>
      rectangularArrayCopies(sources, { rows: arrayRows, columns: arrayColumns, rowSpacing, columnSpacing }),
    (added) => `Array of ${arrayRows} by ${arrayColumns}, ${added} copies added.`,
  )
}

/**
 * Enter builds the grid straight from the typed row and column spacing, which is the quicker route
 * when the spacing is a known dimension rather than something to judge by eye.
 */
export const finishArray = (state: CadStoreState): boolean => {
  if (state.activeTool !== 'array' || state.arrayType !== 'rect' || state.draftPoints.length > 0) return false
  if (state.selectedIds.length === 0) {
    state.setStatusMessage('Select objects before arraying them.')
    return true
  }
  if (state.arrayRowSpacing === 0 && state.arrayColumnSpacing === 0) {
    state.setStatusMessage('Set a row or column spacing, or the copies would all land on the original.')
    return true
  }

  const selected = new Set(state.selectedIds)
  buildGrid(
    state,
    (make, describe) => {
      let added = 0
      state.updateDocument((doc) => {
        const copies = make(doc.entities.filter((entity) => selected.has(entity.id)))
        added = copies.length
        return { ...doc, entities: [...doc.entities, ...copies] }
      })
      state.clearDraft()
      state.endCommand()
      state.setStatusMessage(describe(added))
    },
    state.arrayRowSpacing,
    state.arrayColumnSpacing,
  )
  return true
}

export const applyDrawTool = (point: Vec2, options: { swapped?: boolean } = {}) => {
  const state = useCadStore.getState()
  const { activeLayerId, activeTool, draftPoints, addEntity, clearDraft, addDraftPoint } = state
  const currentLayerId = activeLayerId || state.doc.layers[0].id

  if (applyModifyTool(state, point, options.swapped ?? false)) return

  /**
   * Commands that finish on their second pick. AutoCAD drops back to the idle prompt afterwards,
   * where Enter or Space repeats the command, rather than leaving the tool armed.
   */
  const finishTwoPoint = (factory: (a: Vec2, b: Vec2) => CadEntity) => {
    if (draftPoints.length === 0) {
      addDraftPoint(point)
      return
    }
    addEntity(factory(draftPoints[0], point))
    clearDraft()
    state.endCommand()
  }

  if (activeTool === 'line') {
    // LINE keeps going, each segment starting where the last one ended, until Enter or Escape.
    if (draftPoints.length === 0) {
      addDraftPoint(point)
      return
    }
    addEntity(createLine(currentLayerId, draftPoints.at(-1)!, point))
    addDraftPoint(point)
    return
  }

  if (activeTool === 'rect') {
    if (state.rectMode === 'dimensions') {
      if (draftPoints.length === 0) {
        addDraftPoint(point)
        useCadStore.setState({ rectPending: 'length' })
        state.log('prompt', formatPrompt(currentPrompt(useCadStore.getState())))
        return
      }
      return
    }
    if (state.rectMode === 'center') {
      if (draftPoints.length === 0) {
        addDraftPoint(point)
        return
      }
      addEntity(createClosedPoly(currentLayerId, rectFromCenter(draftPoints[0], point, state.rectRotation)))
      clearDraft()
      state.endCommand()
      return
    }
    finishTwoPoint((a, b) => createClosedPoly(currentLayerId, rectFromCorners(a, b, state.rectRotation)))
    return
  }

  if (activeTool === 'circle') {
    if (runCircle(state, point, currentLayerId)) return
    return
  }

  if (activeTool === 'ellipse') {
    finishTwoPoint((a, b) => ({
      id: uid(),
      type: 'ellipse',
      layerId: currentLayerId,
      center: a,
      rx: Math.abs(b.x - a.x),
      ry: Math.abs(b.y - a.y),
      rotation: 0,
    }))
    return
  }

  if (activeTool === 'polygon') {
    if (state.polygonFit === 'edge') {
      finishTwoPoint((a, b) => polygonOnEdge(currentLayerId, a, b, state.polygonSides) ?? createPolygon(currentLayerId, a, 1, state.polygonSides))
      return
    }
    finishTwoPoint((a, b) =>
      createPolygon(
        currentLayerId,
        a,
        cornerRadius(state.polygonFit, Math.hypot(b.x - a.x, b.y - a.y), state.polygonSides),
        state.polygonSides,
      ),
    )
    return
  }

  if (activeTool === 'arc') {
    runArc(state, point, currentLayerId)
    return
  }

  if (activeTool === 'polyline') {
    if (draftPoints.length === 0) {
      addDraftPoint(point)
      return
    }
    if (draftPoints.length >= 3 && Math.hypot(point.x - draftPoints[0].x, point.y - draftPoints[0].y) < 1) {
      addEntity({ id: uid(), type: 'polyline', layerId: currentLayerId, points: draftPoints, closed: true })
      clearDraft()
      return
    }
    addDraftPoint(point)
    return
  }

  if (activeTool === 'spline') {
    addDraftPoint(point)
    return
  }

  if (activeTool === 'text') {
    const value = window.prompt('Text value', 'NOTE')
    if (!value) return
    addEntity({ id: uid(), type: 'text', layerId: currentLayerId, position: point, value, height: 12 })
    state.endCommand()
    return
  }

  if (activeTool === 'hatch') {
    const candidates = state.doc.entities.filter(
      (entity) => entity.type !== 'hatch' && isLayerVisible(layerOf(state.doc, entity)),
    )
    // The arrangement finds regions bounded by several crossing objects; the whole-entity search
    // is a fallback for shapes it cannot resolve.
    const boundary = findRegionBoundary(candidates, point) ?? findHatchBoundary(candidates, point)
    if (!boundary) {
      state.setStatusMessage('No enclosed area found at that point.')
      return
    }
    addEntity({
      id: uid(),
      type: 'hatch',
      layerId: currentLayerId,
      boundary,
      pattern: state.hatchPattern,
      scale: state.hatchScale,
      angle: state.hatchAngle,
    })
    state.setStatusMessage('Hatch created')
    return
  }

  if (activeTool === 'boundary') {
    // BOUNDARY traces the same region HATCH would fill, but hands back the outline itself so it
    // can be offset, measured or filled later. Existing outlines are ignored, or picking inside
    // one already traced would just find its own edge again.
    const candidates = state.doc.entities.filter(
      (entity) => entity.type !== 'hatch' && isLayerVisible(layerOf(state.doc, entity)),
    )
    const boundary = findRegionBoundary(candidates, point) ?? findHatchBoundary(candidates, point)
    if (!boundary) {
      state.setStatusMessage('No enclosed area found at that point.')
      return
    }
    addEntity({ id: uid(), type: 'polyline', layerId: currentLayerId, points: boundary, closed: true })
    state.setStatusMessage(`Boundary traced through ${describeCount(boundary.length, 'point')}`)
    return
  }

  if (activeTool === 'dimension') {
    applyDimensionTool(state, point, currentLayerId)
  }
}

const applyDimensionTool = (
  state: ReturnType<typeof useCadStore.getState>,
  point: Vec2,
  layerId: string,
) => {
  const { dimensionType, dimScale, draftPoints, addDraftPoint, addEntity, clearDraft } = state

  if (dimensionType === 'radial' || dimensionType === 'diameter') {
    if (draftPoints.length === 0) {
      const tolerance = getPreferences().pickBoxSize / state.camera.zoom
      const target = [...state.doc.entities]
        .reverse()
        .find((entity) => (entity.type === 'circle' || entity.type === 'arc') && isPointNearEntity(point, entity, tolerance))
      if (!target || (target.type !== 'circle' && target.type !== 'arc')) {
        state.setStatusMessage('Select a circle or arc.')
        return
      }
      useCadStore.setState({ draftPoints: [target.center, point] })
      return
    }
    addEntity({
      id: uid(),
      type: 'dimension',
      layerId,
      dimType: dimensionType,
      p1: draftPoints[0],
      p2: draftPoints[1],
      placement: point,
      scale: dimScale,
    })
    clearDraft()
    return
  }

  if (dimensionType === 'angular') {
    if (draftPoints.length < 3) {
      addDraftPoint(point)
      return
    }
    addEntity({
      id: uid(),
      type: 'dimension',
      layerId,
      dimType: 'angular',
      p1: draftPoints[0],
      p2: draftPoints[1],
      p3: draftPoints[2],
      placement: point,
      scale: dimScale,
    })
    clearDraft()
    return
  }

  if (draftPoints.length < 2) {
    addDraftPoint(point)
    return
  }
  addEntity({
    id: uid(),
    type: 'dimension',
    layerId,
    dimType: dimensionType,
    p1: draftPoints[0],
    p2: draftPoints[1],
    placement: point,
    scale: dimScale,
  })
  clearDraft()
}
