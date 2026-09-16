#!/usr/bin/env node
/**
 * Writes src/core/textMetrics.ts from the fonts the app can actually DRAW.
 *
 * Two sources, one table:
 *
 * - jsPDF's five standard families, which the plot has always had.
 * - The faces shipped in public/fonts (open-licence TTFs), measured by handing jsPDF the file and
 *   asking it for the character widths. Those same files are what the plot EMBEDS and what the canvas
 *   loads, so a drawing's typography is one font on screen, in the PDF and in the wrap.
 *
 * A font that is named in a style but cannot be plotted would be a canvas-only decoration, which is why
 * the list is built from files that exist rather than from a list of names.
 *
 * Usage: node scripts/generate-text-metrics.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { jsPDF } = require('jspdf')

const FIRST = 32
const LAST = 126

/** jsPDF's own families, with the CSS stack each maps onto on the canvas. */
const CORE = [
  { family: 'helvetica', label: 'Helvetica', css: 'Helvetica', stack: 'Helvetica, Arial, sans-serif' },
  { family: 'times', label: 'Times', css: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { family: 'courier', label: 'Courier', css: 'Courier New', stack: '"Courier New", Courier, monospace' },
]
const FACES = ['normal', 'bold', 'italic', 'bolditalic']

/** The shipped faces: the key is the style font name, and the file holds the outlines. */
const BUNDLED = [
  { key: 'inter', family: 'Inter', label: 'Inter', face: 'normal', css: 'InterTrim', stack: "InterTrim, Helvetica, Arial, sans-serif", weight: '400', style: 'normal' },
  { key: 'inter-bold', family: 'Inter', label: 'Inter Bold', face: 'bold', css: 'InterTrim', stack: "InterTrim, Helvetica, Arial, sans-serif", weight: '700', style: 'normal' },
  { key: 'inter-italic', family: 'Inter', label: 'Inter Italic', face: 'italic', css: 'InterTrim', stack: "InterTrim, Helvetica, Arial, sans-serif", weight: '400', style: 'italic' },
  { key: 'inter-bolditalic', family: 'Inter', label: 'Inter Bold Italic', face: 'bolditalic', css: 'InterTrim', stack: "InterTrim, Helvetica, Arial, sans-serif", weight: '700', style: 'italic' },
  { key: 'lora', family: 'Lora', label: 'Lora', face: 'normal', css: 'LoraTrim', stack: "LoraTrim, Georgia, 'Times New Roman', serif", weight: '400', style: 'normal' },
  { key: 'lora-bold', family: 'Lora', label: 'Lora Bold', face: 'bold', css: 'LoraTrim', stack: "LoraTrim, Georgia, 'Times New Roman', serif", weight: '700', style: 'normal' },
  { key: 'lora-italic', family: 'Lora', label: 'Lora Italic', face: 'italic', css: 'LoraTrim', stack: "LoraTrim, Georgia, 'Times New Roman', serif", weight: '400', style: 'italic' },
  { key: 'lora-bolditalic', family: 'Lora', label: 'Lora Bold Italic', face: 'bolditalic', css: 'LoraTrim', stack: "LoraTrim, Georgia, 'Times New Roman', serif", weight: '700', style: 'italic' },
  { key: 'roboto-mono', family: 'Roboto Mono', label: 'Roboto Mono', face: 'normal', css: 'RobotoMonoTrim', stack: "RobotoMonoTrim, 'Courier New', Courier, monospace", weight: '400', style: 'normal' },
  { key: 'roboto-mono-bold', family: 'Roboto Mono', label: 'Roboto Mono Bold', face: 'bold', css: 'RobotoMonoTrim', stack: "RobotoMonoTrim, 'Courier New', Courier, monospace", weight: '700', style: 'normal' },
  { key: 'roboto-mono-italic', family: 'Roboto Mono', label: 'Roboto Mono Italic', face: 'italic', css: 'RobotoMonoTrim', stack: "RobotoMonoTrim, 'Courier New', Courier, monospace", weight: '400', style: 'italic' },
  { key: 'roboto-mono-bolditalic', family: 'Roboto Mono', label: 'Roboto Mono Bold Italic', face: 'bolditalic', css: 'RobotoMonoTrim', stack: "RobotoMonoTrim, 'Courier New', Courier, monospace", weight: '700', style: 'italic' },
  { key: 'oswald', family: 'Oswald', label: 'Oswald', face: 'normal', css: 'OswaldTrim', stack: "OswaldTrim, Impact, 'Arial Narrow', sans-serif", weight: '400', style: 'normal' },
  { key: 'oswald-bold', family: 'Oswald', label: 'Oswald Bold', face: 'bold', css: 'OswaldTrim', stack: "OswaldTrim, Impact, 'Arial Narrow', sans-serif", weight: '700', style: 'normal' },
]

const measure = (doc, character) => Math.round(doc.getTextWidth(character))

/** One row per face: the thousandth-of-an-em advance of every printable ASCII character. */
const rowFor = (doc, face) => {
  doc.setFont(face.family, face.face)
  doc.setFontSize(1000)
  const widths = []
  for (let code = FIRST; code <= LAST; code += 1) widths.push(measure(doc, String.fromCharCode(code)))
  return widths
}

const formatRow = (key, widths) =>
  `  '${key}': [${widths
    .map((width, index) => (index % 20 === 19 ? `${width},\n    ` : `${width}, `))
    .join('')
    .trimEnd()
    .replace(/,\s*$/, ',')}],`

const rows = []
const faces = []
/** The keys in the order they are emitted, so the union and the list are quoted from the key itself. */
const keys = []

for (const core of CORE) {
  const doc = new jsPDF({ unit: 'pt' })
  for (const face of FACES) {
    const key = face === 'normal' ? core.family : `${core.family}-${face}`
    keys.push(key)
    rows.push(formatRow(key, rowFor(doc, { family: core.family, face })))
    const label = `${core.label}${face === 'normal' ? '' : ` ${face}`}`
    faces.push(
      `  '${key}': { label: ${JSON.stringify(label)}, cssFamily: ${JSON.stringify(core.css)}, cssStack: ${JSON.stringify(core.stack)}, cssWeight: 'normal', cssStyle: 'normal', pdfFamily: '${core.family}', pdfStyle: '${face}' },`,
    )
  }
}

for (const bundled of BUNDLED) {
  const doc = new jsPDF({ unit: 'pt' })
  const file = `public/fonts/${bundled.key}.ttf`
  doc.addFileToVFS(`${bundled.key}.ttf`, readFileSync(file).toString('base64'))
  doc.addFont(`${bundled.key}.ttf`, bundled.family, bundled.face)
  keys.push(bundled.key)
  rows.push(formatRow(bundled.key, rowFor(doc, { family: bundled.family, face: bundled.face })))
  faces.push(
    `  '${bundled.key}': { label: ${JSON.stringify(bundled.label)}, cssFamily: ${JSON.stringify(bundled.css)}, cssStack: ${JSON.stringify(bundled.stack)}, cssWeight: '${bundled.weight}', cssStyle: '${bundled.style}', pdfFamily: ${JSON.stringify(bundled.family)}, pdfStyle: '${bundled.face}', file: '/fonts/${bundled.key}.ttf' },`,
  )
}

const file = `/**
 * The faces the app can draw, and how wide they are.
 *
 * GENERATED — do not edit by hand. \`node scripts/generate-text-metrics.mjs\` measures every face
 * through jsPDF, the library that draws the plot, and reads the bundled faces out of public/fonts —
 * so a paragraph wraps at the same place on the canvas, in a test and on the printed page.
 *
 * A face is only in here if the app can also PLOT it: a font the page cannot draw would be a
 * canvas-only decoration, which is why the bundled list is built from files that exist.
 */

/** Every face a text style can name. */
export type TextFont =
${keys.map((key) => `  | '${key}'`).join('\n')}

export const TEXT_FONTS: TextFont[] = [
${keys.map((key) => `  '${key}',`).join('\n')}
]

/** Index 0 is character ${FIRST}, index ${LAST - FIRST} is character ${LAST}. */
export const FIRST_CODE = ${FIRST}

/**
 * How a face is drawn: the CSS family the canvas uses, the family and face jsPDF is given, and the file
 * to embed — absent for jsPDF's own five families.
 */
export type FontFace = {
  label: string
  /**
   * The name an @font-face is declared under — ONE family, never a fallback list: as the name of a
   * stack the shipped file would never be the font a drawing is drawn with.
   */
  cssFamily: string
  /** What the canvas sets as font-family: the family, then the look-alikes to fall back on. */
  cssStack: string
  cssWeight: string
  cssStyle: string
  pdfFamily: string
  pdfStyle: 'normal' | 'bold' | 'italic' | 'bolditalic'
  file?: string
}

export const FONT_FACES: Record<TextFont, FontFace> = {
${faces.join('\n')}
}

/** Advance width of every printable ASCII character, in thousandths of an em. */
export const FONT_ADVANCES: Record<TextFont, number[]> = {
${rows.join('\n')}
}
`

writeFileSync(new URL('../src/core/textMetrics.ts', import.meta.url), file)
console.log(`wrote src/core/textMetrics.ts — ${rows.length} faces (${BUNDLED.length} bundled) × ${LAST - FIRST + 1} characters`)
