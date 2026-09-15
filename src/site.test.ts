import { describe, expect, it } from 'vitest'
import { REQUEST_CATEGORIES, SITE, buildIssueUrl, sponsorIsLive } from './site'

describe('buildIssueUrl', () => {
  const draft = { title: 'Trim against a boundary', details: 'I want to pick a fence and cut everything crossing it.', category: REQUEST_CATEGORIES[0] }

  it('points at the repository issue form', () => {
    expect(buildIssueUrl(SITE.repo, draft, SITE.requestLabel)).toMatch(
      /^https:\/\/github\.com\/DropLab-inc\/trimcad\/issues\/new\?/,
    )
  })

  it('carries the title, the category and the words of the request', () => {
    const url = new URL(buildIssueUrl(SITE.repo, draft, SITE.requestLabel))
    expect(url.searchParams.get('title')).toBe(draft.title)
    expect(url.searchParams.get('labels')).toBe(SITE.requestLabel)
    const body = url.searchParams.get('body') ?? ''
    expect(body).toContain(draft.details)
    expect(body).toContain(draft.category)
  })

  it('encodes characters that would otherwise break the query', () => {
    const awkward = { ...draft, title: 'Offset & trim: 50% faster? #1' }
    const url = buildIssueUrl(SITE.repo, awkward, SITE.requestLabel)
    expect(url).not.toContain(' ')
    expect(new URL(url).searchParams.get('title')).toBe(awkward.title)
  })

  it('trims the whitespace a textarea leaves behind', () => {
    const padded = { ...draft, title: '  Padded title  ', details: '  details  ' }
    const url = new URL(buildIssueUrl(SITE.repo, padded, SITE.requestLabel))
    expect(url.searchParams.get('title')).toBe('Padded title')
    expect(url.searchParams.get('body') ?? '').toContain('details')
  })

  it('omits the label parameter when there is no label to apply', () => {
    const url = new URL(buildIssueUrl(SITE.repo, draft, ''))
    expect(url.searchParams.has('labels')).toBe(false)
  })
})

describe('sponsorIsLive', () => {
  it('accepts a real sponsorship profile', () => {
    expect(sponsorIsLive('https://github.com/sponsors/DropLab-inc')).toBe(true)
  })

  it('refuses anything that is not a sponsorship profile', () => {
    expect(sponsorIsLive('')).toBe(false)
    expect(sponsorIsLive('https://github.com/DropLab-inc')).toBe(false)
    expect(sponsorIsLive('http://github.com/sponsors/x')).toBe(false)
    expect(sponsorIsLive('https://example.com/sponsors/x')).toBe(false)
  })

  it('ships dormant unless a build supplies the profile', () => {
    expect(SITE.sponsorUrl === '' || sponsorIsLive(SITE.sponsorUrl)).toBe(true)
  })
})
