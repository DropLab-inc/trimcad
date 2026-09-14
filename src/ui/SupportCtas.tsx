import { Icon } from './Icon'

/**
 * The two things a free, open project actually needs from the people using it,
 * kept in the title bar rather than buried in a menu: ask for what is missing,
 * and help pay for the hours. Both are hash links, so they work without a click
 * handler and survive being opened in a new tab.
 */
export function RequestsCta() {
  return (
    <a className="titlebar-cta" href="#/requests" title="What people have asked for, and a form to add yours">
      <Icon name="idea" />
      <span className="titlebar-cta-label">Feature requests</span>
    </a>
  )
}

export function SupportCta() {
  return (
    <a className="titlebar-cta donate" href="#/support" title="TrimCAD is free — here is how to keep it that way">
      <Icon name="heart" />
      <span className="titlebar-cta-label">Support</span>
    </a>
  )
}
