import { describe, expect, it } from 'vitest'
import { flattenEntity, flattenInsert } from './flatten'
import type { BlockDefinition, InsertEntity } from './types'

const line = (id: string, x1: number, y1: number, x2: number, y2: number) =>
  ({ id, type: 'line' as const, layerId: 'l', start: { x: x1, y: y1 }, end: { x: x2, y: y2 } })

const blockOf = (id: string, entities: BlockDefinition['entities']): BlockDefinition => ({
  id,
  name: id.toUpperCase(),
  basePoint: { x: 0, y: 0 },
  entities,
})

const insertOf = (blockId: string, x: number, y: number, rotation = 0, scale = 1): InsertEntity => ({
  id: `ins-${blockId}-${x}-${y}`,
  type: 'insert',
  layerId: 'l',
  blockId,
  position: { x, y },
  rotation,
  scale,
})

describe('a block, flattened for the plotter', () => {
  it('yields nothing as a plain entity, which is why the plotter needs the block', () => {
    // The fault this guards: flattenEntity has no case for an insert, so every block vanished from
    // the page and a drawing of blocks plotted blank.
    expect(flattenEntity(insertOf('b', 0, 0))).toEqual([])
  })

  it('places a block\'s geometry at the insert', () => {
    const block = blockOf('b', [line('l1', 0, 0, 10, 0)])
    const runs = flattenInsert(insertOf('b', 100, 50), [block])
    expect(runs).toHaveLength(1)
    expect(runs[0].points).toEqual([
      { x: 100, y: 50 },
      { x: 110, y: 50 },
    ])
  })

  it('turns and sizes the geometry the way the canvas draws it', () => {
    const block = blockOf('b', [line('l1', 0, 0, 10, 0)])
    // A quarter turn takes +x to +y, and doubling the scale doubles the run.
    const runs = flattenInsert(insertOf('b', 0, 0, Math.PI / 2, 2), [block])
    const [, end] = runs[0].points
    expect(end.x).toBeCloseTo(0, 9)
    expect(end.y).toBeCloseTo(20, 9)
  })

  it('places a block inside a block', () => {
    const inner = blockOf('inner', [line('l1', 0, 0, 5, 0)])
    const outer = blockOf('outer', [insertOf('inner', 0, 0)] as BlockDefinition['entities'])
    const runs = flattenInsert(insertOf('outer', 10, 0), [inner, outer])
    expect(runs[0].points[1]).toEqual({ x: 15, y: 0 })
  })

  it('ends a block that inserts itself', () => {
    const loop: BlockDefinition = {
      id: 'loop',
      name: 'LOOP',
      basePoint: { x: 0, y: 0 },
      entities: [insertOf('loop', 1, 0), line('leaf', 0, 0, 1, 1)] as BlockDefinition['entities'],
    }
    const started = performance.now()
    const runs = flattenInsert(insertOf('loop', 0, 0), [loop])
    expect(performance.now() - started).toBeLessThan(250)
    expect(runs.length).toBeGreaterThan(0)
  })

  it('plots a block reference that has no definition as nothing rather than throwing', () => {
    expect(flattenInsert(insertOf('missing', 0, 0), [])).toEqual([])
  })
})
