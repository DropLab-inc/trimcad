import { useEffect, useRef, useState } from 'react'
import { useCadStore } from '../core/store'
import { LAYER_COLORS, LINEWEIGHTS, countEntitiesOnLayer, formatLineweight } from '../core/layers'
import { Icon, type IconName } from './Icon'
import { usePanelHeight } from './useSidebarWidth'
import type { Layer } from '../core/types'

type Toggle = {
  field: 'visible' | 'frozen' | 'locked' | 'plottable'
  /** Icon shown when the field is true, then when it is false. */
  icons: [IconName, IconName]
  titles: [string, string]
}

/** The columns AutoCAD's Layer Properties Manager puts beside every layer name. */
const TOGGLES: Toggle[] = [
  {
    field: 'visible',
    icons: ['bulb-on', 'bulb-off'],
    titles: ['On. Click to turn the layer off', 'Off. Click to turn the layer on'],
  },
  {
    field: 'frozen',
    icons: ['freeze', 'thaw'],
    titles: ['Frozen. Click to thaw', 'Thawed. Click to freeze'],
  },
  {
    field: 'locked',
    icons: ['locked', 'unlocked'],
    titles: ['Locked. Click to unlock', 'Unlocked. Click to lock'],
  },
  {
    field: 'plottable',
    icons: ['plot-on', 'plot-off'],
    titles: ['Plots. Click to leave it off plots', 'Not plotted. Click to include it'],
  },
]

export function LayerPanel() {
  const doc = useCadStore((state) => state.doc)
  const activeLayerId = useCadStore((state) => state.activeLayerId)
  const setActiveLayerId = useCadStore((state) => state.setActiveLayerId)
  const updateLayer = useCadStore((state) => state.updateLayer)
  const addLayer = useCadStore((state) => state.addLayer)
  const deleteLayer = useCadStore((state) => state.deleteLayer)
  const [editingColor, setEditingColor] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const { height: listHeight, startResize: startResizeList } = usePanelHeight('layers', 140, 60, 480)

  /** Linetype and lineweight are shown for the current layer, as AutoCAD's layer controls do. */
  const current = doc.layers.find((layer) => layer.id === activeLayerId)

  // The palette stays open until it is dismissed, so a colour can be tried and changed again.
  useEffect(() => {
    if (!editingColor) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target)) setEditingColor(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingColor(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [editingColor])

  return (
    <section className="panel layer-panel" ref={panelRef}>
      <header className="panel-head">
        <h3>Layers</h3>
        <div className="panel-actions">
          <button type="button" title="New layer" aria-label="New layer" onClick={addLayer}>
            <Icon name="layer-add" />
          </button>
          <button
            type="button"
            title="Delete the selected layer"
            aria-label="Delete layer"
            disabled={doc.layers.length <= 1}
            onClick={() => deleteLayer(activeLayerId)}
          >
            <Icon name="layer-delete" />
          </button>
        </div>
      </header>

      <div className="layer-head">
        <span />
        <span />
        <span>Name</span>
        {TOGGLES.map((toggle) => (
          <span key={toggle.field} className="layer-head-icon" title={toggle.titles[0]}>
            <Icon name={toggle.icons[0]} />
          </span>
        ))}
      </div>

      <ul className="layer-list" style={{ height: listHeight }}>
        {doc.layers.map((layer) => (
          <li key={layer.id} className={layer.id === activeLayerId ? 'layer-row current' : 'layer-row'}>
            <button
              type="button"
              className="layer-current"
              title={layer.id === activeLayerId ? 'Current layer' : 'Make this the current layer'}
              aria-label={`Make ${layer.name} current`}
              aria-pressed={layer.id === activeLayerId}
              onClick={() => setActiveLayerId(layer.id)}
            >
              <span className="layer-current-mark" />
            </button>

            <button
              type="button"
              className="layer-swatch"
              style={{ background: layer.color }}
              title={`Colour: ${layer.color}`}
              aria-label={`Colour of ${layer.name}`}
              onClick={() => setEditingColor(editingColor === layer.id ? null : layer.id)}
            />

            <input
              className="layer-name"
              value={layer.name}
              title={`${layer.name} — ${countEntitiesOnLayer(doc, layer.id)} object(s)`}
              onChange={(event) => updateLayer(layer.id, { name: event.target.value })}
            />

            {TOGGLES.map((toggle) => {
              const on = layer[toggle.field]
              return (
                <button
                  key={toggle.field}
                  type="button"
                  className={`layer-toggle ${on ? 'on' : 'off'}`}
                  title={on ? toggle.titles[0] : toggle.titles[1]}
                  aria-label={`${toggle.field} ${layer.name}`}
                  aria-pressed={on}
                  onClick={() => updateLayer(layer.id, { [toggle.field]: !on } as Partial<Layer>)}
                >
                  <Icon name={on ? toggle.icons[0] : toggle.icons[1]} />
                </button>
              )
            })}

            {editingColor === layer.id && (
              <div className="layer-colors" role="group" aria-label={`Colour for ${layer.name}`}>
                {LAYER_COLORS.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    className="layer-color"
                    style={{ background: color.hex }}
                    title={color.name}
                    aria-label={color.name}
                    aria-pressed={layer.color.toLowerCase() === color.hex}
                    onClick={() => updateLayer(layer.id, { color: color.hex })}
                  />
                ))}
                <input
                  type="color"
                  value={layer.color}
                  aria-label="Custom colour"
                  onChange={(event) => updateLayer(layer.id, { color: event.target.value })}
                />
              </div>
            )}

          </li>
        ))}
      </ul>

      <div
        className="layer-list-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the layer list"
        title="Drag to show more or fewer layers"
        onPointerDown={startResizeList}
      />

      {current && (
        <div className="layer-details">
          <label htmlFor="layer-linetype">Linetype</label>
          <select
            id="layer-linetype"
            value={current.linetypeId}
            aria-label={`Linetype of ${current.name}`}
            onChange={(event) => updateLayer(current.id, { linetypeId: event.target.value })}
          >
            {doc.linetypes.map((linetype) => (
              <option key={linetype.id} value={linetype.id}>
                {linetype.name}
              </option>
            ))}
          </select>

          <label htmlFor="layer-lineweight">Lineweight</label>
          <select
            id="layer-lineweight"
            value={current.lineweight}
            aria-label={`Lineweight of ${current.name}`}
            onChange={(event) => updateLayer(current.id, { lineweight: Number(event.target.value) })}
          >
            {LINEWEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {formatLineweight(weight)}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  )
}
