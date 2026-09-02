import { describe, expect, it } from 'vitest'
import { fieldsForTool, hasTypedValue, parseCoordinate, resolveDynamicPoint, type DynamicField } from './dynamicInput'

const field = (key: string, tracked: number, typed?: string): DynamicField => ({
  key,
  label: key,
  tracked,
  typed,
})

describe('dynamic input fields', () => {
  it('offers length and angle once a line has a start point', () => {
    const fields = fieldsForTool('line', [{ x: 0, y: 0 }], { x: 30, y: 40 })!

    expect(fields.map((entry) => entry.key)).toEqual(['length', 'angle'])
    expect(fields[0].tracked).toBeCloseTo(50, 3)
    expect(fields[1].tracked).toBeCloseTo(53.13, 1)
  })

  it('reports angles measured anticlockwise from zero to 360', () => {
    const fields = fieldsForTool('line', [{ x: 0, y: 0 }], { x: -10, y: 0 })!
    expect(fields[1].tracked).toBeCloseTo(180, 3)
  })

  it('offers a radius for circles and width and height for rectangles', () => {
    expect(fieldsForTool('circle', [{ x: 0, y: 0 }], { x: 3, y: 4 })![0]).toMatchObject({ key: 'radius', tracked: 5 })
    expect(fieldsForTool('rect', [{ x: 0, y: 0 }], { x: 20, y: 8 })!.map((entry) => entry.tracked)).toEqual([20, 8])
  })

  it('offers nothing before a command has a base point', () => {
    expect(fieldsForTool('line', [], { x: 5, y: 5 })).toBeNull()
    expect(fieldsForTool('select', [{ x: 0, y: 0 }], { x: 5, y: 5 })).toBeNull()
  })

  it('knows when the user has typed something', () => {
    expect(hasTypedValue([field('length', 10)])).toBe(false)
    expect(hasTypedValue([field('length', 10, '')])).toBe(false)
    expect(hasTypedValue([field('length', 10, '25')])).toBe(true)
  })
})

describe('resolving typed values to a point', () => {
  it('uses a typed length while the angle still follows the cursor', () => {
    const fields = [field('length', 50, '100'), field('angle', 0)]

    const point = resolveDynamicPoint('line', fields, [{ x: 0, y: 0 }], { x: 50, y: 0 })

    expect(point.x).toBeCloseTo(100, 6)
    expect(point.y).toBeCloseTo(0, 6)
  })

  it('uses a typed angle while the length still follows the cursor', () => {
    const fields = [field('length', 10), field('angle', 12, '90')]

    const point = resolveDynamicPoint('line', fields, [{ x: 0, y: 0 }], { x: 10, y: 2 })

    expect(point.x).toBeCloseTo(0, 6)
    expect(point.y).toBeCloseTo(10, 6)
  })

  it('honours both fields when both are typed', () => {
    const fields = [field('length', 1, '250'), field('angle', 1, '30')]

    const point = resolveDynamicPoint('line', fields, [{ x: 100, y: 100 }], { x: 0, y: 0 })

    expect(point.x).toBeCloseTo(100 + 250 * Math.cos(Math.PI / 6), 6)
    expect(point.y).toBeCloseTo(100 + 250 * Math.sin(Math.PI / 6), 6)
  })

  it('measures from the most recent point of a polyline', () => {
    const fields = [field('length', 1, '10'), field('angle', 1, '0')]
    const draft = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ]

    expect(resolveDynamicPoint('polyline', fields, draft, { x: 0, y: 0 }).x).toBeCloseTo(50, 6)
  })

  it('places a typed circle radius along the direction of the cursor', () => {
    const point = resolveDynamicPoint('circle', [field('radius', 5, '20')], [{ x: 0, y: 0 }], { x: 1, y: 0 })
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(20, 6)
  })

  it('keeps a typed rectangle on the side the cursor is on', () => {
    const fields = [field('width', 1, '60'), field('height', 1, '20')]

    const upperRight = resolveDynamicPoint('rect', fields, [{ x: 0, y: 0 }], { x: 5, y: 5 })
    const lowerLeft = resolveDynamicPoint('rect', fields, [{ x: 0, y: 0 }], { x: -5, y: -5 })

    expect(upperRight).toEqual({ x: 60, y: 20 })
    expect(lowerLeft).toEqual({ x: -60, y: -20 })
  })

  it('falls back to the tracked value when the typed text is not a number', () => {
    const point = resolveDynamicPoint('line', [field('length', 40, '-'), field('angle', 0)], [{ x: 0, y: 0 }], { x: 40, y: 0 })
    expect(point.x).toBeCloseTo(40, 6)
  })
})

describe('typed coordinates', () => {
  it('reads an absolute coordinate', () => {
    expect(parseCoordinate('50,30', undefined)).toEqual({ x: 50, y: 30 })
  })

  it('reads a relative coordinate from the last point', () => {
    expect(parseCoordinate('@10,-5', { x: 100, y: 100 })).toEqual({ x: 110, y: 95 })
  })

  it('reads a relative polar coordinate', () => {
    const point = parseCoordinate('@100<90', { x: 10, y: 10 })!
    expect(point.x).toBeCloseTo(10, 6)
    expect(point.y).toBeCloseTo(110, 6)
  })

  it('treats a relative coordinate with no previous point as measured from the origin', () => {
    expect(parseCoordinate('@10,10', undefined)).toEqual({ x: 10, y: 10 })
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseCoordinate('  20,40 ', undefined)).toEqual({ x: 20, y: 40 })
  })

  it('rejects anything that is not a coordinate', () => {
    expect(parseCoordinate('LINE', undefined)).toBeNull()
    expect(parseCoordinate('', undefined)).toBeNull()
    expect(parseCoordinate('abc,def', undefined)).toBeNull()
    expect(parseCoordinate('10<abc', undefined)).toBeNull()
  })
})
