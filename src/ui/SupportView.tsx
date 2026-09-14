import { SITE, sponsorIsLive } from '../site'
import { Icon } from './Icon'
import { SiteNav } from './SiteNav'

const TIME_GOES_TO = [
  'Keeping trimcad.com online and the build pipeline running.',
  'Testing against real-world DXF files, plotters and drawing sizes.',
  'The unglamorous work — import quirks, snap edge cases, accessibility.',
]

const OTHER_WAYS = [
  { icon: 'star', label: 'Star the repository', hint: 'It is how other drafters find it.', href: SITE.starsUrl },
  { icon: 'idea', label: 'Ask for a feature', hint: 'The tracker is open.', href: '#/requests' },
  { icon: 'bug', label: 'Report a bug', hint: 'A file that fails is worth ten opinions.', href: `${SITE.issuesUrl}/new?labels=bug` },
  { icon: 'book', label: 'Share the manual', hint: 'Send the guide to whoever is still using paper.', href: '#/docs/guide' },
] as const

/**
 * TrimCAD is MIT licensed and has no paid tier, so this page asks for money the
 * only way that is honest about it: plainly, with the button switched off until
 * a real sponsorship profile exists to point at.
 */
export function SupportView() {
  const live = sponsorIsLive()

  return (
    <div className="site-view">
      <SiteNav current="support" />
      <div className="site-body support-body">
        <header className="site-hero">
          <div>
            <img
              className="site-logo"
              src="/trimcad-logo-180.png"
              alt="TrimCAD"
              width={76}
              height={76}
              decoding="async"
            />
            <p className="docs-kicker">Support TrimCAD</p>
            <h1>Free, open, and paid for by people who find it useful</h1>
            <p className="site-lead">
              The whole editor is {SITE.license} licensed: no account, no watermark, no export limit, no tier
              that unlocks the good tools. Hosting, testing and the hours that go into it are what sponsorship
              covers.
            </p>
          </div>
        </header>

        <section className="support-card support-cta">
          <h2>Sponsor on GitHub</h2>
          <p>
            Sponsorship runs through GitHub, so the payment, the receipts and the cancellation all stay in an
            account you already have. One-off or monthly, any amount.
          </p>
          <p className="support-cta-note">
            <Icon name="star" />
            <span>One-off amounts and monthly tiers both live on that page.</span>
          </p>
          {live ? (
            <a className="site-primary" href={SITE.sponsorUrl} target="_blank" rel="noreferrer noopener">
              <Icon name="github" />
              <span>Sponsor TrimCAD on GitHub</span>
            </a>
          ) : (
            <div className="support-dormant">
              <p className="support-dormant-title">Sponsorship is not switched on yet.</p>
              <p>
                The project does not have a published GitHub Sponsors profile, so this button has nowhere honest
                to point. Everything else on this page still helps today.
              </p>
              <div className="support-dormant-actions">
                <a className="site-primary" href={SITE.starsUrl} target="_blank" rel="noreferrer noopener">
                  <Icon name="star" />
                  <span>Star the repository</span>
                </a>
                <a className="site-secondary" href={SITE.repoUrl} target="_blank" rel="noreferrer noopener">
                  <Icon name="github" />
                  <span>Read the source</span>
                </a>
              </div>
              <p className="support-dormant-note">
                Maintainers: publish the profile, then build with{' '}
                <code>VITE_SPONSOR_URL=https://github.com/sponsors/&lt;handle&gt;</code> and this button goes live
                — <a href={SITE.sponsorSetupUrl} target="_blank" rel="noreferrer noopener">GitHub Sponsors setup</a>.
              </p>
            </div>
          )}
        </section>

        <section className="support-grid">
          <div className="support-card">
            <h2>What the money pays for</h2>
            <ul className="support-list">
              {TIME_GOES_TO.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="support-card">
            <h2>Other ways to help</h2>
            <ul className="support-links">
              {OTHER_WAYS.map((way) => (
                <li key={way.label}>
                  <a
                    href={way.href}
                    {...(way.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                  >
                    <Icon name={way.icon} />
                    <span>
                      <strong>{way.label}</strong>
                      <em>{way.hint}</em>
                    </span>
                    {way.href.startsWith('http') && <Icon name="external" />}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <p className="support-footnote">
          No trackers, no ads, no telemetry: the app runs entirely in your browser and your drawings never leave
          it. The source is public at{' '}
          <a href={SITE.repoUrl} target="_blank" rel="noreferrer noopener">
            github.com/{SITE.repo}
          </a>
          .
        </p>
      </div>
    </div>
  )
}
