import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetPreferences } from '../core/preferences'
import { EMPTY_TYPED, useCadStore } from '../core/store'
import { CanvasViewport } from './CanvasViewport'
import { ZOOM_MAX, ZOOM_MIN } from './CanvasViewport'

/**
 * jsdom ships no Touch or TouchEvent of its own, and the viewport reads nothing from a touch
 * beyond its coordinates, so a plain cancelable Event carrying a touches list drives exactly
 * the path the browser does. jsdom also reports a zero-origin bounding box for the SVG, which
 * makes client coordinates and viewport coordinates the same number.
 */
const touch = (clientX: number, clientY: number) => ({ clientX, clientY })

const fireTouch = (element: Element, type: string, touches: unknown[]) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: touches })
  Object.defineProperty(event, 'changedTouches', { value: touches })
  element.dispatchEvent(event)
  return event
}

/** Two fingers straddling a centre point, `half` pixels either side of it. */
const spread = (centre: number, half: number, y = 150) => [
  touch(centre - half, y),
  touch(centre + half, y),
]

const setup = () => {
  resetPreferences()
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.setTypedState(EMPTY_TYPED)
  state.setCamera({ x: 0, y: 0, zoom: 1 })
  const { container } = render(<CanvasViewport />)
  return container.querySelector('svg')!
}

/** The drawing point currently sitting under a screen position. */
const worldUnder = (screen: number, cameraOffset: number, zoom: number) =>
  (screen - cameraOffset) / zoom

describe('two-finger pinch', () => {
  beforeEach(() => {
    useCadStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
  })

  it('doubles the zoom when the fingers move twice as far apart', () => {
    const svg = setup()
    fireTouch(svg, 'touchstart', spread(200, 40))
    fireTouch(svg, 'touchmove', spread(200, 80))

    expect(useCadStore.getState().camera.zoom).toBeCloseTo(2, 5)
  })

  it('keeps the drawing point that was between the fingers under them', () => {
    const svg = setup()
    fireTouch(svg, 'touchstart', spread(200, 40))
    fireTouch(svg, 'touchmove', spread(200, 80))

    const { x, y, zoom } = useCadStore.getState().camera
    expect(worldUnder(200, x, zoom)).toBeCloseTo(200, 5)
    expect(worldUnder(150, y, zoom)).toBeCloseTo(150, 5)
  })

  it('shrinks the zoom when the fingers come together', () => {
    const svg = setup()
    fireTouch(svg, 'touchstart', spread(200, 100))
    fireTouch(svg, 'touchmove', spread(200, 50))

    expect(useCadStore.getState().camera.zoom).toBeCloseTo(0.5, 5)
  })

  it('pans by the distance the fingers travel together, without changing the zoom', () => {
    const svg = setup()
    fireTouch(svg, 'touchstart', spread(200, 60))
    fireTouch(svg, 'touchmove', [
      touch(200 - 60 + 30, 180),
      touch(200 + 60 + 30, 180),
    ])

    const { x, y, zoom } = useCadStore.getState().camera
    expect(zoom).toBeCloseTo(1, 5)
    expect(x).toBeCloseTo(30, 5)
    expect(y).toBeCloseTo(30, 5)
  })

  it('cancels the browser gesture, which is what stops the page zooming instead', () => {
    const svg = setup()
    expect(fireTouch(svg, 'touchstart', spread(200, 40)).defaultPrevented).toBe(true)
    expect(fireTouch(svg, 'touchmove', spread(200, 80)).defaultPrevented).toBe(true)
  })

  it('leaves a single finger alone so tapping still draws', () => {
    const svg = setup()
    const event = fireTouch(svg, 'touchstart', [touch(200, 150)])

    expect(event.defaultPrevented).toBe(false)
    expect(useCadStore.getState().camera.zoom).toBe(1)
  })

  it('holds the zoom inside the same limits the wheel uses', () => {
    const svg = setup()

    // Pinched far past the ceiling rather than to a number: the test is about the clamp holding, so
    // it should not care what the ceiling is until someone changes it deliberately.
    fireTouch(svg, 'touchstart', spread(200, 1))
    fireTouch(svg, 'touchmove', spread(200, 5e6))
    expect(useCadStore.getState().camera.zoom).toBe(ZOOM_MAX)

    // And the same at the other end, where a gesture cannot shrink the view to nothing.
    fireTouch(svg, 'touchstart', spread(200, 5e6))
    fireTouch(svg, 'touchmove', spread(200, 1))
    expect(useCadStore.getState().camera.zoom).toBe(ZOOM_MIN)
  })

  it('measures a second gesture from where the first one left off', () => {
    const svg = setup()
    fireTouch(svg, 'touchstart', spread(200, 40))
    fireTouch(svg, 'touchmove', spread(200, 80))
    fireTouch(svg, 'touchend', [])

    fireTouch(svg, 'touchstart', spread(200, 50))
    fireTouch(svg, 'touchmove', spread(200, 100))

    // 1 x 2 from the first gesture, then x2 again — not x2 of the original.
    expect(useCadStore.getState().camera.zoom).toBeCloseTo(4, 5)
  })

  it('does not keep a finished gesture alive', () => {
    const svg = setup()
    fireTouch(svg, 'touchstart', spread(200, 40))
    fireTouch(svg, 'touchend', [])
    const settled = useCadStore.getState().camera

    // Fingers lifted mid-gesture: a move arriving with nothing down drags nothing.
    fireTouch(svg, 'touchmove', [])
    expect(useCadStore.getState().camera).toEqual(settled)

    // And a move that arrives with fingers but no touchstart must re-anchor from the current
    // camera instead of resuming the finished gesture, so it cannot jump the view either.
    fireTouch(svg, 'touchmove', spread(200, 300))
    expect(useCadStore.getState().camera).toEqual(settled)
  })
})
