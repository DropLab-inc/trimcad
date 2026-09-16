import { describe, expect, it } from 'vitest'
import { makeDefaultDocument } from './document'
import { importDocumentFromDxf, MAX_DRAWING_COORDINATE, impossibleCoordinates } from './dxf'
import type { CadEntity } from './types'

const wrap = (records: string[]) =>
  ['0', 'SECTION', '2', 'ENTITIES', ...records, '0', 'ENDSEC', '0', 'EOF', ''].join('\n')

const polyline = (x: string, y: string) => [
  '0', 'LWPOLYLINE', '8', '0', '90', '2', '70', '0',
  '10', x, '20', y,
  '10', '1.0', '20', '1.0',
  '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '5.0', '21', '5.0',
]

describe('coordinates no drawing can hold', () => {
  it('drops an object placed outside any drawing and keeps the rest', () => {
    // A real customer file carried two polylines at 1e59 — a converter artifact. The fitted camera
    // lands where float arithmetic stops advancing, and the grid loop then never ends.
    const text = wrap(polyline('9.644106929914587e+59', '7.9802242651796935e+59'))
    const doc = importDocumentFromDxf(text, makeDefaultDocument())
    expect(doc.entities.map((entity) => entity.type)).toEqual(['line'])
  })

  it('reports how many objects were dropped for their coordinates', () => {
    const text = wrap(polyline('1e60', '-1e60'))
    expect(impossibleCoordinates(text)).toBe(1)
  })

  it('leaves an object at large but real coordinates alone', () => {
    // A survey in millimetres reaches 1e9 and a machine datum 1e11; neither is garbage.
    const text = wrap(polyline((MAX_DRAWING_COORDINATE / 10).toFixed(1), '1.0'))
    const doc = importDocumentFromDxf(text, makeDefaultDocument())
    expect(doc.entities.length).toBe(2)
    expect(impossibleCoordinates(text)).toBe(0)
  })

  it('drops an object carrying a value that is not a number at all', () => {
    const text = wrap(polyline('NaN', '0.0'))
    const doc = importDocumentFromDxf(text, makeDefaultDocument())
    expect(doc.entities.map((entity) => entity.type)).toEqual(['line'])
  })

  it('applies the same test to a block member', () => {
    const inner: CadEntity[] = []
    expect(inner).toHaveLength(0)
    const text = [
      '0', 'SECTION', '2', 'BLOCKS',
      '0', 'BLOCK', '8', '0', '2', 'GARBAGE', '70', '0', '10', '0.0', '20', '0.0',
      '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '1e59', '21', '1e59',
      '0', 'LINE', '8', '0', '10', '0.0', '20', '0.0', '11', '2.0', '21', '2.0',
      '0', 'ENDBLK', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', '8', '0', '2', 'GARBAGE', '10', '0.0', '20', '0.0', '41', '1.0', '50', '0.0',
      '0', 'ENDSEC', '0', 'EOF', '',
    ].join('\n')
    const doc = importDocumentFromDxf(text, makeDefaultDocument())
    const block = doc.blocks.find((candidate) => candidate.name === 'GARBAGE')
    // The member at 1e59 is gone; the member that can be drawn stays.
    expect(block?.entities).toHaveLength(1)
  })
})
