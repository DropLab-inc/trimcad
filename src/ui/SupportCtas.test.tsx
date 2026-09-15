import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RequestsCta, SupportCta } from './SupportCtas'

describe('the standing asks in the title bar', () => {
  it('sends the feature request button to the list', () => {
    render(<RequestsCta />)
    const link = screen.getByRole('link', { name: /feature requests/i })
    expect(link.getAttribute('href')).toBe('#/requests')
    expect(link.getAttribute('title')).toMatch(/asked for/i)
  })

  it('sends the support button to the sponsorship page, filled rather than outlined', () => {
    render(<SupportCta />)
    const link = screen.getByRole('link', { name: /support/i })
    expect(link.getAttribute('href')).toBe('#/support')
    expect(link.className).toContain('donate')
    expect(link.getAttribute('title')).toMatch(/free/i)
  })

  it('keeps the label in the markup, so only the stylesheet hides it on a phone', () => {
    render(<RequestsCta />)
    const label = screen.getByText('Feature requests')
    expect(label.className).toBe('titlebar-cta-label')
  })
})
