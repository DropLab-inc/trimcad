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

/**
 * What the pieces made, before it is known how many objects were picked to make it. Read as
 * segments, one rectangle is four lines, and reporting four would be counting the wrong thing.
 */
type Made = { entity: CadEntity; made: string } | { joined: false; reason: string }

/** Lines that share an infinite line become one line spanning everything, gaps included. */
const joinLines = (lines: LineEntity[], tolerance: number): Made => {
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
    entity: { ...styleOf(first), id: uid(), type: 'line', start: at(low), end: at(high) },
    made: 'one line',
  }
}

/**
 * Arcs on one circle become a single arc, swept anticlockwise from the first one picked. That is
 * AutoCAD's rule, and it is what makes the result predictable when the pieces are out of order.
 */
const joinArcs = (arcs: ArcEntity[], tolerance: number): Made => {
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
      entity: { ...styleOf(first), id: uid(), type: 'circle', center: first.center, radius: first.radius },
      made: 'a circle',
    }
  }
  return {
    entity: { ...styleOf(first), id: uid(), type: 'arc', center: first.center, radius: first.radius, startAngle: first.startAngle, endAngle: first.startAngle + reach },
    made: 'one arc',
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
const joinChain = (entities: CadEntity[], tolerance: number): Made => {
  const runs = entities.map(pointsOf)
  if (runs.some((run) => run === null)) {
    return { joined: false, reason: 'A closed shape has no free ends to join to.' }
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
  return { entity: joined, made: closed ? 'a closed polyline' : 'a polyline' }
}

export type CombineOptions = {
  tolerance?: number
  /**
   * Whether a polyline is read as the run of lines it is drawn from. With this on, a closed shape
   * such as a rectangle can take part in a join, and a loose line lying along one of its edges is
   * seen for the duplicate it is.
   */
  polylineSegments?: boolean
}

/** A polyline read as its separate segments, each keeping the shape's layer, colour and linetype. */
export const segmentsOf = (entity: PolylineEntity): LineEntity[] => {
  const count = entity.closed ? entity.points.length : entity.points.length - 1
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    ...styleOf(entity),
    id: `${entity.id}#${index}`,
    type: 'line' as const,
    start: entity.points[index],
    end: entity.points[(index + 1) % entity.points.length],
  }))
}

const asSegments = (entities: CadEntity[]): CadEntity[] =>
  entities.flatMap((entity) => (entity.type === 'polyline' ? segmentsOf(entity) : [entity]))

/**
 * JOIN, following AutoCAD's order: collinear lines make a line, arcs on one circle make an arc or
 * a full circle, and anything else has to meet end to end to become a polyline.
 */
export const joinSelection = (chosen: CadEntity[], options: CombineOptions = {}): JoinOutcome => {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE
  if (chosen.length < 2) {
    return { joined: false, reason: 'Select at least two objects to join.' }
  }
  // Read as segments, a closed shape is a run of lines like any other and can be threaded into a
  // longer chain. Read whole, it is a dead end, since a closed shape has no free ends to join to.
  const selected = options.polylineSegments ? asSegments(chosen) : chosen

  const made = ((): Made => {
    if (selected.every((entity): entity is LineEntity => entity.type === 'line')) {
      const asLine = joinLines(selected, tolerance)
      // Lines that are not collinear may still meet end to end, which makes a polyline instead.
      if (!('joined' in asLine)) return asLine
      return joinChain(selected, tolerance)
    }
    if (selected.every((entity): entity is ArcEntity => entity.type === 'arc')) {
      return joinArcs(selected, tolerance)
    }
    if (selected.some((entity) => entity.type === 'arc')) {
      // A polyline here stores only straight runs, so an arc folded into one would quietly become
      // a chord. Saying so is better than changing the drawing behind the draughtsman's back.
      return { joined: false, reason: 'An arc can only be joined to other arcs on the same circle.' }
    }
    return joinChain(selected, tolerance)
  })()

  if ('joined' in made) return made
  // Everything picked goes into the result, so the count reported is the count of objects the
  // draughtsman chose rather than the count of pieces they were read as.
  return {
    joined: true,
    entity: made.entity,
    consumed: chosen.map((entity) => entity.id),
    note: `Joined ${chosen.length} object${chosen.length === 1 ? '' : 's'} into ${made.made}`,
  }
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

/** A survivor of the merge, and which of the original lines it stands in for in the drawing order. */
type Survivor = { source: string; line: LineEntity }

/** Merges lines that lie along one infinite line and either overlap or meet end to end. */
const mergeCollinear = (lines: LineEntity[], tolerance: number): { kept: Survivor[]; merged: number } => {
  const groups = new Map<string, LineEntity[]>()
  for (const line of lines) {
    const key = infiniteLineKey(line, tolerance)
    groups.set(key, [...(groups.get(key) ?? []), line])
  }

  const kept: Survivor[] = []
  let merged = 0
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push({ source: group[0].id, line: group[0] })
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
      // An untouched line keeps its own identity, which is how a polyline whose segments all came
      // through the clean is recognised later and put back together.
      if (absorbed === 0) {
        kept.push({ source: current.line.id, line: current.line })
        return
      }
      const at = (t: number): Vec2 => ({ x: origin.x + direction.x * t, y: origin.y + direction.y * t })
      kept.push({
        source: current.line.id,
        line: { ...current.line, id: uid(), start: at(current.span[0]), end: at(current.span[1]) },
      })
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
 * The heart of OVERKILL, working on a flat list: copies of something already there are dropped,
 * then straight pieces that overlap or meet end to end along one line are absorbed into each other.
 */
/** What became of one object during a clean: it stayed, it was a copy, or a neighbour swallowed it. */
type Fate = 'kept' | 'duplicate' | 'merged'

const cleanUp = (
  entities: CadEntity[],
  tolerance: number,
  /** Which of two identical objects to keep, when one is worth more than the other. */
  preferred: (entity: CadEntity) => boolean = () => false,
): OverkillResult & { fates: Map<string, Fate> } => {
  const fates = new Map<string, Fate>()
  // Which copy of each shape survives is settled before anything is thrown away, so the answer does
  // not depend on the order the objects happen to sit in the drawing.
  const keys = new Map<string, string>()
  const winners = new Map<string, CadEntity>()
  for (const entity of entities) {
    const key = shapeKey(entity, tolerance)
    keys.set(entity.id, key)
    const standing = winners.get(key)
    if (!standing || (preferred(entity) && !preferred(standing))) winners.set(key, entity)
  }

  const unique: CadEntity[] = []
  let duplicates = 0
  for (const entity of entities) {
    if (winners.get(keys.get(entity.id)!) === entity) {
      unique.push(entity)
      fates.set(entity.id, 'kept')
    } else {
      duplicates += 1
      fates.set(entity.id, 'duplicate')
    }
  }

  // Only lines on the same layer are absorbed into each other, since merging across layers would
  // silently move geometry from one to the other.
  const byLayer = new Map<string, LineEntity[]>()
  for (const entity of unique) {
    if (entity.type !== 'line') continue
    byLayer.set(entity.layerId, [...(byLayer.get(entity.layerId) ?? []), entity])
  }

  // Each line is looked up by its own id to find what stands in its place, so the survivors come
  // out in the order the drawing already held them rather than bunched at the end.
  const replacements = new Map<string, LineEntity | null>()
  let merged = 0
  for (const group of byLayer.values()) {
    const result = mergeCollinear(group, tolerance)
    merged += result.merged
    for (const line of group) replacements.set(line.id, null)
    // A merged run takes the place of the first of its pieces; the rest simply go.
    for (const survivor of result.kept) replacements.set(survivor.source, survivor.line)
  }

  const kept: CadEntity[] = []
  for (const entity of unique) {
    if (entity.type !== 'line') {
      kept.push(entity)
      continue
    }
    const replacement = replacements.get(entity.id)
    // The line a run was rebuilt from stays; the ones folded into it are what count as merged.
    if (replacement) kept.push(replacement)
    else fates.set(entity.id, 'merged')
  }

  return { entities: kept, duplicates, merged, fates }
}

/**
 * OVERKILL. With `polylineSegments` on, a polyline is compared segment by segment, so a loose line
 * lying along one of its edges is seen for the duplicate it is. A polyline is only actually broken
 * apart when one of its segments really was removed or absorbed; one that comes through the clean
 * untouched is put back exactly as it was, which is AutoCAD's "do not break polylines" rule.
 */
export const overkill = (entities: CadEntity[], options: CombineOptions = {}): OverkillResult => {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE
  if (!options.polylineSegments) {
    const { entities: kept, duplicates, merged } = cleanUp(entities, tolerance)
    return { entities: kept, duplicates, merged }
  }

  const sources = new Map<string, { polyline: PolylineEntity; segmentCount: number }>()
  const expanded: CadEntity[] = []
  for (const entity of entities) {
    const segments = entity.type === 'polyline' ? segmentsOf(entity) : []
    if (entity.type !== 'polyline' || segments.length === 0) {
      expanded.push(entity)
      continue
    }
    sources.set(entity.id, { polyline: entity, segmentCount: segments.length })
    expanded.push(...segments)
  }

  // Where a loose line and a polyline's edge are the same line, the polyline's edge is the one to
  // keep: the loose copy goes, and the shape survives whole instead of being broken up for nothing.
  const result = cleanUp(expanded, tolerance, (entity) => sources.has(entity.id.split('#')[0]))

  // Which segments of each polyline came through with their own id, meaning untouched. A segment
  // that was merged carries a fresh id, so it will not be counted here and its shape gets broken.
  const survivors = new Map<string, Set<string>>()
  for (const entity of result.entities) {
    const sourceId = entity.id.split('#')[0]
    if (!sources.has(sourceId)) continue
    survivors.set(sourceId, (survivors.get(sourceId) ?? new Set()).add(entity.id))
  }

  const restored = new Set<string>()
  const rebuilt: CadEntity[] = []
  for (const entity of result.entities) {
    const sourceId = entity.id.split('#')[0]
    const source = sources.get(sourceId)
    if (!source || survivors.get(sourceId)?.size !== source.segmentCount) {
      rebuilt.push(entity)
      continue
    }
    // The whole shape survived, so it goes back as itself, once, where its first segment sat.
    if (restored.has(sourceId)) continue
    restored.add(sourceId)
    rebuilt.push(source.polyline)
  }

  // What was removed is counted in objects rather than in segments: two identical rectangles are
  // one duplicate, not four, which is what the draughtsman sees happen.
  let duplicates = 0
  let merged = 0
  for (const entity of entities) {
    const source = sources.get(entity.id)
    if (!source) {
      const fate = result.fates.get(entity.id)
      if (fate === 'duplicate') duplicates += 1
      if (fate === 'merged') merged += 1
      continue
    }
    const fates = Array.from({ length: source.segmentCount }, (_, index) => result.fates.get(`${entity.id}#${index}`))
    if (fates.every((fate) => fate === 'kept')) continue
    if (fates.every((fate) => fate === 'duplicate')) duplicates += 1
    else if (fates.some((fate) => fate === 'merged')) merged += 1
    // A shape that lost only some of its edges is now a handful of loose lines, so what went is
    // counted the way it went: piece by piece.
    else duplicates += fates.filter((fate) => fate === 'duplicate').length
  }

  return { entities: rebuilt, duplicates, merged }
}
