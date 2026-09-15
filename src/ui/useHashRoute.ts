import { useCallback, useEffect, useState } from 'react'
import { DOC_PAGES } from '../core/docs'

/**
 * The app is one page with a reader bolted on, so routing is the hash. Nothing
 * has to be configured on the server, a link to the documentation is shareable
 * and the browser's own Back button does the obvious thing.
 */
export type Route =
  | { kind: 'cad' }
  | { kind: 'docs'; docId: string }
  | { kind: 'requests' }
  | { kind: 'support' }

export const DEFAULT_DOC = DOC_PAGES[0].id

export function routeHash(route: Route): string {
  switch (route.kind) {
    case 'docs':
      return `#/docs/${route.docId}`
    case 'requests':
      return '#/requests'
    case 'support':
      return '#/support'
    case 'cad':
    default:
      return '#/'
  }
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0]
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return { kind: 'cad' }
  switch (parts[0]) {
    case 'docs': {
      const requested = parts[1] ?? ''
      const known = DOC_PAGES.some((page) => page.id === requested)
      return { kind: 'docs', docId: known ? requested : DEFAULT_DOC }
    }
    case 'requests':
      return { kind: 'requests' }
    case 'support':
      return { kind: 'support' }
    default:
      return { kind: 'cad' }
  }
}

export function navigate(route: Route): void {
  const next = routeHash(route)
  if (window.location.hash === next) return
  window.location.hash = next
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route
}

/** Panel views close with Escape, the way every other overlay in the app does. */
export function useEscapeToCad(enabled: boolean): void {
  const close = useCallback(() => navigate({ kind: 'cad' }), [])
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, close])
}
