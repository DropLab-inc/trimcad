import { describe, expect, it } from 'vitest'
import { decimalsFor, formatPoint, formatZoom } from './readout'

describe('writing the drawing\'s numbers out', () => {
  it('gives a coordinate about a pixel of precision at the zoom it is read at', () => {
    // At 1:1 two decimals is right, and it must not get worse than that when zoomed out.
    expect(decimalsFor(1)).toBe(2)
    expect(decimalsFor(0.01)).toBe(2)
    // Zoomed in, the readout has to follow, or a point reads "0.00" wherever you put the crosshair.
    expect(decimalsFor(1000)).toBe(5)
    expect(decimalsFor(1e6)).toBe(8)
  })

  it('keeps a tiny coordinate from printing as zero', () => {
    // Padded to the zoom's precision rather than trimmed: a readout that changes width as the
    // crosshair moves is harder to read than one with trailing zeros, which is why AutoCAD's LUPREC
    // is a fixed number of places too.
    expect(formatPoint({ x: 0.000123, y: -0.000456 }, 1e6)).toBe('0.00012300, -0.00045600')
    expect(formatPoint({ x: 0.000123, y: -0.000456 }, 1e6)).not.toContain('0.00,')
    // And at 1:1 it stays tidy rather than showing noise.
    expect(formatPoint({ x: 12.3456, y: 7 }, 1)).toBe('12.35, 7.00')
  })

  it('writes the ends of the zoom range as powers of ten', () => {
    expect(formatZoom(1)).toBe('1.00×')
    expect(formatZoom(1e6)).toBe('1.0e+6×')
    expect(formatZoom(1e-6)).toBe('1.0e-6×')
  })

  it('never asks a double for more digits than it has', () => {
    expect(decimalsFor(1e12)).toBe(9)
    expect(decimalsFor(0)).toBe(2)
    expect(decimalsFor(Number.NaN)).toBe(2)
  })
})
