/**
 * The faces the app can draw, and how wide they are.
 *
 * GENERATED — do not edit by hand. `node scripts/generate-text-metrics.mjs` measures every face
 * through jsPDF, the library that draws the plot, and reads the bundled faces out of public/fonts —
 * so a paragraph wraps at the same place on the canvas, in a test and on the printed page.
 *
 * A face is only in here if the app can also PLOT it: a font the page cannot draw would be a
 * canvas-only decoration, which is why the bundled list is built from files that exist.
 */

/** Every face a text style can name. */
export type TextFont =
  | 'helvetica'
  | 'helvetica-bold'
  | 'helvetica-italic'
  | 'helvetica-bolditalic'
  | 'times'
  | 'times-bold'
  | 'times-italic'
  | 'times-bolditalic'
  | 'courier'
  | 'courier-bold'
  | 'courier-italic'
  | 'courier-bolditalic'
  | 'inter'
  | 'inter-bold'
  | 'inter-italic'
  | 'inter-bolditalic'
  | 'lora'
  | 'lora-bold'
  | 'lora-italic'
  | 'lora-bolditalic'
  | 'roboto-mono'
  | 'roboto-mono-bold'
  | 'roboto-mono-italic'
  | 'roboto-mono-bolditalic'
  | 'oswald'
  | 'oswald-bold'

export const TEXT_FONTS: TextFont[] = [
  'helvetica',
  'helvetica-bold',
  'helvetica-italic',
  'helvetica-bolditalic',
  'times',
  'times-bold',
  'times-italic',
  'times-bolditalic',
  'courier',
  'courier-bold',
  'courier-italic',
  'courier-bolditalic',
  'inter',
  'inter-bold',
  'inter-italic',
  'inter-bolditalic',
  'lora',
  'lora-bold',
  'lora-italic',
  'lora-bolditalic',
  'roboto-mono',
  'roboto-mono-bold',
  'roboto-mono-italic',
  'roboto-mono-bolditalic',
  'oswald',
  'oswald-bold',
]

/** Index 0 is character 32, index 94 is character 126. */
export const FIRST_CODE = 32

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
  'helvetica': { label: "Helvetica", cssFamily: "Helvetica", cssStack: "Helvetica, Arial, sans-serif", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'helvetica', pdfStyle: 'normal' },
  'helvetica-bold': { label: "Helvetica bold", cssFamily: "Helvetica", cssStack: "Helvetica, Arial, sans-serif", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'helvetica', pdfStyle: 'bold' },
  'helvetica-italic': { label: "Helvetica italic", cssFamily: "Helvetica", cssStack: "Helvetica, Arial, sans-serif", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'helvetica', pdfStyle: 'italic' },
  'helvetica-bolditalic': { label: "Helvetica bolditalic", cssFamily: "Helvetica", cssStack: "Helvetica, Arial, sans-serif", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'helvetica', pdfStyle: 'bolditalic' },
  'times': { label: "Times", cssFamily: "Times New Roman", cssStack: "\"Times New Roman\", Times, serif", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'times', pdfStyle: 'normal' },
  'times-bold': { label: "Times bold", cssFamily: "Times New Roman", cssStack: "\"Times New Roman\", Times, serif", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'times', pdfStyle: 'bold' },
  'times-italic': { label: "Times italic", cssFamily: "Times New Roman", cssStack: "\"Times New Roman\", Times, serif", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'times', pdfStyle: 'italic' },
  'times-bolditalic': { label: "Times bolditalic", cssFamily: "Times New Roman", cssStack: "\"Times New Roman\", Times, serif", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'times', pdfStyle: 'bolditalic' },
  'courier': { label: "Courier", cssFamily: "Courier New", cssStack: "\"Courier New\", Courier, monospace", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'courier', pdfStyle: 'normal' },
  'courier-bold': { label: "Courier bold", cssFamily: "Courier New", cssStack: "\"Courier New\", Courier, monospace", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'courier', pdfStyle: 'bold' },
  'courier-italic': { label: "Courier italic", cssFamily: "Courier New", cssStack: "\"Courier New\", Courier, monospace", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'courier', pdfStyle: 'italic' },
  'courier-bolditalic': { label: "Courier bolditalic", cssFamily: "Courier New", cssStack: "\"Courier New\", Courier, monospace", cssWeight: 'normal', cssStyle: 'normal', pdfFamily: 'courier', pdfStyle: 'bolditalic' },
  'inter': { label: "Inter", cssFamily: "InterTrim", cssStack: "InterTrim, Helvetica, Arial, sans-serif", cssWeight: '400', cssStyle: 'normal', pdfFamily: "Inter", pdfStyle: 'normal', file: '/fonts/inter.ttf' },
  'inter-bold': { label: "Inter Bold", cssFamily: "InterTrim", cssStack: "InterTrim, Helvetica, Arial, sans-serif", cssWeight: '700', cssStyle: 'normal', pdfFamily: "Inter", pdfStyle: 'bold', file: '/fonts/inter-bold.ttf' },
  'inter-italic': { label: "Inter Italic", cssFamily: "InterTrim", cssStack: "InterTrim, Helvetica, Arial, sans-serif", cssWeight: '400', cssStyle: 'italic', pdfFamily: "Inter", pdfStyle: 'italic', file: '/fonts/inter-italic.ttf' },
  'inter-bolditalic': { label: "Inter Bold Italic", cssFamily: "InterTrim", cssStack: "InterTrim, Helvetica, Arial, sans-serif", cssWeight: '700', cssStyle: 'italic', pdfFamily: "Inter", pdfStyle: 'bolditalic', file: '/fonts/inter-bolditalic.ttf' },
  'lora': { label: "Lora", cssFamily: "LoraTrim", cssStack: "LoraTrim, Georgia, 'Times New Roman', serif", cssWeight: '400', cssStyle: 'normal', pdfFamily: "Lora", pdfStyle: 'normal', file: '/fonts/lora.ttf' },
  'lora-bold': { label: "Lora Bold", cssFamily: "LoraTrim", cssStack: "LoraTrim, Georgia, 'Times New Roman', serif", cssWeight: '700', cssStyle: 'normal', pdfFamily: "Lora", pdfStyle: 'bold', file: '/fonts/lora-bold.ttf' },
  'lora-italic': { label: "Lora Italic", cssFamily: "LoraTrim", cssStack: "LoraTrim, Georgia, 'Times New Roman', serif", cssWeight: '400', cssStyle: 'italic', pdfFamily: "Lora", pdfStyle: 'italic', file: '/fonts/lora-italic.ttf' },
  'lora-bolditalic': { label: "Lora Bold Italic", cssFamily: "LoraTrim", cssStack: "LoraTrim, Georgia, 'Times New Roman', serif", cssWeight: '700', cssStyle: 'italic', pdfFamily: "Lora", pdfStyle: 'bolditalic', file: '/fonts/lora-bolditalic.ttf' },
  'roboto-mono': { label: "Roboto Mono", cssFamily: "RobotoMonoTrim", cssStack: "RobotoMonoTrim, 'Courier New', Courier, monospace", cssWeight: '400', cssStyle: 'normal', pdfFamily: "Roboto Mono", pdfStyle: 'normal', file: '/fonts/roboto-mono.ttf' },
  'roboto-mono-bold': { label: "Roboto Mono Bold", cssFamily: "RobotoMonoTrim", cssStack: "RobotoMonoTrim, 'Courier New', Courier, monospace", cssWeight: '700', cssStyle: 'normal', pdfFamily: "Roboto Mono", pdfStyle: 'bold', file: '/fonts/roboto-mono-bold.ttf' },
  'roboto-mono-italic': { label: "Roboto Mono Italic", cssFamily: "RobotoMonoTrim", cssStack: "RobotoMonoTrim, 'Courier New', Courier, monospace", cssWeight: '400', cssStyle: 'italic', pdfFamily: "Roboto Mono", pdfStyle: 'italic', file: '/fonts/roboto-mono-italic.ttf' },
  'roboto-mono-bolditalic': { label: "Roboto Mono Bold Italic", cssFamily: "RobotoMonoTrim", cssStack: "RobotoMonoTrim, 'Courier New', Courier, monospace", cssWeight: '700', cssStyle: 'italic', pdfFamily: "Roboto Mono", pdfStyle: 'bolditalic', file: '/fonts/roboto-mono-bolditalic.ttf' },
  'oswald': { label: "Oswald", cssFamily: "OswaldTrim", cssStack: "OswaldTrim, Impact, 'Arial Narrow', sans-serif", cssWeight: '400', cssStyle: 'normal', pdfFamily: "Oswald", pdfStyle: 'normal', file: '/fonts/oswald.ttf' },
  'oswald-bold': { label: "Oswald Bold", cssFamily: "OswaldTrim", cssStack: "OswaldTrim, Impact, 'Arial Narrow', sans-serif", cssWeight: '700', cssStyle: 'normal', pdfFamily: "Oswald", pdfStyle: 'bold', file: '/fonts/oswald-bold.ttf' },
}

/** Advance width of every printable ASCII character, in thousandths of an em. */
export const FONT_ADVANCES: Record<TextFont, number[]> = {
  'helvetica': [280, 280, 350, 550, 550, 890, 660, 190, 330, 330, 390, 580, 280, 330, 280, 280, 550, 550, 550, 550,
    550, 550, 550, 550, 550, 550, 280, 280, 580, 580, 580, 550, 1010, 660, 660, 720, 720, 660, 610, 780,
    720, 280, 500, 660, 550, 830, 720, 780, 660, 780, 720, 660, 610, 720, 660, 940, 660, 660, 610, 280,
    280, 280, 470, 550, 330, 550, 550, 500, 550, 550, 280, 550, 550, 220, 220, 500, 220, 830, 550, 550,
    550, 550, 330, 500, 280, 550, 500, 720, 500, 500, 500, 330, 260, 330, 580,],
  'helvetica-bold': [280, 330, 470, 550, 550, 890, 720, 240, 330, 330, 390, 580, 280, 330, 280, 280, 550, 550, 550, 550,
    550, 550, 550, 550, 550, 550, 330, 330, 580, 580, 580, 610, 970, 720, 720, 720, 720, 660, 610, 780,
    720, 280, 550, 720, 610, 830, 720, 780, 660, 780, 720, 660, 610, 720, 660, 940, 660, 660, 610, 330,
    280, 330, 580, 550, 330, 550, 610, 550, 610, 550, 330, 610, 610, 280, 280, 550, 280, 890, 610, 610,
    610, 610, 390, 550, 330, 610, 550, 780, 550, 550, 500, 390, 280, 390, 580,],
  'helvetica-italic': [280, 280, 350, 550, 550, 890, 660, 190, 330, 330, 390, 580, 280, 330, 280, 280, 550, 550, 550, 550,
    550, 550, 550, 550, 550, 550, 280, 280, 580, 580, 580, 550, 1010, 660, 660, 720, 720, 660, 610, 780,
    720, 280, 500, 660, 550, 830, 720, 780, 660, 780, 720, 660, 610, 720, 660, 940, 660, 660, 610, 280,
    280, 280, 470, 550, 330, 550, 550, 500, 550, 550, 280, 550, 550, 220, 220, 500, 220, 830, 550, 550,
    550, 550, 330, 500, 280, 550, 500, 720, 500, 500, 500, 330, 260, 330, 580,],
  'helvetica-bolditalic': [280, 330, 470, 550, 550, 890, 720, 240, 330, 330, 390, 580, 280, 330, 280, 280, 550, 550, 550, 550,
    550, 550, 550, 550, 550, 550, 330, 330, 580, 580, 580, 610, 970, 720, 720, 720, 720, 660, 610, 780,
    720, 280, 550, 720, 610, 830, 720, 780, 660, 780, 720, 660, 610, 720, 660, 940, 660, 660, 610, 330,
    280, 330, 580, 550, 330, 550, 610, 550, 610, 550, 330, 610, 610, 280, 280, 550, 280, 890, 610, 610,
    610, 610, 390, 550, 330, 610, 550, 780, 550, 550, 500, 390, 280, 390, 580,],
  'times': [250, 330, 410, 500, 500, 830, 780, 180, 330, 330, 500, 560, 250, 330, 250, 280, 500, 500, 500, 500,
    500, 500, 500, 500, 500, 500, 280, 280, 560, 560, 560, 440, 920, 720, 660, 660, 720, 610, 550, 720,
    720, 330, 390, 720, 610, 890, 720, 720, 550, 720, 660, 550, 610, 720, 720, 940, 720, 720, 610, 330,
    280, 330, 470, 500, 330, 440, 500, 440, 500, 440, 330, 500, 500, 280, 280, 500, 280, 780, 500, 500,
    500, 500, 330, 390, 280, 500, 500, 720, 500, 500, 440, 480, 200, 480, 540,],
  'times-bold': [250, 330, 550, 500, 500, 1000, 830, 280, 330, 330, 500, 570, 250, 330, 250, 280, 500, 500, 500, 500,
    500, 500, 500, 500, 500, 500, 330, 330, 570, 570, 570, 500, 930, 720, 660, 720, 720, 660, 610, 780,
    780, 390, 500, 780, 660, 940, 720, 780, 610, 780, 720, 550, 660, 720, 720, 1000, 720, 720, 660, 330,
    280, 330, 580, 500, 330, 500, 550, 440, 550, 440, 330, 500, 550, 280, 330, 550, 280, 830, 550, 500,
    550, 550, 440, 390, 330, 550, 500, 720, 500, 500, 440, 390, 220, 390, 520,],
  'times-italic': [250, 330, 420, 500, 500, 830, 780, 210, 330, 330, 500, 670, 250, 330, 250, 280, 500, 500, 500, 500,
    500, 500, 500, 500, 500, 500, 330, 330, 670, 670, 670, 500, 920, 610, 610, 660, 720, 610, 610, 720,
    720, 330, 440, 660, 550, 830, 660, 720, 610, 720, 610, 500, 550, 720, 610, 830, 610, 550, 550, 390,
    280, 390, 420, 500, 330, 500, 500, 440, 500, 440, 280, 500, 500, 280, 280, 440, 280, 720, 500, 500,
    500, 500, 390, 390, 280, 500, 440, 660, 440, 440, 390, 400, 270, 400, 540,],
  'times-bolditalic': [250, 390, 550, 500, 500, 830, 780, 280, 330, 330, 500, 570, 250, 330, 250, 280, 500, 500, 500, 500,
    500, 500, 500, 500, 500, 500, 330, 330, 570, 570, 570, 500, 830, 660, 660, 660, 720, 660, 660, 720,
    780, 390, 500, 660, 610, 890, 720, 720, 610, 720, 660, 550, 610, 720, 660, 890, 660, 610, 610, 330,
    280, 330, 570, 500, 330, 500, 500, 440, 500, 440, 330, 500, 550, 280, 280, 500, 280, 780, 550, 500,
    500, 500, 390, 390, 280, 550, 440, 660, 500, 440, 390, 350, 220, 350, 570,],
  'courier': [600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,],
  'courier-bold': [600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,],
  'courier-italic': [600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,],
  'courier-bolditalic': [600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,],
  'inter': [281, 288, 466, 633, 642, 982, 644, 300, 365, 365, 501, 662, 288, 460, 288, 360, 631, 407, 610, 618,
    646, 593, 620, 566, 619, 620, 288, 302, 662, 662, 662, 511, 966, 690, 654, 730, 722, 601, 590, 746,
    743, 269, 571, 672, 565, 903, 753, 765, 639, 765, 644, 642, 646, 744, 690, 985, 682, 679, 629, 365,
    360, 365, 471, 456, 323, 562, 612, 571, 612, 583, 370, 613, 591, 242, 242, 549, 242, 876, 591, 600,
    612, 612, 376, 528, 327, 591, 562, 818, 546, 562, 552, 426, 333, 426, 662,],
  'inter-bold': [237, 338, 552, 649, 655, 1016, 672, 339, 377, 377, 559, 679, 334, 468, 334, 388, 674, 431, 630, 646,
    676, 622, 649, 582, 651, 649, 334, 343, 679, 679, 679, 560, 1016, 747, 662, 740, 722, 607, 587, 750,
    747, 281, 584, 719, 565, 932, 762, 771, 648, 777, 657, 655, 667, 732, 747, 1038, 738, 731, 664, 377,
    388, 377, 487, 476, 365, 581, 630, 588, 630, 596, 398, 632, 623, 271, 271, 580, 271, 913, 623, 613,
    630, 630, 407, 560, 366, 623, 600, 850, 580, 602, 573, 469, 372, 469, 679,],
  'inter-italic': [281, 288, 466, 633, 641, 982, 689, 300, 365, 364, 501, 662, 288, 461, 288, 360, 630, 407, 610, 617,
    647, 592, 619, 567, 617, 619, 288, 301, 662, 662, 662, 511, 964, 690, 654, 730, 721, 602, 590, 746,
    743, 269, 571, 672, 565, 903, 753, 765, 639, 765, 644, 641, 646, 744, 690, 985, 682, 679, 630, 365,
    359, 365, 471, 456, 322, 614, 613, 572, 613, 576, 373, 613, 591, 243, 242, 549, 242, 876, 591, 600,
    613, 613, 377, 527, 328, 592, 562, 818, 546, 562, 552, 427, 333, 427, 662,],
  'inter-bolditalic': [237, 337, 552, 649, 654, 1016, 691, 339, 377, 373, 559, 679, 334, 468, 334, 388, 674, 432, 630, 646,
    677, 622, 649, 582, 650, 649, 334, 342, 679, 679, 679, 559, 1015, 747, 662, 740, 722, 613, 587, 750,
    747, 281, 584, 719, 565, 932, 762, 771, 648, 771, 657, 654, 668, 732, 747, 1038, 738, 731, 665, 377,
    386, 377, 487, 476, 365, 631, 630, 588, 630, 590, 410, 632, 623, 271, 271, 580, 271, 913, 623, 614,
    630, 630, 408, 560, 367, 623, 600, 850, 580, 602, 573, 469, 372, 469, 679,],
  'lora': [263, 266, 346, 830, 529, 870, 695, 208, 305, 305, 520, 530, 253, 489, 246, 690, 621, 364, 537, 557,
    542, 545, 578, 461, 562, 578, 250, 263, 530, 530, 530, 474, 796, 626, 622, 699, 745, 622, 548, 761,
    780, 335, 373, 683, 578, 918, 762, 794, 606, 796, 628, 567, 640, 752, 653, 995, 649, 634, 610, 359,
    690, 359, 823, 729, 252, 516, 582, 532, 598, 542, 338, 553, 599, 281, 261, 537, 272, 894, 607, 585,
    597, 576, 433, 463, 387, 597, 505, 801, 530, 528, 511, 334, 231, 334, 530,],
  'lora-bold': [263, 258, 326, 871, 588, 904, 670, 188, 296, 296, 533, 530, 250, 471, 233, 699, 636, 406, 533, 560,
    547, 540, 575, 469, 572, 576, 250, 267, 530, 530, 530, 503, 793, 668, 661, 688, 759, 624, 571, 754,
    807, 387, 451, 712, 604, 972, 773, 769, 639, 770, 686, 598, 650, 760, 708, 1016, 699, 667, 604, 386,
    699, 386, 823, 832, 524, 524, 573, 518, 596, 538, 369, 557, 621, 327, 302, 594, 312, 920, 638, 566,
    601, 573, 480, 485, 413, 618, 538, 811, 548, 551, 514, 368, 259, 368, 530,],
  'lora-italic': [263, 272, 356, 808, 529, 873, 683, 199, 298, 298, 513, 530, 237, 483, 232, 654, 597, 354, 525, 545,
    527, 523, 554, 452, 564, 552, 250, 271, 530, 530, 530, 473, 792, 631, 619, 686, 738, 619, 541, 753,
    773, 333, 367, 667, 577, 917, 762, 788, 597, 788, 625, 566, 636, 744, 665, 994, 652, 641, 612, 361,
    785, 361, 823, 710, 240, 548, 511, 473, 555, 477, 325, 518, 572, 324, 287, 520, 283, 876, 615, 521,
    571, 518, 455, 428, 364, 593, 526, 801, 545, 514, 471, 332, 235, 332, 530,],
  'lora-bolditalic': [263, 255, 324, 842, 570, 885, 685, 188, 296, 296, 512, 530, 249, 473, 233, 665, 625, 397, 522, 546,
    533, 529, 560, 460, 562, 561, 250, 270, 530, 530, 530, 485, 767, 667, 659, 690, 755, 623, 566, 756,
    802, 384, 445, 711, 606, 970, 772, 762, 632, 764, 681, 600, 648, 755, 702, 1010, 700, 665, 603, 388,
    792, 388, 823, 835, 277, 549, 513, 467, 564, 470, 353, 520, 574, 344, 323, 518, 303, 878, 610, 515,
    575, 522, 459, 446, 395, 598, 523, 795, 543, 561, 491, 345, 234, 345, 530,],
  'roboto-mono': [600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,],
  'roboto-mono-bold': [600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
    600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,],
  'roboto-mono-italic': [587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,
    587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,
    587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,
    587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,
    587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,],
  'roboto-mono-bolditalic': [587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,
    587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,
    587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,
    587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,
    587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587, 587,],
  'oswald': [229, 208, 266, 486, 491, 891, 606, 127, 298, 260, 398, 415, 187, 303, 188, 369, 517, 378, 478, 477,
    483, 476, 503, 386, 499, 502, 197, 215, 373, 415, 373, 483, 904, 492, 524, 515, 527, 407, 391, 535,
    561, 248, 301, 495, 397, 660, 528, 539, 480, 541, 519, 473, 413, 543, 505, 729, 482, 481, 417, 340,
    369, 310, 443, 344, 278, 409, 447, 411, 442, 421, 287, 441, 445, 229, 230, 429, 229, 680, 439, 425,
    446, 443, 321, 374, 308, 440, 385, 588, 389, 392, 347, 300, 239, 321, 447,],
  'oswald-bold': [256, 257, 360, 534, 485, 1006, 570, 170, 338, 328, 423, 449, 238, 324, 244, 422, 550, 385, 514, 514,
    524, 509, 538, 439, 521, 538, 278, 285, 398, 442, 398, 483, 950, 551, 588, 563, 586, 447, 434, 582,
    610, 301, 349, 567, 443, 704, 561, 586, 571, 586, 600, 514, 445, 588, 526, 697, 515, 493, 433, 332,
    422, 324, 476, 368, 307, 460, 506, 468, 503, 470, 320, 502, 509, 265, 269, 510, 274, 753, 507, 483,
    505, 504, 383, 424, 351, 504, 421, 597, 442, 448, 392, 374, 262, 379, 481,],
}
