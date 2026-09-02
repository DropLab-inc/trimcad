import { beforeEach, describe, expect, it } from 'vitest'
import { applyDrawTool, useCadStore } from './store'

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
