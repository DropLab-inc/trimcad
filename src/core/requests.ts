/**
 * Feature requests are GitHub issues on the project repository. The app is a
 * static build with no backend and no token, so this module is the whole client:
 * it reads the public API, shapes what comes back for the UI, caches it briefly
 * (the unauthenticated limit is per visitor IP, not per site) and turns failures
 * into sentences a drafter can act on.
 */
export type GitHubLabel = {
  name: string
  color?: string
}

export type GitHubIssue = {
  number: number
  title: string
  body?: string | null
  html_url: string
  state: string
  created_at: string
  updated_at: string
  comments: number
  labels: (string | GitHubLabel)[]
  user: { login: string; html_url: string; avatar_url: string } | null
  reactions?: { total_count?: number; '+1'?: number } | null
  pull_request?: unknown
}

export type FeatureRequest = {
  number: number
  title: string
  url: string
  author: string
  authorUrl: string
  avatarUrl: string
  createdAt: string
  updatedAt: string
  comments: number
  votes: number
  labels: GitHubLabel[]
  excerpt: string
}

export type RequestSort = 'top' | 'newest' | 'discussed'

export const SORT_MODES: { value: RequestSort; label: string }[] = [
  { value: 'top', label: 'Most wanted' },
  { value: 'newest', label: 'Newest' },
  { value: 'discussed', label: 'Most discussed' },
]

export const CACHE_KEY = 'trimcad.requests.v1'
export const CACHE_TTL_MS = 10 * 60 * 1000

export type RequestsResult = {
  requests: FeatureRequest[]
  fetchedAt: number
  fromCache: boolean
  /** True when nothing carries the request label yet and every open issue is being shown. */
  unfiltered: boolean
}

export type RequestsFailure = {
  message: string
  /** Set when GitHub told us when the hourly window resets. */
  retryAt?: number
}

export class RequestsError extends Error {
  readonly retryAt?: number

  constructor(message: string, retryAt?: number) {
    super(message)
    this.name = 'RequestsError'
    this.retryAt = retryAt
  }
}

/** A request is an open issue that is not a pull request and wears the request label. */
export function isRequest(issue: GitHubIssue, label: string): boolean {
  if (issue.pull_request) return false
  return issue.labels.some((entry) => normaliseLabel(entry).toLowerCase() === label.toLowerCase())
}

function normaliseLabel(entry: string | GitHubLabel): string {
  return typeof entry === 'string' ? entry : entry.name
}

/** Long bodies make cards unreadable; the first paragraph is the useful part. */
export function excerptOf(body: string | null | undefined, limit = 220): string {
  if (!body) return ''
  const text = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>#]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit).replace(/\s+\S*$/, '')}…`
}

export function toFeatureRequest(issue: GitHubIssue): FeatureRequest {
  const votes = issue.reactions?.['+1'] ?? issue.reactions?.total_count ?? 0
  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    author: issue.user?.login ?? 'someone',
    authorUrl: issue.user?.html_url ?? '',
    avatarUrl: issue.user?.avatar_url ?? '',
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    comments: issue.comments ?? 0,
    votes,
    labels: issue.labels
      .map((entry) => (typeof entry === 'string' ? { name: entry } : { name: entry.name, color: entry.color }))
      .filter((entry) => entry.name.toLowerCase() !== 'feature request'),
    excerpt: excerptOf(issue.body),
  }
}

export function sortRequests(requests: FeatureRequest[], mode: RequestSort): FeatureRequest[] {
  const rows = [...requests]
  const age = (row: FeatureRequest) => Date.parse(row.createdAt) || 0
  switch (mode) {
    case 'newest':
      return rows.sort((a, b) => age(b) - age(a))
    case 'discussed':
      return rows.sort((a, b) => b.comments - a.comments || age(b) - age(a))
    case 'top':
    default:
      return rows.sort((a, b) => b.votes - a.votes || b.comments - a.comments || age(b) - age(a))
  }
}

export function filterRequests(requests: FeatureRequest[], query: string): FeatureRequest[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return requests
  return requests.filter((row) =>
    [row.title, row.excerpt, row.author, ...row.labels.map((label) => label.name)]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  )
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}

export type LoadOptions = {
  repo: string
  label: string
  fetcher?: typeof fetch
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  now?: number
  ttlMs?: number
  force?: boolean
}

export function readCache(storage: LoadOptions['storage'], now: number, ttlMs: number): RequestsResult | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { fetchedAt: number; requests: FeatureRequest[]; unfiltered: boolean }
    if (!Array.isArray(parsed.requests)) return null
    if (now - parsed.fetchedAt > ttlMs) return null
    return { requests: parsed.requests, fetchedAt: parsed.fetchedAt, fromCache: true, unfiltered: Boolean(parsed.unfiltered) }
  } catch {
    // A cache that cannot be read is not an error worth showing anyone.
    return null
  }
}

function writeCache(storage: LoadOptions['storage'], result: RequestsResult): void {
  if (!storage) return
  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: result.fetchedAt, requests: result.requests, unfiltered: result.unfiltered }),
    )
  } catch {
    // Private-mode storage quotas are the visitor's business, not a failure.
  }
}

export async function loadFeatureRequests(options: LoadOptions): Promise<RequestsResult> {
  const now = options.now ?? Date.now()
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS
  const storage = options.storage === undefined ? safeStorage() : options.storage

  if (!options.force) {
    const cached = readCache(storage, now, ttlMs)
    if (cached) return cached
  }

  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(
    `https://api.github.com/repos/${options.repo}/issues?state=open&sort=updated&direction=desc&per_page=100`,
    { headers: { Accept: 'application/vnd.github+json' } },
  )

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset'))
      throw new RequestsError(
        'GitHub is rate-limiting this browser for a little while.',
        Number.isFinite(reset) ? reset * 1000 : undefined,
      )
    }
    if (response.status === 404) {
      throw new RequestsError('The request tracker could not be found on GitHub.')
    }
    throw new RequestsError(`GitHub answered with ${response.status}.`)
  }

  const issues = (await response.json()) as GitHubIssue[]
  const wanted = issues.filter((issue) => isRequest(issue, options.label))
  // Before the first labelled issue exists the list would be empty and useless, so
  // fall back to every open issue and say so on screen.
  const chosen = wanted.length > 0 ? wanted : issues.filter((issue) => !issue.pull_request)
  const result: RequestsResult = {
    requests: chosen.map(toFeatureRequest),
    fetchedAt: now,
    fromCache: false,
    unfiltered: wanted.length === 0,
  }
  writeCache(storage, result)
  return result
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
