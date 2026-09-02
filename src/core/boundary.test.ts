import { describe, expect, it } from 'vitest'
import { findRegionBoundary } from './boundary'
import { createCircle, createLine, createRect } from './commands'
import { polygonArea } from './geometry'
import type { Vec2 } from './math/vec2'

const areaOf = (boundary: Vec2[] | null): number => {
  expect(boundary).not.toBeNull()
  return polygonArea(boundary!)
}

describe('region boundaries formed by crossing geometry', () => {
  it('hatches one half of a circle that is cut by a line', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    const chord = createLine('L', { x: -20, y: 0 }, { x: 20, y: 0 })
    const entities = [circle, chord]
    const fullCircle = Math.PI * 100

    const upper = findRegionBoundary(entities, { x: 0, y: -5 })
    const lower = findRegionBoundary(entities, { x: 0, y: 5 })

    // Each half is close to half the circle, allowing for the polygon approximation.
    expect(areaOf(upper)).toBeGreaterThan(fullCircle * 0.45)
    expect(areaOf(upper)).toBeLessThan(fullCircle * 0.55)
    expect(areaOf(lower)).toBeGreaterThan(fullCircle * 0.45)
    expect(areaOf(lower)).toBeLessThan(fullCircle * 0.55)
  })

  it('keeps each half on its own side of the cutting line', () => {
    const entities = [createCircle('L', { x: 0, y: 0 }, 10), createLine('L', { x: -20, y: 0 }, { x: 20, y: 0 })]

    const lower = findRegionBoundary(entities, { x: 0, y: 5 })!

    expect(lower.every((point) => point.y >= -1e-3)).toBe(true)
  })

  it('splits a circle cut off centre into a small and a large region', () => {
    const entities = [createCircle('L', { x: 0, y: 0 }, 10), createLine('L', { x: -20, y: 7 }, { x: 20, y: 7 })]

    const smallCap = areaOf(findRegionBoundary(entities, { x: 0, y: 8.5 }))
    const largeSide = areaOf(findRegionBoundary(entities, { x: 0, y: 0 }))

    expect(smallCap).toBeLessThan(largeSide)
    expect(smallCap + largeSide).toBeGreaterThan(Math.PI * 100 * 0.95)
  })

  it('splits a rectangle with a line across it', () => {
    const entities = [
      createRect('L', { x: 0, y: 0 }, { x: 100, y: 40 }),
      createLine('L', { x: 40, y: -10 }, { x: 40, y: 50 }),
    ]

    expect(areaOf(findRegionBoundary(entities, { x: 20, y: 20 }))).toBeCloseTo(1600, 4)
    expect(areaOf(findRegionBoundary(entities, { x: 70, y: 20 }))).toBeCloseTo(2400, 4)
  })

  it('finds the region enclosed by four separate lines that only cross', () => {
    const entities = [
      createLine('L', { x: -10, y: 0 }, { x: 50, y: 0 }),
      createLine('L', { x: -10, y: 30 }, { x: 50, y: 30 }),
      createLine('L', { x: 0, y: -10 }, { x: 0, y: 40 }),
      createLine('L', { x: 40, y: -10 }, { x: 40, y: 40 }),
    ]

    expect(areaOf(findRegionBoundary(entities, { x: 20, y: 15 }))).toBeCloseTo(1200, 4)
  })

  it('finds the lens where two circles overlap', () => {
    const entities = [createCircle('L', { x: -5, y: 0 }, 10), createCircle('L', { x: 5, y: 0 }, 10)]

    const lens = areaOf(findRegionBoundary(entities, { x: 0, y: 0 }))

    // Exact lens area for two radius-10 circles whose centres are 10 apart.
    const exact = 2 * 100 * Math.acos(0.5) - 0.5 * 10 * Math.sqrt(4 * 100 - 100)
    expect(lens).toBeGreaterThan(exact * 0.95)
    expect(lens).toBeLessThan(exact * 1.05)
  })

  it('still hatches a plain closed shape with nothing crossing it', () => {
    expect(areaOf(findRegionBoundary([createRect('L', { x: 0, y: 0 }, { x: 20, y: 10 })], { x: 10, y: 5 }))).toBeCloseTo(
      200,
      4,
    )
  })

  it('picks the inner region of nested rectangles', () => {
    const entities = [
      createRect('L', { x: 0, y: 0 }, { x: 100, y: 100 }),
      createRect('L', { x: 20, y: 20 }, { x: 40, y: 40 }),
    ]

    expect(areaOf(findRegionBoundary(entities, { x: 30, y: 30 }))).toBeCloseTo(400, 4)
  })

  it('picks the ring between nested rectangles when clicking outside the inner one', () => {
    const entities = [
      createRect('L', { x: 0, y: 0 }, { x: 100, y: 100 }),
      createRect('L', { x: 20, y: 20 }, { x: 40, y: 40 }),
    ]

    expect(areaOf(findRegionBoundary(entities, { x: 80, y: 80 }))).toBeCloseTo(10000, 4)
  })

  it('returns null outside every enclosed region', () => {
    const entities = [createRect('L', { x: 0, y: 0 }, { x: 10, y: 10 })]
    expect(findRegionBoundary(entities, { x: 500, y: 500 })).toBeNull()
  })

  it('returns null when lines cross without enclosing anything', () => {
    const entities = [
      createLine('L', { x: -10, y: 0 }, { x: 10, y: 0 }),
      createLine('L', { x: 0, y: -10 }, { x: 0, y: 10 }),
    ]
    expect(findRegionBoundary(entities, { x: 2, y: 2 })).toBeNull()
  })

  it('ignores a stray line inside a closed shape that does not divide it', () => {
    const entities = [
      createRect('L', { x: 0, y: 0 }, { x: 100, y: 100 }),
      createLine('L', { x: 30, y: 50 }, { x: 60, y: 50 }),
    ]

    expect(areaOf(findRegionBoundary(entities, { x: 80, y: 20 }))).toBeCloseTo(10000, 4)
  })

  it('handles an empty drawing', () => {
    expect(findRegionBoundary([], { x: 0, y: 0 })).toBeNull()
  })
})
