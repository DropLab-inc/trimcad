import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery'

/** A matchMedia stub whose answer the test can change, as a rotation would. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  let matches = initial
  const list = {
    get matches() {
      return matches
    },
    media: NARROW_QUERY,
    addEventListener: (_event: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => void listeners.delete(listener),
  }
  window.matchMedia = vi.fn(() => list) as unknown as typeof window.matchMedia
  return {
    rotateTo: (next: boolean) => {
      matches = next
      for (const listener of listeners) listener()
    },
  }
}

function Probe() {
  return <span>{useMediaQuery(NARROW_QUERY) ? 'narrow' : 'wide'}</span>
}

afterEach(() => {
  // @ts-expect-error the test removed it; jsdom does not implement matchMedia.
  delete window.matchMedia
})

describe('useMediaQuery', () => {
  it('reads the current answer on the first render', () => {
    stubMatchMedia(true)
    render(<Probe />)
    expect(screen.getByText('narrow')).toBeTruthy()
  })

  it('follows the viewport when it changes', () => {
    const viewport = stubMatchMedia(false)
    render(<Probe />)
    expect(screen.getByText('wide')).toBeTruthy()

    act(() => viewport.rotateTo(true))
    expect(screen.getByText('narrow')).toBeTruthy()
  })

  it('falls back to the desktop layout where matchMedia does not exist', () => {
    render(<Probe />)
    expect(screen.getByText('wide')).toBeTruthy()
  })
})
