import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  getPreferences,
  initPreferences,
  mergeStored,
  resetPreferences,
  setPreference,
  subscribeToPreferences,
} from './preferences'

describe('reading what was stored', () => {
  it('falls back to the defaults when nothing was stored', () => {
    expect(mergeStored(null)).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps the stored value where there is one', () => {
    expect(mergeStored({ pickBoxSize: 14 }).pickBoxSize).toBe(14)
  })

  it('fills in the settings the stored copy is missing', () => {
    const merged = mergeStored({ pickBoxSize: 14 })

    expect(merged.gripSize).toBe(DEFAULT_PREFERENCES.gripSize)
    expect(merged.windowSelection).toBe(DEFAULT_PREFERENCES.windowSelection)
  })

  it('ignores keys that are no longer settings', () => {
    expect(mergeStored({ ancientSetting: 'yes' })).toEqual(DEFAULT_PREFERENCES)
  })

  it('ignores a value of the wrong shape rather than taking it', () => {
    expect(mergeStored({ pickBoxSize: 'large', showGrid: 3 })).toEqual(DEFAULT_PREFERENCES)
  })

  it('pulls a number that is out of range back into it', () => {
    expect(mergeStored({ pickBoxSize: 5000 }).pickBoxSize).toBe(40)
    expect(mergeStored({ crosshairSize: -20 }).crosshairSize).toBe(1)
  })

  it('takes only the three window selection modes it knows', () => {
    expect(mergeStored({ windowSelection: 'click' }).windowSelection).toBe('click')
    expect(mergeStored({ windowSelection: 'lasso' }).windowSelection).toBe(DEFAULT_PREFERENCES.windowSelection)
  })

  it('survives a stored copy that is not an object at all', () => {
    expect(mergeStored('nonsense')).toEqual(DEFAULT_PREFERENCES)
  })
})

describe('changing a setting', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPreferences()
  })

  it('takes effect at once', () => {
    setPreference('pickBoxSize', 20)

    expect(getPreferences().pickBoxSize).toBe(20)
  })

  it('clamps a value that would make the interface unusable', () => {
    setPreference('gripSize', 900)

    expect(getPreferences().gripSize).toBe(40)
  })

  it('tells whoever is listening', () => {
    let told = 0
    const stop = subscribeToPreferences(() => (told += 1))

    setPreference('showGrid', false)

    expect(told).toBe(1)
    stop()
  })

  it('says nothing when the value has not actually changed', () => {
    let told = 0
    const stop = subscribeToPreferences(() => (told += 1))

    setPreference('showGrid', DEFAULT_PREFERENCES.showGrid)

    expect(told).toBe(0)
    stop()
  })

  it('is remembered across a restart', () => {
    setPreference('polarAngle', 15)
    setPreference('windowSelection', 'click')

    // A fresh start reads back what was written, the way a page reload would.
    initPreferences()

    expect(getPreferences().polarAngle).toBe(15)
    expect(getPreferences().windowSelection).toBe('click')
  })

  it('starts from the defaults when storage holds something unreadable', () => {
    localStorage.setItem('trimcad.preferences.v1', '{ not json')

    initPreferences()

    expect(getPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('puts everything back with one command', () => {
    setPreference('pickBoxSize', 30)
    setPreference('autosave', false)

    resetPreferences()

    expect(getPreferences()).toEqual(DEFAULT_PREFERENCES)
  })
})