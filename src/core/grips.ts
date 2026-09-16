/**
 * Grips are the small squares AutoCAD puts on a selected object so it can be reshaped by hand,
 * without naming a command first. Each one knows what it does when it is dragged: most simply
 * carry a point along with them, but a circle's quadrant changes its radius, an arc's end swings
 * round its centre, and the square in the middle of a line picks the whole thing up.
 */
import type { ArcEntity, CadEntity, CircleEntity, EllipseEntity } from './types'
import { midpoint, moveEntity, normalizeAngle, polar } from './geometry'
import { add, distance, dot, mul, sub, vec, type Vec2 } from './math/vec2'

export type GripKind =
  /** Carries a single defining point of the shape. */
  | 'vertex'
  /** Picks up the whole object, the way a line's midpoint grip does. */
  | 'move'
  /** Sets a circle's radius from its centre. */
  | 'radius'
  /** Swings one end of an arc round its centre, leaving the radius alone. */
  | 'angle'
  /** Sets an arc's radius from the point halfway along it. */
  | 'bulge'
  /** Sets one of an ellipse's two axes, measured in the ellipse's own rotated frame. */
  | 'axis'

export type Grip = {
  point: Vec2
  kind: GripKind
  /** Which vertex, end or axis the grip stands for. Always 0 for kinds that take no index. */
  index: number
}

/** A radius of zero would erase the shape, so shrinking stops just short of nothing. */
const MIN_RADIUS = 1e-6

/** The angle halfway along an arc, going the way the arc is drawn. */
const midAngle = (arc: ArcEntity): number => {
  const sweep = normalizeAngle(arc.endAngle - arc.startAngle)
  return arc.startAngle + sweep / 2
}

const vertices = (points: Vec2[]): Grip[] =>
  points.map((point, index) => ({ point, kind: 'vertex' as const, index }))

/** Where the ellipse's two axes point, before either is scaled. */
const ellipseAxes = (entity: EllipseEntity): { major: Vec2; minor: Vec2 } => ({
  major: vec(Math.cos(entity.rotation), Math.sin(entity.rotation)),
  minor: vec(-Math.sin(entity.rotation), Math.cos(entity.rotation)),
})

export const entityGrips = (entity: CadEntity): Grip[] => {
  switch (entity.type) {
    case 'line':
      return [
        { point: entity.start, kind: 'vertex', index: 0 },
        { point: midpoint(entity.start, entity.end), kind: 'move', index: 0 },
        { point: entity.end, kind: 'vertex', index: 1 },
      ]
    case 'circle':
      return [
        { point: entity.center, kind: 'move', index: 0 },
        ...[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle, index) => ({
          point: polar(entity.center, entity.radius, angle),
          kind: 'radius' as const,
          index,
        })),
      ]
    case 'arc':
      return [
        { point: entity.center, kind: 'move', index: 0 },
        { point: polar(entity.center, entity.radius, entity.startAngle), kind: 'angle', index: 0 },
        { point: polar(entity.center, entity.radius, midAngle(entity)), kind: 'bulge', index: 0 },
        { point: polar(entity.center, entity.radius, entity.endAngle), kind: 'angle', index: 1 },
      ]
    case 'ellipse': {
      const { major, minor } = ellipseAxes(entity)
      return [
        { point: entity.center, kind: 'move', index: 0 },
        { point: add(entity.center, mul(major, entity.rx)), kind: 'axis', index: 0 },
        { point: sub(entity.center, mul(major, entity.rx)), kind: 'axis', index: 1 },
        { point: add(entity.center, mul(minor, entity.ry)), kind: 'axis', index: 2 },
        { point: sub(entity.center, mul(minor, entity.ry)), kind: 'axis', index: 3 },
      ]
    }
    case 'polyline':
      return vertices(entity.points)
    case 'spline':
      return vertices(entity.controlPoints)
    case 'hatch':
      return vertices(entity.boundary)
    case 'text':
    case 'mtext':
      return [{ point: entity.position, kind: 'move', index: 0 }]
    case 'dimension':
      return [
        { point: entity.p1, kind: 'vertex', index: 0 },
        { point: entity.p2, kind: 'vertex', index: 1 },
        ...(entity.p3 ? [{ point: entity.p3, kind: 'vertex' as const, index: 2 }] : []),
        ...(entity.placement ? [{ point: entity.placement, kind: 'vertex' as const, index: 3 }] : []),
      ]
    case 'leader':
      return [
        { point: entity.arrow, kind: 'vertex', index: 0 },
        { point: entity.landingEnd, kind: 'vertex', index: 1 },
      ]
    case 'tolerance':
      return [{ point: entity.position, kind: 'move', index: 0 }]
    case 'insert':
      return [{ point: entity.position, kind: 'move', index: 0 }]
  }
}

const replaceAt = (points: Vec2[], index: number, point: Vec2): Vec2[] =>
  points.map((existing, at) => (at === index ? point : existing))

const stretchVertex = (entity: CadEntity, index: number, to: Vec2): CadEntity => {
  switch (entity.type) {
    case 'line':
      return index === 0 ? { ...entity, start: to } : { ...entity, end: to }
    case 'polyline':
      return { ...entity, points: replaceAt(entity.points, index, to) }
    case 'spline':
      return { ...entity, controlPoints: replaceAt(entity.controlPoints, index, to) }
    case 'hatch':
      return { ...entity, boundary: replaceAt(entity.boundary, index, to) }
    case 'dimension':
      if (index === 0) return { ...entity, p1: to }
      if (index === 1) return { ...entity, p2: to }
      if (index === 2) return { ...entity, p3: to }
      return { ...entity, placement: to }
    default:
      return entity
  }
}

const setRadius = (entity: CircleEntity | ArcEntity, to: Vec2): CadEntity => ({
  ...entity,
  radius: Math.max(distance(entity.center, to), MIN_RADIUS),
})

const swingEnd = (entity: ArcEntity, index: number, to: Vec2): CadEntity => {
  const angle = Math.atan2(to.y - entity.center.y, to.x - entity.center.x)
  return index === 0 ? { ...entity, startAngle: angle } : { ...entity, endAngle: angle }
}

const setAxis = (entity: EllipseEntity, index: number, to: Vec2): CadEntity => {
  const { major, minor } = ellipseAxes(entity)
  const offset = sub(to, entity.center)
  // Only the distance along the axis being dragged counts; sliding sideways leaves it alone, so
  // the ellipse keeps its rotation instead of tumbling as the cursor wanders.
  const along = Math.abs(dot(offset, index < 2 ? major : minor))
  const size = Math.max(along, MIN_RADIUS)
  return index < 2 ? { ...entity, rx: size } : { ...entity, ry: size }
}

/** The shape that results from letting go of `grip` at `to`. */
export const dragGrip = (entity: CadEntity, grip: Grip, to: Vec2): CadEntity => {
  switch (grip.kind) {
    case 'move':
      return moveEntity(entity, sub(to, grip.point))
    case 'vertex':
      return stretchVertex(entity, grip.index, to)
    case 'radius':
      return entity.type === 'circle' ? setRadius(entity, to) : entity
    case 'bulge':
      return entity.type === 'arc' ? setRadius(entity, to) : entity
    case 'angle':
      return entity.type === 'arc' ? swingEnd(entity, grip.index, to) : entity
    case 'axis':
      return entity.type === 'ellipse' ? setAxis(entity, grip.index, to) : entity
  }
}

export type GripHit = { entity: CadEntity; grip: Grip }

/**
 * The grip nearest `point`, if one is within `tolerance`. Later entities win ties, matching the
 * way picking prefers whatever was drawn most recently.
 */
export const findGripAt = (point: Vec2, entities: CadEntity[], tolerance: number): GripHit | null => {
  let best: GripHit | null = null
  let bestDistance = tolerance
  for (const entity of entities) {
    for (const grip of entityGrips(entity)) {
      const away = distance(point, grip.point)
      if (away <= bestDistance) {
        best = { entity, grip }
        bestDistance = away
      }
    }
  }
  return best
}
