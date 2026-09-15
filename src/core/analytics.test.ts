import { beforeEach, describe, expect, it } from 'vitest'
import { BEACON_SRC, analyticsEnabled, initAnalytics, isLocalHost } from './analytics'

const beacon = () => document.querySelector('script[data-trimcad-analytics]')

beforeEach(() => {
  document.head.querySelectorAll('script[data-trimcad-analytics]').forEach((node) => node.remove())
})

describe('when analytics is allowed to run', () => {
  it('needs a token, so a build without one reports nothing', () => {
    expect(analyticsEnabled('', 'trimcad.com')).toBe(false)
    expect(analyticsEnabled('   ', 'trimcad.com')).toBe(false)
    expect(analyticsEnabled('a-token', 'trimcad.com')).toBe(true)
  })

  it('never reports from a development host', () => {
    for (const host of ['localhost', '127.0.0.1', 'drawing.local', 'thing.localhost', '']) {
      expect(isLocalHost(host)).toBe(true)
      expect(analyticsEnabled('a-token', host)).toBe(false)
    }
    expect(analyticsEnabled('a-token', 'www.trimcad.com')).toBe(true)
  })
})

describe('loading the beacon', () => {
  it('adds Cloudflare\u2019s beacon with the token it was given', () => {
    expect(initAnalytics({ token: 'test-token', host: 'trimcad.com' })).toBe(true)

    const script = beacon() as HTMLScriptElement
    expect(script).not.toBeNull()
    expect(script.src).toBe(BEACON_SRC)
    expect(JSON.parse(script.getAttribute('data-cf-beacon')!).token).toBe('test-token')
  })

  it('does nothing at all without a token', () => {
    expect(initAnalytics({ token: '', host: 'trimcad.com' })).toBe(false)
    expect(beacon()).toBeNull()
  })

  it('does nothing from a development host', () => {
    expect(initAnalytics({ token: 'test-token', host: 'localhost' })).toBe(false)
    expect(beacon()).toBeNull()
  })

  it('loads once even when called twice, as React can in development', () => {
    expect(initAnalytics({ token: 'test-token', host: 'trimcad.com' })).toBe(true)
    expect(initAnalytics({ token: 'test-token', host: 'trimcad.com' })).toBe(false)
    expect(document.querySelectorAll('script[data-trimcad-analytics]')).toHaveLength(1)
  })
})
