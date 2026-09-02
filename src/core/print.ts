import { jsPDF } from 'jspdf'
import type { DrawingDocument } from './types'

type PrintScale = '1:1' | '1:2' | '1:10' | 'fit'

const scaleMap: Record<Exclude<PrintScale, 'fit'>, number> = {
  '1:1': 1,
  '1:2': 0.5,
  '1:10': 0.1,
}

export const exportPdf = (document: DrawingDocument, scale: PrintScale = 'fit') => {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 12
  const bounds = getBounds(document)
  const drawingW = Math.max(1, bounds.maxX - bounds.minX)
  const drawingH = Math.max(1, bounds.maxY - bounds.minY)
  const fitScale = Math.min((pageW - margin * 2) / drawingW, (pageH - margin * 2) / drawingH)
  const appliedScale = scale === 'fit' ? fitScale : scaleMap[scale]

  for (const entity of document.entities) {
    if (entity.type === 'line') {
      pdf.line(
        margin + (entity.start.x - bounds.minX) * appliedScale,
        margin + (entity.start.y - bounds.minY) * appliedScale,
        margin + (entity.end.x - bounds.minX) * appliedScale,
        margin + (entity.end.y - bounds.minY) * appliedScale,
      )
    }
    if (entity.type === 'circle') {
      pdf.circle(
        margin + (entity.center.x - bounds.minX) * appliedScale,
        margin + (entity.center.y - bounds.minY) * appliedScale,
        entity.radius * appliedScale,
      )
    }
    if (entity.type === 'polyline') {
      for (let i = 0; i < entity.points.length - 1; i += 1) {
        const a = entity.points[i]
        const b = entity.points[i + 1]
        pdf.line(
          margin + (a.x - bounds.minX) * appliedScale,
          margin + (a.y - bounds.minY) * appliedScale,
          margin + (b.x - bounds.minX) * appliedScale,
          margin + (b.y - bounds.minY) * appliedScale,
        )
      }
    }
  }

  pdf.save(`droplabcad-${scale}.pdf`)
}

const getBounds = (document: DrawingDocument) => {
  let minX = 0
  let minY = 0
  let maxX = 100
  let maxY = 100
  const points = document.entities.flatMap((entity) => {
    if (entity.type === 'line') return [entity.start, entity.end]
    if (entity.type === 'circle') {
      return [
        { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
        { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius },
      ]
    }
    if (entity.type === 'polyline') return entity.points
    if (entity.type === 'text') return [entity.position]
    if (entity.type === 'dimension') return [entity.p1, entity.p2]
    return []
  })
  if (points.length > 0) {
    minX = Math.min(...points.map((point) => point.x))
    minY = Math.min(...points.map((point) => point.y))
    maxX = Math.max(...points.map((point) => point.x))
    maxY = Math.max(...points.map((point) => point.y))
  }
  return { minX, minY, maxX, maxY }
}
