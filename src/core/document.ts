import { uid } from './geometry'
import { DEFAULT_LAYER_COLOR, makeLayer } from './layers'
import type { CadEntity, DimStyle, DrawingDocument, Layer, Linetype } from './types'

type Snapshot = {
  document: DrawingDocument
  selectedIds: string[]
}

const deepCopy = <T>(value: T): T => structuredClone(value)

const baseLinetypes: Linetype[] = [
  { id: 'lt-continuous', name: 'Continuous', pattern: [] },
  { id: 'lt-dashed', name: 'Dashed', pattern: [8, 4] },
  { id: 'lt-hidden', name: 'Hidden', pattern: [4, 2] },
  { id: 'lt-center', name: 'Center', pattern: [12, 3, 2, 3] },
]

const defaultLayer: Layer = makeLayer('layer-0', '0', baseLinetypes[0].id)

const defaultDimStyle: DimStyle = {
  precision: 2,
  arrowSize: 8,
  textHeight: 12,
  suffix: '',
}

export const makeDefaultDocument = (): DrawingDocument => ({
  units: 'mm',
  layers: [defaultLayer],
  linetypes: baseLinetypes,
  dimStyle: defaultDimStyle,
  blocks: [],
  entities: [],
  groups: [],
  layouts: [],
})

export class DocumentController {
  private history: Snapshot[] = []
  private future: Snapshot[] = []
  private selectedIds: string[] = []
  private document: DrawingDocument

  constructor(initialDocument = makeDefaultDocument()) {
    this.document = deepCopy(initialDocument)
  }

  getDocument(): DrawingDocument {
    return deepCopy(this.document)
  }

  setDocument(document: DrawingDocument) {
    this.document = deepCopy(document)
    this.selectedIds = []
    this.history = []
    this.future = []
  }

  getSelection(): string[] {
    return [...this.selectedIds]
  }

  select(ids: string[]) {
    this.selectedIds = [...new Set(ids)]
  }

  clearSelection() {
    this.selectedIds = []
  }

  private pushHistory() {
    this.history.push({ document: deepCopy(this.document), selectedIds: [...this.selectedIds] })
    this.future = []
    if (this.history.length > 100) {
      this.history.shift()
    }
  }

  undo() {
    const previous = this.history.pop()
    if (!previous) return false
    this.future.push({ document: deepCopy(this.document), selectedIds: [...this.selectedIds] })
    this.document = previous.document
    this.selectedIds = previous.selectedIds
    return true
  }

  redo() {
    const next = this.future.pop()
    if (!next) return false
    this.history.push({ document: deepCopy(this.document), selectedIds: [...this.selectedIds] })
    this.document = next.document
    this.selectedIds = next.selectedIds
    return true
  }

  mutate(mutator: (draft: DrawingDocument) => void) {
    this.pushHistory()
    const draft = deepCopy(this.document)
    mutator(draft)
    this.document = draft
  }

  addEntity(entity: CadEntity) {
    this.mutate((draft) => {
      draft.entities.push(entity)
    })
  }

  updateEntity(id: string, updater: (entity: CadEntity) => CadEntity) {
    this.mutate((draft) => {
      draft.entities = draft.entities.map((entity) => (entity.id === id ? updater(entity) : entity))
    })
  }

  setEntities(entities: CadEntity[]) {
    this.mutate((draft) => {
      draft.entities = entities
    })
  }

  deleteEntities(ids: string[]) {
    if (ids.length === 0) return
    const set = new Set(ids)
    this.mutate((draft) => {
      draft.entities = draft.entities.filter((entity) => !set.has(entity.id))
      draft.groups = draft.groups
        .map((group) => ({ ...group, entityIds: group.entityIds.filter((id) => !set.has(id)) }))
        .filter((group) => group.entityIds.length > 0)
    })
    this.selectedIds = this.selectedIds.filter((id) => !set.has(id))
  }

  addLayer(name: string, color = DEFAULT_LAYER_COLOR) {
    this.mutate((draft) => {
      draft.layers.push(makeLayer(uid(), name, draft.linetypes[0].id, color))
    })
  }

  setLayerVisible(layerId: string, visible: boolean) {
    this.mutate((draft) => {
      draft.layers = draft.layers.map((layer) => (layer.id === layerId ? { ...layer, visible } : layer))
    })
  }
}
