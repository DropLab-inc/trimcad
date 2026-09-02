import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine } from './commands'
import { applyDrawTool, useCadStore } from './store'
import type { CadEntity } from './types'

const seed = (entities: CadEntity[] = []) => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.setTool('select')
  state.updateDocument((doc) => ({ ...doc, entities, groups: [] }))
  useCadStore.setState({ history: [], lastCommand: null, cursorWorld: null })
}

const layerId = () => useCadStore.getState().doc.layers[0].id
const run = (line: string) => useCadStore.getState().executeCommand(line)
const entities = () => useCadStore.getState().doc.entities

describe('typing commands', () => {
  beforeEach(() => seed())

  it('starts a tool from its canonical name', () => {
    run('CIRCLE')
    expect(useCadStore.getState().activeTool).toBe('circle')
  })

  it('starts a tool from its alias, whatever the case', () => {
    run('l')
    expect(useCadStore.getState().activeTool).toBe('line')
  })

  it('reports text that names no command', () => {
    run('WOBBLE')
    const last = useCadStore.getState().history.at(-1)!
    expect(last.kind).toBe('error')
    expect(last.text).toContain('WOBBLE')
  })

  it('echoes what was typed into the scrollback', () => {
    run('rec')
    expect(useCadStore.getState().history.some((line) => line.kind === 'input' && line.text === 'REC')).toBe(true)
  })

  it('switches dimension type from the dimension commands', () => {
    run('DIMRADIUS')
    expect(useCadStore.getState().dimensionType).toBe('radial')
    expect(useCadStore.getState().activeTool).toBe('dimension')
  })
})

describe('repeating the last command', () => {
  beforeEach(() => seed())

  it('re-runs the previous command when Enter arrives at an idle prompt', () => {
    run('CIRCLE')
    useCadStore.getState().setTool('select')

    run('')

    expect(useCadStore.getState().activeTool).toBe('circle')
  })

  it('finishes the running command instead of repeating when points are pending', () => {
    run('PLINE')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 10, y: 10 })

    run('')

    expect(entities().at(-1)?.type).toBe('polyline')
    expect(useCadStore.getState().draftPoints).toHaveLength(0)
  })

  it('does nothing when there is no previous command', () => {
    run('')
    expect(useCadStore.getState().activeTool).toBe('select')
  })
})

describe('typed coordinates and distances', () => {
  beforeEach(() => seed())

  it('accepts an absolute coordinate as a point', () => {
    run('LINE')
    run('0,0')
    run('40,30')

    const line = entities().at(-1)!
    expect(line.type === 'line' && line.end).toEqual({ x: 40, y: 30 })
  })

  it('accepts a polar coordinate relative to the last point', () => {
    run('LINE')
    run('0,0')
    run('@100<90')

    const line = entities().at(-1)!
    expect(line.type === 'line' && line.end.x).toBeCloseTo(0, 6)
    expect(line.type === 'line' && line.end.y).toBeCloseTo(100, 6)
  })

  it('reads a bare number as a distance along the crosshair direction', () => {
    run('LINE')
    run('0,0')
    // The crosshair sits somewhere along +X, so 25 means 25 units that way.
    useCadStore.setState({ cursorWorld: { x: 5, y: 0 } })
    run('25')

    const line = entities().at(-1)!
    expect(line.type === 'line' && line.end.x).toBeCloseTo(25, 6)
    expect(line.type === 'line' && line.end.y).toBeCloseTo(0, 6)
  })
})

describe('transform commands', () => {
  beforeEach(() => seed())

  it('moves the selection by the displacement between two picks', () => {
    const line = createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })
    seed([line])
    useCadStore.getState().setSelection([line.id])

    run('MOVE')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 5, y: 7 })

    const moved = entities().find((entity) => entity.id === line.id)!
    expect(moved.type === 'line' && moved.start).toEqual({ x: 5, y: 7 })
  })

  it('leaves the original behind when copying', () => {
    const circle = createCircle(layerId(), { x: 0, y: 0 }, 5)
    seed([circle])
    useCadStore.getState().setSelection([circle.id])

    run('COPY')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 30, y: 0 })

    const circles = entities().filter((entity) => entity.type === 'circle')
    expect(circles).toHaveLength(2)
    expect(circles.some((entity) => entity.type === 'circle' && entity.center.x === 0)).toBe(true)
    expect(circles.some((entity) => entity.type === 'circle' && entity.center.x === 30)).toBe(true)
  })

  it('rotates geometry rather than shifting it', () => {
    const line = createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })
    seed([line])
    useCadStore.getState().setSelection([line.id])

    run('ROTATE')
    applyDrawTool({ x: 0, y: 0 })
    run('90')

    const rotated = entities().find((entity) => entity.id === line.id)!
    expect(rotated.type === 'line' && rotated.end.x).toBeCloseTo(0, 6)
    expect(rotated.type === 'line' && rotated.end.y).toBeCloseTo(10, 6)
  })

  it('scales by a typed factor about the base point', () => {
    const line = createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })
    seed([line])
    useCadStore.getState().setSelection([line.id])

    run('SCALE')
    applyDrawTool({ x: 0, y: 0 })
    run('3')

    const scaled = entities().find((entity) => entity.id === line.id)!
    expect(scaled.type === 'line' && scaled.end.x).toBeCloseTo(30, 6)
  })

  it('refuses to run without a selection', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])
    useCadStore.getState().setSelection([])

    run('MOVE')
    applyDrawTool({ x: 0, y: 0 })

    expect(useCadStore.getState().statusMessage).toContain('Select objects')
    expect(useCadStore.getState().draftPoints).toHaveLength(0)
  })
})

describe('toggles and selection commands', () => {
  beforeEach(() => seed())

  it('toggles drafting aids by name', () => {
    const before = useCadStore.getState().orthoEnabled
    run('ORTHO')
    expect(useCadStore.getState().orthoEnabled).toBe(!before)
  })

  it('selects everything with ALL', () => {
    seed([
      createLine(layerId(), { x: 0, y: 0 }, { x: 1, y: 0 }),
      createCircle(layerId(), { x: 0, y: 0 }, 2),
    ])

    run('ALL')

    expect(useCadStore.getState().selectedIds).toHaveLength(2)
  })

  it('erases the selection', () => {
    const line = createLine(layerId(), { x: 0, y: 0 }, { x: 1, y: 0 })
    seed([line])
    useCadStore.getState().setSelection([line.id])

    run('E')

    expect(entities()).toHaveLength(0)
  })
})

describe('command options', () => {
  beforeEach(() => seed())

  it('treats a keyword as an option rather than a new command', () => {
    run('PLINE')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 10, y: 10 })

    // `C` would start CIRCLE at an idle prompt, but here it closes the polyline.
    run('C')

    const polyline = entities().at(-1)!
    expect(polyline.type === 'polyline' && polyline.closed).toBe(true)
    expect(useCadStore.getState().activeTool).toBe('polyline')
  })

  it('starts the command of the same name once nothing is running', () => {
    run('C')
    expect(useCadStore.getState().activeTool).toBe('circle')
  })
})
