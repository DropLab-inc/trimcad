import { describe, expect, it } from 'vitest'
import { entityBounds } from './selection'
import type { BlockDefinition, CadEntity, InsertEntity } from './types'

/** A block that inserts itself, the shape a converted file can carry. */
const selfReferencing = (branches: number): BlockDefinition => {
  const members: CadEntity[] = []
  for (let index = 0; index < branches; index += 1) {
    members.push({
      id: `inner-${index}`,
      type: 'insert',
      layerId: 'l',
      blockId: 'loop',
      position: { x: index, y: 0 },
      rotation: 0,
      scale: 1,
    })
  }
  members.push({ id: 'leaf', type: 'line', layerId: 'l', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })
  return { id: 'loop', name: 'LOOP', basePoint: { x: 0, y: 0 }, entities: members }
}

const mutual = (): BlockDefinition[] => [
  {
    id: 'a',
    name: 'A',
    basePoint: { x: 0, y: 0 },
    entities: [
      { id: 'a-to-b', type: 'insert', layerId: 'l', blockId: 'b', position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: 'a-leaf', type: 'line', layerId: 'l', start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
    ],
  },
  {
    id: 'b',
    name: 'B',
    basePoint: { x: 0, y: 0 },
    entities: [
      { id: 'b-to-a', type: 'insert', layerId: 'l', blockId: 'a', position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: 'b-leaf', type: 'line', layerId: 'l', start: { x: 0, y: 0 }, end: { x: 0, y: 2 } },
    ],
  },
]

describe('a block that references itself', () => {
  it('has bounds that can be worked out at all', () => {
    // Depth alone would branch 9^8 times here — 43 million boxes — and the tab would never come back.
    const block = selfReferencing(8)
    const insert: InsertEntity = {
      id: 'i',
      type: 'insert',
      layerId: 'l',
      blockId: 'loop',
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
    }
    const started = performance.now()
    const bounds = entityBounds(insert, [block], [])
    const elapsed = performance.now() - started
    expect(bounds).not.toBeNull()
    expect(elapsed).toBeLessThan(250)
  })

  it('has a cost that can be worked out at all', async () => {
    const { withinRenderBudget } = await import('../ui/CanvasViewport')
    const block = selfReferencing(8)
    const insert: CadEntity = {
      id: 'i',
      type: 'insert',
      layerId: 'l',
      blockId: 'loop',
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
    }
    const started = performance.now()
    const kept = withinRenderBudget([insert], [block])
    expect(performance.now() - started).toBeLessThan(250)
    expect(kept).toHaveLength(1)
  })

  it('ends a mutual reference between two blocks', () => {
    const blocks = mutual()
    const insert: InsertEntity = { id: 'i', type: 'insert', layerId: 'l', blockId: 'a', position: { x: 0, y: 0 }, rotation: 0, scale: 1 }
    const started = performance.now()
    const bounds = entityBounds(insert, blocks, [])
    expect(bounds).not.toBeNull()
    expect(performance.now() - started).toBeLessThan(250)
  })
})
