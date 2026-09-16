import { FONT_ADVANCES, FONT_FACES, FIRST_CODE, TEXT_FONTS, type FontFace, type TextFont } from './textMetrics'
import type { Vec2 } from './math/vec2'
import type { MTextAttachment, MTextEntity, TextEntity, TextJustify, TextStyle } from './types'

/**
 * Text as a measured thing: what a string is wide, where a paragraph wraps, and which point of a run
 * of lines an insertion point actually anchors.
 *
 * Everything a text object needs to be drawn, picked or PLOTTED is decided here, from one table of
 * glyph widths, so the canvas and the plotted page agree about where a line ends rather than each
 * measuring the browser's or the PDF writer's own font and wrapping a paragraph differently.
 */

/** Helvetica's cap height. AutoCAD anchors top and middle justification on the caps, not the em box. */
export const CAP_HEIGHT = 0.718

/** AutoCAD's single line spacing for MTEXT: 5/3 of the character height. */
export const SINGLE_LINE_SPACING = 5 / 3

/** What the drawing has when it has no styles yet. AutoCAD's own default style name. */
export const STANDARD_STYLE: TextStyle = {
  id: 'standard',
  name: 'Standard',
  font: 'helvetica',
  // AutoCAD's Standard is a height of 0: not fixed, so each TEXT asks for its own.
  height: 0,
  widthFactor: 1,
  obliqueAngle: 0,
}

/**
 * The drawing's styles, with `Standard` always present.
 *
 * `Standard` cannot be missing or deleted: every text object without a style of its own reads it, and
 * AutoCAD refuses to remove it for the same reason.
 */
export const textStylesOf = (document: { textStyles?: TextStyle[] }): TextStyle[] => {
  const styles = document.textStyles ?? []
  // A drawing that HAS a Standard keeps the one it has, edits and all; one that predates styles gets
  // the built-in. Name as well as id, because a style read out of a DXF file carries its own id.
  const stored = styles.some((style) => style.id === STANDARD_STYLE.id || style.name === STANDARD_STYLE.name)
  return stored ? styles : [STANDARD_STYLE, ...styles]
}

/** The style a text object draws in: its own, or the drawing's Standard. */
export const styleFor = (
  document: { textStyles?: TextStyle[] },
  entity: { styleId?: string },
): TextStyle => {
  const styles = textStylesOf(document)
  const own = styles.find((style) => style.id === entity.styleId)
  if (own) return own
  /*
   * An object that names no style is in Standard — the DRAWING's Standard, the one the style dialog
   * edits. Answering with the built-in constant instead was a style you could edit for nothing: every
   * object that did not name a style kept drawing in Helvetica.
   */
  return (
    styles.find((style) => style.id === STANDARD_STYLE.id || style.name === STANDARD_STYLE.name) ??
    STANDARD_STYLE
  )
}

/**
 * The style an object draws in, with the width factor and oblique angle the object carries itself.
 *
 * Those two are properties of the OBJECT in DXF (groups 41 and 51) as well as of the style, and an
 * object that overrides one has to keep it: a file written by AutoCAD carries the override, and a
 * style edited later must not silently win.
 */
export const effectiveStyleFor = (
  document: { textStyles?: TextStyle[] },
  entity: { styleId?: string; widthFactor?: number; obliqueAngle?: number },
): TextStyle => {
  const base = styleFor(document, entity)
  const widthFactor = entity.widthFactor ?? base.widthFactor
  const obliqueAngle = entity.obliqueAngle ?? base.obliqueAngle
  if (widthFactor === base.widthFactor && obliqueAngle === base.obliqueAngle) return base
  return { ...base, widthFactor, obliqueAngle }
}

export const styleByName = (styles: TextStyle[], name: string): TextStyle | null =>
  styles.find((style) => style.name.toLowerCase() === name.trim().toLowerCase()) ?? null

/** Width of anything outside ASCII, in thousandths of an em. */
const FALLBACK_ADVANCE = 556
/** Wide scripts are not squeezed into a Latin advance; a full em is the safer guess. */
const WIDE_ADVANCE = 1000

/** How a style's font is drawn: the CSS family, the PDF family, and the file when it is shipped. */
export const faceOf = (font: string): FontFace =>
  FONT_FACES[(TEXT_FONTS.includes(font as TextFont) ? font : 'helvetica') as TextFont]

const advanceOf = (font: TextFont, character: string): number => {
  const code = character.codePointAt(0) ?? 32
  const row = FONT_ADVANCES[font] ?? FONT_ADVANCES.helvetica
  if (code >= FIRST_CODE && code - FIRST_CODE < row.length) return row[code - FIRST_CODE]
  if (code >= 0x2e80) return WIDE_ADVANCE
  return FALLBACK_ADVANCE
}

/** The width of a string in drawing units, at a given character height. */
export const measureText = (value: string, height: number, style: TextStyle): number => {
  const font = (TEXT_FONTS.includes(style.font as TextFont) ? style.font : 'helvetica') as TextFont
  let thousandths = 0
  for (const character of value) thousandths += advanceOf(font, character)
  return (thousandths / 1000) * height * style.widthFactor
}

/**
 * A paragraph broken into the lines it wraps to.
 *
 * Words are moved onto the next line whole, and a single word wider than the column is broken by
 * character — otherwise one long word would set the column's width and push everything else sideways,
 * which is the case a notes block hits on its first file path or dimension string.
 */
export const wrapParagraph = (paragraph: string, width: number, height: number, style: TextStyle): string[] => {
  if (width <= 0) return [paragraph]
  const lines: string[] = []
  let line = ''
  const fit = (candidate: string) => measureText(candidate, height, style) <= width

  for (const word of paragraph.split(' ')) {
    if (line === '') {
      if (fit(word)) {
        line = word
        continue
      }
    } else if (fit(`${line} ${word}`)) {
      line = `${line} ${word}`
      continue
    } else {
      lines.push(line)
      line = ''
      if (fit(word)) {
        line = word
        continue
      }
    }

    // The word alone is wider than the column, so it is broken where it stops fitting.
    let piece = ''
    for (const character of word) {
      if (piece !== '' && !fit(piece + character)) {
        lines.push(piece)
        piece = ''
      }
      piece += character
    }
    line = piece
  }
  lines.push(line)
  return lines
}

/** The lines an MTEXT holds: hard breaks kept, and every paragraph wrapped to the column. */
export const mtextLines = (entity: MTextEntity, style: TextStyle): string[] =>
  entity.value
    .split('\n')
    .flatMap((paragraph) => wrapParagraph(paragraph, entity.width, entity.height, style))

/** The gap between one line's baseline and the next. */
export const lineHeightOf = (entity: MTextEntity): number =>
  entity.height * SINGLE_LINE_SPACING * (entity.lineSpacing ?? 1)

export type TextAnchor = { horizontal: 'left' | 'center' | 'right'; vertical: 'baseline' | 'top' | 'middle' | 'bottom' }

const JUSTIFY_ANCHORS: Record<TextJustify, TextAnchor> = {
  Left: { horizontal: 'left', vertical: 'baseline' },
  Center: { horizontal: 'center', vertical: 'baseline' },
  Right: { horizontal: 'right', vertical: 'baseline' },
  Middle: { horizontal: 'center', vertical: 'middle' },
  TL: { horizontal: 'left', vertical: 'top' },
  TC: { horizontal: 'center', vertical: 'top' },
  TR: { horizontal: 'right', vertical: 'top' },
  ML: { horizontal: 'left', vertical: 'middle' },
  MC: { horizontal: 'center', vertical: 'middle' },
  MR: { horizontal: 'right', vertical: 'middle' },
  BL: { horizontal: 'left', vertical: 'bottom' },
  BC: { horizontal: 'center', vertical: 'bottom' },
  BR: { horizontal: 'right', vertical: 'bottom' },
}

export const textAnchor = (justify: TextJustify | undefined): TextAnchor =>
  JUSTIFY_ANCHORS[justify ?? 'Left'] ?? JUSTIFY_ANCHORS.Left

export const mtextAnchor = (attachment: MTextAttachment | undefined): TextAnchor =>
  JUSTIFY_ANCHORS[(attachment ?? 'TL') as TextJustify] ?? JUSTIFY_ANCHORS.TL

/**
 * A run of lines positioned by its anchor, as OFFSETS from the insertion point.
 *
 * Offsets rather than absolute points because the canvas draws the text inside
 * `translate(insertionPoint) rotate(…)`, and a placement that already held absolute coordinates would
 * be shifted twice — the kind of fault that looks like the wrong justification. Callers that want
 * absolute geometry use `textBox`.
 *
 * `columnWidth` is the wrapping width for MTEXT, and the widest line for text that does not wrap —
 * left/centre/right anchoring needs a width even when nothing wraps.
 */
export type TextPlacement = {
  /** From the insertion point to the start of the first line's baseline. */
  offset: Vec2
  /** Gap from one baseline to the next. */
  lineHeight: number
  columnWidth: number
  /** From the top of the first line's caps to the last baseline. */
  blockHeight: number
  /** One entry per line, each an offset from the insertion point. */
  starts: Vec2[]
}

export const placeText = (
  anchor: TextAnchor,
  lines: string[],
  height: number,
  style: TextStyle,
  lineHeight: number,
  columnWidth: number,
): TextPlacement => {
  const widest = lines.reduce((widest, line) => Math.max(widest, measureText(line, height, style)), 0)
  const width = columnWidth > 0 ? columnWidth : widest
  const gaps = Math.max(0, lines.length - 1)
  const caps = height * CAP_HEIGHT
  const blockHeight = caps + gaps * lineHeight

  const startX =
    anchor.horizontal === 'left' ? 0 : anchor.horizontal === 'center' ? -width / 2 : -width
  const top = anchor.vertical === 'top' ? 0 : anchor.vertical === 'middle' ? -blockHeight / 2 : -blockHeight
  const firstY =
    anchor.vertical === 'baseline' ? 0 : top + caps

  return {
    offset: { x: startX, y: firstY },
    lineHeight,
    columnWidth: width,
    blockHeight,
    starts: lines.map((_, index) => ({ x: startX, y: firstY + index * lineHeight })),
  }
}

/** Where a single-line text sits, as opposed to where its insertion point is. */
export const placeTextEntity = (entity: TextEntity, style: TextStyle): TextPlacement =>
  placeText(
    textAnchor(entity.justify),
    [entity.value],
    entity.height,
    style,
    0,
    measureText(entity.value, entity.height, style),
  )

export const placeMText = (entity: MTextEntity, style: TextStyle): TextPlacement =>
  placeText(
    mtextAnchor(entity.attachment),
    mtextLines(entity, style),
    entity.height,
    style,
    lineHeightOf(entity),
    entity.width,
  )

/** The lines of any text object, for a caller that only wants to draw or measure them. */
export const textLinesOf = (
  entity: TextEntity | MTextEntity,
  style: TextStyle,
): { lines: string[]; placement: TextPlacement; rotation: number } =>
  entity.type === 'mtext'
    ? { lines: mtextLines(entity, style), placement: placeMText(entity, style), rotation: entity.rotation ?? 0 }
    : { lines: [entity.value], placement: placeTextEntity(entity, style), rotation: entity.rotation ?? 0 }

export const isTextEntity = (entity: { type: string }): entity is TextEntity | MTextEntity =>
  entity.type === 'text' || entity.type === 'mtext'

/** Turns an offset from the insertion point into a point in the drawing. */
export const textPoint = (entity: TextEntity | MTextEntity, offset: Vec2): Vec2 => {
  const angle = ((entity.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: entity.position.x + offset.x * cos - offset.y * sin,
    y: entity.position.y + offset.x * sin + offset.y * cos,
  }
}

/**
 * The four corners of a text object's block, in the drawing, turned with it.
 *
 * This is what picking and the drawing's extents use: a note is selected by the space it occupies, the
 * way AutoCAD's text is, rather than by how close the click came to the baseline.
 */
export const textBox = (entity: TextEntity | MTextEntity, style: TextStyle): Vec2[] => {
  const placement =
    entity.type === 'mtext' ? placeMText(entity, style) : placeTextEntity(entity, style)
  const top = placement.offset.y - entity.height * CAP_HEIGHT
  const bottom = placement.offset.y + Math.max(0, (entity.type === 'mtext' ? placement.starts.length - 1 : 0)) * placement.lineHeight
  const left = placement.offset.x
  const right = placement.offset.x + placement.columnWidth
  return [
    textPoint(entity, { x: left, y: top }),
    textPoint(entity, { x: right, y: top }),
    textPoint(entity, { x: right, y: bottom }),
    textPoint(entity, { x: left, y: bottom }),
  ]
}

