import { beforeEach, describe, expect, it } from 'vitest'
import { chamferCorner, filletCorner, type CornerResult } from './modify'
import { applyDrawTool, currentPrompt, useCadStore } from './store'
import { formatPrompt } from './prompts'
import type { Vec2 } from './math/vec2'
import type { ArcEntity, CadEntity, CircleEntity, LineEntity, PolylineEntity } from './types'

const line = (id: string, start: Vec2, end: Vec2): LineEntity => ({
  id,
  type: 'line',
  layerId: 'L',
  start,
  end,
})

const polyline = (id: string, points: Vec2[], closed = true): PolylineEntity => ({
  id,
  type: 'polyline',
  layerId: 'L',
  closed,
  points,
})

/** A right angle at the origin: one arm east along x, one arm north along y. */
const eastArm = line('a', { x: 100, y: 0 }, { x: 0, y: 0 })
const northArm = line('b', { x: 0, y: 0 }, { x: 0, y: 100 })
const onEast = { x: 60, y: 0 }
const onNorth = { x: 0, y: 60 }

const at = (entity: CadEntity, point: Vec2) => ({ entity, point })

/** Point comparison that tolerates the last bit or two of trigonometry. */
const expectPoints = (actual: Vec2[], expected: Vec2[]) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x, 6)
    expect(point.y).toBeCloseTo(expected[index].y, 6)
  })
}
const linesOf = (result: CornerResult) => result.pieces.filter((p): p is LineEntity => p.type === 'line')
const arcOf = (result: CornerResult) => result.pieces.find((p): p is ArcEntity => p.type === 'arc') ?? null
const polylinesOf = (result: CornerResult) =>
  result.pieces.filter((p): p is PolylineEntity => p.type === 'polyline')

/** Rounds the right angle made by the two standalone arms. */
const filletArms = (radius: number) => filletCorner(at(eastArm, onEast), at(northArm, onNorth), radius)
const chamferArms = (a: number, b: number) => chamferCorner(at(eastArm, onEast), at(northArm, onNorth), a, b)

describe('filleting a corner between two lines', () => {
  it('rounds a right angle with an arc tangent to both arms', () => {
    const arc = arcOf(filletArms(10)!)!

    // The inscribed circle of a right angle sits at (r, r) from the corner.
    expect(arc.center.x).toBeCloseTo(10, 6)
    expect(arc.center.y).toBeCloseTo(10, 6)
    expect(arc.radius).toBeCloseTo(10, 6)
  })

  it('cuts both lines back to the points the arc is tangent at', () => {
    const [first, second] = linesOf(filletArms(10)!)

    // The corner end of each line moves out by the radius; the far end stays put.
    expect(first.start).toEqual({ x: 100, y: 0 })
    expect(first.end.x).toBeCloseTo(10, 6)
    expect(first.end.y).toBeCloseTo(0, 6)
    expect(second.start.x).toBeCloseTo(0, 6)
    expect(second.start.y).toBeCloseTo(10, 6)
    expect(second.end).toEqual({ x: 0, y: 100 })
  })

  it('sweeps the short way round rather than the long way', () => {
    const arc = arcOf(filletArms(10)!)!

    let sweep = arc.endAngle - arc.startAngle
    while (sweep <= 0) sweep += Math.PI * 2
    expect(sweep).toBeLessThan(Math.PI)
    expect(sweep).toBeCloseTo(Math.PI / 2, 6)
  })

  it('squares the corner off when the radius is zero', () => {
    const result = filletArms(0)!

    expect(arcOf(result)).toBeNull()
    expect(linesOf(result)[0].end).toEqual({ x: 0, y: 0 })
    expect(linesOf(result)[1].start).toEqual({ x: 0, y: 0 })
  })

  it('keeps the side of each line that was clicked', () => {
    // Two lines crossing at the origin, picked on their negative arms this time.
    const across = line('a', { x: -100, y: 0 }, { x: 100, y: 0 })
    const upright = line('b', { x: 0, y: -100 }, { x: 0, y: 100 })
    const arc = arcOf(filletCorner(at(across, { x: -60, y: 0 }), at(upright, { x: 0, y: -60 }), 10)!)!

    expect(arc.center.x).toBeCloseTo(-10, 6)
    expect(arc.center.y).toBeCloseTo(-10, 6)
  })

  it('reaches a corner the lines do not actually touch', () => {
    // Both lines stop well short of where they would meet.
    const shortEast = line('a', { x: 100, y: 0 }, { x: 40, y: 0 })
    const shortNorth = line('b', { x: 0, y: 40 }, { x: 0, y: 100 })
    const result = filletCorner(at(shortEast, { x: 70, y: 0 }), at(shortNorth, { x: 0, y: 70 }), 10)!

    const arc = arcOf(result)!
    expect(arc.center.x).toBeCloseTo(10, 6)
    expect(arc.center.y).toBeCloseTo(10, 6)
    // The short arm was extended down to the tangent point.
    expect(linesOf(result)[0].end.x).toBeCloseTo(10, 6)
  })

  it('refuses a radius that needs more line than there is', () => {
    const stub = line('a', { x: 5, y: 0 }, { x: 0, y: 0 })
    expect(filletCorner(at(stub, { x: 3, y: 0 }), at(northArm, onNorth), 40)).toBeNull()
  })

  it('refuses parallel lines, which make no corner', () => {
    const below = line('b', { x: 0, y: -20 }, { x: 100, y: -20 })
    expect(filletCorner(at(eastArm, onEast), at(below, { x: 60, y: -20 }), 10)).toBeNull()
  })

  it('refuses a radius that is not a number, as an emptied input box sends', () => {
    expect(filletArms(Number.NaN)).toBeNull()
    expect(chamferArms(Number.NaN, 10)).toBeNull()
  })

  it('rounds a shallow corner with a longer setback than a right angle needs', () => {
    // Arms 120 degrees apart: the tangent points sit r/tan(60) from the corner.
    const slanted = line('b', { x: 0, y: 0 }, { x: -100, y: 100 * Math.sqrt(3) })
    const result = filletCorner(at(eastArm, onEast), at(slanted, { x: -30, y: 30 * Math.sqrt(3) }), 10)!

    expect(linesOf(result)[0].end.x).toBeCloseTo(10 / Math.tan(Math.PI / 3), 6)
  })
})

describe('chamfering a corner between two lines', () => {
  it('bevels the corner with a straight line between the setback points', () => {
    const bevel = linesOf(chamferArms(10, 10)!)[2]

    expect(bevel.start).toEqual({ x: 10, y: 0 })
    expect(bevel.end).toEqual({ x: 0, y: 10 })
  })

  it('sets each line back by its own distance', () => {
    const [first, second] = linesOf(chamferArms(30, 5)!)

    expect(first.end.x).toBeCloseTo(30, 6)
    expect(second.start.y).toBeCloseTo(5, 6)
  })

  it('squares the corner off when both distances are zero', () => {
    const result = chamferArms(0, 0)!

    expect(linesOf(result)).toHaveLength(2)
    expect(linesOf(result)[0].end).toEqual({ x: 0, y: 0 })
  })

  it('refuses a distance longer than the line it is measured along', () => {
    const stub = line('a', { x: 5, y: 0 }, { x: 0, y: 0 })
    expect(chamferCorner(at(stub, { x: 3, y: 0 }), at(northArm, onNorth), 40, 10)).toBeNull()
  })

  it('refuses parallel lines', () => {
    const below = line('b', { x: 0, y: -20 }, { x: 100, y: -20 })
    expect(chamferCorner(at(eastArm, onEast), at(below, { x: 60, y: -20 }), 10, 10)).toBeNull()
  })
})

describe('corners on rectangles and other polylines', () => {
  /** A 100 x 60 rectangle with its bottom left at the origin, as the RECTANGLE tool draws one. */
  const rect = () => polyline('r', [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
  ])
  const onBottom = { x: 50, y: 0 }
  const onRight = { x: 100, y: 30 }
  const onLeft = { x: 0, y: 30 }

  it('rounds a rectangle corner where two sides meet', () => {
    const arc = arcOf(filletCorner(at(rect(), onBottom), at(rect(), onRight), 10)!)!

    expect(arc.center.x).toBeCloseTo(90, 6)
    expect(arc.center.y).toBeCloseTo(10, 6)
    expect(arc.radius).toBeCloseTo(10, 6)
  })

  it('opens the rectangle at the rounded corner so the arc is not doubled by a chord', () => {
    const result = filletCorner(at(rect(), onBottom), at(rect(), onRight), 10)!
    const [shape] = polylinesOf(result)

    expect(result.replacedIds).toEqual(['r'])
    expect(shape.closed).toBe(false)
    // The run now starts and ends at the two tangent points, with the arc closing the gap.
    expectPoints(shape.points, [
      { x: 100, y: 10 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
      { x: 0, y: 0 },
      { x: 90, y: 0 },
    ])
  })

  it('rounds the corner that straddles the start of the point list', () => {
    // The left and bottom sides meet at vertex zero, which is where the list wraps.
    const arc = arcOf(filletCorner(at(rect(), onLeft), at(rect(), onBottom), 10)!)!

    expect(arc.center.x).toBeCloseTo(10, 6)
    expect(arc.center.y).toBeCloseTo(10, 6)
  })

  it('bevels a rectangle corner without breaking the rectangle apart', () => {
    const result = chamferCorner(at(rect(), onBottom), at(rect(), onRight), 10, 10)!

    // One object in, one object out: the bevel is a vertex, not an extra line.
    expect(result.pieces).toHaveLength(1)
    const [shape] = polylinesOf(result)
    expect(shape.closed).toBe(true)
    expect(shape.points).toEqual([
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 100, y: 10 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ])
  })

  it('leaves a rectangle untouched when the corner is squared off at zero', () => {
    const result = chamferCorner(at(rect(), onBottom), at(rect(), onRight), 0, 0)!
    const [shape] = polylinesOf(result)

    expect(shape.points).toEqual(rect().points)
    expect(shape.closed).toBe(true)
  })

  it('rounds a polygon corner, where the sides are not at right angles', () => {
    // A hexagon of radius 100, as the POLYGON tool draws one.
    const hexagon = polyline(
      'h',
      Array.from({ length: 6 }, (_, index) => ({
        x: Math.cos((index / 6) * Math.PI * 2) * 100,
        y: Math.sin((index / 6) * Math.PI * 2) * 100,
      })),
    )
    const midpoint = (i: number, j: number) => ({
      x: (hexagon.points[i].x + hexagon.points[j].x) / 2,
      y: (hexagon.points[i].y + hexagon.points[j].y) / 2,
    })
    const result = filletCorner(at(hexagon, midpoint(0, 1)), at(hexagon, midpoint(1, 2)), 10)!

    const arc = arcOf(result)!
    expect(arc.radius).toBeCloseTo(10, 6)
    // Interior angle of a hexagon is 120 degrees, so the centre sits r/sin(60) in from the vertex.
    const vertex = hexagon.points[1]
    const inset = Math.hypot(arc.center.x - vertex.x, arc.center.y - vertex.y)
    expect(inset).toBeCloseTo(10 / Math.sin(Math.PI / 3), 6)
  })

  it('splits an open polyline in two when a middle corner is rounded', () => {
    const bent = polyline('p', [
      { x: -100, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 80, y: 100 },
    ], false)
    const result = filletCorner(at(bent, { x: -50, y: 0 }), at(bent, { x: 0, y: 50 }), 10)!

    const parts = polylinesOf(result)
    expect(parts).toHaveLength(2)
    expectPoints(parts[0].points, [{ x: -100, y: 0 }, { x: -10, y: 0 }])
    expectPoints(parts[1].points, [{ x: 0, y: 10 }, { x: 0, y: 100 }, { x: 80, y: 100 }])
    expect(arcOf(result)).not.toBeNull()
    // The two halves are separate objects, so they cannot share an id.
    expect(parts[0].id).not.toBe(parts[1].id)
  })

  it('joins a rectangle side to a separate line', () => {
    // A line running north from well right of the rectangle, meeting the bottom side extended.
    const post = line('l', { x: 200, y: 20 }, { x: 200, y: 120 })
    const result = filletCorner(at(rect(), onBottom), at(post, { x: 200, y: 80 }), 10)!

    expect(result.replacedIds).toEqual(['r', 'l'])
    const [shape] = polylinesOf(result)
    // Only the bottom side's far vertex moves out to the tangent point.
    expectPoints(shape.points.slice(0, 2), [{ x: 0, y: 0 }, { x: 190, y: 0 }])
    expect(shape.closed).toBe(true)
    expectPoints([linesOf(result)[0].start], [{ x: 200, y: 10 }])
  })

  it('refuses two sides of a rectangle that do not meet at a corner', () => {
    const onTop = { x: 50, y: 60 }
    expect(filletCorner(at(rect(), onBottom), at(rect(), onTop), 10)).toBeNull()
  })

  it('refuses the same side picked twice', () => {
    expect(filletCorner(at(rect(), { x: 30, y: 0 }), at(rect(), { x: 70, y: 0 }), 10)).toBeNull()
  })

})

describe('filleting a line against a circle or arc', () => {
  const circle = (center: Vec2, radius: number): CircleEntity => ({
    id: 'c',
    type: 'circle',
    layerId: 'L',
    center,
    radius,
  })

  /** A circle of radius 50 about the origin. */
  const ring = () => circle({ x: 0, y: 0 }, 50)
  /**
   * A line 50 above the top of that circle. Bridging a gap of 50 needs a radius of at least 25,
   * where the fillet touches the line and the circle at the single point directly between them.
   */
  const above = line('a', { x: -200, y: 100 }, { x: 200, y: 100 })
  /** A line straight through the middle of the circle, which leaves several corners to choose. */
  const through = line('a', { x: -200, y: 0 }, { x: 200, y: 0 })

  it('bridges the gap between a line and a circle with a tangent arc', () => {
    const arc = arcOf(filletCorner(at(above, { x: 0, y: 100 }), at(ring(), { x: 0, y: 50 }), 25)!)!

    expect(arc.radius).toBeCloseTo(25, 6)
    // Tangent to y = 100 puts the centre a radius below it, and touching the circle from outside
    // puts it radius + 50 from the origin.
    expect(arc.center.y).toBeCloseTo(75, 6)
    expect(Math.hypot(arc.center.x, arc.center.y)).toBeCloseTo(75, 6)
  })

  it('leaves the circle whole, as AutoCAD does, and cuts only the line', () => {
    const result = filletCorner(at(above, { x: -100, y: 100 }), at(ring(), { x: 0, y: 50 }), 25)!

    expect(result.replacedIds).toEqual(['a'])
    expect(linesOf(result)).toHaveLength(1)
    expect(result.pieces.some((piece) => piece.type === 'circle')).toBe(false)
  })

  it('keeps the side of the line that was clicked', () => {
    const left = filletCorner(at(above, { x: -150, y: 100 }), at(ring(), { x: 0, y: 50 }), 25)!
    const right = filletCorner(at(above, { x: 150, y: 100 }), at(ring(), { x: 0, y: 50 }), 25)!

    // The tangent point is at the origin's x, so each click keeps its own half of the line.
    expectPoints([linesOf(left)[0].start, linesOf(left)[0].end], [{ x: -200, y: 100 }, { x: 0, y: 100 }])
    expectPoints([linesOf(right)[0].start, linesOf(right)[0].end], [{ x: 0, y: 100 }, { x: 200, y: 100 }])
  })

  it('rounds on the side of the circle that was clicked, out of the eight it could choose', () => {
    const left = filletCorner(at(through, { x: -150, y: 0 }), at(ring(), { x: -50, y: 5 }), 10)!
    const right = filletCorner(at(through, { x: 150, y: 0 }), at(ring(), { x: 50, y: 5 }), 10)!

    expect(arcOf(left)!.center.x).toBeLessThan(0)
    expect(arcOf(right)!.center.x).toBeGreaterThan(0)
    expect(arcOf(left)!.radius).toBeCloseTo(10, 6)
  })

  it('trims an arc back to the tangent point, unlike a full circle', () => {
    // The upper half of the same ring, so a tangent point near its end falls inside the sweep.
    const half: ArcEntity = {
      id: 'r',
      type: 'arc',
      layerId: 'L',
      center: { x: 0, y: 0 },
      radius: 50,
      startAngle: 0,
      endAngle: Math.PI,
    }
    const result = filletCorner(at(through, { x: 150, y: 0 }), at(half, { x: 35, y: 35 }), 10)!

    expect(result.replacedIds).toEqual(['a', 'r'])
    // The trimmed original plus the new fillet.
    const arcs = result.pieces.filter((piece): piece is ArcEntity => piece.type === 'arc')
    expect(arcs).toHaveLength(2)
    const trimmed = arcs.find((piece) => piece.id === 'r')!
    // The click sat away from the tangent point, so that end of the sweep survives.
    expect(trimmed.endAngle).toBeCloseTo(Math.PI, 6)
    expect(trimmed.startAngle).toBeGreaterThan(0)
  })

  it('squares the join off at radius zero where the line crosses the circle', () => {
    const result = filletCorner(at(through, { x: -150, y: 0 }), at(ring(), { x: -50, y: 0 }), 0)!

    expect(arcOf(result)).toBeNull()
    expect(linesOf(result)[0].end.x).toBeCloseTo(-50, 6)
  })

  it('refuses a radius too small to reach across the gap', () => {
    // The gap here is 850, so nothing under 425 can span it.
    const far = line('a', { x: -200, y: 900 }, { x: 200, y: 900 })
    expect(filletCorner(at(far, { x: 0, y: 900 }), at(ring(), { x: 0, y: 50 }), 5)).toBeNull()
  })

  it('refuses two curves, which need a different construction', () => {
    const other: CircleEntity = { ...ring(), id: 'd', center: { x: 200, y: 0 } }
    expect(filletCorner(at(ring(), { x: 50, y: 0 }), at(other, { x: 150, y: 0 }), 10)).toBeNull()
  })

  it('rounds a rectangle side against a circle, not just a loose line', () => {
    const rect = polyline('r', [
      { x: -200, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 300 },
      { x: -200, y: 300 },
    ])
    const result = filletCorner(at(rect, { x: 100, y: 100 }), at(ring(), { x: 0, y: 50 }), 25)!

    expect(arcOf(result)!.radius).toBeCloseTo(25, 6)
    expect(polylinesOf(result)).toHaveLength(1)
  })

  it('refuses a circle for CHAMFER, which bevels straight edges only', () => {
    expect(chamferCorner(at(above, { x: 0, y: 100 }), at(ring(), { x: 0, y: 50 }), 10, 10)).toBeNull()
  })
})

describe('the FILLET and CHAMFER commands', () => {
  const state = () => useCadStore.getState()
  const entities = () => state().doc.entities
  const arcs = () => entities().filter((entity): entity is ArcEntity => entity.type === 'arc')
  const lines = () => entities().filter((entity): entity is LineEntity => entity.type === 'line')
  const shapes = () => entities().filter((entity): entity is PolylineEntity => entity.type === 'polyline')
  const lastStatus = () => state().statusMessage

  const load = (make: (layerId: string) => CadEntity[]) => {
    state().updateDocument((draft) => ({ ...draft, entities: make(draft.layers[0].id) }))
  }

  beforeEach(() => {
    state().cancelCommand()
    state().setSelection([])
    load((layerId) => [
      { ...eastArm, layerId },
      { ...northArm, layerId },
    ])
    state().setFilletRadius(10)
    state().setChamferDistance(10)
  })

  it('rounds the corner after picking both lines', () => {
    state().executeCommand('FILLET')
    applyDrawTool(onEast)
    // Nothing changes until the second line is picked.
    expect(arcs()).toHaveLength(0)

    applyDrawTool(onNorth)

    expect(arcs()).toHaveLength(1)
    expect(arcs()[0].radius).toBeCloseTo(10, 6)
    expect(lines()).toHaveLength(2)
  })

  it('rounds a rectangle corner, which is the shape most drawings start from', () => {
    load((layerId) => [
      { id: 'r', type: 'polyline', layerId, closed: true, points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
      ] },
    ])

    state().executeCommand('FILLET')
    applyDrawTool({ x: 50, y: 0 })
    applyDrawTool({ x: 100, y: 30 })

    expect(arcs()).toHaveLength(1)
    expect(arcs()[0].center.x).toBeCloseTo(90, 6)
    expect(shapes()).toHaveLength(1)
    expect(shapes()[0].closed).toBe(false)
  })

  it('bevels a rectangle corner in place, adding no new object', () => {
    load((layerId) => [
      { id: 'r', type: 'polyline', layerId, closed: true, points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
      ] },
    ])

    state().executeCommand('CHAMFER')
    applyDrawTool({ x: 50, y: 0 })
    applyDrawTool({ x: 100, y: 30 })

    expect(entities()).toHaveLength(1)
    expect(shapes()[0].points).toHaveLength(5)
    expect(shapes()[0].closed).toBe(true)
  })

  it('keeps the rounded rectangle where it was in the drawing order', () => {
    load((layerId) => [
      { ...line('under', { x: -50, y: -50 }, { x: -10, y: -50 }), layerId },
      { id: 'r', type: 'polyline', layerId, closed: true, points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
      ] },
      { ...line('over', { x: -50, y: -80 }, { x: -10, y: -80 }), layerId },
    ])

    state().executeCommand('FILLET')
    applyDrawTool({ x: 50, y: 0 })
    applyDrawTool({ x: 100, y: 30 })

    expect(entities()[0].id).toBe('under')
    expect(entities()[entities().length - 1].id).toBe('over')
  })

  it('bevels the corner with CHAMFER, adding a line rather than an arc', () => {
    state().executeCommand('CHAMFER')
    applyDrawTool(onEast)
    applyDrawTool(onNorth)

    expect(arcs()).toHaveLength(0)
    expect(lines()).toHaveLength(3)
  })

  it('stays armed so a run of corners can be worked through', () => {
    state().executeCommand('FILLET')
    applyDrawTool(onEast)
    applyDrawTool(onNorth)

    expect(state().activeTool).toBe('fillet')
    expect(state().modifyTargetId).toBeNull()
  })

  it('starts over rather than half-applying when the first pick misses', () => {
    state().executeCommand('FILLET')
    applyDrawTool({ x: 500, y: 500 })

    expect(state().modifyTargetId).toBeNull()
    expect(lastStatus()).toMatch(/no object/i)
  })

  it('rounds a line into a circle, leaving the circle whole', () => {
    load((layerId) => [
      { id: 'c', type: 'circle', layerId, center: { x: 0, y: 0 }, radius: 50 },
      { ...line('l', { x: -200, y: 100 }, { x: 200, y: 100 }), layerId },
    ])
    state().setFilletRadius(25)

    state().executeCommand('FILLET')
    applyDrawTool({ x: -100, y: 100 })
    applyDrawTool({ x: 0, y: 50 })

    expect(arcs()).toHaveLength(1)
    expect(arcs()[0].radius).toBeCloseTo(25, 6)
    // The circle is untouched, as AutoCAD leaves it.
    expect(entities().filter((entity) => entity.type === 'circle')).toHaveLength(1)
  })

  it('turns a curve away from CHAMFER, which bevels straight edges only', () => {
    load((layerId) => [{ id: 'c', type: 'circle', layerId, center: { x: 0, y: 0 }, radius: 50 }])
    state().executeCommand('CHAMFER')
    applyDrawTool({ x: 50, y: 0 })

    expect(state().modifyTargetId).toBeNull()
    expect(lastStatus()).toMatch(/straight edge/i)
  })

  it('says so when the radius will not fit', () => {
    state().setFilletRadius(400)
    state().executeCommand('FILLET')
    applyDrawTool(onEast)
    applyDrawTool(onNorth)

    expect(arcs()).toHaveLength(0)
    expect(lastStatus()).toMatch(/cannot be filleted/i)
    // The failed attempt is forgotten, so the next pick starts a fresh corner.
    expect(state().modifyTargetId).toBeNull()
  })

  it('squares the corner off at radius zero, leaving no arc behind', () => {
    state().setFilletRadius(0)
    state().executeCommand('FILLET')
    applyDrawTool(onEast)
    applyDrawTool(onNorth)

    expect(arcs()).toHaveLength(0)
    expect(lines()).toHaveLength(2)
    expect(lines()[0].end).toEqual({ x: 0, y: 0 })
  })

  it('asks for the radius through the Radius option', () => {
    state().executeCommand('FILLET')
    expect(formatPrompt(currentPrompt(state()))).toMatch(/Select first object.*Radius.*Radius = 10/)

    state().executeCommand('R')
    expect(formatPrompt(currentPrompt(state()))).toMatch(/Specify fillet radius/)

    state().executeCommand('25')
    expect(state().filletRadius).toBe(25)
    expect(formatPrompt(currentPrompt(state()))).toMatch(/Select first object/)
  })

  it('asks for the distance through CHAMFER\u2019s Distance option', () => {
    state().executeCommand('CHAMFER')
    state().executeCommand('D')
    state().executeCommand('4')

    expect(state().chamferDistance).toBe(4)
  })

  it('moves on to the second prompt once one line is picked', () => {
    state().executeCommand('FILLET')
    applyDrawTool(onEast)

    expect(formatPrompt(currentPrompt(state()))).toMatch(/Select second object/)
  })

  it('forgets a half-finished pick when the command is cancelled', () => {
    state().executeCommand('FILLET')
    applyDrawTool(onEast)
    state().cancelCommand()

    expect(state().activeTool).toBe('select')
    expect(state().modifyTargetId).toBeNull()
    expect(state().draftPoints).toEqual([])
  })

  it('reaches FILLET and CHAMFER by their AutoCAD aliases', () => {
    state().executeCommand('F')
    expect(state().activeTool).toBe('fillet')

    state().executeCommand('CHA')
    expect(state().activeTool).toBe('chamfer')
  })
})
