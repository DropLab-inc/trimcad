/**
 * First-party session metrics: how long the app was actually used.
 *
 * Cloudflare Web Analytics counts page loads, and a single-page app shows one load no matter how
 * long someone draws — the dataset carries no duration field (every candidate name was probed and
 * answered `unknown field`), so the bounce-style number it can produce is meaningless here. The
 * page's own `pagehide` event is the only place the truth lives, so this module measures it and
 * reports it to the site's own origin.
 *
 * The offline rules, which are the whole design:
 *
 * - The measurement costs nothing until the page closes: no timers, no polling, no network traffic
 *   while anyone is drawing.
 * - The report is one `fetch` with `keepalive`, fire-and-forget, never awaited by anything. A
 *   failure is swallowed — an unreachable collector is a lost data point, never a broken app and
 *   never a console error the user sees.
 * - There is no queue and no retry. Retrying offline would mean storing something to retry, which
 *   means storage, which means the tool starts keeping state about its users. It does not.
 *
 * What is collected: total visible time, the time the drawing tool was actively in use (a pointer
 * or key event within the last 30 seconds), and whether a document was ever modified. No
 * identifiers of any kind — no cookie, no fingerprint, no storage. A visitor is one page session
 * and nothing persists about them after the tab closes.
 */

/** Pointer or keyboard activity inside this window counts as "drawing". */
const ACTIVE_WINDOW_MS = 30_000
/** Reports are throttled to at most one per session — the pagehide send. */
const MAX_SESSION_MS = 24 * 60 * 60 * 1000

export type SessionSample = {
  /** Milliseconds the page was visible, from first paint to pagehide. */
  visibleMs: number
  /** Milliseconds with pointer/key activity inside the active window. */
  activeMs: number
  /** True when any change landed in the document during the session. */
  edited: boolean
  /** Seconds, rounded — the resolution the report carries. */
}

let tracking = false
const state = {
  startedAt: 0,
  lastActivityAt: 0,
  activeMs: 0,
  edited: false,
  reported: false,
}

/** Marks the session as active; called on pointer and keyboard events. */
export function markActivity(now: number = Date.now()): void {
  if (!tracking) return
  if (now - state.lastActivityAt <= ACTIVE_WINDOW_MS) {
    state.activeMs += Math.min(now - state.lastActivityAt, ACTIVE_WINDOW_MS)
  } else {
    // A gap longer than the window resumes counting from now: the drawing was left and returned to.
    state.activeMs += ACTIVE_WINDOW_MS
  }
  state.lastActivityAt = now
}

export function markEdited(): void {
  state.edited = true
}

/** True when the page is showing and time is accruing. */
export function trackingStarted(): boolean {
  return tracking
}

/** Starts measuring. Idempotent; React StrictMode runs effects twice in development. */
export function startSessionTracking(options: { collector?: string; now?: number } = {}): boolean {
  if (typeof window === 'undefined') return false
  if (tracking) return false
  const now = options.now ?? Date.now()
  tracking = true
  state.startedAt = now
  state.lastActivityAt = now

  window.addEventListener('pointerdown', onActivity, { passive: true })
  window.addEventListener('pointermove', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity, { passive: true })

  const collector = options.collector ?? '/trimcad-session'
  window.addEventListener('pagehide', () => report(collector))
  // Mobile Safari fires pagehide unreliably; visibilitychange to hidden is the same moment for it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') report(collector)
  })
  return true
}

const onActivity = (): void => markActivity()

/** The sample as it would be reported right now. Exported for tests. */
export function currentSample(now: number = Date.now()): SessionSample {
  const visible = Math.min(Math.max(0, now - state.startedAt), MAX_SESSION_MS)
  return {
    visibleMs: visible,
    activeMs: Math.min(state.activeMs, visible),
    edited: state.edited,
  }
}

/** One report per session: the pagehide send, or the visibility send that follows it. */
export function report(collector: string, now: number = Date.now()): boolean {
  if (state.reported || !tracking) return false
  const body = JSON.stringify(currentSample(now))
  // A throw from the send itself (a dead network can raise synchronously) is a lost data point,
  // never an application error: everything here is guarded, and nothing retries.
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      state.reported = navigator.sendBeacon(collector, new Blob([body], { type: 'application/json' }))
      if (state.reported) return true
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch(collector, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
    state.reported = true
    return true
  } catch {
    return false
  }
}

/** Test hook: forget the session so a suite can run several start/report cycles. */
export function resetSessionForTests(): void {
  tracking = false
  state.startedAt = 0
  state.lastActivityAt = 0
  state.activeMs = 0
  state.edited = false
  state.reported = false
}
