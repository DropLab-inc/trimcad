import { describe, expect, it } from 'vitest'
import { createCircle, createLine, createPolygon, createRect } from './commands'
import { explodeEntity, explodeSelection } from './explode'
import type { BlockDefinition, CadEntity, InsertEntity, LineEntity, PolylineEntity } from './types'

const noBlocks: BlockDefinition[] = []

describe('what a shape breaks into', () => {
  it('breaks a rectangle into its four sides', () => {
    const rect = createRect('L', { x: 0, y: 0 }, { x: 40, y: 20 })

    const pieces = explodeEntity(rect, noBlocks)

    expect(pieces).toHaveLength(4)
    expect(pieces?.every((piece) => piece.type === 'line')).toBe(true)
  })

  it('closes the loop, so the last side runs back to the first corner', () => {
    const rect = createRect('L', { x: 0, y: 0 }, { x: 40, y: 20 })

    const pieces = explodeEntity(rect, noBlocks) as LineEntity[]

    expect(pieces[pieces.length - 1].end).toEqual(pieces[0].start)
  })

  it('breaks an open polyline into one fewer line than it has points', () => {
    const pline: PolylineEntity = {
      id: 'p',
      type: 'polyline',
      layerId: 'L',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      closed: false,
    }

    expect(explodeEntity(pline, noBlocks)).toHaveLength(2)
  })

  it('breaks a polygon into one line per side', () => {
    const hexagon = createPolygon('L', { x: 0, y: 0 }, 30, 6)

    expect(explodeEntity(hexagon, noBlocks)).toHaveLength(6)
  })

  it('gives the pieces the layer and colour the whole shape had', () => {
    const rect = { ...createRect('L', { x: 0, y: 0 }, { x: 40, y: 20 }), layerId: 'walls', color: '#00ff00' }

    const pieces = explodeEntity(rect, noBlocks) as LineEntity[]

    expect(pieces.every((piece) => piece.layerId === 'walls' && piece.color === '#00ff00')).toBe(true)
  })

  it('gives each piece an id of its own', () => {
    const pieces = explodeEntity(createRect('L', { x: 0, y: 0 }, { x: 40, y: 20 }), noBlocks) as LineEntity[]

    expect(new Set(pieces.map((piece) => piece.id)).size).toBe(4)
  })

  it('has nothing to hand back for a line, a circle or a spline', () => {
    expect(explodeEntity(createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 }), noBlocks)).toBeNull()
    expect(explodeEntity(createCircle('L', { x: 0, y: 0 }, 10), noBlocks)).toBeNull()
  })
})

describe('exploding a block insert', () => {
  const block: BlockDefinition = {
    id: 'block-1',
    name: 'Widget',
    entities: [createLine('0', { x: 0, y: 0 }, { x: 10, y: 0 })],
  }

  const insert = (overrides: Partial<InsertEntity> = {}): InsertEntity => ({
    id: 'i',
    type: 'insert',
    layerId: 'plan',
    blockId: 'block-1',
    position: { x: 100, y: 50 },
    rotation: 0,
    scale: 1,
    ...overrides,
  })

  it('hands back the block contents, moved to where the insert sits', () => {
    const pieces = explodeEntity(insert(), [block]) as LineEntity[]

    expect(pieces).toHaveLength(1)
    expect(pieces[0].start).toEqual({ x: 100, y: 50 })
    expect(pieces[0].end).toEqual({ x: 110, y: 50 })
  })

  it('sizes the contents by the insert scale', () => {
    const pieces = explodeEntity(insert({ scale: 3 }), [block]) as LineEntity[]

    expect(pieces[0].end.x).toBeCloseTo(130, 6)
  })

  it('turns the contents by the insert rotation', () => {
    const pieces = explodeEntity(insert({ rotation: Math.PI / 2 }), [block]) as LineEntity[]

    expect(pieces[0].end.x).toBeCloseTo(100, 6)
    expect(pieces[0].end.y).toBeCloseTo(60, 6)
  })

  it('sizes before it turns, so the two do not fight', () => {
    const pieces = explodeEntity(insert({ rotation: Math.PI / 2, scale: 2 }), [block]) as LineEntity[]

    expect(pieces[0].end.x).toBeCloseTo(100, 6)
    expect(pieces[0].end.y).toBeCloseTo(70, 6)
  })

  it('drops the pieces onto the layer the insert was on', () => {
    const pieces = explodeEntity(insert(), [block]) as LineEntity[]

    expect(pieces[0].layerId).toBe('plan')
  })

  it('has nothing to hand back when the block cannot be found', () => {
    expect(explodeEntity(insert({ blockId: 'missing' }), [block])).toBeNull()
  })

  it('has nothing to hand back for an empty block', () => {
    const empty: BlockDefinition = { id: 'block-1', name: 'Empty', entities: [] }

    expect(explodeEntity(insert(), [empty])).toBeNull()
  })
})

describe('exploding a selection', () => {
  it('leaves everything that was not selected alone', () => {
    const rect = createRect('L', { x: 0, y: 0 }, { x: 40, y: 20 })
    const bystander = createCircle('L', { x: 90, y: 90 }, 5)

    const result = explodeSelection([rect, bystander], [rect.id], noBlocks)

    expect(result.entities).toHaveLength(5)
    expect(result.entities).toContain(bystander)
    expect(result.consumed).toEqual([rect.id])
    expect(result.pieces).toBe(4)
  })

  it('puts the pieces where the object was in the drawing order', () => {
    const first = createCircle('L', { x: 0, y: 0 }, 5)
    const rect = createRect('L', { x: 0, y: 0 }, { x: 40, y: 20 })
    const last = createCircle('L', { x: 90, y: 90 }, 5)

    const result = explodeSelection([first, rect, last], [rect.id], noBlocks)

    expect(result.entities[0]).toBe(first)
    expect(result.entities[result.entities.length - 1]).toBe(last)
  })

  it('keeps an object that cannot be exploded rather than dropping it', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 5)

    const result = explodeSelection([circle], [circle.id], noBlocks)

    expect(result.entities).toEqual([circle])
    expect(result.consumed).toEqual([])
    expect(result.pieces).toBe(0)
  })

  it('explodes only one level, so a polyline inside a block stays whole', () => {
    const block: BlockDefinition = {
      id: 'b',
      name: 'Frame',
      entities: [createRect('0', { x: 0, y: 0 }, { x: 10, y: 10 })],
    }
    const placed: InsertEntity = {
      id: 'i',
      type: 'insert',
      layerId: 'L',
      blockId: 'b',
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
    }

    const result = explodeSelection([placed], [placed.id], [block])

    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].type).toBe('polyline')
  })

  it('takes several objects apart at once', () => {
    const first = createRect('L', { x: 0, y: 0 }, { x: 10, y: 10 })
    const second = createRect('L', { x: 20, y: 20 }, { x: 30, y: 30 })
    const entities: CadEntity[] = [first, second]

    const result = explodeSelection(entities, [first.id, second.id], noBlocks)

    expect(result.pieces).toBe(8)
    expect(result.consumed).toHaveLength(2)
  })
})
