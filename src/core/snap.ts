import { midpoint, pointSegmentDistance, polar } from './geometry'
import { distance } from './math/vec2'
import type { CadEntity, SnapMode } from './types'
import type { Vec2 } from './math/vec2'

export type SnapCandidate = {
  point: Vec2
  mode: SnapMode
  distance: number
}

const fromLine = (entity: Extract<CadEntity, { type: 'line' }>, mode: SnapMode): Vec2[] => {
  switch (mode) {
    case 'endpoint':
      return [entity.start, entity.end]
    case 'midpoint':
      return [midpoint(entity.start, entity.end)]
    case 'nearest':
      return [entity.start, midpoint(entity.start, entity.end), entity.end]
    default:
      return []
  }
}

const fromCircle = (entity: Extract<CadEntity, { type: 'circle' }>, mode: SnapMode): Vec2[] => {
  switch (mode) {
    case 'center':
      return [entity.center]
    case 'quadrant':
      return [
        polar(entity.center, entity.radius, 0),
        polar(entity.center, entity.radius, Math.PI / 2),
        polar(entity.center, entity.radius, Math.PI),
        polar(entity.center, entity.radius, (Math.PI * 3) / 2),
      ]
    case 'nearest':
      return [entity.center]
    default:
      return []
  }
}

const fromPolyline = (entity: Extract<CadEntity, { type: 'polyline' }>, mode: SnapMode): Vec2[] => {
  if (mode === 'endpoint' || mode === 'node') {
    return entity.points
  }
  if (mode === 'midpoint') {
    const mids: Vec2[] = []
    for (let i = 0; i < entity.points.length - 1; i += 1) {
      mids.push(midpoint(entity.points[i], entity.points[i + 1]))
    }
    return mids
  }
  return []
}

export const collectSnapCandidates = (entity: CadEntity, mode: SnapMode): Vec2[] => {
  switch (entity.type) {
    case 'line':
      return fromLine(entity, mode)
    case 'circle':
      return fromCircle(entity, mode)
    case 'arc':
      if (mode === 'center') return [entity.center]
      if (mode === 'endpoint') {
        return [polar(entity.center, entity.radius, entity.startAngle), polar(entity.center, entity.radius, entity.endAngle)]
      }
      return []
    case 'ellipse':
      if (mode === 'center') return [entity.center]
      return []
    case 'polyline':
      return fromPolyline(entity, mode)
    case 'spline':
      if (mode === 'node') return entity.controlPoints
      return []
    case 'hatch':
      if (mode === 'node') return entity.boundary
      return []
    case 'text':
      if (mode === 'nearest') return [entity.position]
      return []
    case 'dimension':
      if (mode === 'endpoint') return [entity.p1, entity.p2]
      return []
    case 'insert':
      if (mode === 'center') return [entity.position]
      return []
    default:
      return []
  }
}

export const findBestSnap = (
  worldPoint: Vec2,
  entities: CadEntity[],
  enabledModes: SnapMode[],
  aperture: number,
): SnapCandidate | null => {
  let best: SnapCandidate | null = null
  for (const entity of entities) {
    for (const mode of enabledModes) {
      for (const point of collectSnapCandidates(entity, mode)) {
        const d = distance(point, worldPoint)
        if (d <= aperture && (!best || d < best.distance)) {
          best = { point, mode, distance: d }
        }
      }
    }
  }

  if (!best && enabledModes.includes('nearest')) {
    for (const entity of entities) {
      if (entity.type === 'line') {
        const d = pointSegmentDistance(worldPoint, entity.start, entity.end)
        if (d <= aperture && (!best || d < best.distance)) {
          best = { point: worldPoint, mode: 'nearest', distance: d }
        }
      }
    }
  }

  if (enabledModes.includes('intersection')) {
    const lines = entities.filter((entity): entity is Extract<CadEntity, { type: 'line' }> => entity.type === 'line')
    for (let i = 0; i < lines.length; i += 1) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const point = lineIntersection(lines[i].start, lines[i].end, lines[j].start, lines[j].end)
        if (!point) continue
        const d = distance(point, worldPoint)
        if (d <= aperture && (!best || d < best.distance)) {
          best = { point, mode: 'intersection', distance: d }
        }
      }
    }
  }

  return best
}

const lineIntersection = (a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null => {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x)
  if (Math.abs(d) < 1e-9) return null
  const x = ((a1.x * a2.y - a1.y * a2.x) * (b1.x - b2.x) - (a1.x - a2.x) * (b1.x * b2.y - b1.y * b2.x)) / d
  const y = ((a1.x * a2.y - a1.y * a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x * b2.y - b1.y * b2.x)) / d
  return { x, y }
}

export const applyPolarTracking = (basePoint: Vec2, targetPoint: Vec2, incrementDeg = 45): Vec2 => {
  const angle = Math.atan2(targetPoint.y - basePoint.y, targetPoint.x - basePoint.x)
  const distanceValue = distance(basePoint, targetPoint)
  const increment = (incrementDeg * Math.PI) / 180
  const snappedAngle = Math.round(angle / increment) * increment
  return polar(basePoint, distanceValue, snappedAngle)
}
