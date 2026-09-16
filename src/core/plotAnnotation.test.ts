import { describe, expect, it, vi } from 'vitest'
import { makeDefaultDocument } from './document'
import { DEFAULT_PRINT_OPTIONS, exportPdf, type ViewFrame } from './print'
import type { LeaderEntity, ToleranceEntity } from './types'

/** The plot draws a leader as its two segments plus words, and a tolerance as boxed compartments. */
const { captured } = vi.hoisted(() => ({
  captured: {
    lines: [] as { start: [number, number]; deltas: number[][] }[],
    textsPlain: [] as string[],
    textsCentred: [] as { value: string; x: number; y: number }[],
    rects: [] as { x: number; y: number; w: number; h: number }[],
  },
}))

vi.mock('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getHeight: () => 210 } }
    setLineJoin() {}
    setLineCap() {}
    setDrawColor() {}
    setTextColor() {}
    setFontSize() {}
    setLineWidth() {}
    setFont() {}
    addFileToVFS() {}
    addFont() {}
    saveGraphicsState() {}
    restoreGraphicsState() {}
    setCurrentTransformationMatrix() {}
    save() {}
    clip() {}
    discardPath() {}
    lines(deltas: number[][], x: number, y: number) {
      captured.lines.push({ start: [x, y], deltas })
    }
    rect(x: number, y: number, w: number, h: number) {
      captured.rects.push({ x, y, w, h })
    }
    text(value: string, x?: number, y?: number, options?: { align?: string }) {
      if (options?.align === 'center') captured.textsCentred.push({ value, x: x ?? 0, y: y ?? 0 })
      else captured.textsPlain.push(value)
    }
    getTextWidth() {
      return 10
    }
  },
}))

const view: ViewFrame = { camera: { x: 0, y: 0, zoom: 1 }, width: 800, height: 600 }

const leaderDoc = () => {
  const base = makeDefaultDocument()
  const leader: LeaderEntity = {
    id: 'lead-1',
    type: 'leader',
    layerId: base.layers[0].id,
    arrow: { x: 0, y: 0 },
    landingEnd: { x: 50, y: 40 },
    value: 'handrail beyond',
    height: 2.5,
  }
  return { ...base, entities: [leader] }
}

const toleranceDoc = () => {
  const base = makeDefaultDocument()
  const frame: ToleranceEntity = {
    id: 'tol-1',
    type: 'tolerance',
    layerId: base.layers[0].id,
    position: { x: 30, y: 30 },
    symbol: 'pos',
    value: '0.05',
    datums: ['A', 'B'],
    height: 4,
  }
  return { ...base, entities: [frame] }
}

describe('plotting a leader', () => {
  it('draws both segments and the words', async () => {
    captured.lines.length = 0
    captured.textsPlain.length = 0

    const plot = await exportPdf(leaderDoc(), DEFAULT_PRINT_OPTIONS, view, [], 'lead.pdf')

    expect(plot).not.toBeNull()
    // Two deltas from the arrow: the landing, then the hook.
    expect(captured.lines).toHaveLength(1)
    expect(captured.lines[0].deltas).toHaveLength(2)
    expect(captured.textsPlain).toContain('handrail beyond')
  })
})

describe('plotting a tolerance frame', () => {
  it('draws one box per compartment with its words centred', async () => {
    captured.rects.length = 0
    captured.textsCentred.length = 0

    const plot = await exportPdf(toleranceDoc(), DEFAULT_PRINT_OPTIONS, view, [], 'tol.pdf')

    expect(plot).not.toBeNull()
    // The first rect is the plot's own clipping frame; then symbol, value and two datums.
    expect(captured.rects).toHaveLength(5)
    expect(captured.textsCentred.map((entry) => entry.value)).toEqual(['pos', '0.05', 'A', 'B'])
  })
})

