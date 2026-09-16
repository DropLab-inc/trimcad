import { jsPDF, type Matrix } from 'jspdf'
import { flattenEntity, pointsOfEntity } from './flatten'
import { effectiveStyleFor, faceOf, textLinesOf, textPoint, textStylesOf } from './text'
import { FONT_FACES, type TextFont } from './textMetrics'
import { isLayerPlottable, layerOf, plottableEntities } from './layers'
import type { Vec2 } from './math/vec2'
import type {
  CadEntity,
  DrawingDocument,
  Layer,
  Layout,
  LeaderEntity,
  MTextEntity,
  PaperOrientation,
  PaperSize,
  TextEntity,
  ToleranceEntity,
} from './types'

/** Paper sizes and orientations are part of the document model, so layouts can name them too. */
export type { PaperOrientation, PaperSize }

/** What region of the drawing is mapped onto the paper. */
export type PlotArea = 'extents' | 'display' | 'window' | 'selection'

/**
 * How drawing units relate to millimetres on the paper.
 * `fit` fills the printable area; the named ratios are paper:drawing (1:2 means half size).
 * `custom` uses `customScale` as drawing units per paper millimetre.
 */
export type PlotScaleMode = 'fit' | '1:1' | '1:2' | '1:5' | '1:10' | '1:20' | '1:50' | '1:100' | 'custom'

export type PrintBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type PrintOptions = {
  paper: PaperSize
  orientation: PaperOrientation
  area: PlotArea
  scaleMode: PlotScaleMode
  /** Drawing units that map to one millimetre on the paper when the scale is custom. */
  customScale: number
  center: boolean
  marginMm: number
  /** World rectangle used when the area is a window. */
  window: PrintBounds | null
}

/** The camera and the size of the viewport on screen, enough to rebuild the current display. */
export type ViewFrame = {
  camera: { x: number; y: number; zoom: number }
  width: number
  height: number
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  paper: 'a4',
  orientation: 'landscape',
  area: 'extents',
  scaleMode: 'fit',
  customScale: 1,
  center: true,
  marginMm: 12,
  window: null,
}

/** Paper sizes in millimetres, portrait. Landscape swaps the sides. */
export const PAPER_SIZES_MM: Record<PaperSize, { width: number; height: number; label: string }> = {
  a4: { width: 210, height: 297, label: 'ISO A4 (210 × 297 mm)' },
  a3: { width: 297, height: 420, label: 'ISO A3 (297 × 420 mm)' },
  a2: { width: 420, height: 594, label: 'ISO A2 (420 × 594 mm)' },
  a1: { width: 594, height: 841, label: 'ISO A1 (594 × 841 mm)' },
  letter: { width: 215.9, height: 279.4, label: 'Letter (8.5 × 11 in)' },
  legal: { width: 215.9, height: 355.6, label: 'Legal (8.5 × 14 in)' },
  tabloid: { width: 279.4, height: 431.8, label: 'Tabloid (11 × 17 in)' },
}

const NAMED_SCALES: Record<Exclude<PlotScaleMode, 'fit' | 'custom'>, number> = {
  '1:1': 1,
  '1:2': 2,
  '1:5': 5,
  '1:10': 10,
  '1:20': 20,
  '1:50': 50,
  '1:100': 100,
}

/** AutoCAD plots a lineweight of "Default" at 0.25 mm. */
const DEFAULT_LINEWEIGHT_MM = 0.25

/**
 * The scales a viewport may be set to, as drawing units per millimetre of paper: 50 shows the model
 * at 1:50. Deliberately restricted to the round numbers a drawing office uses, so a sheet always
 * reads at a real scale rather than something like 1:37. Both the viewport a new layout is born
 * with and the dropdown that changes it later come from this one list, so they cannot disagree.
 */
export const VIEWPORT_SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000]

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.replace(/./g, (char) => char + char) : clean.padEnd(6, '0')
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ]
}

/**
 * Paper is always white, whichever theme the drawing was made in, so a colour light enough to be
 * invisible on the page is plotted black. This is what AutoCAD does with white geometry under its
 * usual plot style, and it is what makes the default white layer plot at all.
 */
const plotColor = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.75 ? [0, 0, 0] : [r, g, b]
}

const colorOf = (document: DrawingDocument, entity: CadEntity): string =>
  entity.color ?? layerOf(document, entity)?.color ?? '#000000'

const lineweightOf = (layer: Layer | undefined): number => {
  const mm = layer?.lineweight ?? 0
  return mm > 0 ? mm : DEFAULT_LINEWEIGHT_MM
}

export const pageSizeMm = (
  paper: PaperSize,
  orientation: PaperOrientation,
): { width: number; height: number } => {
  const size = PAPER_SIZES_MM[paper]
  return orientation === 'landscape'
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height }
}

/** How many millimetres of paper one drawing unit occupies under a named or custom scale. */
export const scaleFactor = (options: PrintOptions): number | 'fit' => {
  if (options.scaleMode === 'fit') return 'fit'
  if (options.scaleMode === 'custom') {
    const unitsPerMm = Math.max(1e-9, options.customScale)
    return 1 / unitsPerMm
  }
  return 1 / NAMED_SCALES[options.scaleMode]
}

export const boundsOfPoints = (points: Vec2[]): PrintBounds => {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

/** The smallest rectangle that holds every plottable object. */
export const extentsBounds = (document: DrawingDocument): PrintBounds => {
  const points = document.entities
    .filter((entity) => isLayerPlottable(layerOf(document, entity)))
    .flatMap(pointsOfEntity)
  return boundsOfPoints(points)
}

/** What the camera can currently see, in drawing units. */
export const displayBounds = (view: ViewFrame): PrintBounds => {
  const { camera, width, height } = view
  const zoom = Math.max(1e-9, camera.zoom)
  return {
    minX: (0 - camera.x) / zoom,
    minY: (0 - camera.y) / zoom,
    maxX: (width - camera.x) / zoom,
    maxY: (height - camera.y) / zoom,
  }
}

export const selectionBounds = (document: DrawingDocument, selectedIds: string[]): PrintBounds | null => {
  if (selectedIds.length === 0) return null
  const chosen = new Set(selectedIds)
  const points = document.entities
    .filter((entity) => chosen.has(entity.id) && isLayerPlottable(layerOf(document, entity)))
    .flatMap(pointsOfEntity)
  if (points.length === 0) return null
  return boundsOfPoints(points)
}

export const normalizeBounds = (a: Vec2, b: Vec2): PrintBounds => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y),
})

/**
 * Resolves which world rectangle will be plotted. Returns null when the chosen area cannot be
 * made — a window that has not been picked yet, or a selection with nothing in it.
 */
export const resolvePlotBounds = (
  document: DrawingDocument,
  options: PrintOptions,
  view: ViewFrame,
  selectedIds: string[],
): PrintBounds | null => {
  switch (options.area) {
    case 'extents':
      return extentsBounds(document)
    case 'display':
      return displayBounds(view)
    case 'window':
      return options.window
    case 'selection':
      return selectionBounds(document, selectedIds)
  }
}

export type PlotLayout = {
  pageW: number
  pageH: number
  margin: number
  printableW: number
  printableH: number
  bounds: PrintBounds
  /** Millimetres of paper per drawing unit. */
  applied: number
  offsetX: number
  offsetY: number
}

/** Where the drawing lands on the page, without yet writing a PDF. */
export const layoutPlot = (bounds: PrintBounds, options: PrintOptions): PlotLayout => {
  const page = pageSizeMm(options.paper, options.orientation)
  const margin = Math.max(0, Math.min(options.marginMm, Math.min(page.width, page.height) / 2 - 1))
  const printableW = Math.max(1e-6, page.width - margin * 2)
  const printableH = Math.max(1e-6, page.height - margin * 2)
  const drawingW = Math.max(1e-6, bounds.maxX - bounds.minX)
  const drawingH = Math.max(1e-6, bounds.maxY - bounds.minY)

  const factor = scaleFactor(options)
  const applied = factor === 'fit' ? Math.min(printableW / drawingW, printableH / drawingH) : factor

  const contentW = drawingW * applied
  const contentH = drawingH * applied
  const offsetX = options.center ? margin + (printableW - contentW) / 2 : margin
  const offsetY = options.center ? margin + (printableH - contentH) / 2 : margin

  return {
    pageW: page.width,
    pageH: page.height,
    margin,
    printableW,
    printableH,
    bounds,
    applied,
    offsetX,
    offsetY,
  }
}

/** A short phrase naming how the plot was scaled, for the command history. */
export const describeScale = (options: PrintOptions): string => {
  if (options.scaleMode === 'fit') return 'fit to page'
  if (options.scaleMode === 'custom') return `1:${options.customScale}`
  return options.scaleMode
}

export const describeArea = (options: PrintOptions): string => {
  switch (options.area) {
    case 'extents':
      return 'extents'
    case 'display':
      return 'display'
    case 'window':
      return 'window'
    case 'selection':
      return 'selection'
  }
}

/**
 * Builds the PDF and downloads it. Returns the layout that was used, or null when the chosen area
 * cannot be plotted (no window, empty selection).
 */
export const exportPdf = async (
  document: DrawingDocument,
  options: PrintOptions = DEFAULT_PRINT_OPTIONS,
  view: ViewFrame,
  selectedIds: string[] = [],
  /** Override the download name; tests pass a no-op save by stubbing jsPDF instead. */
  fileName?: string,
): Promise<PlotLayout | null> => {
  const bounds = resolvePlotBounds(document, options, view, selectedIds)
  if (!bounds) return null

  const layout = layoutPlot(bounds, options)
  const pdf = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: [layout.pageW, layout.pageH],
  })
  // The shipped faces go in before anything is drawn: jsPDF has no such font until it is handed one.
  const fonts = await fontDataFor(document)
  registerFonts(pdf, fonts)

  // Drawing coordinates run up the page and PDF coordinates run down it, so y is flipped here.
  const toPage = (point: Vec2): [number, number] => [
    layout.offsetX + (point.x - bounds.minX) * layout.applied,
    layout.pageH - layout.offsetY - (point.y - bounds.minY) * layout.applied,
  ]

  pdf.setLineJoin('round')
  pdf.setLineCap('round')

  // Anything that lands outside the printable area is cut off, the way a plot window behaves.
  pdf.saveGraphicsState()
  pdf.rect(layout.margin, layout.margin, layout.printableW, layout.printableH)
  pdf.clip()
  pdf.discardPath()

  for (const entity of plottableEntities(document)) {
    const layer = layerOf(document, entity)
    const [r, g, b] = plotColor(colorOf(document, entity))
    pdf.setDrawColor(r, g, b)
    pdf.setTextColor(r, g, b)
    // Lineweight is a plotted width in millimetres, so it does not change with the drawing scale.
    pdf.setLineWidth(lineweightOf(layer))

    if (entity.type === 'text' || entity.type === 'mtext') {
      plotText(pdf, document, entity, toPage, 1 / layout.applied, fonts)
      continue
    }
    if (entity.type === 'leader') {
      plotLeader(pdf, entity, toPage, 1 / layout.applied)
      continue
    }
    if (entity.type === 'tolerance') {
      plotTolerance(pdf, entity, toPage, 1 / layout.applied)
      continue
    }

    for (const run of flattenEntity(entity)) {
      if (run.points.length < 2) continue
      const page = run.points.map(toPage)
      const [startX, startY] = page[0]
      // jsPDF takes a start point and then deltas between each following point.
      const deltas = page.slice(1).map(([x, y], index) => [x - page[index][0], y - page[index][1]] as [number, number])
      if (run.closed) {
        const [lastX, lastY] = page[page.length - 1]
        deltas.push([startX - lastX, startY - lastY])
      }
      pdf.lines(deltas, startX, startY)
    }
  }

  pdf.restoreGraphicsState()
  pdf.save(fileName ?? `trimcad-${options.paper}-${options.scaleMode}.pdf`)
  return layout
}

/**
 * Draws objects onto the page, mapping every drawing point through `toPage` and sizing text by the
 * space's own units per millimetre. Inside a viewport that is the viewport's scale; on the sheet
 * itself it is 1, because there a millimetre of drawing is a millimetre of paper.
 *
 * Shared by both passes so a sheet's own border and the model inside its viewports are drawn by the
 * same code — a line is a line wherever it lands, and the two can never disagree about lineweight,
 * colour or how a curve is flattened.
 */
/**
 * jsPDF's transformation matrix, as the six numbers a PDF `cm` operator carries.
 *
 * jsPDF only ever calls `toString()` on what it is handed here — that string becomes the operator — so
 * the numbers are the whole of it. The cast is because its own type asks for a full Matrix instance,
 * whose other seventeen fields this path never reads.
 */
const matrixOf = (a: number, b: number, c: number, d: number, e: number, f: number): Matrix =>
  ({ toString: () => `${a} ${b} ${c} ${d} ${e} ${f}` }) as unknown as Matrix

/**
 * Draws one text object or paragraph, in the style the drawing gives it.
 *
 * Rotation, width factor and oblique angle are one matrix rather than three adjustments, because they
 * all describe how the same run of glyphs is turned — and jsPDF places text inside the current
 * matrix, so setting it once per line puts the glyphs and their spacing in the same frame. The angle
 * is negated against the drawing's own: a drawing y runs down and a page y runs up, so a text that
 * turns one way on the canvas has to be turned the other way to look the same on paper.
 */
/**
 * A leader plots as its two segments plus its words — the same shape the canvas draws, sized by the
 * space's own units per millimetre like every other annotation.
 */
const plotLeader = (
  pdf: jsPDF,
  entity: LeaderEntity,
  toPage: (point: Vec2) => [number, number],
  unitsPerMm: number,
): void => {
  const height = entity.height / unitsPerMm
  const hook = { x: entity.landingEnd.x, y: entity.landingEnd.y + 3.5 * (entity.height / 2.5) }
  const [ax, ay] = toPage(entity.arrow)
  const [lx, ly] = toPage(entity.landingEnd)
  const [hx, hy] = toPage(hook)
  pdf.setLineWidth(0)
  pdf.lines([[lx - ax, ly - ay], [hx - lx, hy - ly]], ax, ay)
  pdf.setFontSize(height)
  const wordsWide = pdf.getTextWidth(entity.value)
  const anchorRight = entity.flipped ? lx < ax : lx >= ax
  pdf.text(entity.value, anchorRight ? lx + height * 0.4 : lx - height * 0.4 - wordsWide, hy)
}

/**
 * A tolerance frame plots as its compartments: boxes sized from the words, then the symbol, value
 * and datums centred in them. The frame is drawn to the same proportions the canvas draws.
 */
const plotTolerance = (
  pdf: jsPDF,
  entity: ToleranceEntity,
  toPage: (point: Vec2) => [number, number],
  unitsPerMm: number,
): void => {
  const h = entity.height / unitsPerMm
  const [px, py] = toPage(entity.position)
  const valueWidth = Math.max(h * 1.6, h * 0.85 * Math.max(1, entity.value.length))
  const datumWidth = entity.datums.reduce(
    (width, datum) => width + Math.max(h * 1.2, h * 0.85 * Math.max(1, datum.length)),
    0,
  )
  const symbolWidth = entity.symbol ? h * 1.4 : 0
  const total = symbolWidth + valueWidth + datumWidth
  let cursor = px - total / 2
  const boxes: Array<{ x: number; w: number; text: string }> = []
  if (entity.symbol) boxes.push({ x: cursor, w: symbolWidth, text: entity.symbol })
  cursor += symbolWidth
  boxes.push({ x: cursor, w: valueWidth, text: entity.value })
  cursor += valueWidth
  for (const datum of entity.datums) {
    boxes.push({ x: cursor, w: Math.max(h * 1.2, h * 0.85 * Math.max(1, datum.length)), text: datum })
    cursor += Math.max(h * 1.2, h * 0.85 * Math.max(1, datum.length))
  }
  pdf.setLineWidth(0)
  for (const box of boxes) {
    pdf.rect(box.x, py - h / 2, box.w, h)
    pdf.setFontSize(h * 0.85)
    pdf.text(box.text, box.x + box.w / 2, py + h * 0.35, { align: 'center' })
  }
}

const plotText = (
  pdf: jsPDF,
  document: DrawingDocument,
  entity: TextEntity | MTextEntity,
  toPage: (point: Vec2) => [number, number],
  unitsPerMm: number,
  /** The shipped faces handed to this document, by font key. */
  fonts: Map<string, string>,
): void => {
  const style = effectiveStyleFor(document, entity)
  const { lines, placement } = textLinesOf(entity, style)
  const face = faceOf(style.font)
  /*
   * A shipped face is only in the document once it has been handed over; without it jsPDF has no such
   * font and would throw. Falling back to the built-in keeps the plot coming out, and is the only case
   * where the face drawn is not the face the style names.
   */
  const drawable = face.file && !fonts.has(style.font) ? FONT_FACES.helvetica : face
  pdf.setFont(drawable.pdfFamily, drawable.pdfStyle)
  pdf.setFontSize((entity.height / unitsPerMm) * (72 / 25.4))

  const turn = ((entity.rotation ?? 0) * Math.PI) / 180
  const oblique = (style.obliqueAngle * Math.PI) / 180
  const wide = style.widthFactor
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const lean = Math.tan(oblique)
  const pageHeight = pdf.internal.pageSize.getHeight()
  // Page y runs down and the matrix' y runs up, so the flip jsPDF applies to a text position has to be
  // cancelled: the glyph is placed at the origin of the matrix and the matrix carries the position.
  const a = cos * wide
  const b = -sin * wide
  const c = cos * wide * lean + sin
  const d = -sin * wide * lean + cos

  lines.forEach((line, index) => {
    if (line === '') return
    const [px, py] = toPage(textPoint(entity, placement.starts[index]))
    pdf.saveGraphicsState()
    pdf.setCurrentTransformationMatrix(matrixOf(a, b, c, d, px, pageHeight - py))
    pdf.text(line, 0, pageHeight)
    pdf.restoreGraphicsState()
  })
}

/**
 * The faces a drawing uses that jsPDF cannot draw by itself, as base64 TTFs.
 *
 * jsPDF's five families are built in; the shipped ones have to be handed to the document before any
 * text is drawn, and the same file the canvas loads is the one embedded, so the two cannot disagree.
 * Fetched once per face and kept, so a plot of several sheets pays for it once.
 */
const fetchedFonts = new Map<string, string>()

const fontDataFor = async (document: DrawingDocument): Promise<Map<string, string>> => {
  const wanted = new Set<string>()
  for (const style of textStylesOf(document)) {
    if (FONT_FACES[style.font as TextFont]?.file) wanted.add(style.font)
  }

  const data = new Map<string, string>()
  for (const font of wanted) {
    const face = FONT_FACES[font as TextFont]
    let base64 = fetchedFonts.get(font)
    if (!base64) {
      const response = await fetch(face.file as string)
      const bytes = new Uint8Array(await response.arrayBuffer())
      let binary = ''
      // A TTF is bigger than a single `String.fromCharCode` spread can take.
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
      }
      base64 = btoa(binary)
      fetchedFonts.set(font, base64)
    }
    data.set(font, base64)
  }
  return data
}

/** Hands the plot's own document the faces it will draw with. */
const registerFonts = (pdf: jsPDF, fonts: Map<string, string>): void => {
  for (const [font, base64] of fonts) {
    const face = FONT_FACES[font as TextFont]
    const name = `${font}.ttf`
    pdf.addFileToVFS(name, base64)
    pdf.addFont(name, face.pdfFamily, face.pdfStyle)
  }
}

const plotEntities = (
  pdf: jsPDF,
  document: DrawingDocument,
  entities: CadEntity[],
  toPage: (point: Vec2) => [number, number],
  unitsPerMm: number,
  fonts: Map<string, string>,
): void => {
  for (const entity of entities) {
    const layer = layerOf(document, entity)
    const [r, g, b] = plotColor(colorOf(document, entity))
    pdf.setDrawColor(r, g, b)
    pdf.setTextColor(r, g, b)
    // Lineweight is a plotted width in millimetres, so it does not follow any scale.
    pdf.setLineWidth(lineweightOf(layer))

    if (entity.type === 'text' || entity.type === 'mtext') {
      plotText(pdf, document, entity, toPage, unitsPerMm, fonts)
      continue
    }
    if (entity.type === 'leader') {
      plotLeader(pdf, entity, toPage, unitsPerMm)
      continue
    }
    if (entity.type === 'tolerance') {
      plotTolerance(pdf, entity, toPage, unitsPerMm)
      continue
    }

    for (const run of flattenEntity(entity)) {
      if (run.points.length < 2) continue
      const pts = run.points.map(toPage)
      const [startX, startY] = pts[0]
      const deltas = pts
        .slice(1)
        .map(([x, y], index) => [x - pts[index][0], y - pts[index][1]] as [number, number])
      if (run.closed) {
        const [lastX, lastY] = pts[pts.length - 1]
        deltas.push([startX - lastX, startY - lastY])
      }
      pdf.lines(deltas, startX, startY)
    }
  }
}

/**
 * Plots a sheet.
 *
 * A layout is already composed at paper scale, so there is no area to choose and no scale to apply:
 * the page *is* the paper, and each viewport brings the model to it at its own scale. That is the
 * split AutoCAD makes between plotting model space and plotting a layout, and it is what takes the
 * guesswork out of issuing a drawing — nothing here has to be told how big the drawing is.
 */
export const exportLayoutPdf = async (
  document: DrawingDocument,
  layout: Layout,
  /** Override the download name; tests pass a no-op save by stubbing jsPDF instead. */
  fileName?: string,
): Promise<void> => {
  const page = pageSizeMm(layout.paper, layout.orientation)
  const pdf = new jsPDF({
    orientation: layout.orientation,
    unit: 'mm',
    format: [page.width, page.height],
  })
  const fonts = await fontDataFor(document)
  registerFonts(pdf, fonts)

  pdf.setLineJoin('round')
  pdf.setLineCap('round')

  for (const viewport of layout.viewports) {
    // Drawing units land on the sheet through the viewport's own scale. The sheet's y runs down the
    // page exactly as the canvas draws it — the same convention the DXF writer uses when it hands
    // coordinates over verbatim — so the sheet plots as composed.
    const toPage = (point: Vec2): [number, number] => {
      const mmX = viewport.center.x + (point.x - viewport.modelCenter.x) / viewport.unitsPerMm
      const mmY = viewport.center.y + (point.y - viewport.modelCenter.y) / viewport.unitsPerMm
      return [mmX, mmY]
    }

    pdf.saveGraphicsState()
    // Clip to the frame exactly as the canvas does, so a viewport can never bleed across the sheet.
    pdf.rect(
      viewport.center.x - viewport.widthMm / 2,
      viewport.center.y - viewport.heightMm / 2,
      viewport.widthMm,
      viewport.heightMm,
    )
    pdf.clip()
    pdf.discardPath()

    plotEntities(pdf, document, plottableEntities(document), toPage, viewport.unitsPerMm, fonts)

    pdf.restoreGraphicsState()
  }

  /*
   * The sheet's own objects go on last, at 1:1 and on top of the frames: a border, a title block and
   * notes are measured in the paper's millimetres and must not scale with any viewport. Drawing them
   * after the viewports is what lets a title block sit over a frame edge rather than under it.
   */
  plotEntities(
    pdf,
    document,
    plottableEntities({ ...document, entities: layout.entities }),
    (point) => [point.x, point.y],
    1,
    fonts,
  )

  const slug = layout.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  pdf.save(fileName ?? `trimcad-${slug || 'layout'}.pdf`)
}
