import { useEffect } from 'react'
import { useCadStore } from '../core/store'
import { useFileActions } from './useFileActions'

/** True while the user is typing into the command line or a panel field. */
const isTyping = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * The accelerators every desktop application shares: file handling, undo and redo, and the
 * clipboard. Drawing keys such as Escape and Enter belong to the canvas and stay there.
 */
export const useGlobalShortcuts = () => {
  const files = useFileActions()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const accel = event.ctrlKey || event.metaKey
      if (!accel || event.altKey) return

      const store = useCadStore.getState()
      const key = event.key.toLowerCase()

      // File accelerators work even from the command line; the browser would otherwise take them.
      switch (key) {
        case 'n':
          event.preventDefault()
          files.newDrawing()
          return
        case 'o':
          event.preventDefault()
          void files.openDrawing()
          return
        case 's':
          event.preventDefault()
          if (event.shiftKey) files.saveDrawingAs()
          else files.saveDrawing()
          return
        case 'p':
          event.preventDefault()
          files.print('fit')
          return
      }

      // Editing accelerators would fight with text entry, so they stand aside while typing.
      if (isTyping(event.target)) return

      switch (key) {
        case 'a':
          event.preventDefault()
          store.selectAll()
          return
        case 'z':
          event.preventDefault()
          if (event.shiftKey) store.redo()
          else store.undo()
          return
        case 'y':
          event.preventDefault()
          store.redo()
          return
        case 'c':
          event.preventDefault()
          store.copySelection()
          return
        case 'x':
          event.preventDefault()
          store.cutSelection()
          return
        case 'v':
          event.preventDefault()
          store.pasteClipboard()
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [files])
}
