import { describe, expect, it } from 'vitest'
import { makeDefaultDocument } from './document'
import { importDocumentFromDxf } from './dxf'

/** A TEXT record as AutoCAD writes one when a justification is set: both points present. */
const justified = (text: string, halign: number, valign: number) => [
  '0', 'TEXT', '8', '0',
  '10', '100.0', '20', '50.0', '30', '0.0',
  '40', '2.271',
  '1', text,
  '72', String(halign),
  '73', String(valign),
  '11', '100.61', '21', '51.14', '31', '0.0',
]

const plain = (text: string) => [
  '0', 'TEXT', '8', '0',
  '10', '10.0', '20', '20.0', '30', '0.0',
  '40', '2.5',
  '1', text,
]

const wrap = (records: string[]) => ['0', 'SECTION', '2', 'ENTITIES', ...records, '0', 'ENDSEC', '0', 'EOF', ''].join('\n')

describe('where a justified text is anchored', () => {
  it('uses the second alignment point when one is set', () => {
    /*
     * Group 11 is what AutoCAD anchors a justified text on; group 10 is left where the words were
     * first typed. Taking group 10 and then applying middle/middle draws the text half a height below
     * its cell — the table text of the customer's sheet sat on its own row lines.
     */
    const doc = importDocumentFromDxf(wrap(justified('2', 1, 2)), makeDefaultDocument())
    const text = doc.entities[0]
    expect(text.type).toBe('text')
    if (text.type !== 'text') throw new Error('not text')
    expect(text.position).toEqual({ x: 100.61, y: 51.14 })
    // DXF halign 1 is centre and valign 2 is middle, which is the MC anchor.
    expect(text.justify).toBe('MC')
  })

  it('keeps the first point when the text is left and baseline, as AutoCAD means it', () => {
    const doc = importDocumentFromDxf(wrap(plain('SCALE 1:1')), makeDefaultDocument())
    const text = doc.entities[0]
    if (text.type !== 'text') throw new Error('not text')
    expect(text.position).toEqual({ x: 10, y: 20 })
    expect(text.justify).toBe('Left')
  })

  it('falls back to the first point when a justified record carries no second one', () => {
    // Some writers set 72/73 and never write 11; the text has to land somewhere sensible.
    const records = [
      '0', 'TEXT', '8', '0', '10', '7.0', '20', '8.0', '40', '2.0', '1', 'x', '72', '1', '73', '2',
    ]
    const doc = importDocumentFromDxf(wrap(records), makeDefaultDocument())
    const text = doc.entities[0]
    if (text.type !== 'text') throw new Error('not text')
    expect(text.position).toEqual({ x: 7, y: 8 })
  })
})
