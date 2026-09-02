import { describe, expect, it } from 'vitest'
import { createCircle, createLine } from './commands'
import { makeDefaultDocument } from './document'
import { exportDocumentToDxf, importDocumentFromDxf } from './dxf'

describe('DXF I/O', () => {
  it('exports and imports a basic drawing', () => {
    const doc = makeDefaultDocument()
    doc.entities = [createLine(doc.layers[0].id, { x: 0, y: 0 }, { x: 5, y: 0 }), createCircle(doc.layers[0].id, { x: 3, y: 3 }, 2)]
    const dxf = exportDocumentToDxf(doc)
    expect(dxf).toContain('SECTION')
    const imported = importDocumentFromDxf(dxf, makeDefaultDocument())
    expect(imported.entities.length).toBeGreaterThan(0)
  })
})
