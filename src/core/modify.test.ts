import { describe, expect, it } from 'vitest'
import { createCircle, createLine, createRect } from './commands'
import { mirrorEntity } from './geometry'
import { extendEntity, offsetEntity, trimEntity } from './modify'
import type { ArcEntity, CadEntity, PolylineEntity } from './types'

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
