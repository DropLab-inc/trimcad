import type { Vec2 } from './math/vec2'

/**
 * The curve shapes DXF uses that this app has no direct equivalent for. Each is turned into a dense
 * run of points, which draws identically and keeps imported geometry the right shape.
 */

const ARC_SEGMENTS_PER_TURN = 96

const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * A polyline vertex can carry a "bulge", which turns the segment that follows it into a circular
 * arc. The bulge is the tangent of a quarter of the arc's included angle, positive anticlockwise.
 * Ignoring it is what makes imported curves come through as straight chords.
 */
export const bulgeArcPoints = (a: Vec2, b: Vec2, bulge: number): Vec2[] => {
  const chord = distance(a, b)
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-9 || chord < 1e-12) return [b]

  const sweep = 4 * Math.atan(bulge)
  const radius = chord / (2 * Math.sin(Math.abs(sweep) / 2))
  if (!Number.isFinite(radius)) return [b]

  const dir = { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord }
  const leftNormal = { x: -dir.y, y: dir.x }
  // How far the centre sits off the chord's midpoint; the sign follows the bulge's direction.
  const apothem = chord / 2 / Math.tan(sweep / 2)
  const center = {
    x: (a.x + b.x) / 2 + leftNormal.x * apothem,
    y: (a.y + b.y) / 2 + leftNormal.y * apothem,
  }

  const startAngle = Math.atan2(a.y - center.y, a.x - center.x)
  const count = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * ARC_SEGMENTS_PER_TURN))

  return Array.from({ length: count }, (_, index) => {
    const angle = startAngle + (sweep * (index + 1)) / count
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
  })
}

/** Expands a polyline's vertices, replacing every bulged segment with the arc it stands for. */
export const expandBulges = (
  vertices: Array<{ x: number; y: number; bulge?: number }>,
  closed: boolean,
): Vec2[] => {
  if (vertices.length === 0) return []

  const points: Vec2[] = [{ x: vertices[0].x, y: vertices[0].y }]
  const last = closed ? vertices.length : vertices.length - 1

  for (let index = 0; index < last; index += 1) {
    const from = vertices[index]
    const to = vertices[(index + 1) % vertices.length]
    points.push(...bulgeArcPoints({ x: from.x, y: from.y }, { x: to.x, y: to.y }, from.bulge ?? 0))
  }

  // A closed run ends back at its start, which the entity's own closed flag already implies.
  if (closed) points.pop()
  return points
}

/** Points along part of an ellipse, for the elliptical arcs DXF stores as a start and end angle. */
export const ellipticalArcPoints = (
  center: Vec2,
  major: Vec2,
  axisRatio: number,
  startAngle: number,
  endAngle: number,
): Vec2[] => {
  const rx = Math.hypot(major.x, major.y)
  const ry = rx * axisRatio
  const rotation = Math.atan2(major.y, major.x)

  let sweep = endAngle - startAngle
  while (sweep <= 1e-9) sweep += Math.PI * 2

  const count = Math.max(8, Math.ceil((sweep / (Math.PI * 2)) * ARC_SEGMENTS_PER_TURN))
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = startAngle + (sweep * index) / count
    const x = Math.cos(angle) * rx
    const y = Math.sin(angle) * ry
    return {
      x: center.x + x * Math.cos(rotation) - y * Math.sin(rotation),
      y: center.y + x * Math.sin(rotation) + y * Math.cos(rotation),
    }
  })
}

/** A clamped uniform knot vector, for files that leave the knots out. */
const uniformKnots = (count: number, degree: number): number[] => {
  const knots: number[] = []
  const interior = count - degree - 1
  for (let index = 0; index <= degree; index += 1) knots.push(0)
  for (let index = 1; index <= interior; index += 1) knots.push(index / (interior + 1))
  for (let index = 0; index <= degree; index += 1) knots.push(1)
  return knots
}

const findSpan = (u: number, degree: number, knots: number[], count: number): number => {
  const last = count - 1
  if (u >= knots[last + 1]) return last
  if (u <= knots[degree]) return degree

  let low = degree
  let high = last + 1
  let mid = Math.floor((low + high) / 2)
  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) high = mid
    else low = mid
    mid = Math.floor((low + high) / 2)
  }
  return mid
}

/**
 * Evaluates a B-spline with De Boor's algorithm.
 *
 * This matters because a DXF spline's control points do not lie on the curve, while this app's
 * splines are drawn through the points they are given. Feeding the control points straight in would
 * pull the curve well away from its real shape, so the curve is evaluated and sampled instead.
 */
export const sampleBSpline = (
  controlPoints: Vec2[],
  degree: number,
  knots: number[] | undefined,
  samples = 64,
): Vec2[] => {
  const count = controlPoints.length
  if (count === 0) return []
  if (count === 1) return [controlPoints[0]]

  const order = Math.min(Math.max(1, degree), count - 1)
  if (order < 1) return controlPoints

  const expected = count + order + 1
  const knotVector = knots?.length === expected ? knots : uniformKnots(count, order)

  const first = knotVector[order]
  const last = knotVector[count]
  if (!(last > first)) return controlPoints

  const points: Vec2[] = []
  for (let step = 0; step <= samples; step += 1) {
    const u = first + ((last - first) * step) / samples
    const span = findSpan(Math.min(u, last - 1e-12), order, knotVector, count)

    const working: Vec2[] = []
    for (let index = 0; index <= order; index += 1) {
      const source = controlPoints[index + span - order] ?? controlPoints[0]
      working[index] = { x: source.x, y: source.y }
    }

    for (let round = 1; round <= order; round += 1) {
      for (let index = order; index >= round; index -= 1) {
        const lower = knotVector[index + span - order]
        const upper = knotVector[index + 1 + span - round]
        const denominator = upper - lower
        const alpha = denominator === 0 ? 0 : (u - lower) / denominator
        working[index] = {
          x: (1 - alpha) * working[index - 1].x + alpha * working[index].x,
          y: (1 - alpha) * working[index - 1].y + alpha * working[index].y,
        }
      }
    }

    points.push(working[order])
  }

  return points
}
