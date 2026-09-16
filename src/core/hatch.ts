import type { HatchPattern } from './types'

/**
 * Hatch pattern names and the drawing options that pin one down, kept next to the entity so the
 * ribbon, properties panel and renderer all agree on what a hatch can be.
 *
 * The names are AutoCAD's, because a file that says `ANSI31` or `AR-SAND` has to come back as that
 * pattern and a drafter has to be able to ask for it by the name they know. The geometry behind each
 * one is a TILE — a small repeating unit — rather than AutoCAD's line families, so the patterns are
 * the standard ones in angle, spacing and look, not a byte-for-byte replay of `acad.pat`. Where a
 * standard pattern is a line family we cannot express as a tile (a honeycomb, a true brick bond with
 * mortar, earth, grass, stars) it is NOT offered rather than offered and drawn as something else.
 *
 * Which standard pattern is which family, from the definitions in `acad.pat`:
 *
 * - ANSI31 one 45° run of lines; ANSI37 two families at 45° and 135°, which is the crosshatch.
 * - ANSI32 and ANSI34 are DASHED at 45°, and it is the dashes that read as the familiar double line;
 *   ANSI35, ANSI36 and ANSI38 pair a dashed family with a solid one.
 * - AR-SAND and DOTS are dots; NET, GRID and CROSS are the 0°/90° grid; LINE is one run of lines.
 */
export const HATCH_PATTERNS: HatchPattern[] = [
  'ansi31',
  'ansi32',
  'ansi33',
  'ansi34',
  'ansi35',
  'ansi36',
  'ansi37',
  'ansi38',
  'dots',
  'sand',
  'net',
  'cross',
  'grid',
  'line',
  'brick',
  'solid',
]

export const HATCH_PATTERN_LABELS: Record<HatchPattern, string> = {
  ansi31: 'ANSI31 — steel, one 45° run',
  ansi32: 'ANSI32 — 45° dashed',
  ansi33: 'ANSI33 — 45° crosshatch',
  ansi34: 'ANSI34 — 45° dashed, wide',
  ansi35: 'ANSI35 — 45° crosshatch, dashed',
  ansi36: 'ANSI36 — 45° crosshatch, dashed the other way',
  ansi37: 'ANSI37 — crosshatch',
  ansi38: 'ANSI38 — crosshatch, dashed',
  dots: 'DOTS — dot fill',
  sand: 'AR-SAND — sand',
  net: 'NET — square net',
  cross: 'CROSS — square net, fine',
  grid: 'GRID — square grid',
  line: 'LINE — parallel lines',
  brick: 'BRICK — running bond',
  solid: 'SOLID — filled',
}

/** How a pattern is drawn inside its tile. Several AutoCAD names share one of these. */
export type HatchFamily =
  | 'single'
  | 'dashed'
  | 'cross'
  | 'crossDashed'
  | 'dots'
  | 'grid'
  | 'line'
  | 'brick'
  | 'solid'

const FAMILIES: Record<HatchPattern, HatchFamily> = {
  ansi31: 'single',
  ansi32: 'dashed',
  ansi33: 'cross',
  ansi34: 'dashed',
  ansi35: 'crossDashed',
  ansi36: 'crossDashed',
  ansi37: 'cross',
  ansi38: 'crossDashed',
  dots: 'dots',
  sand: 'dots',
  net: 'grid',
  cross: 'grid',
  grid: 'grid',
  line: 'line',
  brick: 'brick',
  solid: 'solid',
}

export const hatchFamily = (pattern: HatchPattern): HatchFamily => FAMILIES[pattern] ?? 'single'

/** Built-in tilt of each pattern before the user angle is added, matching the usual AutoCAD look. */
export const hatchBaseAngle = (pattern: HatchPattern): number =>
  /^ansi3[1-8]$/.test(pattern) ? 45 : 0

/** Tile size in drawing units for a pattern at the given scale. */
export const hatchTileSize = (pattern: HatchPattern, scale: number): number => {
  const size = Number.isFinite(scale) && scale > 0 ? scale : 1
  const family = hatchFamily(pattern)
  // A dot fill and a sand fill read as a stipple only when they are denser than a line pattern.
  const base = family === 'dots' ? 6 : family === 'brick' ? 8 : 8
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
