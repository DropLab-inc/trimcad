/**
 * Cloudflare Web Analytics.
 *
 * Aggregate page views — no cookies, no fingerprinting, no personal data, and nothing shared
 * with anyone else. That is the only kind of measurement that fits a drafting tool which
 * advertises having no account and no login.
 *
 * The beacon token is a build-time value, like the sponsor URL. It is not a secret (it ships
 * in the page either way), but an empty token means no analytics at all, so a local build or a
 * fork that never sets it reports nothing.
 */

const env = import.meta.env as unknown as Record<string, string | undefined>

export const BEACON_TOKEN = (env.VITE_CLOUDFLARE_BEACON ?? '').trim()

/** Fixed by the provider; not configurable. */
export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

/**
 * The page a beacon runs on is a hostname, and the numbers are about the deployed site, so a
 * development server never reports. Apache-style `.local` names are included because they are
 * the other way a local checkout gets opened.
 */
export const isLocalHost = (host: string): boolean =>
  host === 'localhost' ||
  host === '127.0.0.1' ||
  host === '[::1]' ||
  host === '' ||
  host.endsWith('.local') ||
  host.endsWith('.localhost')

/** Both conditions have to hold: a token to report with, and a host worth reporting about. */
export const analyticsEnabled = (token: string, host: string): boolean =>
  token.trim() !== '' && !isLocalHost(host)

/**
 * Loads the beacon once. Calling it twice is harmless, which matters because React can run an
 * effect twice in development.
 */
export function initAnalytics(options: { token?: string; host?: string } = {}): boolean {
  const token = options.token ?? BEACON_TOKEN
  const host = options.host ?? (typeof window === 'undefined' ? '' : window.location.hostname)
  if (!analyticsEnabled(token, host)) return false
  if (document.querySelector('script[data-trimcad-analytics]') !== null) return false

  const script = document.createElement('script')
  script.type = 'module'
  script.src = BEACON_SRC
  // Cloudflare reads its own token out of this attribute; the marker attribute is ours, so the
  // beacon can be spotted (and tested) without depending on theirs.
  script.setAttribute('data-cf-beacon', JSON.stringify({ token }))
  script.setAttribute('data-trimcad-analytics', 'cloudflare')
  document.head.append(script)
  return true
}
