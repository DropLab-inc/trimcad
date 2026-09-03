import { beforeEach, describe, expect, it } from 'vitest'
import { applyDrawTool, useCadStore } from './store'
import type { CircleEntity, PolylineEntity } from './types'

const resetDrawing = () => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.updateDocument((draft) => ({ ...draft, entities: [] }))
}

describe('draw tool pipeline', () => {
  beforeEach(() => {
    resetDrawing()
  })

  it('creates a circle from a center click and a radius click', () => {
    useCadStore.getState().setTool('circle')
    applyDrawTool({ x: 0, y: 0 })
    expect(useCadStore.getState().doc.entities).toHaveLength(0)
    expect(useCadStore.getState().draftPoints).toHaveLength(1)

    applyDrawTool({ x: 30, y: 40 })

    const entities = useCadStore.getState().doc.entities
    expect(entities).toHaveLength(1)
    expect(entities[0].type).toBe('circle')
    if (entities[0].type === 'circle') {
      expect(entities[0].center).toEqual({ x: 0, y: 0 })
      expect(entities[0].radius).toBeCloseTo(50, 6)
    }
    expect(useCadStore.getState().draftPoints).toHaveLength(0)
  })

  it('creates a line between two clicked points', () => {
    useCadStore.getState().setTool('line')
    applyDrawTool({ x: 1, y: 2 })
    applyDrawTool({ x: 11, y: 2 })

    const entities = useCadStore.getState().doc.entities
    expect(entities).toHaveLength(1)
    expect(entities[0].type).toBe('line')
  })

  it('creates a rectangle as a closed polyline', () => {
    useCadStore.getState().setTool('rect')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 5 })

    const entity = useCadStore.getState().doc.entities[0]
    expect(entity.type).toBe('polyline')
    if (entity.type === 'polyline') {
      expect(entity.closed).toBe(true)
      expect(entity.points).toHaveLength(4)
    }
  })

  it('builds a polygon using the configured side count', () => {
    useCadStore.getState().setPolygonSides(5)
    useCadStore.getState().setTool('polygon')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })

    const entity = useCadStore.getState().doc.entities[0]
    expect(entity.type).toBe('polyline')
    if (entity.type === 'polyline') {
      expect(entity.points).toHaveLength(5)
    }
  })

  it('finishes an open polyline with finishDraft', () => {
    useCadStore.getState().setTool('polyline')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 10, y: 10 })
    expect(useCadStore.getState().doc.entities).toHaveLength(0)

    useCadStore.getState().finishDraft()

    const entity = useCadStore.getState().doc.entities[0]
    expect(entity.type).toBe('polyline')
    if (entity.type === 'polyline') {
      expect(entity.closed).toBe(false)
      expect(entity.points).toHaveLength(3)
    }
  })

  it('closes a polyline with closeDraft', () => {
    useCadStore.getState().setTool('polyline')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 10, y: 10 })
    useCadStore.getState().closeDraft()

    const entity = useCadStore.getState().doc.entities[0]
    if (entity.type === 'polyline') {
      expect(entity.closed).toBe(true)
    }
  })

  it('discards in-progress geometry when the command is cancelled', () => {
    useCadStore.getState().setTool('line')
    applyDrawTool({ x: 0, y: 0 })
    useCadStore.getState().cancelDraft()

    expect(useCadStore.getState().draftPoints).toHaveLength(0)
    expect(useCadStore.getState().doc.entities).toHaveLength(0)
  })

  it('creates an arc from center, start, and end clicks', () => {
    useCadStore.getState().setTool('arc')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 0, y: 10 })

    const entity = useCadStore.getState().doc.entities[0]
    expect(entity.type).toBe('arc')
    if (entity.type === 'arc') {
      expect(entity.radius).toBeCloseTo(10, 6)
      expect(entity.endAngle).toBeCloseTo(Math.PI / 2, 6)
    }
  })
})

describe('circle constructions', () => {
  beforeEach(() => {
    resetDrawing()
    useCadStore.getState().setTool('select')
  })

  /** The one circle in the drawing, so a test can assert on it without re-narrowing the type. */
  const onlyCircle = (): CircleEntity => {
    const entities = useCadStore.getState().doc.entities
    const found = entities.find((entity) => entity.type === 'circle')
    if (!found || found.type !== 'circle') throw new Error('expected a circle in the drawing')
    return found
  }

  it('takes two clicks as the ends of a diameter', () => {
    useCadStore.getState().setTool('circle')
    useCadStore.getState().setCircleMode('2p')
    applyDrawTool({ x: 0, y: 0 })
    expect(useCadStore.getState().doc.entities).toHaveLength(0)
    applyDrawTool({ x: 20, y: 0 })

    expect(onlyCircle().center).toEqual({ x: 10, y: 0 })
    expect(onlyCircle().radius).toBeCloseTo(10)
  })

  it('takes three clicks as points on the rim', () => {
    useCadStore.getState().setTool('circle')
    useCadStore.getState().setCircleMode('3p')
    applyDrawTool({ x: 10, y: 0 })
    applyDrawTool({ x: 0, y: 10 })
    expect(useCadStore.getState().doc.entities).toHaveLength(0)
    applyDrawTool({ x: -10, y: 0 })

    expect(onlyCircle().center.x).toBeCloseTo(0)
    expect(onlyCircle().center.y).toBeCloseTo(0)
    expect(onlyCircle().radius).toBeCloseTo(10)
  })

  it('says so and draws nothing when three points fall in a straight line', () => {
    useCadStore.getState().setTool('circle')
    useCadStore.getState().setCircleMode('3p')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 5, y: 5 })
    applyDrawTool({ x: 10, y: 10 })

    expect(useCadStore.getState().doc.entities).toHaveLength(0)
    expect(useCadStore.getState().statusMessage).toMatch(/straight line/i)
  })

  it('reads the size across the circle once the Diameter option is taken', () => {
    useCadStore.getState().setTool('circle')
    applyDrawTool({ x: 0, y: 0 })
    useCadStore.getState().applyKeyword({ key: 'D', label: 'Diameter' })
    applyDrawTool({ x: 20, y: 0 })

    expect(onlyCircle().radius).toBeCloseTo(10)
  })

  it('sits a Ttr circle in the corner made by two picked lines', () => {
    useCadStore.getState().updateDocument((draft) => ({
      ...draft,
      entities: [
        { id: 'across', type: 'line', layerId: draft.layers[0].id, start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
        { id: 'up', type: 'line', layerId: draft.layers[0].id, start: { x: 0, y: 0 }, end: { x: 0, y: 40 } },
      ],
    }))

    useCadStore.getState().setTool('circle')
    useCadStore.getState().setCircleMode('ttr')
    applyDrawTool({ x: 15, y: 0 })
    expect(useCadStore.getState().tangentPicks).toHaveLength(1)
    applyDrawTool({ x: 0, y: 15 })

    // Both objects are in hand, so the command now waits for the radius rather than a third point.
    expect(useCadStore.getState().circlePending).toBe(true)
    expect(useCadStore.getState().doc.entities).toHaveLength(2)

    useCadStore.getState().executeCommand('6')

    expect(onlyCircle().center.x).toBeCloseTo(6)
    expect(onlyCircle().center.y).toBeCloseTo(6)
    expect(onlyCircle().radius).toBeCloseTo(6)
    expect(useCadStore.getState().tangentPicks).toHaveLength(0)
  })

  it('refuses a Ttr radius that cannot reach both objects', () => {
    useCadStore.getState().updateDocument((draft) => ({
      ...draft,
      entities: [
        { id: 'low', type: 'line', layerId: draft.layers[0].id, start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
        { id: 'high', type: 'line', layerId: draft.layers[0].id, start: { x: 0, y: 50 }, end: { x: 40, y: 50 } },
      ],
    }))

    useCadStore.getState().setTool('circle')
    useCadStore.getState().setCircleMode('ttr')
    applyDrawTool({ x: 15, y: 0 })
    applyDrawTool({ x: 15, y: 50 })
    useCadStore.getState().executeCommand('5')

    expect(useCadStore.getState().doc.entities).toHaveLength(2)
    expect(useCadStore.getState().statusMessage).toMatch(/no circle/i)
  })

  it('starts the next circle back at centre and radius', () => {
    useCadStore.getState().setTool('circle')
    useCadStore.getState().setCircleMode('2p')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 20, y: 0 })

    expect(useCadStore.getState().circleMode).toBe('center')
  })
})

describe('polygon constructions', () => {
  beforeEach(() => {
    resetDrawing()
    useCadStore.getState().setTool('select')
    useCadStore.getState().setPolygonSides(4)
  })

  const onlyPolyline = (): PolylineEntity => {
    const found = useCadStore.getState().doc.entities.find((entity) => entity.type === 'polyline')
    if (!found || found.type !== 'polyline') throw new Error('expected a polyline in the drawing')
    return found
  }

  it('puts the corners on the circle when inscribed', () => {
    useCadStore.getState().setTool('polygon')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })

    for (const point of onlyPolyline().points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(10)
    }
  })

  it('pushes the corners past the circle when circumscribed, keeping the flats on it', () => {
    useCadStore.getState().setTool('polygon')
    useCadStore.getState().applyKeyword({ key: 'C', label: 'Circumscribed about circle' })
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })

    const points = onlyPolyline().points
    for (const point of points) expect(Math.hypot(point.x, point.y)).toBeCloseTo(10 * Math.SQRT2)
    // The middle of each side is what now sits at the radius that was asked for.
    const middle = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
    expect(Math.hypot(middle.x, middle.y)).toBeCloseTo(10)
  })

  it('remembers circumscribed for the next polygon, the way AutoCAD does', () => {
    useCadStore.getState().setTool('polygon')
    useCadStore.getState().applyKeyword({ key: 'C', label: 'Circumscribed about circle' })
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })

    useCadStore.getState().setTool('polygon')
    expect(useCadStore.getState().polygonFit).toBe('circumscribed')
  })

  it('builds the shape off a single drawn edge when the Edge option is taken', () => {
    useCadStore.getState().setTool('polygon')
    useCadStore.getState().applyKeyword({ key: 'E', label: 'Edge' })
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })

    const points = onlyPolyline().points
    expect(points).toHaveLength(4)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[2].x).toBeCloseTo(10)
    expect(points[2].y).toBeCloseTo(10)
  })

  it('drops the one-off Edge option when the command is run again', () => {
    useCadStore.getState().setTool('polygon')
    useCadStore.getState().applyKeyword({ key: 'E', label: 'Edge' })
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 10, y: 0 })

    useCadStore.getState().setTool('polygon')
    expect(useCadStore.getState().polygonFit).toBe('inscribed')
  })
})
