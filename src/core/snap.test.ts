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

  it('finds the midpoint of a segment', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })
    const snap = findBestSnap({ x: 5.1, y: 0.3 }, [line], ['midpoint'], 1)
    expect(snap?.mode).toBe('midpoint')
    expect(snap?.point).toEqual({ x: 5, y: 0 })
  })

  it('finds the intersection of two crossing lines', () => {
    const horizontal = createLine('L', { x: -10, y: 0 }, { x: 10, y: 0 })
    const vertical = createLine('L', { x: 3, y: -10 }, { x: 3, y: 10 })

    const snap = findBestSnap({ x: 3.2, y: 0.2 }, [horizontal, vertical], ['intersection'], 1)

    expect(snap?.mode).toBe('intersection')
    expect(snap?.point.x).toBeCloseTo(3, 6)
    expect(snap?.point.y).toBeCloseTo(0, 6)
  })

  it('finds where a line crosses a circle', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    const line = createLine('L', { x: -20, y: 0 }, { x: 20, y: 0 })

    const snap = findBestSnap({ x: 9.8, y: 0.2 }, [circle, line], ['intersection'], 1)

    expect(snap?.mode).toBe('intersection')
    expect(snap?.point.x).toBeCloseTo(10, 6)
  })

  it('finds circle quadrant points', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    const snap = findBestSnap({ x: 0.2, y: 9.8 }, [circle], ['quadrant'], 1)
    expect(snap?.mode).toBe('quadrant')
    expect(snap?.point.y).toBeCloseTo(10, 6)
  })

  it('drops a perpendicular foot from the point being drawn', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })

    const snap = findBestSnap({ x: 4, y: 0.4 }, [line], ['perpendicular'], 1, { x: 4, y: 8 })

    expect(snap?.mode).toBe('perpendicular')
    expect(snap?.point.x).toBeCloseTo(4, 6)
    expect(snap?.point.y).toBeCloseTo(0, 6)
  })

  it('finds a tangent point on a circle from the point being drawn', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    const base = { x: 20, y: 0 }

    const snap = findBestSnap({ x: 5.2, y: 8.4 }, [circle], ['tangent'], 1.5, base)

    expect(snap?.mode).toBe('tangent')
    const radial = { x: snap!.point.x, y: snap!.point.y }
    const toBase = { x: base.x - radial.x, y: base.y - radial.y }
    expect(radial.x * toBase.x + radial.y * toBase.y).toBeCloseTo(0, 5)
  })

  it('prefers an endpoint over a point that merely lies on the curve', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })

    const snap = findBestSnap({ x: 9.7, y: 0.1 }, [line], ['endpoint', 'nearest'], 1)

    expect(snap?.mode).toBe('endpoint')
  })

  it('ignores snap candidates outside the aperture even when the mode is enabled', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    expect(findBestSnap({ x: 5, y: 5 }, [circle], ['quadrant', 'center'], 0.5)).toBeNull()
  })
})
