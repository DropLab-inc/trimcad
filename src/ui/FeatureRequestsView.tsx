import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RequestsError,
  SORT_MODES,
  filterRequests,
  loadFeatureRequests,
  relativeTime,
  sortRequests,
  type RequestSort,
  type RequestsResult,
} from '../core/requests'
import { REQUEST_CATEGORIES, SITE, buildIssueUrl, type RequestCategory, type RequestDraft } from '../site'
import { Icon } from './Icon'
import { SiteNav } from './SiteNav'
import { useEscapeToCad } from './useHashRoute'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; result: RequestsResult }
  | { status: 'error'; message: string; retryAt?: number }

const EMPTY_DRAFT: RequestDraft = { title: '', details: '', category: REQUEST_CATEGORIES[0] }

const clock = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * Feature requests live as GitHub issues; this is the reading room. The list is
 * the tracker's own truth — nothing here votes, files or edits on a visitor's
 * behalf, because a static page has no business holding a token that could.
 */
export function FeatureRequestsView() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<RequestSort>('top')
  const [composing, setComposing] = useState(false)
  const runId = useRef(0)

  // Escape leaves the panel, unless the request form is open and wants it first.
  useEscapeToCad(!composing)

  const load = useCallback((force: boolean, options: { showLoading?: boolean } = {}) => {
    const id = ++runId.current
    if (options.showLoading !== false) setState({ status: 'loading' })
    loadFeatureRequests({ repo: SITE.repo, label: SITE.requestLabel, force })
      .then((result) => {
        if (id === runId.current) setState({ status: 'ready', result })
      })
      .catch((error: unknown) => {
        if (id !== runId.current) return
        if (error instanceof RequestsError) setState({ status: 'error', message: error.message, retryAt: error.retryAt })
        else setState({ status: 'error', message: 'The request list could not be loaded.' })
      })
  }, [])

  // The first read happens on mount, where the initial state is already "loading";
  // setting it again from inside the effect would only cost a second render.
  useEffect(() => {
    load(false, { showLoading: false })
  }, [load])

  const requests = useMemo(() => (state.status === 'ready' ? state.result.requests : []), [state])
  const visible = useMemo(() => sortRequests(filterRequests(requests, query), sort), [requests, query, sort])

  return (
    <div className="site-view">
      <SiteNav current="requests" />
      <div className="site-body requests-body">
        <header className="site-hero">
          <div>
            <p className="docs-kicker">Feature requests</p>
            <h1>What should TrimCAD do next?</h1>
            <p className="site-lead">
              Requests are open issues on the project’s GitHub tracker, so the discussion, the labels and the
              history all live in one place — and nothing is lost when this page reloads.
            </p>
          </div>
          <div className="site-hero-actions">
            <button type="button" className="site-primary" onClick={() => setComposing(true)}>
              <Icon name="idea" />
              <span>Request a feature</span>
            </button>
            <a className="site-secondary" href={SITE.issuesUrl} target="_blank" rel="noreferrer noopener">
              <Icon name="github" />
              <span>Open the tracker</span>
            </a>
          </div>
        </header>

        <div className="requests-toolbar">
          <label className="requests-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              placeholder="Search requests"
              aria-label="Search feature requests"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="requests-sort">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as RequestSort)}>
              {SORT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="requests-refresh"
            onClick={() => load(true)}
            disabled={state.status === 'loading'}
            title="Fetch the tracker again"
          >
            <Icon name="refresh" />
            <span>Refresh</span>
          </button>
        </div>

        {state.status === 'ready' && (
          <p className="requests-meta">
            {state.result.requests.length} open {state.result.requests.length === 1 ? 'request' : 'requests'}
            {' · '}
            {state.result.fromCache ? `cached, read at ${clock(state.result.fetchedAt)}` : `read at ${clock(state.result.fetchedAt)}`}
            {state.result.unfiltered && ' · nothing carries the “feature request” label yet, showing every open issue'}
          </p>
        )}

        {state.status === 'loading' && (
          <ul className="request-list" aria-busy="true">
            {[0, 1, 2].map((row) => (
              <li className="request-card skeleton" key={row}>
                <span className="skeleton-line wide" />
                <span className="skeleton-line" />
                <span className="skeleton-line short" />
              </li>
            ))}
          </ul>
        )}

        {state.status === 'error' && (
          <div className="site-notice" role="alert">
            <h2>{state.message}</h2>
            <p>
              {state.retryAt
                ? `GitHub will accept reads again around ${clock(state.retryAt)}. `
                : 'Nothing is lost — the tracker itself is always available. '}
              You can read every request on GitHub in the meantime.
            </p>
            <div className="site-notice-actions">
              <button type="button" className="site-secondary" onClick={() => load(true)}>
                <Icon name="refresh" />
                <span>Try again</span>
              </button>
              <a className="site-primary" href={SITE.issuesUrl} target="_blank" rel="noreferrer noopener">
                <Icon name="github" />
                <span>Read on GitHub</span>
              </a>
            </div>
          </div>
        )}

        {state.status === 'ready' && visible.length === 0 && (
          <div className="site-notice">
            <h2>{requests.length === 0 ? 'No requests yet' : 'Nothing matches that search'}</h2>
            <p>
              {requests.length === 0
                ? 'Be the first: describe what is missing and where you would expect to find it.'
                : 'Try a shorter word, or clear the search to see everything open.'}
            </p>
            <div className="site-notice-actions">
              {requests.length === 0 ? (
                <button type="button" className="site-primary" onClick={() => setComposing(true)}>
                  <Icon name="idea" />
                  <span>Request a feature</span>
                </button>
              ) : (
                <button type="button" className="site-secondary" onClick={() => setQuery('')}>
                  <Icon name="close" />
                  <span>Clear search</span>
                </button>
              )}
            </div>
          </div>
        )}

        {state.status === 'ready' && visible.length > 0 && (
          <ul className="request-list">
            {visible.map((row) => (
              <li className="request-card" key={row.number}>
                <div className="request-votes" title={`${row.votes} reactions on GitHub`}>
                  <Icon name="thumb" />
                  <span>{row.votes}</span>
                </div>
                <div className="request-main">
                  <a className="request-title" href={row.url} target="_blank" rel="noreferrer noopener">
                    {row.title}
                    <span className="request-number">#{row.number}</span>
                  </a>
                  {row.excerpt && <p className="request-excerpt">{row.excerpt}</p>}
                  <div className="request-meta">
                    {row.avatarUrl && (
                      <img className="request-avatar" src={row.avatarUrl} alt="" width={18} height={18} loading="lazy" />
                    )}
                    <a href={row.authorUrl} target="_blank" rel="noreferrer noopener">
                      {row.author}
                    </a>
                    <span>opened {relativeTime(row.createdAt)}</span>
                    <a className="request-comments" href={row.url} target="_blank" rel="noreferrer noopener">
                      {row.comments} {row.comments === 1 ? 'comment' : 'comments'}
                    </a>
                    {row.labels.map((label) => (
                      <span className="request-label" key={label.name}>
                        {label.name}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {composing && <RequestForm onClose={() => setComposing(false)} />}
    </div>
  )
}

/**
 * The form is a front porch, not a second tracker: it collects enough for a
 * useful issue and hands the text to GitHub, where the request actually lives.
 */
function RequestForm({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<RequestDraft>(EMPTY_DRAFT)
  const titleId = 'request-form-title'
  const titleValid = draft.title.trim().length >= 8
  const detailsValid = draft.details.trim().length >= 20
  const ready = titleValid && detailsValid

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const patch = (next: Partial<RequestDraft>) => setDraft((current) => ({ ...current, ...next }))

  /**
   * The issue opens in a new tab; whether it is filed is GitHub's decision, made
   * by a signed-in human, which is exactly the accountability a tracker needs.
   */
  const submit = () => {
    if (!ready) return
    window.open(buildIssueUrl(SITE.repo, draft, SITE.requestLabel), '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div className="site-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="site-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="site-dialog-header">
          <h2 id={titleId}>Request a feature</h2>
          <button type="button" className="site-dialog-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="site-dialog-body">
          <label className="site-field">
            <span>What should it do?</span>
            <input
              type="text"
              value={draft.title}
              placeholder="Trim two objects against a selected boundary"
              onChange={(event) => patch({ title: event.target.value })}
              autoFocus
            />
            <small>{titleValid ? 'Good — that reads like a command name.' : 'Aim for a phrase, at least 8 characters.'}</small>
          </label>

          <label className="site-field">
            <span>Where does it belong?</span>
            <select value={draft.category} onChange={(event) => patch({ category: event.target.value as RequestCategory })}>
              {REQUEST_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="site-field">
            <span>What are you trying to draw?</span>
            <textarea
              rows={6}
              value={draft.details}
              placeholder="The drawing, the steps you tried, and what you expected instead."
              onChange={(event) => patch({ details: event.target.value })}
            />
            <small>{detailsValid ? 'Enough to work from.' : 'A few sentences, at least 20 characters.'}</small>
          </label>

          <p className="site-dialog-note">
            Your words open a prefilled issue on GitHub, labelled <strong>{SITE.requestLabel}</strong>. Nothing is
            posted until you press <em>Submit new issue</em> there, signed in as yourself.
          </p>
        </div>

        <footer className="site-dialog-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="site-primary" disabled={!ready} onClick={submit}>
            <Icon name="github" />
            <span>Continue on GitHub</span>
          </button>
        </footer>
      </div>
    </div>
  )
}
