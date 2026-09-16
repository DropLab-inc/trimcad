#!/usr/bin/env node
/**
 * Writes src/core/textMetrics.ts from jsPDF's own standard-font metrics.
 *
 * Text has to WRAP the same on the canvas, in the PDF and in a test, and the plot is drawn by jsPDF, so
 * jsPDF is the only honest source for the widths: measuring the browser's own font instead would put the
 * screen's line breaks somewhere the plotted page does not agree with. Arial, Times New Roman and
 * Courier New are metric-compatible with the three core families, so the canvas follows the same table.
 *
 * Usage: node scripts/generate-text-metrics.mjs
 */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { jsPDF } = require('jspdf')

const FAMILIES = ['helvetica', 'times', 'courier']
const STYLES = ['normal', 'bold', 'italic', 'bolditalic']
const FIRST = 32
const LAST = 126

const fontName = (family, style) => (style === 'normal' ? family : `${family}-${style}`)

const rows = []
for (const family of FAMILIES) {
  for (const style of STYLES) {
    const doc = new jsPDF({ unit: 'pt' })
    doc.setFont(family, style)
    doc.setFontSize(1000)
    const widths = []
    for (let code = FIRST; code <= LAST; code += 1) {
      widths.push(Math.round(doc.getTextWidth(String.fromCharCode(code))))
    }
    rows.push(
      `  '${fontName(family, style)}': [${widths
        .map((width, index) => (index % 20 === 19 ? `${width},\n    ` : `${width}, `))
        .join('')
        .trimEnd()
        .replace(/,\s*$/, ',')}],`,
    )
  }
}

const file = `/**
 * Advance width of every printable ASCII character, in thousandths of an em.
 *
 * GENERATED — do not edit by hand. Regenerate with \`node scripts/generate-text-metrics.mjs\`, which reads
 * the widths out of jsPDF's standard fonts: the same library that draws the plot, so a paragraph wraps
 * in the same place on the canvas and on the page. Anything outside ASCII falls back at use sites in
 * \`text.ts\`.
 */

/** The twelve fonts a text style can name, matching jsPDF's own font names. */
export type TextFont =
${FAMILIES.flatMap((family) => STYLES.map((style) => `  | '${fontName(family, style)}'`)).join('\n')}

export const TEXT_FONTS: TextFont[] = [
${FAMILIES.flatMap((family) => STYLES.map((style) => `  '${fontName(family, style)}',`)).join('\n')}
]

/** Index 0 is character ${FIRST}, index ${LAST - FIRST} is character ${LAST}. */
export const FIRST_CODE = ${FIRST}

export const FONT_ADVANCES: Record<TextFont, number[]> = {
${rows.join('\n')}
}
`

writeFileSync(new URL('../src/core/textMetrics.ts', import.meta.url), file)
console.log(`wrote src/core/textMetrics.ts — ${rows.length} fonts × ${LAST - FIRST + 1} characters`)
