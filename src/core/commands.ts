import { uid, offsetCircle, offsetLine } from './geometry'
import { add, mul, sub, type Vec2 } from './math/vec2'
import type { ArcEntity, CadEntity, CircleEntity, DrawingDocument, LineEntity } from './types'

export const createLine = (layerId: string, start: Vec2, end: Vec2): LineEntity => ({
  id: uid(),
  type: 'line',
  layerId,
  start,
  end,
})

export const createCircle = (layerId: string, center: Vec2, radius: number): CircleEntity => ({
  id: uid(),
  type: 'circle',
  layerId,
  center,
  radius,
})

export const createArc = (
  layerId: string,
  center: Vec2,
  radius: number,
  startAngle: number,
  endAngle: number,
): ArcEntity => ({
  id: uid(),
  type: 'arc',
  layerId,
  center,
  radius,
  startAngle,
  endAngle,
})

export const createClosedPoly = (layerId: string, points: Vec2[]): CadEntity => ({
  id: uid(),
  type: 'polyline',
  layerId,
  closed: true,
  points,
})

export const createRect = (layerId: string, a: Vec2, b: Vec2): CadEntity =>
  createClosedPoly(layerId, [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ])

export const createPolygon = (layerId: string, center: Vec2, radius: number, sides: number): CadEntity => {
  const clamped = Math.max(3, sides)
  const points = Array.from({ length: clamped }, (_, index) => {
    const angle = (index / clamped) * Math.PI * 2
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
  })
  return {
    id: uid(),
    type: 'polyline',
    layerId,
    closed: true,
    points,
  }
}

export const moveEntities = (entities: CadEntity[], ids: string[], delta: Vec2): CadEntity[] => {
  const idSet = new Set(ids)
  return entities.map((entity) => {
    if (!idSet.has(entity.id)) return entity
    switch (entity.type) {
      case 'line':
        return { ...entity, start: add(entity.start, delta), end: add(entity.end, delta) }
      case 'circle':
      case 'arc':
      case 'ellipse':
        return { ...entity, center: add(entity.center, delta) }
      case 'polyline':
        return { ...entity, points: entity.points.map((point) => add(point, delta)) }
      case 'spline':
        return { ...entity, controlPoints: entity.controlPoints.map((point) => add(point, delta)) }
      case 'hatch':
        return { ...entity, boundary: entity.boundary.map((point) => add(point, delta)) }
      case 'text':
        return { ...entity, position: add(entity.position, delta) }
      case 'dimension':
        return {
          ...entity,
          p1: add(entity.p1, delta),
          p2: add(entity.p2, delta),
          p3: entity.p3 ? add(entity.p3, delta) : undefined,
          placement: entity.placement ? add(entity.placement, delta) : undefined,
        }
      case 'insert':
        return { ...entity, position: add(entity.position, delta) }
      default:
        return entity
    }
  })
}

/**
 * Rotates every defining point about `origin`. Curves also carry their own orientation, so an arc
 * has its sweep turned and an ellipse its axis, rather than being carried around unchanged.
 */
export const rotateEntities = (entities: CadEntity[], ids: string[], origin: Vec2, angleDeg: number): CadEntity[] => {
  const angle = (angleDeg * Math.PI) / 180
  const idSet = new Set(ids)
  const spin = (point: Vec2): Vec2 => add(origin, rotate(sub(point, origin), angle))

  return entities.map((entity) => {
    if (!idSet.has(entity.id)) return entity
    switch (entity.type) {
      case 'line':
        return { ...entity, start: spin(entity.start), end: spin(entity.end) }
      case 'circle':
        return { ...entity, center: spin(entity.center) }
      case 'arc':
        return {
          ...entity,
          center: spin(entity.center),
          startAngle: entity.startAngle + angle,
          endAngle: entity.endAngle + angle,
        }
      case 'ellipse':
        return { ...entity, center: spin(entity.center), rotation: entity.rotation + angle }
      case 'polyline':
        return { ...entity, points: entity.points.map(spin) }
      case 'spline':
        return { ...entity, controlPoints: entity.controlPoints.map(spin) }
      case 'hatch':
        return {
          ...entity,
          boundary: entity.boundary.map(spin),
          angle: (entity.angle ?? 0) + angleDeg,
        }
      case 'text':
        return { ...entity, position: spin(entity.position) }
      case 'dimension':
        return {
          ...entity,
          p1: spin(entity.p1),
          p2: spin(entity.p2),
          p3: entity.p3 ? spin(entity.p3) : undefined,
          placement: entity.placement ? spin(entity.placement) : undefined,
        }
      case 'insert':
        return { ...entity, position: spin(entity.position), rotation: entity.rotation + angle }
      default:
        return entity
    }
  })
}

const rotate = (point: Vec2, angle: number): Vec2 => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
})

export const scaleEntities = (entities: CadEntity[], ids: string[], origin: Vec2, factor: number): CadEntity[] => {
  const idSet = new Set(ids)
  return entities.map((entity) => {
    if (!idSet.has(entity.id)) return entity
    switch (entity.type) {
      case 'line':
        return { ...entity, start: add(origin, mul(sub(entity.start, origin), factor)), end: add(origin, mul(sub(entity.end, origin), factor)) }
      case 'circle':
        return { ...entity, center: add(origin, mul(sub(entity.center, origin), factor)), radius: Math.abs(entity.radius * factor) }
      case 'arc':
        return { ...entity, center: add(origin, mul(sub(entity.center, origin), factor)), radius: Math.abs(entity.radius * factor) }
      case 'ellipse':
        return { ...entity, center: add(origin, mul(sub(entity.center, origin), factor)), rx: Math.abs(entity.rx * factor), ry: Math.abs(entity.ry * factor) }
      case 'polyline':
        return { ...entity, points: entity.points.map((point) => add(origin, mul(sub(point, origin), factor))) }
      case 'spline':
        return { ...entity, controlPoints: entity.controlPoints.map((point) => add(origin, mul(sub(point, origin), factor))) }
      case 'hatch':
        return { ...entity, boundary: entity.boundary.map((point) => add(origin, mul(sub(point, origin), factor))) }
      case 'text':
        return { ...entity, position: add(origin, mul(sub(entity.position, origin), factor)), height: entity.height * factor }
      case 'dimension':
        return {
          ...entity,
          p1: add(origin, mul(sub(entity.p1, origin), factor)),
          p2: add(origin, mul(sub(entity.p2, origin), factor)),
          p3: entity.p3 ? add(origin, mul(sub(entity.p3, origin), factor)) : undefined,
          placement: entity.placement ? add(origin, mul(sub(entity.placement, origin), factor)) : undefined,
          // The label grows with the geometry, just as a text object's height does.
          scale: (entity.scale ?? 1) * Math.abs(factor),
        }
      case 'insert':
        return { ...entity, position: add(origin, mul(sub(entity.position, origin), factor)), scale: entity.scale * factor }
      default:
        return entity
    }
  })
}

export type TransformTool = 'move' | 'copy' | 'rotate' | 'scale'

export const isTransformTool = (tool: string): tool is TransformTool =>
  tool === 'move' || tool === 'copy' || tool === 'rotate' || tool === 'scale'

/**
 * Reads a base point and a second point the way the transform commands do. Both the ghost that
 * follows the crosshair and the geometry finally committed go through here, so what you drag is
 * exactly what you get.
 */
export const transformedBy = (
  tool: TransformTool,
  entities: CadEntity[],
  ids: string[],
  base: Vec2,
  point: Vec2,
): CadEntity[] => {
  switch (tool) {
    case 'move':
    case 'copy':
      return moveEntities(entities, ids, sub(point, base))
    case 'rotate': {
      const angle = (Math.atan2(point.y - base.y, point.x - base.x) * 180) / Math.PI
      return rotateEntities(entities, ids, base, angle)
    }
    case 'scale': {
      // AutoCAD reads the distance from the base point as the factor itself.
      const factor = Math.hypot(point.x - base.x, point.y - base.y)
      return Number.isFinite(factor) && factor > 0 ? scaleEntities(entities, ids, base, factor) : entities
    }
  }
}

export const mirrorEntities = (entities: CadEntity[], ids: string[], a: Vec2, b: Vec2): CadEntity[] => {
  const idSet = new Set(ids)
  const dir = sub(b, a)
  const denom = dir.x * dir.x + dir.y * dir.y || 1
  const mirror = (p: Vec2): Vec2 => {
    const ap = sub(p, a)
    const t = (ap.x * dir.x + ap.y * dir.y) / denom
    const proj = add(a, mul(dir, t))
    return add(p, mul(sub(proj, p), 2))
  }
  return entities.map((entity) => {
    if (!idSet.has(entity.id)) return entity
    switch (entity.type) {
      case 'line':
        return { ...entity, start: mirror(entity.start), end: mirror(entity.end) }
      case 'circle':
      case 'arc':
      case 'ellipse':
        return { ...entity, center: mirror(entity.center) }
      case 'polyline':
        return { ...entity, points: entity.points.map(mirror) }
      case 'spline':
        return { ...entity, controlPoints: entity.controlPoints.map(mirror) }
      case 'hatch':
        return { ...entity, boundary: entity.boundary.map(mirror) }
      case 'text':
        return { ...entity, position: mirror(entity.position) }
      case 'dimension':
        return {
          ...entity,
          p1: mirror(entity.p1),
          p2: mirror(entity.p2),
          p3: entity.p3 ? mirror(entity.p3) : undefined,
          placement: entity.placement ? mirror(entity.placement) : undefined,
        }
      case 'insert':
        return { ...entity, position: mirror(entity.position) }
      default:
        return entity
    }
  })
}

export const offsetEntities = (entities: CadEntity[], ids: string[], distanceValue: number): CadEntity[] => {
  const idSet = new Set(ids)
  const output: CadEntity[] = [...entities]
  for (const entity of entities) {
    if (!idSet.has(entity.id)) continue
    if (entity.type === 'line') {
      const off = offsetLine(entity, distanceValue)
      output.push({ ...entity, id: uid(), start: off.start, end: off.end })
    } else if (entity.type === 'circle') {
      output.push({ ...offsetCircle(entity, distanceValue), id: uid() })
    } else if (entity.type === 'polyline') {
      const shifted = entity.points.map((point) => ({ x: point.x + distanceValue, y: point.y + distanceValue }))
      output.push({ ...entity, id: uid(), points: shifted })
    }
  }
  return output
}

export const breakLine = (entities: CadEntity[], lineId: string, breakPoint: Vec2): CadEntity[] => {
  const line = entities.find((entity): entity is LineEntity => entity.id === lineId && entity.type === 'line')
  if (!line) return entities
  const first = { ...line, id: uid(), end: breakPoint }
  const second = { ...line, id: uid(), start: breakPoint }
  return entities.flatMap((entity) => (entity.id === lineId ? [first, second] : [entity]))
}

export const documentStats = (document: DrawingDocument) => ({
  entityCount: document.entities.length,
  layerCount: document.layers.length,
  blockCount: document.blocks.length,
})
