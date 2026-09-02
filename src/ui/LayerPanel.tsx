import { useCadStore } from '../core/store'

export function LayerPanel() {
  const doc = useCadStore((state) => state.doc)
  const activeLayerId = useCadStore((state) => state.activeLayerId)
  const setActiveLayerId = useCadStore((state) => state.setActiveLayerId)
  const updateDocument = useCadStore((state) => state.updateDocument)

  return (
    <section className="panel">
      <h3>Layers</h3>
      <ul className="layer-list">
        {doc.layers.map((layer) => (
          <li key={layer.id} className={layer.id === activeLayerId ? 'active-layer' : ''} onClick={() => setActiveLayerId(layer.id)}>
            <span className="swatch" style={{ background: layer.color }} />
            <span>{layer.name}</span>
            <label>
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={(event) =>
                  updateDocument((draft) => ({
                    ...draft,
                    layers: draft.layers.map((candidate) =>
                      candidate.id === layer.id ? { ...candidate, visible: event.target.checked } : candidate,
                    ),
                  }))
                }
              />
              Visible
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          updateDocument((draft) => ({
            ...draft,
            layers: [
              ...draft.layers,
              {
                id: crypto.randomUUID(),
                name: `Layer-${draft.layers.length}`,
                color: '#7cc6ff',
                linetypeId: draft.linetypes[0].id,
                lineweight: 1,
                visible: true,
                locked: false,
              },
            ],
          }))
        }
      >
        + Layer
      </button>
    </section>
  )
}
