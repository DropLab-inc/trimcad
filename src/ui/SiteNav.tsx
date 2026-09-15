import { Icon, type IconName } from './Icon'

export type SitePanel = 'docs' | 'requests' | 'support'

const TABS: { id: SitePanel; label: string; icon: IconName; hash: string }[] = [
  { id: 'docs', label: 'Documentation', icon: 'book', hash: '#/docs/guide' },
  { id: 'requests', label: 'Feature requests', icon: 'idea', hash: '#/requests' },
  { id: 'support', label: 'Support TrimCAD', icon: 'heart', hash: '#/support' },
]

/**
 * The header every reader panel shares: where you are, where else you can go, and
 * the way back to the drawing without losing it.
 */
export function SiteNav({ current, right }: { current: SitePanel; right?: React.ReactNode }) {
  return (
    <header className="site-nav">
      <nav className="site-tabs" aria-label="TrimCAD pages">
        {TABS.map((tab) => (
          <a
            key={tab.id}
            className={`site-tab ${current === tab.id ? 'active' : ''}`}
            href={tab.hash}
            aria-current={current === tab.id ? 'page' : undefined}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </a>
        ))}
      </nav>
      <div className="site-nav-actions">
        {right}
        <a className="site-back" href="#/">
          <Icon name="close" />
          <span>Back to drawing</span>
        </a>
      </div>
    </header>
  )
}
