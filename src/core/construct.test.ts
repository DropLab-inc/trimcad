import { describe, expect, it } from 'vitest'
import {
  arcFromCenterStartEnd,
  arcFromStartCenterAngle,
  arcThroughPoints,
  circleOnDiameter,
  circleTangentToTwo,
  circleThroughPoints,
  cornerRadius,
  polygonOnEdge,
  rectFromCenter,
  rectFromCorners,
  rectFromDimensions,
} from './construct'
import { distance, type Vec2 } from './math/vec2'
import type { CadEntity, PolylineEntity } from './types'

const line = (id: string, a: Vec2, b: Vec2): CadEntity => ({
  id,
  type: 'line',
  layerId: '0',
  start: a,
  end: b,
})

const circle = (id: string, center: Vec2, radius: number): CadEntity => ({
  id,
  type: 'circle',
  layerId: '0',
  center,
  radius,
})

describe('circleOnDiameter', () => {
  it('puts the centre midway between the two points', () => {
    const shape = circleOnDiameter({ x: 0, y: 0 }, { x: 10, y: 0 })
    expect(shape?.center).toEqual({ x: 5, y: 0 })
    expect(shape?.radius).toBeCloseTo(5)
  })

  it('measures the diameter along the slope rather than across the axes', () => {
    const shape = circleOnDiameter({ x: 0, y: 0 }, { x: 6, y: 8 })
    expect(shape?.center).toEqual({ x: 3, y: 4 })
    expect(shape?.radius).toBeCloseTo(5)
  })

  it('refuses two points in the same place, which describe no circle', () => {
    expect(circleOnDiameter({ x: 4, y: 4 }, { x: 4, y: 4 })).toBeNull()
  })
})

describe('circleThroughPoints', () => {
  it('recovers a circle from three points taken off it', () => {
    const shape = circleThroughPoints({ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 })
    expect(shape?.center.x).toBeCloseTo(0)
    expect(shape?.center.y).toBeCloseTo(0)
    expect(shape?.radius).toBeCloseTo(10)
  })

  it('does not care which order the points are picked in', () => {
    const a = circleThroughPoints({ x: 3, y: 1 }, { x: 9, y: 5 }, { x: 4, y: 8 })
    const b = circleThroughPoints({ x: 4, y: 8 }, { x: 3, y: 1 }, { x: 9, y: 5 })
    expect(b?.center.x).toBeCloseTo(a!.center.x)
    expect(b?.center.y).toBeCloseTo(a!.center.y)
    expect(b?.radius).toBeCloseTo(a!.radius)
  })

  it('passes through all three points, not just the first', () => {
    const points: Vec2[] = [
      { x: 2, y: 3 },
      { x: 11, y: 4 },
      { x: 5, y: 12 },
    ]
    const shape = circleThroughPoints(points[0], points[1], points[2])!
    for (const point of points) expect(distance(shape.center, point)).toBeCloseTo(shape.radius)
  })

  it('refuses three points in a straight line, which no circle passes through', () => {
    expect(circleThroughPoints({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 })).toBeNull()
  })
})

describe('circleTangentToTwo', () => {
  const across = line('across', { x: 0, y: 0 }, { x: 20, y: 0 })
  const up = line('up', { x: 0, y: 0 }, { x: 0, y: 20 })

  it('tucks a circle into the corner the two lines were clicked on', () => {
    const shape = circleTangentToTwo(
      { entity: across, point: { x: 8, y: 0 } },
      { entity: up, point: { x: 0, y: 8 } },
      3,
    )
    expect(shape?.center.x).toBeCloseTo(3)
    expect(shape?.center.y).toBeCloseTo(3)
    expect(shape?.radius).toBeCloseTo(3)
  })

  it('sits on the far side when the lines are clicked from the other quadrant', () => {
    const shape = circleTangentToTwo(
      { entity: across, point: { x: 8, y: 0 } },
      { entity: line('down', { x: 0, y: 0 }, { x: 0, y: -20 }), point: { x: 0, y: -8 } },
      3,
    )
    expect(shape?.center.x).toBeCloseTo(3)
    expect(shape?.center.y).toBeCloseTo(-3)
  })

  it('touches both lines at exactly the radius', () => {
    const slanted = line('slanted', { x: 0, y: 0 }, { x: 20, y: 20 })
    const shape = circleTangentToTwo(
      { entity: across, point: { x: 10, y: 0 } },
      { entity: slanted, point: { x: 7, y: 7 } },
      4,
    )!
    // The distance from a centre to a line is what tangency means, so both must come out as 4.
    expect(Math.abs(shape.center.y)).toBeCloseTo(4)
    expect(Math.abs(shape.center.x - shape.center.y) / Math.SQRT2).toBeCloseTo(4)
  })

  it('rides around the outside of two circles when clicked on their outer faces', () => {
    const left = circle('left', { x: 0, y: 0 }, 5)
    const right = circle('right', { x: 30, y: 0 }, 5)
    const shape = circleTangentToTwo(
      { entity: left, point: { x: 0, y: -5 } },
      { entity: right, point: { x: 30, y: -5 } },
      20,
    )!
    expect(distance(shape.center, { x: 0, y: 0 })).toBeCloseTo(25)
    expect(distance(shape.center, { x: 30, y: 0 })).toBeCloseTo(25)
    expect(shape.center.y).toBeLessThan(0)
  })

  it('bridges a line and a circle', () => {
    const shape = circleTangentToTwo(
      { entity: across, point: { x: 10, y: 0 } },
      { entity: circle('above', { x: 10, y: 20 }, 5), point: { x: 10, y: 15 } },
      8,
    )!
    // Sitting on the line puts the centre a radius above it, and touching the circle from outside
    // puts the two centres the sum of their radii apart.
    expect(shape.center.y).toBeCloseTo(8)
    expect(distance(shape.center, { x: 10, y: 20 })).toBeCloseTo(13)
  })

  it('refuses a circle too small to reach across the gap between a line and a circle', () => {
    // The circle's underside stands 15 above the line, which a radius of 4 cannot span.
    expect(
      circleTangentToTwo(
        { entity: across, point: { x: 10, y: 0 } },
        { entity: circle('above', { x: 10, y: 20 }, 5), point: { x: 10, y: 15 } },
        4,
      ),
    ).toBeNull()
  })

  it('picks the side of a rectangle that was clicked rather than the whole outline', () => {
    const box: PolylineEntity = {
      id: 'box',
      type: 'polyline',
      layerId: '0',
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
    }
    const shape = circleTangentToTwo(
      { entity: box, point: { x: 10, y: 0 } },
      { entity: box, point: { x: 0, y: 10 } },
      3,
    )!
    expect(shape.center.x).toBeCloseTo(3)
    expect(shape.center.y).toBeCloseTo(3)
  })

  it('refuses a radius of zero, which describes no circle', () => {
    expect(
      circleTangentToTwo({ entity: across, point: { x: 8, y: 0 } }, { entity: up, point: { x: 0, y: 8 } }, 0),
    ).toBeNull()
  })

  it('refuses two parallel lines further apart than the circle could span', () => {
    expect(
      circleTangentToTwo(
        { entity: across, point: { x: 8, y: 0 } },
        { entity: line('far', { x: 0, y: 40 }, { x: 20, y: 40 }), point: { x: 8, y: 40 } },
        3,
      ),
    ).toBeNull()
  })
})

describe('cornerRadius', () => {
  it('leaves an inscribed polygon at the radius given, since its corners sit on the circle', () => {
    expect(cornerRadius('inscribed', 10, 6)).toBeCloseTo(10)
  })

  it('pushes the corners of a circumscribed polygon out past the circle', () => {
    // A square around a circle of radius 10 reaches its corners at 10 over cos 45 degrees.
    expect(cornerRadius('circumscribed', 10, 4)).toBeCloseTo(10 * Math.SQRT2)
  })

  it('keeps the flats of a circumscribed polygon on the circle', () => {
    const sides = 5
    const reach = cornerRadius('circumscribed', 10, sides)
    // The middle of a side sits at the corner radius scaled down by the half angle of that side.
    expect(reach * Math.cos(Math.PI / sides)).toBeCloseTo(10)
  })

  it('narrows the difference as the polygon gains sides and approaches its circle', () => {
    expect(cornerRadius('circumscribed', 10, 64)).toBeCloseTo(10, 1)
  })
})

describe('polygonOnEdge', () => {
  it('stands a square on the edge that was drawn', () => {
    const shape = polygonOnEdge('0', { x: 0, y: 0 }, { x: 10, y: 0 }, 4) as PolylineEntity
    expect(shape.closed).toBe(true)
    expect(shape.points).toHaveLength(4)
    expect(shape.points[0]).toEqual({ x: 0, y: 0 })
    expect(shape.points[1].x).toBeCloseTo(10)
    expect(shape.points[1].y).toBeCloseTo(0)
    // Built to the left of the edge, so the square rises above it.
    expect(shape.points[2].y).toBeCloseTo(10)
  })

  it('gives every side the length of the edge it was given', () => {
    const shape = polygonOnEdge('0', { x: 2, y: 1 }, { x: 5, y: 5 }, 7) as PolylineEntity
    const points = shape.points
    for (let index = 0; index < points.length; index += 1) {
      expect(distance(points[index], points[(index + 1) % points.length])).toBeCloseTo(5)
    }
  })

  it('closes back onto its first point, leaving no gap after the last turn', () => {
    const shape = polygonOnEdge('0', { x: 0, y: 0 }, { x: 4, y: 0 }, 9) as PolylineEntity
    const last = shape.points.at(-1)!
    expect(distance(last, shape.points[0])).toBeCloseTo(4)
  })

  it('refuses an edge with no length', () => {
    expect(polygonOnEdge('0', { x: 1, y: 1 }, { x: 1, y: 1 }, 5)).toBeNull()
  })
})

describe('arcThroughPoints', () => {
  it('sweeps through the middle point on the way from the first to the last', () => {
    const shape = arcThroughPoints({ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 })!
    expect(shape.center.x).toBeCloseTo(0)
    expect(shape.center.y).toBeCloseTo(0)
    expect(shape.radius).toBeCloseTo(10)
    expect(shape.startAngle).toBeCloseTo(0)
    expect(shape.endAngle).toBeCloseTo(Math.PI)
  })

  it('refuses three points in a straight line', () => {
    expect(arcThroughPoints({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 })).toBeNull()
  })
})

describe('arcFromStartCenterAngle', () => {
  it('sweeps the included angle from the start ray', () => {
    const shape = arcFromStartCenterAngle({ x: 10, y: 0 }, { x: 0, y: 0 }, 90)!
    expect(shape.radius).toBeCloseTo(10)
    expect(shape.startAngle).toBeCloseTo(0)
    expect(shape.endAngle).toBeCloseTo(Math.PI / 2)
  })

  it('refuses a zero angle', () => {
    expect(arcFromStartCenterAngle({ x: 10, y: 0 }, { x: 0, y: 0 }, 0)).toBeNull()
  })
})

describe('arcFromCenterStartEnd', () => {
  it('keeps the radius of the start point even when the end is farther out', () => {
    const shape = arcFromCenterStartEnd({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 20 })!
    expect(shape.radius).toBeCloseTo(5)
    expect(shape.endAngle).toBeCloseTo(Math.PI / 2)
  })
})

describe('rectFromCorners', () => {
  it('builds an axis-aligned rectangle from opposite corners', () => {
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 10, y: 6 })).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ])
  })

  it('reads the second corner in rotated axes when a rotation is given', () => {
    // At 90°, the local x-axis points up the world y-axis, so a local (10, 6) corner lands at (-6, 10).
    const points = rectFromCorners({ x: 0, y: 0 }, { x: -6, y: 10 }, Math.PI / 2)
    expect(points[1].x).toBeCloseTo(0)
    expect(points[1].y).toBeCloseTo(10)
    expect(points[2].x).toBeCloseTo(-6)
    expect(points[2].y).toBeCloseTo(10)
  })
})

describe('rectFromCenter', () => {
  it('puts the centre midway between opposite corners', () => {
    const points = rectFromCenter({ x: 5, y: 5 }, { x: 10, y: 8 })
    expect(points[0]).toEqual({ x: 0, y: 2 })
    expect(points[2]).toEqual({ x: 10, y: 8 })
  })
})

describe('rectFromDimensions', () => {
  it('builds a rectangle of the given length and width', () => {
    expect(rectFromDimensions({ x: 0, y: 0 }, 10, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 0, y: 4 },
    ])
  })

  it('refuses a zero side', () => {
    expect(rectFromDimensions({ x: 0, y: 0 }, 10, 0)).toBeNull()
  })
})
