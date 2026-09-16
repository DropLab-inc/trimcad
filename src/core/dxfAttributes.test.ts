import { describe, expect, it } from 'vitest'
import { makeDefaultDocument } from './document'
import { importDocumentFromDxf, unreadableInDxf } from './dxf'

/**
 * A title block, the way the customer's is built: a block that DEFINES its fields with ATTDEF, and an
 * insert that CARRIES the values in ATTRIB. AutoCAD draws both, so the sheet has text in every cell;
 * read as unreadable records the whole block came out empty.
 */
const blockWithFields = [
  '0', 'SECTION', '2', 'BLOCKS',
  '0', 'BLOCK', 8, '0', 2, 'TITLE', 70, '0', 10, '0', 20, '0',
  '0', 'ATTDEF', 8, '0', 10, '10', 20, '-20', 40, '2.5', 1, 'DRAWN BY:', 2, 'DRAWN',
  '0', 'ATTDEF', 8, '0', 10, '10', 20, '-30', 40, '2.5', 1, 'CLIENT NO:', 2, 'CLIENT',
  '0', 'ENDBLK', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'INSERT', 8, '0', 2, 'TITLE', 10, '100', 20, '50', 66, '1',
  '0', 'ATTRIB', 8, '0', 10, '110', 20, '20', 40, '2.5', 1, 'ACME-42', 2, 'CLIENT',
  '0', 'ENDSEC', '0', 'EOF', '',
].join('\n')

describe('the fields of a title block', () => {
  it('reads a block’s ATTDEF as the text it draws', () => {
    const doc = importDocumentFromDxf(blockWithFields, makeDefaultDocument())
    const values = doc.blocks[0].entities.filter((entity) => entity.type === 'text').map((e: any) => e.value)
    expect(values).toContain('DRAWN BY:')
    expect(values).toContain('CLIENT NO:')
  })

  it('reads an insert’s ATTRIB value as text, not as a field that was never filled in', () => {
    const doc = importDocumentFromDxf(blockWithFields, makeDefaultDocument())
    const texts = doc.entities.filter((entity) => entity.type === 'text') as any[]
    expect(texts.map((text) => text.value)).toContain('ACME-42')
  })

  it('reports neither of them as something it could not read', () => {
    const unread = unreadableInDxf(blockWithFields)
    expect(unread.has('ATTRIB')).toBe(false)
    expect(unread.has('ATTDEF')).toBe(false)
  })
})
