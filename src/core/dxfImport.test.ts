import { describe, expect, it } from 'vitest'
import { makeDefaultDocument } from './document'
import { importDocumentFromDxf } from './dxf'
import type { CadEntity } from './types'

/** Builds a DXF by hand, so these tests read the same bytes another program would write. */
const dxfWith = (body: string): string => `0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF`

const pairs = (...values: Array<[number | string, number | string]>): string =>
  values.map(([code, value]) => `${code}\n${value}\n`).join('')

const importEntities = (body: string): CadEntity[] =>
  importDocumentFromDxf(dxfWith(body), makeDefaultDocument()).entities

describe('reading curves from a DXF another program wrote', () => {
  it('reads an arc, taking its angles as radians', () => {
    const body = `0\nARC\n${pairs([8, '0'], [10, 0], [20, 0], [40, 10], [50, 0], [51, 90])}`
    const arc = importEntities(body)[0]

    expect(arc.type).toBe('arc')
    if (arc.type === 'arc') {
      expect(arc.radius).toBe(10)
      expect(arc.startAngle).toBeCloseTo(0, 6)
      expect(arc.endAngle).toBeCloseTo(Math.PI / 2, 6)
    }
  })

  it('curves a polyline segment that carries a bulge', () => {
    const body = `0\nLWPOLYLINE\n${pairs([8, '0'], [90, 3], [70, 0], [10, 0], [20, 0], [42, 0.5], [10, 10], [20, 0], [10, 20], [20, 5])}`
    const polyline = importEntities(body)[0]

    expect(polyline.type).toBe('polyline')
    if (polyline.type === 'polyline') {
      // A straight reading would give exactly the three vertices; the arc adds many more.
      expect(polyline.points.length).toBeGreaterThan(10)
      expect(polyline.points[0]).toMatchObject({ x: 0, y: 0 })
      expect(polyline.points.at(-1)).toMatchObject({ x: 20, y: 5 })

      // Every point of the bulged span sits on the arc of radius 6.25 centred at (5, 3.75).
      const onArc = polyline.points.filter(
        (point) => Math.abs(Math.hypot(point.x - 5, point.y - 3.75) - 6.25) < 1e-6,
      )
      expect(onArc.length).toBeGreaterThan(5)
    }
  })

  it('leaves a polyline without bulges exactly as it was written', () => {
    const body = `0\nLWPOLYLINE\n${pairs([8, '0'], [90, 3], [70, 0], [10, 0], [20, 0], [10, 10], [20, 0], [10, 20], [20, 5])}`
    const polyline = importEntities(body)[0]

    if (polyline.type === 'polyline') {
      expect(polyline.points).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 5 },
      ])
    }
  })

  it('keeps a part of an ellipse a part, rather than closing it into a full one', () => {
    const body = `0\nELLIPSE\n${pairs([8, '0'], [10, 0], [20, 0], [11, 10], [21, 0], [40, 0.5], [41, 0], [42, Math.PI])}`
    const arc = importEntities(body)[0]

    // A half ellipse has no entity of its own, so it comes in as the outline it traces.
    expect(arc.type).toBe('polyline')
    if (arc.type === 'polyline') {
      expect(arc.closed).toBe(false)
      expect(arc.points[0].x).toBeCloseTo(10, 6)
      expect(arc.points.at(-1)!.x).toBeCloseTo(-10, 6)
      // The minor axis is half the major one, so the arc peaks at 5.
      expect(Math.max(...arc.points.map((point) => point.y))).toBeCloseTo(5, 4)
    }
  })

  it('reads a whole ellipse as an ellipse', () => {
    const body = `0\nELLIPSE\n${pairs([8, '0'], [10, 0], [20, 0], [11, 10], [21, 0], [40, 0.5], [41, 0], [42, Math.PI * 2])}`
    const ellipse = importEntities(body)[0]

    expect(ellipse.type).toBe('ellipse')
    if (ellipse.type === 'ellipse') {
      expect(ellipse.rx).toBeCloseTo(10, 6)
      expect(ellipse.ry).toBeCloseTo(5, 6)
    }
  })

  it('follows the real curve of a spline instead of its control points', () => {
    const knots = [0, 0, 0, 0, 1, 1, 1, 1].map((knot) => `40\n${knot}\n`).join('')
    const body = `0\nSPLINE\n${pairs([8, '0'], [70, 8], [71, 3], [72, 8], [73, 4])}${knots}${pairs([10, 0], [20, 0], [10, 5], [20, 10], [10, 15], [20, -10], [10, 20], [20, 0])}`
    const spline = importEntities(body)[0]

    expect(spline.type).toBe('spline')
    if (spline.type === 'spline') {
      const points = spline.controlPoints
      expect(points[0].x).toBeCloseTo(0, 6)
      expect(points.at(-1)!.x).toBeCloseTo(20, 6)

      // The curve stays well clear of the middle control points, which it must not pass through.
      const nearest = Math.min(...points.map((point) => Math.hypot(point.x - 5, point.y - 10)))
      expect(nearest).toBeGreaterThan(1)

      // A cubic Bezier over these points peaks near y = 2.5 rather than the control point's y = 10.
      expect(Math.max(...points.map((point) => point.y))).toBeLessThan(4)
    }
  })

  it('prefers a spline\u2019s fit points, which do lie on the curve', () => {
    const body = `0\nSPLINE\n${pairs([8, '0'], [71, 3], [74, 3], [11, 0], [21, 0], [11, 5], [21, 10], [11, 10], [21, 0])}`
    const spline = importEntities(body)[0]

    if (spline.type === 'spline') {
      expect(spline.controlPoints).toEqual([
        { x: 0, y: 0 },
        { x: 5, y: 10 },
        { x: 10, y: 0 },
      ])
    }
  })
})
