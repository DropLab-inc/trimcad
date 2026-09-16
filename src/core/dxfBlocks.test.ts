import { describe, expect, it } from 'vitest'
import { makeDefaultDocument } from './document'
import { importDocumentFromDxf, unreadableInDxf } from './dxf'

/**
 * A real drawing is mostly blocks, dimensions and hatches. Before this, only nine entity types
 * survived an import: a consultant's sheet arrived as raw line-work with no title block, no tables
 * and no dimensions — it "loaded" and looked nothing like the drawing it came from.
 */
const SHEET = [
  '0', 'SECTION', '2', 'BLOCKS',
  '0', 'BLOCK', '8', '0', '2', 'TITLEBLOCK', '70', '0', '10', '0.0', '20', '0.0',
  '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '100.0', '21', '0.0',
  '0', 'LINE', '8', '0', '10', '100.0', '20', '0.0', '11', '100.0', '21', '40.0',
  '0', 'TEXT', '8', '0', '10', '5.0', '20', '20.0', '40', '5.0', '1', 'ET064AM01',
  '0', 'ENDBLK',
  '0', 'BLOCK', '8', '0', '2', '*D1', '70', '0', '10', '0.0', '20', '0.0',
  '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '72.54', '21', '0.0',
  '0', 'ENDBLK',
  '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'INSERT', '8', '0', '2', 'TITLEBLOCK', '10', '300.0', '20', '10.0', '41', '1.0', '50', '0.0',
  '0', 'DIMENSION', '8', '0', '2', '*D1', '10', '50.0', '20', '90.0',
  '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '72.54', '21', '0.0',
  '0', 'HATCH', '8', '0', '10', '20.0', '20', '20.0',
  '0', 'LEADER', '8', '0', '10', '60.0', '20', '60.0',
  '0', 'ENDSEC', '0', 'EOF', '',
].join('\n')

describe('importing a drawing built out of blocks', () => {
  const doc = importDocumentFromDxf(SHEET, makeDefaultDocument())

  it('brings the block definitions with it', () => {
    const title = doc.blocks.find((block) => block.name === 'TITLEBLOCK')
    expect(title).toBeDefined()
    // The block's own geometry: two lines and the title text.
    expect(title?.entities.length).toBe(3)
    expect(title?.entities.some((entity) => entity.type === 'text')).toBe(true)
  })

  it('places an INSERT where the file put it, keeping the block reference', () => {
    const insert = doc.entities.find((entity) => entity.type === 'insert')
    expect(insert).toBeDefined()
    if (insert?.type !== 'insert') throw new Error('unreachable')
    expect(insert.position).toEqual({ x: 300, y: 10 })
    // Referencing the definition, not a copy of its geometry.
    expect(doc.blocks.some((block) => block.id === insert.blockId)).toBe(true)
  })

  it('draws a dimension as the geometry the file carried for it', () => {
    // The dimension references *D1, whose geometry is what a reader actually sees.
    const inserts = doc.entities.filter((entity) => entity.type === 'insert')
    const dimensionBlock = inserts.find(
      (entity) => entity.type === 'insert' && doc.blocks.find((b) => b.id === entity.blockId)?.name === '*D1',
    )
    expect(dimensionBlock).toBeDefined()
  })

  it('reports what it could not read instead of dropping it silently', () => {
    const unreadable = unreadableInDxf(SHEET)
    expect(unreadable.get('HATCH')).toBe(1)
    expect(unreadable.get('LEADER')).toBe(1)
    // Nothing it DID read is reported, and no group code is mistaken for a type.
    expect(unreadable.has('LINE')).toBe(false)
    expect(unreadable.size).toBe(2)
    expect(unreadable.has('INSERT')).toBe(false)
    expect(unreadable.has('DIMENSION')).toBe(false)
  })

  it('does not repoint an existing block when a file uses the same name', () => {
    const base = {
      ...makeDefaultDocument(),
      blocks: [
        { id: 'existing-title', name: 'TITLEBLOCK', entities: [], basePoint: { x: 0, y: 0 } },
      ],
    }
    const merged = importDocumentFromDxf(SHEET, base)
    const names = merged.blocks.filter((block) => block.name === 'TITLEBLOCK')
    expect(names).toHaveLength(1)
    expect(names[0].id).toBe('existing-title')
  })
})
