import { add, distance, mul, normalize, sub, type Vec2 } from './math/vec2'

/**
 * Where primitive shapes meet, and how they move when offset.
 *
 * These are the pieces both the modify commands and the construction commands are built from:
 * trimming needs to know where a cutter crosses, and drawing a circle tangent to two objects needs
 * the same crossings between the offsets of those objects. Keeping them here stops the two sides
 * growing their own slightly different copies.
 */

export const EPS = 1e-9
/** Parameter slack so a crossing sitting exactly on an endpoint still counts. */
export const TOUCH = 1e-6

export type Segment = { a: Vec2; b: Vec2 }

export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x

export const perpendicular = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x })

/** The line a segment becomes when moved sideways by a signed distance. */
export const offsetSegmentLine = (a: Vec2, b: Vec2, signedDistance: number): Segment => {
  const direction = normalize(sub(b, a))
  const delta = mul(perpendicular(direction), signedDistance)
  return { a: add(a, delta), b: add(b, delta) }
}

/** Where the infinite lines through two segments cross, or null when they are parallel. */
export const infiniteIntersection = (first: Segment, second: Segment): Vec2 | null => {
  const r = sub(first.b, first.a)
  const s = sub(second.b, second.a)
  const denominator = cross(r, s)
  if (Math.abs(denominator) < EPS) return null
  const t = cross(sub(second.a, first.a), s) / denominator
  return add(first.a, mul(r, t))
}

/**
 * Where the infinite line through `origin` along the unit vector `direction` meets a circle,
 * given as distances along that direction. A line that grazes the circle returns one root.
 */
export const lineCircleRoots = (origin: Vec2, direction: Vec2, center: Vec2, radius: number): number[] => {
  const toOrigin = sub(origin, center)
  const half = toOrigin.x * direction.x + toOrigin.y * direction.y
  const discriminant = half * half - (toOrigin.x * toOrigin.x + toOrigin.y * toOrigin.y - radius * radius)
  if (discriminant < 0) return []
  if (discriminant < EPS) return [-half]
  const root = Math.sqrt(discriminant)
  return [-half - root, -half + root]
}

/**
 * Where two circles cross, as up to two points.
 *
 * Circles that miss each other, or that sit one wholly inside the other, never cross. Ones that
 * touch at a single point return that point once rather than twice.
 */
export const circleIntersections = (
  centerA: Vec2,
  radiusA: number,
  centerB: Vec2,
  radiusB: number,
): Vec2[] => {
  const between = distance(centerA, centerB)
  if (between < EPS) return []
  if (between > radiusA + radiusB + TOUCH) return []
  if (between < Math.abs(radiusA - radiusB) - TOUCH) return []

  const along = (radiusA ** 2 - radiusB ** 2 + between ** 2) / (2 * between)
  const heightSquared = radiusA ** 2 - along * along
  const unit = normalize(sub(centerB, centerA))
  const base = add(centerA, mul(unit, along))
  if (heightSquared <= TOUCH) return [base]

  const height = Math.sqrt(heightSquared)
  const offset = { x: -unit.y * height, y: unit.x * height }
  return [add(base, offset), sub(base, offset)]
}
