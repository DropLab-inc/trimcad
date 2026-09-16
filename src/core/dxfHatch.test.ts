import { describe, expect, it } from 'vitest'
import { makeDefaultDocument } from './document'
import { importDocumentFromDxf } from './dxf'
import { hatchPatternFor } from './dxfHatch'

const solidHatch = (colour: string) => [
  '0', 'HATCH', '8', '0',
  '100', 'AcDbHatch', '10', '0.0', '20', '0.0', '30', '0.0',
  '2', 'SOLID', '70', '1', '71', '0', '91', '1',
  '92', '7', '72', '0', '73', '1', '93', '4',
  '10', '0.0', '20', '0.0',
  '10', '10.0', '20', '0.0',
  '10', '10.0', '20', '5.0',
  '10', '0.0', '20', '5.0',
  '97', '0', '75', '0', '76', '1', '62', colour,
]

const patternHatch = (name: string, lines: number) => [
  '0', 'HATCH', '8', '0',
  '2', name, '70', '0', '71', '0', '91', '1',
  '92', '7', '72', '0', '73', '1', '93', '3',
  '10', '20.0', '20', '0.0',
  '10', '30.0', '20', '0.0',
  '10', '30.0', '20', '8.0',
  '97', '0', '75', '0', '76', '1', '52', '0.0', '41', '1.0', '78', String(lines),
]

const wrap = (records: string[]) => ['0', 'SECTION', '2', 'ENTITIES', ...records, '0', 'ENDSEC', '0', 'EOF', ''].join('\n')

describe('reading hatches, which the DXF parser drops', () => {
  it('imports a solid fill with its colour and boundary', () => {
    const doc = importDocumentFromDxf(wrap(solidHatch('3')), makeDefaultDocument())
    const hatch = doc.entities.find((entity) => entity.type === 'hatch')
    expect(hatch).toBeDefined()
    if (hatch?.type !== 'hatch') throw new Error('not a hatch')
    expect(hatch.pattern).toBe('solid')
    expect(hatch.boundary).toHaveLength(4)
    expect(hatch.boundary[2]).toEqual({ x: 10, y: -5 })
    // Group 62 is an AutoCAD colour index; 3 is green.
    expect(hatch.color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('imports a patterned fill as the pattern its own definition implies', () => {
    const doc = importDocumentFromDxf(wrap(patternHatch('ANSI31', 1)), makeDefaultDocument())
    const hatch = doc.entities.find((entity) => entity.type === 'hatch')
    expect(hatch && hatch.type === 'hatch' ? hatch.pattern : null).toBe('ansi31')
  })

  it('stands a custom pattern in by its density', () => {
    // A honeycomb or a client's own pattern cannot be reproduced; the number of line families in its
    // own definition says how dense it was, which is what a stand-in has to carry.
    expect(hatchPatternFor('CG_HONEYCOMB', false, 4)).toBe('net')
    expect(hatchPatternFor('CG_HONEYCOMB', false, 2)).toBe('ansi37')
    expect(hatchPatternFor('CG_HONEYCOMB', false, 1)).toBe('ansi31')
    expect(hatchPatternFor('ANSI37', false, 1)).toBe('ansi37')
    expect(hatchPatternFor('AR-SAND', false, 1)).toBe('dots')
  })

  it('reads a hatch inside a block as a member of that block', () => {
    // A fill drawn in a block belongs where the block is placed; added to the drawing instead, it
    // would land in the model space at coordinates it never had.
    const text = [
      '0', 'SECTION', '2', 'BLOCKS',
      '0', 'BLOCK', '8', '0', '2', 'FILLED', '70', '0', '10', '0.0', '20', '0.0',
      '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '1.0', '21', '1.0',
      ...solidHatch('1'),
      '0', 'ENDBLK', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', '8', '0', '2', 'FILLED', '10', '0.0', '20', '0.0', '41', '1.0', '50', '0.0',
      '0', 'ENDSEC', '0', 'EOF', '',
    ].join('\n')
    const doc = importDocumentFromDxf(text, makeDefaultDocument())
    const block = doc.blocks.find((candidate) => candidate.name === 'FILLED')
    expect(block?.entities.map((entity) => entity.type)).toEqual(['line', 'hatch'])
    expect(doc.entities.some((entity) => entity.type === 'hatch')).toBe(false)
  })

  it('no longer reports hatches as something it could not read', async () => {
    const { unreadableInDxf } = await import('./dxf')
    expect(unreadableInDxf(wrap(solidHatch('1'))).has('HATCH')).toBe(false)
  })

  it('leaves a hatch with no closed boundary out rather than drawing a line', () => {
    const text = wrap([
      '0', 'HATCH', '8', '0', '2', 'SOLID', '70', '1', '91', '1',
      '92', '7', '73', '1', '93', '2', '10', '0.0', '20', '0.0', '10', '1.0', '20', '1.0',
    ])
    const doc = importDocumentFromDxf(text, makeDefaultDocument())
    expect(doc.entities.filter((entity) => entity.type === 'hatch')).toHaveLength(0)
  })
})
