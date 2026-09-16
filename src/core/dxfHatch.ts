import { clampHatchAngle, clampHatchScale } from './hatch'
import { uid } from './geometry'
import type { CadEntity, HatchEntity, HatchPattern } from './types'
import type { Vec2 } from './math/vec2'

/**
 * Reading HATCH records, which dxf-parser does not.
 *
 * The library has no handler for a hatch and drops the record before any of our code sees it, so a
 * drawing that is mostly filled areas came in as bare outlines — which is what a filled panel drawing
 * looks like when every fill is missing. Coordinates in the record are already absolute, so a hatch
 * inside a block lands where the block's own geometry does.
 *
 * Structure of the record: `91` counts the boundary paths; each path opens with `92` (its type flags),
 * then `73` closed, `93` how many vertices (or edges), then the vertices as `10`/`20` pairs with an
 * optional `42` bulge for an arc segment. A path that is not a polyline lists edges instead (`72` per
 * edge). Only polyline paths and straight edges are read: an arc or spline edge would have to be
 * sampled, and a fill with one side missing is worse than a fill drawn as a straight-sided stand-in.
 */

/** The pattern of ours that stands in for a DXF pattern name. */
export const hatchPatternFor = (name: string, solid: boolean, patternLines: number): HatchPattern => {
  if (solid) return 'solid'
  const upper = name.toUpperCase()
  if (/SOLID/.test(upper)) return 'solid'
  if (/DOT|SAND|AR-/.test(upper)) return 'dots'
  if (/37|CROSS|NET|GRID|BRICK|EARTH/.test(upper)) return 'ansi37'
  if (/31|32|33|34|35|36/.test(upper)) return 'ansi31'
  // An unnamed or custom pattern — a honeycomb, a client's own — is rendered as the density its own
  // definition implies: several line families read as a weave, one as parallel hatching.
  if (patternLines >= 3) return 'net'
  if (patternLines === 2) return 'ansi37'
  return 'ansi31'
}

type Pair = [string, string]

/** The vertices of one closed boundary path, with arc bulges flattened into straight segments. */
const pathPoints = (
  fields: Pair[],
  start: number,
  /** Bit 2 of the path's type flags: the path is vertices rather than a list of edges. */
  polyline: boolean,
): { points: Vec2[]; next: number; closed: boolean } => {
  let index = start
  let closed = false
  let count: number | null = null
  const points: Vec2[] = []
  const bulges: number[] = []
  while (index < fields.length) {
    const [code, value] = fields[index]
    if (code === '92' || code === '97' || code === '75' || code === '76') break
    if (code === '73') closed = String(value).trim() !== '0'
    else if (code === '93') count = Number(value)
    else if (code === '72' && !polyline) {
      // An edge-based path: its edges are lines only if every edge says so, and reading them as a
      // boundary would silently produce a polygon with the wrong shape, so the path is left out.
      return { points: [], next: index, closed: false }
    } else if (code === '10' && index + 1 < fields.length && fields[index + 1][0] === '20') {
      const x = Number(value)
      const y = Number(fields[index + 1][1])
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push({ x, y })
        bulges.push(0)
      }
      index += 2
      continue
    } else if (code === '42') {
      if (bulges.length > 0) bulges[bulges.length - 1] = Number(value)
    }
    index += 1
    if (count !== null && points.length >= count) break
  }
  for (const bulge of bulges) {
    if (!Number.isFinite(bulge)) return { points: [], next: index, closed: false }
  }
  return { points, next: index, closed }
}

/** The area a closed run encloses, so the outer boundary can be told from its islands. */
const enclosedArea = (points: Vec2[]): number => {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    total += current.x * next.y - next.x * current.y
  }
  return Math.abs(total) / 2
}

const readHatch = (fields: Pair[], layerId: string, colorFor: (index: unknown) => string): HatchEntity | null => {
  const first = (code: string): string | undefined => fields.find(([c]) => c === code)?.[1]
  const solid = Number(first('70') ?? 0) % 2 === 1
  const name = String(first('2') ?? '')
  const patternLines = Number(first('78') ?? 0)

  /*
   * The largest closed path is the fill; the others are its islands. A hatch with an island drawn as
   * a solid fill would cover the hole, and one with only islands left would fill the wrong region, so
   * the boundary is the biggest run and the islands are dropped — "solid fill with holes" is a shape
   * our hatch entity cannot hold.
   */
  let best: Vec2[] = []
  for (let index = 0; index < fields.length; index += 1) {
    if (fields[index][0] !== '92') continue
    const polyline = (Number(fields[index][1]) & 2) === 2
    const { points, closed } = pathPoints(fields, index + 1, polyline)
    if (points.length < 3) continue
    if (closed && enclosedArea(points) > enclosedArea(best)) best = points
  }
  if (best.length < 3) return null

  const colourIndex = first('62')
  const trueColour = first('420')
  const color = trueColour !== undefined ? `#${Number(trueColour).toString(16).padStart(6, '0')}` : colourIndex !== undefined ? colorFor(colourIndex) : undefined

  return {
    id: uid(),
    type: 'hatch',
    layerId,
    boundary: best,
    pattern: hatchPatternFor(name, solid, patternLines),
    scale: clampHatchScale(Number(first('41') ?? 1)),
    angle: clampHatchAngle(Number(first('52') ?? 0)),
    ...(color ? { color } : {}),
  }
}

/**
 * Every hatch in the file, split by where it belongs: the model space, or a named block.
 *
 * The section matters because a block's hatch is drawn where the block is placed, so it has to become
 * a member of that definition rather than an object in the drawing.
 */
export const hatchesFromDxf = (
  content: string,
  layerIdFor: (name: unknown) => string,
  colorFor: (index: unknown) => string,
): { top: CadEntity[]; byBlock: Map<string, CadEntity[]> } => {
  /*
   * A DXF is a flat list of (code, value) PAIRS, so the scan steps two lines at a time. Walking one
   * line at a time drifts out of alignment the moment the stream is advanced by anything other than
   * one, and a hatch then sits half in one record and half in the next — silently never read, which
   * looks exactly like the parser having dropped it.
   */
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const pairs: Pair[] = []
  for (let index = 0; index + 1 < lines.length; index += 2) {
    pairs.push([lines[index].trim(), lines[index + 1]])
  }

  const top: CadEntity[] = []
  const byBlock = new Map<string, CadEntity[]>()
  let section: string | null = null
  let block: string | null = null
  let index = 0

  while (index < pairs.length) {
    const [code, rawValue] = pairs[index]
    const value = String(rawValue).trim()
    if (code === '0' && value === 'SECTION') {
      section = pairs[index + 1]?.[1]?.trim() ?? null
      index += 2
      continue
    }
    if (code === '0' && value === 'ENDSEC') {
      section = null
      block = null
      index += 1
      continue
    }
    if (code === '0' && value === 'BLOCK') {
      block = null
      index += 1
      continue
    }
    if (code === '2' && block === null && section === 'BLOCKS') {
      block = value
      index += 1
      continue
    }
    if (code === '0' && value === 'ENDBLK') {
      block = null
      index += 1
      continue
    }
    if (code === '0' && value === 'HATCH') {
      const fields: Pair[] = []
      let cursor = index + 1
      while (cursor < pairs.length && pairs[cursor][0] !== '0') {
        fields.push(pairs[cursor])
        cursor += 1
      }
      const hatch = readHatch(fields, layerIdFor(fields.find(([c]) => c === '8')?.[1]), colorFor)
      if (hatch) {
        if (section === 'BLOCKS' && block !== null) {
          const members = byBlock.get(block) ?? []
          members.push(hatch)
          byBlock.set(block, members)
        } else {
          top.push(hatch)
        }
      }
      index = cursor
      continue
    }
    index += 1
  }
  return { top, byBlock }
}
