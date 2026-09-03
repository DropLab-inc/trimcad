import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createCircle, scaleEntities } from './commands'
import { makeDimensionLabel } from './geometry'
import { applyDrawTool, useCadStore } from './store'
import { dimensionGeometry, dimensionScale, renderDimension } from '../ui/renderers'
import type { DimensionEntity, DimStyle } from './types'

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

describe('dimension size', () => {
  const style: DimStyle = { precision: 2, textHeight: 12, arrowSize: 8, suffix: '' }
  const draw = (overrides: Partial<DimensionEntity>) =>
    renderToStaticMarkup(renderDimension(dimension({ placement: { x: 25, y: 20 }, ...overrides }), style, '#fff'))

  it('measures as it always did when a dimension carries no size', () => {
    expect(dimensionScale(dimension({}))).toBe(1)
    expect(draw({})).toContain('font-size="12"')
  })

  it('ignores a size that would erase or invert the annotation', () => {
    expect(dimensionScale(dimension({ scale: 0 }))).toBe(1)
    expect(dimensionScale(dimension({ scale: -2 }))).toBe(1)
  })

  it('multiplies the text height by the size', () => {
    expect(draw({ scale: 2 })).toContain('font-size="24"')
    expect(draw({ scale: 0.5 })).toContain('font-size="6"')
  })

  it('grows the arrowheads with the text', () => {
    // The left arrow tip sits at x=0 and its barbs trail back by one arrow length.
    expect(draw({ scale: 1 })).toContain('points="0,20 8,')
    expect(draw({ scale: 2 })).toContain('points="0,20 16,')
  })

  it('opens the gap before a radius label so the text clears the leader', () => {
    const radial = (scale: number) =>
      dimensionGeometry(dimension({ dimType: 'radial', p2: { x: 10, y: 0 }, placement: { x: 20, y: 0 }, scale }))

    expect(radial(1).textPosition.x).toBeCloseTo(12, 6)
    expect(radial(3).textPosition.x).toBeCloseTo(16, 6)
  })

  it('grows the label when the drawing is scaled up, as text objects do', () => {
    const [scaled] = scaleEntities([dimension({ scale: 2 })], ['d'], { x: 0, y: 0 }, 3)
    expect(scaled.type === 'dimension' && scaled.scale).toBe(6)
  })
})

describe('choosing the size while dimensioning', () => {
  beforeEach(() => {
    const state = useCadStore.getState()
    state.cancelDraft()
    state.setSelection([])
    state.setDimScale(1)
    state.updateDocument((draft) => ({ ...draft, entities: [] }))
  })

  const drawLinear = () => {
    useCadStore.getState().setDimensionType('linear')
    applyDrawTool({ x: 0, y: 0 })
    applyDrawTool({ x: 60, y: 0 })
    applyDrawTool({ x: 30, y: 25 })
    return useCadStore.getState().doc.entities.at(-1)!
  }

  it('gives a new dimension the size chosen on the ribbon', () => {
    useCadStore.getState().setDimScale(2.5)
    const entity = drawLinear()
    expect(entity.type === 'dimension' && entity.scale).toBe(2.5)
  })

  it('falls back to full size rather than erasing the annotation', () => {
    useCadStore.getState().setDimScale(2)

    // An emptied input box sends 0 while it is being retyped, so this must not stick.
    useCadStore.getState().setDimScale(0)
    expect(useCadStore.getState().dimScale).toBe(1)

    useCadStore.getState().setDimScale(-3)
    expect(useCadStore.getState().dimScale).toBe(1)

    useCadStore.getState().setDimScale(Number.NaN)
    expect(useCadStore.getState().dimScale).toBe(1)
  })

  it('leaves dimensions already drawn at their own size', () => {
    const first = drawLinear()
    useCadStore.getState().setDimScale(4)

    const unchanged = useCadStore.getState().doc.entities.find((entity) => entity.id === first.id)
    expect(unchanged?.type === 'dimension' && unchanged.scale).toBe(1)
  })

  it('resizes the dimensions handed to it and nothing else', () => {
    const first = drawLinear()
    const second = drawLinear()

    useCadStore.getState().resizeDimensions([second.id], 3)

    const entities = useCadStore.getState().doc.entities
    const sizeOf = (id: string) => (entities.find((entity) => entity.id === id) as DimensionEntity).scale
    expect(sizeOf(first.id)).toBe(1)
    expect(sizeOf(second.id)).toBe(3)
  })

  it('sets the size from the command line', () => {
    useCadStore.getState().executeCommand('DIMSCALE 2')
    expect(useCadStore.getState().dimScale).toBe(2)
  })

  it('applies a typed size to the dimensions that are selected', () => {
    const entity = drawLinear()
    useCadStore.getState().setSelection([entity.id])

    useCadStore.getState().executeCommand('DIMSCALE 5')

    const resized = useCadStore.getState().doc.entities.find((candidate) => candidate.id === entity.id)
    expect((resized as DimensionEntity).scale).toBe(5)
  })

  it('reports the current size when asked without one', () => {
    useCadStore.getState().setDimScale(1.5)
    useCadStore.getState().executeCommand('DIMSCALE')

    const result = [...useCadStore.getState().history].reverse().find((line) => line.kind === 'result')
    expect(result?.text).toMatch(/1\.5/)
  })

  it('rejects a size that is not a number', () => {
    useCadStore.getState().executeCommand('DIMSCALE wide')

    const error = [...useCadStore.getState().history].reverse().find((line) => line.kind === 'error')
    expect(error?.text).toMatch(/greater than zero/i)
    expect(useCadStore.getState().dimScale).toBe(1)
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
