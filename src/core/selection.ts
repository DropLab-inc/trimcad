import { isPointInPolygon, polar } from './geometry'
import type { Vec2 } from './math/vec2'
import { entityCircle, entitySegments, segmentCircleIntersections, segmentIntersection } from './snap'
import type { CadEntity, DrawingDocument } from './types'

export type SelectionRect = { min: Vec2; max: Vec2 }

/**
 * Dragging left-to-right selects only objects fully enclosed (window); dragging right-to-left
 * also picks up anything the box touches (crossing). This mirrors AutoCAD.
 */
export type SelectionMode = 'window' | 'crossing'

export type Bounds = { min: Vec2; max: Vec2 }

export const rectFromPoints = (a: Vec2, b: Vec2): SelectionRect => ({
  min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
  max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
})

export const selectionModeFor = (start: Vec2, end: Vec2): SelectionMode =>
  end.x >= start.x ? 'window' : 'crossing'

const boundsOfPoints = (points: Vec2[]): Bounds | null => {
  if (points.length === 0) return null
  return points.reduce<Bounds>(
    (accumulator, point) => ({
      min: { x: Math.min(accumulator.min.x, point.x), y: Math.min(accumulator.min.y, point.y) },
      max: { x: Math.max(accumulator.max.x, point.x), y: Math.max(accumulator.max.y, point.y) },
    }),
    { min: { ...points[0] }, max: { ...points[0] } },
  )
}

export const entityBounds = (entity: CadEntity): Bounds | null => {
  switch (entity.type) {
    case 'line':
      return boundsOfPoints([entity.start, entity.end])
    case 'circle':
      return {
        min: { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
        max: { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius },
      }
    case 'arc': {
      const samples = 24
      let sweep = entity.endAngle - entity.startAngle
      while (sweep < 0) sweep += Math.PI * 2
      return boundsOfPoints(
        Array.from({ length: samples + 1 }, (_, index) =>
          polar(entity.center, entity.radius, entity.startAngle + (sweep * index) / samples),
        ),
      )
    }
    case 'ellipse': {
      const extent = Math.max(entity.rx, entity.ry)
      return {
        min: { x: entity.center.x - extent, y: entity.center.y - extent },
        max: { x: entity.center.x + extent, y: entity.center.y + extent },
      }
    }
    case 'polyline':
      return boundsOfPoints(entity.points)
    case 'spline':
      return boundsOfPoints(entity.controlPoints)
    case 'hatch':
      return boundsOfPoints(entity.boundary)
    case 'text':
      return boundsOfPoints([
        entity.position,
        { x: entity.position.x + entity.value.length * entity.height * 0.6, y: entity.position.y - entity.height },
      ])
    case 'dimension':
      return boundsOfPoints(
        [entity.p1, entity.p2, entity.p3, entity.placement].filter((point): point is Vec2 => Boolean(point)),
      )
    case 'insert': {
      const extent = 6 * entity.scale
      return {
        min: { x: entity.position.x - extent, y: entity.position.y - extent },
        max: { x: entity.position.x + extent, y: entity.position.y + extent },
      }
    }
    default:
      return null
  }
}

const pointInRect = (point: Vec2, rect: SelectionRect): boolean =>
  point.x >= rect.min.x && point.x <= rect.max.x && point.y >= rect.min.y && point.y <= rect.max.y

const rectEdges = (rect: SelectionRect): Array<{ a: Vec2; b: Vec2 }> => {
  const corners = [
    { x: rect.min.x, y: rect.min.y },
    { x: rect.max.x, y: rect.min.y },
    { x: rect.max.x, y: rect.max.y },
    { x: rect.min.x, y: rect.max.y },
  ]
  return corners.map((corner, index) => ({ a: corner, b: corners[(index + 1) % corners.length] }))
}

export const entityFullyInside = (entity: CadEntity, rect: SelectionRect): boolean => {
  const bounds = entityBounds(entity)
  if (!bounds) return false
  return (
    bounds.min.x >= rect.min.x && bounds.max.x <= rect.max.x && bounds.min.y >= rect.min.y && bounds.max.y <= rect.max.y
  )
}

export const entityTouchesRect = (entity: CadEntity, rect: SelectionRect): boolean => {
  if (entityFullyInside(entity, rect)) return true

  const edges = rectEdges(rect)
  const segments = entitySegments(entity)

  for (const segment of segments) {
    if (pointInRect(segment.a, rect) || pointInRect(segment.b, rect)) return true
    for (const edge of edges) {
      if (segmentIntersection(segment.a, segment.b, edge.a, edge.b)) return true
    }
  }

  const circle = entityCircle(entity)
  if (circle) {
    for (const edge of edges) {
      if (segmentCircleIntersections(edge.a, edge.b, circle).length > 0) return true
    }
  }

  if (entity.type === 'ellipse' || entity.type === 'text' || entity.type === 'insert' || entity.type === 'dimension') {
    const bounds = entityBounds(entity)
    if (!bounds) return false
    return (
      bounds.min.x <= rect.max.x && bounds.max.x >= rect.min.x && bounds.min.y <= rect.max.y && bounds.max.y >= rect.min.y
    )
  }

  // A hatch is a filled area: a crossing box that sits inside it without cutting an edge still
  // selects it, the way AutoCAD's crossing selection does for hatches.
  if (entity.type === 'hatch') {
    const corners = [
      { x: rect.min.x, y: rect.min.y },
      { x: rect.max.x, y: rect.min.y },
      { x: rect.max.x, y: rect.max.y },
      { x: rect.min.x, y: rect.max.y },
    ]
    if (corners.some((corner) => isPointInPolygon(corner, entity.boundary))) return true
    const centre = { x: (rect.min.x + rect.max.x) / 2, y: (rect.min.y + rect.max.y) / 2 }
    if (isPointInPolygon(centre, entity.boundary)) return true
  }

  return false
}

export const selectEntitiesInRect = (
  entities: CadEntity[],
  rect: SelectionRect,
  mode: SelectionMode,
): string[] =>
  entities
    .filter((entity) => (mode === 'window' ? entityFullyInside(entity, rect) : entityTouchesRect(entity, rect)))
    .map((entity) => entity.id)

/** Picking any member of a group selects the whole group, as AutoCAD does. */
export const expandSelectionToGroups = (ids: string[], doc: DrawingDocument): string[] => {
  const result = new Set(ids)
  for (const group of doc.groups) {
    if (group.entityIds.some((id) => result.has(id))) {
      for (const id of group.entityIds) result.add(id)
    }
  }
  return [...result]
}

export type SelectionModifier = 'replace' | 'add' | 'remove'

export const applySelectionModifier = (
  current: string[],
  incoming: string[],
  modifier: SelectionModifier,
): string[] => {
  if (modifier === 'replace') return [...new Set(incoming)]
  if (modifier === 'add') return [...new Set([...current, ...incoming])]
  const removing = new Set(incoming)
  return current.filter((id) => !removing.has(id))
}
