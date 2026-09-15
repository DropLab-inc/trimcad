import { describe, expect, it, vi } from 'vitest'
import {
  CACHE_KEY,
  RequestsError,
  excerptOf,
  filterRequests,
  isRequest,
  loadFeatureRequests,
  relativeTime,
  sortRequests,
  toFeatureRequest,
  type FeatureRequest,
  type GitHubIssue,
} from './requests'

const LABEL = 'feature request'

const issue = (overrides: Partial<GitHubIssue> = {}): GitHubIssue => ({
  number: 7,
  title: 'Trim against a boundary',
  body: 'I want to pick a fence and cut everything crossing it.',
  html_url: 'https://github.com/DropLab-inc/trimcad/issues/7',
  state: 'open',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-02T10:00:00Z',
  comments: 3,
  labels: [LABEL],
  user: { login: 'kam', html_url: 'https://github.com/kam', avatar_url: 'https://avatars.example/kam.png' },
  reactions: { total_count: 5, '+1': 4 },
  ...overrides,
})

const storageStub = () => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })

describe('what counts as a feature request', () => {
  it('accepts an open issue wearing the label', () => {
    expect(isRequest(issue(), LABEL)).toBe(true)
  })

  it('ignores the label’s case and treats string labels as labels', () => {
    expect(isRequest(issue({ labels: ['Feature Request'] }), LABEL)).toBe(true)
    expect(isRequest(issue({ labels: [{ name: 'FEATURE REQUEST' }] }), LABEL)).toBe(true)
  })

  it('refuses anything that is not asking for a feature', () => {
    expect(isRequest(issue({ labels: ['bug'] }), LABEL)).toBe(false)
    expect(isRequest(issue({ labels: [] }), LABEL)).toBe(false)
  })

  it('refuses pull requests even when they wear the label', () => {
    expect(isRequest(issue({ pull_request: { url: 'x' } }), LABEL)).toBe(false)
  })
})

describe('shaping an issue for the list', () => {
  it('reads the fields the card shows', () => {
    const request = toFeatureRequest(issue())
    expect(request).toMatchObject({
      number: 7,
      title: 'Trim against a boundary',
      author: 'kam',
      comments: 3,
      votes: 4,
      url: 'https://github.com/DropLab-inc/trimcad/issues/7',
    })
  })

  it('hides the request label itself, since every card carries it', () => {
    const request = toFeatureRequest(issue({ labels: [LABEL, { name: 'good first issue', color: 'abcdef' }] }))
    expect(request.labels.map((label) => label.name)).toEqual(['good first issue'])
  })

  it('falls back to the total reaction count when nobody used the thumb', () => {
    expect(toFeatureRequest(issue({ reactions: { total_count: 6 } })).votes).toBe(6)
    expect(toFeatureRequest(issue({ reactions: null })).votes).toBe(0)
  })

  it('copes with a deleted author', () => {
    expect(toFeatureRequest(issue({ user: null })).author).toBe('someone')
  })
})

describe('excerptOf', () => {
  it('drops the template comments GitHub adds to an issue body', () => {
    expect(excerptOf('<!-- thanks -->Real request')).toBe('Real request')
  })

  it('drops fenced code and flattens markdown', () => {
    const text = excerptOf('## Heading\n\nUse **bold** and `code`:\n\n```\nsome code\n```\n\nend')
    expect(text).not.toContain('some code')
    expect(text).not.toContain('**')
    expect(text).toContain('Heading Use bold and code: end')
  })

  it('keeps link text and throws the URL away', () => {
    expect(excerptOf('See [the manual](https://example.com/manual).')).toBe('See the manual.')
  })

  it('cuts a long body at a word boundary', () => {
    const long = `${'word '.repeat(80)}end`
    const text = excerptOf(long, 60)
    expect(text.length).toBeLessThanOrEqual(61)
    expect(text.endsWith('…')).toBe(true)
    expect(text).not.toMatch(/wor…$/)
  })

  it('copes with no body at all', () => {
    expect(excerptOf(null)).toBe('')
    expect(excerptOf(undefined)).toBe('')
  })
})

describe('ordering and searching the list', () => {
  const request = (over: Partial<FeatureRequest>): FeatureRequest => ({
    number: 1,
    title: 'Request',
    url: 'https://example.com/1',
    author: 'kam',
    authorUrl: '',
    avatarUrl: '',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    comments: 0,
    votes: 0,
    labels: [],
    excerpt: '',
    ...over,
  })

  it('puts the most wanted first', () => {
    const rows = [
      request({ number: 1, votes: 2 }),
      request({ number: 2, votes: 9 }),
      request({ number: 3, votes: 2, comments: 4 }),
    ]
    expect(sortRequests(rows, 'top').map((row) => row.number)).toEqual([2, 3, 1])
  })

  it('can order by when something was asked for', () => {
    const rows = [
      request({ number: 1, createdAt: '2026-08-01T00:00:00Z' }),
      request({ number: 2, createdAt: '2026-09-10T00:00:00Z' }),
    ]
    expect(sortRequests(rows, 'newest').map((row) => row.number)).toEqual([2, 1])
  })

  it('can order by how much discussion there is', () => {
    const rows = [request({ number: 1, comments: 1 }), request({ number: 2, comments: 8 })]
    expect(sortRequests(rows, 'discussed').map((row) => row.number)).toEqual([2, 1])
  })

  it('searches titles, authors and labels but not the whole internet', () => {
    const rows = [
      request({ number: 1, title: 'Trim fences' }),
      request({ number: 2, title: 'Layers', author: 'dana' }),
      request({ number: 3, title: 'Plotting', labels: [{ name: 'export' }] }),
    ]
    expect(filterRequests(rows, 'trim').map((row) => row.number)).toEqual([1])
    expect(filterRequests(rows, 'DANA').map((row) => row.number)).toEqual([2])
    expect(filterRequests(rows, 'export').map((row) => row.number)).toEqual([3])
    expect(filterRequests(rows, '').length).toBe(3)
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-09-14T12:00:00Z')

  it.each([
    ['2026-09-14T11:59:40Z', 'just now'],
    ['2026-09-14T11:55:00Z', '5m ago'],
    ['2026-09-14T09:00:00Z', '3h ago'],
    ['2026-09-12T12:00:00Z', '2d ago'],
    ['2026-07-14T12:00:00Z', '2mo ago'],
    ['2025-09-14T12:00:00Z', '1y ago'],
  ])('turns %s into %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected)
  })

  it('says nothing rather than “NaN” for a date it cannot read', () => {
    expect(relativeTime('not a date', now)).toBe('')
  })
})

describe('loading the requests', () => {
  const base = { repo: 'DropLab-inc/trimcad', label: LABEL }

  it('reads the tracker, keeps the labelled issues and caches them', async () => {
    const storage = storageStub()
    const fetcher = vi.fn(async (..._args: [string, RequestInit?]) =>
      jsonResponse([issue({ number: 7 }), issue({ number: 8, labels: ['bug'] })]),
    )
    const result = await loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage, now: 1000 })

    expect(result.requests.map((row) => row.number)).toEqual([7])
    expect(result.fromCache).toBe(false)
    expect(result.unfiltered).toBe(false)
    expect(fetcher.mock.calls[0][0]).toContain('/repos/DropLab-inc/trimcad/issues?state=open')
    expect(storage.map.get(CACHE_KEY)).toContain('"number":7')
  })

  it('answers from the cache inside the window instead of asking GitHub again', async () => {
    const storage = storageStub()
    const fetcher = vi.fn(async () => jsonResponse([issue()]))
    await loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage, now: 1000 })
    const second = await loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage, now: 2000 })

    expect(second.fromCache).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('asks again when the cache is stale or a refresh was demanded', async () => {
    const storage = storageStub()
    const fetcher = vi.fn(async () => jsonResponse([issue()]))
    await loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage, now: 1000 })
    await loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage, now: 1000 + 20 * 60 * 1000 })
    await loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage, now: 1000, force: true })

    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('shows every open issue while nothing wears the label yet', async () => {
    const fetcher = async () => jsonResponse([issue({ labels: [] }), issue({ number: 9, labels: ['bug'] })])
    const result = await loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage: null, now: 1 })

    expect(result.unfiltered).toBe(true)
    expect(result.requests.map((row) => row.number)).toEqual([7, 9])
  })

  it('survives a cache that has been tampered with', async () => {
    const storage = storageStub()
    storage.map.set(CACHE_KEY, '{not json')
    const fetcher = vi.fn(async () => jsonResponse([issue()]))
    const result = await loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage, now: 1000 })
    expect(result.requests.length).toBe(1)
  })

  it('explains a rate limit and when it lifts', async () => {
    const fetcher = async () =>
      new Response('{}', { status: 403, headers: { 'x-ratelimit-reset': '1800000000' } })
    await expect(
      loadFeatureRequests({ ...base, fetcher: fetcher as unknown as typeof fetch, storage: null, now: 1 }),
    ).rejects.toMatchObject({ name: 'RequestsError', retryAt: 1800000000000 })
  })

  it('says something useful for every other refusal', async () => {
    const notFound = async () => new Response('{}', { status: 404 })
    await expect(
      loadFeatureRequests({ ...base, fetcher: notFound as unknown as typeof fetch, storage: null, now: 1 }),
    ).rejects.toBeInstanceOf(RequestsError)

    const broken = async () => new Response('{}', { status: 500 })
    await expect(
      loadFeatureRequests({ ...base, fetcher: broken as unknown as typeof fetch, storage: null, now: 1 }),
    ).rejects.toThrow('GitHub answered with 500.')
  })
})
