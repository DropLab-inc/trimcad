import { useEffect } from 'react'

/**
 * How much of the layout the on-screen keyboard is covering.
 *
 * Android Chrome can be told to resize the layout viewport (the
 * `interactive-widget` hint in index.html) and then nothing is needed here. iOS
 * overlays the keyboard instead, leaving the command bar behind it, so the shell
 * lifts its bottom rows by this many pixels whenever the keyboard is up.
 */
export function useKeyboardInset(enabled: boolean): void {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    if (!enabled || !viewport) {
      root.style.removeProperty('--keyboard-inset')
      return
    }

    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop
      // Small differences are browser chrome moving, not a keyboard.
      const inset = covered > 120 ? Math.round(covered) : 0
      if (inset > 0) root.style.setProperty('--keyboard-inset', `${inset}px`)
      else root.style.removeProperty('--keyboard-inset')
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      root.style.removeProperty('--keyboard-inset')
    }
  }, [enabled])
}
