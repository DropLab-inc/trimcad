import type { DrawingDocument } from './types'

const KEY = 'droplabcad.autosave.v1'
const SESSION_KEY = 'droplabcad.session'

export type AutosavePayload = {
  savedAt: number
  /** Which run of the app wrote this, so a reload can be told apart from a crash. */
  sessionId: string
  document: DrawingDocument
}

/**
 * Identifies this run of the app. It lives in sessionStorage, so reloading the page keeps the same
 * id while opening a new tab, or coming back after the browser was closed, gets a fresh one.
 */
export const currentSessionId = (): string => {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return 'no-session-storage'
  }
}

export const saveAutosave = (document: DrawingDocument) => {
  const payload: AutosavePayload = {
    savedAt: Date.now(),
    sessionId: currentSessionId(),
    document,
  }
  localStorage.setItem(KEY, JSON.stringify(payload))
}

export const loadAutosave = (): AutosavePayload | null => {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AutosavePayload
  } catch {
    return null
  }
}

export const clearAutosave = () => {
  localStorage.removeItem(KEY)
}

export type RecoveryDecision =
  | { kind: 'none' }
  | { kind: 'restore'; document: DrawingDocument }
  | { kind: 'offer'; document: DrawingDocument; savedAt: number }

/**
 * Works out what to do with an autosave found at startup.
 *
 * Reloading the page is not a crash, so work written by this same run comes straight back without
 * asking. Only a file left behind by an earlier run, with something actually drawn in it, is worth
 * interrupting the user over.
 */
export const decideRecovery = (payload: AutosavePayload | null, sessionId: string): RecoveryDecision => {
  if (!payload?.document || !Array.isArray(payload.document.entities)) return { kind: 'none' }
  if (payload.document.entities.length === 0) return { kind: 'none' }
  if (payload.sessionId === sessionId) return { kind: 'restore', document: payload.document }
  return { kind: 'offer', document: payload.document, savedAt: payload.savedAt }
}

/** "just now", "4 minutes ago", "2 hours ago" — how AutoCAD words a recovery offer. */
export const describeAge = (savedAt: number, now = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
