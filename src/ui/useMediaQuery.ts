import { useEffect, useState } from 'react'

/** Where the app stops being a desktop window: below this, the shell rearranges. */
export const NARROW_QUERY = '(max-width: 820px)'

function readMatch(query: string): boolean {
  try {
    return window.matchMedia(query).matches
  } catch {
    // A browser without matchMedia (or a test without a stub) gets the desktop layout.
    return false
  }
}

/** True while the viewport matches, and it follows a resize or a device rotation. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatch(query))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}
