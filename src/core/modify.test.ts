import { describe, expect, it } from 'vitest'
import { createCircle, createLine, createRect } from './commands'
import { mirrorEntity } from './geometry'
import { extendEntity, extendResult, fenceHits, offsetEntity, trimEntity, trimResult } from './modify'
import type { ArcEntity, CadEntity, EllipseEntity, PolylineEntity } from './types'

const arc = (overrides: Partial<ArcEntity> = {}): ArcEntity => ({
  id: 'arc',
  type: 'arc',
  layerId: 'L',
  center: { x: 0, y: 0 },
  radius: 10,
  startAngle: 0,
  endAngle: Math.PI,
  ...overrides,
})

describe('offset', () => {
  it('offsets a line to the side that was picked', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })

    const above = offsetEntity(line, 10, { x: 50, y: -30 })
    const below = offsetEntity(line, 10, { x: 50, y: 30 })

    expect(above?.type === 'line' && above.start.y).toBeCloseTo(-10, 6)
    expect(below?.type === 'line' && below.start.y).toBeCloseTo(10, 6)
  })

  it('keeps the offset line parallel and the same length', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 30, y: 40 })
    const result = offsetEntity(line, 5, { x: 40, y: 0 })

    expect(result?.type).toBe('line')
    if (result?.type === 'line') {
      const originalLength = Math.hypot(30, 40)
      expect(Math.hypot(result.end.x - result.start.x, result.end.y - result.start.y)).toBeCloseTo(originalLength, 6)
      // Perpendicular distance from the original start to the offset line equals the distance.
      expect(Math.hypot(result.start.x - 0, result.start.y - 0)).toBeCloseTo(5, 6)
    }
  })

  it('grows a circle when the pick is outside and shrinks it when inside', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 20)

    expect(offsetEntity(circle, 5, { x: 40, y: 0 })).toMatchObject({ radius: 25 })
    expect(offsetEntity(circle, 5, { x: 2, y: 0 })).toMatchObject({ radius: 15 })
  })

  it('refuses to shrink a circle out of existence', () => {
    expect(offsetEntity(createCircle('L', { x: 0, y: 0 }, 5), 10, { x: 0, y: 0 })).toBeNull()
  })

  it('offsets a rectangle inwards as a true parallel outline, not a diagonal shift', () => {
    const rect = createRect('L', { x: 0, y: 0 }, { x: 100, y: 60 })

    const result = offsetEntity(rect, 10, { x: 50, y: 30 }) as PolylineEntity

    expect(result.type).toBe('polyline')
    const xs = result.points.map((point) => point.x)
    const ys = result.points.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(10, 6)
    expect(Math.max(...xs)).toBeCloseTo(90, 6)
    expect(Math.min(...ys)).toBeCloseTo(10, 6)
    expect(Math.max(...ys)).toBeCloseTo(50, 6)
  })

  it('offsets a rectangle outwards when the pick is outside it', () => {
    const rect = createRect('L', { x: 0, y: 0 }, { x: 100, y: 60 })

    const result = offsetEntity(rect, 10, { x: -40, y: 30 }) as PolylineEntity
    const xs = result.points.map((point) => point.x)

    expect(Math.min(...xs)).toBeCloseTo(-10, 6)
    expect(Math.max(...xs)).toBeCloseTo(110, 6)
  })

  it('gives the offset copy a new id so it does not replace the original', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })
    expect(offsetEntity(line, 2, { x: 5, y: 5 })?.id).not.toBe(line.id)
  })
})

describe('trim', () => {
  it('removes the middle of a line between two cutters', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })
    const cutters = [
      createLine('L', { x: 30, y: -10 }, { x: 30, y: 10 }),
      createLine('L', { x: 70, y: -10 }, { x: 70, y: 10 }),
    ]

    const pieces = trimEntity(target, cutters, { x: 50, y: 0 })!

    expect(pieces).toHaveLength(2)
    const [first, second] = pieces as [CadEntity & { start: { x: number } }, CadEntity & { end: { x: number } }]
    expect(first.type === 'line' && first.start.x).toBeCloseTo(0, 6)
    expect(pieces[0].type === 'line' && pieces[0].end.x).toBeCloseTo(30, 6)
    expect(pieces[1].type === 'line' && pieces[1].start.x).toBeCloseTo(70, 6)
    expect(second.type === 'line' && second.end.x).toBeCloseTo(100, 6)
  })

  it('removes the end of a line past a single cutter', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })
    const cutter = createLine('L', { x: 40, y: -10 }, { x: 40, y: 10 })

    const pieces = trimEntity(target, [cutter], { x: 80, y: 0 })!

    expect(pieces).toHaveLength(1)
    expect(pieces[0].type === 'line' && pieces[0].end.x).toBeCloseTo(40, 6)
  })

  it('turns a circle into an arc covering everything except the picked piece', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    const cutter = createLine('L', { x: -20, y: 0 }, { x: 20, y: 0 })

    const pieces = trimEntity(circle, [cutter], { x: 0, y: 10 })!

    expect(pieces).toHaveLength(1)
    expect(pieces[0].type).toBe('arc')
    if (pieces[0].type === 'arc') {
      // The picked half spanned 0..pi, so the surviving arc runs from pi back round to 0.
      expect(pieces[0].startAngle).toBeCloseTo(Math.PI, 5)
      expect(pieces[0].endAngle).toBeCloseTo(0, 5)
    }
  })

  it('trims a polyline and keeps the untouched vertices', () => {
    const polyline: PolylineEntity = {
      id: 'p',
      type: 'polyline',
      layerId: 'L',
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
    }
    const cutter = createLine('L', { x: 20, y: -10 }, { x: 20, y: 10 })

    const pieces = trimEntity(polyline, [cutter], { x: 5, y: 0 })!

    expect(pieces).toHaveLength(1)
    if (pieces[0].type === 'polyline') {
      expect(pieces[0].points[0].x).toBeCloseTo(20, 6)
      expect(pieces[0].points.at(-1)).toEqual({ x: 50, y: 50 })
    }
  })

  it('returns null when nothing crosses the object', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })
    const other = createLine('L', { x: 0, y: 50 }, { x: 100, y: 50 })
    expect(trimEntity(target, [other], { x: 50, y: 0 })).toBeNull()
  })

  it('ignores the object itself as a cutter', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })
    expect(trimEntity(target, [target], { x: 50, y: 0 })).toBeNull()
  })
})

/**
 * An oval is the one primitive the crossings had no answer for, in either role: as the object being
 * trimmed and as the edge doing the cutting. The two roles are checked separately because they read
 * different machinery — the exact line/ellipse solve, and the outline walked as chords.
 */
describe('trimming against an oval', () => {
  const oval = (overrides: Partial<EllipseEntity> = {}): EllipseEntity => ({
    id: 'oval',
    type: 'ellipse',
    layerId: 'L',
    center: { x: 0, y: 0 },
    rx: 20,
    ry: 10,
    rotation: 0,
    ...overrides,
  })

  /** The vertical line x = 10, which crosses this oval at y = ±√75. */
  const across = () => createLine('L', { x: 10, y: -50 }, { x: 10, y: 50 })

  it('cuts a line back to the outline of the oval it runs through', () => {
    const pieces = trimEntity(across(), [oval()], { x: 10, y: 0 })!
    expect(pieces).toHaveLength(2)

    const ends = pieces.flatMap((piece) => (piece.type === 'line' ? [piece.end, piece.start] : []))
    const inner = ends
      .map((point) => Math.abs(point.y))
      .filter((y) => y < 50)
      .sort((a, b) => a - b)
    // ±√75 to nine decimals: the crossing is solved, not read off a chord of the outline, which
    // would be out by about a hundredth.
    expect(inner).toHaveLength(2)
    expect(inner[0]).toBeCloseTo(Math.sqrt(75), 9)
    expect(inner[1]).toBeCloseTo(Math.sqrt(75), 9)
  })

  it('lengthens a line out to the oval it stops short of', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 5, y: 0 })

    const result = extendEntity(target, [oval()], { x: 5, y: 0 })!

    expect(result.type === 'line' && result.end.x).toBeCloseTo(20, 9)
  })

  it('cuts the oval where a line crosses it, leaving the rest of the outline', () => {
    const cut = trimResult(oval(), [across()], { x: 19, y: 0 })!
    expect(cut.removed.type).toBe('polyline')
    const removed = cut.removed as PolylineEntity

    // The right-hand end of the oval goes: from one crossing, round the far vertex, to the other.
    expect(removed.points[0].x).toBeCloseTo(10, 9)
    expect(removed.points[0].y).toBeCloseTo(-Math.sqrt(75), 9)
    expect(removed.points.at(-1)!.y).toBeCloseTo(Math.sqrt(75), 9)
    expect(Math.max(...removed.points.map((point) => point.x))).toBeCloseTo(20, 6)

    // What survives is the far side of the outline, in one piece, as an oval has no ends to split it.
    expect(cut.remaining).toHaveLength(1)
    const left = cut.remaining[0] as PolylineEntity
    expect(Math.min(...left.points.map((point) => point.x))).toBeCloseTo(-20, 6)
  })

  it('cuts the oval where a circle crosses it', () => {
    // A circle meets an oval on a quartic, so this one is read off the chords — within a chord's
    // worth of the outline rather than on it.
    const cutter = { ...createCircle('L', { x: 25, y: 0 }, 12), id: 'circle' }

    const cut = trimResult(oval(), [cutter], { x: -19, y: 0 })!

    const ends = (cut.removed as PolylineEntity).points
    const near = Math.max(...ends.map((point) => point.x))
    expect(near).toBeGreaterThan(10)
    expect(near).toBeLessThan(20)
    for (const point of [ends[0], ends.at(-1)!]) {
      const invariant = (point.x / 20) ** 2 + (point.y / 10) ** 2
      expect(Math.abs(invariant - 1)).toBeLessThan(0.01)
    }
  })

  it('turns the crossings with the oval, not just with the axes', () => {
    const tilted = oval({ rotation: Math.PI / 2 })
    const target = createLine('L', { x: -50, y: 10 }, { x: 50, y: 10 })

    const pieces = trimEntity(target, [tilted], { x: 0, y: 10 })!

    expect(pieces).toHaveLength(2)
    // Tilted a quarter turn, the 20 radius now runs up the y axis, so it is crossed at x = ±√75.
    const inner = pieces
      .flatMap((piece) => (piece.type === 'line' ? [piece.start, piece.end] : []))
      .map((point) => Math.abs(point.x))
      .filter((x) => x < 50)
      .sort((a, b) => a - b)
    expect(inner[0]).toBeCloseTo(Math.sqrt(75), 9)
  })

  it('leaves an oval nothing crosses alone', () => {
    const elsewhere = createLine('L', { x: 100, y: -10 }, { x: 100, y: 10 })
    expect(trimResult(oval(), [elsewhere], { x: 19, y: 0 })).toBeNull()
  })

  it('counts an oval among the objects a fence crosses', () => {
    const hits = fenceHits([oval()], { x: -50, y: 0 }, { x: 50, y: 0 })

    expect(hits).toHaveLength(2)
    expect(hits[0].point.x).toBeCloseTo(-20, 9)
    expect(hits[1].point.x).toBeCloseTo(20, 9)
  })
})

describe('extend', () => {
  it('lengthens the end of a line nearest the pick until it meets a boundary', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 50, y: 0 })
    const boundary = createLine('L', { x: 90, y: -20 }, { x: 90, y: 20 })

    const result = extendEntity(target, [boundary], { x: 48, y: 0 })!

    expect(result.type === 'line' && result.end.x).toBeCloseTo(90, 6)
    expect(result.type === 'line' && result.start.x).toBeCloseTo(0, 6)
  })

  it('lengthens the start when the pick is nearer that end', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 50, y: 0 })
    const boundary = createLine('L', { x: -30, y: -20 }, { x: -30, y: 20 })

    const result = extendEntity(target, [boundary], { x: 2, y: 0 })!

    expect(result.type === 'line' && result.start.x).toBeCloseTo(-30, 6)
    expect(result.type === 'line' && result.end.x).toBeCloseTo(50, 6)
  })

  it('stops at the nearest boundary when several lie ahead', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })
    const near = createLine('L', { x: 40, y: -5 }, { x: 40, y: 5 })
    const far = createLine('L', { x: 80, y: -5 }, { x: 80, y: 5 })

    const result = extendEntity(target, [far, near], { x: 9, y: 0 })!

    expect(result.type === 'line' && result.end.x).toBeCloseTo(40, 6)
  })

  it('extends to meet a circle', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })
    const circle = createCircle('L', { x: 50, y: 0 }, 10)

    const result = extendEntity(target, [circle], { x: 9, y: 0 })!

    expect(result.type === 'line' && result.end.x).toBeCloseTo(40, 6)
  })

  it('returns null when there is nothing ahead of the end', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })
    const behind = createLine('L', { x: -40, y: -5 }, { x: -40, y: 5 })
    expect(extendEntity(target, [behind], { x: 9, y: 0 })).toBeNull()
  })

  it('sweeps an arc forward to the first boundary it meets', () => {
    // A chord at y = -5 crosses the radius-10 circle at 7pi/6 and 11pi/6.
    const boundary = createLine('L', { x: -20, y: -5 }, { x: 20, y: -5 })

    const result = extendEntity(arc({ endAngle: Math.PI / 2 }), [boundary], { x: 0, y: 10 })!

    expect(result.type).toBe('arc')
    if (result.type === 'arc') {
      expect(result.endAngle).toBeCloseTo((7 * Math.PI) / 6, 5)
      expect(result.startAngle).toBeCloseTo(0, 5)
    }
  })

  it('sweeps an arc backwards when the pick is nearer its start', () => {
    const boundary = createLine('L', { x: -20, y: -5 }, { x: 20, y: -5 })

    const result = extendEntity(arc({ endAngle: Math.PI / 2 }), [boundary], { x: 10, y: 0 })!

    if (result.type === 'arc') {
      expect(result.startAngle).toBeCloseTo((11 * Math.PI) / 6, 5)
      expect(result.endAngle).toBeCloseTo(Math.PI / 2, 5)
    }
  })
})

describe('mirror', () => {
  it('mirrors a line about a vertical axis', () => {
    const line = createLine('L', { x: 10, y: 0 }, { x: 20, y: 5 })

    const result = mirrorEntity(line, { x: 0, y: -10 }, { x: 0, y: 10 })

    expect(result.type === 'line' && result.start.x).toBeCloseTo(-10, 6)
    expect(result.type === 'line' && result.end.x).toBeCloseTo(-20, 6)
    expect(result.type === 'line' && result.end.y).toBeCloseTo(5, 6)
  })

  it('mirrors about an arbitrary sloping axis', () => {
    const line = createLine('L', { x: 10, y: 0 }, { x: 10, y: 0 })

    const result = mirrorEntity(line, { x: 0, y: 0 }, { x: 10, y: 10 })

    expect(result.type === 'line' && result.start.x).toBeCloseTo(0, 6)
    expect(result.type === 'line' && result.start.y).toBeCloseTo(10, 6)
  })

  it('keeps a circle the same size on the far side of the axis', () => {
    const circle = createCircle('L', { x: 30, y: 10 }, 7)

    const result = mirrorEntity(circle, { x: 0, y: 0 }, { x: 0, y: 100 })

    expect(result.type === 'circle' && result.center.x).toBeCloseTo(-30, 6)
    expect(result.type === 'circle' && result.radius).toBe(7)
  })
})

describe('trim and extend previews', () => {
  it('reports the exact span a trim would delete', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })
    const first = createLine('L', { x: 20, y: -10 }, { x: 20, y: 10 })
    const second = createLine('L', { x: 60, y: -10 }, { x: 60, y: 10 })

    const result = trimResult(target, [first, second], { x: 40, y: 0 })!

    expect(result.removed.type === 'line' && result.removed.start.x).toBeCloseTo(20, 6)
    expect(result.removed.type === 'line' && result.removed.end.x).toBeCloseTo(60, 6)
    expect(result.remaining).toHaveLength(2)
  })

  it('reports only the new material an extend would add', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 50, y: 0 })
    const boundary = createLine('L', { x: 90, y: -10 }, { x: 90, y: 10 })

    const result = extendResult(target, [boundary], { x: 48, y: 0 })!

    expect(result.added.type === 'line' && result.added.start.x).toBeCloseTo(50, 6)
    expect(result.added.type === 'line' && result.added.end.x).toBeCloseTo(90, 6)
    expect(result.entity.type === 'line' && result.entity.end.x).toBeCloseTo(90, 6)
  })

  it('gives previews a stable id so hover does not remount them', () => {
    const target = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })
    const cutter = createLine('L', { x: 50, y: -10 }, { x: 50, y: 10 })

    const first = trimResult(target, [cutter], { x: 80, y: 0 })!
    const second = trimResult(target, [cutter], { x: 90, y: 0 })!

    expect(first.removed.id).toBe(second.removed.id)
    expect(first.removed.id).not.toBe(target.id)
  })

  it('leaves the picked piece out of what remains', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    const cutter = createLine('L', { x: -20, y: 0 }, { x: 20, y: 0 })

    const result = trimResult(circle, [cutter], { x: 0, y: 9 })!

    expect(result.removed.type).toBe('arc')
    expect(result.remaining).toHaveLength(1)
    // The surviving arc is the lower half, running from 180 degrees back round to 0.
    expect(result.remaining[0].type === 'arc' && result.remaining[0].startAngle).toBeCloseTo(Math.PI, 5)
  })
})

describe('trimming something that has already been trimmed', () => {
  it('erases the middle piece once both its ends sit on cutting edges', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 400, y: 0 })
    const left = createLine('L', { x: 100, y: -10 }, { x: 100, y: 10 })
    const right = createLine('L', { x: 300, y: -10 }, { x: 300, y: 10 })

    const first = trimResult(line, [left, right], { x: 350, y: 0 })!
    const middle = first.remaining.find(
      (piece) => piece.type === 'line' && Math.abs(piece.start.x - 100) < 1e-6,
    )!

    // The middle piece runs edge to edge, so nothing crosses its interior any more.
    const second = trimResult(middle, [left, right], { x: 200, y: 0 })!

    expect(second.remaining).toHaveLength(0)
  })

  it('erases a stub left hanging off a single edge', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 200, y: 0 })
    const cutter = createLine('L', { x: 100, y: -10 }, { x: 100, y: 10 })

    const first = trimResult(line, [cutter], { x: 150, y: 0 })!
    expect(first.remaining).toHaveLength(1)

    const second = trimResult(first.remaining[0], [cutter], { x: 50, y: 0 })!

    expect(second.remaining).toHaveLength(0)
  })

  it('still refuses to trim an object that touches no edge at all', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })
    const elsewhere = createLine('L', { x: 0, y: 50 }, { x: 100, y: 50 })

    expect(trimResult(line, [elsewhere], { x: 50, y: 0 })).toBeNull()
  })

  it('erases a half arc whose ends rest on the line that cut it', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    const cutter = createLine('L', { x: -20, y: 0 }, { x: 20, y: 0 })

    const first = trimResult(circle, [cutter], { x: 0, y: 9 })!
    const half = first.remaining[0]

    const second = trimResult(half, [cutter], { x: 0, y: -9 })!

    expect(second.remaining).toHaveLength(0)
  })

  it('erases a polyline leg that has already been cut back to an edge', () => {
    const path = createRect('L', { x: 0, y: 0 }, { x: 100, y: 60 }) as PolylineEntity
    const open: PolylineEntity = { ...path, closed: false }
    const cutter = createLine('L', { x: 50, y: -10 }, { x: 50, y: 10 })

    const first = trimResult(open, [cutter], { x: 20, y: 0 })!
    expect(first.remaining).toHaveLength(1)

    const second = trimResult(first.remaining[0], [cutter], { x: 80, y: 0 })

    expect(second?.remaining).toHaveLength(0)
  })
})

describe('fence', () => {
  it('lists each crossing along the fence in order', () => {
    const first = createLine('L', { x: 0, y: 10 }, { x: 100, y: 10 })
    const second = createLine('L', { x: 0, y: 20 }, { x: 100, y: 20 })
    const third = createLine('L', { x: 0, y: 30 }, { x: 100, y: 30 })

    const hits = fenceHits([first, second, third], { x: 50, y: 0 }, { x: 50, y: 40 })

    expect(hits.map((hit) => hit.entity.id)).toEqual([first.id, second.id, third.id])
    expect(hits.map((hit) => hit.point.y)).toEqual([10, 20, 30])
  })

  it('records both crossings when the fence cuts a circle twice', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)

    const hits = fenceHits([circle], { x: -20, y: 0 }, { x: 20, y: 0 })

    expect(hits).toHaveLength(2)
    expect(hits.map((hit) => hit.point.x)).toEqual([-10, 10])
  })

  it('ignores objects the fence stops short of', () => {
    const line = createLine('L', { x: 0, y: 100 }, { x: 100, y: 100 })

    expect(fenceHits([line], { x: 50, y: 0 }, { x: 50, y: 40 })).toHaveLength(0)
  })
})
