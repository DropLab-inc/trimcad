import { pointSegmentDistance, uid } from './geometry'
import {
  EPS,
  circleIntersections,
  infiniteIntersection,
  lineCircleRoots,
  offsetSegmentLine,
} from './intersect'
import { add, distance, mul, normalize, sub, type Vec2 } from './math/vec2'
import { entityCircle, entitySegments } from './snap'
import type { CadEntity, PolygonFit } from './types'

/**
 * The ways a circle or a polygon can be pinned down by something other than a centre and a radius.
 *
 * AutoCAD offers a circle three points to pass through, two ends of a diameter, or two objects to
 * sit tangent to at a given radius; and a polygon a choice of sitting inside its circle or around
 * it. All of them come down to working out a centre and a radius, which is what this file does.
 */

export type CircleShape = { center: Vec2; radius: number }

/** The circle with `a` and `b` at opposite ends of a diameter. */
export const circleOnDiameter = (a: Vec2, b: Vec2): CircleShape | null => {
  const across = distance(a, b)
  if (across < EPS) return null
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, radius: across / 2 }
}

/**
 * The one circle passing through three points, found from where the perpendicular bisectors of
 * two of the chords cross. Points in a straight line have no such circle.
 */
export const circleThroughPoints = (a: Vec2, b: Vec2, c: Vec2): CircleShape | null => {
  const twiceArea = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(twiceArea) < EPS) return null

  const aSquared = a.x * a.x + a.y * a.y
  const bSquared = b.x * b.x + b.y * b.y
  const cSquared = c.x * c.x + c.y * c.y
  const center = {
    x: (aSquared * (b.y - c.y) + bSquared * (c.y - a.y) + cSquared * (a.y - b.y)) / twiceArea,
    y: (aSquared * (c.x - b.x) + bSquared * (a.x - c.x) + cSquared * (b.x - a.x)) / twiceArea,
  }
  return { center, radius: distance(center, a) }
}

/* ------------------------------------------------- tangent, tangent, radius */

/** All TTR needs to know about a picked object: a straight run, or the circle it lies on. */
type Tangible = { kind: 'run'; a: Vec2; b: Vec2 } | { kind: 'curve'; center: Vec2; radius: number }

/**
 * Reduces a picked object to the piece of it nearest the click, so picking one side of a rectangle
 * offers that side rather than the whole outline.
 */
const tangibleAt = (entity: CadEntity, near: Vec2): Tangible | null => {
  const circle = entityCircle(entity)
  if (circle) return { kind: 'curve', center: circle.center, radius: circle.radius }

  let best: Tangible | null = null
  let bestDistance = Infinity
  for (const segment of entitySegments(entity)) {
    const measured = pointSegmentDistance(near, segment.a, segment.b)
    if (measured < bestDistance) {
      bestDistance = measured
      best = { kind: 'run', a: segment.a, b: segment.b }
    }
  }
  return best
}

/** True when an object can be sat tangent to, which rules out splines and ellipses. */
export const canBeTangent = (entity: CadEntity): boolean => tangibleAt(entity, { x: 0, y: 0 }) !== null

/** The distances a tangent circle's centre can sit from a curve's centre. */
const reaches = (curveRadius: number, radius: number): number[] =>
  [curveRadius + radius, Math.abs(curveRadius - radius)].filter((reach) => reach > EPS)

/**
 * Every centre a circle of `radius` could have while touching both objects.
 *
 * A straight run contributes two possibilities, one for each side it can be touched from, and a
 * curve contributes two as well, riding around the outside or curling against the inside. So there
 * are four to eight centres, and the caller picks between them by where the objects were clicked.
 */
const tangentCentres = (first: Tangible, second: Tangible, radius: number): Vec2[] => {
  if (first.kind === 'run' && second.kind === 'run') {
    const centres: Vec2[] = []
    for (const sideA of [1, -1]) {
      for (const sideB of [1, -1]) {
        const hit = infiniteIntersection(
          offsetSegmentLine(first.a, first.b, sideA * radius),
          offsetSegmentLine(second.a, second.b, sideB * radius),
        )
        if (hit) centres.push(hit)
      }
    }
    return centres
  }

  if (first.kind === 'curve' && second.kind === 'curve') {
    return reaches(first.radius, radius).flatMap((reachA) =>
      reaches(second.radius, radius).flatMap((reachB) =>
        circleIntersections(first.center, reachA, second.center, reachB),
      ),
    )
  }

  const run = first.kind === 'run' ? first : (second as Extract<Tangible, { kind: 'run' }>)
  const curve = first.kind === 'curve' ? first : (second as Extract<Tangible, { kind: 'curve' }>)
  const along = normalize(sub(run.b, run.a))
  if (!Number.isFinite(along.x)) return []

  // The centre sits on one of the two lines parallel to the run, and a fixed distance from the
  // curve's centre, so each parallel meets each of those distances at up to two points.
  const centres: Vec2[] = []
  for (const side of [1, -1]) {
    const parallel = offsetSegmentLine(run.a, run.b, side * radius)
    for (const reach of reaches(curve.radius, radius)) {
      for (const step of lineCircleRoots(parallel.a, along, curve.center, reach)) {
        centres.push(add(parallel.a, mul(along, step)))
      }
    }
  }
  return centres
}

/** How far a centre sits from where an object was clicked, used to rank the candidates. */
const missBy = (shape: Tangible, centre: Vec2, clicked: Vec2): number => {
  const touch =
    shape.kind === 'curve'
      ? add(shape.center, mul(normalize(sub(centre, shape.center)), shape.radius))
      : closestOnRun(shape, centre)
  return distance(touch, clicked)
}

const closestOnRun = (run: Extract<Tangible, { kind: 'run' }>, point: Vec2): Vec2 => {
  const along = normalize(sub(run.b, run.a))
  const reach = (point.x - run.a.x) * along.x + (point.y - run.a.y) * along.y
  return add(run.a, mul(along, reach))
}

/**
 * The circle of the given radius that touches both picked objects, nearest to where they were
 * clicked. This is AutoCAD's Ttr option, where the two picks choose between the several circles
 * that satisfy the same three constraints.
 */
export const circleTangentToTwo = (
  first: { entity: CadEntity; point: Vec2 },
  second: { entity: CadEntity; point: Vec2 },
  radius: number,
): CircleShape | null => {
  if (!Number.isFinite(radius) || Math.abs(radius) < EPS) return null

  const shapeA = tangibleAt(first.entity, first.point)
  const shapeB = tangibleAt(second.entity, second.point)
  if (!shapeA || !shapeB) return null

  const magnitude = Math.abs(radius)
  const ranked = tangentCentres(shapeA, shapeB, magnitude)
    .map((centre) => ({
      centre,
      miss: missBy(shapeA, centre, first.point) + missBy(shapeB, centre, second.point),
    }))
    .sort((a, b) => a.miss - b.miss)

  const best = ranked[0]
  return best ? { center: best.centre, radius: magnitude } : null
}

/* ------------------------------------------------------------------ polygon */

/**
 * The distance from a polygon's centre out to its corners.
 *
 * A polygon drawn inside its circle has its corners on it. One drawn around the circle touches it
 * with the middle of each side instead, so the corners stand further out by the half angle of a
 * side, which is what keeps the flats at the radius the user asked for.
 */
export const cornerRadius = (fit: PolygonFit, radius: number, sides: number): number => {
  const count = Math.max(3, Math.round(sides))
  return fit === 'circumscribed' ? radius / Math.cos(Math.PI / count) : radius
}

/**
 * The polygon standing on `a`-`b` as one of its sides, built to the left of that edge so the
 * shape follows the direction the two points were picked in.
 */
export const polygonOnEdge = (layerId: string, a: Vec2, b: Vec2, sides: number): CadEntity | null => {
  const count = Math.max(3, Math.round(sides))
  const length = distance(a, b)
  if (length < EPS) return null

  // Each corner turns by the exterior angle, so walking that turn repeatedly draws the outline.
  const turn = (Math.PI * 2) / count
  const points: Vec2[] = [a]
  let heading = Math.atan2(b.y - a.y, b.x - a.x)
  let cursor = a
  for (let step = 0; step < count - 1; step += 1) {
    cursor = { x: cursor.x + Math.cos(heading) * length, y: cursor.y + Math.sin(heading) * length }
    points.push(cursor)
    heading += turn
  }
  return { id: uid(), type: 'polyline', layerId, closed: true, points }
}
