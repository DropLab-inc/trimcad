/**
 * Every outbound link the app offers lives here. Moving the repository, renaming
 * the request label or switching sponsorship on is then one edit, never a hunt
 * through JSX for a stray URL.
 */
export const SITE = {
  name: 'TrimCAD',
  repo: 'DropLab-inc/trimcad',
  repoUrl: 'https://github.com/DropLab-inc/trimcad',
  issuesUrl: 'https://github.com/DropLab-inc/trimcad/issues',
  starsUrl: 'https://github.com/DropLab-inc/trimcad/stargazers',
  licenseUrl: 'https://github.com/DropLab-inc/trimcad/blob/master/LICENSE',
  /** Applied to a request filed from inside the app, so the list can filter on it. */
  requestLabel: 'feature request',
  /**
   * Sponsorship stays dormant until the build supplies a real profile:
   *   VITE_SPONSOR_URL=https://github.com/sponsors/<handle> npm run build
   * Left empty, the support view says so plainly instead of offering a dead button.
   */
  sponsorUrl: (import.meta.env.VITE_SPONSOR_URL ?? '').trim(),
  sponsorSetupUrl: 'https://github.com/sponsors/accounts',
  license: 'MIT',
} as const

export const REQUEST_CATEGORIES = [
  'A new tool or command',
  'Drawing and editing',
  'Files, import and export',
  'Speed and reliability',
  'Interface and accessibility',
  'Something else',
] as const

export type RequestCategory = (typeof REQUEST_CATEGORIES)[number]

export type RequestDraft = {
  title: string
  details: string
  category: RequestCategory
}

/**
 * The GitHub issue form, prefilled from the in-app draft. Filing from inside the
 * app must not produce a thinner report than filing on GitHub directly, so the
 * category and the point of the request are baked into the body.
 */
export function buildIssueUrl(repo: string, draft: RequestDraft, label: string): string {
  const title = draft.title.trim()
  const details = draft.details.trim()
  const body = [
    '### What I would like TrimCAD to do',
    '',
    details,
    '',
    `### Where it belongs — ${draft.category}`,
    '',
    '_Filed from the TrimCAD app._',
  ].join('\n')

  const params = new URLSearchParams({ title, body })
  if (label) params.set('labels', label)
  return `https://github.com/${repo}/issues/new?${params.toString()}`
}

/** TrimCAD is served from a static build, so the sponsor link is a build input rather than a secret. */
export function sponsorIsLive(url: string = SITE.sponsorUrl): boolean {
  return /^https:\/\/github\.com\/sponsors\/[A-Za-z0-9-]+$/.test(url)
}
