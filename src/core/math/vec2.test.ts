import { describe, expect, it } from 'vitest'
import { add, distance, mirrorPointOnLine, rotateAround, vec } from './vec2'

describe('vec2 helpers', () => {
  it('adds vectors', () => {
    expect(add(vec(2, 3), vec(1, -1))).toEqual({ x: 3, y: 2 })
  })

  it('computes distance', () => {
    expect(distance(vec(0, 0), vec(3, 4))).toBe(5)
  })

  it('rotates around origin', () => {
    const rotated = rotateAround(vec(1, 0), vec(0, 0), Math.PI / 2)
    expect(rotated.x).toBeCloseTo(0, 4)
    expect(rotated.y).toBeCloseTo(1, 4)
  })

  it('mirrors point on x-axis line', () => {
    expect(mirrorPointOnLine(vec(1, 2), vec(0, 0), vec(2, 0))).toEqual({ x: 1, y: -2 })
  })
})
