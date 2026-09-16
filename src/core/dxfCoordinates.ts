import type { BlockDefinition, CadEntity, DrawingDocument } from './types'

/**
 * Reflect a drawing about its X axis: y becomes -y, and every angle that is measured in that axis
 * reverses.
 *
 * AutoCAD and DXF put y UP. This app's model space puts it DOWN — `worldToScreen` is
 * `point * zoom + camera` with no negation, so a larger y is lower on the page, and the plot flips it
 * back for the sheet. Nothing converted between the two, so every drawing from another CAD program
 * arrived upside down: the customer's sheet drew its requirement table with the rows in reverse order,
 * and every `TopLeft` cell text hung downward from its anchor, so the words ran through the row line
 * below instead of sitting inside the cell. In AutoCAD's own axis that same anchor hangs the other way
 * and the words are centred.
 *
 * Applied on import and reversed on export, which is why it is written as one function rather than
 * negating coordinates at each of the two dozen places that read or write a point:
 *
 * - y of every point, centre, base point and position
 * - every rotation, and an arc's two limit angles SWAPPED as well as negated: a sweep from a to b
 *   becomes a sweep from -b to -a, which is the same piece of the circle seen in the other axis
 * - an ellipse is symmetric, so it only needs its centre moved and its rotation negated
 *
 * Height, width and radius are not coordinates and are left alone. So is the drawing's own paper
 * space: a sheet is built in this app's units, and the flip belongs to the file boundary only.
 */
export const reflectEntityY = (entity: CadEntity): CadEntity => {
  const point = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y })
  switch (entity.type) {
    case 'line':
      return { ...entity, start: point(entity.start), end: point(entity.end) }
    case 'circle':
      return { ...entity, center: point(entity.center) }
    case 'arc':
      return {
        ...entity,
        center: point(entity.center),
        startAngle: -entity.endAngle,
        endAngle: -entity.startAngle,
      }
    case 'ellipse':
      return { ...entity, center: point(entity.center), rotation: -entity.rotation }
    case 'polyline':
      return { ...entity, points: entity.points.map(point) }
    case 'spline':
      return { ...entity, controlPoints: entity.controlPoints.map(point) }
    case 'hatch':
      return { ...entity, boundary: entity.boundary.map(point), angle: -entity.angle }
    case 'text':
    case 'mtext':
      // The glyphs stay upright and the words stay readable; only where the text hangs changes.
      return { ...entity, position: point(entity.position), rotation: -(entity.rotation ?? 0) }
    case 'insert':
      return { ...entity, position: point(entity.position), rotation: -entity.rotation }
    case 'dimension':
      return {
        ...entity,
        p1: point(entity.p1),
        p2: point(entity.p2),
        p3: entity.p3 ? point(entity.p3) : undefined,
        placement: entity.placement ? point(entity.placement) : undefined,
      }
    case 'leader':
      return { ...entity, arrow: point(entity.arrow), landingEnd: point(entity.landingEnd) }
    case 'tolerance':
      return { ...entity, position: point(entity.position) }
  }
}

export const reflectBlockY = (block: BlockDefinition): BlockDefinition => ({
  ...block,
  basePoint: block.basePoint ? { x: block.basePoint.x, y: -block.basePoint.y } : undefined,
  entities: block.entities.map(reflectEntityY),
})

/** What a file's coordinates look like in this app's model space, and back again. Its own inverse. */
export const reflectEntitiesY = <T extends CadEntity>(entities: T[]): T[] =>
  entities.map(reflectEntityY) as T[]

export const reflectBlocksY = (blocks: BlockDefinition[]): BlockDefinition[] => blocks.map(reflectBlockY)

export const reflectDocumentY = (document: DrawingDocument): DrawingDocument => ({
  ...document,
  entities: reflectEntitiesY(document.entities),
  blocks: reflectBlocksY(document.blocks ?? []),
})
