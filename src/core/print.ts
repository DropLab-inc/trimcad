import { jsPDF } from 'jspdf'
import { flattenEntity, pointsOfEntity } from './flatten'
import { isLayerPlottable, layerOf, plottableEntities } from './layers'
import type { Vec2 } from './math/vec2'
import type { CadEntity, DrawingDocument, Layer } from './types'

type PrintScale = '1:1' | '1:2' | '1:10' | 'fit'

const scaleMap: Record<Exclude<PrintScale, 'fit'>, number> = {
  '1:1': 1,
  '1:2': 0.5,
  '1:10': 0.1,
}

const MARGIN_MM = 12
/** AutoCAD plots a lineweight of "Default" at 0.25 mm. */
const DEFAULT_LINEWEIGHT_MM = 0.25

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

/** An object's own colour wins, else the layer's, exactly as on screen. */
const colorOf = (document: DrawingDocument, entity: CadEntity): string =>
  entity.color ?? layerOf(document, entity)?.color ?? '#000000'

const lineweightOf = (layer: Layer | undefined): number => {
  const mm = layer?.lineweight ?? 0
  return mm > 0 ? mm : DEFAULT_LINEWEIGHT_MM
}

export const exportPdf = (document: DrawingDocument, scale: PrintScale = 'fit') => {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  const bounds = getBounds(document)
  const drawingW = Math.max(1e-6, bounds.maxX - bounds.minX)
  const drawingH = Math.max(1e-6, bounds.maxY - bounds.minY)
  const fitScale = Math.min((pageW - MARGIN_MM * 2) / drawingW, (pageH - MARGIN_MM * 2) / drawingH)
  const applied = scale === 'fit' ? fitScale : scaleMap[scale]

  // Drawing coordinates run up the page and PDF coordinates run down it, so y is flipped here.
  const toPage = (point: Vec2): [number, number] => [
    MARGIN_MM + (point.x - bounds.minX) * applied,
    pageH - MARGIN_MM - (point.y - bounds.minY) * applied,
  ]

  pdf.setLineJoin('round')
  pdf.setLineCap('round')

  for (const entity of plottableEntities(document)) {
    const layer = layerOf(document, entity)
    const [r, g, b] = plotColor(colorOf(document, entity))
    pdf.setDrawColor(r, g, b)
    pdf.setTextColor(r, g, b)
    // Lineweight is a plotted width in millimetres, so it does not change with the drawing scale.
    pdf.setLineWidth(lineweightOf(layer))

    if (entity.type === 'text') {
      const [x, y] = toPage(entity.position)
      pdf.setFontSize(entity.height * applied * (72 / 25.4))
      pdf.text(entity.value, x, y)
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

  pdf.save(`droplabcad-${scale}.pdf`)
}

const getBounds = (document: DrawingDocument) => {
  const points = document.entities
    .filter((entity) => isLayerPlottable(layerOf(document, entity)))
    .flatMap(pointsOfEntity)

  if (points.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}
