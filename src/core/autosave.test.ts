import { describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { makeDefaultDocument } from './document'
import { decideRecovery, describeAge, type AutosavePayload } from './autosave'
import type { DrawingDocument } from './types'

const drawing = (): DrawingDocument => {
  const doc = makeDefaultDocument()
  return { ...doc, entities: [createLine(doc.layers[0].id, { x: 0, y: 0 }, { x: 1, y: 1 })] }
}

const payload = (overrides: Partial<AutosavePayload> = {}): AutosavePayload => ({
  savedAt: Date.now(),
  sessionId: 'session-a',
  document: drawing(),
  ...overrides,
})

describe('deciding what to do with an autosave', () => {
  it('puts work straight back when the same session reloads', () => {
    // Reloading the page is not a crash, so there is nothing to ask about.
    expect(decideRecovery(payload(), 'session-a')).toMatchObject({ kind: 'restore' })
  })

  it('offers work left behind by an earlier session', () => {
    expect(decideRecovery(payload({ sessionId: 'session-old' }), 'session-a')).toMatchObject({ kind: 'offer' })
  })

  it('stays quiet when there is no autosave at all', () => {
    expect(decideRecovery(null, 'session-a')).toEqual({ kind: 'none' })
  })

  it('stays quiet about an empty drawing, which is not worth recovering', () => {
    expect(decideRecovery(payload({ document: makeDefaultDocument() }), 'session-a')).toEqual({ kind: 'none' })
  })

  it('stays quiet about a payload with no document in it', () => {
    expect(decideRecovery({ savedAt: 0, sessionId: 'x' } as AutosavePayload, 'session-a')).toEqual({ kind: 'none' })
  })
})

describe('describing when the work was saved', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  const ago = (ms: number) => describeAge(now - ms, now)

  it('calls a few seconds ago just now', () => {
    expect(ago(5_000)).toBe('just now')
  })

  it('counts the minutes', () => {
    expect(ago(4 * 60_000)).toBe('4 minutes ago')
    expect(ago(60_000)).toBe('1 minute ago')
  })

  it('counts the hours', () => {
    expect(ago(3 * 3_600_000)).toBe('3 hours ago')
  })

  it('counts the days', () => {
    expect(ago(2 * 86_400_000)).toBe('2 days ago')
  })
})
