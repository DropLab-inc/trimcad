import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle } from './commands'
import { makeDimensionLabel } from './geometry'
import { applyDrawTool, useCadStore } from './store'
import { dimensionGeometry } from '../ui/renderers'
import type { DimensionEntity } from './types'

const dimension = (overrides: Partial<DimensionEntity>): DimensionEntity => ({
  id: 'd',
  type: 'dimension',
  layerId: 'L',
  dimType: 'linear',
  p1: { x: 0, y: 0 },
  p2: { x: 50, y: 0 },
  ...overrides,
})

describe('dimension labels', () => {
  it('measures the horizontal distance for a linear dimension', () => {
    expect(makeDimensionLabel(dimension({}), 2, '')).toBe('50.00')
  })

  it('measures the true distance for an aligned dimension', () => {
    const aligned = dimension({ dimType: 'aligned', p2: { x: 30, y: 40 } })
    expect(makeDimensionLabel(aligned, 1, '')).toBe('50.0')
  })

  it('prefixes radius and diameter dimensions', () => {
    const radial = dimension({ dimType: 'radial', p2: { x: 10, y: 0 } })
    expect(makeDimensionLabel(radial, 1, '')).toBe('R10.0')
    expect(makeDimensionLabel({ ...radial, dimType: 'diameter' }, 1, '')).toBe('\u00d820.0')
  })

  it('reports degrees for an angular dimension', () => {
    const angular = dimension({
      dimType: 'angular',
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      p3: { x: 0, y: 10 },
    })
    expect(makeDimensionLabel(angular, 0, '')).toBe('90\u00b0')
  })

  it('honours the configured precision', () => {
    expect(makeDimensionLabel(dimension({ p2: { x: 12.3456, y: 0 } }), 3, ' mm')).toBe('12.346 mm')
  })
})

describe('dimension geometry', () => {
  it('places the dimension line at the picked location with extension lines and arrows', () => {
    const geometry = dimensionGeometry(dimension({ placement: { x: 25, y: 20 } }))

    expect(geometry.line).not.toBeNull()
    expect(geometry.line!.a.y).toBe(20)
    expect(geometry.line!.b.y).toBe(20)
    expect(geometry.extensions).toHaveLength(2)
    expect(geometry.arrows).toHaveLength(2)
  })

  it('offsets an aligned dimension perpendicular to the measured edge', () => {
    const geometry = dimensionGeometry(
      dimension({ dimType: 'aligned', p2: { x: 0, y: 40 }, placement: { x: 10, y: 20 } }),
    )
    expect(geometry.line!.a.x).toBeCloseTo(10, 6)
    expect(geometry.line!.b.x).toBeCloseTo(10, 6)
    expect(geometry.line!.a.y).toBeCloseTo(0, 6)
    expect(geometry.line!.b.y).toBeCloseTo(40, 6)
  })

  it('builds an arc for angular dimensions', () => {
    const geometry = dimensionGeometry(
      dimension({ dimType: 'angular', p2: { x: 10, y: 0 }, p3: { x: 0, y: 10 }, placement: { x: 5, y: 5 } }),
    )
    expect(geometry.arc).not.toBeNull()
  })
})

describe('dimension tool workflow', () => {
  beforeEach(() => {
    const state = useCadStore.getState()
    state.cancelDraft()
    state.updateDocument((draft) => ({ ...draft, entities: [] }))
  })

  it('creates a linear dimension from three clicks', () => {
    useCadStore.getState().setDimensionType('linear')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 60, y: 0 })
    expect(useCadStore.getState().doc.entities).toHaveLength(0)

    applyDrawTool({ x: 30, y: 25 })

    const entity = useCadStore.getState().doc.entities[0]
    expect(entity.type).toBe('dimension')
    if (entity.type === 'dimension') {
      expect(entity.placement).toEqual({ x: 30, y: 25 })
      expect(makeDimensionLabel(entity, 0, '')).toBe('60')
    }
  })

  it('creates a radius dimension by selecting a circle', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    useCadStore.getState().updateDocument((draft) => ({
      ...draft,
      entities: [createCircle(layerId, { x: 0, y: 0 }, 20)],
    }))

    useCadStore.getState().setDimensionType('radial')
    applyDrawTool({ x: 20, y: 0 })
    applyDrawTool({ x: 35, y: 10 })

    const entity = useCadStore.getState().doc.entities.find((candidate) => candidate.type === 'dimension')
    expect(entity).toBeDefined()
    if (entity?.type === 'dimension') {
      expect(entity.dimType).toBe('radial')
      expect(makeDimensionLabel(entity, 0, '')).toBe('R20')
    }
  })
})
