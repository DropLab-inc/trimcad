import { useCadStore } from '../core/store'

export function StatusBar() {
  const doc = useCadStore((state) => state.doc)
  const selectedIds = useCadStore((state) => state.selectedIds)
  const camera = useCadStore((state) => state.camera)
  const osnapEnabled = useCadStore((state) => state.osnapEnabled)
  const polarEnabled = useCadStore((state) => state.polarEnabled)
  const toggleOsnap = useCadStore((state) => state.toggleOsnap)
  const togglePolar = useCadStore((state) => state.togglePolar)
  const undo = useCadStore((state) => state.undo)
  const redo = useCadStore((state) => state.redo)

  return (
    <footer className="statusbar">
      <span>Entities: {doc.entities.length}</span>
      <span>Selected: {selectedIds.length}</span>
      <span>Units: {doc.units}</span>
      <span>Zoom: {camera.zoom.toFixed(2)}x</span>
      <button type="button" onClick={toggleOsnap}>
        OSNAP: {osnapEnabled ? 'ON' : 'OFF'}
      </button>
      <button type="button" onClick={togglePolar}>
        POLAR: {polarEnabled ? 'ON' : 'OFF'}
      </button>
      <button type="button" onClick={undo}>
        UNDO
      </button>
      <button type="button" onClick={redo}>
        REDO
      </button>
    </footer>
  )
}
