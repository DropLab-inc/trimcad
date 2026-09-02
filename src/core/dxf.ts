import DxfParser from 'dxf-parser'
import Drawing from 'dxf-writer'
import type { CadEntity, DrawingDocument } from './types'
import { uid } from './geometry'

export const exportDocumentToDxf = (document: DrawingDocument): string => {
  const drawing = new Drawing()
  for (const layer of document.layers) {
    drawing.addLayer(layer.name, Drawing.ACI.WHITE, 'CONTINUOUS')
  }
  drawing.setActiveLayer(document.layers[0]?.name ?? '0')

  for (const entity of document.entities) {
    addEntity(drawing, entity)
  }
  return drawing.toDxfString()
}

const addEntity = (drawing: any, entity: CadEntity) => {
  switch (entity.type) {
    case 'line':
      drawing.drawLine(entity.start.x, entity.start.y, entity.end.x, entity.end.y)
      return
    case 'circle':
      drawing.drawCircle(entity.center.x, entity.center.y, entity.radius)
      return
    case 'arc':
      drawing.drawArc(
        entity.center.x,
        entity.center.y,
        entity.radius,
        (entity.startAngle * 180) / Math.PI,
        (entity.endAngle * 180) / Math.PI,
      )
      return
    case 'ellipse':
      drawing.drawEllipse(entity.center.x, entity.center.y, entity.rx, entity.ry, (entity.rotation * 180) / Math.PI)
      return
    case 'polyline':
      drawing.drawPolyline(entity.points.map((point) => [point.x, point.y]), entity.closed)
      return
    case 'spline':
      drawing.drawSpline(entity.controlPoints.map((point) => [point.x, point.y]))
      return
    case 'text':
      drawing.drawText(entity.position.x, entity.position.y, entity.height, 0, entity.value)
      return
    default:
      return
  }
}

export const importDocumentFromDxf = (content: string, base: DrawingDocument): DrawingDocument => {
  const parser = new DxfParser()
  const parsed = parser.parseSync(content) as any
  const entities: CadEntity[] = []

  for (const entity of (parsed?.entities ?? []) as any[]) {
    if (entity.type === 'LINE') {
      entities.push({
        id: uid(),
        type: 'line',
        layerId: base.layers[0].id,
        start: { x: entity.vertices[0].x, y: entity.vertices[0].y },
        end: { x: entity.vertices[1].x, y: entity.vertices[1].y },
      })
    } else if (entity.type === 'CIRCLE') {
      entities.push({
        id: uid(),
        type: 'circle',
        layerId: base.layers[0].id,
        center: { x: entity.center.x, y: entity.center.y },
        radius: entity.radius,
      })
    } else if (entity.type === 'LWPOLYLINE') {
      entities.push({
        id: uid(),
        type: 'polyline',
        layerId: base.layers[0].id,
        closed: Boolean(entity.shape),
        points: entity.vertices.map((vertex: { x: number; y: number }) => ({ x: vertex.x, y: vertex.y })),
      })
    }
  }

  return {
    ...base,
    entities,
  }
}
