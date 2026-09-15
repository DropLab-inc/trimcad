import { beforeEach, describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { explodeEntity } from './explode'
import { isPointNearEntity } from './geometry'
import { entityBounds } from './selection'
import { applyDrawTool, useCadStore } from './store'
import type { BlockDefinition, CadEntity, InsertEntity, LineEntity } from './types'

const layerId = () => useCadStore.getState().doc.layers[0].id
const run = (line: string) => useCadStore.getState().executeCommand(line)
const doc = () => useCadStore.getState().doc
const entities = () => doc().entities
const blocks = () => doc().blocks
const select = (ids: string[]) => useCadStore.getState().setSelection(ids)
const lastLine = () => useCadStore.getState().history.at(-1)!

const seed = (seedEntities: CadEntity[] = [], seedBlocks: BlockDefinition[] = []) => {
  const state = useCadStore.getState()
  state.cancelCommand()
  state.setSelection([])
  state.updateDocument((drawing) => ({ ...drawing, entities: seedEntities, groups: [], blocks: seedBlocks }))
  useCadStore.setState({ history: [], lastCommand: null, cursorWorld: null })
}

/** A block holding one horizontal line; the drawing unit is simple so placements are obvious. */
const lineBlock = (overrides: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id: 'b-door',
  name: 'Door',
  entities: [createLine('0', { x: 0, y: 0 }, { x: 100, y: 0 })],
  ...overrides,
})

describe('BLOCK', () => {
  beforeEach(() => seed())

  it('defines the selection and replaces it with one insert in place', () => {
    const a = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const b = createLine(layerId(), { x: 50, y: 0 }, { x: 100, y: 40 })
    seed([a, b])
    select([a.id, b.id])

    run('BLOCK')
    run('Door')
    applyDrawTool({ x: 50, y: 50 })

    expect(blocks()).toHaveLength(1)
    expect(blocks()[0].name).toBe('Door')
    expect(blocks()[0].basePoint).toEqual({ x: 50, y: 50 })
    expect(blocks()[0].entities.map((member) => member.id)).toEqual([a.id, b.id])

    expect(entities()).toHaveLength(1)
    const insert = entities()[0] as InsertEntity
    expect(insert.type).toBe('insert')
    expect(insert.blockId).toBe(blocks()[0].id)
    expect(insert.position).toEqual({ x: 50, y: 50 })
    expect(insert.rotation).toBe(0)
    expect(insert.scale).toBe(1)
    expect(useCadStore.getState().selectedIds).toEqual([insert.id])
  })

  it('refuses to run without a selection', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])

    run('BLOCK')

    expect(blocks()).toHaveLength(0)
    expect(entities()).toHaveLength(1)
    expect(lastLine().kind).toBe('error')
  })

  it('redefining keeps the same id so existing inserts update', () => {
    const a = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    seed([a])
    select([a.id])
    run('BLOCK')
    run('Door')
    applyDrawTool({ x: 0, y: 0 })
    const originalId = blocks()[0].id

    const b = createLine(layerId(), { x: 10, y: 10 }, { x: 60, y: 60 })
    seed([...(entities() as InsertEntity[]), b], blocks())
    select([b.id])
    run('BLOCK')
    run('Door')
    applyDrawTool({ x: 20, y: 20 })

    expect(blocks()).toHaveLength(1)
    expect(blocks()[0].id).toBe(originalId)
    expect(blocks()[0].entities.map((member) => member.id)).toEqual([b.id])
    expect(lastLine().kind).toBe('result')
  })
})

describe('INSERT', () => {
  beforeEach(() => seed())

  it('places a block at scale and rotation', () => {
    seed([], [lineBlock()])

    run('INSERT')
    run('Door')
    applyDrawTool({ x: 100, y: 200 })
    run('2')
    run('90')

    expect(entities()).toHaveLength(1)
    const insert = entities()[0] as InsertEntity
    expect(insert.type).toBe('insert')
    expect(insert.blockId).toBe('b-door')
    expect(insert.position).toEqual({ x: 100, y: 200 })
    expect(insert.scale).toBe(2)
    expect(insert.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('accepts Enter for the default scale and rotation', () => {
    seed([], [lineBlock()])

    run('INSERT')
    run('Door')
    applyDrawTool({ x: 0, y: 0 })
    run('')
    run('')

    const insert = entities()[0] as InsertEntity
    expect(insert.scale).toBe(1)
    expect(insert.rotation).toBe(0)
  })

  it('rejects an unknown block name', () => {
    run('INSERT')
    run('Missing')

    expect(entities()).toHaveLength(0)
    expect(lastLine().kind).toBe('error')
  })
})

describe('a block in the drawing', () => {
  const block = lineBlock()
  const insert = (overrides: Partial<InsertEntity> = {}): InsertEntity => ({
    id: 'i',
    type: 'insert',
    layerId: '0',
    blockId: 'b-door',
    position: { x: 200, y: 300 },
    rotation: 0,
    scale: 1,
    ...overrides,
  })

  it('bounds its members, not a placeholder box', () => {
    const bounds = entityBounds(insert(), [block])
    expect(bounds).toEqual({ min: { x: 200, y: 300 }, max: { x: 300, y: 300 } })
  })

  it('is picked by clicking its geometry', () => {
    expect(isPointNearEntity({ x: 250, y: 300 }, insert(), 2, [block])).toBe(true)
    expect(isPointNearEntity({ x: 250, y: 350 }, insert(), 2, [block])).toBe(false)
  })

  it('places members relative to a non-origin base point when exploded', () => {
    const offOrigin = lineBlock({ basePoint: { x: 10, y: 0 } })
    const pieces = explodeEntity(insert({ position: { x: 0, y: 0 } }), [offOrigin]) as LineEntity[]
    expect(pieces[0].start).toEqual({ x: -10, y: 0 })
    expect(pieces[0].end).toEqual({ x: 90, y: 0 })
  })
})
