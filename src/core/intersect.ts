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

/* ------------------------------------------------------------------- ellipses */

/**
 * Ellipses are the one primitive with no closed-form crossing against anything but a line, and the
 * one whose whole outline has to be sampled wherever a curve must become straight pieces. Both live
 * here so a trim, a fence, a hatch boundary and a snap candidate all read the same shape.
 */

/** How finely an ellipse's outline is sampled wherever a curve has to become straight pieces. */
export const ELLIPSE_SEGMENTS = 96

/** An ellipse's shape, without the entity's id, layer and colour. */
export type EllipseLike = { center: Vec2; rx: number; ry: number; rotation: number }

/** The cosine and sine of an angle, so a rotation is not computed twice for the same frame. */
const rotationOf = (angle: number): { cos: number; sin: number } => ({ cos: Math.cos(angle), sin: Math.sin(angle) })

/** A point expressed in the ellipse's own frame, where the outline is a unit circle. */
const intoEllipseFrame = (point: Vec2, ellipse: EllipseLike): Vec2 => {
  const { cos, sin } = rotationOf(-ellipse.rotation)
  const dx = point.x - ellipse.center.x
  const dy = point.y - ellipse.center.y
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}

const outOfEllipseFrame = (local: Vec2, ellipse: EllipseLike): Vec2 => {
  const { cos, sin } = rotationOf(ellipse.rotation)
  return {
    x: ellipse.center.x + local.x * cos - local.y * sin,
    y: ellipse.center.y + local.x * sin + local.y * cos,
  }
}

/** The point at a parameter angle around an ellipse: 0 is the end of the radius along `rx`. */
export const ellipsePointAt = (ellipse: EllipseLike, angle: number): Vec2 =>
  outOfEllipseFrame({ x: Math.cos(angle) * ellipse.rx, y: Math.sin(angle) * ellipse.ry }, ellipse)

/**
 * An ellipse's own parameter angle for a point, which is how a pick is placed on the outline.
 * A point off the curve still answers — read outwards from the centre through where it lies — so a
 * click beside the outline picks the piece it is beside rather than nothing at all.
 */
export const ellipseParameterOf = (ellipse: EllipseLike, point: Vec2): number => {
  const local = intoEllipseFrame(point, ellipse)
  return Math.atan2(local.y / ellipse.ry, local.x / ellipse.rx)
}

/** Points around the whole outline in parameter order, the last a step short of the first. */
export const ellipseOutline = (ellipse: EllipseLike, count = ELLIPSE_SEGMENTS): Vec2[] =>
  Array.from({ length: count }, (_, index) => ellipsePointAt(ellipse, (index / count) * Math.PI * 2))

/**
 * Where the infinite line through `origin` along `direction` crosses an ellipse, as distances along
 * that direction.
 *
 * Exact, rather than sampled: an ellipse is an affine image of the unit circle, and scaling and
 * turning a line's points leaves the parameter along it unchanged, so the crossings can be solved
 * against the unit circle and used as they come out. That is what keeps a line trimmed back to an
 * oval landing on the outline rather than on a chord of it.
 */
export const lineEllipseParameters = (
  origin: Vec2,
  direction: Vec2,
  ellipse: EllipseLike,
): number[] => {
  if (ellipse.rx < EPS || ellipse.ry < EPS) return []
  const { cos, sin } = rotationOf(-ellipse.rotation)
  const local = intoEllipseFrame(origin, ellipse)
  const unitOrigin = { x: local.x / ellipse.rx, y: local.y / ellipse.ry }
  const mapped = {
    x: (direction.x * cos - direction.y * sin) / ellipse.rx,
    y: (direction.x * sin + direction.y * cos) / ellipse.ry,
  }
  // `lineCircleRoots` solves for a UNIT direction, and the frame change scales the direction, so the
  // roots it hands back are measured in the mapped lengths and are divided by the mapping's own
  // scale. Skipping that lands the crossing at the wrong fraction along the line — which is what a
  // line trimmed back to an oval stopping well clear of it looks like.
  const scale = Math.hypot(mapped.x, mapped.y)
  if (scale < EPS) return []
  return lineCircleRoots(
    unitOrigin,
    { x: mapped.x / scale, y: mapped.y / scale },
    { x: 0, y: 0 },
    1,
  ).map((t) => t / scale)
}

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
