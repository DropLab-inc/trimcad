import { describe, expect, it } from 'vitest'
import {
  CAP_HEIGHT,
  SINGLE_LINE_SPACING,
  decodeControlCodes,
  STANDARD_STYLE,
  lineHeightOf,
  measureText,
  mtextLines,
  placeMText,
  placeTextEntity,
  styleByName,
  styleFor,
  textBox,
  textStylesOf,
  wrapParagraph,
} from './text'
import type { MTextEntity, TextEntity, TextStyle } from './types'

const style = (overrides: Partial<TextStyle> = {}): TextStyle => ({ ...STANDARD_STYLE, ...overrides })

const text = (overrides: Partial<TextEntity> = {}): TextEntity => ({
  id: 't',
  type: 'text',
  layerId: 'L',
  position: { x: 0, y: 0 },
  value: 'Hello',
  height: 100,
  ...overrides,
})

const mtext = (overrides: Partial<MTextEntity> = {}): MTextEntity => ({
  id: 'm',
  type: 'mtext',
  layerId: 'L',
  position: { x: 0, y: 0 },
  width: 0,
  value: 'Hello',
  height: 100,
  ...overrides,
})

describe('measuring text', () => {
  it('measures a string from the glyph widths the plot uses', () => {
    // jsPDF's Helvetica widths for H, e, l, l, o add up to 2260 thousandths of an em.
    expect(measureText('Hello', 100, style())).toBeCloseTo(226, 9)
  })

  it('scales with the character height and the style width factor', () => {
    expect(measureText('Hello', 50, style())).toBeCloseTo(113, 9)
    expect(measureText('Hello', 100, style({ widthFactor: 0.5 }))).toBeCloseTo(113, 9)
  })

  it('measures the fixed advance courier gives every character', () => {
    expect(measureText('iii', 1000, style({ font: 'courier' }))).toBeCloseTo(1800, 9)
    expect(measureText('WWW', 1000, style({ font: 'courier' }))).toBeCloseTo(1800, 9)
  })

  it('falls back rather than measuring nothing for text the table does not hold', () => {
    expect(measureText('€', 1000, style())).toBeGreaterThan(0)
    expect(measureText('日本語', 1000, style())).toBeCloseTo(3000, 9)
  })
})

describe('styles', () => {
  it('always offers Standard, and never twice', () => {
    const custom = { id: 's2', name: 'Notes', font: 'times', height: 0, widthFactor: 1, obliqueAngle: 0 }
    const styles = textStylesOf({ textStyles: [{ ...STANDARD_STYLE }, custom] })

    expect(styles.map((entry) => entry.name)).toEqual(['Standard', 'Notes'])
    expect(textStylesOf({})).toHaveLength(1)
  })

  it('reads the style an object names, and Standard when it names none', () => {
    const notes = { id: 's2', name: 'Notes', font: 'times', height: 12, widthFactor: 1, obliqueAngle: 0 }
    const document = { textStyles: [notes] }

    expect(styleFor(document, { styleId: 's2' }).name).toBe('Notes')
    expect(styleFor(document, {}).name).toBe('Standard')
    expect(styleFor(document, { styleId: 'gone' }).name).toBe('Standard')
    expect(styleByName(textStylesOf(document), 'notes')?.id).toBe('s2')
  })
})

describe('wrapping a paragraph', () => {
  it('keeps the words whole and fills each line to the column', () => {
    const lines = wrapParagraph('the quick brown fox jumps', 400, 100, style())

    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(measureText(line, 100, style())).toBeLessThanOrEqual(400)
    expect(lines.join(' ')).toBe('the quick brown fox jumps')
  })

  it('breaks a word wider than the column, so one word cannot set the column', () => {
    const lines = wrapParagraph('supercalifragilistic', 200, 100, style())

    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(measureText(line, 100, style())).toBeLessThanOrEqual(200)
    expect(lines.join('')).toBe('supercalifragilistic')
  })

  it('never wraps when there is no width to wrap to', () => {
    expect(wrapParagraph('a very long line indeed', 0, 100, style())).toEqual(['a very long line indeed'])
  })
})

describe('placing text', () => {
  it('starts a left-justified line at the insertion point', () => {
    const placement = placeTextEntity(text({ justify: 'Left' }), style())

    expect(placement.offset).toEqual({ x: 0, y: 0 })
  })

  it('hangs centre and right justified text off the insertion point', () => {
    expect(placeTextEntity(text({ justify: 'Center' }), style()).offset.x).toBeCloseTo(-113, 9)
    expect(placeTextEntity(text({ justify: 'Right' }), style()).offset.x).toBeCloseTo(-226, 9)
  })

  it('anchors top and middle justification on the capital height, as AutoCAD does', () => {
    expect(placeTextEntity(text({ justify: 'TC' }), style()).offset.y).toBeCloseTo(100 * CAP_HEIGHT, 9)
    expect(placeTextEntity(text({ justify: 'MC' }), style()).offset.y).toBeCloseTo((100 * CAP_HEIGHT) / 2, 9)
    // Bottom-left puts the baseline on the point, so the text sits above it.
    expect(placeTextEntity(text({ justify: 'BL' }), style()).offset.y).toBeCloseTo(0, 9)
  })

  it('drops each line by the single line spacing AutoCAD uses', () => {
    const entity = mtext({ value: 'one\ntwo\nthree', width: 1000 })
    const placement = placeMText(entity, style())

    expect(placement.starts).toHaveLength(3)
    expect(placement.lineHeight).toBeCloseTo(100 * SINGLE_LINE_SPACING, 9)
    expect(lineHeightOf(entity)).toBeCloseTo(100 * SINGLE_LINE_SPACING, 9)
    expect(placement.starts[2].y - placement.starts[0].y).toBeCloseTo(2 * 100 * SINGLE_LINE_SPACING, 9)
  })

  it('honours a line spacing multiple', () => {
    expect(lineHeightOf(mtext({ lineSpacing: 2 }))).toBeCloseTo(2 * 100 * SINGLE_LINE_SPACING, 9)
  })

  it('anchors a block of paragraphs on the attachment point', () => {
    const bottomLeft = placeMText(mtext({ value: 'a\nb', width: 500, attachment: 'BL' }), style())
    const middle = placeMText(mtext({ value: 'a\nb', width: 500, attachment: 'MC' }), style())
    const topRight = placeMText(mtext({ value: 'a\nb', width: 500, attachment: 'TR' }), style())

    // Bottom-left: the last baseline is the point, so the first is one line above it.
    expect(bottomLeft.offset.y).toBeCloseTo(-100 * SINGLE_LINE_SPACING, 9)
    expect(bottomLeft.offset.x).toBe(0)
    // Centred horizontally on the column, and half the block above the point.
    expect(middle.offset.x).toBeCloseTo(-250, 9)
    expect(middle.offset.y).toBeCloseTo(100 * CAP_HEIGHT - (100 * CAP_HEIGHT + 100 * SINGLE_LINE_SPACING) / 2, 9)
    // Top-right: the column's right edge on the point, first line's caps below it.
    expect(topRight.offset.x).toBeCloseTo(-500, 9)
    expect(topRight.offset.y).toBeCloseTo(100 * CAP_HEIGHT, 9)
  })

  it('wraps the block to the column it was given', () => {
    const entity = mtext({ value: 'the quick brown fox jumps over the lazy dog', width: 400 })
    const lines = mtextLines(entity, style())

    expect(lines.length).toBeGreaterThan(2)
    expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog')
    for (const line of lines) expect(measureText(line, 100, style())).toBeLessThanOrEqual(400)
  })
})

describe('the box a text object occupies', () => {
  it('covers the caps and the wrapped lines', () => {
    const corners = textBox(mtext({ value: 'a\nb\nc', width: 500 }), style())
    const xs = corners.map((point) => point.x)
    const ys = corners.map((point) => point.y)

    expect(Math.min(...xs)).toBeCloseTo(0, 9)
    expect(Math.max(...xs)).toBeCloseTo(500, 9)
    expect(Math.min(...ys)).toBeCloseTo(0, 9)
    // Three lines: the caps of the first plus two line spacings down to the last baseline.
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(100 * CAP_HEIGHT + 2 * 100 * SINGLE_LINE_SPACING, 9)
  })

  it('turns with the text', () => {
    const corners = textBox(text({ rotation: 90, justify: 'Left' }), style())

    // A quarter turn puts the string's length down the page instead of across it.
    const height = Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y))
    const width = Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x))
    expect(height).toBeCloseTo(226, 6)
    expect(width).toBeCloseTo(100 * CAP_HEIGHT, 6)
  })
})

describe('AutoCAD in-text control codes', () => {
  it('turns the codes a real drawing writes into the characters they stand for', () => {
    // The customer's own note: "1.未注公差：%%P0.2;" means a tolerance of ±0.2.
    expect(decodeControlCodes('1.未注公差：%%P0.2;')).toBe('1.未注公差：±0.2;')
    expect(decodeControlCodes('%%c12')).toBe('⌀12')
    expect(decodeControlCodes('45%%d')).toBe('45°')
    // %%% is an escaped per cent sign, not a code.
    expect(decodeControlCodes('100%%% done')).toBe('100%% done')
    // %%nnn is a character code.
    expect(decodeControlCodes('%%065')).toBe('A')
  })

  it('reads MTEXT unicode escapes and escaped braces', () => {
    // U+2205 is the empty set, which is what that escape actually names.
    expect(decodeControlCodes('\\U+2205')).toBe('∅')
    expect(decodeControlCodes('a\\{b\\}c')).toBe('a{b}c')
  })

  it('leaves ordinary text alone', () => {
    expect(decodeControlCodes('SCALE 1:1 UNIT MM')).toBe('SCALE 1:1 UNIT MM')
    expect(decodeControlCodes('R1.1897')).toBe('R1.1897')
  })
})
