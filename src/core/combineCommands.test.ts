import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine, createRect } from './commands'
import { applyDrawTool, useCadStore } from './store'
import type { BlockDefinition, CadEntity, LineEntity, PolylineEntity } from './types'

const seed = (entities: CadEntity[] = [], blocks: BlockDefinition[] = []) => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.setTool('select')
  state.updateDocument((doc) => ({ ...doc, entities, groups: [], blocks }))
  useCadStore.setState({ history: [], lastCommand: null, cursorWorld: null })
}

const layerId = () => useCadStore.getState().doc.layers[0].id
const run = (line: string) => useCadStore.getState().executeCommand(line)
const entities = () => useCadStore.getState().doc.entities
const lastLine = () => useCadStore.getState().history.at(-1)!
const select = (ids: string[]) => useCadStore.getState().setSelection(ids)

describe('JOIN at the command line', () => {
  beforeEach(() => seed())

  it('replaces the pieces with the single object they make', () => {
    const first = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const second = createLine(layerId(), { x: 50, y: 0 }, { x: 120, y: 0 })
    seed([first, second])
    select([first.id, second.id])

    run('JOIN')

    expect(entities()).toHaveLength(1)
    expect(entities()[0].type).toBe('line')
    expect((entities()[0] as LineEntity).end).toEqual({ x: 120, y: 0 })
  })

  it('leaves the joined object selected, ready for the next command', () => {
    const first = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const second = createLine(layerId(), { x: 50, y: 0 }, { x: 50, y: 40 })
    seed([first, second])
    select([first.id, second.id])

    run('J')

    expect(useCadStore.getState().selectedIds).toEqual([entities()[0].id])
  })

  it('keeps the joined object where the pieces were in the drawing order', () => {
    const behind = createCircle(layerId(), { x: 0, y: 0 }, 5)
    const first = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const second = createLine(layerId(), { x: 50, y: 0 }, { x: 120, y: 0 })
    const front = createCircle(layerId(), { x: 90, y: 90 }, 5)
    seed([behind, first, second, front])
    select([first.id, second.id])

    run('JOIN')

    expect(entities().map((entity) => entity.type)).toEqual(['circle', 'line', 'circle'])
  })

  it('leaves the drawing alone and says why when the pieces do not meet', () => {
    const first = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const apart = createLine(layerId(), { x: 300, y: 200 }, { x: 350, y: 260 })
    seed([first, apart])
    select([first.id, apart.id])

    run('JOIN')

    expect(entities()).toHaveLength(2)
    expect(lastLine().kind).toBe('error')
    expect(lastLine().text).toMatch(/end to end/)
  })

  it('asks for a selection first', () => {
    run('JOIN')

    expect(lastLine().kind).toBe('error')
    expect(lastLine().text).toMatch(/Select objects/)
  })

  it('can be undone in one step', () => {
    const first = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const second = createLine(layerId(), { x: 50, y: 0 }, { x: 120, y: 0 })
    seed([first, second])
    select([first.id, second.id])

    run('JOIN')
    useCadStore.getState().undo()

    expect(entities()).toHaveLength(2)
  })
})

describe('EXPLODE at the command line', () => {
  beforeEach(() => seed())

  it('breaks a rectangle into four lines', () => {
    const rect = createRect(layerId(), { x: 0, y: 0 }, { x: 40, y: 20 })
    seed([rect])
    select([rect.id])

    run('EXPLODE')

    expect(entities()).toHaveLength(4)
    expect(entities().every((entity) => entity.type === 'line')).toBe(true)
  })

  it('clears the selection, since the pieces are new objects', () => {
    const rect = createRect(layerId(), { x: 0, y: 0 }, { x: 40, y: 20 })
    seed([rect])
    select([rect.id])

    run('X')

    expect(useCadStore.getState().selectedIds).toEqual([])
  })

  it('says so when nothing in the selection has pieces to give', () => {
    const circle = createCircle(layerId(), { x: 0, y: 0 }, 10)
    seed([circle])
    select([circle.id])

    run('EXPLODE')

    expect(entities()).toHaveLength(1)
    expect(lastLine().kind).toBe('error')
    expect(lastLine().text).toMatch(/Nothing in the selection can be exploded/)
  })

  it('breaks up a group the selection belongs to as well', () => {
    const first = createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })
    const second = createLine(layerId(), { x: 0, y: 10 }, { x: 10, y: 10 })
    seed([first, second])
    select([first.id, second.id])
    run('GROUP')
    expect(useCadStore.getState().doc.groups).toHaveLength(1)

    select([first.id, second.id])
    run('EXPLODE')

    expect(useCadStore.getState().doc.groups).toHaveLength(0)
  })

  it('asks for a selection first', () => {
    run('EXPLODE')

    expect(lastLine().kind).toBe('error')
    expect(lastLine().text).toMatch(/Select objects/)
  })

  it('leaves groups alone under UNGROUP but keeps the objects whole', () => {
    const rect = createRect(layerId(), { x: 0, y: 0 }, { x: 40, y: 20 })
    seed([rect])
    select([rect.id])
    run('GROUP')

    select([rect.id])
    run('UNGROUP')

    expect(useCadStore.getState().doc.groups).toHaveLength(0)
    expect(entities()).toHaveLength(1)
    expect(entities()[0].type).toBe('polyline')
  })
})

describe('OVERKILL at the command line', () => {
  beforeEach(() => seed())

  it('deletes a line that was drawn twice', () => {
    const original = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const copy = { ...original, id: 'copy' }
    seed([original, copy])
    select([original.id, copy.id])

    run('OVERKILL')

    expect(entities()).toHaveLength(1)
    expect(lastLine().text).toBe('Deleted 1 duplicate')
  })

  it('absorbs overlapping lines into one', () => {
    const first = createLine(layerId(), { x: 0, y: 0 }, { x: 60, y: 0 })
    const second = createLine(layerId(), { x: 40, y: 0 }, { x: 100, y: 0 })
    seed([first, second])
    select([first.id, second.id])

    run('OV')

    expect(entities()).toHaveLength(1)
    expect((entities()[0] as LineEntity).end).toEqual({ x: 100, y: 0 })
  })

  it('leaves objects outside the selection untouched', () => {
    const original = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const copy = { ...original, id: 'copy' }
    const elsewhere = createCircle(layerId(), { x: 200, y: 200 }, 10)
    seed([original, copy, elsewhere])
    select([original.id, copy.id])

    run('OVERKILL')

    expect(entities()).toHaveLength(2)
    expect(entities().some((entity) => entity.id === elsewhere.id)).toBe(true)
  })

  it('says there was nothing to do on clean geometry', () => {
    const first = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    const second = createLine(layerId(), { x: 0, y: 30 }, { x: 50, y: 30 })
    seed([first, second])
    select([first.id, second.id])

    run('OVERKILL')

    expect(entities()).toHaveLength(2)
    expect(lastLine().text).toMatch(/Nothing to clean up/)
  })

  it('points at ALL when nothing is selected', () => {
    run('OVERKILL')

    expect(lastLine().kind).toBe('error')
    expect(lastLine().text).toMatch(/ALL/)
  })

  it('cleans the whole drawing after ALL', () => {
    const original = createLine(layerId(), { x: 0, y: 0 }, { x: 50, y: 0 })
    seed([original, { ...original, id: 'copy' }, { ...original, id: 'copy-2' }])

    run('ALL')
    run('OVERKILL')

    expect(entities()).toHaveLength(1)
  })
})

describe('BOUNDARY at the command line', () => {
  beforeEach(() => seed())

  /** Four lines enclosing a square, which is the simplest thing a boundary can be traced round. */
  const squareOfLines = () => [
    createLine(layerId(), { x: 0, y: 0 }, { x: 100, y: 0 }),
    createLine(layerId(), { x: 100, y: 0 }, { x: 100, y: 100 }),
    createLine(layerId(), { x: 100, y: 100 }, { x: 0, y: 100 }),
    createLine(layerId(), { x: 0, y: 100 }, { x: 0, y: 0 }),
  ]

  it('starts the tool and asks for a point inside an area', () => {
    run('BOUNDARY')

    expect(useCadStore.getState().activeTool).toBe('boundary')
    expect(useCadStore.getState().history.at(-1)!.text).toMatch(/internal point/)
  })

  it('traces a closed polyline round the area that was picked', () => {
    seed(squareOfLines())

    run('BO')
    applyDrawTool({ x: 50, y: 50 })

    const traced = entities().filter((entity) => entity.type === 'polyline') as PolylineEntity[]
    expect(traced).toHaveLength(1)
    expect(traced[0].closed).toBe(true)
    expect(traced[0].points).toHaveLength(4)
  })

  it('leaves the objects that enclose the area exactly as they were', () => {
    seed(squareOfLines())

    run('BOUNDARY')
    applyDrawTool({ x: 50, y: 50 })

    expect(entities().filter((entity) => entity.type === 'line')).toHaveLength(4)
  })

  it('traces only the smaller area when one is divided in two', () => {
    seed([...squareOfLines(), createLine(layerId(), { x: 30, y: 0 }, { x: 30, y: 100 })])

    run('BOUNDARY')
    applyDrawTool({ x: 15, y: 50 })

    const traced = entities().find((entity) => entity.type === 'polyline') as PolylineEntity
    const width = Math.max(...traced.points.map((point) => point.x)) - Math.min(...traced.points.map((point) => point.x))
    expect(width).toBeCloseTo(30, 6)
  })

  it('says so when the point is not inside anything', () => {
    seed(squareOfLines())

    run('BOUNDARY')
    applyDrawTool({ x: 500, y: 500 })

    expect(entities().filter((entity) => entity.type === 'polyline')).toHaveLength(0)
    expect(useCadStore.getState().statusMessage).toMatch(/No enclosed area/)
  })

  it('stays in the command so several areas can be traced in a row', () => {
    seed(squareOfLines())

    run('BOUNDARY')
    applyDrawTool({ x: 50, y: 50 })

    expect(useCadStore.getState().activeTool).toBe('boundary')
  })

  it('makes an outline that can then be filled or offset like any other polyline', () => {
    seed(squareOfLines())

    run('BOUNDARY')
    applyDrawTool({ x: 50, y: 50 })
    const traced = entities().find((entity) => entity.type === 'polyline')!

    useCadStore.getState().setTool('select')
    select([traced.id])
    run('EXPLODE')

    expect(entities().filter((entity) => entity.type === 'line')).toHaveLength(8)
  })
})
