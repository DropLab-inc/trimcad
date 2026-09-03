import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * A compact ribbon dropdown that shows the option in use and drops down the rest, each drawn with
 * its own icon. This is AutoCAD's flyout: it costs one button of ribbon width however many ways
 * there are of running the command, while still letting you see them all at a glance.
 *
 * A plain `select` cannot carry the icons, so the menu is built by hand. It closes on Escape, on a
 * click elsewhere, and on choosing something.
 */

export type OptionChoice<T extends string> = {
  value: T
  label: string
  icon: IconName
  /** The second line of the tooltip, saying what the option actually does. */
  hint: string
}

type Props<T extends string> = {
  /** Names the group, shown above the button, such as "Circle by". */
  title: string
  value: T
  options: OptionChoice<T>[]
  onChange: (value: T) => void
}

export function OptionMenu<T extends string>({ title, value, options, onChange }: Props<T>) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const dismiss = (event: Event) => {
      // A click on the button itself is left to the button, which toggles the menu shut.
      if (root.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="option-menu" ref={root}>
      <button
        type="button"
        className="ribbon-btn option-menu-face"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        title={`${title}: ${current.label}\n${current.hint}`}
      >
        <Icon name={current.icon} />
        <span>{current.label}</span>
        <span className="option-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className="option-menu-list" role="menu" aria-label={title}>
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={option.value === value}
                className={`option-menu-item ${option.value === value ? 'active' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                title={option.hint}
              >
                <Icon name={option.icon} />
                <span>{option.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
