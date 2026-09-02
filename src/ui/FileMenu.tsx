import { useEffect, useRef, useState } from 'react'
import { useFileActions } from './useFileActions'
import { Icon, type IconName } from './Icon'
import { useCadStore } from '../core/store'

type MenuItem = {
  label: string
  icon: IconName
  shortcut?: string
  run: () => void
}

export function FileMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const fileName = useCadStore((state) => state.fileName)
  const actions = useFileActions()

  // Clicking anywhere else, or pressing Escape, puts the menu away.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const groups: MenuItem[][] = [
    [
      { label: 'New', icon: 'new', shortcut: 'Ctrl+N', run: actions.newDrawing },
      { label: 'Open…', icon: 'open', shortcut: 'Ctrl+O', run: () => void actions.openDrawing() },
    ],
    [
      { label: 'Save', icon: 'save', shortcut: 'Ctrl+S', run: actions.saveDrawing },
      { label: 'Save As…', icon: 'save-as', shortcut: 'Ctrl+Shift+S', run: actions.saveDrawingAs },
    ],
    [
      { label: 'Print to PDF', icon: 'print', shortcut: 'Ctrl+P', run: () => actions.print('fit') },
      { label: 'Print at 1:1', icon: 'print', run: () => actions.print('1:1') },
    ],
  ]

  return (
    <div className="file-menu" ref={menuRef}>
      <button
        type="button"
        className={`file-menu-button ${open ? 'active' : ''}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        File
      </button>

      {open && (
        <div className="file-menu-popup" role="menu">
          {groups.map((group, index) => (
            <div className="file-menu-group" key={group[0].label}>
              {index > 0 && <hr />}
              {group.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  aria-label={item.label}
                  aria-keyshortcuts={item.shortcut}
                  onClick={() => {
                    setOpen(false)
                    item.run()
                  }}
                >
                  <Icon name={item.icon} />
                  <span className="file-menu-label">{item.label}</span>
                  {item.shortcut && <span className="file-menu-shortcut">{item.shortcut}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <span className="file-name" title="Current drawing">
        {fileName}
      </span>
    </div>
  )
}
