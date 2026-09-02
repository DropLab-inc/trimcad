import { create } from 'zustand'
import { createCircle, createLine, createPolygon, createRect } from './commands'
import { loadAutosave, saveAutosave } from './autosave'
import { DocumentController, makeDefaultDocument } from './document'
import { findRegionBoundary } from './boundary'
import { findHatchBoundary, isPointNearEntity, uid } from './geometry'
import { applySelectionModifier, expandSelectionToGroups, type SelectionModifier } from './selection'
import type { Vec2 } from './math/vec2'
import type {
  CadEntity,
  DimensionType,
  DrawingDocument,
  HatchPattern,
  SnapMode,
  ToolMode,
} from './types'

const controller = new DocumentController(makeDefaultDocument())

type CameraState = {
  x: number
  y: number
  zoom: number
}

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

type CadState = {
  doc: DrawingDocument
  selectedIds: string[]
  activeTool: ToolMode
  activeLayerId: string
  commandInput: string
  statusMessage: string
  camera: CameraState
  draftPoints: Vec2[]
  snapModes: SnapMode[]
  osnapEnabled: boolean
  polarEnabled: boolean
  polygonSides: number
  dimensionType: DimensionType
  hatchPattern: HatchPattern
  setPolygonSides: (sides: number) => void
  setDimensionType: (dimType: DimensionType) => void
  setHatchPattern: (pattern: HatchPattern) => void
  toggleSnapMode: (mode: SnapMode) => void
  finishDraft: () => void
  closeDraft: () => void
  cancelDraft: () => void
  setTool: (tool: ToolMode) => void
  setActiveLayerId: (layerId: string) => void
  setCamera: (camera: Partial<CameraState>) => void
  setCommandInput: (input: string) => void
  setStatusMessage: (message: string) => void
  toggleOsnap: () => void
  togglePolar: () => void
  setSelection: (ids: string[]) => void
  applySelection: (ids: string[], modifier: SelectionModifier) => void
  selectAll: () => void
  clearDraft: () => void
  addDraftPoint: (point: Vec2) => void
  executeCommand: (line: string) => void
  addEntity: (entity: CadEntity) => void
  updateDocument: (updater: (doc: DrawingDocument) => DrawingDocument) => void
  undo: () => void
  redo: () => void
  deleteSelection: () => void
  maybeRecoverAutosave: () => void
}

const autosaveDoc = (doc: DrawingDocument) => {
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
  camera: { x: 400, y: 300, zoom: 1 },
  draftPoints: [],
  snapModes: defaultSnapModes,
  osnapEnabled: true,
  polarEnabled: true,
  polygonSides: 6,
  dimensionType: 'linear',
  hatchPattern: 'ansi31',
  setPolygonSides: (polygonSides) => set({ polygonSides: Math.max(3, Math.round(polygonSides)) }),
  setDimensionType: (dimensionType) => set({ dimensionType, draftPoints: [], activeTool: 'dimension' }),
  setHatchPattern: (hatchPattern) => set({ hatchPattern }),
  toggleSnapMode: (mode) =>
    set((state) => ({
      snapModes: state.snapModes.includes(mode)
        ? state.snapModes.filter((candidate) => candidate !== mode)
        : [...state.snapModes, mode],
    })),
  finishDraft: () => {
    const state = get()
    const { activeTool, draftPoints } = state
    const layerId = state.activeLayerId || state.doc.layers[0].id
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
    if (activeTool !== 'polyline' || draftPoints.length < 3) return
    const layerId = state.activeLayerId || state.doc.layers[0].id
    state.addEntity({ id: uid(), type: 'polyline', layerId, points: draftPoints, closed: true })
    set({ draftPoints: [], statusMessage: 'Polyline closed' })
  },
  cancelDraft: () => set({ draftPoints: [], statusMessage: '*Cancel*' }),
  setTool: (tool) => set({ activeTool: tool, draftPoints: [], statusMessage: `Tool: ${tool.toUpperCase()}` }),
  setActiveLayerId: (activeLayerId) => set({ activeLayerId }),
  setCamera: (camera) => set((state) => ({ camera: { ...state.camera, ...camera } })),
  setCommandInput: (commandInput) => set({ commandInput }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  toggleOsnap: () => set((state) => ({ osnapEnabled: !state.osnapEnabled })),
  togglePolar: () => set((state) => ({ polarEnabled: !state.polarEnabled })),
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
    const selectable = get()
      .doc.entities.filter((entity) => {
        const layer = get().doc.layers.find((candidate) => candidate.id === entity.layerId)
        return layer?.visible !== false && layer?.locked !== true
      })
      .map((entity) => entity.id)
    controller.select(selectable)
    set({ selectedIds: controller.getSelection(), statusMessage: `Selected ${selectable.length} objects` })
  },
  clearDraft: () => set({ draftPoints: [] }),
  addDraftPoint: (point) => set((state) => ({ draftPoints: [...state.draftPoints, point] })),
  executeCommand: (line) => {
    const cmd = line.trim().toUpperCase()
    const state = get()
    if (!cmd) return
    if (cmd === 'L' || cmd === 'LINE') return state.setTool('line')
    if (cmd === 'C' || cmd === 'CIRCLE') return state.setTool('circle')
    if (cmd === 'PL' || cmd === 'POLYLINE') return state.setTool('polyline')
    if (cmd === 'REC' || cmd === 'RECT') return state.setTool('rect')
    if (cmd === 'A' || cmd === 'ARC') return state.setTool('arc')
    if (cmd === 'EL' || cmd === 'ELLIPSE') return state.setTool('ellipse')
    if (cmd === 'PG' || cmd === 'POLYGON') return state.setTool('polygon')
    if (cmd === 'SP' || cmd === 'SPLINE') return state.setTool('spline')
    if (cmd === 'H' || cmd === 'HATCH') return state.setTool('hatch')
    if (cmd === 'D' || cmd === 'DIM') return state.setTool('dimension')
    if (cmd === 'I' || cmd === 'INSERT') return state.setTool('insert')
    if (cmd === 'DEL' || cmd === 'ERASE') return state.deleteSelection()
    if (cmd === 'UNDO') return state.undo()
    if (cmd === 'REDO') return state.redo()
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
    const payload = loadAutosave()
    if (!payload) return
    const ageMs = Date.now() - payload.savedAt
    const answer = window.confirm(`Recovered autosave from ${Math.round(ageMs / 1000)}s ago. Load it?`)
    if (!answer) return
    controller.setDocument(payload.document)
    set({ doc: controller.getDocument(), selectedIds: controller.getSelection(), statusMessage: 'Autosave recovered' })
  },
}))

export const applyDrawTool = (point: Vec2) => {
  const state = useCadStore.getState()
  const { activeLayerId, activeTool, draftPoints, addEntity, clearDraft, addDraftPoint } = state
  const currentLayerId = activeLayerId || state.doc.layers[0].id
  const finishTwoPoint = (factory: (a: Vec2, b: Vec2) => CadEntity) => {
    if (draftPoints.length === 0) {
      addDraftPoint(point)
      return
    }
    addEntity(factory(draftPoints[0], point))
    clearDraft()
  }

  if (activeTool === 'line') {
    finishTwoPoint((a, b) => createLine(currentLayerId, a, b))
    return
  }

  if (activeTool === 'rect') {
    finishTwoPoint((a, b) => createRect(currentLayerId, a, b))
    return
  }

  if (activeTool === 'circle') {
    finishTwoPoint((a, b) => createCircle(currentLayerId, a, Math.hypot(b.x - a.x, b.y - a.y)))
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
    finishTwoPoint((a, b) => createPolygon(currentLayerId, a, Math.hypot(b.x - a.x, b.y - a.y), state.polygonSides))
    return
  }

  if (activeTool === 'arc') {
    if (draftPoints.length < 2) {
      addDraftPoint(point)
      return
    }
    const [center, start] = draftPoints
    const radius = Math.hypot(start.x - center.x, start.y - center.y)
    addEntity({
      id: uid(),
      type: 'arc',
      layerId: currentLayerId,
      center,
      radius,
      startAngle: Math.atan2(start.y - center.y, start.x - center.x),
      endAngle: Math.atan2(point.y - center.y, point.x - center.x),
    })
    clearDraft()
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
    return
  }

  if (activeTool === 'hatch') {
    const candidates = state.doc.entities.filter(
      (entity) =>
        entity.type !== 'hatch' &&
        state.doc.layers.find((layer) => layer.id === entity.layerId)?.visible !== false,
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
      scale: 1,
    })
    state.setStatusMessage('Hatch created')
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
  const { dimensionType, draftPoints, addDraftPoint, addEntity, clearDraft } = state

  if (dimensionType === 'radial' || dimensionType === 'diameter') {
    if (draftPoints.length === 0) {
      const tolerance = 8 / state.camera.zoom
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
  })
  clearDraft()
}
