import { describe, expect, it } from 'vitest'
import { DOC_PAGES, findDoc, renderDoc, slugify } from './docs'

describe('the documentation the app carries', () => {
  it('ships the repository manual and the design notes', () => {
    expect(DOC_PAGES.map((page) => page.id)).toEqual(['guide', 'architecture', 'testing'])
    expect(DOC_PAGES[0].body.length).toBeGreaterThan(5000)
  })

  it('falls back to the first page when the address names one that does not exist', () => {
    expect(findDoc('nonsense').id).toBe(DOC_PAGES[0].id)
    expect(findDoc(undefined).id).toBe(DOC_PAGES[0].id)
    expect(findDoc('testing').id).toBe('testing')
  })
})

describe('slugify', () => {
  it('matches the anchors GitHub itself makes', () => {
    expect(slugify('Working at the command line')).toBe('working-at-the-command-line')
    expect(slugify('Trim and extend')).toBe('trim-and-extend')
  })

  it('drops punctuation and collapses the gaps it leaves', () => {
    expect(slugify('Themes and branding!')).toBe('themes-and-branding')
    expect(slugify('Plot / print  (PDF)')).toBe('plot-print-pdf')
  })
})

describe('renderDoc', () => {
  it('gives every heading an anchor and lists the sections', () => {
    const { html, headings } = renderDoc('# Title\n\n## Trim and extend\n\n### Fences\n')
    expect(html).toContain('id="trim-and-extend"')
    expect(html).toContain('id="fences"')
    expect(headings).toEqual([
      { id: 'trim-and-extend', text: 'Trim and extend', level: 2 },
      { id: 'fences', text: 'Fences', level: 3 },
    ])
  })

  it('keeps a repeated heading addressable by numbering the later ones', () => {
    const { headings } = renderDoc('## Build\n\ntext\n\n## Build\n')
    expect(headings.map((heading) => heading.id)).toEqual(['build', 'build-1'])
  })

  it('leaves the top-level title out of the table of contents', () => {
    const { headings } = renderDoc('# TrimCAD\n\n## Commands\n')
    expect(headings.map((heading) => heading.text)).toEqual(['Commands'])
  })

  it('strips scripts and event handlers out of the markdown', () => {
    const { html } = renderDoc('## Unsafe\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
  })

  it('opens outbound links beside the app and leaves in-page anchors alone', () => {
    const { html } = renderDoc('[repo](https://github.com/DropLab-inc/trimcad) and [later](#commands)\n')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
    expect(html).toMatch(/<a href="#commands">later<\/a>/)
  })

  it('renders the guide it ships without throwing', () => {
    const { html, headings } = renderDoc(DOC_PAGES[0].body)
    expect(headings.length).toBeGreaterThan(10)
    expect(html).toContain('<h2')
  })
})
