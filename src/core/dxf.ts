import DxfParser from 'dxf-parser'
import Drawing from 'dxf-writer'
import type { Vec2 } from './math/vec2'
import type { CadEntity, DrawingDocument, Layer } from './types'
import { makeDefaultDocument } from './document'
import { ellipticalArcPoints, expandBulges, sampleBSpline } from './dxfCurves'
import { makeLayer, normalizeLayer } from './layers'
import { uid } from './geometry'

/** Marks the comment line carrying the full drawing. DXF readers ignore group code 999. */
const EMBED_TAG = 'DROPLABCAD-DOCUMENT:'

/**
 * DXF is the drawing's own save format, so the writer keeps layers and their colours and puts each
 * object back on the layer it was drawn on.
 *
 * DXF alone cannot describe everything the app holds: a layer's lineweight and its frozen and
 * locked flags have nowhere to go, and hatches, dimensions and groups have no equivalent at all.
 * So the whole document is written again into a comment, which other programs skip over and this
 * one reads back to restore the drawing exactly. The geometry is still written properly as DXF, so
 * the file remains a real DXF anywhere else.
 */
export const exportDocumentToDxf = (document: DrawingDocument): string => {
  const drawing = new Drawing()

  for (const layer of document.layers) {
    drawing.addLayer(layer.name, toAci(layer.color), linetypeNameFor(document, layer))
  }

  for (const entity of document.entities) {
    const layer = document.layers.find((candidate) => candidate.id === entity.layerId)
    drawing.setActiveLayer(layer?.name ?? document.layers[0]?.name ?? '0')
    addEntity(drawing, entity)
  }

  // JSON.stringify escapes newlines, so the whole document stays on the single line a comment needs.
  const embedded = JSON.stringify({ fingerprint: fingerprintOf(document.entities), document })
  return `999\n${EMBED_TAG}${embedded}\n${drawing.toDxfString()}`
}

/**
 * A short summary of the geometry, used to notice when a file has been edited by another program.
 * Only the shapes DXF can carry are counted, since those are the only ones that could have changed.
 */
const fingerprintOf = (entities: CadEntity[]): string => {
  const round = (value: number) => Math.round(value * 1000) / 1000
  return entities
    .filter((entity) => WRITABLE.has(entity.type))
    .map((entity) => {
      switch (entity.type) {
        case 'line':
          return `l:${round(entity.start.x)},${round(entity.start.y)},${round(entity.end.x)},${round(entity.end.y)}`
        case 'circle':
          return `c:${round(entity.center.x)},${round(entity.center.y)},${round(entity.radius)}`
        case 'arc':
          return `a:${round(entity.center.x)},${round(entity.center.y)},${round(entity.radius)}`
        case 'ellipse':
          return `e:${round(entity.center.x)},${round(entity.center.y)},${round(entity.rx)},${round(entity.ry)}`
        case 'polyline':
          return `p:${entity.points.length},${round(entity.points[0]?.x ?? 0)},${round(entity.points[0]?.y ?? 0)}`
        case 'spline':
          return `s:${entity.controlPoints.length}`
        case 'text':
          return `t:${entity.value}`
        default:
          return ''
      }
    })
    .join('|')
}

/**
 * Reads back the document written into the comment, but only if the DXF geometry still matches it.
 * If another program has moved or added something, the comment is stale and the DXF itself wins.
 */
const readEmbedded = (content: string, dxfEntities: CadEntity[]): DrawingDocument | null => {
  const start = content.indexOf(EMBED_TAG)
  if (start === -1) return null

  const end = content.indexOf('\n', start)
  const line = content.slice(start + EMBED_TAG.length, end === -1 ? undefined : end).trim()

  try {
    const parsed = JSON.parse(line) as { fingerprint?: string; document?: DrawingDocument }
    if (!parsed.document || !Array.isArray(parsed.document.entities)) return null
    if (parsed.fingerprint !== fingerprintOf(dxfEntities)) return null
    return parsed.document
  } catch {
    return null
  }
}

/** Entity types the DXF writer cannot carry, counted by type for a warning before saving. */
export const unsupportedForDxf = (document: DrawingDocument): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const entity of document.entities) {
    if (WRITABLE.has(entity.type)) continue
    counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1)
  }
  return counts
}

const WRITABLE = new Set(['line', 'circle', 'arc', 'ellipse', 'polyline', 'spline', 'text'])

const linetypeNameFor = (document: DrawingDocument, layer: Layer): string => {
  const linetype = document.linetypes.find((candidate) => candidate.id === layer.linetypeId)
  return (linetype?.name ?? 'Continuous').toUpperCase()
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
      drawing.drawPolyline(
        entity.points.map((point) => [point.x, point.y]),
        entity.closed,
      )
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

/**
 * Reads a DXF into a whole drawing: layers first, with their colours, then every entity onto the
 * layer it names. `base` supplies the linetypes and dimension style, which DXF does not carry.
 */
export const importDocumentFromDxf = (content: string, base: DrawingDocument): DrawingDocument => {
  const parser = new DxfParser()
  const parsed = parser.parseSync(content) as any

  const layers = readLayers(parsed, base)
  const byName = new Map(layers.map((layer) => [layer.name.toUpperCase(), layer.id]))
  const fallbackLayerId = layers[0].id
  const layerIdFor = (name: unknown): string =>
    (typeof name === 'string' ? byName.get(name.toUpperCase()) : undefined) ?? fallbackLayerId

  const entities: CadEntity[] = []
  for (const raw of (parsed?.entities ?? []) as any[]) {
    const entity = readEntity(raw, layerIdFor(raw.layer))
    if (entity) entities.push(entity)
  }

  // A file this app wrote carries the whole drawing, including everything DXF has no room for.
  const embedded = readEmbedded(content, entities)
  if (embedded) {
    return {
      ...base,
      ...embedded,
      layers: embedded.layers.map((layer) => normalizeLayer(layer, base.linetypes[0]?.id ?? 'lt-continuous')),
    }
  }

  return { ...base, layers, entities, groups: [] }
}

const readLayers = (parsed: any, base: DrawingDocument): Layer[] => {
  const table = parsed?.tables?.layer?.layers as Record<string, any> | undefined
  const linetypeId = base.linetypes[0]?.id ?? 'lt-continuous'
  if (!table) return base.layers.length > 0 ? base.layers : makeDefaultDocument().layers

  const layers = Object.values(table).map((layer: any) =>
    makeLayer(uid(), String(layer.name ?? '0'), linetypeId, fromAci(layer.colorIndex ?? layer.color)),
  )
  return layers.length > 0 ? layers : makeDefaultDocument().layers
}

const readEntity = (raw: any, layerId: string): CadEntity | null => {
  switch (raw.type) {
    case 'LINE':
      if (!raw.vertices?.[0] || !raw.vertices?.[1]) return null
      return {
        id: uid(),
        type: 'line',
        layerId,
        start: { x: raw.vertices[0].x, y: raw.vertices[0].y },
        end: { x: raw.vertices[1].x, y: raw.vertices[1].y },
      }
    case 'CIRCLE':
      return {
        id: uid(),
        type: 'circle',
        layerId,
        center: { x: raw.center.x, y: raw.center.y },
        radius: raw.radius,
      }
    case 'ARC':
      return {
        id: uid(),
        type: 'arc',
        layerId,
        center: { x: raw.center.x, y: raw.center.y },
        radius: raw.radius,
        // dxf-parser hands back radians for an arc's limits, unlike the degrees DXF stores.
        startAngle: raw.startAngle ?? 0,
        endAngle: raw.endAngle ?? Math.PI * 2,
      }
    case 'ELLIPSE': {
      const major = { x: raw.majorAxisEndPoint?.x ?? 1, y: raw.majorAxisEndPoint?.y ?? 0 }
      const center = { x: raw.center.x, y: raw.center.y }
      const ratio = raw.axisRatio ?? 1
      const start = raw.startAngle ?? 0
      const end = raw.endAngle ?? Math.PI * 2
      const isFull = Math.abs(Math.abs(end - start) - Math.PI * 2) < 1e-6

      // Only a whole ellipse fits the ellipse entity; a partial one is kept as its traced outline.
      if (!isFull) {
        return {
          id: uid(),
          type: 'polyline',
          layerId,
          closed: false,
          points: ellipticalArcPoints(center, major, ratio, start, end),
        }
      }

      const rx = Math.hypot(major.x, major.y)
      return {
        id: uid(),
        type: 'ellipse',
        layerId,
        center,
        rx,
        ry: rx * ratio,
        rotation: Math.atan2(major.y, major.x),
      }
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      if (!Array.isArray(raw.vertices) || raw.vertices.length < 2) return null
      const closed = Boolean(raw.shape ?? raw.closed)
      // Bulges turn polyline segments into arcs; without this they arrive as straight chords.
      const points = expandBulges(raw.vertices, closed)
      if (points.length < 2) return null
      return { id: uid(), type: 'polyline', layerId, closed, points }
    }
    case 'SPLINE': {
      // Fit points sit on the curve, which is exactly what this app's splines are drawn through.
      if (Array.isArray(raw.fitPoints) && raw.fitPoints.length >= 2) {
        return {
          id: uid(),
          type: 'spline',
          layerId,
          controlPoints: raw.fitPoints.map((point: Vec2) => ({ x: point.x, y: point.y })),
        }
      }

      if (!Array.isArray(raw.controlPoints) || raw.controlPoints.length < 2) return null
      const control = raw.controlPoints.map((point: Vec2) => ({ x: point.x, y: point.y }))
      const sampled = sampleBSpline(control, raw.degreeOfSplineCurve ?? 3, raw.knotValues)

      return {
        id: uid(),
        type: 'spline',
        layerId,
        controlPoints: sampled.length >= 2 ? sampled : control,
      }
    }
    case 'TEXT':
    case 'MTEXT':
      return {
        id: uid(),
        type: 'text',
        layerId,
        position: { x: raw.startPoint?.x ?? raw.position?.x ?? 0, y: raw.startPoint?.y ?? raw.position?.y ?? 0 },
        value: String(raw.text ?? ''),
        height: raw.textHeight ?? raw.height ?? 12,
      }
    default:
      return null
  }
}

/** AutoCAD's first nine index colours, which is what the layer palette offers. */
const ACI: Array<[number, string]> = [
  [1, '#ff0000'],
  [2, '#ffff00'],
  [3, '#00ff00'],
  [4, '#00ffff'],
  [5, '#0000ff'],
  [6, '#ff00ff'],
  [7, '#ffffff'],
  [8, '#808080'],
  [9, '#c0c0c0'],
]

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.replace(/./g, (char) => char + char) : clean.padEnd(6, '0')
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

/** Nearest index colour, since DXF layers carry an ACI number rather than a hex value. */
const toAci = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex)
  let best = 7
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [index, candidate] of ACI) {
    const [cr, cg, cb] = hexToRgb(candidate)
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

const fromAci = (index: unknown): string => {
  if (typeof index === 'number') {
    const match = ACI.find(([aci]) => aci === index)
    if (match) return match[1]
    // Anything outside the small palette arrives as a packed RGB value.
    if (index > 255) return `#${(index & 0xffffff).toString(16).padStart(6, '0')}`
  }
  return '#7cc6ff'
}
