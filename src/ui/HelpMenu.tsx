import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { SITE } from '../site'

type MenuEntry =
  | { kind: 'page'; label: string; icon: IconName; hash: string; hint?: string }
  | { kind: 'link'; label: string; icon: IconName; href: string; hint?: string }

/**
 * Help is a menu rather than three loose buttons, so the titlebar stays a place
 * for drafting tools. Internal pages move the hash; outbound links open beside
 * the drawing.
 */
export function HelpMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

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

  const groups: MenuEntry[][] = [
    [
      {
        kind: 'page',
        label: 'Documentation',
        icon: 'book',
        hash: '#/docs/guide',
        hint: 'The user guide, architecture and tests',
      },
      {
        kind: 'page',
        label: 'Feature requests',
        icon: 'idea',
        hash: '#/requests',
        hint: 'What people are asking for, and a form to add yours',
      },
      {
        kind: 'page',
        label: 'Support TrimCAD',
        icon: 'heart',
        hash: '#/support',
        hint: 'Sponsorship and other ways to help',
      },
    ],
    [
      { kind: 'link', label: 'Report a bug', icon: 'bug', href: `${SITE.issuesUrl}/new?labels=bug`, hint: 'Opens GitHub' },
      { kind: 'link', label: 'Source on GitHub', icon: 'github', href: SITE.repoUrl, hint: 'MIT licensed' },
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
        Help
      </button>

      {open && (
        <div className="file-menu-popup help-menu-popup" role="menu">
          {groups.map((group, index) => (
            <div className="file-menu-group" key={group[0].label}>
              {index > 0 && <hr />}
              {group.map((entry) => (
                <a
                  key={entry.label}
                  role="menuitem"
                  className="help-menu-item"
                  href={entry.kind === 'page' ? entry.hash : entry.href}
                  {...(entry.kind === 'link' ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={entry.icon} />
                  <span className="help-menu-text">
                    <span className="file-menu-label">{entry.label}</span>
                    {entry.hint && <span className="help-menu-hint">{entry.hint}</span>}
                  </span>
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
