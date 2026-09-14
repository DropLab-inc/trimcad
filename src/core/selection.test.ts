import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine, createRect } from './commands'
import {
  applySelectionModifier,
  entityBounds,
  entityFullyInside,
  entityTouchesRect,
  expandSelectionToGroups,
  rectFromPoints,
  selectEntitiesInRect,
  selectionModeFor,
} from './selection'
import { useCadStore } from './store'
import type { DrawingDocument } from './types'

const box = rectFromPoints({ x: 0, y: 0 }, { x: 100, y: 100 })

describe('selection direction', () => {
  it('treats a left-to-right drag as a window selection', () => {
    expect(selectionModeFor({ x: 0, y: 0 }, { x: 50, y: 50 })).toBe('window')
  })

  it('treats a right-to-left drag as a crossing selection', () => {
    expect(selectionModeFor({ x: 50, y: 0 }, { x: 0, y: 50 })).toBe('crossing')
  })

  it('normalises the rectangle regardless of drag direction', () => {
    expect(rectFromPoints({ x: 80, y: 90 }, { x: 10, y: 20 })).toEqual({
      min: { x: 10, y: 20 },
      max: { x: 80, y: 90 },
    })
  })
})

describe('entity bounds', () => {
  it('bounds a circle by its radius', () => {
    expect(entityBounds(createCircle('L', { x: 50, y: 50 }, 10))).toEqual({
      min: { x: 40, y: 40 },
      max: { x: 60, y: 60 },
    })
  })

  it('bounds a line by its endpoints', () => {
    expect(entityBounds(createLine('L', { x: 10, y: 40 }, { x: 30, y: 20 }))).toEqual({
      min: { x: 10, y: 20 },
      max: { x: 30, y: 40 },
    })
  })
})

describe('window selection', () => {
  it('selects an object fully inside the box', () => {
    const line = createLine('L', { x: 10, y: 10 }, { x: 40, y: 40 })
    expect(entityFullyInside(line, box)).toBe(true)
  })

  it('rejects an object that only partly overlaps the box', () => {
    const line = createLine('L', { x: 50, y: 50 }, { x: 200, y: 50 })
    expect(entityFullyInside(line, box)).toBe(false)
  })

  it('rejects an object entirely outside the box', () => {
    const line = createLine('L', { x: 300, y: 300 }, { x: 400, y: 400 })
    expect(entityFullyInside(line, box)).toBe(false)
  })
})

describe('crossing selection', () => {
  it('selects a line that merely passes through the box', () => {
    const line = createLine('L', { x: -50, y: 50 }, { x: 300, y: 50 })
    expect(entityTouchesRect(line, box)).toBe(true)
    expect(entityFullyInside(line, box)).toBe(false)
  })

  it('selects a line with one endpoint inside the box', () => {
    const line = createLine('L', { x: 50, y: 50 }, { x: 500, y: 500 })
    expect(entityTouchesRect(line, box)).toBe(true)
  })

  it('selects a circle whose edge cuts the box', () => {
    const circle = createCircle('L', { x: 120, y: 50 }, 40)
    expect(entityTouchesRect(circle, box)).toBe(true)
  })

  it('ignores a circle that encloses the box without touching it', () => {
    const circle = createCircle('L', { x: 50, y: 50 }, 5000)
    expect(entityTouchesRect(circle, box)).toBe(false)
  })

  it('ignores an object that is nowhere near the box', () => {
    expect(entityTouchesRect(createLine('L', { x: 500, y: 500 }, { x: 600, y: 600 }), box)).toBe(false)
  })
})

describe('selectEntitiesInRect', () => {
  const inside = createRect('L', { x: 10, y: 10 }, { x: 30, y: 30 })
  const straddling = createLine('L', { x: 50, y: 50 }, { x: 400, y: 400 })
  const outside = createCircle('L', { x: 900, y: 900 }, 5)
  const entities = [inside, straddling, outside]

  it('window mode returns only fully enclosed entities', () => {
    expect(selectEntitiesInRect(entities, box, 'window')).toEqual([inside.id])
  })

  it('crossing mode also returns entities touching the box', () => {
    const ids = selectEntitiesInRect(entities, box, 'crossing')
    expect(ids).toContain(inside.id)
    expect(ids).toContain(straddling.id)
    expect(ids).not.toContain(outside.id)
  })
})

describe('selection modifiers', () => {
  it('replaces the selection by default', () => {
    expect(applySelectionModifier(['a', 'b'], ['c'], 'replace')).toEqual(['c'])
  })

  it('adds to the selection without duplicating entries', () => {
    expect(applySelectionModifier(['a', 'b'], ['b', 'c'], 'add')).toEqual(['a', 'b', 'c'])
  })

  it('removes from the selection', () => {
    expect(applySelectionModifier(['a', 'b', 'c'], ['b'], 'remove')).toEqual(['a', 'c'])
  })
})

describe('group aware selection', () => {
  const doc = {
    groups: [{ id: 'g1', name: 'G', entityIds: ['a', 'b', 'c'] }],
  } as unknown as DrawingDocument

  it('selects every member when one member is picked', () => {
    expect(expandSelectionToGroups(['b'], doc).sort()).toEqual(['a', 'b', 'c'])
  })

  it('leaves ungrouped entities untouched', () => {
    expect(expandSelectionToGroups(['z'], doc)).toEqual(['z'])
  })
})

describe('store selection actions', () => {
  beforeEach(() => {
    const state = useCadStore.getState()
    state.setSelection([])
    state.updateDocument((draft) => ({ ...draft, entities: [], groups: [] }))
  })

  it('selects every entity on visible unlocked layers', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    useCadStore.getState().updateDocument((draft) => ({
      ...draft,
      entities: [
        createLine(layerId, { x: 0, y: 0 }, { x: 1, y: 1 }),
        createCircle(layerId, { x: 5, y: 5 }, 2),
      ],
    }))

    useCadStore.getState().selectAll()

    expect(useCadStore.getState().selectedIds).toHaveLength(2)
  })

  it('adds to and removes from the current selection', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    const first = createLine(layerId, { x: 0, y: 0 }, { x: 1, y: 1 })
    const second = createCircle(layerId, { x: 5, y: 5 }, 2)
    useCadStore.getState().updateDocument((draft) => ({ ...draft, entities: [first, second] }))

    useCadStore.getState().applySelection([first.id], 'replace')
    useCadStore.getState().applySelection([second.id], 'add')
    expect(useCadStore.getState().selectedIds).toHaveLength(2)

    useCadStore.getState().applySelection([first.id], 'remove')
    expect(useCadStore.getState().selectedIds).toEqual([second.id])
  })
})

describe('hatch selection', () => {
  const hatch = {
    id: 'h',
    type: 'hatch' as const,
    layerId: 'L',
    pattern: 'ansi31' as const,
    scale: 1,
    angle: 0,
    boundary: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  }

  it('is caught by a crossing window that sits entirely inside the fill', () => {
    const inside = rectFromPoints({ x: 40, y: 40 }, { x: 60, y: 60 })
    expect(entityTouchesRect(hatch, inside)).toBe(true)
  })

  it('is caught by a crossing window that cuts an edge', () => {
    const across = rectFromPoints({ x: -10, y: 40 }, { x: 10, y: 60 })
    expect(entityTouchesRect(hatch, across)).toBe(true)
  })

  it('is fully inside a window that encloses it', () => {
    const around = rectFromPoints({ x: -10, y: -10 }, { x: 110, y: 110 })
    expect(entityFullyInside(hatch, around)).toBe(true)
  })
})
