import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'

const WIDTH_KEY = 'trimcad.sidebar-width'
const MIN_WIDTH = 240
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 320

const clampTo = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

const readStored = (key: string, fallback: number, min: number, max: number): number => {
  try {
    const stored = Number(localStorage.getItem(key))
    return Number.isFinite(stored) && stored > 0 ? clampTo(stored, min, max) : fallback
  } catch {
    return fallback
  }
}

const remember = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // A browser with storage switched off can still resize; it just will not be remembered.
  }
}

/**
 * Runs a drag on the window rather than the handle, so the pointer can pass over the canvas or a
 * text field without the drag being interrupted.
 */
const trackDrag = (onMove: (event: PointerEvent) => void, onDone: () => void, cursor: string) => {
  const move = (event: PointerEvent) => onMove(event)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    document.body.classList.remove(cursor)
    onDone()
  }

  document.body.classList.add(cursor)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/**
 * Width of the docked panels, dragged by the divider beside the drawing area and remembered
 * between visits.
 */
export const useSidebarWidth = () => {
  const [width, setWidth] = useState(() => readStored(WIDTH_KEY, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH))

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    let latest = 0
    trackDrag(
      (move) => {
        // The panels are docked right, so the width is whatever is left of the window edge.
        latest = clampTo(window.innerWidth - move.clientX, MIN_WIDTH, MAX_WIDTH)
        setWidth(latest)
      },
      () => latest > 0 && remember(WIDTH_KEY, latest),
      'resizing-sidebar',
    )
  }, [])

  return { width, startResize }
}

/**
 * Height of a panel that can grow, so a drawing with many layers can show more of them without
 * squeezing out the panels below.
 */
export const usePanelHeight = (key: string, defaultHeight: number, min = 80, max = 600) => {
  const storageKey = `trimcad.panel-height.${key}`
  const [height, setHeight] = useState(() => readStored(storageKey, defaultHeight, min, max))

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault()
      const startY = event.clientY
      let latest = height

      trackDrag(
        (move) => {
          latest = clampTo(height + (move.clientY - startY), min, max)
          setHeight(latest)
        },
        () => remember(storageKey, latest),
        'resizing-panel',
      )
    },
    [height, min, max, storageKey],
  )

  return { height, startResize }
}
