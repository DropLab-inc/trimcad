import { describe, expect, it } from 'vitest'
import { formatPrompt, matchKeyword, promptFor, type PromptContext } from './prompts'
import type { ToolMode } from './types'

const context = (overrides: Partial<PromptContext> = {}): PromptContext => ({
  tool: 'line',
  step: 0,
  dimensionType: 'linear',
  hasSelection: false,
  hasTarget: false,
  offsetDistance: 10,
  offsetPending: false,
  offsetThrough: false,
  filletRadius: 10,
  chamferDistance: 10,
  cornerPending: false,
  arrayType: 'rect',
  arrayRows: 3,
  arrayColumns: 4,
  arrayCount: 6,
  arrayFillAngle: 360,
  arrayPending: null,
  polygonSides: 6,
  polygonFit: 'inscribed',
  circleMode: 'center',
  circlePending: false,
  pickingEdges: false,
  edgeCount: null,
  swapped: false,
  ...overrides,
})

describe('circle prompts', () => {
  it('offers the other constructions at the centre prompt', () => {
    const prompt = promptFor(context({ tool: 'circle', step: 0 }))
    expect(prompt.text).toBe('Specify centre point')
    expect(prompt.keywords.map((word) => word.key)).toEqual(['3P', '2P', 'T'])
  })

  it('offers Diameter only once the centre is down', () => {
    expect(promptFor(context({ tool: 'circle', step: 1 })).keywords.map((word) => word.key)).toEqual(['D'])
  })

  it('asks for a diameter rather than a radius once that option is taken', () => {
    const prompt = promptFor(context({ tool: 'circle', circleMode: 'diameter', step: 1 }))
    expect(prompt.text).toBe('Specify diameter of circle')
  })

  it('asks for points on the rim in three point mode', () => {
    expect(promptFor(context({ tool: 'circle', circleMode: '3p', step: 0 })).text).toBe('Specify first point on circle')
    expect(promptFor(context({ tool: 'circle', circleMode: '3p', step: 2 })).text).toBe('Specify third point on circle')
  })

  it('asks for objects rather than points in tangent mode', () => {
    expect(promptFor(context({ tool: 'circle', circleMode: 'ttr', step: 0 })).kind).toBe('entity')
  })

  it('asks for a typed radius once both tangent objects are picked', () => {
    const prompt = promptFor(context({ tool: 'circle', circleMode: 'ttr', circlePending: true, step: 2 }))
    expect(prompt.kind).toBe('number')
    expect(prompt.text).toBe('Specify radius of circle')
  })
})

describe('promptFor', () => {
  it('advances through a command as points are collected', () => {
    expect(promptFor(context({ tool: 'rect', step: 0 })).text).toBe('Specify first corner')
    expect(promptFor(context({ tool: 'rect', step: 1 })).text).toBe('Specify other corner')
  })

  it('repeats the final prompt for commands that take an unbounded run of points', () => {
    expect(promptFor(context({ tool: 'line', step: 4 })).text).toBe('Specify next point')
  })

  it('follows the dimension type rather than the tool alone', () => {
    expect(promptFor(context({ tool: 'dimension', dimensionType: 'radial' })).text).toBe('Select a circle or arc')
    expect(promptFor(context({ tool: 'dimension', dimensionType: 'angular' })).text).toBe('Specify vertex')
  })

  it('asks mirror for a selection before it asks for an axis', () => {
    expect(promptFor(context({ tool: 'mirror' })).kind).toBe('selection')
    expect(promptFor(context({ tool: 'mirror', hasSelection: true })).text).toBe('Specify first point of mirror line')
  })
})

describe('trim and extend prompts', () => {
  it('offers the shift hint for the opposite operation', () => {
    expect(promptFor(context({ tool: 'trim' })).text).toBe('Select object to trim or shift-select to extend')
    expect(promptFor(context({ tool: 'extend' })).text).toBe('Select object to extend or shift-select to trim')
  })

  it('swaps the wording while Shift is held', () => {
    expect(promptFor(context({ tool: 'trim', swapped: true })).text).toBe(
      'Select object to extend or shift-select to trim',
    )
  })

  it('names the edge option after the command', () => {
    const trimKeywords = promptFor(context({ tool: 'trim' })).keywords.map((word) => word.label)
    const extendKeywords = promptFor(context({ tool: 'extend' })).keywords.map((word) => word.label)

    expect(trimKeywords).toContain('cuTting edges')
    expect(extendKeywords).toContain('Boundary edges')
    expect(trimKeywords).toContain('Fence')
    expect(trimKeywords).toContain('Undo')
  })

  it('switches to an edge selection prompt while edges are being picked', () => {
    const prompt = promptFor(context({ tool: 'trim', pickingEdges: true }))

    expect(prompt.kind).toBe('selection')
    expect(prompt.text).toBe('Select cutting edges, then press Enter')
  })

  it('shows how many edges are in force once some are chosen', () => {
    expect(promptFor(context({ tool: 'trim', edgeCount: 3 })).defaultValue).toBe('3 edges')
    expect(promptFor(context({ tool: 'trim', edgeCount: null })).defaultValue).toBeUndefined()
  })
})

describe('formatPrompt', () => {
  it('writes options in brackets and defaults in angle brackets', () => {
    expect(formatPrompt(promptFor(context({ tool: 'trim', edgeCount: 2 })))).toBe(
      'Select object to trim or shift-select to extend or [cuTting edges/Fence/Undo] <2 edges>:',
    )
  })

  it('leaves a bare prompt alone', () => {
    expect(formatPrompt(promptFor(context({ tool: 'rect' })))).toBe('Specify first corner:')
  })
})

describe('matchKeyword', () => {
  const keywords = promptFor(context({ tool: 'trim' })).keywords

  it('matches the shortcut letters', () => {
    expect(matchKeyword('T', keywords)?.label).toBe('cuTting edges')
    expect(matchKeyword('f', keywords)?.label).toBe('Fence')
  })

  it('matches an unambiguous prefix of the label', () => {
    expect(matchKeyword('FEN', keywords)?.label).toBe('Fence')
    expect(matchKeyword('UNDO', keywords)?.label).toBe('Undo')
  })

  it('rejects text that names no option', () => {
    expect(matchKeyword('LINE', keywords)).toBeNull()
    expect(matchKeyword('', keywords)).toBeNull()
  })

  it('does not treat every tool as having options', () => {
    const bare = promptFor(context({ tool: 'rect' as ToolMode }))
    expect(matchKeyword('F', bare.keywords)).toBeNull()
  })
})
