import { describe, expect, it } from 'vitest'
import { createCircle, createLine, createRect } from './commands'
import { joinSelection, overkill } from './combine'
import type { ArcEntity, CadEntity, LineEntity, PolylineEntity } from './types'

const arc = (overrides: Partial<ArcEntity> = {}): ArcEntity => ({
  id: 'arc',
  type: 'arc',
  layerId: 'L',
  center: { x: 0, y: 0 },
  radius: 10,
  startAngle: 0,
  endAngle: Math.PI / 2,
  ...overrides,
})

/** Lines get distinct ids so the outcome can say which of them were used up. */
const line = (id: string, from: [number, number], to: [number, number]): LineEntity => ({
  ...createLine('L', { x: from[0], y: from[1] }, { x: to[0], y: to[1] }),
  id,
})

describe('JOIN', () => {
  it('makes one line out of two that lie along the same straight', () => {
    const outcome = joinSelection([line('a', [0, 0], [50, 0]), line('b', [50, 0], [120, 0])])

    expect(outcome.joined).toBe(true)
    if (!outcome.joined) return
    expect(outcome.entity.type).toBe('line')
    expect(outcome.entity.type === 'line' && outcome.entity.start).toEqual({ x: 0, y: 0 })
    expect(outcome.entity.type === 'line' && outcome.entity.end).toEqual({ x: 120, y: 0 })
    expect(outcome.consumed).toEqual(['a', 'b'])
  })

  it('closes the gap between collinear lines that do not touch', () => {
    const outcome = joinSelection([line('a', [0, 0], [40, 0]), line('b', [80, 0], [120, 0])])

    expect(outcome.joined && outcome.entity.type === 'line' && outcome.entity.end).toEqual({ x: 120, y: 0 })
  })

  it('joins collinear lines whatever order they were picked in', () => {
    const outcome = joinSelection([line('b', [80, 0], [120, 0]), line('a', [0, 0], [40, 0])])

    expect(outcome.joined && outcome.entity.type === 'line' && outcome.entity.start).toEqual({ x: 0, y: 0 })
    expect(outcome.joined && outcome.entity.type === 'line' && outcome.entity.end).toEqual({ x: 120, y: 0 })
  })

  it('joins collinear lines drawn in opposite directions', () => {
    const outcome = joinSelection([line('a', [0, 0], [50, 0]), line('b', [120, 0], [50, 0])])

    expect(outcome.joined && outcome.entity.type === 'line' && outcome.entity.end).toEqual({ x: 120, y: 0 })
  })

  it('makes a polyline out of lines that meet at a corner', () => {
    const outcome = joinSelection([line('a', [0, 0], [50, 0]), line('b', [50, 0], [50, 40])])

    expect(outcome.joined).toBe(true)
    if (!outcome.joined) return
    const joined = outcome.entity as PolylineEntity
    expect(joined.type).toBe('polyline')
    expect(joined.points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
    ])
    expect(joined.closed).toBe(false)
  })

  it('turns a chain that comes back on itself into a closed polyline', () => {
    const outcome = joinSelection([
      line('a', [0, 0], [50, 0]),
      line('b', [50, 0], [50, 50]),
      line('c', [50, 50], [0, 50]),
      line('d', [0, 50], [0, 0]),
    ])

    expect(outcome.joined).toBe(true)
    if (!outcome.joined) return
    const joined = outcome.entity as PolylineEntity
    expect(joined.closed).toBe(true)
    // The repeated closing point is dropped, since closing the polyline already says it.
    expect(joined.points).toHaveLength(4)
  })

  it('threads a chain together when the pieces are picked out of order', () => {
    const outcome = joinSelection([
      line('b', [50, 0], [50, 40]),
      line('c', [50, 40], [90, 40]),
      line('a', [0, 0], [50, 0]),
    ])

    const joined = outcome.joined ? (outcome.entity as PolylineEntity) : null
    expect(joined?.points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 90, y: 40 },
    ])
  })

  it('turns a piece round when it was drawn the other way', () => {
    const outcome = joinSelection([line('a', [0, 0], [50, 0]), line('b', [50, 40], [50, 0])])

    const joined = outcome.joined ? (outcome.entity as PolylineEntity) : null
    expect(joined?.points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
    ])
  })

  it('carries on from an existing polyline', () => {
    const existing: PolylineEntity = {
      id: 'p',
      type: 'polyline',
      layerId: 'L',
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      closed: false,
    }

    const outcome = joinSelection([existing, line('a', [50, 0], [50, 30])])

    const joined = outcome.joined ? (outcome.entity as PolylineEntity) : null
    expect(joined?.points).toHaveLength(3)
  })

  it('joins two arcs on one circle into a single arc', () => {
    const outcome = joinSelection([
      arc({ id: 'a', startAngle: 0, endAngle: Math.PI / 2 }),
      arc({ id: 'b', startAngle: Math.PI / 2, endAngle: Math.PI }),
    ])

    expect(outcome.joined).toBe(true)
    if (!outcome.joined) return
    expect(outcome.entity.type).toBe('arc')
    expect(outcome.entity.type === 'arc' && outcome.entity.startAngle).toBeCloseTo(0, 6)
    expect(outcome.entity.type === 'arc' && outcome.entity.endAngle).toBeCloseTo(Math.PI, 6)
  })

  it('turns arcs that come all the way round into a circle', () => {
    const outcome = joinSelection([
      arc({ id: 'a', startAngle: 0, endAngle: Math.PI }),
      arc({ id: 'b', startAngle: Math.PI, endAngle: Math.PI * 2 }),
    ])

    expect(outcome.joined && outcome.entity.type).toBe('circle')
    expect(outcome.joined && outcome.entity.type === 'circle' && outcome.entity.radius).toBe(10)
  })

  it('refuses arcs that sit on different circles', () => {
    const outcome = joinSelection([arc({ id: 'a' }), arc({ id: 'b', radius: 25 })])

    expect(outcome.joined).toBe(false)
    expect(outcome.joined === false && outcome.reason).toMatch(/same circle/)
  })

  it('refuses to fold an arc into a polyline, which would flatten it to a chord', () => {
    const outcome = joinSelection([line('a', [10, 0], [40, 0]), arc({ id: 'b' })])

    expect(outcome.joined).toBe(false)
    expect(outcome.joined === false && outcome.reason).toMatch(/arc/i)
  })

  it('refuses pieces that do not meet', () => {
    const outcome = joinSelection([line('a', [0, 0], [50, 0]), line('b', [200, 90], [260, 130])])

    expect(outcome.joined).toBe(false)
    expect(outcome.joined === false && outcome.reason).toMatch(/end to end/)
  })

  it('asks for more than one object', () => {
    const outcome = joinSelection([line('a', [0, 0], [50, 0])])

    expect(outcome.joined).toBe(false)
    expect(outcome.joined === false && outcome.reason).toMatch(/at least two/)
  })

  it('keeps the layer and colour of the first object picked', () => {
    const first = { ...line('a', [0, 0], [50, 0]), layerId: 'walls', color: '#ff0000' }
    const outcome = joinSelection([first, line('b', [50, 0], [50, 40])])

    expect(outcome.joined && outcome.entity.layerId).toBe('walls')
    expect(outcome.joined && outcome.entity.color).toBe('#ff0000')
  })
})

describe('reading polylines as the lines they are drawn from', () => {
  const segments = { polylineSegments: true }
  const rect = (id: string, x1: number, y1: number, x2: number, y2: number): PolylineEntity => ({
    ...(createRect('L', { x: x1, y: y1 }, { x: x2, y: y2 }) as PolylineEntity),
    id,
  })

  it('JOIN threads a line onto a closed shape it meets at a corner', () => {
    const outcome = joinSelection([rect('r', 0, 0, 100, 60), line('tail', [0, 0], [-40, 0])], segments)

    expect(outcome.joined).toBe(true)
    if (!outcome.joined) return
    const joined = outcome.entity as PolylineEntity
    expect(joined.type).toBe('polyline')
    // Four corners of the rectangle, the corner it came back to, and the far end of the tail.
    expect(joined.points).toHaveLength(6)
    expect(joined.points).toContainEqual({ x: -40, y: 0 })
  })

  it('JOIN reports how many objects were picked, not how many lines they were read as', () => {
    const outcome = joinSelection([rect('r', 0, 0, 100, 60), line('tail', [0, 0], [-40, 0])], segments)

    expect(outcome.joined && outcome.note).toBe('Joined 2 objects into a polyline')
  })

  it('JOIN consumes the shapes that were picked, so the right things are removed', () => {
    const outcome = joinSelection([rect('r', 0, 0, 100, 60), line('tail', [0, 0], [-40, 0])], segments)

    expect(outcome.joined && outcome.consumed).toEqual(['r', 'tail'])
  })

  it('JOIN turns a closed shape down when polylines are read whole', () => {
    const outcome = joinSelection([rect('r', 0, 0, 100, 60), line('tail', [0, 0], [-40, 0])])

    expect(outcome.joined).toBe(false)
    expect(outcome.joined === false && outcome.reason).toMatch(/no free ends/)
  })

  it('OVERKILL deletes a loose line lying along a rectangle edge', () => {
    const result = overkill([rect('r', 0, 0, 100, 60), line('edge', [0, 0], [100, 0])], segments)

    expect(result.duplicates).toBe(1)
    expect(result.entities).toHaveLength(1)
  })

  it('OVERKILL leaves the rectangle whole when nothing was taken out of it', () => {
    const result = overkill([rect('r', 0, 0, 100, 60), line('edge', [0, 0], [100, 0])], segments)

    expect(result.entities[0].type).toBe('polyline')
    expect(result.entities[0].id).toBe('r')
  })

  it('OVERKILL keeps the rectangle rather than the loose line, whichever was drawn first', () => {
    const result = overkill([line('edge', [0, 0], [100, 0]), rect('r', 0, 0, 100, 60)], segments)

    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].id).toBe('r')
  })

  it('OVERKILL breaks the shape apart only when one of its edges really changed', () => {
    // The loose line runs past the corner, so the edge it overlaps grows and can no longer be part
    // of the rectangle as drawn.
    const result = overkill([rect('r', 0, 0, 100, 60), line('over', [50, 0], [180, 0])], segments)

    expect(result.merged).toBe(1)
    expect(result.entities.every((entity) => entity.type === 'line')).toBe(true)
    expect(result.entities).toHaveLength(4)
  })

  it('OVERKILL misses the duplicate when polylines are read whole', () => {
    const result = overkill([rect('r', 0, 0, 100, 60), line('edge', [0, 0], [100, 0])])

    expect(result.duplicates).toBe(0)
    expect(result.entities).toHaveLength(2)
  })

  it('OVERKILL still spots two identical rectangles either way', () => {
    const pair = [rect('a', 0, 0, 100, 60), rect('b', 0, 0, 100, 60)]

    expect(overkill(pair, segments).duplicates).toBe(1)
    expect(overkill(pair).duplicates).toBe(1)
  })

  it('OVERKILL leaves an untouched drawing of shapes exactly as it found it', () => {
    const drawing = [rect('a', 0, 0, 100, 60), rect('b', 200, 200, 260, 240), createCircle('L', { x: 0, y: 0 }, 8)]

    const result = overkill(drawing, segments)

    expect(result.entities).toEqual(drawing)
  })
})

describe('OVERKILL', () => {
  const at = (id: string, from: [number, number], to: [number, number]) => line(id, from, to)

  it('deletes a line drawn twice in the same place', () => {
    const result = overkill([at('a', [0, 0], [50, 0]), at('b', [0, 0], [50, 0])])

    expect(result.duplicates).toBe(1)
    expect(result.entities).toHaveLength(1)
  })

  it('counts a line drawn back over itself as the same line', () => {
    const result = overkill([at('a', [0, 0], [50, 0]), at('b', [50, 0], [0, 0])])

    expect(result.duplicates).toBe(1)
  })

  it('leaves lines that merely look similar alone', () => {
    const result = overkill([at('a', [0, 0], [50, 0]), at('b', [0, 5], [50, 5])])

    expect(result.duplicates).toBe(0)
    expect(result.entities).toHaveLength(2)
  })

  it('absorbs a line that overlaps part of another into one line', () => {
    const result = overkill([at('a', [0, 0], [60, 0]), at('b', [40, 0], [100, 0])])

    expect(result.merged).toBe(1)
    expect(result.entities).toHaveLength(1)
    const survivor = result.entities[0] as LineEntity
    expect(survivor.start).toEqual({ x: 0, y: 0 })
    expect(survivor.end).toEqual({ x: 100, y: 0 })
  })

  it('absorbs lines that meet end to end along one straight', () => {
    const result = overkill([at('a', [0, 0], [50, 0]), at('b', [50, 0], [90, 0])])

    expect(result.merged).toBe(1)
    expect((result.entities[0] as LineEntity).end).toEqual({ x: 90, y: 0 })
  })

  it('leaves a gap between two collinear lines alone', () => {
    const result = overkill([at('a', [0, 0], [40, 0]), at('b', [70, 0], [110, 0])])

    expect(result.merged).toBe(0)
    expect(result.entities).toHaveLength(2)
  })

  it('does not merge lines that are parallel but not on the same straight', () => {
    const result = overkill([at('a', [0, 0], [60, 0]), at('b', [40, 12], [100, 12])])

    expect(result.merged).toBe(0)
    expect(result.entities).toHaveLength(2)
  })

  it('keeps lines on different layers apart, even where they lie on top of one another', () => {
    const walls = { ...at('a', [0, 0], [60, 0]), layerId: 'walls' }
    const grid = { ...at('b', [40, 0], [100, 0]), layerId: 'grid' }

    const result = overkill([walls, grid])

    expect(result.merged).toBe(0)
    expect(result.entities).toHaveLength(2)
  })

  it('runs a whole row of overlapping pieces together', () => {
    const result = overkill([
      at('a', [0, 0], [30, 0]),
      at('b', [20, 0], [50, 0]),
      at('c', [45, 0], [80, 0]),
    ])

    expect(result.entities).toHaveLength(1)
    expect((result.entities[0] as LineEntity).end).toEqual({ x: 80, y: 0 })
  })

  it('spots duplicate circles and rectangles as well as lines', () => {
    const result = overkill([
      createCircle('L', { x: 10, y: 10 }, 5),
      { ...createCircle('L', { x: 10, y: 10 }, 5), id: 'copy' },
      createRect('L', { x: 0, y: 0 }, { x: 20, y: 20 }),
      { ...createRect('L', { x: 0, y: 0 }, { x: 20, y: 20 }), id: 'rect-copy' },
    ])

    expect(result.duplicates).toBe(2)
    expect(result.entities).toHaveLength(2)
  })

  it('reports nothing to do on a drawing that is already clean', () => {
    const clean: CadEntity[] = [at('a', [0, 0], [50, 0]), at('b', [0, 20], [50, 20]), createCircle('L', { x: 0, y: 0 }, 8)]

    const result = overkill(clean)

    expect(result.duplicates).toBe(0)
    expect(result.merged).toBe(0)
    expect(result.entities).toHaveLength(3)
  })

  it('forgives the last bit of floating point drift', () => {
    const result = overkill([at('a', [0, 0], [50, 0]), at('b', [1e-12, 0], [50, 1e-12])])

    expect(result.duplicates).toBe(1)
  })
})
