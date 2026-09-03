import { useSyncExternalStore } from 'react'

export type ThemeName = 'dark' | 'light'

/**
 * The drawing area is painted by hand rather than by the stylesheet, so it needs its colours as
 * values rather than CSS variables. These mirror the `--canvas-*` tokens in `index.css`.
 */
export type CanvasPalette = {
  background: string
  gridMinor: string
  gridMajor: string
  axisX: string
  axisY: string
  /** Stands in for a layer coloured plain white or black, which would otherwise be invisible. */
  contrast: string
  /** Work in progress: rubber bands, ghosts and the shape under the cursor. */
  preview: string
  /** The half of a pick that will be kept, or an edge that will be extended. */
  confirm: string
  /** The half that will be cut away. */
  reject: string
  /** Picks out whatever is currently selected. */
  selection: string
  /** Dimensions are drawn apart from the geometry they measure, as AutoCAD does. */
  dimension: string
  hatch: string
  hatchSolid: string
  snap: string
  crosshair: string
  handle: string
  handleEdge: string
  windowSelect: string
  windowFill: string
  crossingSelect: string
  crossingFill: string
  hint: string
  typed: string
  /** Behind the readout that follows the cursor. */
  tooltipBackground: string
  /** Drawn when a layer has no colour of its own. */
  fallbackEntity: string
}

export const canvasPalettes: Record<ThemeName, CanvasPalette> = {
  dark: {
    background: '#0a1319',
    gridMinor: 'rgba(83, 176, 187, 0.10)',
    gridMajor: 'rgba(83, 176, 187, 0.22)',
    axisX: 'rgba(224, 92, 92, 0.38)',
    axisY: 'rgba(74, 190, 122, 0.38)',
    contrast: '#f1f7f8',
    preview: '#f0a92b',
    confirm: '#4ade80',
    reject: '#f87171',
    selection: '#ffd166',
    dimension: '#f9c74f',
    hatch: '#5fb6c0',
    hatchSolid: 'rgba(95, 182, 192, 0.32)',
    snap: '#35c8d2',
    crosshair: 'rgba(215, 228, 232, 0.35)',
    handle: '#35c8d2',
    handleEdge: '#0a1319',
    windowSelect: '#35c8d2',
    windowFill: 'rgba(53, 200, 210, 0.14)',
    crossingSelect: '#4ade80',
    crossingFill: 'rgba(74, 222, 128, 0.14)',
    hint: '#8aa3ad',
    typed: '#fbbf24',
    tooltipBackground: 'rgba(10, 19, 25, 0.92)',
    fallbackEntity: '#7fd8e0',
  },
  light: {
    background: '#ffffff',
    gridMinor: 'rgba(20, 143, 155, 0.12)',
    gridMajor: 'rgba(20, 143, 155, 0.26)',
    axisX: 'rgba(192, 57, 43, 0.45)',
    axisY: 'rgba(31, 122, 69, 0.45)',
    contrast: '#0c161d',
    preview: '#b9700a',
    confirm: '#15803d',
    reject: '#c0392b',
    selection: '#c2410c',
    dimension: '#a16207',
    hatch: '#3f8f99',
    hatchSolid: 'rgba(63, 143, 153, 0.24)',
    snap: '#0d6f78',
    crosshair: 'rgba(36, 52, 62, 0.40)',
    handle: '#148f9b',
    handleEdge: '#ffffff',
    windowSelect: '#148f9b',
    windowFill: 'rgba(20, 143, 155, 0.12)',
    crossingSelect: '#15803d',
    crossingFill: 'rgba(21, 128, 61, 0.12)',
    hint: '#5a6c76',
    typed: '#b9700a',
    tooltipBackground: 'rgba(255, 255, 255, 0.94)',
    fallbackEntity: '#0f7f8a',
  },
}

/**
 * AutoCAD draws its colour 7 white on a dark background and black on a light one, so a drawing
 * reads either way round. Every other colour is left exactly as the layer asked for it.
 */
export const readableOnCanvas = (color: string, palette: CanvasPalette): string => {
  const plain = color.trim().toLowerCase()
  const isPlain = plain === '#fff' || plain === '#ffffff' || plain === '#000' || plain === '#000000'
  return isPlain ? palette.contrast : color
}

const THEME_KEY = 'droplabcad.theme'

const prefersLight = (): boolean => {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches
  } catch {
    return false
  }
}

const readStoredTheme = (): ThemeName | null => {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  } catch {
    return null
  }
}

/** What to start in: whatever was chosen last time, else whatever the system is set to. */
export const preferredTheme = (): ThemeName => readStoredTheme() ?? (prefersLight() ? 'light' : 'dark')

/** The stylesheet keys its light values off this attribute, so setting it repaints the interface. */
export const applyTheme = (theme: ThemeName) => {
  document.documentElement.dataset.theme = theme
}

let current: ThemeName = 'dark'
const listeners = new Set<() => void>()

export const setTheme = (theme: ThemeName) => {
  if (theme === current) return
  current = theme
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // A browser with storage switched off can still switch theme; it just will not be remembered.
  }
  for (const listener of listeners) listener()
}

/** Called once as the app starts, before anything reads the theme. */
export const initTheme = () => {
  current = preferredTheme()
  applyTheme(current)
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): ThemeName => current

export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, snapshot, snapshot)
  return {
    theme,
    palette: canvasPalettes[theme],
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  }
}

/** For the drawing code, which wants the colours but not the setters. */
export const useCanvasPalette = (): CanvasPalette => canvasPalettes[useSyncExternalStore(subscribe, snapshot, snapshot)]
