import { beforeEach, describe, expect, it } from 'vitest'
import { applyDrawTool, useCadStore } from './store'
import { trackingAppliesTo } from './snap'
import type { CadEntity, LineEntity } from './types'

const seed = (entities: CadEntity[] = []) => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.setTool('select')
  state.updateDocument((doc) => ({ ...doc, entities, groups: [] }))
  useCadStore.setState({ history: [], lastCommand: null, cursorWorld: null })
}

const state = () => useCadStore.getState()
const entities = () => useCadStore.getState().doc.entities
const lines = () => entities().filter((entity): entity is LineEntity => entity.type === 'line')
const draw = (...points: { x: number; y: number }[]) => points.forEach((point) => applyDrawTool(point))

describe('drawing a run of lines', () => {
  beforeEach(() => seed())

  it('keeps the command running so the next click continues the run', () => {
    state().setTool('line')
    draw({ x: 0, y: 0 }, { x: 10, y: 0 })

    expect(lines()).toHaveLength(1)
    expect(state().activeTool).toBe('line')
  })

  it('starts each new segment where the last one ended', () => {
    state().setTool('line')
    draw({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })

    const drawn = lines()
    expect(drawn).toHaveLength(2)
    expect(drawn[1].start).toEqual({ x: 10, y: 0 })
    expect(drawn[1].end).toEqual({ x: 10, y: 10 })
  })

  it('joins the last point back to the first when the run is closed', () => {
    state().setTool('line')
    draw({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })
    state().closeDraft()

    const closing = lines().at(-1)!
    expect(closing.start).toEqual({ x: 10, y: 10 })
    expect(closing.end).toEqual({ x: 0, y: 0 })
    expect(state().draftPoints).toHaveLength(0)
  })

  it('rewinds the rubber band along with the segment when a step is undone', () => {
    state().setTool('line')
    draw({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })
    state().applyKeyword({ key: 'U', label: 'Undo' })

    expect(lines()).toHaveLength(1)
    expect(state().draftPoints.at(-1)).toEqual({ x: 10, y: 0 })
  })
})

describe('commands that finish on their own', () => {
  beforeEach(() => seed())

  it('returns to the selection prompt once a circle is drawn', () => {
    state().setTool('circle')
    draw({ x: 0, y: 0 }, { x: 10, y: 0 })

    expect(entities()).toHaveLength(1)
    expect(state().activeTool).toBe('select')
  })

  it('returns to the selection prompt once a rectangle is drawn', () => {
    state().setTool('rect')
    draw({ x: 0, y: 0 }, { x: 10, y: 5 })

    expect(state().activeTool).toBe('select')
  })

  it('can be run again straight away by repeating the last command', () => {
    state().executeCommand('CIRCLE')
    draw({ x: 0, y: 0 }, { x: 10, y: 0 })
    state().repeatLastCommand()

    expect(state().activeTool).toBe('circle')

    draw({ x: 50, y: 0 }, { x: 60, y: 0 })
    expect(entities()).toHaveLength(2)
  })
})

describe('leaving a command', () => {
  beforeEach(() => seed())

  it('drops back to selection and forgets a half-drawn shape', () => {
    state().setTool('line')
    draw({ x: 0, y: 0 })
    state().cancelCommand()

    expect(state().activeTool).toBe('select')
    expect(state().draftPoints).toHaveLength(0)
    expect(entities()).toHaveLength(0)
  })

  it('says it cancelled in the scrollback', () => {
    state().setTool('circle')
    state().cancelCommand()

    expect(state().history.at(-1)!.text).toBe('*Cancel*')
  })

  it('abandons a half-finished trim, edges and all', () => {
    state().setTool('trim')
    state().beginEdgeSelection()
    state().cancelCommand()

    expect(state().activeTool).toBe('select')
    expect(state().pickingEdges).toBe(false)
    expect(state().edgeIds).toBeNull()
  })

  it('still remembers what ran last so it can be repeated', () => {
    state().executeCommand('CIRCLE')
    state().cancelCommand()
    state().repeatLastCommand()

    expect(state().activeTool).toBe('circle')
  })
})

describe('which picks ortho and polar may steer', () => {
  it('steers picks that are a direction from the last point', () => {
    expect(trackingAppliesTo('line')).toBe(true)
    expect(trackingAppliesTo('polyline')).toBe(true)
    expect(trackingAppliesTo('move')).toBe(true)
  })

  it('leaves shapes alone whose second pick sets two sizes at once', () => {
    // Forcing these onto an axis would give a rectangle no height and an ellipse no minor axis.
    expect(trackingAppliesTo('rect')).toBe(false)
    expect(trackingAppliesTo('ellipse')).toBe(false)
  })
})
