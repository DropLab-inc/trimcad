import type { HatchPattern } from './types'

/**
 * Hatch pattern names and the drawing options that pin one down, kept next to the entity so the
 * ribbon, properties panel and renderer all agree on what a hatch can be.
 */

export const HATCH_PATTERNS: HatchPattern[] = ['ansi31', 'ansi37', 'dots', 'net', 'line', 'solid']

export const HATCH_PATTERN_LABELS: Record<HatchPattern, string> = {
  ansi31: 'ANSI31',
  ansi37: 'ANSI37',
  dots: 'Dots',
  net: 'Net',
  line: 'Line',
  solid: 'Solid',
}

/** Built-in tilt of each pattern before the user angle is added, matching the usual AutoCAD look. */
export const hatchBaseAngle = (pattern: HatchPattern): number => (pattern === 'ansi31' ? 45 : 0)

/** Tile size in drawing units for a pattern at the given scale. */
export const hatchTileSize = (pattern: HatchPattern, scale: number): number => {
  const size = Number.isFinite(scale) && scale > 0 ? scale : 1
  const base = pattern === 'dots' ? 6 : 8
  return Math.max(0.25, base * size)
}

export const nextHatchPattern = (current: HatchPattern): HatchPattern => {
  const index = HATCH_PATTERNS.indexOf(current)
  return HATCH_PATTERNS[(index + 1) % HATCH_PATTERNS.length]
}

export const clampHatchScale = (scale: number): number =>
  Number.isFinite(scale) && scale > 0 ? Math.min(1000, scale) : 1

export const clampHatchAngle = (angle: number): number => {
  if (!Number.isFinite(angle)) return 0
  let next = angle % 360
  if (next < 0) next += 360
  return next
}
