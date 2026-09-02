import { describe, expect, it } from 'vitest'
import { bulgeArcPoints, ellipticalArcPoints, expandBulges, sampleBSpline } from './dxfCurves'
import type { Vec2 } from './math/vec2'

const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y)

describe('polyline bulges', () => {
  it('leaves a straight segment straight', () => {
    expect(bulgeArcPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toEqual([{ x: 10, y: 0 }])
  })

  it('turns a bulge of 1 into a half circle', () => {
    const points = bulgeArcPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)
    const center = { x: 5, y: 0 }

    // Every point on a half circle sits one radius from the chord's midpoint.
    for (const point of points) expect(distance(center, point)).toBeCloseTo(5, 6)
  })

  it('sweeps anticlockwise for a positive bulge', () => {
    // Anticlockwise from left to right runs under the chord, and the sagitta is bulge x half chord.
    const points = bulgeArcPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)
    const apex = points[Math.floor(points.length / 2) - 1]
    expect(apex.y).toBeCloseTo(-5, 6)
  })

  it('sweeps the other way for a negative bulge', () => {
    const points = bulgeArcPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, -1)
    const apex = points[Math.floor(points.length / 2) - 1]
    expect(apex.y).toBeCloseTo(5, 6)
  })

  it('lands exactly on the far end of the segment', () => {
    const points = bulgeArcPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5)
    expect(points.at(-1)!.x).toBeCloseTo(10, 6)
    expect(points.at(-1)!.y).toBeCloseTo(0, 6)
  })

  it('uses the radius the bulge implies', () => {
    // A bulge of 0.5 across a chord of 10 subtends 106 degrees, giving a radius of 6.25.
    const points = bulgeArcPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5)
    const center = { x: 5, y: 3.75 }
    for (const point of points) expect(distance(center, point)).toBeCloseTo(6.25, 6)
  })

  it('expands only the vertices that carry a bulge', () => {
    const points = expandBulges(
      [
        { x: 0, y: 0, bulge: 0.5 },
        { x: 10, y: 0 },
        { x: 20, y: 5 },
      ],
      false,
    )

    // The straight run stays two points; the bulged one becomes many.
    expect(points.length).toBeGreaterThan(3)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)).toEqual({ x: 20, y: 5 })
  })

  it('does not repeat the start point when the run is closed', () => {
    const points = expandBulges(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      true,
    )
    expect(points).toHaveLength(3)
  })
})

describe('elliptical arcs', () => {
  it('traces only the part of the ellipse that was asked for', () => {
    const points = ellipticalArcPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5, 0, Math.PI)

    expect(points[0].x).toBeCloseTo(10, 6)
    expect(points[0].y).toBeCloseTo(0, 6)
    expect(points.at(-1)!.x).toBeCloseTo(-10, 6)
    // A half sweep stays on one side of the centre.
    for (const point of points) expect(point.y).toBeGreaterThanOrEqual(-1e-9)
  })

  it('follows the minor axis given by the ratio', () => {
    const points = ellipticalArcPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5, 0, Math.PI)
    const top = points.reduce((best, point) => (point.y > best.y ? point : best))
    expect(top.y).toBeCloseTo(5, 6)
  })

  it('honours the rotation of the major axis', () => {
    // A major axis pointing up means the long direction is vertical.
    const points = ellipticalArcPoints({ x: 0, y: 0 }, { x: 0, y: 10 }, 0.5, 0, Math.PI)
    expect(points[0].x).toBeCloseTo(0, 6)
    expect(points[0].y).toBeCloseTo(10, 6)
  })
})

describe('B-splines', () => {
  const control: Vec2[] = [
    { x: 0, y: 0 },
    { x: 5, y: 10 },
    { x: 15, y: -10 },
    { x: 20, y: 0 },
  ]
  const knots = [0, 0, 0, 0, 1, 1, 1, 1]

  it('starts and ends on the first and last control points', () => {
    const points = sampleBSpline(control, 3, knots)
    expect(points[0].x).toBeCloseTo(0, 6)
    expect(points[0].y).toBeCloseTo(0, 6)
    expect(points.at(-1)!.x).toBeCloseTo(20, 6)
    expect(points.at(-1)!.y).toBeCloseTo(0, 6)
  })

  it('does not pass through the middle control points, as a B-spline should not', () => {
    const points = sampleBSpline(control, 3, knots)
    const nearest = Math.min(...points.map((point) => distance(point, control[1])))
    expect(nearest).toBeGreaterThan(1)
  })

  it('matches the Bezier a single cubic span is equivalent to', () => {
    // With a clamped knot vector and four points, the curve is exactly a cubic Bezier.
    const points = sampleBSpline(control, 3, knots, 4)
    const t = 0.5
    const bezier = (a: number, b: number, c: number, d: number) =>
      (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d

    expect(points[2].x).toBeCloseTo(bezier(0, 5, 15, 20), 6)
    expect(points[2].y).toBeCloseTo(bezier(0, 10, -10, 0), 6)
  })

  it('copes when a file leaves the knots out', () => {
    const points = sampleBSpline(control, 3, undefined)
    expect(points.length).toBeGreaterThan(2)
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })

  it('copes when the knot count does not match the control points', () => {
    const points = sampleBSpline(control, 3, [0, 1, 2])
    expect(points.every((point) => Number.isFinite(point.x))).toBe(true)
  })

  it('handles a straight two point spline', () => {
    const points = sampleBSpline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      3,
      undefined,
    )
    expect(points.at(-1)!.x).toBeCloseTo(10, 6)
  })
})
