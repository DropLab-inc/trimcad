/**
 * EXPLODE takes an object that is really several pieces held together and hands the pieces back.
 * A polyline becomes its segments, and a block insert becomes a copy of what the block contains,
 * moved, turned and sized to sit exactly where the insert was drawn.
 */
import { moveEntity, rotateEntity, scaleEntity, uid } from './geometry'
import type { BlockDefinition, CadEntity, InsertEntity, PolylineEntity } from './types'

/** A polyline's segments, each carrying the polyline's own layer, colour and linetype. */
const explodePolyline = (entity: PolylineEntity): CadEntity[] => {
  const { points, closed } = entity
  const count = closed ? points.length : points.length - 1
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    id: uid(),
    type: 'line' as const,
    layerId: entity.layerId,
    color: entity.color,
    linetypeId: entity.linetypeId,
    lineweight: entity.lineweight,
    start: points[index],
    end: points[(index + 1) % points.length],
  }))
}

/**
 * The contents of a block, placed where the insert put them. The order matters: the block is drawn
 * around its own origin, so it is sized and turned there before being carried to the insert point.
 */
const explodeInsert = (entity: InsertEntity, blocks: BlockDefinition[]): CadEntity[] | null => {
  const block = blocks.find((candidate) => candidate.id === entity.blockId)
  if (!block || block.entities.length === 0) return null

  const base = block.basePoint ?? { x: 0, y: 0 }
  return block.entities.map((member) => {
    // Shift the base point to the origin, size and turn there, then carry to the insert point.
    const fromBase = moveEntity({ ...member, id: uid() }, { x: -base.x, y: -base.y })
    const sized = scaleEntity(fromBase, { x: 0, y: 0 }, entity.scale)
    const turned = rotateEntity(sized, { x: 0, y: 0 }, entity.rotation)
    const placed = moveEntity(turned, entity.position)
    // A block's contents may be drawn on layer 0 to take on the insert's layer, which is what
    // AutoCAD does, so the pieces land on the layer the insert was sitting on.
    return { ...placed, layerId: entity.layerId }
  })
}

/**
 * The pieces `entity` breaks into, or null when it is already as simple as it goes. A line, circle,
 * arc, ellipse, spline or piece of text has nothing inside it to hand back.
 */
export const explodeEntity = (entity: CadEntity, blocks: BlockDefinition[]): CadEntity[] | null => {
  if (entity.type === 'polyline') {
    const pieces = explodePolyline(entity)
    return pieces.length > 0 ? pieces : null
  }
  if (entity.type === 'insert') return explodeInsert(entity, blocks)
  return null
}

export type ExplodeResult = {
  entities: CadEntity[]
  /** The ids of the objects that were taken apart. */
  consumed: string[]
  /** How many pieces came out. */
  pieces: number
}

/**
 * Explodes everything in `ids` that can be exploded, leaving the rest of the drawing alone. Each
 * object's pieces take its place in the drawing order, so nothing jumps in front of its neighbours.
 */
export const explodeSelection = (
  entities: CadEntity[],
  ids: string[],
  blocks: BlockDefinition[],
): ExplodeResult => {
  const chosen = new Set(ids)
  const consumed: string[] = []
  let pieces = 0

  const next = entities.flatMap((entity) => {
    if (!chosen.has(entity.id)) return [entity]
    const parts = explodeEntity(entity, blocks)
    if (!parts) return [entity]
    consumed.push(entity.id)
    pieces += parts.length
    return parts
  })

  return { entities: next, consumed, pieces }
}
