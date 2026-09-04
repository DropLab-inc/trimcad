import { DEFAULT_LAYER_COLOR } from '../core/layers'
import { useCadStore } from '../core/store'
import { dimensionScale } from './renderers'
import type { DimensionEntity } from '../core/types'

export function PropertiesPanel() {
  const doc = useCadStore((state) => state.doc)
  const selectedIds = useCadStore((state) => state.selectedIds)
  const updateDocument = useCadStore((state) => state.updateDocument)
  const moveSelectionToLayer = useCadStore((state) => state.moveSelectionToLayer)
  const resizeDimensions = useCadStore((state) => state.resizeDimensions)
  const selected = doc.entities.filter((entity) => selectedIds.includes(entity.id))
  const dimensions = selected.filter((entity): entity is DimensionEntity => entity.type === 'dimension')

  if (selected.length === 0) {
    return (
      <section className="panel">
        <h3>Properties</h3>
        <p>No selection</p>
      </section>
    )
  }

  const first = selected[0]
  const layerIds = new Set(selected.map((entity) => entity.layerId))
  const commonLayerId = layerIds.size === 1 ? first.layerId : ''
  const typeLabel =
    selected.length === 1
      ? first.type
      : layerIds.size === 1
        ? `${selected.length} objects`
        : `${selected.length} objects`

  return (
    <section className="panel">
      <h3>Properties</h3>
      <p>Type: {typeLabel}</p>
      <label title="Which layer the selection sits on. Changing it moves every selected object.">
        Layer
        <select
          aria-label="Layer"
          value={commonLayerId}
          onChange={(event) => {
            if (event.target.value) moveSelectionToLayer(event.target.value)
          }}
        >
          {commonLayerId === '' && (
            <option value="" disabled>
              *Varies*
            </option>
          )}
          {doc.layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Color
        <input
          type="color"
          value={first.color ?? DEFAULT_LAYER_COLOR}
          onChange={(event) => {
            updateDocument((draft) => ({
              ...draft,
              entities: draft.entities.map((entity) =>
                selectedIds.includes(entity.id) ? { ...entity, color: event.target.value } : entity,
              ),
            }))
          }}
        />
      </label>
      <label>
        Lineweight
        <input
          type="number"
          min={1}
          max={10}
          step={1}
          value={first.lineweight ?? 1}
          onChange={(event) => {
            const lineweight = Number(event.target.value)
            updateDocument((draft) => ({
              ...draft,
              entities: draft.entities.map((entity) =>
                selectedIds.includes(entity.id) ? { ...entity, lineweight } : entity,
              ),
            }))
          }}
        />
      </label>
      {dimensions.length > 0 && (
        <label title="Size of the text and arrows, as a multiple of the drawing's dimension style">
          Dimension size
          <input
            type="number"
            min={0.01}
            step={0.25}
            value={dimensionScale(dimensions[0])}
            onChange={(event) => {
              resizeDimensions(
                dimensions.map((entity) => entity.id),
                Number(event.target.value),
              )
            }}
          />
        </label>
      )}
    </section>
  )
}
