import { useCadStore } from '../core/store'
import { ALL_SNAP_MODES } from '../core/snap'

export function SnapPanel() {
  const snapEnabled = useCadStore((state) => state.snapEnabled)
  const snapSpacing = useCadStore((state) => state.snapSpacing)
  const toggleSnap = useCadStore((state) => state.toggleSnap)
  const setSnapSpacing = useCadStore((state) => state.setSnapSpacing)

  const snapModes = useCadStore((state) => state.snapModes)
  const toggleSnapMode = useCadStore((state) => state.toggleSnapMode)
  const osnapEnabled = useCadStore((state) => state.osnapEnabled)
  const toggleOsnap = useCadStore((state) => state.toggleOsnap)
  const polarEnabled = useCadStore((state) => state.polarEnabled)
  const togglePolar = useCadStore((state) => state.togglePolar)

  return (
    <section className="panel">
      <h3>Object Snap</h3>
      <label title="Snap the cursor to a grid of the spacing below. Object snap still wins when it can find something.">
        <input
          type="checkbox"
          checked={snapEnabled}
          onChange={toggleSnap}
          aria-label="Snap to grid"
        />
        Snap to grid
      </label>
      <label title="The grid SNAP rounds to, in the drawing's own units — AutoCAD's SNAPUNIT. The grid you can see is drawn to its own adaptive spacing.">
        Snap spacing
        <input
          type="number"
          min={0.000001}
          step="any"
          value={snapSpacing}
          aria-label="Snap spacing"
          onChange={(event) => setSnapSpacing(Number(event.target.value))}
        />
      </label>
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
