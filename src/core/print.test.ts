import { describe, expect, it } from 'vitest'
import { createCircle, createLine, createRect } from './commands'
import { makeDefaultDocument } from './document'
import {
  DEFAULT_PRINT_OPTIONS,
  describeScale,
  displayBounds,
  extentsBounds,
  layoutPlot,
  normalizeBounds,
  pageSizeMm,
  resolvePlotBounds,
  scaleFactor,
  selectionBounds,
  type PrintOptions,
} from './print'
import type { CadEntity } from './types'

const doc = (entities: CadEntity[]) => ({ ...makeDefaultDocument(), entities })

describe('paper size', () => {
  it('swaps the sides for landscape', () => {
    expect(pageSizeMm('a4', 'portrait')).toEqual({ width: 210, height: 297 })
    expect(pageSizeMm('a4', 'landscape')).toEqual({ width: 297, height: 210 })
  })

  it('knows the common ISO and ANSI sheets', () => {
    expect(pageSizeMm('letter', 'portrait').width).toBeCloseTo(215.9)
    expect(pageSizeMm('a3', 'landscape')).toEqual({ width: 420, height: 297 })
  })
})

describe('plot scale', () => {
  it('treats 1:2 as half size on the paper', () => {
    expect(scaleFactor({ ...DEFAULT_PRINT_OPTIONS, scaleMode: '1:2' })).toBe(0.5)
  })

  it('reads a custom scale as drawing units per millimetre of paper', () => {
    expect(scaleFactor({ ...DEFAULT_PRINT_OPTIONS, scaleMode: 'custom', customScale: 10 })).toBe(0.1)
  })

  it('leaves fit for the layout step to resolve', () => {
    expect(scaleFactor({ ...DEFAULT_PRINT_OPTIONS, scaleMode: 'fit' })).toBe('fit')
  })
})

describe('plot area', () => {
  const layerId = () => makeDefaultDocument().layers[0].id
  const line = createLine(layerId(), { x: 0, y: 0 }, { x: 100, y: 50 })
  const circle = createCircle(layerId(), { x: 200, y: 200 }, 25)
  const drawing = doc([line, circle])

  it('extents covers every plottable object', () => {
    expect(extentsBounds(drawing)).toEqual({ minX: 0, minY: 0, maxX: 225, maxY: 225 })
  })

  it('display is the camera view in drawing units', () => {
    expect(displayBounds({ camera: { x: 100, y: 50, zoom: 2 }, width: 400, height: 300 })).toEqual({
      minX: -50,
      minY: -25,
      maxX: 150,
      maxY: 125,
    })
  })

  it('selection covers only what was picked', () => {
    expect(selectionBounds(drawing, [circle.id])).toEqual({ minX: 175, minY: 175, maxX: 225, maxY: 225 })
  })

  it('selection returns null when nothing is picked', () => {
    expect(selectionBounds(drawing, [])).toBeNull()
  })

  it('window needs the rectangle the draughtsman picked', () => {
    const withWindow: PrintOptions = {
      ...DEFAULT_PRINT_OPTIONS,
      area: 'window',
      window: normalizeBounds({ x: 10, y: 20 }, { x: 40, y: 80 }),
    }
    expect(resolvePlotBounds(drawing, withWindow, { camera: { x: 0, y: 0, zoom: 1 }, width: 800, height: 600 }, [])).toEqual({
      minX: 10,
      minY: 20,
      maxX: 40,
      maxY: 80,
    })
  })

  it('refuses a window that has not been picked yet', () => {
    expect(
      resolvePlotBounds(
        drawing,
        { ...DEFAULT_PRINT_OPTIONS, area: 'window', window: null },
        { camera: { x: 0, y: 0, zoom: 1 }, width: 800, height: 600 },
        [],
      ),
    ).toBeNull()
  })
})

describe('layout on the page', () => {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 50 }

  it('fits the drawing into the printable area', () => {
    const layout = layoutPlot(bounds, { ...DEFAULT_PRINT_OPTIONS, scaleMode: 'fit', center: false, marginMm: 10 })
    // A4 landscape printable: 297-20 by 210-20 = 277 × 190. Fit is limited by width: 277/100 = 2.77
    expect(layout.applied).toBeCloseTo(2.77)
    expect(layout.offsetX).toBe(10)
    expect(layout.offsetY).toBe(10)
  })

  it('centres the drawing in the printable area', () => {
    const layout = layoutPlot(bounds, { ...DEFAULT_PRINT_OPTIONS, scaleMode: '1:1', center: true, marginMm: 12 })
    // Content is 100 × 50 mm on a 297 × 210 page with 12 mm margins → printable 273 × 186
    expect(layout.applied).toBe(1)
    expect(layout.offsetX).toBeCloseTo(12 + (273 - 100) / 2)
    expect(layout.offsetY).toBeCloseTo(12 + (186 - 50) / 2)
  })

  it('leaves the drawing in the corner when centering is off', () => {
    const layout = layoutPlot(bounds, { ...DEFAULT_PRINT_OPTIONS, scaleMode: '1:1', center: false, marginMm: 12 })
    expect(layout.offsetX).toBe(12)
    expect(layout.offsetY).toBe(12)
  })

  it('honours a 1:10 scale', () => {
    const layout = layoutPlot(bounds, { ...DEFAULT_PRINT_OPTIONS, scaleMode: '1:10', center: false })
    expect(layout.applied).toBeCloseTo(0.1)
  })

  it('names the scale for the command history', () => {
    expect(describeScale({ ...DEFAULT_PRINT_OPTIONS, scaleMode: 'fit' })).toBe('fit to page')
    expect(describeScale({ ...DEFAULT_PRINT_OPTIONS, scaleMode: '1:5' })).toBe('1:5')
    expect(describeScale({ ...DEFAULT_PRINT_OPTIONS, scaleMode: 'custom', customScale: 25 })).toBe('1:25')
  })

  it('clamps margins that would leave no printable area', () => {
    const layout = layoutPlot(bounds, { ...DEFAULT_PRINT_OPTIONS, marginMm: 200 })
    expect(layout.printableW).toBeGreaterThan(0)
    expect(layout.printableH).toBeGreaterThan(0)
  })
})

describe('normalizeBounds', () => {
  it('does not care which corner was picked first', () => {
    expect(normalizeBounds({ x: 80, y: 10 }, { x: 20, y: 60 })).toEqual({
      minX: 20,
      minY: 10,
      maxX: 80,
      maxY: 60,
    })
  })
})

describe('extents of a rectangle', () => {
  it('reads the corners of a closed polyline', () => {
    const rect = createRect(makeDefaultDocument().layers[0].id, { x: 10, y: 20 }, { x: 40, y: 50 })
    expect(extentsBounds(doc([rect]))).toEqual({ minX: 10, minY: 20, maxX: 40, maxY: 50 })
  })
})
