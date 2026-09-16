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
    // Hatches are READ now (dxf-parser drops the record, so they are scanned from the text), so the
    // only thing this sheet still loses is its leader.
    expect(unreadable.has('HATCH')).toBe(false)
    expect(unreadable.get('LEADER')).toBe(1)
    // Nothing it DID read is reported, and no group code is mistaken for a type.
    expect(unreadable.has('LINE')).toBe(false)
    expect(unreadable.size).toBe(1)
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

describe('the render budget', () => {
  const member = (i: number) => ({ id: `m${i}`, type: 'line' as const, layerId: 'l', start: { x: 0, y: 0 }, end: { x: i, y: 0 } })
  const insertOf = (id: string, members: number) => ({
    entity: { id, type: 'insert' as const, layerId: 'l', blockId: `b-${id}`, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    block: { id: `b-${id}`, name: `B-${id}`, basePoint: { x: 0, y: 0 }, entities: Array.from({ length: members }, (_, i) => member(i)) },
  })

  it('charges an insert what it expands to, not one node', async () => {
    const { withinRenderBudget, MAX_RENDERED_ENTITIES } = await import('../ui/CanvasViewport')
    // A block of 19,500 members leaves room for only a couple of hundred plain lines after it.
    const { entity, block } = insertOf('i1', 19_500)
    const lines = Array.from({ length: 5000 }, (_, i) => ({ id: `l${i}`, type: 'line' as const, layerId: 'l', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }))
    const kept = withinRenderBudget([entity, ...lines], [block])
    expect(kept[0].id).toBe('i1')
    // 19,500 spent on the insert, so only a few hundred of the 5,000 lines fit inside the budget.
    expect(kept.length).toBeGreaterThan(1)
    expect(kept.length).toBeLessThan(600)
    expect(19_500 + kept.length - 1).toBeLessThanOrEqual(MAX_RENDERED_ENTITIES)
  })

  it('draws an object even when it alone is over budget', async () => {
    const { withinRenderBudget, MAX_RENDERED_ENTITIES } = await import('../ui/CanvasViewport')
    const { entity, block } = insertOf('huge', MAX_RENDERED_ENTITIES * 3)
    const kept = withinRenderBudget([entity], [block])
    // A canvas showing one thing beats a canvas showing nothing.
    expect(kept).toHaveLength(1)
  })
})

describe('what an opened file leaves behind', () => {
  const tiny = (records: string[]) => [...records, '0', 'ENDSEC', '0', 'EOF', ''].join('\n')

  it('does not keep the previous drawing\'s block definitions', async () => {
    const { importDocumentFromDxf } = await import('./dxf')
    const { makeDefaultDocument } = await import('./document')
    const first = tiny(['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'OLDBLOCK', '70', '0', '10', '0.0', '20', '0.0', '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '5.0', '21', '5.0', '0', 'ENDBLK'])
    const opened = importDocumentFromDxf(first, makeDefaultDocument())
    expect(opened.blocks.map((block) => block.name)).toEqual(['OLDBLOCK'])

    // Open a second file on top of the first, the way the Open command does.
    const second = tiny(['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'NEWBLOCK', '70', '0', '10', '0.0', '20', '0.0', '0', 'CIRCLE', '8', '0', '10', '0.0', '20', '0.0', '40', '2.0', '0', 'ENDBLK'])
    const next = importDocumentFromDxf(second, { ...opened, blocks: [] })
    expect(next.blocks.map((block) => block.name)).toEqual(['NEWBLOCK'])
  })
})

describe('layout blocks', () => {
  it('are not imported as placeable definitions', async () => {
    const { importDocumentFromDxf } = await import('./dxf')
    const { makeDefaultDocument } = await import('./document')
    // A converter can write the model's own geometry into *Model_Space; a placeable copy of the whole
    // drawing must not appear in the palette.
    const text = [
      '0', 'SECTION', '2', 'BLOCKS',
      '0', 'BLOCK', '8', '0', '2', '*Model_Space', '70', '0', '10', '0.0', '20', '0.0',
      '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '9.0', '21', '9.0',
      '0', 'ENDBLK',
      '0', 'BLOCK', '8', '0', '2', '*Paper_Space0', '70', '0', '10', '0.0', '20', '0.0',
      '0', 'CIRCLE', '8', '0', '10', '0.0', '20', '0.0', '40', '3.0',
      '0', 'ENDBLK',
      '0', 'BLOCK', '8', '0', '2', 'REAL', '70', '0', '10', '0.0', '20', '0.0',
      '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '1.0', '21', '1.0',
      '0', 'ENDBLK',
      '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', '8', '0', '2', 'REAL', '10', '0.0', '20', '0.0', '41', '1.0', '50', '0.0',
      '0', 'ENDSEC', '0', 'EOF', '',
    ].join('\n')
    const doc = importDocumentFromDxf(text, makeDefaultDocument())
    expect(doc.blocks.map((block) => block.name)).toEqual(['REAL'])
  })
})
