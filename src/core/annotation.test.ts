import { describe, expect, it } from 'vitest'
import { distance } from './math/vec2'
import { makeDimensionLabel } from './geometry'
import { applyDrawTool, useCadStore } from './store'
import type { DimensionEntity, LeaderEntity, ToleranceEntity } from './types'

/**
 * The new annotation types: an ordinate reads ONE axis of a datum, an arc length measures ALONG the
 * arc rather than across it, a jogged radius measures through a bend, a leader lands and hooks, and
 * a tolerance frame carries a symbol, a value and datums.
 */
const seed = (entities: (DimensionEntity | LeaderEntity | ToleranceEntity)[]) => {
  const state = useCadStore.getState()
  state.cancelCommand()
  state.setSelection([])
  state.updateDocument((doc) => ({
    ...doc,
    entities,
  }))
}

const dim = (over: Partial<DimensionEntity>): DimensionEntity => ({
  id: 'dim-1',
  type: 'dimension',
  layerId: 'layer-0',
  dimType: 'ordinate',
  p1: { x: 100, y: 50 },
  p2: { x: 160, y: 50 },
  ...over,
})

describe('ordinate dimensions', () => {
  it('reads the X of the feature by default', () => {
    const label = makeDimensionLabel(dim({}), 2, '')
    expect(label).toBe('100.00')
  })

  it('reads Y when the axis is forced', () => {
    const label = makeDimensionLabel(dim({ ordinateAxis: 'y' }), 2, '')
    expect(label).toBe('50.00')
  })

  it('draws its leader along the forced axis', async () => {
    const { dimensionGeometry } = await import('../ui/renderers')
    const geometry = dimensionGeometry(dim({ ordinateAxis: 'x', placement: { x: 200, y: 90 } }))
    // A straight line from the feature out along X, ending at the placement's X.
    expect(geometry.line).not.toBeNull()
    expect(geometry.line!.b.x).toBe(200)
    expect(geometry.line!.b.y).toBe(50)
    expect(geometry.arrows).toHaveLength(0)
  })

  it('is placed by two picks: the feature, then the leader end', () => {
    seed([])
    const state = useCadStore.getState()
    state.setDimensionType('ordinate')
    applyDrawTool({ x: 10, y: 20 })
    applyDrawTool({ x: 60, y: 20 })
    const doc = useCadStore.getState().doc
    const placed = doc.entities.at(-1)
    expect(placed?.type).toBe('dimension')
    if (placed?.type === 'dimension') {
      expect(placed.dimType).toBe('ordinate')
      expect(placed.p1).toEqual({ x: 10, y: 20 })
      expect(placed.p2).toEqual({ x: 60, y: 20 })
    }
    // The axis resets after the dimension, so the next one follows its own leader again.
    expect(useCadStore.getState().ordinateAxis).toBeNull()
  })
})

describe('arc length dimensions', () => {
  const quarter = dim({
    dimType: 'arclength',
    // A quarter circle of radius 50 about the origin: the span sweeps pi/2, so the arc is 25pi.
    p1: { x: 0, y: 0 },
    p2: { x: 50, y: 0 },
    p3: { x: 0, y: 50 },
    placement: { x: 60, y: 60 },
  })

  it('measures along the arc, not across the chord', () => {
    const label = makeDimensionLabel(quarter, 4, '')
    // Chord would be 50 * sqrt(2) = 70.71; the arc is a quarter of the circumference.
    expect(Number(label)).toBeCloseTo(25 * Math.PI, 2)
  })

  it('renders as an arc concentric with the measured one', async () => {
    const { dimensionGeometry } = await import('../ui/renderers')
    const geometry = dimensionGeometry(quarter)
    expect(geometry.arc).not.toBeNull()
    // Concentric with the feature, pushed outside it.
    expect(geometry.arc!.center).toEqual({ x: 0, y: 0 })
    expect(geometry.arc!.radius).toBeGreaterThan(distance(quarter.p1, quarter.p2))
  })
})

describe('jogged radius dimensions', () => {
  it('labels the radius through the jog', () => {
    const label = makeDimensionLabel(
      dim({ dimType: 'jogged', p1: { x: 0, y: 0 }, p2: { x: 80, y: 0 }, placement: { x: 40, y: 60 } }),
      2,
      '',
    )
    expect(label).toBe('R80.00')
  })

  it('breaks the leader with a jog arc', async () => {
    const { dimensionGeometry } = await import('../ui/renderers')
    const geometry = dimensionGeometry(
      dim({ dimType: 'jogged', p1: { x: 0, y: 0 }, p2: { x: 80, y: 0 }, placement: { x: 40, y: 60 } }),
    )
    expect(geometry.arc).not.toBeNull()
    // The jog sits partway out the leader, between centre and edge.
    expect(distance(geometry.arc!.center, { x: 0, y: 0 })).toBeLessThan(80)
  })

  it('places from three picks: the arc, its centre, then the dimension line', () => {
    seed([])
    const state = useCadStore.getState()
    state.setDimensionType('jogged')
    // The first pick is the ENTITY pick; a bare point is not a circle, so seed one and pick it.
    state.updateDocument((doc) => ({
      ...doc,
      entities: [
        ...doc.entities,
        { id: 'circ-1', type: 'circle', layerId: 'layer-0', center: { x: 0, y: 0 }, radius: 50 },
      ],
    }))
    applyDrawTool({ x: 50, y: 0 }) // lands on the circle's +X quadrant
    applyDrawTool({ x: 0, y: 0 }) // centre override
    applyDrawTool({ x: 60, y: 0 }) // dimension line
    applyDrawTool({ x: 30, y: -20 }) // jog location
    const placed = useCadStore.getState().doc.entities.find((entity) => entity.id !== 'circ-1')
    expect(placed?.type).toBe('dimension')
    if (placed?.type === 'dimension') {
      expect(placed.dimType).toBe('jogged')
      expect(placed.jogRadius).toBeDefined()
    }
  })
})

describe('leaders', () => {
  it('places from two picks and opens the editor for the words', () => {
    seed([])
    useCadStore.setState({ activeTool: 'leader', draftPoints: [] })
    applyDrawTool({ x: 100, y: 100 }) // the arrow lands
    applyDrawTool({ x: 150, y: 120 }) // the landing
    const editor = useCadStore.getState().textEditor
    expect(editor?.kind).toBe('leader')
    useCadStore.getState().commitTextEditor({ value: 'handrail beyond' })
    const leader = useCadStore.getState().doc.entities.find((entity) => entity.type === 'leader')
    expect(leader?.type).toBe('leader')
    if (leader?.type === 'leader') {
      expect(leader.value).toBe('handrail beyond')
      expect(leader.arrow).toEqual({ x: 100, y: 100 })
      // Landing left of the arrow flips the text to the other side of the hook.
      expect(leader.flipped).toBe(false)
    }
  })

  it('cancelling the editor leaves no leader', () => {
    seed([])
    useCadStore.setState({ activeTool: 'leader', draftPoints: [] })
    applyDrawTool({ x: 100, y: 100 })
    applyDrawTool({ x: 150, y: 120 })
    useCadStore.getState().cancelTextEditor()
    expect(useCadStore.getState().doc.entities.some((entity) => entity.type === 'leader')).toBe(false)
    expect(useCadStore.getState().leaderDraft).toBeNull()
  })
})

describe('tolerance frames', () => {
  it('places from one pick and takes its compartments from the editor', () => {
    seed([])
    const state = useCadStore.getState()
    useCadStore.setState({ activeTool: 'tolerance', draftPoints: [] })
    applyDrawTool({ x: 40, y: 40 })
    expect(useCadStore.getState().textEditor?.kind).toBe('tolerance')
    state.commitTextEditor({ value: '0.05', symbol: 'pos', datums: ['A', 'B'] })
    const frame = useCadStore.getState().doc.entities.find((entity) => entity.type === 'tolerance')
    expect(frame?.type).toBe('tolerance')
    if (frame?.type === 'tolerance') {
      expect(frame.position).toEqual({ x: 40, y: 40 })
      expect(frame.symbol).toBe('pos')
      expect(frame.datums).toEqual(['A', 'B'])
    }
  })
})
