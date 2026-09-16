import { isPointInPolygon, polar } from './geometry'
import type { Vec2 } from './math/vec2'
import { entityCircle, entitySegments, segmentCircleIntersections, segmentIntersection } from './snap'
import { effectiveStyleFor, textBox } from './text'
import type { BlockDefinition, CadEntity, DrawingDocument, InsertEntity, TextStyle } from './types'

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

/** How deep an insert's bounds may recurse through nested blocks; a definition cycle cannot loop. */
/** A leader's pick box widens by roughly the words: the ASCII width table, as the renderer draws them. */
const leaderTextWidth = (entity: { value: string; height: number }): number =>
  entity.value.length * entity.height * 0.6

const MAX_BOUNDS_NESTING = 8

/**
 * The bounds of an insert's geometry, computed from its block's members rather than a placeholder.
 * Returns bounds in the space the insert's position lives in, so a nested insert hands back bounds
 * its parent can transform straight through.
 */
const insertMemberBounds = (insert: InsertEntity, blocks: BlockDefinition[], depth = 0): Bounds | null => {
  if (depth > MAX_BOUNDS_NESTING) return null
  const block = blocks.find((candidate) => candidate.id === insert.blockId)
  if (!block || block.entities.length === 0) return null

  const base = block.basePoint ?? { x: 0, y: 0 }
  const cos = Math.cos(insert.rotation)
  const sin = Math.sin(insert.rotation)
  const toParent = (point: Vec2): Vec2 => {
    const dx = (point.x - base.x) * insert.scale
    const dy = (point.y - base.y) * insert.scale
    return { x: insert.position.x + dx * cos - dy * sin, y: insert.position.y + dx * sin + dy * cos }
  }

  const corners: Vec2[] = []
  const push = (bounds: Bounds | null) => {
    if (!bounds) return
    corners.push(
      bounds.min,
      { x: bounds.min.x, y: bounds.max.y },
      bounds.max,
      { x: bounds.max.x, y: bounds.min.y },
    )
  }

  for (const member of block.entities) {
    if (member.type === 'insert') push(insertMemberBounds(member, blocks, depth + 1))
    else push(entityBounds(member, blocks))
  }
  if (corners.length === 0) return null
  return boundsOfPoints(corners.map(toParent))
}

export const entityBounds = (
  entity: CadEntity,
  blocks?: BlockDefinition[],
  /** The drawing's text styles: a note's extent depends on the font it is set in. */
  textStyles?: TextStyle[],
): Bounds | null => {
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
    case 'mtext':
      // The block the words really occupy, measured from the glyph widths the plot uses, rather than
      // a guess from the character count — which a wrapped or justified note gets wrong.
      return boundsOfPoints(textBox(entity, effectiveStyleFor({ textStyles }, entity)))
    case 'dimension':
      return boundsOfPoints(
        [entity.p1, entity.p2, entity.p3, entity.placement].filter((point): point is Vec2 => Boolean(point)),
      )
    case 'leader': {
      // The words widen the pick box to the right of the hook, which is where a callout is clicked.
      const textWidth = leaderTextWidth(entity)
      const right = Math.max(entity.arrow.x, entity.landingEnd.x + (entity.flipped ? -textWidth : textWidth))
      const left = Math.min(entity.arrow.x, entity.landingEnd.x - (entity.flipped ? 0 : 0))
      return boundsOfPoints([
        { x: left, y: Math.min(entity.arrow.y, entity.landingEnd.y) },
        { x: right, y: Math.max(entity.arrow.y, entity.landingEnd.y) + entity.height },
      ])
    }
    case 'tolerance': {
      const half = Math.max(entity.height * 2.5, entity.height * 0.85 * (entity.value.length + 2))
      return boundsOfPoints([
        { x: entity.position.x - half, y: entity.position.y - entity.height },
        { x: entity.position.x + half, y: entity.position.y + entity.height },
      ])
    }
    case 'insert': {
      const memberBounds = blocks ? insertMemberBounds(entity, blocks) : null
      if (memberBounds) return memberBounds
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

export const entityFullyInside = (
  entity: CadEntity,
  rect: SelectionRect,
  blocks?: BlockDefinition[],
  textStyles?: TextStyle[],
): boolean => {
  const bounds = entityBounds(entity, blocks, textStyles)
  if (!bounds) return false
  return (
    bounds.min.x >= rect.min.x && bounds.max.x <= rect.max.x && bounds.min.y >= rect.min.y && bounds.max.y <= rect.max.y
  )
}

export const entityTouchesRect = (
  entity: CadEntity,
  rect: SelectionRect,
  blocks?: BlockDefinition[],
  textStyles?: TextStyle[],
): boolean => {
  if (entityFullyInside(entity, rect, blocks, textStyles)) return true

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

  if (entity.type === 'ellipse' || entity.type === 'text' || entity.type === 'mtext' || entity.type === 'insert' || entity.type === 'dimension' || entity.type === 'leader' || entity.type === 'tolerance') {
    const bounds = entityBounds(entity, blocks, textStyles)
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
  blocks?: BlockDefinition[],
  textStyles?: TextStyle[],
): string[] =>
  entities
    .filter((entity) =>
      mode === 'window'
        ? entityFullyInside(entity, rect, blocks, textStyles)
        : entityTouchesRect(entity, rect, blocks, textStyles),
    )
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
