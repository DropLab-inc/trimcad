import { polar } from './geometry'
import type { Vec2 } from './math/vec2'
import type { ToolMode } from './types'

/**
 * Dynamic input: the editable fields that follow the crosshair while a command is running.
 *
 * Typing replaces the value the cursor would supply, Tab moves to the next field, and Enter
 * commits the point. A field the user has typed into is "locked" and stops tracking the cursor,
 * which is what lets you draw a line of exactly 250 at exactly 30 degrees.
 */

export type DynamicField = {
  key: string
  label: string
  /** Value derived from the cursor, shown when the user has not typed anything. */
  tracked: number
  /** What the user typed, if anything. */
  typed?: string
  suffix?: string
}

export type DynamicInputState = {
  fields: DynamicField[]
  activeIndex: number
}

const round = (value: number): number => Math.round(value * 1000) / 1000

const lengthAngleFields = (base: Vec2, cursor: Vec2): DynamicField[] => {
  const dx = cursor.x - base.x
  const dy = cursor.y - base.y
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  return [
    { key: 'length', label: 'Length', tracked: round(Math.hypot(dx, dy)) },
    { key: 'angle', label: 'Angle', tracked: round((angle + 360) % 360), suffix: '\u00b0' },
  ]
}

/** The fields a tool offers at its current step, or null when it takes no dimensioned input. */
export const fieldsForTool = (tool: ToolMode, draftPoints: Vec2[], cursor: Vec2): DynamicField[] | null => {
  const base = draftPoints.at(-1)
  const first = draftPoints[0]

  switch (tool) {
    case 'line':
    case 'polyline':
    case 'spline':
      return base ? lengthAngleFields(base, cursor) : null
    case 'mirror':
      return base ? lengthAngleFields(base, cursor) : null
    case 'circle':
      return first ? [{ key: 'radius', label: 'Radius', tracked: round(Math.hypot(cursor.x - first.x, cursor.y - first.y)) }] : null
    case 'polygon':
      return first ? [{ key: 'radius', label: 'Radius', tracked: round(Math.hypot(cursor.x - first.x, cursor.y - first.y)) }] : null
    case 'rect':
      return first
        ? [
            { key: 'width', label: 'Width', tracked: round(Math.abs(cursor.x - first.x)) },
            { key: 'height', label: 'Height', tracked: round(Math.abs(cursor.y - first.y)) },
          ]
        : null
    case 'ellipse':
      return first
        ? [
            { key: 'rx', label: 'X radius', tracked: round(Math.abs(cursor.x - first.x)) },
            { key: 'ry', label: 'Y radius', tracked: round(Math.abs(cursor.y - first.y)) },
          ]
        : null
    case 'arc':
      if (draftPoints.length === 1) {
        return [{ key: 'radius', label: 'Radius', tracked: round(Math.hypot(cursor.x - first.x, cursor.y - first.y)) }]
      }
      if (draftPoints.length >= 2) {
        const angle = (Math.atan2(cursor.y - first.y, cursor.x - first.x) * 180) / Math.PI
        return [{ key: 'angle', label: 'Angle', tracked: round((angle + 360) % 360), suffix: '\u00b0' }]
      }
      return null
    default:
      return null
  }
}

const valueOf = (field: DynamicField): number => {
  if (field.typed === undefined || field.typed.trim() === '') return field.tracked
  const parsed = Number(field.typed)
  return Number.isFinite(parsed) ? parsed : field.tracked
}

export const hasTypedValue = (fields: DynamicField[]): boolean =>
  fields.some((field) => field.typed !== undefined && field.typed.trim() !== '')

/**
 * Converts the current field values into the world point the command should use. Fields the user
 * has not typed into keep following the cursor.
 */
export const resolveDynamicPoint = (
  tool: ToolMode,
  fields: DynamicField[],
  draftPoints: Vec2[],
  cursor: Vec2,
): Vec2 => {
  const base = draftPoints.at(-1) ?? cursor
  const first = draftPoints[0] ?? cursor
  const byKey = (key: string) => fields.find((field) => field.key === key)

  switch (tool) {
    case 'line':
    case 'polyline':
    case 'spline':
    case 'mirror': {
      const length = byKey('length')
      const angle = byKey('angle')
      if (!length || !angle) return cursor
      return polar(base, valueOf(length), (valueOf(angle) * Math.PI) / 180)
    }
    case 'circle':
    case 'polygon': {
      const radius = byKey('radius')
      if (!radius) return cursor
      const direction = Math.atan2(cursor.y - first.y, cursor.x - first.x)
      return polar(first, valueOf(radius), direction)
    }
    case 'rect': {
      const width = byKey('width')
      const height = byKey('height')
      if (!width || !height) return cursor
      return {
        x: first.x + Math.sign(cursor.x - first.x || 1) * valueOf(width),
        y: first.y + Math.sign(cursor.y - first.y || 1) * valueOf(height),
      }
    }
    case 'ellipse': {
      const rx = byKey('rx')
      const ry = byKey('ry')
      if (!rx || !ry) return cursor
      return {
        x: first.x + Math.sign(cursor.x - first.x || 1) * valueOf(rx),
        y: first.y + Math.sign(cursor.y - first.y || 1) * valueOf(ry),
      }
    }
    case 'arc': {
      const radius = byKey('radius')
      if (radius) {
        const direction = Math.atan2(cursor.y - first.y, cursor.x - first.x)
        return polar(first, valueOf(radius), direction)
      }
      const angle = byKey('angle')
      if (angle) {
        const currentRadius = Math.hypot(draftPoints[1].x - first.x, draftPoints[1].y - first.y)
        return polar(first, currentRadius, (valueOf(angle) * Math.PI) / 180)
      }
      return cursor
    }
    default:
      return cursor
  }
}

/**
 * Parses text typed at the command line into a point.
 * `50,30` is absolute, `@50,30` is relative to the last point, and `@250<30` is polar.
 */
export const parseCoordinate = (text: string, lastPoint: Vec2 | undefined): Vec2 | null => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const relative = trimmed.startsWith('@')
  const body = relative ? trimmed.slice(1) : trimmed
  const base = relative ? (lastPoint ?? { x: 0, y: 0 }) : { x: 0, y: 0 }

  if (body.includes('<')) {
    const [distanceText, angleText] = body.split('<')
    const distance = Number(distanceText)
    const angle = Number(angleText)
    if (!Number.isFinite(distance) || !Number.isFinite(angle)) return null
    const origin = relative ? base : (lastPoint ?? { x: 0, y: 0 })
    return polar(origin, distance, (angle * Math.PI) / 180)
  }

  if (body.includes(',')) {
    const [xText, yText] = body.split(',')
    const x = Number(xText)
    const y = Number(yText)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x: base.x + x, y: base.y + y }
  }

  return null
}
