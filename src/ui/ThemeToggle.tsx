import { Icon } from './Icon'
import { useTheme } from './theme'

/**
 * Swaps between the dark and light drawing themes. The icon shows the theme it will switch to,
 * which is the way most editors label this.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      <Icon name={next === 'dark' ? 'theme-dark' : 'theme-light'} />
    </button>
  )
}
