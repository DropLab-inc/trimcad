import { beforeEach, describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { pageSizeMm } from './print'
import { applyDrawTool, useCadStore } from './store'
import type { CadEntity, Layout } from './types'

const state = () => useCadStore.getState()
const sheetEntities = (): CadEntity[] =>
  state().doc.layouts.find((layout) => layout.id === state().activeLayoutId)?.entities ?? []
const sheet = (): Layout => state().doc.layouts.find((l) => l.id === state().activeLayoutId) as Layout

const reset = () => {
  state().cancelCommand()
  state().setSelection([])
  state().newDrawing()
  useCadStore.setState({ activeLayoutId: null, selectedIds: [] })
}

/** Draw on a sheet the way a tool does, then hand the object back. */
const drawOnSheet = (): CadEntity => {
  const line = createLine(state().doc.layers[0].id, { x: 20, y: 20 }, { x: 120, y: 20 })
  state().addEntity(line)
  return line
}

describe('editing on a sheet stays on the sheet', () => {
  beforeEach(reset)

  it('copies the sheet object, not something in the model', () => {
    state().addLayout()
    const line = drawOnSheet()
    state().setSelection([line.id])

    // The route that used to do nothing and still report success.
    state().setTool('copy')
    state().addDraftPoint({ x: 20, y: 20 })
    applyDrawTool({ x: 20, y: 60 })

    expect(sheetEntities()).toHaveLength(2)
    // And the model is untouched: a sheet is a space of its own, in both directions.
    expect(state().doc.entities).toHaveLength(0)
    expect(state().statusMessage).toMatch(/COPY complete/)
  })

  it('moves the sheet object rather than a model object of the same id', () => {
    state().addLayout()
    const line = drawOnSheet()
    state().setSelection([line.id])

    state().setTool('move')
    state().addDraftPoint({ x: 20, y: 20 })
    applyDrawTool({ x: 20, y: 40 })

    expect(sheetEntities()).toHaveLength(1)
    const moved = sheetEntities()[0]
    expect(moved.type).toBe('line')
    if (moved.type !== 'line') return
    expect(moved.start.y).toBeCloseTo(40, 6)
    expect(state().doc.entities).toHaveLength(0)
  })

  it('copies a sheet object and pastes it back onto the sheet', () => {
    state().addLayout()
    const line = drawOnSheet()
    state().setSelection([line.id])

    state().copySelection()
    expect(state().clipboard).toHaveLength(1)

    state().pasteClipboard()

    // Copy, cut and paste all addressed the model before, so on a sheet the clipboard came back empty.
    expect(sheetEntities()).toHaveLength(2)
    expect(state().doc.entities).toHaveLength(0)
  })

  it('still edits the model when the model is what is open', () => {
    const line = createLine(state().doc.layers[0].id, { x: 0, y: 0 }, { x: 10, y: 0 })
    state().addEntity(line)
    state().setSelection([line.id])

    state().setTool('move')
    state().addDraftPoint({ x: 0, y: 0 })
    applyDrawTool({ x: 0, y: 5 })

    const moved = state().doc.entities[0]
    if (moved.type !== 'line') return
    expect(moved.start.y).toBeCloseTo(5, 6)
  })
})

describe('changing a sheet’s paper', () => {
  beforeEach(reset)

  it('takes the size, the orientation and the margin', () => {
    state().addLayout()
    const id = state().activeLayoutId!

    expect(pageSizeMm(sheet().paper, sheet().orientation)).toEqual({ width: 297, height: 210 })

    state().updateLayout(id, { paper: 'a3', orientation: 'portrait', marginMm: 20 })

    const after = sheet()
    expect(after.paper).toBe('a3')
    expect(after.orientation).toBe('portrait')
    expect(after.marginMm).toBe(20)
    // A3 portrait is the other way round and bigger, which is the reason to have the control at all.
    expect(pageSizeMm(after.paper, after.orientation)).toEqual({ width: 297, height: 420 })
  })

  it('renames the sheet without disturbing its objects', () => {
    state().addLayout()
    const id = state().activeLayoutId!
    drawOnSheet()

    state().updateLayout(id, { name: 'Ground Floor' })

    expect(sheet().name).toBe('Ground Floor')
    expect(sheet().entities).toHaveLength(1)
  })
})
