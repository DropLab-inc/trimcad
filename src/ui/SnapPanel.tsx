import { useCadStore } from '../core/store'
import { ALL_SNAP_MODES } from '../core/snap'

export function SnapPanel() {
  const snapModes = useCadStore((state) => state.snapModes)
  const toggleSnapMode = useCadStore((state) => state.toggleSnapMode)
  const osnapEnabled = useCadStore((state) => state.osnapEnabled)
  const toggleOsnap = useCadStore((state) => state.toggleOsnap)
  const polarEnabled = useCadStore((state) => state.polarEnabled)
  const togglePolar = useCadStore((state) => state.togglePolar)

  return (
    <section className="panel">
      <h3>Object Snap</h3>
      <label>
        Object snap (OSNAP)
        <input type="checkbox" checked={osnapEnabled} onChange={toggleOsnap} />
      </label>
      <label>
        Polar tracking
        <input type="checkbox" checked={polarEnabled} onChange={togglePolar} />
      </label>
      <ul className="snap-list">
        {ALL_SNAP_MODES.map((mode) => (
          <li key={mode}>
            <label>
              {mode}
              <input
                type="checkbox"
                checked={snapModes.includes(mode)}
                disabled={!osnapEnabled}
                onChange={() => toggleSnapMode(mode)}
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
