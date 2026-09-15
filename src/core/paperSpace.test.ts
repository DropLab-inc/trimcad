import { beforeEach, describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { useCadStore } from './store'
import type { Layout, TextEntity } from './types'

const state = () => useCadStore.getState()

const reset = () => {
  useCadStore.setState({
    activeLayoutId: null,
    activeViewportId: null,
    enteredViewportId: null,
    selectedIds: [],
  })
  /*
   * The store only mirrors a document controller, and `updateDocument` mutates *that* document — so
   * writing `doc` directly would leave the controller holding the previous test's drawing and hand
   * it straight back on the next edit. The drawing has to be replaced the way the app replaces it.
   */
  state().newDrawing()
}

const layerId = () => state().doc.layers[0].id

/** The sheet a test is working on. Throws rather than returning undefined so a mistake is loud. */
const sheet = (layoutId: string | null = state().activeLayoutId): Layout => {
  const found = state().doc.layouts.find((layout) => layout.id === layoutId)
  if (!found) throw new Error(`no sheet ${layoutId}`)
  return found
}

/** Draw a line the way a tool does — through addEntity, which is the single door into a space. */
const drawOnSheet = (from = { x: 20, y: 20 }, to = { x: 120, y: 20 }) => {
  const line = createLine(layerId(), from, to)
  state().addEntity(line)
  return line
}

describe('a sheet is a space of its own', () => {
  beforeEach(reset)

  it('collects what is drawn on it instead of putting it in the model', () => {
    state().addLayout()
    const line = drawOnSheet()

    expect(sheet().entities).toEqual([line])
    // The drawing itself must be untouched: a border drawn at 20 mm on the paper is not an object
    // sitting 20 units from the origin of the building.
    expect(state().doc.entities).toHaveLength(0)
  })

  it('still draws into the model when the model is what is open', () => {
    const line = drawOnSheet({ x: 0, y: 0 }, { x: 5000, y: 0 })

    expect(state().doc.entities).toEqual([line])
  })

  it('keeps one sheet’s objects off another sheet', () => {
    state().addLayout()
    const first = state().activeLayoutId!
    drawOnSheet()
    state().addLayout()
    const second = state().activeLayoutId!

    expect(state().doc.layouts.find((l) => l.id === first)?.entities).toHaveLength(1)
    expect(state().doc.layouts.find((l) => l.id === second)?.entities).toHaveLength(0)
  })

  it('carries text, which is what a title block is mostly made of', () => {
    state().addLayout()
    const note: TextEntity = {
      id: 'note-1',
      type: 'text',
      layerId: layerId(),
      position: { x: 20, y: 190 },
      value: 'Drawing 24-118',
      height: 5,
    }
    state().addEntity(note)

    expect(sheet().entities).toEqual([note])
    expect(state().doc.entities).toHaveLength(0)
  })

  it('erases from the sheet without reaching into the model', () => {
    // A model object that happens to be selected when the sheet is opened must not be collateral.
    const modelLine = createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })
    state().addEntity(modelLine)
    state().addLayout()
    const sheetLine = drawOnSheet()
    state().setSelection([sheetLine.id])

    state().deleteSelection()

    expect(sheet().entities).toHaveLength(0)
    expect(state().doc.entities.map((entity) => entity.id)).toEqual([modelLine.id])
  })

  it('moves a sheet object by the distance dragged on the paper, not by drawing units', () => {
    state().addLayout()
    const line = drawOnSheet({ x: 20, y: 20 }, { x: 120, y: 20 })
    state().setSelection([line.id])

    state().moveSelectionBy({ x: 5, y: -3 })

    const moved = sheet().entities[0]
    expect(moved.type).toBe('line')
    if (moved.type !== 'line') return
    // Five millimetres across the page is five millimetres, whatever any viewport is scaled to.
    expect(moved.start).toEqual({ x: 25, y: 17 })
    expect(moved.end).toEqual({ x: 125, y: 17 })
  })

  it('leaves the sheet alone when a model object is selected in model space', () => {
    state().addLayout()
    const sheetId = state().activeLayoutId
    const sheetLine = drawOnSheet()
    state().setActiveLayout(null)
    const modelLine = createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 10 })
    state().addEntity(modelLine)
    state().setSelection([modelLine.id])

    state().moveSelectionBy({ x: 100, y: 0 })

    expect(sheet(sheetId).entities).toEqual([sheetLine])
  })
})
