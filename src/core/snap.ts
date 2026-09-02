import { angleInSweep, circleTangentPoints, midpoint, polar } from './geometry'
import { add, distance, dot, mul, normalize, sub, type Vec2 } from './math/vec2'
import type { CadEntity, SnapMode } from './types'

export type SnapCandidate = {
  point: Vec2
  mode: SnapMode
  distance: number
}

export type TrackingResult = {
  point: Vec2
  snapped: boolean
}

type Segment = { a: Vec2; b: Vec2 }
type CircleLike = { center: Vec2; radius: number; startAngle?: number; endAngle?: number }

const EPS = 1e-9

/**
 * Snap modes are grouped into priority tiers. A lower tier always wins, so an endpoint is
 * preferred over a point that merely lies on the curve, even when the latter is closer.
 */
const SNAP_TIERS: Record<SnapMode, number> = {
  endpoint: 1,
  intersection: 1,
  node: 1,
  midpoint: 2,
  center: 2,
  quadrant: 2,
  perpendicular: 3,
  tangent: 3,
  nearest: 4,
}

export const ALL_SNAP_MODES: SnapMode[] = [
  'endpoint',
  'midpoint',
  'center',
  'quadrant',
  'intersection',
  'perpendicular',
  'tangent',
  'node',
  'nearest',
]

export const entitySegments = (entity: CadEntity): Segment[] => {
  switch (entity.type) {
    case 'line':
      return [{ a: entity.start, b: entity.end }]
    case 'polyline':
    case 'hatch': {
      const points = entity.type === 'polyline' ? entity.points : entity.boundary
      const closed = entity.type === 'hatch' || entity.closed
      const segments: Segment[] = []
      for (let i = 0; i < points.length - 1; i += 1) {
        segments.push({ a: points[i], b: points[i + 1] })
      }
      if (closed && points.length > 2) {
        segments.push({ a: points.at(-1)!, b: points[0] })
      }
      return segments
    }
    case 'spline': {
      const segments: Segment[] = []
      for (let i = 0; i < entity.controlPoints.length - 1; i += 1) {
        segments.push({ a: entity.controlPoints[i], b: entity.controlPoints[i + 1] })
      }
      return segments
    }
    default:
      return []
  }
}

export const entityCircle = (entity: CadEntity): CircleLike | null => {
  if (entity.type === 'circle') return { center: entity.center, radius: entity.radius }
  if (entity.type === 'arc') {
    return { center: entity.center, radius: entity.radius, startAngle: entity.startAngle, endAngle: entity.endAngle }
  }
  return null
}

const onArc = (circle: CircleLike, point: Vec2): boolean => {
  if (circle.startAngle === undefined || circle.endAngle === undefined) return true
  const angle = Math.atan2(point.y - circle.center.y, point.x - circle.center.x)
  return angleInSweep(angle, circle.startAngle, circle.endAngle)
}

export const closestPointOnSegment = (point: Vec2, a: Vec2, b: Vec2): Vec2 => {
  const ab = sub(b, a)
  const denom = dot(ab, ab)
  if (denom < EPS) return a
  const t = Math.max(0, Math.min(1, dot(sub(point, a), ab) / denom))
  return add(a, mul(ab, t))
}

const closestPointOnCircle = (point: Vec2, circle: CircleLike): Vec2 | null => {
  const dir = sub(point, circle.center)
  if (distance(point, circle.center) < EPS) return null
  const projected = add(circle.center, mul(normalize(dir), circle.radius))
  return onArc(circle, projected) ? projected : null
}

export const segmentIntersection = (a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null => {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const denom = r.x * s.y - r.y * s.x
  if (Math.abs(denom) < EPS) return null
  const qp = sub(b1, a1)
  const t = (qp.x * s.y - qp.y * s.x) / denom
  const u = (qp.x * r.y - qp.y * r.x) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return add(a1, mul(r, t))
}

export const segmentCircleIntersections = (a: Vec2, b: Vec2, circle: CircleLike): Vec2[] => {
  const d = sub(b, a)
  const f = sub(a, circle.center)
  const A = dot(d, d)
  if (A < EPS) return []
  const B = 2 * dot(f, d)
  const C = dot(f, f) - circle.radius * circle.radius
  const discriminant = B * B - 4 * A * C
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  return [(-B - root) / (2 * A), (-B + root) / (2 * A)]
    .filter((t) => t >= 0 && t <= 1)
    .map((t) => add(a, mul(d, t)))
    .filter((point) => onArc(circle, point))
}

export const circleCircleIntersections = (first: CircleLike, second: CircleLike): Vec2[] => {
  const between = distance(first.center, second.center)
  if (between < EPS) return []
  if (between > first.radius + second.radius) return []
  if (between < Math.abs(first.radius - second.radius)) return []
  const a = (first.radius ** 2 - second.radius ** 2 + between ** 2) / (2 * between)
  const hSquared = first.radius ** 2 - a * a
  if (hSquared < 0) return []
  const h = Math.sqrt(hSquared)
  const base = add(first.center, mul(normalize(sub(second.center, first.center)), a))
  const dir = normalize(sub(second.center, first.center))
  const offset = { x: -dir.y * h, y: dir.x * h }
  return [add(base, offset), sub(base, offset)].filter((point) => onArc(first, point) && onArc(second, point))
}

const quadrantPoints = (circle: CircleLike): Vec2[] =>
  [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]
    .map((angle) => polar(circle.center, circle.radius, angle))
    .filter((point) => onArc(circle, point))

export const collectSnapCandidates = (
  entity: CadEntity,
  mode: SnapMode,
  cursor: Vec2,
  basePoint?: Vec2,
): Vec2[] => {
  const circle = entityCircle(entity)
  const segments = entitySegments(entity)

  switch (mode) {
    case 'endpoint': {
      if (circle && entity.type === 'arc') {
        return [polar(circle.center, circle.radius, circle.startAngle!), polar(circle.center, circle.radius, circle.endAngle!)]
      }
      if (entity.type === 'dimension') return [entity.p1, entity.p2]
      return segments.flatMap((segment) => [segment.a, segment.b])
    }
    case 'midpoint':
      return segments.map((segment) => midpoint(segment.a, segment.b))
    case 'center':
      if (circle) return [circle.center]
      if (entity.type === 'ellipse') return [entity.center]
      if (entity.type === 'insert') return [entity.position]
      return []
    case 'quadrant':
      return circle ? quadrantPoints(circle) : []
    case 'node':
      if (entity.type === 'spline') return entity.controlPoints
      if (entity.type === 'hatch') return entity.boundary
      if (entity.type === 'text') return [entity.position]
      if (entity.type === 'insert') return [entity.position]
      return []
    case 'nearest': {
      const candidates = segments.map((segment) => closestPointOnSegment(cursor, segment.a, segment.b))
      if (circle) {
        const onCircle = closestPointOnCircle(cursor, circle)
        if (onCircle) candidates.push(onCircle)
      }
      return candidates
    }
    case 'perpendicular': {
      if (!basePoint) return []
      const candidates = segments.map((segment) => closestPointOnSegment(basePoint, segment.a, segment.b))
      if (circle) {
        const onCircle = closestPointOnCircle(basePoint, circle)
        if (onCircle) candidates.push(onCircle)
      }
      return candidates
    }
    case 'tangent': {
      if (!basePoint || !circle) return []
      return circleTangentPoints({ center: circle.center, radius: circle.radius }, basePoint).filter((point) =>
        onArc(circle, point),
      )
    }
    default:
      return []
  }
}

const intersectionCandidates = (entities: CadEntity[]): Vec2[] => {
  const points: Vec2[] = []
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      const first = entities[i]
      const second = entities[j]
      const firstSegments = entitySegments(first)
      const secondSegments = entitySegments(second)
      const firstCircle = entityCircle(first)
      const secondCircle = entityCircle(second)

      for (const a of firstSegments) {
        for (const b of secondSegments) {
          const point = segmentIntersection(a.a, a.b, b.a, b.b)
          if (point) points.push(point)
        }
      }
      if (secondCircle) {
        for (const a of firstSegments) points.push(...segmentCircleIntersections(a.a, a.b, secondCircle))
      }
      if (firstCircle) {
        for (const b of secondSegments) points.push(...segmentCircleIntersections(b.a, b.b, firstCircle))
      }
      if (firstCircle && secondCircle) {
        points.push(...circleCircleIntersections(firstCircle, secondCircle))
      }
    }
  }
  return points
}

export const findBestSnap = (
  worldPoint: Vec2,
  entities: CadEntity[],
  enabledModes: SnapMode[],
  aperture: number,
  basePoint?: Vec2,
): SnapCandidate | null => {
  let best: SnapCandidate | null = null

  const consider = (point: Vec2, mode: SnapMode) => {
    const d = distance(point, worldPoint)
    if (d > aperture) return
    if (!best) {
      best = { point, mode, distance: d }
      return
    }
    const bestTier = SNAP_TIERS[best.mode]
    const tier = SNAP_TIERS[mode]
    if (tier < bestTier || (tier === bestTier && d < best.distance)) {
      best = { point, mode, distance: d }
    }
  }

  for (const entity of entities) {
    for (const mode of enabledModes) {
      if (mode === 'intersection') continue
      for (const point of collectSnapCandidates(entity, mode, worldPoint, basePoint)) {
        consider(point, mode)
      }
    }
  }

  if (enabledModes.includes('intersection')) {
    const nearby = entities.filter((entity) =>
      collectSnapCandidates(entity, 'nearest', worldPoint).some((point) => distance(point, worldPoint) <= aperture * 8),
    )
    for (const point of intersectionCandidates(nearby)) {
      consider(point, 'intersection')
    }
  }

  return best
}

/**
 * Polar tracking only engages when the cursor is already close to a tracking angle,
 * matching AutoCAD behaviour. Snapping on every move makes the cursor feel like it jumps.
 */
export const applyPolarTracking = (
  basePoint: Vec2,
  targetPoint: Vec2,
  incrementDeg = 45,
  toleranceDeg = 4,
): TrackingResult => {
  const distanceValue = distance(basePoint, targetPoint)
  if (distanceValue < EPS) {
    return { point: targetPoint, snapped: false }
  }
  const angle = Math.atan2(targetPoint.y - basePoint.y, targetPoint.x - basePoint.x)
  const increment = (incrementDeg * Math.PI) / 180
  const snappedAngle = Math.round(angle / increment) * increment
  const deviationDeg = Math.abs(((snappedAngle - angle) * 180) / Math.PI)
  if (deviationDeg > toleranceDeg) {
    return { point: targetPoint, snapped: false }
  }
  return { point: polar(basePoint, distanceValue, snappedAngle), snapped: true }
}

export const applyOrtho = (basePoint: Vec2, targetPoint: Vec2): Vec2 => {
  const dx = targetPoint.x - basePoint.x
  const dy = targetPoint.y - basePoint.y
  return Math.abs(dx) >= Math.abs(dy)
    ? { x: targetPoint.x, y: basePoint.y }
    : { x: basePoint.x, y: targetPoint.y }
}
