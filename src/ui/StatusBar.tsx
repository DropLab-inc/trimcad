import { useEffect } from 'react'
import { useCadStore } from '../core/store'
import { formatPoint, formatZoom } from '../core/readout'

/** The drafting toggles AutoCAD puts on function keys. */
const TOGGLE_KEYS: Record<string, 'osnap' | 'ortho' | 'polar'> = {
  F3: 'osnap',
  F8: 'ortho',
  F10: 'polar',
}

export function StatusBar() {
  const doc = useCadStore((state) => state.doc)
  const selectedIds = useCadStore((state) => state.selectedIds)
  const camera = useCadStore((state) => state.camera)
  const cursorWorld = useCadStore((state) => state.cursorWorld)
  const statusMessage = useCadStore((state) => state.statusMessage)
  const osnapEnabled = useCadStore((state) => state.osnapEnabled)
  const snapEnabled = useCadStore((state) => state.snapEnabled)
  const toggleSnap = useCadStore((state) => state.toggleSnap)
  const polarEnabled = useCadStore((state) => state.polarEnabled)
  const orthoEnabled = useCadStore((state) => state.orthoEnabled)
  const lwDisplay = useCadStore((state) => state.lwDisplay)
  const toggleOsnap = useCadStore((state) => state.toggleOsnap)
  const togglePolar = useCadStore((state) => state.togglePolar)
  const toggleOrtho = useCadStore((state) => state.toggleOrtho)
  const toggleLwDisplay = useCadStore((state) => state.toggleLwDisplay)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const toggle = TOGGLE_KEYS[event.key]
      if (!toggle) return
      event.preventDefault()
      if (toggle === 'osnap') toggleOsnap()
      if (toggle === 'ortho') toggleOrtho()
      if (toggle === 'polar') togglePolar()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleOrtho, toggleOsnap, togglePolar])

  return (
    <footer className="statusbar">
      <span className="statusbar-coords">
        {cursorWorld ? formatPoint(cursorWorld, camera.zoom) : '—, —'}
      </span>
      <span className="statusbar-message">{statusMessage}</span>
      <span className="statusbar-spacer" />

      <button
        type="button"
        className={`statusbar-toggle ${snapEnabled ? 'on' : ''}`}
        onClick={toggleSnap}
        title="Snap the cursor to the grid (F9 in AutoCAD)"
      >
        SNAP
      </button>
      <button
        type="button"
        className={`statusbar-toggle ${orthoEnabled ? 'on' : ''}`}
        onClick={toggleOrtho}
        title="Orthogonal tracking (F8)"
      >
        ORTHO
      </button>
      <button
        type="button"
        className={`statusbar-toggle ${polarEnabled ? 'on' : ''}`}
        onClick={togglePolar}
        title="Polar tracking (F10)"
      >
        POLAR
      </button>
      <button
        type="button"
        className={`statusbar-toggle ${osnapEnabled ? 'on' : ''}`}
        onClick={toggleOsnap}
        title="Object snap (F3)"
      >
        OSNAP
      </button>
      <button
        type="button"
        className={`statusbar-toggle ${lwDisplay ? 'on' : ''}`}
        onClick={toggleLwDisplay}
        title="Show each layer's plotted lineweight"
      >
        LWT
      </button>

      <span className="statusbar-facts">
        {doc.entities.length} objects · {selectedIds.length} selected · {formatZoom(camera.zoom)} · {doc.units}
      </span>
    </footer>
  )
}
