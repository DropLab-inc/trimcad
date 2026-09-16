import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { makeDefaultDocument } from './document'
import { importDocumentFromDxf } from './dxf'
import { DEFAULT_PRINT_OPTIONS, exportPdf, type ViewFrame } from './print'
import type { CadEntity } from './types'

const { captured } = vi.hoisted(() => ({ captured: { lines: [] as number[][] } }))

vi.mock('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getHeight: () => 297, getWidth: () => 420 } }
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
      captured.lines.push([x, y, ...deltas.flat()])
    }
    rect() {}
    text() {}
    addPage() {}
    setPage() {}
    getNumberOfPages() {
      return 1
    }
  },
}))

const view: ViewFrame = { camera: { x: 0, y: 0, zoom: 1 }, width: 1200, height: 900 }

/** How much of the drawing reaches the page, as the number of line runs the plotter draws. */
const plotRuns = async (entities: CadEntity[], blocks: ReturnType<typeof importDocumentFromDxf>['blocks']) => {
  const base = makeDefaultDocument()
  const doc = { ...base, entities, blocks, groups: [] }
  captured.lines.length = 0
  await exportPdf(doc, DEFAULT_PRINT_OPTIONS, view, [], undefined)
  return captured.lines.length
}

describe('a drawing made of blocks plots', () => {
  it('draws the geometry inside a block, and much more of it than without the block', async () => {
    const text = readFileSync('/tmp/cust.dxf', 'utf8')
    const imported = importDocumentFromDxf(text, makeDefaultDocument())
    const inserts = imported.entities.filter((entity) => entity.type === 'insert')
    expect(inserts.length).toBeGreaterThan(10)

    const withBlocks = await plotRuns(imported.entities, imported.blocks)
    // The same drawing with the definitions removed: what the plotter managed before the fix.
    const withoutBlocks = await plotRuns(imported.entities, [])

    expect(withBlocks).toBeGreaterThan(withoutBlocks * 1.5)
    expect(withBlocks).toBeGreaterThan(200)
  })
})
