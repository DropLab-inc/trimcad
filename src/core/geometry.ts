import {
  add,
  distance,
  dot,
  length,
  mirrorPointOnLine,
  mul,
  normalize,
  rotateAround,
  sub,
  type Vec2,
} from './math/vec2'
import type {
  ArcEntity,
  CadEntity,
  CircleEntity,
  DimensionEntity,
  EllipseEntity,
  InsertEntity,
  PolylineEntity,
  SplineEntity,
} from './types'

const EPS = 1e-6

export const uid = () => crypto.randomUUID()

export const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export const angleBetween = (a: Vec2, b: Vec2): number => Math.atan2(b.y - a.y, b.x - a.x)

export const polar = (base: Vec2, radius: number, angleRad: number): Vec2 => ({
  x: base.x + Math.cos(angleRad) * radius,
  y: base.y + Math.sin(angleRad) * radius,
})

export const pointSegmentDistance = (p: Vec2, a: Vec2, b: Vec2): number => {
  const ab = sub(b, a)
  const denom = dot(ab, ab)
  if (denom < EPS) {
    return distance(p, a)
  }
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / denom))
  const closest = add(a, mul(ab, t))
  return distance(p, closest)
}

export const isPointNearEntity = (point: Vec2, entity: CadEntity, tol: number): boolean => {
  switch (entity.type) {
    case 'line':
      return pointSegmentDistance(point, entity.start, entity.end) <= tol
    case 'circle':
      return Math.abs(distance(point, entity.center) - entity.radius) <= tol
    case 'arc':
      return isPointNearArc(point, entity, tol)
    case 'ellipse':
      return isPointNearEllipse(point, entity, tol)
    case 'polyline':
      return isPointNearPolyline(point, entity, tol)
    case 'spline':
      return isPointNearSpline(point, entity, tol)
    case 'hatch':
      return isPointInPolygon(point, entity.boundary)
    case 'text':
      return distance(point, entity.position) <= tol * 2
    case 'dimension':
      return pointSegmentDistance(point, entity.p1, entity.p2) <= tol
    case 'insert':
      return distance(point, entity.position) <= tol * 2
    default:
      return false
  }
}

const isPointNearPolyline = (p: Vec2, polyline: PolylineEntity, tol: number): boolean => {
  for (let i = 0; i < polyline.points.length - 1; i += 1) {
    if (pointSegmentDistance(p, polyline.points[i], polyline.points[i + 1]) <= tol) {
      return true
    }
  }
  if (polyline.closed && polyline.points.length > 2) {
    return pointSegmentDistance(p, polyline.points.at(-1)!, polyline.points[0]) <= tol
  }
  return false
}

const isPointNearSpline = (p: Vec2, spline: SplineEntity, tol: number): boolean => {
  const pts = spline.controlPoints
  if (pts.length < 2) return false
  for (let i = 0; i < pts.length - 1; i += 1) {
    if (pointSegmentDistance(p, pts[i], pts[i + 1]) <= tol) {
      return true
    }
  }
  return false
}

const isPointNearArc = (p: Vec2, arc: ArcEntity, tol: number): boolean => {
  const d = distance(p, arc.center)
  if (Math.abs(d - arc.radius) > tol) return false
  const a = Math.atan2(p.y - arc.center.y, p.x - arc.center.x)
  return angleInSweep(a, arc.startAngle, arc.endAngle)
}

const isPointNearEllipse = (p: Vec2, e: EllipseEntity, tol: number): boolean => {
  const local = rotateAround(p, e.center, -e.rotation)
  const nx = (local.x - e.center.x) / e.rx
  const ny = (local.y - e.center.y) / e.ry
  return Math.abs(nx * nx + ny * ny - 1) <= tol * 0.02
}

export const angleInSweep = (test: number, start: number, end: number): boolean => {
  const t = normalizeAngle(test)
  const s = normalizeAngle(start)
  const e = normalizeAngle(end)
  if (s <= e) {
    return t >= s && t <= e
  }
  return t >= s || t <= e
}

export const normalizeAngle = (angle: number): number => {
  let a = angle
  while (a < 0) a += Math.PI * 2
  while (a >= Math.PI * 2) a -= Math.PI * 2
  return a
}

export const isPointInPolygon = (point: Vec2, polygon: Vec2[]): boolean => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect =
      yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + EPS) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export const moveEntity = (entity: CadEntity, delta: Vec2): CadEntity => {
  const shift = (p: Vec2) => add(p, delta)
  switch (entity.type) {
    case 'line':
      return { ...entity, start: shift(entity.start), end: shift(entity.end) }
    case 'circle':
      return { ...entity, center: shift(entity.center) }
    case 'arc':
      return { ...entity, center: shift(entity.center) }
    case 'ellipse':
      return { ...entity, center: shift(entity.center) }
    case 'polyline':
      return { ...entity, points: entity.points.map(shift) }
    case 'spline':
      return { ...entity, controlPoints: entity.controlPoints.map(shift) }
    case 'hatch':
      return { ...entity, boundary: entity.boundary.map(shift) }
    case 'text':
      return { ...entity, position: shift(entity.position) }
    case 'dimension':
      return { ...entity, p1: shift(entity.p1), p2: shift(entity.p2), p3: entity.p3 ? shift(entity.p3) : undefined }
    case 'insert':
      return { ...entity, position: shift(entity.position) }
  }
}

export const rotateEntity = (entity: CadEntity, origin: Vec2, angleRad: number): CadEntity => {
  const rot = (p: Vec2) => rotateAround(p, origin, angleRad)
  switch (entity.type) {
    case 'line':
      return { ...entity, start: rot(entity.start), end: rot(entity.end) }
    case 'circle':
      return { ...entity, center: rot(entity.center) }
    case 'arc':
      return { ...entity, center: rot(entity.center), startAngle: entity.startAngle + angleRad, endAngle: entity.endAngle + angleRad }
    case 'ellipse':
      return { ...entity, center: rot(entity.center), rotation: entity.rotation + angleRad }
    case 'polyline':
      return { ...entity, points: entity.points.map(rot) }
    case 'spline':
      return { ...entity, controlPoints: entity.controlPoints.map(rot) }
    case 'hatch':
      return { ...entity, boundary: entity.boundary.map(rot) }
    case 'text':
      return { ...entity, position: rot(entity.position) }
    case 'dimension':
      return { ...entity, p1: rot(entity.p1), p2: rot(entity.p2), p3: entity.p3 ? rot(entity.p3) : undefined }
    case 'insert':
      return { ...entity, position: rot(entity.position), rotation: entity.rotation + angleRad }
  }
}

export const scaleEntity = (entity: CadEntity, origin: Vec2, factor: number): CadEntity => {
  const scl = (p: Vec2) => add(origin, mul(sub(p, origin), factor))
  switch (entity.type) {
    case 'line':
      return { ...entity, start: scl(entity.start), end: scl(entity.end) }
    case 'circle':
      return { ...entity, center: scl(entity.center), radius: Math.abs(entity.radius * factor) }
    case 'arc':
      return { ...entity, center: scl(entity.center), radius: Math.abs(entity.radius * factor) }
    case 'ellipse':
      return { ...entity, center: scl(entity.center), rx: Math.abs(entity.rx * factor), ry: Math.abs(entity.ry * factor) }
    case 'polyline':
      return { ...entity, points: entity.points.map(scl) }
    case 'spline':
      return { ...entity, controlPoints: entity.controlPoints.map(scl) }
    case 'hatch':
      return { ...entity, boundary: entity.boundary.map(scl) }
    case 'text':
      return { ...entity, position: scl(entity.position), height: Math.abs(entity.height * factor) }
    case 'dimension':
      return { ...entity, p1: scl(entity.p1), p2: scl(entity.p2), p3: entity.p3 ? scl(entity.p3) : undefined }
    case 'insert':
      return { ...entity, position: scl(entity.position), scale: entity.scale * factor }
  }
}

export const mirrorEntity = (entity: CadEntity, a: Vec2, b: Vec2): CadEntity => {
  const m = (p: Vec2) => mirrorPointOnLine(p, a, b)
  switch (entity.type) {
    case 'line':
      return { ...entity, start: m(entity.start), end: m(entity.end) }
    case 'circle':
      return { ...entity, center: m(entity.center) }
    case 'arc':
      return { ...entity, center: m(entity.center), startAngle: -entity.startAngle, endAngle: -entity.endAngle }
    case 'ellipse':
      return { ...entity, center: m(entity.center), rotation: -entity.rotation }
    case 'polyline':
      return { ...entity, points: entity.points.map(m) }
    case 'spline':
      return { ...entity, controlPoints: entity.controlPoints.map(m) }
    case 'hatch':
      return { ...entity, boundary: entity.boundary.map(m) }
    case 'text':
      return { ...entity, position: m(entity.position) }
    case 'dimension':
      return { ...entity, p1: m(entity.p1), p2: m(entity.p2), p3: entity.p3 ? m(entity.p3) : undefined }
    case 'insert':
      return { ...entity, position: m(entity.position), rotation: -entity.rotation }
  }
}

export const offsetLine = (line: { start: Vec2; end: Vec2 }, distanceValue: number): { start: Vec2; end: Vec2 } => {
  const dir = normalize(sub(line.end, line.start))
  const normal = { x: -dir.y, y: dir.x }
  const delta = mul(normal, distanceValue)
  return { start: add(line.start, delta), end: add(line.end, delta) }
}

export const offsetCircle = (circle: CircleEntity, distanceValue: number): CircleEntity => ({
  ...circle,
  radius: Math.max(EPS, circle.radius + distanceValue),
})

export const makeDimensionLabel = (dimension: DimensionEntity, precision: number, suffix: string): string => {
  if (dimension.valueOverride) {
    return dimension.valueOverride
  }
  let value = 0
  if (dimension.dimType === 'angular' && dimension.p3) {
    const a1 = angleBetween(dimension.p2, dimension.p1)
    const a2 = angleBetween(dimension.p2, dimension.p3)
    value = Math.abs(((a2 - a1) * 180) / Math.PI)
  } else {
    value = distance(dimension.p1, dimension.p2)
  }
  return `${value.toFixed(precision)}${suffix}`
}

export const insertBoundingPoints = (insert: InsertEntity): Vec2[] => {
  const d = 5 * insert.scale
  return [
    { x: insert.position.x - d, y: insert.position.y - d },
    { x: insert.position.x + d, y: insert.position.y - d },
    { x: insert.position.x + d, y: insert.position.y + d },
    { x: insert.position.x - d, y: insert.position.y + d },
  ]
}

export const getEntityAnchorPoints = (entity: CadEntity): Vec2[] => {
  switch (entity.type) {
    case 'line':
      return [entity.start, midpoint(entity.start, entity.end), entity.end]
    case 'circle':
      return [
        entity.center,
        { x: entity.center.x + entity.radius, y: entity.center.y },
        { x: entity.center.x - entity.radius, y: entity.center.y },
        { x: entity.center.x, y: entity.center.y + entity.radius },
        { x: entity.center.x, y: entity.center.y - entity.radius },
      ]
    case 'arc':
      return [entity.center, polar(entity.center, entity.radius, entity.startAngle), polar(entity.center, entity.radius, entity.endAngle)]
    case 'ellipse':
      return [entity.center]
    case 'polyline':
      return entity.points
    case 'spline':
      return entity.controlPoints
    case 'hatch':
      return entity.boundary
    case 'text':
      return [entity.position]
    case 'dimension':
      return [entity.p1, entity.p2, ...(entity.p3 ? [entity.p3] : [])]
    case 'insert':
      return insertBoundingPoints(entity)
  }
}

export const approxEntityCenter = (entity: CadEntity): Vec2 => {
  const points = getEntityAnchorPoints(entity)
  if (points.length === 0) return { x: 0, y: 0 }
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

export const circleTangentPoints = (circle: CircleEntity, fromPoint: Vec2): Vec2[] => {
  const v = sub(fromPoint, circle.center)
  const d = length(v)
  if (d <= circle.radius + EPS) {
    return []
  }
  const alpha = Math.acos(circle.radius / d)
  const base = Math.atan2(v.y, v.x)
  return [polar(circle.center, circle.radius, base + alpha), polar(circle.center, circle.radius, base - alpha)]
}
