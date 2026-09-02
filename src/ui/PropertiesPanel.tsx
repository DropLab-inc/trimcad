import { useCadStore } from '../core/store'

export function PropertiesPanel() {
  const doc = useCadStore((state) => state.doc)
  const selectedIds = useCadStore((state) => state.selectedIds)
  const updateDocument = useCadStore((state) => state.updateDocument)
  const selected = doc.entities.filter((entity) => selectedIds.includes(entity.id))

  if (selected.length === 0) {
    return (
      <section className="panel">
        <h3>Properties</h3>
        <p>No selection</p>
      </section>
    )
  }

  const first = selected[0]
  return (
    <section className="panel">
      <h3>Properties</h3>
      <p>Type: {first.type}</p>
      <label>
        Color
        <input
          type="color"
          value={first.color ?? '#7cc6ff'}
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
    </section>
  )
}
