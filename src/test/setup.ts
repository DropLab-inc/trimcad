import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no layout engine, so the viewport's ResizeObserver needs a stand-in.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// Vitest does not register React Testing Library's automatic teardown unless globals are on.
afterEach(cleanup)
