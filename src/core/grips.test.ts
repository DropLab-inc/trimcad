import { describe, expect, it } from 'vitest'
import { createCircle, createLine, createRect } from './commands'
import { dragGrip, entityGrips, findGripAt } from './grips'
import type { ArcEntity, CadEntity, DimensionEntity, EllipseEntity, PolylineEntity, SplineEntity } from './types'

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

const ellipse = (overrides: Partial<EllipseEntity> = {}): EllipseEntity => ({
  id: 'ellipse',
  type: 'ellipse',
  layerId: 'L',
  center: { x: 0, y: 0 },
  rx: 20,
  ry: 10,
  rotation: 0,
  ...overrides,
})

/** The grip of a given kind and index, which is how the viewport addresses them. */
const gripOf = (entity: CadEntity, kind: string, index = 0) => {
  const found = entityGrips(entity).find((grip) => grip.kind === kind && grip.index === index)
  if (!found) throw new Error(`no ${kind} grip at ${index}`)
  return found
}

describe('which grips a shape offers', () => {
  it('gives a line both ends and a middle that carries the whole line', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })

    expect(entityGrips(line).map((grip) => grip.kind)).toEqual(['vertex', 'move', 'vertex'])
    expect(gripOf(line, 'move').point).toEqual({ x: 50, y: 0 })
  })

  it('gives a rectangle one grip per corner', () => {
    const rect = createRect('L', { x: 0, y: 0 }, { x: 40, y: 20 })

    const grips = entityGrips(rect)
    expect(grips).toHaveLength(4)
    expect(grips.every((grip) => grip.kind === 'vertex')).toBe(true)
  })

  it('gives a circle a centre and four quadrants', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)

    expect(entityGrips(circle).map((grip) => grip.kind)).toEqual(['move', 'radius', 'radius', 'radius', 'radius'])
  })

  it('puts an arc grip halfway along the arc, not across the chord', () => {
    const bulge = gripOf(arc(), 'bulge')

    // Halfway round a quarter turn of radius 10 sits at 45 degrees, well outside the chord.
    expect(bulge.point.x).toBeCloseTo(10 * Math.cos(Math.PI / 4), 6)
    expect(bulge.point.y).toBeCloseTo(10 * Math.sin(Math.PI / 4), 6)
  })

  it('puts ellipse grips on the ends of both axes', () => {
    const points = entityGrips(ellipse()).map((grip) => grip.point)

    expect(points).toContainEqual({ x: 20, y: 0 })
    expect(points).toContainEqual({ x: -20, y: 0 })
    expect(points).toContainEqual({ x: 0, y: 10 })
    expect(points).toContainEqual({ x: 0, y: -10 })
  })

  it('turns a rotated ellipse\u2019s grips with it', () => {
    const turned = ellipse({ rotation: Math.PI / 2 })

    const major = gripOf(turned, 'axis', 0).point
    expect(major.x).toBeCloseTo(0, 6)
    expect(major.y).toBeCloseTo(20, 6)
  })

  it('offers a dimension its two measured points and where its line sits', () => {
    const dimension: DimensionEntity = {
      id: 'd',
      type: 'dimension',
      layerId: 'L',
      dimType: 'linear',
      p1: { x: 0, y: 0 },
      p2: { x: 50, y: 0 },
      placement: { x: 25, y: 20 },
    }

    expect(entityGrips(dimension).map((grip) => grip.point)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 25, y: 20 },
    ])
  })
})

describe('dragging a grip', () => {
  it('moves only the end that was taken hold of', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })

    const stretched = dragGrip(line, gripOf(line, 'vertex', 1), { x: 100, y: 60 })

    expect(stretched.type === 'line' && stretched.start).toEqual({ x: 0, y: 0 })
    expect(stretched.type === 'line' && stretched.end).toEqual({ x: 100, y: 60 })
  })

  it('carries the whole line when the middle grip is dragged', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })

    const moved = dragGrip(line, gripOf(line, 'move'), { x: 50, y: 25 })

    expect(moved.type === 'line' && moved.start).toEqual({ x: 0, y: 25 })
    expect(moved.type === 'line' && moved.end).toEqual({ x: 100, y: 25 })
  })

  it('moves one rectangle corner and leaves the other three alone', () => {
    const rect = createRect('L', { x: 0, y: 0 }, { x: 40, y: 20 }) as PolylineEntity
    const corner = entityGrips(rect).findIndex((grip) => grip.point.x === 40 && grip.point.y === 20)

    const pulled = dragGrip(rect, entityGrips(rect)[corner], { x: 70, y: 35 }) as PolylineEntity

    expect(pulled.points[corner]).toEqual({ x: 70, y: 35 })
    expect(pulled.points.filter((_, index) => index !== corner)).toEqual(
      rect.points.filter((_, index) => index !== corner),
    )
    expect(pulled.closed).toBe(true)
  })

  it('resizes a circle from a quadrant without shifting its centre', () => {
    const circle = createCircle('L', { x: 5, y: 5 }, 10)

    const resized = dragGrip(circle, gripOf(circle, 'radius', 0), { x: 30, y: 5 })

    expect(resized.type === 'circle' && resized.radius).toBeCloseTo(25, 6)
    expect(resized.type === 'circle' && resized.center).toEqual({ x: 5, y: 5 })
  })

  it('moves a circle by its centre grip', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)

    const moved = dragGrip(circle, gripOf(circle, 'move'), { x: 40, y: -15 })

    expect(moved.type === 'circle' && moved.center).toEqual({ x: 40, y: -15 })
    expect(moved.type === 'circle' && moved.radius).toBe(10)
  })

  it('swings an arc end round its centre and keeps the radius', () => {
    const shape = arc()

    const swung = dragGrip(shape, gripOf(shape, 'angle', 1), { x: -60, y: 0 })

    expect(swung.type === 'arc' && swung.endAngle).toBeCloseTo(Math.PI, 6)
    expect(swung.type === 'arc' && swung.radius).toBe(10)
  })

  it('changes an arc\u2019s radius from the grip halfway along it', () => {
    const shape = arc()

    const fatter = dragGrip(shape, gripOf(shape, 'bulge'), { x: 20, y: 20 })

    expect(fatter.type === 'arc' && fatter.radius).toBeCloseTo(Math.hypot(20, 20), 6)
    expect(fatter.type === 'arc' && fatter.startAngle).toBe(0)
    expect(fatter.type === 'arc' && fatter.endAngle).toBe(Math.PI / 2)
  })

  it('changes one ellipse axis at a time', () => {
    const shape = ellipse()

    const wider = dragGrip(shape, gripOf(shape, 'axis', 0), { x: 35, y: 0 })

    expect(wider.type === 'ellipse' && wider.rx).toBeCloseTo(35, 6)
    expect(wider.type === 'ellipse' && wider.ry).toBe(10)
  })

  it('ignores sideways drift so a dragged axis does not tumble the ellipse', () => {
    const shape = ellipse()

    // Well off the axis, but only the distance along it should count.
    const wider = dragGrip(shape, gripOf(shape, 'axis', 0), { x: 35, y: 90 })

    expect(wider.type === 'ellipse' && wider.rx).toBeCloseTo(35, 6)
    expect(wider.type === 'ellipse' && wider.rotation).toBe(0)
  })

  it('refuses to shrink a circle to nothing', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)

    const squashed = dragGrip(circle, gripOf(circle, 'radius', 0), { x: 0, y: 0 })

    expect(squashed.type === 'circle' && squashed.radius).toBeGreaterThan(0)
  })

  it('moves a spline control point', () => {
    const spline: SplineEntity = {
      id: 's',
      type: 'spline',
      layerId: 'L',
      controlPoints: [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 20, y: 0 },
      ],
    }

    const bent = dragGrip(spline, gripOf(spline, 'vertex', 1), { x: 10, y: 50 }) as SplineEntity

    expect(bent.controlPoints).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 50 },
      { x: 20, y: 0 },
    ])
  })

  it('drags where a dimension line sits without moving what it measures', () => {
    const dimension: DimensionEntity = {
      id: 'd',
      type: 'dimension',
      layerId: 'L',
      dimType: 'linear',
      p1: { x: 0, y: 0 },
      p2: { x: 50, y: 0 },
      placement: { x: 25, y: 20 },
    }

    const pushed = dragGrip(dimension, gripOf(dimension, 'vertex', 3), { x: 25, y: 45 }) as DimensionEntity

    expect(pushed.placement).toEqual({ x: 25, y: 45 })
    expect(pushed.p1).toEqual({ x: 0, y: 0 })
    expect(pushed.p2).toEqual({ x: 50, y: 0 })
  })
})

describe('finding the grip under the cursor', () => {
  const line = createLine('L', { x: 0, y: 0 }, { x: 100, y: 0 })

  it('takes hold of a grip within the tolerance', () => {
    const hit = findGripAt({ x: 2, y: 2 }, [line], 5)

    expect(hit?.grip.point).toEqual({ x: 0, y: 0 })
    expect(hit?.entity.id).toBe(line.id)
  })

  it('lets go once the cursor is further away than the tolerance', () => {
    expect(findGripAt({ x: 20, y: 20 }, [line], 5)).toBeNull()
  })

  it('prefers the nearer of two grips that both fall inside the tolerance', () => {
    const short = createLine('L', { x: 0, y: 0 }, { x: 8, y: 0 })

    const hit = findGripAt({ x: 7, y: 0 }, [short], 20)

    expect(hit?.grip.point).toEqual({ x: 8, y: 0 })
  })

  it('offers nothing when nothing is selected', () => {
    expect(findGripAt({ x: 0, y: 0 }, [], 5)).toBeNull()
  })
})
