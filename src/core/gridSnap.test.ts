import { describe, expect, it } from 'vitest'
import { snapToSpacing } from './store'

describe('snapping the cursor to the grid', () => {
  it('lands on the nearest crossing, up as well as down', () => {
    // Rounding rather than flooring: a pick slightly past a line must not jump a whole cell forward.
    expect(snapToSpacing({ x: 24, y: -6 }, 10)).toEqual({ x: 20, y: -10 })
    expect(snapToSpacing({ x: 26, y: 4 }, 10)).toEqual({ x: 30, y: 0 })
  })

  it('leaves a point already on the grid alone', () => {
    expect(snapToSpacing({ x: 30, y: -20 }, 10)).toEqual({ x: 30, y: -20 })
  })

  it('works at the microscopic end, where a module is a small number', () => {
    // Compared to a tolerance, not for equality: 0.0001 multiplied by three is not exactly 0.0003 in
    // binary floating point, and the last bit of a coordinate is not worth a test failure.
    const snapped = snapToSpacing({ x: 0.00034, y: 0.00012 }, 0.0001)
    expect(snapped.x).toBeCloseTo(0.0003, 12)
    expect(snapped.y).toBeCloseTo(0.0001, 12)
  })

  it('does nothing rather than divide by zero when the spacing is nonsense', () => {
    expect(snapToSpacing({ x: 12.3456, y: 7 }, 0)).toEqual({ x: 12.3456, y: 7 })
  })
})
