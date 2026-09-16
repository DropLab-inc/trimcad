import { describe, expect, it } from 'vitest'
import { framingBounds } from './framing'
import type { CadEntity } from './types'

const at = (id: string, x: number, y: number, size = 1): CadEntity => ({
  id,
  type: 'line',
  layerId: 'l',
  start: { x, y },
  end: { x: x + size, y: y + size },
})

/** A drawing laid out around (6000, 0), plus whatever strays are handed in. */
const drawing = (count = 200) =>
  Array.from({ length: count }, (_, index) => at(`d${index}`, 6000 + (index % 40) * 16, Math.floor(index / 40) * 12))

describe('the part of a drawing worth framing', () => {
  it('frames the drawing, not a stray far outside it', () => {
    // The shape of a real customer file: 664 units of drawing and eight degenerate arcs 13,000 away.
    const strays = [
      at('s1', -6546, -12, 0),
      at('s2', -6487, -12, 0),
      at('s3', -6482, -7, 0),
      at('s4', -6482, 131, 0),
      at('s5', -6487, 136, 0),
      at('s6', -6546, 136, 0),
      at('s7', -6551, 131, 0),
      at('s8', -6551, -7, 0),
    ]
    const { bounds, leftOut } = framingBounds([...drawing(), ...strays])
    expect(leftOut).toBe(8)
    expect(bounds!.min.x).toBeGreaterThan(5000)
    expect(bounds!.max.x).toBeLessThan(7000)
  })

  it('frames both clusters when a drawing is laid out in two of them', () => {
    // Two buildings 5,000 apart: neither is a stray, so both belong in the frame.
    const first = drawing(100)
    const second = Array.from({ length: 100 }, (_, index) => at(`e${index}`, 11_000 + (index % 40) * 16, Math.floor(index / 40) * 12))
    const { bounds, leftOut } = framingBounds([...first, ...second])
    expect(leftOut).toBe(0)
    expect(bounds!.min.x).toBeLessThan(6100)
    expect(bounds!.max.x).toBeGreaterThan(11_000)
  })

  it('keeps everything when the drawing is genuinely scattered', () => {
    // Nothing here is a stray — every object is its own cluster — so the frame covers them all.
    const scattered = Array.from({ length: 60 }, (_, index) => at(`f${index}`, index * 4000, index * 3000))
    const { bounds } = framingBounds(scattered)
    expect(bounds!.max.x).toBeGreaterThan(230_000)
  })

  it('frames everything when there is too little to measure a spread from', () => {
    const { bounds, leftOut } = framingBounds([at('a', 0, 0), at('b', 900_000, 40)])
    expect(leftOut).toBe(0)
    expect(bounds!.max.x).toBeGreaterThan(890_000)
  })

  it('answers nothing for an empty drawing', () => {
    expect(framingBounds([]).bounds).toBeNull()
  })
})
