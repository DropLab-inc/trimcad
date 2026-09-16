import { describe, expect, it } from 'vitest'
import {
  HATCH_PATTERNS,
  HATCH_PATTERN_LABELS,
  hatchBaseAngle,
  hatchFamily,
  hatchTileSize,
} from './hatch'
import { hatchPatternFor } from './dxfHatch'

describe('the hatch pattern catalogue', () => {
  it('names every pattern for the drafter, using AutoCAD’s name', () => {
    for (const pattern of HATCH_PATTERNS) {
      const label = HATCH_PATTERN_LABELS[pattern]
      expect(label, `${pattern} has no label`).toBeTruthy()
      // An ANSI or AR- pattern is labelled with the name AutoCAD uses, so it can be asked for.
      if (/^(ansi|ar-)/i.test(label)) expect(label.toUpperCase()).toContain(pattern.toUpperCase())
    }
  })

  it('offers no pattern it cannot draw', () => {
    for (const pattern of HATCH_PATTERNS) {
      expect(hatchFamily(pattern)).toBeTruthy()
      expect(hatchTileSize(pattern, 1)).toBeGreaterThan(0)
      expect(hatchTileSize(pattern, 4)).toBeGreaterThan(hatchTileSize(pattern, 1))
    }
  })

  it('tilts the ANSI families at 45° and leaves the rest square, as AutoCAD does', () => {
    expect(hatchBaseAngle('ansi31')).toBe(45)
    expect(hatchBaseAngle('ansi38')).toBe(45)
    expect(hatchBaseAngle('net')).toBe(0)
    expect(hatchBaseAngle('brick')).toBe(0)
  })

  it('draws the standard patterns as the families they really are', () => {
    // acad.pat: 32 and 34 are dashed at 45°, and the dashes are what read as the double line.
    expect(hatchFamily('ansi31')).toBe('single')
    expect(hatchFamily('ansi32')).toBe('dashed')
    expect(hatchFamily('ansi33')).toBe('cross')
    expect(hatchFamily('ansi37')).toBe('cross')
    expect(hatchFamily('ansi35')).toBe('crossDashed')
    expect(hatchFamily('ansi38')).toBe('crossDashed')
    expect(hatchFamily('net')).toBe('grid')
    expect(hatchFamily('sand')).toBe('dots')
    expect(hatchFamily('solid')).toBe('solid')
  })
})

describe('reading a pattern name out of a file', () => {
  it('keeps a standard name as itself rather than substituting a lookalike', () => {
    expect(hatchPatternFor('ANSI31', false, 1)).toBe('ansi31')
    expect(hatchPatternFor('ANSI34', false, 1)).toBe('ansi34')
    expect(hatchPatternFor('ANSI37', false, 2)).toBe('ansi37')
    expect(hatchPatternFor('ANSI38', false, 2)).toBe('ansi38')
    expect(hatchPatternFor('AR-SAND', false, 1)).toBe('sand')
    expect(hatchPatternFor('DOTS', false, 1)).toBe('dots')
    expect(hatchPatternFor('NET', false, 2)).toBe('net')
    expect(hatchPatternFor('BRICK', false, 1)).toBe('brick')
    expect(hatchPatternFor('LINE', false, 1)).toBe('line')
    // Lower case and stray spacing are how a hand-edited file arrives.
    expect(hatchPatternFor(' ansi33 ', false, 1)).toBe('ansi33')
  })

  it('draws a pattern it has no name for by the density its own definition implies', () => {
    expect(hatchPatternFor('HONEY', false, 4)).toBe('net')
    expect(hatchPatternFor('CLIENT-XYZ', false, 2)).toBe('ansi37')
    expect(hatchPatternFor('CLIENT-XYZ', false, 1)).toBe('ansi31')
  })

  it('takes a solid flag or a SOLID name as a filled fill', () => {
    expect(hatchPatternFor('WHATEVER', true, 0)).toBe('solid')
    expect(hatchPatternFor('SOLID', false, 0)).toBe('solid')
  })
})
