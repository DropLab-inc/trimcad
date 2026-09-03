import { beforeEach, describe, expect, it } from 'vitest'
import { canvasPalettes, initTheme, preferredTheme, readableOnCanvas, setTheme } from './theme'

describe('readableOnCanvas', () => {
  it('draws a white layer white on a dark background', () => {
    expect(readableOnCanvas('#ffffff', canvasPalettes.dark)).toBe(canvasPalettes.dark.contrast)
    expect(canvasPalettes.dark.contrast).not.toBe(canvasPalettes.dark.background)
  })

  it('draws that same white layer black on a light background', () => {
    expect(readableOnCanvas('#ffffff', canvasPalettes.light)).toBe(canvasPalettes.light.contrast)
    expect(canvasPalettes.light.contrast).toBe('#0c161d')
  })

  it('rescues a black layer on the dark theme too', () => {
    expect(readableOnCanvas('#000000', canvasPalettes.dark)).toBe(canvasPalettes.dark.contrast)
  })

  it('accepts the short form and stray whitespace', () => {
    expect(readableOnCanvas(' #FFF ', canvasPalettes.light)).toBe(canvasPalettes.light.contrast)
  })

  it('leaves every other layer colour exactly as drawn', () => {
    for (const palette of [canvasPalettes.dark, canvasPalettes.light]) {
      expect(readableOnCanvas('#ff0000', palette)).toBe('#ff0000')
      expect(readableOnCanvas('#35c8d2', palette)).toBe('#35c8d2')
      expect(readableOnCanvas('#808080', palette)).toBe('#808080')
    }
  })
})

describe('choosing a theme', () => {
  beforeEach(() => {
    localStorage.clear()
    initTheme()
  })

  it('starts dark when nothing has been chosen and the system says nothing', () => {
    expect(preferredTheme()).toBe('dark')
  })

  it('remembers the last choice across a reload', () => {
    setTheme('light')
    expect(preferredTheme()).toBe('light')
  })

  it('puts the choice on the document so the stylesheet can pick it up', () => {
    setTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('offers a palette for both themes with no colour left shared by accident', () => {
    expect(canvasPalettes.dark.background).not.toBe(canvasPalettes.light.background)
    expect(canvasPalettes.dark.gridMinor).not.toBe(canvasPalettes.light.gridMinor)
  })
})
