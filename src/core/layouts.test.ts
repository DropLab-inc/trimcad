import { beforeEach, describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { VIEWPORT_SCALES } from './print'
import { useCadStore } from './store'
import type { CadEntity } from './types'

/** Start every test from a clean drawing, with no sheet open. */
const reset = (entities: CadEntity[] = []) => {
  useCadStore.setState({ activeLayoutId: null, activeViewportId: null, selectedIds: [] })
  /*
   * The store mirrors a document controller, so the drawing is replaced through the store's own
   * path: assigning `doc` directly leaves the controller holding the previous test's drawing and
   * handing it back on the next edit, and merging over it would leave that drawing's sheets behind.
   */
  state().newDrawing()
  if (entities.length > 0) useCadStore.getState().updateDocument((doc) => ({ ...doc, entities }))
}

const state = () => useCadStore.getState()
const activeLayout = () => {
  const id = state().activeLayoutId
  return state().doc.layouts.find((layout) => layout.id === id)!
}

describe('layouts', () => {
  beforeEach(() => reset())

  it('opens a sheet with a viewport already showing the drawing', () => {
    reset([createLine(state().doc.layers[0].id, { x: 0, y: 0 }, { x: 400, y: 300 })])
    state().addLayout()

    const layout = activeLayout()
    expect(layout.paper).toBe('a4')
    expect(layout.orientation).toBe('landscape')
    expect(layout.viewports).toHaveLength(1)
    // The viewport is switched to as soon as it exists, so the panel has something to describe.
    expect(state().activeViewportId).toBe(layout.viewports[0].id)
  })

  it('fits the drawing at the smallest standard scale that holds it', () => {
    // 4000 mm across an A4 landscape sheet needs roughly 1:20; the next round scale up is 1:20.
    reset([createLine(state().doc.layers[0].id, { x: 0, y: 0 }, { x: 4000, y: 3000 })])
    state().addLayout()

    const viewport = activeLayout().viewports[0]
    expect(VIEWPORT_SCALES).toContain(viewport.unitsPerMm)
    expect(viewport.unitsPerMm).toBeGreaterThanOrEqual(4000 / viewport.widthMm)
  })

  it('centres the fitted viewport on the middle of the drawing', () => {
    reset([createLine(state().doc.layers[0].id, { x: -500, y: -200 }, { x: 500, y: 200 })])
    state().addLayout()
    expect(activeLayout().viewports[0].modelCenter).toEqual({ x: 0, y: 0 })
  })

  it('goes back to model space when the open sheet is deleted', () => {
    state().addLayout()
    const id = state().activeLayoutId!
    state().deleteLayout(id)
    expect(state().activeLayoutId).toBeNull()
    expect(state().doc.layouts).toHaveLength(0)
  })

  it('drops the selection and the tool when switching space', () => {
    state().setTool('line')
    useCadStore.setState({ selectedIds: ['anything'] })
    state().addLayout()
    expect(state().selectedIds).toEqual([])
    expect(state().activeTool).toBe('select')
  })

  it('refuses an unknown sheet rather than pretending to open one', () => {
    state().setActiveLayout('does-not-exist')
    expect(state().activeLayoutId).toBeNull()
  })
})

describe('viewports', () => {
  beforeEach(() => reset())

  it('adds a second viewport that does not land on the first', () => {
    state().addLayout()
    const layoutId = state().activeLayoutId!
    const first = activeLayout().viewports[0].center

    state().addViewport(layoutId)

    const viewports = activeLayout().viewports
    expect(viewports).toHaveLength(2)
    expect(viewports[1].center).not.toEqual(first)
    expect(state().activeViewportId).toBe(viewports[1].id)
  })

  it('sets a viewport scale, which is what decides how big the drawing reads', () => {
    state().addLayout()
    const layoutId = state().activeLayoutId!
    const viewportId = activeLayout().viewports[0].id

    state().updateViewport(layoutId, viewportId, { unitsPerMm: 50 })

    expect(activeLayout().viewports[0].unitsPerMm).toBe(50)
  })

  it('locks a viewport and can unlock it again', () => {
    state().addLayout()
    const layoutId = state().activeLayoutId!
    const viewportId = activeLayout().viewports[0].id

    state().updateViewport(layoutId, viewportId, { locked: true })
    expect(activeLayout().viewports[0].locked).toBe(true)
    state().updateViewport(layoutId, viewportId, { locked: false })
    expect(activeLayout().viewports[0].locked).toBe(false)
  })

  it('moves a viewport without disturbing its scale', () => {
    state().addLayout()
    const layoutId = state().activeLayoutId!
    const before = activeLayout().viewports[0]

    state().updateViewport(layoutId, before.id, { center: { x: 40, y: 60 } })

    const after = activeLayout().viewports[0]
    expect(after.center).toEqual({ x: 40, y: 60 })
    expect(after.unitsPerMm).toBe(before.unitsPerMm)
    expect(after.widthMm).toBe(before.widthMm)
  })

  it('deletes a viewport and clears it as the active one', () => {
    state().addLayout()
    const layoutId = state().activeLayoutId!
    const viewportId = activeLayout().viewports[0].id

    state().deleteViewport(layoutId, viewportId)

    expect(activeLayout().viewports).toHaveLength(0)
    expect(state().activeViewportId).toBeNull()
  })

  it('leaves other sheets alone when one is edited', () => {
    state().addLayout()
    const firstLayout = state().activeLayoutId!
    state().addLayout()
    const secondLayout = state().activeLayoutId!
    const secondViewport = activeLayout().viewports[0].id

    state().updateViewport(secondLayout, secondViewport, { unitsPerMm: 100 })

    const untouched = state().doc.layouts.find((layout) => layout.id === firstLayout)!
    expect(untouched.viewports[0].unitsPerMm).not.toBe(100)
  })
})
