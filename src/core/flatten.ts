import { pointSegmentDistance, polar } from './geometry'
import { ellipseOutline } from './intersect'
import type { Vec2 } from './math/vec2'
import type { CadEntity } from './types'

const CIRCLE_SEGMENTS = 96

/** A run of points to be drawn as one connected path. */
export type Polyline = { points: Vec2[]; closed: boolean }

const sampleArc = (center: Vec2, radius: number, startAngle: number, sweep: number, count: number): Vec2[] =>
  Array.from({ length: count + 1 }, (_, index) => polar(center, radius, startAngle + (sweep * index) / count))

/**
 * Reduces any object to plain point runs, which is what a plotter, a PDF or a hatch boundary all
 * need. Curves become short straight segments; text is left out because it is drawn as text.
 */
export const flattenEntity = (entity: CadEntity): Polyline[] => {
  switch (entity.type) {
    case 'line':
      return [{ points: [entity.start, entity.end], closed: false }]
    case 'polyline':
      return [{ points: entity.points, closed: entity.closed }]
    case 'spline':
      return [{ points: entity.controlPoints, closed: false }]
    case 'circle':
      return [{ points: sampleArc(entity.center, entity.radius, 0, Math.PI * 2, CIRCLE_SEGMENTS).slice(0, -1), closed: true }]
    case 'arc': {
      let sweep = entity.endAngle - entity.startAngle
      while (sweep <= 0) sweep += Math.PI * 2
      const count = Math.max(8, Math.round((CIRCLE_SEGMENTS * sweep) / (Math.PI * 2)))
      return [{ points: sampleArc(entity.center, entity.radius, entity.startAngle, sweep, count), closed: false }]
    }
    case 'ellipse':
      return [{ points: ellipseOutline(entity), closed: true }]
    case 'hatch':
      return [{ points: entity.boundary, closed: true }]
    case 'dimension':
      // The measured span; the witness lines and arrowheads are drawn by the dimension renderer.
      return [{ points: [entity.p1, entity.p2], closed: false }]
    case 'leader':
      // Arrow to the landing, then the hook: the shape the renderer draws.
      return [
        {
          points: [
            entity.arrow,
            entity.landingEnd,
            { x: entity.landingEnd.x, y: entity.landingEnd.y + 3.5 * (entity.height / 2.5) },
          ],
          closed: false,
        },
      ]
    case 'tolerance':
      // The frame is a box; its width follows the words, which the renderer owns. Flatten to a point
      // so bounds and distance-to still answer, and picking goes through the bounds path below.
      return [{ points: [entity.position], closed: false }]
    default:
      return []
  }
}

/** Every point an object occupies, for working out how big a drawing is. */
export const pointsOfEntity = (entity: CadEntity): Vec2[] => {
  if (entity.type === 'text') return [entity.position]
  return flattenEntity(entity).flatMap((run) => run.points)
}

/**
 * How far a point lies from an object. OFFSET's Through option needs this to work out the distance
 * implied by the point that was picked.
 */
export const distanceToEntity = (point: Vec2, entity: CadEntity): number => {
  // A circle has an exact answer, and it is the shape most likely to be offset through a point.
  if (entity.type === 'circle') {
    return Math.abs(Math.hypot(point.x - entity.center.x, point.y - entity.center.y) - entity.radius)
  }
  if (entity.type === 'text') return Math.hypot(point.x - entity.position.x, point.y - entity.position.y)

  let best = Number.POSITIVE_INFINITY
  for (const run of flattenEntity(entity)) {
    const { points, closed } = run
    const last = closed ? points.length : points.length - 1
    for (let index = 0; index < last; index += 1) {
      const distance = pointSegmentDistance(point, points[index], points[(index + 1) % points.length])
      if (distance < best) best = distance
    }
  }
  return Number.isFinite(best) ? best : 0
}
