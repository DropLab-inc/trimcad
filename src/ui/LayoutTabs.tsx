import { useCadStore } from '../core/store'

/**
 * The strip that switches between the drawing and the sheets, the way AutoCAD's layout tabs do.
 * Model is always first and is never removed — it is where the drawing lives — and every tab after
 * it is a layout in the document.
 */
export function LayoutTabs() {
  const layouts = useCadStore((state) => state.doc.layouts)
  const activeLayoutId = useCadStore((state) => state.activeLayoutId)
  const setActiveLayout = useCadStore((state) => state.setActiveLayout)
  const addLayout = useCadStore((state) => state.addLayout)
  const deleteLayout = useCadStore((state) => state.deleteLayout)

  const remove = (id: string, name: string) => {
    // A sheet carries real work, so deleting one asks first — a stray click on a tab should not
    // be able to throw it away.
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${name}?`)) return
    deleteLayout(id)
  }

  return (
    <div className="layout-tabs" role="tablist" aria-label="Model space and layouts">
      <button
        type="button"
        role="tab"
        aria-selected={activeLayoutId === null}
        className={`layout-tab ${activeLayoutId === null ? 'active' : ''}`}
        onClick={() => setActiveLayout(null)}
      >
        Model
      </button>

      {layouts.map((layout) => {
        const active = layout.id === activeLayoutId
        return (
          <span key={layout.id} className={`layout-tab-group ${active ? 'active' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={`layout-tab ${active ? 'active' : ''}`}
              onClick={() => setActiveLayout(layout.id)}
            >
              {layout.name}
            </button>
            <button
              type="button"
              className="layout-tab-remove"
              aria-label={`Delete ${layout.name}`}
              title={`Delete ${layout.name}`}
              onClick={() => remove(layout.id, layout.name)}
            >
              ×
            </button>
          </span>
        )
      })}

      <button
        type="button"
        className="layout-tab-add"
        onClick={addLayout}
        aria-label="Add a layout"
        title="Add a layout"
      >
        +
      </button>
    </div>
  )
}
