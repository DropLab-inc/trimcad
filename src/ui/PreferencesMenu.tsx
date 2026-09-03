import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_PREFERENCES,
  resetPreferences,
  setPreference,
  usePreferences,
  type Preferences,
  type WindowSelectionMode,
} from '../core/preferences'
import { useTheme } from './theme'

/** One row of the panel, described by which preference it edits and how it should read. */
type Row =
  | { kind: 'number'; key: NumberKey; label: string; hint: string; min: number; max: number; step: number }
  | { kind: 'toggle'; key: BooleanKey; label: string; hint: string }
  | { kind: 'choice'; key: 'windowSelection'; label: string; hint: string; options: { value: WindowSelectionMode; label: string }[] }
  | { kind: 'angle'; key: 'polarAngle'; label: string; hint: string }

type NumberKey = {
  [K in keyof Preferences]: Preferences[K] extends number ? K : never
}[keyof Preferences]

type BooleanKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never
}[keyof Preferences]

/** The angles AutoCAD offers for polar tracking, which all divide a full turn evenly. */
const POLAR_ANGLES = [90, 45, 30, 22.5, 15, 10, 5]

const groups: { title: string; rows: Row[] }[] = [
  {
    title: 'Selection',
    rows: [
      {
        kind: 'choice',
        key: 'windowSelection',
        label: 'Window selection',
        hint: "How the two corners of a selection window are given. AutoCAD keeps this in PICKDRAG.",
        options: [
          { value: 'both', label: 'Click twice or drag' },
          { value: 'click', label: 'Click one corner, then the other' },
          { value: 'drag', label: 'Press and drag only' },
        ],
      },
      {
        kind: 'number',
        key: 'pickBoxSize',
        label: 'Pick box size',
        hint: 'How near a click has to land to catch an object, in screen pixels. AutoCAD calls this PICKBOX.',
        min: 1,
        max: 40,
        step: 1,
      },
      {
        kind: 'number',
        key: 'gripSize',
        label: 'Grip size',
        hint: 'How wide the handles on a selected object are drawn. AutoCAD calls this GRIPSIZE.',
        min: 1,
        max: 40,
        step: 1,
      },
      {
        kind: 'toggle',
        key: 'shiftToAdd',
        label: 'Use Shift to add to selection',
        hint: 'On, a click replaces the selection and Shift adds to it. Off, every click adds, and Escape clears.',
      },
    ],
  },
  {
    title: 'Drafting',
    rows: [
      {
        kind: 'number',
        key: 'apertureSize',
        label: 'Snap aperture',
        hint: 'How near the cursor has to be for object snap to take hold. AutoCAD calls this APERTURE.',
        min: 1,
        max: 60,
        step: 1,
      },
      {
        kind: 'number',
        key: 'snapMarkerSize',
        label: 'Snap marker size',
        hint: 'How large the glyph that names the snap is drawn under the cursor.',
        min: 2,
        max: 30,
        step: 1,
      },
      {
        kind: 'angle',
        key: 'polarAngle',
        label: 'Polar tracking angle',
        hint: 'The angle polar tracking holds to, and its multiples. AutoCAD calls this POLARANG.',
      },
    ],
  },
  {
    title: 'Display',
    rows: [
      {
        kind: 'number',
        key: 'crosshairSize',
        label: 'Crosshair size',
        hint: 'How far the crosshair reaches, as a percentage of the screen. 100 gives full-width arms.',
        min: 1,
        max: 100,
        step: 1,
      },
      { kind: 'toggle', key: 'showGrid', label: 'Show grid', hint: 'Whether the background grid is drawn.' },
    ],
  },
  {
    title: 'Modify',
    rows: [
      {
        kind: 'toggle',
        key: 'polylineSegments',
        label: 'Read polylines as their lines',
        hint: 'JOIN and OVERKILL look at each segment of a polyline, rectangle or polygon rather than at the whole shape.',
      },
    ],
  },
  {
    title: 'Files',
    rows: [
      {
        kind: 'toggle',
        key: 'autosave',
        label: 'Keep unsaved work in the browser',
        hint: 'Lets the drawing be recovered after a crash. Turn it off to stop being asked about earlier work.',
      },
    ],
  },
]

export function PreferencesMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const preferences = usePreferences()
  const { theme, setTheme } = useTheme()

  // Clicking anywhere else, or pressing Escape, puts the panel away.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const renderRow = (row: Row) => {
    switch (row.kind) {
      case 'toggle':
        return (
          <input
            type="checkbox"
            checked={preferences[row.key]}
            onChange={(event) => setPreference(row.key, event.target.checked)}
          />
        )
      case 'number':
        return (
          <input
            type="number"
            min={row.min}
            max={row.max}
            step={row.step}
            value={preferences[row.key]}
            onChange={(event) => setPreference(row.key, Number(event.target.value))}
          />
        )
      case 'angle':
        return (
          <select value={preferences.polarAngle} onChange={(event) => setPreference('polarAngle', Number(event.target.value))}>
            {POLAR_ANGLES.map((angle) => (
              <option key={angle} value={angle}>
                {angle}°
              </option>
            ))}
          </select>
        )
      case 'choice':
        return (
          <select
            value={preferences.windowSelection}
            onChange={(event) => setPreference('windowSelection', event.target.value as WindowSelectionMode)}
          >
            {row.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )
    }
  }

  const changedFromDefault = (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).some(
    (key) => preferences[key] !== DEFAULT_PREFERENCES[key],
  )

  return (
    <div className="file-menu" ref={menuRef}>
      <button
        type="button"
        className={`file-menu-button ${open ? 'active' : ''}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Preferences
      </button>

      {open && (
        <div className="file-menu-popup preferences-popup" role="menu" aria-label="Preferences">
          {groups.map((group) => (
            <section className="preferences-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.rows.map((row) => (
                <label className="preferences-row" key={row.key} title={row.hint}>
                  <span className="preferences-label">{row.label}</span>
                  {renderRow(row)}
                </label>
              ))}
            </section>
          ))}

          <section className="preferences-group">
            <h3>Appearance</h3>
            <label className="preferences-row" title="Which of the two colour schemes the interface uses.">
              <span className="preferences-label">Theme</span>
              <select value={theme} onChange={(event) => setTheme(event.target.value === 'light' ? 'light' : 'dark')}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </section>

          <div className="preferences-footer">
            <button type="button" onClick={resetPreferences} disabled={!changedFromDefault}>
              Restore defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
