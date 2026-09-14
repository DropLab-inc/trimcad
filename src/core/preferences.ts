/**
 * The settings AutoCAD keeps in its OPTIONS dialog: how big the pick box is, how the cursor
 * behaves, how a selection window is drawn out. They belong to the person rather than to the
 * drawing, so they live here and in localStorage rather than in the document.
 *
 * The store reads them straight through `getPreferences()` while a command runs, and the interface
 * subscribes with `usePreferences()` so a change to the pick box shows up under the cursor at once.
 */
import { useSyncExternalStore } from 'react'

/**
 * How a selection window is drawn out, which AutoCAD keeps in PICKDRAG.
 * - `drag`: hold the button down and drag the far corner out, then let go.
 * - `click`: click one corner, then click the other, with nothing held in between.
 * - `both`: either, worked out from what you do. This is AutoCAD's default.
 */
export type WindowSelectionMode = 'drag' | 'click' | 'both'

export type Preferences = {
  // ---- Selection ----
  /** AutoCAD's PICKBOX: how near a click has to land, in screen pixels, to catch an object. */
  pickBoxSize: number
  /** AutoCAD's GRIPSIZE: how wide the little squares on a selected object are drawn. */
  gripSize: number
  /** AutoCAD's PICKDRAG: how the two corners of a selection window are given. */
  windowSelection: WindowSelectionMode
  /** AutoCAD's PICKADD, inverted: when on, a plain click replaces the selection and Shift adds to
   *  it. When off, every click adds, and only Escape clears. */
  shiftToAdd: boolean

  // ---- Drafting ----
  /** AutoCAD's APERTURE: how near the cursor has to be for object snap to take hold. */
  apertureSize: number
  /** AutoCAD's POLARANG: the angle polar tracking snaps to, and its multiples. */
  polarAngle: number
  /** How large the snap marker is drawn under the cursor. */
  snapMarkerSize: number

  // ---- Display ----
  /** AutoCAD's CURSORSIZE: how far the crosshair reaches, as a percentage of the screen. */
  crosshairSize: number
  /** Whether the background grid is drawn at all. */
  showGrid: boolean

  // ---- Modify ----
  /**
   * AutoCAD's "optimize segments within polylines". When on, JOIN and OVERKILL look at each
   * segment of a polyline rather than at the shape as a whole.
   */
  polylineSegments: boolean
  /** How far apart two points may be and still count as the same one, for JOIN and OVERKILL. */
  geometryTolerance: number

  // ---- Files ----
  /** Whether work in progress is kept in the browser so it survives a crash. */
  autosave: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  pickBoxSize: 8,
  gripSize: 7,
  windowSelection: 'both',
  shiftToAdd: true,
  apertureSize: 12,
  polarAngle: 45,
  snapMarkerSize: 7,
  crosshairSize: 100,
  showGrid: true,
  polylineSegments: true,
  geometryTolerance: 1e-6,
  autosave: true,
}

/** The range each number may take, so a typed value cannot make the interface unusable. */
const LIMITS: Record<string, { min: number; max: number }> = {
  pickBoxSize: { min: 1, max: 40 },
  gripSize: { min: 1, max: 40 },
  apertureSize: { min: 1, max: 60 },
  polarAngle: { min: 1, max: 90 },
  snapMarkerSize: { min: 2, max: 30 },
  crosshairSize: { min: 1, max: 100 },
  geometryTolerance: { min: 1e-12, max: 1 },
}

const clamp = (key: string, value: number): number => {
  const limit = LIMITS[key]
  if (!limit || !Number.isFinite(value)) return DEFAULT_PREFERENCES[key as keyof Preferences] as number
  return Math.min(limit.max, Math.max(limit.min, value))
}

const PREFERENCES_KEY = 'trimcad.preferences.v1'
const LEGACY_PREFERENCES_KEY = 'droplabcad.preferences.v1'

/**
 * Reads what was stored, keeping only the keys that are still preferences and only the values that
 * are still the right shape. A file left behind by an older version is then harmless.
 */
export const mergeStored = (stored: unknown): Preferences => {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFERENCES }
  const source = stored as Record<string, unknown>
  const merged = { ...DEFAULT_PREFERENCES }

  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
    const value = source[key]
    const fallback = DEFAULT_PREFERENCES[key]
    if (typeof fallback === 'number' && typeof value === 'number') {
      ;(merged[key] as number) = clamp(key, value)
    } else if (typeof fallback === 'boolean' && typeof value === 'boolean') {
      ;(merged[key] as boolean) = value
    } else if (key === 'windowSelection' && (value === 'drag' || value === 'click' || value === 'both')) {
      merged.windowSelection = value
    }
  }
  return merged
}

let current: Preferences = { ...DEFAULT_PREFERENCES }
const listeners = new Set<() => void>()

const announce = () => {
  for (const listener of listeners) listener()
}

const persist = () => {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(current))
  } catch {
    // A browser with storage switched off can still change settings; they just will not be kept.
  }
}

/** Called once as the app starts, before anything reads a preference. */
export const initPreferences = () => {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY) ?? localStorage.getItem(LEGACY_PREFERENCES_KEY)
    current = mergeStored(raw ? JSON.parse(raw) : null)
  } catch {
    current = { ...DEFAULT_PREFERENCES }
  }
  announce()
}

export const getPreferences = (): Preferences => current

export const setPreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
  const next = typeof value === 'number' ? (clamp(key, value) as Preferences[K]) : value
  if (current[key] === next) return
  current = { ...current, [key]: next }
  persist()
  announce()
}

export const resetPreferences = () => {
  current = { ...DEFAULT_PREFERENCES }
  persist()
  announce()
}

/** Runs `listener` whenever a setting changes, and returns the way to stop listening. */
export const subscribeToPreferences = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const subscribe = subscribeToPreferences

const snapshot = (): Preferences => current

/** Subscribes a component to the settings, so changing one repaints whatever depends on it. */
export const usePreferences = (): Preferences => useSyncExternalStore(subscribe, snapshot, snapshot)
