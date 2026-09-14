import { useEffect, useMemo, useRef } from 'react'
import { DOC_PAGES, findDoc, renderDoc } from '../core/docs'
import { SiteNav } from './SiteNav'

/**
 * The repository's own markdown, rendered in the app. The bundle carries the
 * same files GitHub shows, so the manual has exactly one source.
 */
export function DocsView({ docId }: { docId: string }) {
  const page = findDoc(docId)
  const { html, headings } = useMemo(() => renderDoc(page.body), [page])
  const articleRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // A new page starts at the top; nothing is more disorienting than landing mid-manual.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [page.id])

  /*
   * The manual is full of `#anchor` links, and this app routes with the hash —
   * letting the browser follow them would throw the reader out of the page. They
   * scroll the article instead.
   */
  const onArticleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    if (!href.startsWith('#')) return
    event.preventDefault()
    const id = href.slice(1)
    const target = articleRef.current?.querySelector(`#${CSS.escape(id)}`)
    target?.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="site-view">
      <SiteNav current="docs" />
      <div className="site-body docs-body" ref={scrollRef}>
        <nav className="docs-nav" aria-label="Documentation">
          <div className="docs-nav-group">
            <h2>Manual</h2>
            <ul>
              {DOC_PAGES.map((entry) => (
                <li key={entry.id}>
                  <a className={entry.id === page.id ? 'active' : ''} href={`#/docs/${entry.id}`}>
                    {entry.title}
                  </a>
                  <p>{entry.summary}</p>
                </li>
              ))}
            </ul>
          </div>
          {headings.length > 0 && (
            <div className="docs-nav-group">
              <h2>On this page</h2>
              <ul className="docs-toc">
                {headings.map((heading) => (
                  <li key={heading.id} className={`level-${heading.level}`}>
                    <a
                      href={`#${heading.id}`}
                      onClick={(event) => {
                        event.preventDefault()
                        articleRef.current?.querySelector(`#${CSS.escape(heading.id)}`)?.scrollIntoView({ block: 'start' })
                      }}
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        <article className="docs-article" ref={articleRef} onClick={onArticleClick}>
          <p className="docs-kicker">{page.title}</p>
          {/* The markdown is sanitised in renderDoc before it reaches the DOM. */}
          <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
    </div>
  )
}
