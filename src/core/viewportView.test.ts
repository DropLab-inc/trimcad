import { beforeEach, describe, expect, it } from 'vitest'
import { makeDefaultDocument } from './document'
import { useCadStore, VIEWPORT_ZOOM_MAX, VIEWPORT_ZOOM_MIN } from './store'
import type { Vec2 } from './math/vec2'
import type { Layout, Viewport } from './types'

const state = () => useCadStore.getState()

const reset = () => {
  useCadStore.setState({
    doc: makeDefaultDocument(),
    activeLayoutId: null,
    activeViewportId: null,
    enteredViewportId: null,
    selectedIds: [],
  })
}

/** Open a sheet and hand back its fitted viewport, which is what a layout is born with. */
const openSheet = (): { layoutId: string; viewport: Viewport } => {
  state().addLayout()
  const layoutId = state().activeLayoutId!
  return { layoutId, viewport: currentViewport() }
}

const currentViewport = (): Viewport => {
  const { doc, activeViewportId } = state()
  const layout = doc.layouts.find((candidate) => candidate.id === state().activeLayoutId) as Layout
  return layout.viewports.find((viewport) => viewport.id === activeViewportId) ?? layout.viewports[0]
}

/** The drawing point a given spot on the sheet is showing — what a user sees under the cursor. */
const modelUnder = (viewport: Viewport, paper: Vec2) => ({
  x: viewport.modelCenter.x + (paper.x - viewport.center.x) * viewport.unitsPerMm,
  y: viewport.modelCenter.y + (paper.y - viewport.center.y) * viewport.unitsPerMm,
})

describe('working inside a viewport', () => {
  beforeEach(reset)

  it('holds the drawing still under the pointer while zooming', () => {
    const { layoutId, viewport } = openSheet()
    const anchor = { x: viewport.center.x + 12, y: viewport.center.y + 7 }
    const before = modelUnder(viewport, anchor)

    state().zoomViewport(layoutId, viewport.id, anchor, 1.1)

    const after = currentViewport()
    expect(after.unitsPerMm).toBeLessThan(viewport.unitsPerMm)
    // The spot that was pointed at still shows the same part of the drawing.
    expect(modelUnder(after, anchor).x).toBeCloseTo(before.x, 6)
    expect(modelUnder(after, anchor).y).toBeCloseTo(before.y, 6)
  })

  it('zooms out as readily as in', () => {
    const { layoutId, viewport } = openSheet()

    state().zoomViewport(layoutId, viewport.id, viewport.center, 0.9)

    expect(currentViewport().unitsPerMm).toBeGreaterThan(viewport.unitsPerMm)
  })

  it('stops at the ends of its range rather than passing them', () => {
    const { layoutId, viewport } = openSheet()

    for (let i = 0; i < 400; i += 1) state().zoomViewport(layoutId, viewport.id, viewport.center, 1.1)
    expect(currentViewport().unitsPerMm).toBeCloseTo(VIEWPORT_ZOOM_MIN, 10)

    for (let i = 0; i < 900; i += 1) state().zoomViewport(layoutId, viewport.id, viewport.center, 0.9)
    expect(currentViewport().unitsPerMm).toBeCloseTo(VIEWPORT_ZOOM_MAX, 6)
  })

  it('slides the drawing the way the drag went', () => {
    const { layoutId, viewport } = openSheet()
    // A drag to the right moves the sheet under the pointer, so the view looks further left.
    const step = { x: 5, y: -3 }

    state().panViewport(layoutId, viewport.id, step)

    const after = currentViewport()
    expect(after.modelCenter.x).toBeCloseTo(viewport.modelCenter.x - 5 * viewport.unitsPerMm, 6)
    expect(after.modelCenter.y).toBeCloseTo(viewport.modelCenter.y + 3 * viewport.unitsPerMm, 6)
    // Panning is not a zoom: how big the drawing reads must not change.
    expect(after.unitsPerMm).toBe(viewport.unitsPerMm)
  })

  it('leaves a locked viewport alone when the pointer tries to change it', () => {
    const { layoutId, viewport } = openSheet()
    state().updateViewport(layoutId, viewport.id, { locked: true })

    state().zoomViewport(layoutId, viewport.id, viewport.center, 1.1)
    state().panViewport(layoutId, viewport.id, { x: 20, y: 20 })

    const after = currentViewport()
    expect(after.unitsPerMm).toBe(viewport.unitsPerMm)
    expect(after.modelCenter).toEqual(viewport.modelCenter)
  })

  it('lets go of the viewport when the sheet is left', () => {
    const { layoutId, viewport } = openSheet()
    state().enterViewport(viewport.id)
    expect(state().enteredViewportId).toBe(viewport.id)

    state().setActiveLayout(null)
    expect(state().enteredViewportId).toBeNull()

    state().setActiveLayout(layoutId)
    state().enterViewport(viewport.id)
    state().setActiveLayout(layoutId)
    expect(state().enteredViewportId).toBeNull()
  })

  it('forgets a viewport that has been deleted', () => {
    const { layoutId, viewport } = openSheet()
    state().enterViewport(viewport.id)

    state().deleteViewport(layoutId, viewport.id)

    expect(state().enteredViewportId).toBeNull()
  })
})
