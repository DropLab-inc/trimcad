import type { Vec2 } from './math/vec2'
import { entityBounds } from './selection'
import type { Bounds } from './selection'
import type { BlockDefinition, CadEntity, TextStyle } from './types'

/** The value at a given fraction through a sorted list, without allocating a new one per call. */
const quantile = (sorted: number[], fraction: number): number => {
  if (sorted.length === 0) return 0
  const index = Math.round((sorted.length - 1) * fraction)
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))]
}

const centreOf = (bounds: Bounds): Vec2 => ({
  x: (bounds.min.x + bounds.max.x) / 2,
  y: (bounds.min.y + bounds.max.y) / 2,
})

const unionOf = (boxes: Bounds[]): Bounds =>
  boxes.reduce<Bounds>(
    (acc, box) => ({
      min: { x: Math.min(acc.min.x, box.min.x), y: Math.min(acc.min.y, box.min.y) },
      max: { x: Math.max(acc.max.x, box.max.x), y: Math.max(acc.max.y, box.max.y) },
    }),
    { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } },
  )

/**
 * The part of a drawing worth framing, which is not always all of it.
 *
 * Real files carry strays: a converted drawing had eight degenerate arcs 13,000 units from the
 * geometry they belonged with, and one object left behind is enough to make ZOOM EXTENTS frame a
 * drawing 664 units across inside a view 13,575 wide — 40 pixels of line-work in the middle of an
 * empty canvas, which is what the user reports as "it loads wonky". Framing the spread of the
 * drawing rather than its extremes shows the drawing.
 *
 * The spread is measured from the quartiles, so a handful of strays cannot move it, while two
 * clusters of comparable size still give a quartile spread that spans them and both are framed. When
 * the test would throw away most of the drawing — genuinely scattered geometry — everything is kept,
 * because framing nothing is worse than framing too much.
 */
export const framingBounds = (
  entities: CadEntity[],
  blocks: BlockDefinition[] = [],
  textStyles: TextStyle[] = [],
): { bounds: Bounds | null; leftOut: number } => {
  const boxes: Bounds[] = []
  for (const entity of entities) {
    const box = entityBounds(entity, blocks, textStyles)
    if (box) boxes.push(box)
  }
  if (boxes.length === 0) return { bounds: null, leftOut: 0 }
  const all = unionOf(boxes)
  // A handful of objects has no spread to measure; framing all of them is the only honest answer.
  if (boxes.length < 20) return { bounds: all, leftOut: 0 }

  const centres = boxes.map(centreOf)
  const xs = centres.map((point) => point.x).sort((a, b) => a - b)
  const ys = centres.map((point) => point.y).sort((a, b) => a - b)
  const q1x = quantile(xs, 0.25)
  const q3x = quantile(xs, 0.75)
  const q1y = quantile(ys, 0.25)
  const q3y = quantile(ys, 0.75)
  // Eight times the quartile spread: generous enough for a drawing laid out in clusters, far too
  // tight for a stray on the other side of the origin.
  const reachX = Math.max((q3x - q1x) * 8, 1e-9)
  const reachY = Math.max((q3y - q1y) * 8, 1e-9)
  const near = boxes.filter((box) => {
    const centre = centreOf(box)
    return (
      centre.x >= q1x - reachX && centre.x <= q3x + reachX && centre.y >= q1y - reachY && centre.y <= q3y + reachY
    )
  })
  if (near.length < boxes.length / 2) return { bounds: all, leftOut: 0 }
  return { bounds: unionOf(near), leftOut: boxes.length - near.length }
}
