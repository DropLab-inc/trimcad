import { describe, expect, it } from 'vitest'
import { polarArrayCopies, polarStep, rectangularArrayCopies } from './array'
import { createCircle, createLine } from './commands'
import type { CircleEntity } from './types'

const centreOf = (entity: { type: string }): { x: number; y: number } => {
  if (entity.type !== 'circle') throw new Error('expected a circle')
  return (entity as CircleEntity).center
}

describe('rectangularArrayCopies', () => {
  const source = createCircle('0', { x: 0, y: 0 }, 1)

  it('fills the grid but leaves out the square the original already occupies', () => {
    const copies = rectangularArrayCopies([source], {
      rows: 2,
      columns: 3,
      rowSpacing: 5,
      columnSpacing: 10,
    })
    expect(copies).toHaveLength(5)
  })

  it('steps the columns across and the rows up', () => {
    const copies = rectangularArrayCopies([source], {
      rows: 2,
      columns: 2,
      rowSpacing: 5,
      columnSpacing: 10,
    })
    const places = copies.map(centreOf)
    expect(places).toContainEqual({ x: 10, y: 0 })
    expect(places).toContainEqual({ x: 0, y: 5 })
    expect(places).toContainEqual({ x: 10, y: 5 })
  })

  it('builds downwards and leftwards when the spacing is negative', () => {
    const copies = rectangularArrayCopies([source], {
      rows: 1,
      columns: 2,
      rowSpacing: 0,
      columnSpacing: -8,
    })
    expect(centreOf(copies[0])).toEqual({ x: -8, y: 0 })
  })

  it('gives every copy an id of its own so they can be selected apart', () => {
    const copies = rectangularArrayCopies([source], {
      rows: 3,
      columns: 3,
      rowSpacing: 5,
      columnSpacing: 5,
    })
    const ids = new Set(copies.map((entity) => entity.id))
    expect(ids.size).toBe(copies.length)
    expect(ids.has(source.id)).toBe(false)
  })

  it('repeats every object in the selection, not just the first', () => {
    const copies = rectangularArrayCopies([source, createLine('0', { x: 0, y: 0 }, { x: 1, y: 0 })], {
      rows: 1,
      columns: 4,
      rowSpacing: 0,
      columnSpacing: 10,
    })
    expect(copies).toHaveLength(6)
  })

  it('makes nothing from a single row and column, which is the original alone', () => {
    expect(rectangularArrayCopies([source], { rows: 1, columns: 1, rowSpacing: 5, columnSpacing: 5 })).toHaveLength(0)
  })
})

describe('polarStep', () => {
  it('divides a full turn by the item count, so the last does not land on the first', () => {
    expect(polarStep(4, 360)).toBeCloseTo(90)
  })

  it('divides a partial sweep by the gaps, so the last lands on the fill angle', () => {
    // Four items across 180 degrees sit at 0, 60, 120 and 180.
    expect(polarStep(4, 180)).toBeCloseTo(60)
  })

  it('sweeps backwards for a negative fill angle', () => {
    expect(polarStep(3, -90)).toBeCloseTo(-45)
  })

  it('has nowhere to step with a single item', () => {
    expect(polarStep(1, 360)).toBe(0)
  })
})

describe('polarArrayCopies', () => {
  const source = createCircle('0', { x: 10, y: 0 }, 1)

  it('spreads a full turn evenly around the centre', () => {
    const copies = polarArrayCopies([source], { x: 0, y: 0 }, {
      count: 4,
      fillAngle: 360,
      rotateItems: true,
    })
    expect(copies).toHaveLength(3)
    const places = copies.map(centreOf)
    expect(places[0].x).toBeCloseTo(0)
    expect(places[0].y).toBeCloseTo(10)
    expect(places[1].x).toBeCloseTo(-10)
    expect(places[1].y).toBeCloseTo(0)
  })

  it('keeps every copy the same distance from the centre', () => {
    const copies = polarArrayCopies([source], { x: 0, y: 0 }, {
      count: 7,
      fillAngle: 360,
      rotateItems: true,
    })
    for (const copy of copies) {
      const place = centreOf(copy)
      expect(Math.hypot(place.x, place.y)).toBeCloseTo(10)
    }
  })

  it('ends a partial sweep on the fill angle', () => {
    const copies = polarArrayCopies([source], { x: 0, y: 0 }, {
      count: 3,
      fillAngle: 180,
      rotateItems: true,
    })
    const last = centreOf(copies.at(-1)!)
    expect(last.x).toBeCloseTo(-10)
    expect(last.y).toBeCloseTo(0)
  })

  it('turns each copy to follow the sweep when asked to', () => {
    const spoke = createLine('0', { x: 10, y: 0 }, { x: 20, y: 0 })
    const copies = polarArrayCopies([spoke], { x: 0, y: 0 }, {
      count: 4,
      fillAngle: 360,
      rotateItems: true,
    })
    const turned = copies[0]
    if (turned.type !== 'line') throw new Error('expected a line')
    // A quarter turn stands the spoke on end, pointing away from the centre as it did before.
    expect(turned.start.x).toBeCloseTo(0)
    expect(turned.start.y).toBeCloseTo(10)
    expect(turned.end.x).toBeCloseTo(0)
    expect(turned.end.y).toBeCloseTo(20)
  })

  it('carries copies around the sweep without turning them when asked not to', () => {
    const spoke = createLine('0', { x: 10, y: 0 }, { x: 20, y: 0 })
    const copies = polarArrayCopies([spoke], { x: 0, y: 0 }, {
      count: 4,
      fillAngle: 360,
      rotateItems: false,
    })
    const carried = copies[0]
    if (carried.type !== 'line') throw new Error('expected a line')
    // Still lying flat, but moved to where a quarter turn would have taken its middle.
    expect(carried.end.y - carried.start.y).toBeCloseTo(0)
    expect(carried.start.x).toBeCloseTo(-5)
    expect(carried.start.y).toBeCloseTo(15)
  })

  it('makes nothing from a single item', () => {
    expect(polarArrayCopies([source], { x: 0, y: 0 }, { count: 1, fillAngle: 360, rotateItems: true })).toHaveLength(0)
  })
})
