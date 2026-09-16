import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  currentSample,
  markActivity,
  markEdited,
  report,
  resetSessionForTests,
  startSessionTracking,
} from './session'

/**
 * The measurement must cost nothing while the app is in use and must never make noise when the
 * network is gone: one fire-and-forget send at page close, no retries, no storage, no errors.
 * These tests drive the module with injected clocks so no test waits on real time.
 */
describe('session tracking', () => {
  beforeEach(() => {
    resetSessionForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetSessionForTests()
  })

  it('accrues visible time from start to now', () => {
    startSessionTracking({ now: 1000 })
    const sample = currentSample(61_000)
    expect(sample.visibleMs).toBe(60_000)
    expect(sample.edited).toBe(false)
  })

  it('counts activity only inside the active window', () => {
    startSessionTracking({ now: 0 })
    markActivity(10_000)
    markActivity(20_000)
    // 20 seconds of continuous activity.
    expect(currentSample(30_000).activeMs).toBe(20_000)
  })

  it('caps a long gap at the active window instead of counting the whole absence', () => {
    startSessionTracking({ now: 0 })
    markActivity(0)
    // Half an hour away from the keyboard: the drawing was left, not used for 30 minutes.
    markActivity(30 * 60 * 1000)
    const sample = currentSample(30 * 60 * 1000 + 1000)
    expect(sample.activeMs).toBeLessThan(60_000)
    expect(sample.visibleMs).toBeGreaterThan(30 * 60 * 1000)
  })

  it('never counts more active time than visible time', () => {
    startSessionTracking({ now: 0 })
    markActivity(1000)
    markActivity(2000)
    markActivity(3000)
    const sample = currentSample(2500)
    expect(sample.activeMs).toBeLessThanOrEqual(sample.visibleMs)
  })

  it('records that the document was edited', () => {
    startSessionTracking({ now: 0 })
    markEdited()
    expect(currentSample(1000).edited).toBe(true)
  })

  it('starts only once — StrictMode calling twice changes nothing', () => {
    expect(startSessionTracking({ now: 1000 })).toBe(true)
    expect(startSessionTracking({ now: 999_999 })).toBe(false)
    expect(currentSample(2000).visibleMs).toBe(1000)
  })

  describe('reporting', () => {
    let beacon: ReturnType<typeof vi.fn>
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      beacon = vi.fn(() => true)
      Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
      fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
      globalThis.fetch = fetchMock as unknown as typeof fetch
    })

    it('sends one report through sendBeacon with keepalive semantics', () => {
      startSessionTracking({ now: 0 })
      markActivity(5000)
      markEdited()

      expect(report('/collect', 10_000)).toBe(true)
      expect(beacon).toHaveBeenCalledTimes(1)
      const [url, blob] = beacon.mock.calls[0]
      expect(url).toBe('/collect')
      return (blob as Blob).text().then((text) => {
        const body = JSON.parse(text)
        expect(body.visibleMs).toBe(10_000)
        expect(body.activeMs).toBeGreaterThan(0)
        expect(body.edited).toBe(true)
      })
    })

    it('reports exactly once per session', () => {
      startSessionTracking({ now: 0 })
      expect(report('/collect', 1000)).toBe(true)
      expect(report('/collect', 2000)).toBe(false)
      expect(report('/collect', 3000)).toBe(false)
      expect(beacon).toHaveBeenCalledTimes(1)
    })

    it('does not report a session that never started', () => {
      expect(report('/collect', 1000)).toBe(false)
      expect(beacon).not.toHaveBeenCalled()
    })

    it('falls back to fetch when the beacon cannot queue, and still reports once', () => {
      beacon.mockReturnValue(false)
      startSessionTracking({ now: 0 })

      expect(report('/collect', 5000)).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [, init] = fetchMock.mock.calls[0]
      expect(init.keepalive).toBe(true)
      expect(beacon).toHaveBeenCalledTimes(1)
    })

    it('swallows a failing network without throwing and without retrying', async () => {
      beacon.mockImplementation(() => {
        throw new Error('network gone')
      })
      fetchMock.mockRejectedValue(new Error('offline'))
      startSessionTracking({ now: 0 })

      // A dead network must not surface as an application error.
      expect(() => report('/collect', 1000)).not.toThrow()
      // The send is attempted through the fallback, once.
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
