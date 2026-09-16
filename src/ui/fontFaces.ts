import { FONT_FACES } from '../core/textMetrics'

/**
 * Declares the shipped faces to the browser.
 *
 * The @font-face rules come from the same table that tells the plot which file to embed, so a face can
 * never load on the canvas without being plottable. A browser only fetches a face when something is
 * drawn with it, so a drawing that uses none of them downloads none of them.
 */
export const installFontFaces = (): void => {
  const rules = Object.entries(FONT_FACES)
    .filter(([, face]) => face.file)
    .map(
      ([, face]) =>
        `@font-face { font-family: '${face.cssFamily}'; font-style: ${face.cssStyle}; font-weight: ${face.cssWeight}; font-display: swap; src: url('${face.file}') format('truetype'); }`,
    )
  if (rules.length === 0) return
  const style = document.createElement('style')
  style.dataset.trimcadFonts = 'faces'
  style.textContent = rules.join('\n')
  document.head.append(style)
}
