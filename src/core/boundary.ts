import { isPointInPolygon, polar, polygonArea } from './geometry'
import type { Vec2 } from './math/vec2'
import type { CadEntity } from './types'

/**
 * Hatch boundary detection.
 *
 * A boundary is rarely a single drawn object: a line crossing a circle splits it into two
 * regions that exist only as an arrangement of curves. So rather than looking for a closed
 * entity, we build the planar arrangement of every boundary curve — split each curve at its
 * intersections, discard ends that cannot enclose anything, then walk the resulting graph to
 * find the faces. The smallest face containing the picked point is the region to hatch.
 */

type Segment = { a: Vec2; b: Vec2 }

/** Vertices are snapped to this grid so that points computed by different formulas coincide. */
const GRID = 1e-4
const CIRCLE_SEGMENTS = 96
const MAX_SEGMENTS = 4000
const MIN_AREA = 1e-6
/** Parameter slack for treating an intersection as landing on a segment endpoint. */
const TOUCH = 1e-9

const snapToGrid = (point: Vec2): Vec2 => ({
  x: Math.round(point.x / GRID) * GRID,
  y: Math.round(point.y / GRID) * GRID,
})

const keyOf = (point: Vec2): string => `${Math.round(point.x / GRID)}:${Math.round(point.y / GRID)}`

const segmentsFromPoints = (points: Vec2[], closed: boolean): Segment[] => {
  const segments: Segment[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push({ a: points[i], b: points[i + 1] })
  }
  if (closed && points.length > 2) {
    segments.push({ a: points.at(-1)!, b: points[0] })
  }
  return segments
}

const sampleArc = (center: Vec2, radius: number, startAngle: number, sweep: number, count: number): Vec2[] =>
  Array.from({ length: count + 1 }, (_, index) => polar(center, radius, startAngle + (sweep * index) / count))

/** Curves are approximated by segments; the hatch boundary is stored as a polygon anyway. */
const tessellate = (entity: CadEntity): Segment[] => {
  switch (entity.type) {
    case 'line':
      return [{ a: entity.start, b: entity.end }]
    case 'polyline':
      return segmentsFromPoints(entity.points, entity.closed)
    case 'spline':
      return segmentsFromPoints(entity.controlPoints, false)
    case 'circle':
      return segmentsFromPoints(sampleArc(entity.center, entity.radius, 0, Math.PI * 2, CIRCLE_SEGMENTS).slice(0, -1), true)
    case 'arc': {
      let sweep = entity.endAngle - entity.startAngle
      while (sweep <= 0) sweep += Math.PI * 2
      const count = Math.max(8, Math.round((CIRCLE_SEGMENTS * sweep) / (Math.PI * 2)))
      return segmentsFromPoints(sampleArc(entity.center, entity.radius, entity.startAngle, sweep, count), false)
    }
    case 'ellipse': {
      const points = Array.from({ length: CIRCLE_SEGMENTS }, (_, index) => {
        const angle = (index / CIRCLE_SEGMENTS) * Math.PI * 2
        const x = Math.cos(angle) * entity.rx
        const y = Math.sin(angle) * entity.ry
        return {
          x: entity.center.x + x * Math.cos(entity.rotation) - y * Math.sin(entity.rotation),
          y: entity.center.y + x * Math.sin(entity.rotation) + y * Math.cos(entity.rotation),
        }
      })
      return segmentsFromPoints(points, true)
    }
    default:
      return []
  }
}

const boundsOverlap = (first: Segment, second: Segment): boolean =>
  Math.min(first.a.x, first.b.x) <= Math.max(second.a.x, second.b.x) &&
  Math.max(first.a.x, first.b.x) >= Math.min(second.a.x, second.b.x) &&
  Math.min(first.a.y, first.b.y) <= Math.max(second.a.y, second.b.y) &&
  Math.max(first.a.y, first.b.y) >= Math.min(second.a.y, second.b.y)

/** Splits every segment at each point where another segment crosses it. */
const splitAtIntersections = (segments: Segment[]): Segment[] => {
  const cuts: number[][] = segments.map(() => [])

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const first = segments[i]
      const second = segments[j]
      if (!boundsOverlap(first, second)) continue

      const r = { x: first.b.x - first.a.x, y: first.b.y - first.a.y }
      const s = { x: second.b.x - second.a.x, y: second.b.y - second.a.y }
      const denominator = r.x * s.y - r.y * s.x
      if (Math.abs(denominator) < 1e-12) continue

      const qp = { x: second.a.x - first.a.x, y: second.a.y - first.a.y }
      const t = (qp.x * s.y - qp.y * s.x) / denominator
      const u = (qp.x * r.y - qp.y * r.x) / denominator
      if (t < -TOUCH || t > 1 + TOUCH || u < -TOUCH || u > 1 + TOUCH) continue

      // Each parameter is judged separately: a curve crossing exactly at another curve's vertex
      // still has to be split, even though the other curve does not.
      if (t > TOUCH && t < 1 - TOUCH) cuts[i].push(t)
      if (u > TOUCH && u < 1 - TOUCH) cuts[j].push(u)
    }
  }

  const result: Segment[] = []
  segments.forEach((segment, index) => {
    const parameters = [0, ...cuts[index].sort((a, b) => a - b), 1]
    for (let i = 0; i < parameters.length - 1; i += 1) {
      const start = parameters[i]
      const end = parameters[i + 1]
      if (end - start < 1e-9) continue
      result.push({
        a: {
          x: segment.a.x + (segment.b.x - segment.a.x) * start,
          y: segment.a.y + (segment.b.y - segment.a.y) * start,
        },
        b: {
          x: segment.a.x + (segment.b.x - segment.a.x) * end,
          y: segment.a.y + (segment.b.y - segment.a.y) * end,
        },
      })
    }
  })
  return result
}

type Graph = {
  coordinates: Vec2[]
  neighbours: number[][]
}

const buildGraph = (segments: Segment[]): Graph => {
  const indexByKey = new Map<string, number>()
  const coordinates: Vec2[] = []
  const neighbours: number[][] = []

  const nodeFor = (point: Vec2): number => {
    const snapped = snapToGrid(point)
    const key = keyOf(snapped)
    const existing = indexByKey.get(key)
    if (existing !== undefined) return existing
    const index = coordinates.length
    indexByKey.set(key, index)
    coordinates.push(snapped)
    neighbours.push([])
    return index
  }

  for (const segment of segments) {
    const from = nodeFor(segment.a)
    const to = nodeFor(segment.b)
    if (from === to) continue
    if (!neighbours[from].includes(to)) neighbours[from].push(to)
    if (!neighbours[to].includes(from)) neighbours[to].push(from)
  }

  return { coordinates, neighbours }
}

/** Open ends cannot bound a region, and they make face traversal double back on itself. */
const pruneDangles = (graph: Graph): void => {
  let changed = true
  while (changed) {
    changed = false
    for (let node = 0; node < graph.neighbours.length; node += 1) {
      if (graph.neighbours[node].length === 0 || graph.neighbours[node].length > 1) continue
      const [other] = graph.neighbours[node]
      graph.neighbours[node] = []
      graph.neighbours[other] = graph.neighbours[other].filter((candidate) => candidate !== node)
      changed = true
    }
  }
}

const sortNeighboursByAngle = (graph: Graph): void => {
  graph.neighbours.forEach((list, node) => {
    list.sort(
      (first, second) =>
        Math.atan2(graph.coordinates[first].y - graph.coordinates[node].y, graph.coordinates[first].x - graph.coordinates[node].x) -
        Math.atan2(graph.coordinates[second].y - graph.coordinates[node].y, graph.coordinates[second].x - graph.coordinates[node].x),
    )
  })
}

/**
 * Traces every face of the arrangement. Arriving at a node along an edge, the next edge of the
 * face is the one immediately clockwise from the edge we came in on, which keeps each traversal
 * hugging a single face.
 */
const traceFaces = (graph: Graph): Vec2[][] => {
  const visited = new Set<string>()
  const faces: Vec2[][] = []
  const edgeKey = (from: number, to: number) => `${from}>${to}`

  for (let start = 0; start < graph.neighbours.length; start += 1) {
    for (const firstTarget of graph.neighbours[start]) {
      if (visited.has(edgeKey(start, firstTarget))) continue

      const polygon: Vec2[] = []
      let from = start
      let to = firstTarget
      let guard = 0

      while (guard < 100000) {
        guard += 1
        if (visited.has(edgeKey(from, to))) break
        visited.add(edgeKey(from, to))
        polygon.push(graph.coordinates[from])

        const list = graph.neighbours[to]
        if (list.length === 0) break
        const incoming = list.indexOf(from)
        if (incoming < 0) break
        const next = list[(incoming - 1 + list.length) % list.length]
        from = to
        to = next

        if (from === start && to === firstTarget) break
      }

      if (polygon.length >= 3) faces.push(polygon)
    }
  }

  return faces
}

const collectSegments = (entities: CadEntity[]): Segment[] => {
  const segments: Segment[] = []
  for (const entity of entities) {
    segments.push(...tessellate(entity))
    if (segments.length > MAX_SEGMENTS) break
  }
  return segments
}

/**
 * Returns the smallest enclosed region containing `pickPoint`, or null when the point is not
 * inside any closed area formed by the drawing.
 */
export const findRegionBoundary = (entities: CadEntity[], pickPoint: Vec2): Vec2[] | null => {
  const segments = collectSegments(entities)
  if (segments.length === 0) return null

  const graph = buildGraph(splitAtIntersections(segments))
  pruneDangles(graph)
  sortNeighboursByAngle(graph)

  let best: { polygon: Vec2[]; area: number } | null = null
  for (const polygon of traceFaces(graph)) {
    const area = polygonArea(polygon)
    if (area < MIN_AREA) continue
    if (!isPointInPolygon(pickPoint, polygon)) continue
    if (!best || area < best.area) {
      best = { polygon, area }
    }
  }

  return best ? best.polygon : null
}
