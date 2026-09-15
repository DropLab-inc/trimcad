import { describe, expect, it, vi } from 'vitest'
import { createLine } from './commands'
import { makeDefaultDocument } from './document'
import { exportLayoutPdf } from './print'
import type { Layout } from './types'

/**
 * Capture what the plot hands to jsPDF. Asserting the numbers it was given tests the scale and the
 * flipping, which is where a plotting bug actually lives — a rendered PDF would only prove it ran.
 */
const { captured } = vi.hoisted(() => ({
  captured: {
    format: [] as number[],
    orientation: '' as string,
    lines: [] as { start: [number, number]; deltas: number[][] }[],
    saved: [] as string[],
    lineWidths: [] as number[],
  },
}))

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(options: { orientation: string; format: number[] }) {
      captured.orientation = options.orientation
      captured.format = options.format
    }
    setLineJoin() {}
    setLineCap() {}
    setDrawColor() {}
    setTextColor() {}
    setFontSize() {}
    text() {}
    rect() {}
    clip() {}
    discardPath() {}
    saveGraphicsState() {}
    restoreGraphicsState() {}
    setLineWidth(width: number) {
      captured.lineWidths.push(width)
    }
    lines(deltas: number[][], x: number, y: number) {
      captured.lines.push({ start: [x, y], deltas })
    }
    save(name: string) {
      captured.saved.push(name)
    }
  },
}))

const layerId = (doc: ReturnType<typeof makeDefaultDocument>) => doc.layers[0].id

/** One viewport in the middle of an A4 landscape sheet, showing the model at 1:50. */
const sheetWith = (unitsPerMm: number, modelCenter = { x: 0, y: 0 }, marginMm = 12): Layout => ({
  id: 'layout-1',
  name: 'Layout 1',
  paper: 'a4',
  orientation: 'landscape',
  marginMm,
  entities: [],
  viewports: [
    {
      id: 'viewport-1',
      center: { x: 148.5, y: 105 },
      widthMm: 200,
      heightMm: 120,
      modelCenter,
      unitsPerMm,
      locked: false,
    },
  ],
})

const reset = () => {
  captured.format = []
  captured.orientation = ''
  captured.lines = []
  captured.saved = []
  captured.lineWidths = []
}

describe('plotting a sheet', () => {
  it('uses the layout paper and orientation, not a size chosen in the dialog', () => {
    reset()
    const doc = makeDefaultDocument()
    exportLayoutPdf(doc, sheetWith(50))
    expect(captured.format).toEqual([297, 210])
    expect(captured.orientation).toBe('landscape')
  })

  it('lands a 500 unit line at 10 mm long in a 1:50 viewport', () => {
    reset()
    const doc = makeDefaultDocument()
    const line = createLine(layerId(doc), { x: -250, y: 0 }, { x: 250, y: 0 })
    const withLine = { ...doc, entities: [line] }

    exportLayoutPdf(withLine, sheetWith(50))

    expect(captured.lines).toHaveLength(1)
    const [{ start, deltas }] = captured.lines
    // 500 units at 50 units per mm is 10 mm, centred on a viewport centred on the sheet.
    expect(deltas[0][0]).toBeCloseTo(10, 6)
    expect(deltas[0][1]).toBeCloseTo(0, 6)
    // The viewport's centre sits at the middle of the paper, and PDF y runs down the page.
    expect(start[0]).toBeCloseTo(143.5, 6)
    expect(start[1]).toBeCloseTo(105, 6)
  })

  it('keeps the sheet the way the canvas draws it, rather than flipping it', () => {
    reset()
    const doc = makeDefaultDocument()
    const layout = sheetWith(50)
    layout.viewports[0].center = { x: 148.5, y: 40 }
    const line = createLine(layerId(doc), { x: 0, y: 0 }, { x: 0, y: 500 })

    exportLayoutPdf({ ...doc, entities: [line] }, layout)

    const [{ start, deltas }] = captured.lines
    // The frame's centre lands 40 mm down a 210 mm page — not mirrored to 170 mm.
    expect(start[1]).toBeCloseTo(40, 6)
    // And a larger drawing y runs further down the sheet, exactly as it does on screen.
    expect(deltas[0][1]).toBeCloseTo(10, 6)
  })

  it('scales with the viewport rather than the drawing', () => {
    reset()
    const doc = makeDefaultDocument()
    const line = createLine(layerId(doc), { x: 0, y: 0 }, { x: 100, y: 0 })

    exportLayoutPdf({ ...doc, entities: [line] }, sheetWith(1))
    const atOneToOne = captured.lines[0].deltas[0][0]

    reset()
    exportLayoutPdf({ ...doc, entities: [line] }, sheetWith(10))
    const atOneToTen = captured.lines[0].deltas[0][0]

    expect(atOneToOne).toBeCloseTo(100, 6)
    expect(atOneToTen).toBeCloseTo(10, 6)
  })

  it('names the file after the sheet', () => {
    reset()
    const doc = makeDefaultDocument()
    exportLayoutPdf(doc, { ...sheetWith(50), name: 'Ground Floor' })
    expect(captured.saved).toEqual(['trimcad-ground-floor.pdf'])
  })

  it('plots lineweight in millimetres, which no viewport scale may change', () => {
    reset()
    const doc = makeDefaultDocument()
    const line = createLine(layerId(doc), { x: 0, y: 0 }, { x: 10, y: 0 })
    exportLayoutPdf({ ...doc, entities: [line] }, sheetWith(5000))
    expect(captured.lineWidths).toEqual([0.25])
  })
})
