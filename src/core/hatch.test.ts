import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine, createRect } from './commands'
import { findHatchBoundary, isPointNearEntity, polygonArea } from './geometry'
import { applyDrawTool, useCadStore } from './store'
import type { HatchEntity } from './types'

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
      expect(hatch.scale).toBe(1)
      expect(hatch.angle).toBe(0)
    }
  })

  it('stores the scale and angle chosen for the hatch', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    useCadStore.getState().updateDocument((draft) => ({
      ...draft,
      entities: [createRect(layerId, { x: 0, y: 0 }, { x: 40, y: 40 })],
    }))

    useCadStore.getState().setTool('hatch')
    useCadStore.getState().setHatchScale(2)
    useCadStore.getState().setHatchAngle(30)
    useCadStore.getState().setHatchPattern('net')
    applyDrawTool({ x: 20, y: 20 })

    const hatch = useCadStore.getState().doc.entities.find((entity) => entity.type === 'hatch')
    expect(hatch).toMatchObject({ pattern: 'net', scale: 2, angle: 30 })
  })

  it('accepts a typed scale from the Scale option', () => {
    useCadStore.getState().setTool('hatch')
    useCadStore.getState().applyKeyword({ key: 'S', label: 'Scale' })
    useCadStore.getState().executeCommand('1.5')
    expect(useCadStore.getState().hatchScale).toBe(1.5)
    expect(useCadStore.getState().hatchPending).toBeNull()
  })

  it('reports a message instead of hatching when there is no boundary', () => {
    useCadStore.getState().setTool('hatch')
    applyDrawTool({ x: 5, y: 5 })

    expect(useCadStore.getState().doc.entities).toHaveLength(0)
    expect(useCadStore.getState().statusMessage).toMatch(/No enclosed area/i)
  })

  it('hatches only the half of a circle cut off by a line', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    useCadStore.getState().updateDocument((draft) => ({
      ...draft,
      entities: [createCircle(layerId, { x: 0, y: 0 }, 10), createLine(layerId, { x: -20, y: 0 }, { x: 20, y: 0 })],
    }))

    useCadStore.getState().setTool('hatch')
    applyDrawTool({ x: 0, y: 5 })

    const hatch = useCadStore.getState().doc.entities.find((entity) => entity.type === 'hatch')
    expect(hatch).toBeDefined()
    if (hatch?.type === 'hatch') {
      expect(hatch.boundary.every((point) => point.y >= -1e-3)).toBe(true)
      expect(polygonArea(hatch.boundary)).toBeLessThan(Math.PI * 100 * 0.6)
    }
  })

  it('does not treat an existing hatch as a boundary for the next one', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    useCadStore.getState().updateDocument((draft) => ({
      ...draft,
      entities: [createRect(layerId, { x: 0, y: 0 }, { x: 40, y: 40 })],
    }))

    useCadStore.getState().setTool('hatch')
    applyDrawTool({ x: 20, y: 20 })
    applyDrawTool({ x: 20, y: 20 })

    const hatches = useCadStore.getState().doc.entities.filter((entity) => entity.type === 'hatch')
    expect(hatches).toHaveLength(2)
    expect(polygonArea(hatches[0].type === 'hatch' ? hatches[0].boundary : [])).toBeCloseTo(1600, 4)
    expect(polygonArea(hatches[1].type === 'hatch' ? hatches[1].boundary : [])).toBeCloseTo(1600, 4)
  })
})

describe('hatch picking', () => {
  const hatch: HatchEntity = {
    id: 'h',
    type: 'hatch',
    layerId: 'L',
    pattern: 'ansi31',
    scale: 1,
    angle: 0,
    boundary: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ],
  }

  it('selects a click inside the fill', () => {
    expect(isPointNearEntity({ x: 20, y: 20 }, hatch, 2)).toBe(true)
  })

  it('selects a click within the pick box of an edge', () => {
    expect(isPointNearEntity({ x: 20, y: -1 }, hatch, 2)).toBe(true)
  })

  it('ignores a click well outside the hatch', () => {
    expect(isPointNearEntity({ x: 80, y: 80 }, hatch, 2)).toBe(false)
  })
})
