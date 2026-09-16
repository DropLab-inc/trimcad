import { describe, expect, it } from 'vitest'
import { makeDefaultDocument } from './document'
import { exportDocumentToDxf, importDocumentFromDxf } from './dxf'
import { reflectEntityY } from './dxfCoordinates'
import { effectiveStyleFor, textBox } from './text'
import type { CadEntity } from './types'

const wrap = (...records: (string | number)[]) =>
  ['0', 'SECTION', '2', 'ENTITIES', ...records, '0', 'ENDSEC', '0', 'EOF', ''].join('\n')

/**
 * The customer's sheet, reduced to the one row that showed the fault: two cell borders and the row's
 * text, with the coordinates exactly as their file carried them — AutoCAD's, y up.
 *
 * The text is a TopLeft MTEXT whose caps hang DOWNWARD from its anchor, which in a y-up file means
 * toward smaller y. Read without converting the axis, the same anchor hangs the words the other way and
 * they run through the border 0.26 below the cell, which is what "the text doesn't line up with the box"
 * looked like on screen.
 */
const CELL_BOTTOM = -173.02
const CELL_TOP = -165.39
const TEXT_ANCHOR = -167.42
/** Our model's height is the font's em size, so a 3.197 cap height is a 4.45 em. */
const TEXT_EM = 3.197 / 0.718

const customerRow = wrap(
  0, 'LINE', 8, '0', 10, 0, 20, CELL_BOTTOM, 11, 140, 21, CELL_BOTTOM,
  0, 'LINE', 8, '0', 10, 0, 20, CELL_TOP, 11, 140, 21, CELL_TOP,
  0, 'MTEXT', 8, '0', 10, 2, 20, TEXT_ANCHOR, 40, TEXT_EM, 41, 110, 71, 1, 1, 'ROHS',
)

describe('a file from AutoCAD is read in AutoCAD’s axis and drawn in this app’s', () => {
  it('hangs a TopLeft cell text inside its cell instead of through the border', () => {
    const doc = importDocumentFromDxf(customerRow, makeDefaultDocument())
    const [first, second, text] = doc.entities
    if (first.type !== 'line' || second.type !== 'line' || text.type !== 'mtext') throw Error('fixture')
    const band = [first.start.y, second.start.y].sort((a, b) => a - b)
    const box = textBox(text, effectiveStyleFor(doc, text)).map((point) => point.y)
    const textTop = Math.min(...box)
    const textBottom = Math.max(...box)

    expect(textTop).toBeGreaterThan(band[0])
    expect(textBottom).toBeLessThan(band[1])
    // And centred in the row, which is where the reference plot has it.
    expect((textTop + textBottom) / 2).toBeCloseTo((band[0] + band[1]) / 2, 0)
  })

  it('puts a row 2 above row 5, as the sheet is drawn', () => {
    const rows = wrap(
      0, 'MTEXT', 8, '0', 10, 2, 20, -144.23, 40, 4.45, 71, 1, 1, 'DYNE',
      0, 'MTEXT', 8, '0', 10, 2, 20, -167.42, 40, 4.45, 71, 1, 1, 'ROHS',
    )
    const doc = importDocumentFromDxf(rows, makeDefaultDocument())
    const dyne = doc.entities[0]
    const rohs = doc.entities[1]
    // y runs down in this app, so the row that is higher on the sheet has the SMALLER y. Row 2 (the
    // dyne value) is above row 5 (the ROHS note) on the reference sheet, so it must have the smaller y.
    expect((dyne as any).position.y).toBeLessThan((rohs as any).position.y)
  })

  it('keeps an arc the same piece of the circle', () => {
    const source = wrap(0, 'ARC', 8, '0', 10, 5, 20, 10, 40, 4, 50, 0, 51, 90)
    const doc = importDocumentFromDxf(source, makeDefaultDocument())
    const arc = doc.entities[0]
    if (arc.type !== 'arc') throw Error('fixture')
    expect(arc.center).toEqual({ x: 5, y: -10 })
    // A quarter turn, still a quarter turn, still in the same quadrant.
    expect(Math.abs(arc.endAngle - arc.startAngle)).toBeCloseTo(Math.PI / 2)
    expect(Math.min(arc.startAngle, arc.endAngle)).toBeCloseTo(-Math.PI / 2)
  })

  it('reflects a block, its base point and the insert that places it together', () => {
    const source = [
      '0', 'SECTION', '2', 'BLOCKS',
      '0', 'BLOCK', '2', 'CELL', '70', '0', '10', '5', '20', '10',
      '0', 'LINE', 8, '0', 10, 5, 20, 10, 11, 15, 21, 20,
      '0', 'ENDBLK', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', 8, '0', 2, 'CELL', 10, 100, 20, 200, 50, 30,
      '0', 'ENDSEC', '0', 'EOF', '',
    ].join('\n')
    const doc = importDocumentFromDxf(source, makeDefaultDocument())
    expect(doc.blocks[0].basePoint).toEqual({ x: 5, y: -10 })
    expect(doc.blocks[0].entities[0]).toMatchObject({ start: { x: 5, y: -10 }, end: { x: 15, y: -20 } })
    expect(doc.entities[0]).toMatchObject({ position: { x: 100, y: -200 }, rotation: -Math.PI / 6 })
  })

  it('is its own inverse', () => {
    const shapes: CadEntity[] = [
      { id: 'l', type: 'line', layerId: '0', start: { x: 1, y: 2 }, end: { x: 3, y: -4 } },
      { id: 'c', type: 'circle', layerId: '0', center: { x: 5, y: 6 }, radius: 7 },
      { id: 'a', type: 'arc', layerId: '0', center: { x: 8, y: 9 }, radius: 2, startAngle: 0.3, endAngle: 1.9 },
      { id: 'e', type: 'ellipse', layerId: '0', center: { x: 1, y: 1 }, rx: 4, ry: 2, rotation: 0.4 },
      { id: 'p', type: 'polyline', layerId: '0', closed: true, points: [{ x: 0, y: 0 }, { x: 1, y: 2 }] },
      { id: 't', type: 'text', layerId: '0', position: { x: 2, y: 3 }, value: 'A', height: 5, rotation: 0.7, justify: 'MC' },
      { id: 'i', type: 'insert', layerId: '0', blockId: 'b', position: { x: 9, y: 8 }, rotation: 1.2, scale: 2 },
    ]
    expect(shapes.map(reflectEntityY).map(reflectEntityY)).toEqual(shapes)
  })
})

describe('a drawing this app writes is readable by AutoCAD, and by us', () => {
  it('round trips through the plain DXF records, with no embedded copy to lean on', () => {
    const doc = makeDefaultDocument()
    const drawn: CadEntity[] = [
      { id: 'l', type: 'line', layerId: doc.layers[0].id, start: { x: 0, y: 0 }, end: { x: 100, y: 40 } },
      { id: 'c', type: 'circle', layerId: doc.layers[0].id, center: { x: 10, y: -20 }, radius: 5 },
      { id: 't', type: 'text', layerId: doc.layers[0].id, position: { x: 4, y: 6 }, value: 'NOTE', height: 2.5 },
      { id: 'i', type: 'insert', layerId: doc.layers[0].id, blockId: doc.blocks?.[0]?.id ?? 'b', position: { x: 7, y: 8 }, rotation: 0, scale: 1 },
    ]
    const source = { ...doc, entities: drawn }
    const written = exportDocumentToDxf(source)
    // The embedded document is this app's own format; the records are what another CAD program reads.
    const records = written.replace(/^999\n.*\n/, '')
    const reread = importDocumentFromDxf(records, makeDefaultDocument())

    const line = reread.entities.find((entity) => entity.type === 'line')
    if (line?.type !== 'line') throw Error('no line')
    // A point reflected twice can come back as a signed zero, which is the same point.
    expect(line.start.x).toBeCloseTo(0)
    expect(line.start.y).toBeCloseTo(0)
    expect(line.end.x).toBeCloseTo(100)
    expect(line.end.y).toBeCloseTo(40)
    const circle = reread.entities.find((entity) => entity.type === 'circle')
    expect(circle).toMatchObject({ center: { x: 10, y: -20 }, radius: 5 })
    const text = reread.entities.find((entity) => entity.type === 'text')
    expect(text).toMatchObject({ position: { x: 4, y: 6 }, value: 'NOTE' })
  })

  it('writes the records in AutoCAD’s axis: a point above the origin is positive y', () => {
    const doc = makeDefaultDocument()
    const up: CadEntity[] = [
      { id: 'l', type: 'line', layerId: doc.layers[0].id, start: { x: 0, y: 0 }, end: { x: 0, y: -50 } },
    ]
    const written = exportDocumentToDxf({ ...doc, entities: up })
    const numbers = written.split('\n').map((line) => line.trim())
    // The second point of the line is 50 units up the page in this app, and +50 in the file.
    const at = numbers.indexOf('11')
    expect(numbers[at + 1]).toBe('0')
    expect(numbers[at + 3]).toBe('50')
  })
})
