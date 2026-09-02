import { normalizeAngle, uid } from './geometry'
import { add, distance, dot, mul, normalize, sub, type Vec2 } from './math/vec2'
import { entityCircle, entitySegments } from './snap'
import type { ArcEntity, CadEntity, PolylineEntity } from './types'

const EPS = 1e-9
/** Parameter slack so an intersection sitting exactly on a cutter's endpoint still counts. */
const TOUCH = 1e-6

type Segment = { a: Vec2; b: Vec2 }
type CircleLike = { center: Vec2; radius: number; startAngle?: number; endAngle?: number }

const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
const perpendicular = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x })

const arcSweep = (arc: { startAngle: number; endAngle: number }): number => {
  let sweep = arc.endAngle - arc.startAngle
  while (sweep <= 0) sweep += Math.PI * 2
  return sweep
}

const withinArc = (circle: CircleLike, point: Vec2): boolean => {
  if (circle.startAngle === undefined || circle.endAngle === undefined) return true
  const sweep = arcSweep({ startAngle: circle.startAngle, endAngle: circle.endAngle })
  const offset = normalizeAngle(Math.atan2(point.y - circle.center.y, point.x - circle.center.x) - circle.startAngle)
  return offset <= sweep + TOUCH
}

/* ------------------------------------------------------------------ offset */

const offsetSegmentLine = (a: Vec2, b: Vec2, signedDistance: number): Segment => {
  const direction = normalize(sub(b, a))
  const delta = mul(perpendicular(direction), signedDistance)
  return { a: add(a, delta), b: add(b, delta) }
}

const infiniteIntersection = (first: Segment, second: Segment): Vec2 | null => {
  const r = sub(first.b, first.a)
  const s = sub(second.b, second.a)
  const denominator = cross(r, s)
  if (Math.abs(denominator) < EPS) return null
  const t = cross(sub(second.a, first.a), s) / denominator
  return add(first.a, mul(r, t))
}

/** Which side of a directed segment the point falls on, as +1 or -1. */
const sideOf = (a: Vec2, b: Vec2, point: Vec2): number => {
  const value = cross(sub(b, a), sub(point, a))
  return value >= 0 ? 1 : -1
}

const closestSegmentIndex = (points: Vec2[], closed: boolean, target: Vec2): number => {
  let best = 0
  let bestDistance = Infinity
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const ab = sub(b, a)
    const denominator = dot(ab, ab)
    const t = denominator < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(target, a), ab) / denominator))
    const measured = distance(target, add(a, mul(ab, t)))
    if (measured < bestDistance) {
      bestDistance = measured
      best = i
    }
  }
  return best
}

/**
 * Offsets a polyline by offsetting each segment and mitring the corners, so the result stays
 * parallel to the original instead of being shifted diagonally.
 */
const offsetPolylinePoints = (points: Vec2[], closed: boolean, signedDistance: number): Vec2[] => {
  const count = closed ? points.length : points.length - 1
  const lines: Segment[] = []
  for (let i = 0; i < count; i += 1) {
    lines.push(offsetSegmentLine(points[i], points[(i + 1) % points.length], signedDistance))
  }
  if (lines.length === 0) return points

  const result: Vec2[] = []
  if (!closed) result.push(lines[0].a)

  const joins = closed ? lines.length : lines.length - 1
  for (let i = 0; i < joins; i += 1) {
    const previous = closed ? lines[(i - 1 + lines.length) % lines.length] : lines[i]
    const next = closed ? lines[i] : lines[i + 1]
    const corner = infiniteIntersection(previous, next)
    result.push(corner ?? next.a)
  }

  if (!closed) result.push(lines.at(-1)!.b)
  return result
}

/**
 * Offsets an entity to the side `throughPoint` falls on, mirroring how AutoCAD asks you to pick
 * a side rather than supplying a signed distance.
 */
export const offsetEntity = (entity: CadEntity, offsetDistance: number, throughPoint: Vec2): CadEntity | null => {
  const magnitude = Math.abs(offsetDistance)
  if (magnitude < EPS) return null

  switch (entity.type) {
    case 'line': {
      const sign = sideOf(entity.start, entity.end, throughPoint)
      const moved = offsetSegmentLine(entity.start, entity.end, magnitude * sign)
      return { ...entity, id: uid(), start: moved.a, end: moved.b }
    }
    case 'circle': {
      const outward = distance(throughPoint, entity.center) > entity.radius
      const radius = outward ? entity.radius + magnitude : entity.radius - magnitude
      if (radius <= EPS) return null
      return { ...entity, id: uid(), radius }
    }
    case 'arc': {
      const outward = distance(throughPoint, entity.center) > entity.radius
      const radius = outward ? entity.radius + magnitude : entity.radius - magnitude
      if (radius <= EPS) return null
      return { ...entity, id: uid(), radius }
    }
    case 'polyline': {
      const index = closestSegmentIndex(entity.points, entity.closed, throughPoint)
      const sign = sideOf(entity.points[index], entity.points[(index + 1) % entity.points.length], throughPoint)
      return { ...entity, id: uid(), points: offsetPolylinePoints(entity.points, entity.closed, magnitude * sign) }
    }
    case 'spline': {
      const index = closestSegmentIndex(entity.controlPoints, false, throughPoint)
      const sign = sideOf(entity.controlPoints[index], entity.controlPoints[index + 1], throughPoint)
      return {
        ...entity,
        id: uid(),
        controlPoints: offsetPolylinePoints(entity.controlPoints, false, magnitude * sign),
      }
    }
    case 'ellipse': {
      const outward = distance(throughPoint, entity.center) > Math.max(entity.rx, entity.ry)
      const delta = outward ? magnitude : -magnitude
      if (entity.rx + delta <= EPS || entity.ry + delta <= EPS) return null
      return { ...entity, id: uid(), rx: entity.rx + delta, ry: entity.ry + delta }
    }
    default:
      return null
  }
}

/* ------------------------------------------------- intersection parameters */

const segmentParameters = (origin: Vec2, direction: Vec2, segment: Segment): number | null => {
  const s = sub(segment.b, segment.a)
  const denominator = cross(direction, s)
  if (Math.abs(denominator) < EPS) return null
  const qp = sub(segment.a, origin)
  const t = cross(qp, s) / denominator
  const u = cross(qp, direction) / denominator
  if (u < -TOUCH || u > 1 + TOUCH) return null
  return t
}

const circleParameters = (origin: Vec2, direction: Vec2, circle: CircleLike): number[] => {
  const f = sub(origin, circle.center)
  const a = dot(direction, direction)
  if (a < EPS) return []
  const b = 2 * dot(f, direction)
  const c = dot(f, f) - circle.radius * circle.radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((t) =>
    withinArc(circle, add(origin, mul(direction, t))),
  )
}

/** Parameters along an infinite line where the given entities cross it. */
const crossingParameters = (origin: Vec2, direction: Vec2, others: CadEntity[]): number[] => {
  const parameters: number[] = []
  for (const other of others) {
    for (const segment of entitySegments(other)) {
      const t = segmentParameters(origin, direction, segment)
      if (t !== null) parameters.push(t)
    }
    const circle = entityCircle(other)
    if (circle) parameters.push(...circleParameters(origin, direction, circle))
  }
  return parameters
}

/** Angles at which the given entities cross a circle. */
const crossingAngles = (circle: CircleLike, others: CadEntity[]): number[] => {
  const angles: number[] = []
  const record = (point: Vec2) => {
    angles.push(Math.atan2(point.y - circle.center.y, point.x - circle.center.x))
  }

  for (const other of others) {
    for (const segment of entitySegments(other)) {
      const direction = sub(segment.b, segment.a)
      for (const t of circleParameters(segment.a, direction, circle)) {
        if (t < -TOUCH || t > 1 + TOUCH) continue
        record(add(segment.a, mul(direction, t)))
      }
    }
    const otherCircle = entityCircle(other)
    if (otherCircle) {
      const between = distance(circle.center, otherCircle.center)
      if (between < EPS) continue
      if (between > circle.radius + otherCircle.radius) continue
      if (between < Math.abs(circle.radius - otherCircle.radius)) continue
      const a = (circle.radius ** 2 - otherCircle.radius ** 2 + between ** 2) / (2 * between)
      const heightSquared = circle.radius ** 2 - a * a
      if (heightSquared < 0) continue
      const height = Math.sqrt(heightSquared)
      const unit = normalize(sub(otherCircle.center, circle.center))
      const base = add(circle.center, mul(unit, a))
      const offset = { x: -unit.y * height, y: unit.x * height }
      for (const point of [add(base, offset), sub(base, offset)]) {
        if (withinArc(otherCircle, point)) record(point)
      }
    }
  }
  return angles
}

/* -------------------------------------------------------------------- trim */

/** Returns the interval of `sorted` that contains `value`, as a [low, high] pair. */
const bracket = (sorted: number[], value: number): [number, number] | null => {
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (value > sorted[i] && value < sorted[i + 1]) return [sorted[i], sorted[i + 1]]
  }
  return null
}

const pointAt = (origin: Vec2, direction: Vec2, t: number): Vec2 => add(origin, mul(direction, t))

/**
 * Removes the piece of `entity` containing `pickPoint`, cut at every point where `cutters` cross
 * it. Returns the surviving pieces, or null when nothing crosses the entity there.
 */
export const trimEntity = (entity: CadEntity, cutters: CadEntity[], pickPoint: Vec2): CadEntity[] | null => {
  const others = cutters.filter((cutter) => cutter.id !== entity.id)

  if (entity.type === 'line') {
    const direction = sub(entity.end, entity.start)
    const lengthSquared = dot(direction, direction)
    if (lengthSquared < EPS) return null

    const cuts = crossingParameters(entity.start, direction, others).filter((t) => t > TOUCH && t < 1 - TOUCH)
    if (cuts.length === 0) return null

    const bounds = [0, ...cuts, 1].sort((a, b) => a - b)
    const pick = dot(sub(pickPoint, entity.start), direction) / lengthSquared
    const removed = bracket(bounds, Math.max(0, Math.min(1, pick)))
    if (!removed) return null

    const pieces: CadEntity[] = []
    for (let i = 0; i < bounds.length - 1; i += 1) {
      if (bounds[i] === removed[0] && bounds[i + 1] === removed[1]) continue
      if (bounds[i + 1] - bounds[i] < TOUCH) continue
      pieces.push({
        ...entity,
        id: pieces.length === 0 ? entity.id : uid(),
        start: pointAt(entity.start, direction, bounds[i]),
        end: pointAt(entity.start, direction, bounds[i + 1]),
      })
    }
    return pieces
  }

  if (entity.type === 'circle' || entity.type === 'arc') {
    const circle = entityCircle(entity)!
    const angles = crossingAngles(circle, others)
    if (angles.length === 0) return null

    const start = entity.type === 'arc' ? entity.startAngle : 0
    const span = entity.type === 'arc' ? arcSweep(entity) : Math.PI * 2
    const offsets = angles
      .map((angle) => normalizeAngle(angle - start))
      .filter((offset) => offset > TOUCH && offset < span - TOUCH)
    if (offsets.length === 0) return null

    const bounds = [0, ...offsets, span].sort((a, b) => a - b)
    const pick = normalizeAngle(Math.atan2(pickPoint.y - circle.center.y, pickPoint.x - circle.center.x) - start)
    const removed = bracket(bounds, pick)
    if (!removed) return null

    if (entity.type === 'circle') {
      // A full circle leaves exactly one arc: everything except the piece picked.
      const arc: ArcEntity = {
        id: entity.id,
        type: 'arc',
        layerId: entity.layerId,
        color: entity.color,
        linetypeId: entity.linetypeId,
        lineweight: entity.lineweight,
        center: entity.center,
        radius: entity.radius,
        startAngle: normalizeAngle(start + removed[1]),
        endAngle: normalizeAngle(start + removed[0]),
      }
      return [arc]
    }

    const pieces: CadEntity[] = []
    for (let i = 0; i < bounds.length - 1; i += 1) {
      if (bounds[i] === removed[0] && bounds[i + 1] === removed[1]) continue
      if (bounds[i + 1] - bounds[i] < TOUCH) continue
      pieces.push({
        ...entity,
        id: pieces.length === 0 ? entity.id : uid(),
        startAngle: normalizeAngle(start + bounds[i]),
        endAngle: normalizeAngle(start + bounds[i + 1]),
      })
    }
    return pieces
  }

  if (entity.type === 'polyline') {
    const points = entity.closed ? [...entity.points, entity.points[0]] : entity.points
    const cuts: number[] = []
    for (let i = 0; i < points.length - 1; i += 1) {
      const direction = sub(points[i + 1], points[i])
      for (const t of crossingParameters(points[i], direction, others)) {
        if (t > TOUCH && t < 1 - TOUCH) cuts.push(i + t)
      }
    }
    if (cuts.length === 0) return null

    const bounds = [0, ...cuts, points.length - 1].sort((a, b) => a - b)
    const pickIndex = closestSegmentIndex(points, false, pickPoint)
    const direction = sub(points[pickIndex + 1], points[pickIndex])
    const denominator = dot(direction, direction)
    const local = denominator < EPS ? 0 : dot(sub(pickPoint, points[pickIndex]), direction) / denominator
    const removed = bracket(bounds, pickIndex + Math.max(0, Math.min(1, local)))
    if (!removed) return null

    const sample = (parameter: number): Vec2 => {
      const index = Math.min(points.length - 2, Math.floor(parameter))
      return add(points[index], mul(sub(points[index + 1], points[index]), parameter - index))
    }
    const between = (from: number, to: number): Vec2[] => {
      const result = [sample(from)]
      for (let index = Math.ceil(from); index <= Math.floor(to); index += 1) {
        if (index > from && index < to) result.push(points[index])
      }
      result.push(sample(to))
      return result
    }

    const pieces: CadEntity[] = []
    for (let i = 0; i < bounds.length - 1; i += 1) {
      if (bounds[i] === removed[0] && bounds[i + 1] === removed[1]) continue
      if (bounds[i + 1] - bounds[i] < TOUCH) continue
      const piece: PolylineEntity = {
        ...entity,
        id: pieces.length === 0 ? entity.id : uid(),
        closed: false,
        points: between(bounds[i], bounds[i + 1]),
      }
      pieces.push(piece)
    }
    return pieces
  }

  return null
}

/* ------------------------------------------------------------------ extend */

const nearestForwardParameter = (origin: Vec2, direction: Vec2, others: CadEntity[]): number | null => {
  const candidates = crossingParameters(origin, direction, others).filter((t) => t > TOUCH)
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

/**
 * Lengthens the end of `entity` nearest `pickPoint` until it meets the closest boundary,
 * returning null when nothing lies ahead of that end.
 */
export const extendEntity = (entity: CadEntity, boundaries: CadEntity[], pickPoint: Vec2): CadEntity | null => {
  const others = boundaries.filter((boundary) => boundary.id !== entity.id)

  if (entity.type === 'line') {
    const extendEnd = distance(pickPoint, entity.end) <= distance(pickPoint, entity.start)
    const origin = extendEnd ? entity.end : entity.start
    const direction = normalize(extendEnd ? sub(entity.end, entity.start) : sub(entity.start, entity.end))
    const t = nearestForwardParameter(origin, direction, others)
    if (t === null) return null
    const target = add(origin, mul(direction, t))
    return extendEnd ? { ...entity, end: target } : { ...entity, start: target }
  }

  if (entity.type === 'polyline' && !entity.closed && entity.points.length >= 2) {
    const extendEnd = distance(pickPoint, entity.points.at(-1)!) <= distance(pickPoint, entity.points[0])
    const origin = extendEnd ? entity.points.at(-1)! : entity.points[0]
    const inward = extendEnd ? entity.points.at(-2)! : entity.points[1]
    const direction = normalize(sub(origin, inward))
    const t = nearestForwardParameter(origin, direction, others)
    if (t === null) return null
    const target = add(origin, mul(direction, t))
    const points = [...entity.points]
    if (extendEnd) points[points.length - 1] = target
    else points[0] = target
    return { ...entity, points }
  }

  if (entity.type === 'arc') {
    // Extending means going beyond the current sweep, so the whole circle is considered.
    const fullCircle = { center: entity.center, radius: entity.radius }
    const sweep = arcSweep(entity)
    const angles = crossingAngles(fullCircle, others).map((angle) => normalizeAngle(angle - entity.startAngle))
    const pick = normalizeAngle(
      Math.atan2(pickPoint.y - entity.center.y, pickPoint.x - entity.center.x) - entity.startAngle,
    )
    const extendEnd = pick > sweep / 2 && pick <= sweep

    if (extendEnd) {
      const ahead = angles.filter((angle) => angle > sweep + TOUCH)
      if (ahead.length === 0) return null
      return { ...entity, endAngle: normalizeAngle(entity.startAngle + Math.min(...ahead)) }
    }

    // Going backwards from the start means the largest offset short of a full turn.
    const behind = angles.filter((angle) => angle > sweep + TOUCH)
    if (behind.length === 0) return null
    return { ...entity, startAngle: normalizeAngle(entity.startAngle + Math.max(...behind)) }
  }

  return null
}
