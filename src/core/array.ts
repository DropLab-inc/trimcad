import { approxEntityCenter, moveEntity, rotateEntity, uid } from './geometry'
import { sub, type Vec2 } from './math/vec2'
import type { CadEntity } from './types'

/**
 * Repeating a selection in a grid or around a centre.
 *
 * Both kinds return only the copies, leaving the originals to the caller, so an array can be added
 * to a drawing in one step and taken back out again in one undo.
 */

export type RectangularSpec = {
  rows: number
  columns: number
  /** Distance between one row and the next, negative to build downwards. */
  rowSpacing: number
  /** Distance between one column and the next, negative to build leftwards. */
  columnSpacing: number
}

export type PolarSpec = {
  /** How many items the finished array holds, counting the original as the first. */
  count: number
  /** How much of a turn the array spans, in degrees. A full 360 wraps the whole way round. */
  fillAngle: number
  /** Whether each copy turns to follow the sweep, or keeps the heading the original had. */
  rotateItems: boolean
}

const whole = (value: number, least: number): number =>
  Number.isFinite(value) ? Math.max(least, Math.round(value)) : least

/**
 * The angle from one item to the next.
 *
 * A partial sweep puts an item at each end, so the gaps are one fewer than the items. A full turn
 * would then stack the last item on the original, so it divides by the count instead.
 */
export const polarStep = (count: number, fillAngle: number): number => {
  if (count <= 1) return 0
  const closes = Math.abs(Math.abs(fillAngle) - 360) < 1e-6
  return closes ? fillAngle / count : fillAngle / (count - 1)
}

/** The copies a rectangular array makes, the original standing at row zero, column zero. */
export const rectangularArrayCopies = (sources: CadEntity[], spec: RectangularSpec): CadEntity[] => {
  const rows = whole(spec.rows, 1)
  const columns = whole(spec.columns, 1)
  const copies: CadEntity[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (row === 0 && column === 0) continue
      const delta = { x: column * spec.columnSpacing, y: row * spec.rowSpacing }
      for (const entity of sources) {
        copies.push({ ...moveEntity(entity, delta), id: uid() })
      }
    }
  }
  return copies
}

/** The copies a polar array makes, the original standing at the start of the sweep. */
export const polarArrayCopies = (sources: CadEntity[], center: Vec2, spec: PolarSpec): CadEntity[] => {
  const count = whole(spec.count, 1)
  const step = polarStep(count, spec.fillAngle)
  const copies: CadEntity[] = []

  for (let index = 1; index < count; index += 1) {
    const angle = (step * index * Math.PI) / 180
    for (const entity of sources) {
      copies.push({ ...placeAround(entity, center, angle, spec.rotateItems), id: uid() })
    }
  }
  return copies
}

/**
 * Puts one copy at its place in the sweep.
 *
 * Items that follow the sweep simply turn about the centre. Ones that do not still have to travel
 * the same arc, so the copy is carried by the distance its middle would have moved while its own
 * heading is left alone.
 */
const placeAround = (entity: CadEntity, center: Vec2, angle: number, rotateItems: boolean): CadEntity => {
  if (rotateItems) return rotateEntity(entity, center, angle)
  const anchor = approxEntityCenter(entity)
  const carried = {
    x: center.x + (anchor.x - center.x) * Math.cos(angle) - (anchor.y - center.y) * Math.sin(angle),
    y: center.y + (anchor.x - center.x) * Math.sin(angle) + (anchor.y - center.y) * Math.cos(angle),
  }
  return moveEntity(entity, sub(carried, anchor))
}
