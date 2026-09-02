import { describe, expect, it } from 'vitest'
import { createCircle, createLine } from './commands'
import { applyOrtho, applyPolarTracking, findBestSnap } from './snap'

describe('polar tracking', () => {
  it('snaps when the cursor is near a tracking angle', () => {
    const result = applyPolarTracking({ x: 0, y: 0 }, { x: 10, y: 0.2 }, 45)
    expect(result.snapped).toBe(true)
    expect(result.point.y).toBeCloseTo(0, 4)
  })

  it('leaves the cursor free when it is far from a tracking angle', () => {
    const target = { x: 10, y: 4 }
    const result = applyPolarTracking({ x: 0, y: 0 }, target, 45)
    expect(result.snapped).toBe(false)
    expect(result.point).toEqual(target)
  })

  it('preserves distance from the base point when snapping', () => {
    const result = applyPolarTracking({ x: 0, y: 0 }, { x: 0.1, y: 10 }, 45)
    expect(Math.hypot(result.point.x, result.point.y)).toBeCloseTo(Math.hypot(0.1, 10), 4)
  })
})

describe('ortho', () => {
  it('locks to the dominant axis', () => {
    expect(applyOrtho({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 0 })
    expect(applyOrtho({ x: 0, y: 0 }, { x: 3, y: 10 })).toEqual({ x: 0, y: 10 })
  })
})

describe('object snap', () => {
  it('finds an endpoint within the aperture', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })
    const snap = findBestSnap({ x: 9.6, y: 0.2 }, [line], ['endpoint'], 1)
    expect(snap?.mode).toBe('endpoint')
    expect(snap?.point).toEqual({ x: 10, y: 0 })
  })

  it('finds a circle center', () => {
    const circle = createCircle('L', { x: 5, y: 5 }, 3)
    const snap = findBestSnap({ x: 5.2, y: 5.1 }, [circle], ['center'], 1)
    expect(snap?.mode).toBe('center')
  })

  it('returns null when nothing is within the aperture', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })
    expect(findBestSnap({ x: 50, y: 50 }, [line], ['endpoint'], 1)).toBeNull()
  })
})
