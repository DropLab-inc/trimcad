/**
 * Putting geometry back together: JOIN makes one object out of several that belong together, and
 * OVERKILL throws away the duplicates and stray fragments that build up in a drawing that has been
 * copied, imported and edited a few too many times.
 *
 * Both rest on the same question, so the answer lives in one place: when do two straight pieces sit
 * on the same infinite line, and when do two arcs sit on the same imaginary circle?
 */
import { normalizeAngle, uid } from './geometry'
import { distance, dot, normalize, sub, type Vec2 } from './math/vec2'
import type { ArcEntity, CadEntity, LineEntity, PolylineEntity } from './types'

/**
 * How close two points have to be to count as the same one. AutoCAD's OVERKILL defaults to the
 * same order of magnitude: tight enough that nothing is thrown away by accident, loose enough to
 * forgive the last bit of floating point drift from a rotation or an import.
 */
export const DEFAULT_TOLERANCE = 1e-6

const samePoint = (a: Vec2, b: Vec2, tolerance: number): boolean => distance(a, b) <= tolerance

const sameNumber = (a: number, b: number, tolerance: number): boolean => Math.abs(a - b) <= tolerance

/** Copies the properties that say how an object is drawn, so pieces of it keep its appearance. */
const styleOf = (entity: CadEntity) => ({
  layerId: entity.layerId,
  color: entity.color,
  linetypeId: entity.linetypeId,
  lineweight: entity.lineweight,
})

// ---------------------------------------------------------------------------
// Straight pieces on a shared infinite line
// ---------------------------------------------------------------------------

/** Whether two segments lie along the same infinite line, however far apart they sit on it. */
const sameInfiniteLine = (a: LineEntity, b: LineEntity, tolerance: number): boolean => {
  const dirA = normalize(sub(a.end, a.start))
  const dirB = normalize(sub(b.end, b.start))
  if (Math.abs(dirA.x * dirB.y - dirA.y * dirB.x) > tolerance) return false
  // Parallel is not enough: the second line has to sit on the first rather than beside it.
  const offset = sub(b.start, a.start)
  return Math.abs(offset.x * dirA.y - offset.y * dirA.x) <= tolerance
}

/** Where each end of a line falls along a direction, which turns overlap into simple arithmetic. */
const spanAlong = (line: LineEntity, origin: Vec2, direction: Vec2): [number, number] => {
  const first = dot(sub(line.start, origin), direction)
  const second = dot(sub(line.end, origin), direction)
  return first <= second ? [first, second] : [second, first]
}

// ---------------------------------------------------------------------------
// JOIN
// ---------------------------------------------------------------------------

export type JoinOutcome =
  | { joined: true; entity: CadEntity; consumed: string[]; note: string }
  | { joined: false; reason: string }

/** Lines that share an infinite line become one line spanning everything, gaps included. */
const joinLines = (lines: LineEntity[], tolerance: number): JoinOutcome => {
  const first = lines[0]
  if (!lines.every((line) => sameInfiniteLine(first, line, tolerance))) {
    return { joined: false, reason: 'Lines have to be collinear to be joined.' }
  }
  const direction = normalize(sub(first.end, first.start))
  let low = Infinity
  let high = -Infinity
  for (const line of lines) {
    const [from, to] = spanAlong(line, first.start, direction)
    low = Math.min(low, from)
    high = Math.max(high, to)
  }
  const at = (t: number): Vec2 => ({ x: first.start.x + direction.x * t, y: first.start.y + direction.y * t })
  return {
    joined: true,
    entity: { ...styleOf(first), id: uid(), type: 'line', start: at(low), end: at(high) },
    consumed: lines.map((line) => line.id),
    note: `Joined ${lines.length} lines into one`,
  }
}

/**
 * Arcs on one circle become a single arc, swept anticlockwise from the first one picked. That is
 * AutoCAD's rule, and it is what makes the result predictable when the pieces are out of order.
 */
const joinArcs = (arcs: ArcEntity[], tolerance: number): JoinOutcome => {
  const first = arcs[0]
  const onSameCircle = arcs.every(
    (arc) => samePoint(arc.center, first.center, tolerance) && sameNumber(arc.radius, first.radius, tolerance),
  )
  if (!onSameCircle) {
    return { joined: false, reason: 'Arcs have to lie on the same circle to be joined.' }
  }

  // Everything is measured as a turn anticlockwise from where the first arc begins, so the whole
  // run is described by how far the furthest piece reaches.
  let reach = 0
  for (const arc of arcs) {
    const from = normalizeAngle(arc.startAngle - first.startAngle)
    const sweep = normalizeAngle(arc.endAngle - arc.startAngle) || Math.PI * 2
    reach = Math.max(reach, from + sweep)
  }

  if (reach >= Math.PI * 2 - tolerance) {
    return {
      joined: true,
      entity: { ...styleOf(first), id: uid(), type: 'circle', center: first.center, radius: first.radius },
      consumed: arcs.map((arc) => arc.id),
      note: `Joined ${arcs.length} arcs into a circle`,
    }
  }
  return {
    joined: true,
    entity: { ...styleOf(first), id: uid(), type: 'arc', center: first.center, radius: first.radius, startAngle: first.startAngle, endAngle: first.startAngle + reach },
    consumed: arcs.map((arc) => arc.id),
    note: `Joined ${arcs.length} arcs into one`,
  }
}

/** The run of points an object contributes to a chain. */
const pointsOf = (entity: CadEntity): Vec2[] | null => {
  if (entity.type === 'line') return [entity.start, entity.end]
  if (entity.type === 'polyline') return entity.closed ? null : entity.points
  return null
}

/**
 * Threads open runs of points end to end. Each piece may need turning round, and a piece may join
 * either end of what has been built so far, so both ends of the chain stay open until nothing else
 * will attach.
 */
const chainPoints = (runs: Vec2[][], tolerance: number): Vec2[] | null => {
  const remaining = runs.slice(1)
  let chain = runs[0].slice()

  while (remaining.length > 0) {
    const index = remaining.findIndex((run) => {
      const head = chain[0]
      const tail = chain[chain.length - 1]
      return (
        samePoint(run[0], tail, tolerance) ||
        samePoint(run[run.length - 1], tail, tolerance) ||
        samePoint(run[run.length - 1], head, tolerance) ||
        samePoint(run[0], head, tolerance)
      )
    })
    if (index === -1) return null

    const [run] = remaining.splice(index, 1)
    const head = chain[0]
    const tail = chain[chain.length - 1]
    if (samePoint(run[0], tail, tolerance)) chain = [...chain, ...run.slice(1)]
    else if (samePoint(run[run.length - 1], tail, tolerance)) chain = [...chain, ...run.slice(0, -1).reverse()]
    else if (samePoint(run[run.length - 1], head, tolerance)) chain = [...run.slice(0, -1), ...chain]
    else chain = [...run.slice(1).reverse(), ...chain]
  }
  return chain
}

/** Lines and open polylines that meet end to end become one polyline. */
const joinChain = (entities: CadEntity[], tolerance: number): JoinOutcome => {
  const runs = entities.map(pointsOf)
  if (runs.some((run) => run === null)) {
    return { joined: false, reason: 'Only lines, arcs and open polylines can be joined.' }
  }

  const chain = chainPoints(runs as Vec2[][], tolerance)
  if (!chain) {
    return { joined: false, reason: 'The objects have to meet end to end to be joined.' }
  }

  // A chain that comes back to where it started is a closed shape, and the repeated point would
  // otherwise sit on top of the first one.
  const closed = chain.length > 2 && samePoint(chain[0], chain[chain.length - 1], tolerance)
  const points = closed ? chain.slice(0, -1) : chain
  const joined: PolylineEntity = { ...styleOf(entities[0]), id: uid(), type: 'polyline', points, closed }
  return {
    joined: true,
    entity: joined,
    consumed: entities.map((entity) => entity.id),
    note: `Joined ${entities.length} objects into ${closed ? 'a closed polyline' : 'a polyline'}`,
  }
}

/**
 * JOIN, following AutoCAD's order: collinear lines make a line, arcs on one circle make an arc or
 * a full circle, and anything else has to meet end to end to become a polyline.
 */
export const joinSelection = (selected: CadEntity[], tolerance = DEFAULT_TOLERANCE): JoinOutcome => {
  if (selected.length < 2) {
    return { joined: false, reason: 'Select at least two objects to join.' }
  }
  if (selected.every((entity): entity is LineEntity => entity.type === 'line')) {
    const asLine = joinLines(selected, tolerance)
    // Lines that are not collinear may still meet end to end, which makes a polyline instead.
    if (asLine.joined) return asLine
    return joinChain(selected, tolerance)
  }
  if (selected.every((entity): entity is ArcEntity => entity.type === 'arc')) {
    return joinArcs(selected, tolerance)
  }
  if (selected.some((entity) => entity.type === 'arc')) {
    // A polyline here stores only straight runs, so an arc folded into one would quietly become a
    // chord. Saying so is better than changing the drawing behind the draughtsman's back.
    return { joined: false, reason: 'An arc can only be joined to other arcs on the same circle.' }
  }
  return joinChain(selected, tolerance)
}

// ---------------------------------------------------------------------------
// OVERKILL
// ---------------------------------------------------------------------------

export type OverkillResult = {
  entities: CadEntity[]
  /** How many objects were thrown away as copies of something else. */
  duplicates: number
  /** How many were absorbed into a neighbour they overlapped or met end to end. */
  merged: number
}

/**
 * A short string that two objects share only when they are the same shape in the same place.
 * Coordinates are rounded to the tolerance first, so geometry that differs only in the last bits
 * of floating point lands on the same key.
 */
const shapeKey = (entity: CadEntity, tolerance: number): string => {
  const digits = Math.max(0, Math.min(15, Math.round(-Math.log10(tolerance))))
  const n = (value: number) => value.toFixed(digits)
  const p = (point: Vec2) => `${n(point.x)},${n(point.y)}`
  // Two points in either order describe the same line, so the pair is put in a fixed order first.
  const unordered = (a: Vec2, b: Vec2) => (p(a) <= p(b) ? `${p(a)}|${p(b)}` : `${p(b)}|${p(a)}`)
  const run = (points: Vec2[]) => {
    const forward = points.map(p).join(' ')
    const backward = [...points].reverse().map(p).join(' ')
    return forward <= backward ? forward : backward
  }

  switch (entity.type) {
    case 'line':
      return `line ${unordered(entity.start, entity.end)}`
    case 'circle':
      return `circle ${p(entity.center)} ${n(entity.radius)}`
    case 'arc':
      return `arc ${p(entity.center)} ${n(entity.radius)} ${n(normalizeAngle(entity.startAngle))} ${n(normalizeAngle(entity.endAngle))}`
    case 'ellipse':
      return `ellipse ${p(entity.center)} ${n(entity.rx)} ${n(entity.ry)} ${n(normalizeAngle(entity.rotation))}`
    case 'polyline':
      return `pline ${entity.closed} ${run(entity.points)}`
    case 'spline':
      return `spline ${run(entity.controlPoints)}`
    case 'hatch':
      return `hatch ${entity.pattern} ${n(entity.scale)} ${run(entity.boundary)}`
    case 'text':
      return `text ${p(entity.position)} ${n(entity.height)} ${entity.value}`
    case 'dimension':
      return `dim ${entity.dimType} ${p(entity.p1)} ${p(entity.p2)} ${entity.p3 ? p(entity.p3) : '-'} ${entity.placement ? p(entity.placement) : '-'}`
    case 'insert':
      return `insert ${entity.blockId} ${p(entity.position)} ${n(entity.rotation)} ${n(entity.scale)}`
  }
}

/** Which infinite line a segment lies on, so collinear neighbours can be found without comparing all pairs. */
const infiniteLineKey = (line: LineEntity, tolerance: number): string => {
  const digits = Math.max(0, Math.min(15, Math.round(-Math.log10(tolerance))))
  let direction = normalize(sub(line.end, line.start))
  // A line and the same line drawn backwards share a key, so one direction of each pair is chosen.
  if (direction.x < 0 || (direction.x === 0 && direction.y < 0)) direction = { x: -direction.x, y: -direction.y }
  // How far the line sits from the origin, measured across its own direction.
  const offset = line.start.x * direction.y - line.start.y * direction.x
  return `${direction.x.toFixed(digits)},${direction.y.toFixed(digits)}@${offset.toFixed(digits)}`
}

/** Merges lines that lie along one infinite line and either overlap or meet end to end. */
const mergeCollinear = (lines: LineEntity[], tolerance: number): { kept: LineEntity[]; merged: number } => {
  const groups = new Map<string, LineEntity[]>()
  for (const line of lines) {
    const key = infiniteLineKey(line, tolerance)
    groups.set(key, [...(groups.get(key) ?? []), line])
  }

  const kept: LineEntity[] = []
  let merged = 0
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0])
      continue
    }
    const origin = group[0].start
    const direction = normalize(sub(group[0].end, group[0].start))
    const spans = group
      .map((line) => ({ line, span: spanAlong(line, origin, direction) }))
      .sort((a, b) => a.span[0] - b.span[0])

    let current = spans[0]
    let absorbed = 0
    const flush = () => {
      if (absorbed === 0) {
        kept.push(current.line)
        return
      }
      const at = (t: number): Vec2 => ({ x: origin.x + direction.x * t, y: origin.y + direction.y * t })
      kept.push({ ...current.line, id: uid(), start: at(current.span[0]), end: at(current.span[1]) })
      merged += absorbed
    }

    for (const next of spans.slice(1)) {
      // A gap means these are two separate lines; touching or overlapping means they are one.
      if (next.span[0] > current.span[1] + tolerance) {
        flush()
        current = next
        absorbed = 0
        continue
      }
      current = { line: current.line, span: [current.span[0], Math.max(current.span[1], next.span[1])] }
      absorbed += 1
    }
    flush()
  }
  return { kept, merged }
}

/**
 * OVERKILL: throws away objects that are copies of something already there, then absorbs straight
 * pieces that overlap or meet end to end along the same line into a single one.
 */
export const overkill = (entities: CadEntity[], tolerance = DEFAULT_TOLERANCE): OverkillResult => {
  const seen = new Set<string>()
  const unique: CadEntity[] = []
  let duplicates = 0
  for (const entity of entities) {
    const key = shapeKey(entity, tolerance)
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
    unique.push(entity)
  }

  // Only lines on the same layer are absorbed into each other, since merging across layers would
  // silently move geometry from one to the other.
  const lines = unique.filter((entity): entity is LineEntity => entity.type === 'line')
  const others = unique.filter((entity) => entity.type !== 'line')
  const byLayer = new Map<string, LineEntity[]>()
  for (const line of lines) {
    byLayer.set(line.layerId, [...(byLayer.get(line.layerId) ?? []), line])
  }

  const keptLines: LineEntity[] = []
  let merged = 0
  for (const group of byLayer.values()) {
    const result = mergeCollinear(group, tolerance)
    keptLines.push(...result.kept)
    merged += result.merged
  }

  return { entities: [...others, ...keptLines], duplicates, merged }
}
