import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine } from './commands'
import { makeDefaultDocument } from './document'
import { formatPrompt } from './prompts'
import { applyDrawTool, currentPrompt, useCadStore } from './store'

const state = () => useCadStore.getState()
const run = (line: string) => useCadStore.getState().executeCommand(line)
const promptText = () => formatPrompt(currentPrompt(useCadStore.getState()))
const lastResult = () =>
  [...useCadStore.getState().history].reverse().find((line) => line.kind === 'result')?.text ?? ''
const lastError = () =>
  [...useCadStore.getState().history].reverse().find((line) => line.kind === 'error')?.text ?? ''

beforeEach(() => {
  const store = useCadStore.getState()
  store.cancelCommand()
  store.setSelection([])
  store.updateDocument(() => makeDefaultDocument())
})

describe('the idle prompt', () => {
  it('reads Command, the way AutoCAD sits waiting', () => {
    expect(promptText()).toBe('Command:')
  })

  it('goes back to Command once a command is cancelled', () => {
    run('LINE')
    expect(promptText()).not.toBe('Command:')

    state().cancelCommand()
    expect(promptText()).toBe('Command:')
  })
})

describe('starting commands', () => {
  it('accepts a command by name', () => {
    run('CIRCLE')
    expect(state().activeTool).toBe('circle')
  })

  it('accepts an alias', () => {
    run('L')
    expect(state().activeTool).toBe('line')
  })

  it('does not care about case', () => {
    run('line')
    expect(state().activeTool).toBe('line')
  })

  it('says so when a command does not exist', () => {
    run('NOTACOMMAND')
    expect(lastError()).toMatch(/unknown command/i)
  })

  it('echoes what was typed into the history', () => {
    run('LINE')
    const echoed = state().history.filter((line) => line.kind === 'input')
    expect(echoed.at(-1)?.text).toBe('LINE')
  })
})

describe('running a command transparently', () => {
  it('leaves the interrupted command running', () => {
    run('LINE')
    applyDrawTool({ x: 0, y: 0 })

    run("'ORTHO")

    expect(state().activeTool).toBe('line')
    expect(state().draftPoints).toHaveLength(1)
  })

  it('still does what the transparent command asks', () => {
    const before = state().orthoEnabled
    run('LINE')
    run("'ORTHO")
    expect(state().orthoEnabled).toBe(!before)
  })

  it('refuses a command that cannot run inside another', () => {
    run('LINE')
    run("'CIRCLE")

    expect(lastError()).toMatch(/cannot be used transparently/i)
    expect(state().activeTool).toBe('line')
  })

  it('accepts the underscore prefix that DXF and scripts use', () => {
    run('_LINE')
    expect(state().activeTool).toBe('line')
  })
})

describe('answering a prompt', () => {
  it('takes an option by its shortcut letter', () => {
    run('PLINE')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 10, y: 10 })

    run('C')

    // Closing ends the run, leaving a closed polyline behind.
    const polyline = state().doc.entities.find((entity) => entity.type === 'polyline')
    expect(polyline).toBeDefined()
    if (polyline?.type === 'polyline') expect(polyline.closed).toBe(true)
  })

  it('prefers an option over a command of the same name', () => {
    run('PLINE')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 10, y: 10 })

    // `C` would start CIRCLE at an idle prompt, but here it closes the run.
    run('C')
    expect(state().activeTool).not.toBe('circle')
  })

  it('takes typed coordinates', () => {
    run('LINE')
    run('0,0')
    run('50,30')

    const line = state().doc.entities.find((entity) => entity.type === 'line')
    expect(line).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 50, y: 30 } })
  })

  it('takes a relative coordinate', () => {
    run('LINE')
    run('10,10')
    run('@20,0')

    const line = state().doc.entities.find((entity) => entity.type === 'line')
    if (line?.type === 'line') expect(line.end).toMatchObject({ x: 30, y: 10 })
  })

  it('takes a polar coordinate', () => {
    run('LINE')
    run('0,0')
    run('@10<90')

    const line = state().doc.entities.find((entity) => entity.type === 'line')
    if (line?.type === 'line') {
      expect(line.end.x).toBeCloseTo(0, 6)
      expect(line.end.y).toBeCloseTo(10, 6)
    }
  })
})

describe('OFFSET, which asks for its distance first', () => {
  it('opens by asking for the distance', () => {
    run('OFFSET')
    expect(promptText()).toMatch(/^Specify offset distance or \[Through\/Erase\/Layer\]/)
  })

  it('takes a typed distance and moves on to picking an object', () => {
    run('OFFSET')
    run('5')

    expect(state().offsetDistance).toBe(5)
    expect(promptText()).toMatch(/Select object to offset/)
  })

  it('refuses a distance of zero', () => {
    run('OFFSET')
    run('0')

    expect(lastError()).toMatch(/greater than zero/i)
    expect(promptText()).toMatch(/Specify offset distance/)
  })

  it('offsets by the distance that was typed', () => {
    const layerId = state().doc.layers[0].id
    state().updateDocument((doc) => ({
      ...doc,
      entities: [createCircle(layerId, { x: 0, y: 0 }, 10)],
    }))

    run('OFFSET')
    run('4')
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 20, y: 0 })

    const radii = state()
      .doc.entities.filter((entity) => entity.type === 'circle')
      .map((entity) => (entity.type === 'circle' ? entity.radius : 0))
    expect(radii).toContain(14)
  })

  it('switches to Through, which takes its distance from the picked point', () => {
    run('OFFSET')
    run('T')

    expect(state().offsetThrough).toBe(true)
    expect(promptText()).toMatch(/Select object to offset/)
  })

  it('turns the Erase option on and off', () => {
    run('OFFSET')
    run('E')
    expect(lastResult()).toMatch(/Erase source after offsetting: Yes/)

    run('E')
    expect(lastResult()).toMatch(/Erase source after offsetting: No/)
  })

  it('chooses which layer the copy lands on', () => {
    run('OFFSET')
    run('L')
    expect(lastResult()).toMatch(/current layer/)
  })
})

describe('repeating and cancelling', () => {
  it('repeats the last command on an empty line', () => {
    run('CIRCLE')
    state().endCommand()
    expect(state().activeTool).toBe('select')

    run('')
    expect(state().activeTool).toBe('circle')
  })

  it('finishes the run in progress rather than repeating', () => {
    run('LINE')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })

    run('')

    expect(state().doc.entities.some((entity) => entity.type === 'line')).toBe(true)
    expect(state().draftPoints).toHaveLength(0)
  })

  it('drops back to the idle prompt when cancelled', () => {
    run('LINE')
    applyDrawTool({ x: 0, y: 0 })

    state().cancelCommand()

    expect(state().activeTool).toBe('select')
    expect(state().draftPoints).toHaveLength(0)
  })
})

describe('view commands', () => {
  it('toggles lineweight display', () => {
    const before = state().lwDisplay
    run('LWDISPLAY')
    expect(state().lwDisplay).toBe(!before)
  })

  it('answers to the LWT alias', () => {
    const before = state().lwDisplay
    run('LWT')
    expect(state().lwDisplay).toBe(!before)
  })

  it('erases the selection', () => {
    const layerId = state().doc.layers[0].id
    state().updateDocument((doc) => ({
      ...doc,
      entities: [createLine(layerId, { x: 0, y: 0 }, { x: 1, y: 0 })],
    }))
    state().setSelection([state().doc.entities[0].id])

    run('ERASE')
    expect(state().doc.entities).toHaveLength(0)
  })
})
