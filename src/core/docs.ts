import { marked } from 'marked'
import DOMPurify from 'dompurify'
import readme from '../../README.md?raw'
import architecture from '../../docs/ARCHITECTURE.md?raw'
import testing from '../../docs/TESTING.md?raw'

/**
 * The documentation the app ships with. The markdown is the repository's own, so
 * the page in the app and the page on GitHub can never drift apart — the bundle
 * carries a copy of the same files.
 */
export type DocPage = {
  id: string
  title: string
  summary: string
  body: string
}

export type DocHeading = {
  id: string
  text: string
  level: number
}

export type RenderedDoc = {
  html: string
  headings: DocHeading[]
}

export const DOC_PAGES: DocPage[] = [
  {
    id: 'guide',
    title: 'User guide',
    summary: 'Every tool, the command line, drafting controls, plotting and saving.',
    body: readme,
  },
  {
    id: 'architecture',
    title: 'Architecture',
    summary: 'How the core modules, the store and the UI fit together.',
    body: architecture,
  },
  {
    id: 'testing',
    title: 'Testing',
    summary: 'What the self-tests cover and how to run them.',
    body: testing,
  },
]

export function findDoc(id: string | null | undefined): DocPage {
  return DOC_PAGES.find((page) => page.id === id) ?? DOC_PAGES[0]
}

/** GitHub's own heading anchors: lower case, punctuation gone, spaces to dashes. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** Headings the table of contents shows: the top-level sections and their children. */
export function headingLevels(level: number): boolean {
  return level === 2 || level === 3
}

/**
 * Markdown in, safe HTML plus a table of contents out. Sanitising happens before
 * the anchors are added, so no heading id can be smuggled in from the source.
 */
export function renderDoc(markdown: string): RenderedDoc {
  const raw = marked.parse(markdown, { gfm: true, async: false }) as string
  const safe = DOMPurify.sanitize(raw, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input'],
    FORBID_ATTR: ['style', 'onerror', 'onload'],
  })

  const parsed = new DOMParser().parseFromString(safe, 'text/html')
  const headings: DocHeading[] = []
  const used = new Map<string, number>()

  parsed.body.querySelectorAll('h1, h2, h3, h4').forEach((node) => {
    const text = node.textContent?.trim() ?? ''
    if (!text) return
    const base = slugify(text) || 'section'
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    const id = seen === 0 ? base : `${base}-${seen}`
    node.id = id
    const level = Number(node.tagName.slice(1))
    if (headingLevels(level)) headings.push({ id, text, level })
  })

  // Outbound links open beside the drawing rather than replacing the whole app.
  parsed.body.querySelectorAll('a[href]').forEach((node) => {
    const href = node.getAttribute('href') ?? ''
    if (!/^https?:\/\//i.test(href)) return
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noreferrer noopener')
  })

  return { html: parsed.body.innerHTML, headings }
}
