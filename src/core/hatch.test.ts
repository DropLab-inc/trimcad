import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createRect } from './commands'
import { findHatchBoundary } from './geometry'
import { applyDrawTool, useCadStore } from './store'

describe('hatch boundary detection', () => {
  it('picks the region containing the clicked point, not the first shape in the drawing', () => {
    const far = createRect('L', { x: 100, y: 100 }, { x: 140, y: 140 })
    const near = createRect('L', { x: 0, y: 0 }, { x: 20, y: 20 })

    const boundary = findHatchBoundary([far, near], { x: 10, y: 10 })

    expect(boundary).not.toBeNull()
    expect(boundary!.every((point) => point.x <= 20 && point.y <= 20)).toBe(true)
  })

  it('prefers the smallest enclosing region when areas are nested', () => {
    const outer = createRect('L', { x: 0, y: 0 }, { x: 100, y: 100 })
    const inner = createRect('L', { x: 10, y: 10 }, { x: 30, y: 30 })

    const boundary = findHatchBoundary([outer, inner], { x: 20, y: 20 })

    expect(boundary).toHaveLength(4)
    expect(Math.max(...boundary!.map((point) => point.x))).toBe(30)
  })

  it('hatches a circle', () => {
    const circle = createCircle('L', { x: 0, y: 0 }, 10)
    expect(findHatchBoundary([circle], { x: 1, y: 1 })).not.toBeNull()
  })

  it('returns null when the point is outside every closed area', () => {
    const rect = createRect('L', { x: 0, y: 0 }, { x: 10, y: 10 })
    expect(findHatchBoundary([rect], { x: 50, y: 50 })).toBeNull()
  })
})

describe('hatch tool', () => {
  beforeEach(() => {
    const state = useCadStore.getState()
    state.cancelDraft()
    state.updateDocument((draft) => ({ ...draft, entities: [] }))
  })

  it('creates a hatch on the boundary under the cursor', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    useCadStore.getState().updateDocument((draft) => ({
      ...draft,
      entities: [createRect(layerId, { x: 0, y: 0 }, { x: 40, y: 40 })],
    }))

    useCadStore.getState().setTool('hatch')
    applyDrawTool({ x: 20, y: 20 })

    const hatch = useCadStore.getState().doc.entities.find((entity) => entity.type === 'hatch')
    expect(hatch).toBeDefined()
    if (hatch?.type === 'hatch') {
      expect(hatch.boundary).toHaveLength(4)
      expect(hatch.pattern).toBe('ansi31')
    }
  })

  it('reports a message instead of hatching when there is no boundary', () => {
    useCadStore.getState().setTool('hatch')
    applyDrawTool({ x: 5, y: 5 })

    expect(useCadStore.getState().doc.entities).toHaveLength(0)
    expect(useCadStore.getState().statusMessage).toMatch(/No closed boundary/i)
  })
})
