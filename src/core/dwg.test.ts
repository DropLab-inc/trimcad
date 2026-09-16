import { describe, expect, it } from 'vitest'
import { isDwgFile } from './dwg'

/**
 * DWG support is read-only and goes through a WASM converter, so the parts worth pinning here are
 * the routing decision (which file goes down which path) and the promise that a DWG is recognised
 * whatever the case or path it arrives with. The conversion itself is exercised in a browser
 * against real DWG files — see the skill's verification notes.
 */
describe('recognising a DWG', () => {
  it('accepts the extension whatever its case', () => {
    expect(isDwgFile('plan.dwg')).toBe(true)
    expect(isDwgFile('PLAN.DWG')).toBe(true)
    expect(isDwgFile('Plan.Dwg')).toBe(true)
  })

  it('leaves the formats the app already reads alone', () => {
    expect(isDwgFile('plan.dxf')).toBe(false)
    expect(isDwgFile('plan.dlc')).toBe(false)
    expect(isDwgFile('plan.json')).toBe(false)
  })

  it('is not fooled by a name that merely mentions dwg', () => {
    expect(isDwgFile('dwg-notes.txt')).toBe(false)
    expect(isDwgFile('plan.dwg.txt')).toBe(false)
    expect(isDwgFile('plan.dwgx')).toBe(false)
  })

  it('handles a name with spaces, which is how real drawings arrive', () => {
    expect(isDwgFile('ET064AM01-HT with CG.dwg')).toBe(true)
  })
})
