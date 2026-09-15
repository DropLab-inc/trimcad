import { describe, expect, it } from 'vitest'
import { VIEWPORT_ZOOM_MAX, VIEWPORT_ZOOM_MIN } from '../core/store'
import { ZOOM_MAX, ZOOM_MIN } from './CanvasViewport'

/**
 * Zoom is a floating-point scale, so it cannot literally be unlimited — but it was capped at 50 pixels
 * to the drawing unit, which made a microscopic feature impossible to draw or snap to. These tests
 * hold the range open, so raising the floor or lowering the ceiling is a deliberate act with a reason.
 */
describe('the zoom range', () => {
  it('gets close enough to work on microscopic features', () => {
    // A million pixels to the drawing unit: a feature a millionth of a unit across fills the screen.
    expect(ZOOM_MAX).toBeGreaterThanOrEqual(1e5)
  })

  it('gets far enough out to see a whole site', () => {
    expect(ZOOM_MIN).toBeLessThanOrEqual(1e-4)
  })

  it('is still bounded, because an unbounded scale is unrecoverable', () => {
    expect(ZOOM_MIN).toBeGreaterThan(0)
    expect(Number.isFinite(ZOOM_MAX)).toBe(true)
    // The two ends must not be able to cross, or the clamp inverts and the view sticks.
    expect(ZOOM_MIN).toBeLessThan(ZOOM_MAX)
  })

  it('lets a viewport see the same microscopic end', () => {
    expect(VIEWPORT_ZOOM_MIN).toBeLessThanOrEqual(1e-4)
    expect(VIEWPORT_ZOOM_MIN).toBeGreaterThan(0)
    expect(VIEWPORT_ZOOM_MIN).toBeLessThan(VIEWPORT_ZOOM_MAX)
  })
})
