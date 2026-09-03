import { normalizeAngle, pointSegmentDistance, uid } from './geometry'
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
 * Preview pieces are rebuilt on every mouse move, so they carry a stable id derived from the
 * entity they came from. Without it React would remount the preview on each frame.
 */
const previewId = (id: string, kind: 'trim' | 'extend'): string => `${id}::${kind}-preview`

/**
 * True when an edge meets the object at one of its ends rather than across the middle.
 *
 * This is what happens to a piece that has already been trimmed: its ends now sit exactly on the
 * edges that produced it. There is nothing left to cut, so picking it erases it outright, which
 * is how AutoCAD treats a segment bounded by an edge at one end and free at the other.
 */
const meetsAtAnEnd = (crossings: number[], from: number, to: number): boolean =>
  crossings.some((value) => Math.abs(value - from) <= TOUCH || Math.abs(value - to) <= TOUCH)

export type TrimResult = {
  /** The piece the pick point sits on: what a click would delete. */
  removed: CadEntity
  /** What survives, ready to replace the original entity. */
  remaining: CadEntity[]
}

/**
 * Works out what trimming `entity` at `pickPoint` would do. The entity is cut wherever `cutters`
 * cross it and the piece under the pick point is the one that goes, which is why clicking the
 * middle of a line crossed twice leaves the two outer stubs behind.
 *
 * Returns null when nothing crosses the entity, matching AutoCAD's refusal to trim an object
 * that does not meet an edge.
 */
export const trimResult = (entity: CadEntity, cutters: CadEntity[], pickPoint: Vec2): TrimResult | null => {
  const others = cutters.filter((cutter) => cutter.id !== entity.id)

  if (entity.type === 'line') {
    const direction = sub(entity.end, entity.start)
    const lengthSquared = dot(direction, direction)
    if (lengthSquared < EPS) return null

    const crossings = crossingParameters(entity.start, direction, others)
    const cuts = crossings.filter((t) => t > TOUCH && t < 1 - TOUCH)
    if (cuts.length === 0) {
      if (!meetsAtAnEnd(crossings, 0, 1)) return null
      return { removed: { ...entity, id: previewId(entity.id, 'trim') }, remaining: [] }
    }

    const bounds = [0, ...cuts, 1].sort((a, b) => a - b)
    const pick = dot(sub(pickPoint, entity.start), direction) / lengthSquared
    const span = bracket(bounds, Math.max(0, Math.min(1, pick)))
    if (!span) return null

    const remaining: CadEntity[] = []
    for (let i = 0; i < bounds.length - 1; i += 1) {
      if (bounds[i] === span[0] && bounds[i + 1] === span[1]) continue
      if (bounds[i + 1] - bounds[i] < TOUCH) continue
      remaining.push({
        ...entity,
        id: remaining.length === 0 ? entity.id : uid(),
        start: pointAt(entity.start, direction, bounds[i]),
        end: pointAt(entity.start, direction, bounds[i + 1]),
      })
    }
    return {
      removed: {
        ...entity,
        id: previewId(entity.id, 'trim'),
        start: pointAt(entity.start, direction, span[0]),
        end: pointAt(entity.start, direction, span[1]),
      },
      remaining,
    }
  }

  if (entity.type === 'circle' || entity.type === 'arc') {
    const circle = entityCircle(entity)!
    const angles = crossingAngles(circle, others)
    if (angles.length === 0) return null

    const start = entity.type === 'arc' ? entity.startAngle : 0
    const total = entity.type === 'arc' ? arcSweep(entity) : Math.PI * 2
    const crossings = angles.map((angle) => normalizeAngle(angle - start))
    const offsets = crossings.filter((offset) => offset > TOUCH && offset < total - TOUCH)

    const arcPiece = (id: string, from: number, to: number): ArcEntity => ({
      id,
      type: 'arc',
      layerId: entity.layerId,
      color: entity.color,
      linetypeId: entity.linetypeId,
      lineweight: entity.lineweight,
      center: entity.center,
      radius: entity.radius,
      startAngle: normalizeAngle(start + from),
      endAngle: normalizeAngle(start + to),
    })

    if (offsets.length === 0) {
      // A circle has no ends, so with nothing crossing it there is nothing to trim.
      if (entity.type === 'circle') return null
      if (!meetsAtAnEnd(crossings, 0, total) && !meetsAtAnEnd(crossings, Math.PI * 2, total)) return null
      return { removed: arcPiece(previewId(entity.id, 'trim'), 0, total), remaining: [] }
    }

    const bounds = [0, ...offsets, total].sort((a, b) => a - b)
    const pick = normalizeAngle(Math.atan2(pickPoint.y - circle.center.y, pickPoint.x - circle.center.x) - start)
    const span = bracket(bounds, pick)
    if (!span) return null

    const removed = arcPiece(previewId(entity.id, 'trim'), span[0], span[1])

    if (entity.type === 'circle') {
      // A full circle leaves exactly one arc: everything except the piece picked.
      return { removed, remaining: [arcPiece(entity.id, span[1], span[0])] }
    }

    const remaining: CadEntity[] = []
    for (let i = 0; i < bounds.length - 1; i += 1) {
      if (bounds[i] === span[0] && bounds[i + 1] === span[1]) continue
      if (bounds[i + 1] - bounds[i] < TOUCH) continue
      remaining.push(arcPiece(remaining.length === 0 ? entity.id : uid(), bounds[i], bounds[i + 1]))
    }
    return { removed, remaining }
  }

  if (entity.type === 'polyline') {
    const points = entity.closed ? [...entity.points, entity.points[0]] : entity.points
    const last = points.length - 1
    const crossings: number[] = []
    const cuts: number[] = []
    for (let i = 0; i < last; i += 1) {
      const direction = sub(points[i + 1], points[i])
      for (const t of crossingParameters(points[i], direction, others)) {
        if (t < -TOUCH || t > 1 + TOUCH) continue
        // Measuring against the whole polyline lets a cut land on a vertex shared by two segments.
        const along = i + t
        crossings.push(along)
        if (along > TOUCH && along < last - TOUCH) cuts.push(along)
      }
    }
    if (cuts.length === 0) {
      if (!meetsAtAnEnd(crossings, 0, last)) return null
      return { removed: { ...entity, id: previewId(entity.id, 'trim'), closed: false }, remaining: [] }
    }

    const bounds = [0, ...cuts, last].sort((a, b) => a - b)
    const pickIndex = closestSegmentIndex(points, false, pickPoint)
    const direction = sub(points[pickIndex + 1], points[pickIndex])
    const denominator = dot(direction, direction)
    const local = denominator < EPS ? 0 : dot(sub(pickPoint, points[pickIndex]), direction) / denominator
    const span = bracket(bounds, pickIndex + Math.max(0, Math.min(1, local)))
    if (!span) return null

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

    const remaining: CadEntity[] = []
    for (let i = 0; i < bounds.length - 1; i += 1) {
      if (bounds[i] === span[0] && bounds[i + 1] === span[1]) continue
      if (bounds[i + 1] - bounds[i] < TOUCH) continue
      const piece: PolylineEntity = {
        ...entity,
        id: remaining.length === 0 ? entity.id : uid(),
        closed: false,
        points: between(bounds[i], bounds[i + 1]),
      }
      remaining.push(piece)
    }
    return {
      removed: { ...entity, id: previewId(entity.id, 'trim'), closed: false, points: between(span[0], span[1]) },
      remaining,
    }
  }

  return null
}

/**
 * Removes the piece of `entity` containing `pickPoint`, cut at every point where `cutters` cross
 * it. Returns the surviving pieces, or null when nothing crosses the entity there.
 */
export const trimEntity = (entity: CadEntity, cutters: CadEntity[], pickPoint: Vec2): CadEntity[] | null =>
  trimResult(entity, cutters, pickPoint)?.remaining ?? null

/* ------------------------------------------------------------------ extend */

const nearestForwardParameter = (origin: Vec2, direction: Vec2, others: CadEntity[]): number | null => {
  const candidates = crossingParameters(origin, direction, others).filter((t) => t > TOUCH)
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

export type ExtendResult = {
  /** The entity with the picked end pushed out to the boundary. */
  entity: CadEntity
  /** Only the new material, so a hover preview can show what would be gained. */
  added: CadEntity
}

/**
 * Works out what extending `entity` at `pickPoint` would do. The end nearest the pick is the one
 * that grows, and it stops at the first boundary it meets, so picking near one end of a line and
 * then the other extends each way independently.
 */
export const extendResult = (entity: CadEntity, boundaries: CadEntity[], pickPoint: Vec2): ExtendResult | null => {
  const others = boundaries.filter((boundary) => boundary.id !== entity.id)

  if (entity.type === 'line') {
    const extendEnd = distance(pickPoint, entity.end) <= distance(pickPoint, entity.start)
    const origin = extendEnd ? entity.end : entity.start
    const direction = normalize(extendEnd ? sub(entity.end, entity.start) : sub(entity.start, entity.end))
    const t = nearestForwardParameter(origin, direction, others)
    if (t === null) return null
    const target = add(origin, mul(direction, t))
    return {
      entity: extendEnd ? { ...entity, end: target } : { ...entity, start: target },
      added: { ...entity, id: previewId(entity.id, 'extend'), start: origin, end: target },
    }
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
    return {
      entity: { ...entity, points },
      added: {
        id: previewId(entity.id, 'extend'),
        type: 'line',
        layerId: entity.layerId,
        color: entity.color,
        linetypeId: entity.linetypeId,
        lineweight: entity.lineweight,
        start: origin,
        end: target,
      },
    }
  }

  if (entity.type === 'arc') {
    // Extending means going beyond the current sweep, so the whole circle is considered.
    const fullCircle = { center: entity.center, radius: entity.radius }
    const sweep = arcSweep(entity)
    const angles = crossingAngles(fullCircle, others)
      .map((angle) => normalizeAngle(angle - entity.startAngle))
      .filter((angle) => angle > sweep + TOUCH)
    if (angles.length === 0) return null

    const pick = normalizeAngle(
      Math.atan2(pickPoint.y - entity.center.y, pickPoint.x - entity.center.x) - entity.startAngle,
    )
    const extendEnd = pick > sweep / 2 && pick <= sweep

    const arcPiece = (id: string, from: number, to: number): ArcEntity => ({
      id,
      type: 'arc',
      layerId: entity.layerId,
      color: entity.color,
      linetypeId: entity.linetypeId,
      lineweight: entity.lineweight,
      center: entity.center,
      radius: entity.radius,
      startAngle: normalizeAngle(entity.startAngle + from),
      endAngle: normalizeAngle(entity.startAngle + to),
    })

    if (extendEnd) {
      const stop = Math.min(...angles)
      return {
        entity: { ...entity, endAngle: normalizeAngle(entity.startAngle + stop) },
        added: arcPiece(previewId(entity.id, 'extend'), sweep, stop),
      }
    }

    // Going backwards from the start means the largest offset short of a full turn.
    const stop = Math.max(...angles)
    return {
      entity: { ...entity, startAngle: normalizeAngle(entity.startAngle + stop) },
      added: arcPiece(previewId(entity.id, 'extend'), stop, Math.PI * 2),
    }
  }

  return null
}

/**
 * Lengthens the end of `entity` nearest `pickPoint` until it meets the closest boundary,
 * returning null when nothing lies ahead of that end.
 */
export const extendEntity = (entity: CadEntity, boundaries: CadEntity[], pickPoint: Vec2): CadEntity | null =>
  extendResult(entity, boundaries, pickPoint)?.entity ?? null

/* -------------------------------------------------------- fillet, chamfer */

/**
 * FILLET and CHAMFER work on a corner, and a corner is made of two straight runs. Those runs may
 * be whole lines or two sides of a rectangle, so everything below is written against segments and
 * only looks at the object they came from when it is time to write the answer back.
 */
export type CornerPick = { entity: CadEntity; point: Vec2 }

/** One straight run of an object, numbered so the answer can be written back to the right place. */
type PickedSegment = { index: number; a: Vec2; b: Vec2 }

const straightSegments = (entity: CadEntity): PickedSegment[] => {
  if (entity.type === 'line') return [{ index: 0, a: entity.start, b: entity.end }]
  if (entity.type === 'polyline') {
    const count = entity.closed ? entity.points.length : entity.points.length - 1
    return Array.from({ length: Math.max(0, count) }, (_, index) => ({
      index,
      a: entity.points[index],
      b: entity.points[(index + 1) % entity.points.length],
    }))
  }
  return []
}

/** True for the objects FILLET and CHAMFER can cut, which is anything built from straight runs. */
export const hasStraightSegments = (entity: CadEntity): boolean => straightSegments(entity).length > 0

const nearestSegment = (entity: CadEntity, point: Vec2): PickedSegment | null => {
  let best: PickedSegment | null = null
  let bestDistance = Infinity
  for (const segment of straightSegments(entity)) {
    const measured = pointSegmentDistance(point, segment.a, segment.b)
    if (measured < bestDistance) {
      bestDistance = measured
      best = segment
    }
  }
  return best
}

/**
 * The corner two picked runs make, and which way each one leads away from it.
 *
 * The runs need not already touch: as in AutoCAD the meeting point may be a virtual one that both
 * get extended to reach, and the arm that survives is the side that was clicked.
 */
type CornerFrame = {
  corner: Vec2
  /** Unit vectors leading away from the corner along the part of each run that is kept. */
  towardA: Vec2
  towardB: Vec2
  /** How far each kept arm reaches, which limits how much corner can be cut away. */
  reachA: number
  reachB: number
  /** The angle the arms open by, in (0, pi). */
  opening: number
}

const cornerFrame = (
  first: PickedSegment,
  second: PickedSegment,
  pickA: Vec2,
  pickB: Vec2,
): CornerFrame | null => {
  const corner = infiniteIntersection({ a: first.a, b: first.b }, { a: second.a, b: second.b })
  if (!corner) return null

  const arm = (segment: PickedSegment, pick: Vec2): { toward: Vec2; reach: number } | null => {
    const along = normalize(sub(segment.b, segment.a))
    if (!Number.isFinite(along.x)) return null
    // The click decides which side of the corner is kept.
    const side = dot(sub(pick, corner), along)
    if (Math.abs(side) < EPS) return null
    const toward = mul(along, side > 0 ? 1 : -1)
    const reach = Math.max(dot(sub(segment.a, corner), toward), dot(sub(segment.b, corner), toward))
    return { toward, reach }
  }

  const armA = arm(first, pickA)
  const armB = arm(second, pickB)
  if (!armA || !armB) return null

  const opening = Math.acos(Math.max(-1, Math.min(1, dot(armA.toward, armB.toward))))
  // Parallel or doubled-back arms leave no corner to cut.
  if (opening < EPS || Math.PI - opening < EPS) return null

  return {
    corner,
    towardA: armA.toward,
    towardB: armB.toward,
    reachA: armA.reach,
    reachB: armB.reach,
    opening,
  }
}

export type CornerResult = {
  /** The objects the corner was taken from. They make way for `pieces`. */
  replacedIds: string[]
  /** Everything that stands in their place, including the arc or bevel closing the corner. */
  pieces: CadEntity[]
}

/** Where each run gets cut back to, and the arc that rounds the corner if there is one. */
type CornerCut = { targetA: Vec2; targetB: Vec2; arc: ArcEntity | null }

const inherited = (entity: CadEntity) => ({
  layerId: entity.layerId,
  color: entity.color,
  linetypeId: entity.linetypeId,
  lineweight: entity.lineweight,
})

/** Moves whichever end of a straight run sits past the corner in to `target`. */
const movedEnd = (segment: PickedSegment, corner: Vec2, toward: Vec2): 'a' | 'b' =>
  dot(sub(segment.a, corner), toward) > dot(sub(segment.b, corner), toward) ? 'b' : 'a'

/** Drags one end of a straight run to `target`, whether it is a whole line or one polyline leg. */
const moveSegmentEnd = (
  pick: CornerPick,
  segment: PickedSegment,
  end: 'a' | 'b',
  target: Vec2,
): CadEntity | null => {
  if (pick.entity.type === 'line') {
    return end === 'b' ? { ...pick.entity, end: target } : { ...pick.entity, start: target }
  }
  if (pick.entity.type !== 'polyline') return null
  const points = [...pick.entity.points]
  points[end === 'b' ? (segment.index + 1) % points.length : segment.index] = target
  return { ...pick.entity, points }
}

/** The shorter of the two arcs joining `from` to `to` around `centre`. */
const minorArc = (centre: Vec2, radius: number, from: Vec2, to: Vec2, source: CadEntity): ArcEntity => {
  const angleFrom = Math.atan2(from.y - centre.y, from.x - centre.x)
  const angleTo = Math.atan2(to.y - centre.y, to.x - centre.x)
  // Arcs are stored anticlockwise, so the ends are ordered to give the short way round.
  const anticlockwise = normalizeAngle(angleTo - angleFrom) <= Math.PI
  return {
    id: uid(),
    type: 'arc',
    ...inherited(source),
    center: centre,
    radius,
    startAngle: anticlockwise ? angleFrom : angleTo,
    endAngle: anticlockwise ? angleTo : angleFrom,
  }
}

/** The vertex two runs of the same polyline share, or null when they are not neighbours. */
const sharedVertex = (entity: PolylineEntity, first: number, second: number): number | null => {
  const count = entity.points.length
  const follows = (earlier: number, later: number) =>
    entity.closed ? (earlier + 1) % count === later : earlier + 1 === later
  if (follows(first, second)) return second
  if (follows(second, first)) return first
  return null
}

/**
 * Rewrites a polyline so the corner at `shared` is replaced by the two points the cut lands on.
 *
 * A chamfer is finished here: the polyline simply gains a bevelled vertex. A fillet has to go
 * further, because a polyline draws a straight chord between its points and that chord would sit
 * underneath the arc, so the run is broken open at the corner instead.
 */
const rewriteCorner = (
  entity: PolylineEntity,
  shared: number,
  arriving: Vec2,
  leaving: Vec2,
  breakOpen: boolean,
): CadEntity[] => {
  const points = [...entity.points]
  const squared = distance(arriving, leaving) < TOUCH
  points.splice(shared, 1, ...(squared ? [arriving] : [arriving, leaving]))

  if (!breakOpen || squared) return [{ ...entity, points }]

  // The gap goes between the two new points, which sit at `shared` and `shared + 1`.
  if (entity.closed) {
    // Closed runs only need unrolling: start just after the gap and finish just before it.
    return [{ ...entity, closed: false, points: [...points.slice(shared + 1), ...points.slice(0, shared + 1)] }]
  }

  const before = points.slice(0, shared + 1)
  const after = points.slice(shared + 1)
  return [
    ...(before.length >= 2 ? [{ ...entity, points: before }] : []),
    ...(after.length >= 2 ? [{ ...entity, id: uid(), points: after }] : []),
  ]
}

/** Turns the geometric answer into the objects that replace what was picked. */
const applyCorner = (
  a: CornerPick,
  b: CornerPick,
  segmentA: PickedSegment,
  segmentB: PickedSegment,
  frame: CornerFrame,
  cut: CornerCut,
  bevel: boolean,
): CornerResult | null => {
  const { corner, towardA, towardB } = frame

  // Two runs of one polyline meeting at a vertex, which is a rectangle corner: the vertex itself
  // is rewritten, so the shape stays a single object instead of being broken into parts. A bevel
  // needs nothing else, because the rewritten vertex already draws it.
  if (a.entity.id === b.entity.id) {
    if (a.entity.type !== 'polyline') return null
    const shared = sharedVertex(a.entity, segmentA.index, segmentB.index)
    if (shared === null) return null
    // Whichever run arrives at the shared vertex contributes the first of the two new points.
    const aArrives = movedEnd(segmentA, corner, towardA) === 'b'
    const arriving = aArrives ? cut.targetA : cut.targetB
    const leaving = aArrives ? cut.targetB : cut.targetA
    return {
      replacedIds: [a.entity.id],
      pieces: [
        ...rewriteCorner(a.entity, shared, arriving, leaving, cut.arc !== null),
        ...(cut.arc ? [cut.arc] : []),
      ],
    }
  }

  const bridge: CadEntity[] = cut.arc
    ? [cut.arc]
    : bevel && distance(cut.targetA, cut.targetB) > TOUCH
      ? [{ id: uid(), type: 'line', ...inherited(a.entity), start: cut.targetA, end: cut.targetB }]
      : []

  const shortened = (pick: CornerPick, segment: PickedSegment, toward: Vec2, target: Vec2): CadEntity | null =>
    moveSegmentEnd(pick, segment, movedEnd(segment, corner, toward), target)

  const firstPiece = shortened(a, segmentA, towardA, cut.targetA)
  const secondPiece = shortened(b, segmentB, towardB, cut.targetB)
  if (!firstPiece || !secondPiece) return null

  return { replacedIds: [a.entity.id, b.entity.id], pieces: [firstPiece, secondPiece, ...bridge] }
}

/* ------------------------------------------------ fillets against curves */

/** A picked circle or arc, reduced to the full circle it lies on. */
type PickedCurve = { center: Vec2; radius: number; arc: ArcEntity | null }

const asCurve = (entity: CadEntity): PickedCurve | null => {
  if (entity.type === 'circle') return { center: entity.center, radius: entity.radius, arc: null }
  if (entity.type === 'arc') return { center: entity.center, radius: entity.radius, arc: entity }
  return null
}

/** The objects FILLET can cut, which unlike CHAMFER takes in circles and arcs. */
export const canFillet = (entity: CadEntity): boolean =>
  hasStraightSegments(entity) || asCurve(entity) !== null

/** Where an infinite line meets a circle, as distances along `direction` from `origin`. */
const lineCircleRoots = (origin: Vec2, direction: Vec2, center: Vec2, radius: number): number[] => {
  const toOrigin = sub(origin, center)
  const half = dot(toOrigin, direction)
  const discriminant = half * half - (dot(toOrigin, toOrigin) - radius * radius)
  if (discriminant < 0) return []
  if (discriminant < EPS) return [-half]
  const root = Math.sqrt(discriminant)
  return [-half - root, -half + root]
}

/**
 * Every centre an arc of `radius` could have while touching both the straight run and the circle.
 *
 * There are up to eight of them: the fillet may sit on either side of the line, and may either hug
 * the outside of the circle or curl against the inside, and each of those meets the line twice.
 * Which one the user meant is settled later by seeing which lands nearest the two clicks.
 */
const filletCentres = (segment: PickedSegment, curve: PickedCurve, radius: number): Vec2[] => {
  const along = normalize(sub(segment.b, segment.a))
  if (!Number.isFinite(along.x)) return []
  const away = perpendicular(along)

  const centres: Vec2[] = []
  for (const side of [1, -1]) {
    const origin = add(segment.a, mul(away, side * radius))
    for (const reach of [curve.radius + radius, Math.abs(curve.radius - radius)]) {
      if (reach < EPS) continue
      for (const step of lineCircleRoots(origin, along, curve.center, reach)) {
        centres.push(add(origin, mul(along, step)))
      }
    }
  }
  return centres
}

/** Where a circle of `radius` centred at `from` touches the picked curve. */
const touchOnCurve = (curve: PickedCurve, from: Vec2, radius: number): Vec2 | null => {
  const direction = normalize(sub(from, curve.center))
  if (!Number.isFinite(direction.x)) return null
  for (const sign of [1, -1]) {
    const point = add(curve.center, mul(direction, sign * curve.radius))
    if (Math.abs(distance(point, from) - radius) < 1e-6) return point
  }
  return null
}

/** Drops `point` onto the infinite line the run lies on. */
const footOnLine = (segment: PickedSegment, point: Vec2): Vec2 => {
  const along = normalize(sub(segment.b, segment.a))
  return add(segment.a, mul(along, dot(sub(point, segment.a), along)))
}

/**
 * Cuts a straight run back to `target`, keeping the end the click was nearest.
 *
 * Unlike the two-run case there is no corner to measure from, so the click alone says which side
 * survives. Returns null if `target` sits past the click, which would turn the run inside out.
 */
const trimStraightTo = (pick: CornerPick, segment: PickedSegment, target: Vec2): CadEntity | null => {
  const along = normalize(sub(segment.b, segment.a))
  if (!Number.isFinite(along.x)) return null
  const from = (point: Vec2) => dot(sub(point, target), along)

  const clicked = from(pick.point)
  const keepA = clicked < 0
  const kept = keepA ? from(segment.a) : from(segment.b)
  if (keepA ? kept > clicked + TOUCH : kept < clicked - TOUCH) return null
  return moveSegmentEnd(pick, segment, keepA ? 'b' : 'a', target)
}

/** Cuts an arc back to `target`, keeping the side the click was on. */
const trimArcTo = (arc: ArcEntity, pick: Vec2, target: Vec2): ArcEntity | null => {
  const angleAt = (point: Vec2) => Math.atan2(point.y - arc.center.y, point.x - arc.center.x)
  const cut = normalizeAngle(angleAt(target) - arc.startAngle)
  // A tangent point outside the drawn sweep would mean extending the arc, which FILLET does not do.
  if (cut > arcSweep(arc) + TOUCH) return null
  const clicked = normalizeAngle(angleAt(pick) - arc.startAngle)
  return clicked <= cut ? { ...arc, endAngle: angleAt(target) } : { ...arc, startAngle: angleAt(target) }
}

/**
 * Rounds the join between a straight run and a circle or arc.
 *
 * Circles are left whole, as AutoCAD leaves them: only the straight run is cut back, and the
 * fillet bridges the gap. Arcs are trimmed to the tangent point like any other edge.
 */
const filletAgainstCurve = (
  straight: CornerPick,
  curved: CornerPick,
  curve: PickedCurve,
  radius: number,
): CornerResult | null => {
  const segment = nearestSegment(straight.entity, straight.point)
  if (!segment) return null

  const magnitude = Math.abs(radius)
  const along = normalize(sub(segment.b, segment.a))
  if (!Number.isFinite(along.x)) return null

  type Meeting = { onLine: Vec2; onCurve: Vec2; bridge: ArcEntity | null }
  const meetings: Meeting[] =
    magnitude < EPS
      ? // A zero radius squares the join off, so the two simply meet where they cross.
        lineCircleRoots(segment.a, along, curve.center, curve.radius)
          .map((step) => add(segment.a, mul(along, step)))
          .map((point) => ({ onLine: point, onCurve: point, bridge: null }))
      : filletCentres(segment, curve, magnitude).flatMap((centre) => {
          const onCurve = touchOnCurve(curve, centre, magnitude)
          if (!onCurve) return []
          const onLine = footOnLine(segment, centre)
          if (Math.abs(distance(onLine, centre) - magnitude) > 1e-6) return []
          return [{ onLine, onCurve, bridge: minorArc(centre, magnitude, onLine, onCurve, straight.entity) }]
        })

  // The fillet the user meant is the one that lands nearest both clicks.
  const ranked = meetings
    .map((meeting) => ({
      meeting,
      distance: distance(meeting.onLine, straight.point) + distance(meeting.onCurve, curved.point),
    }))
    .sort((first, second) => first.distance - second.distance)

  for (const { meeting } of ranked) {
    const cutStraight = trimStraightTo(straight, segment, meeting.onLine)
    if (!cutStraight) continue
    const cutCurve = curve.arc ? trimArcTo(curve.arc, curved.point, meeting.onCurve) : null
    if (curve.arc && !cutCurve) continue
    return {
      replacedIds: [straight.entity.id, ...(cutCurve ? [curved.entity.id] : [])],
      pieces: [cutStraight, ...(cutCurve ? [cutCurve] : []), ...(meeting.bridge ? [meeting.bridge] : [])],
    }
  }
  return null
}

/**
 * Rounds the corner between two straight runs with an arc of the given radius, tangent to both.
 *
 * A radius of zero is AutoCAD's shortcut for squaring the corner off instead, trimming or
 * extending both runs to meet at a sharp point. Returns null when the runs are parallel or when
 * the arc would need more length than either run has.
 */
export const filletCorner = (a: CornerPick, b: CornerPick, radius: number): CornerResult | null => {
  if (!Number.isFinite(radius)) return null

  // A circle or arc on either side sends this down the curved path instead.
  const curveA = asCurve(a.entity)
  const curveB = asCurve(b.entity)
  if (curveA && curveB) return null
  if (curveB) return filletAgainstCurve(a, b, curveB, radius)
  if (curveA) return filletAgainstCurve(b, a, curveA, radius)

  const segmentA = nearestSegment(a.entity, a.point)
  const segmentB = nearestSegment(b.entity, b.point)
  if (!segmentA || !segmentB) return null
  if (a.entity.id === b.entity.id && segmentA.index === segmentB.index) return null

  const frame = cornerFrame(segmentA, segmentB, a.point, b.point)
  if (!frame) return null

  const magnitude = Math.abs(radius)
  if (magnitude < EPS) {
    const cut = { targetA: frame.corner, targetB: frame.corner, arc: null }
    return applyCorner(a, b, segmentA, segmentB, frame, cut, false)
  }

  // The tangent points stand back from the corner by the half angle's tangent.
  const setback = magnitude / Math.tan(frame.opening / 2)
  if (setback > frame.reachA + TOUCH || setback > frame.reachB + TOUCH) return null

  const targetA = add(frame.corner, mul(frame.towardA, setback))
  const targetB = add(frame.corner, mul(frame.towardB, setback))

  const bisector = normalize(add(frame.towardA, frame.towardB))
  if (!Number.isFinite(bisector.x)) return null
  const center = add(frame.corner, mul(bisector, magnitude / Math.sin(frame.opening / 2)))

  const arc = minorArc(center, magnitude, targetA, targetB, a.entity)
  return applyCorner(a, b, segmentA, segmentB, frame, { targetA, targetB, arc }, false)
}

/**
 * Cuts the corner between two straight runs with a straight bevel, set back along each by its own
 * distance. Two zero distances square the corner off, as they do in AutoCAD.
 */
export const chamferCorner = (
  a: CornerPick,
  b: CornerPick,
  distanceA: number,
  distanceB: number,
): CornerResult | null => {
  if (!Number.isFinite(distanceA) || !Number.isFinite(distanceB)) return null
  const segmentA = nearestSegment(a.entity, a.point)
  const segmentB = nearestSegment(b.entity, b.point)
  if (!segmentA || !segmentB) return null
  if (a.entity.id === b.entity.id && segmentA.index === segmentB.index) return null

  const frame = cornerFrame(segmentA, segmentB, a.point, b.point)
  if (!frame) return null

  const backA = Math.abs(distanceA)
  const backB = Math.abs(distanceB)
  if (backA > frame.reachA + TOUCH || backB > frame.reachB + TOUCH) return null

  const targetA = add(frame.corner, mul(frame.towardA, backA))
  const targetB = add(frame.corner, mul(frame.towardB, backB))
  return applyCorner(a, b, segmentA, segmentB, frame, { targetA, targetB, arc: null }, true)
}

/* ------------------------------------------------------------------- fence */

export type FenceHit = {
  entity: CadEntity
  /** Where the fence crossed, which is the point the trim or extend is picked at. */
  point: Vec2
}

/**
 * Every place a fence line crosses the given entities, ordered along the fence.
 *
 * Dragging a fence is how AutoCAD trims a run of objects in one stroke: each crossing becomes a
 * pick, so a single swipe through a ladder of lines cuts all of them.
 */
export const fenceHits = (entities: CadEntity[], from: Vec2, to: Vec2): FenceHit[] => {
  const direction = sub(to, from)
  if (dot(direction, direction) < EPS) return []

  const hits: (FenceHit & { at: number })[] = []
  const record = (entity: CadEntity, t: number) => {
    if (t < -TOUCH || t > 1 + TOUCH) return
    hits.push({ entity, point: add(from, mul(direction, t)), at: t })
  }

  for (const entity of entities) {
    for (const segment of entitySegments(entity)) {
      const t = segmentParameters(from, direction, segment)
      if (t !== null) record(entity, t)
    }
    const circle = entityCircle(entity)
    if (circle) {
      for (const t of circleParameters(from, direction, circle)) record(entity, t)
    }
  }

  return hits.sort((a, b) => a.at - b.at).map(({ entity, point }) => ({ entity, point }))
}
