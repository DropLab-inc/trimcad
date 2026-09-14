import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardInset } from './useKeyboardInset'

/** A stand-in for window.visualViewport, driven by the test instead of by a keyboard. */
function stubVisualViewport(height: number, offsetTop = 0) {
  const listeners = new Set<() => void>()
  const viewport = {
    height,
    offsetTop,
    addEventListener: (_event: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => void listeners.delete(listener),
  }
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
  return {
    viewport,
    resizeTo: (next: number) => {
      viewport.height = next
      for (const listener of listeners) listener()
    },
  }
}

const inset = () => document.documentElement.style.getPropertyValue('--keyboard-inset')

afterEach(() => {
  // @ts-expect-error the test put it there; jsdom has no visual viewport.
  delete window.visualViewport
  document.documentElement.style.removeProperty('--keyboard-inset')
})

describe('useKeyboardInset', () => {
  it('lifts the shell by the strip a keyboard covers', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const { viewport } = stubVisualViewport(500, 0)

    renderHook(() => useKeyboardInset(true))

    expect(viewport.height).toBe(500)
    expect(inset()).toBe('300px')
  })

  it('gives the strip back when the keyboard closes', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const keyboard = stubVisualViewport(500, 0)

    renderHook(() => useKeyboardInset(true))
    keyboard.resizeTo(800)

    expect(inset()).toBe('')
  })

  it('ignores the small differences that are only browser chrome moving', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    stubVisualViewport(740, 0)

    renderHook(() => useKeyboardInset(true))

    expect(inset()).toBe('')
  })

  it('does nothing on a wide screen, where the keyboard is not the layout`s problem', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    stubVisualViewport(500, 0)

    renderHook(() => useKeyboardInset(false))

    expect(inset()).toBe('')
  })

  it('copes with a browser that has no visual viewport at all', () => {
    expect(() => renderHook(() => useKeyboardInset(true))).not.toThrow()
    expect(inset()).toBe('')
  })
})

describe('the hook cleans up after itself', () => {
  it('removes the strip when the shell unmounts', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    stubVisualViewport(500, 0)

    const { unmount } = renderHook(() => useKeyboardInset(true))
    expect(inset()).toBe('300px')

    unmount()
    expect(inset()).toBe('')
    vi.restoreAllMocks()
  })
})
