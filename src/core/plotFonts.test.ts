import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { makeDefaultDocument } from './document'
import { DEFAULT_PRINT_OPTIONS, exportPdf, type ViewFrame } from './print'
import { STANDARD_STYLE, measureText } from './text'
import { FONT_ADVANCES, FONT_FACES, TEXT_FONTS, type TextFont } from './textMetrics'
import type { DrawingDocument, TextStyle, TextEntity } from './types'

/**
 * A plot of a drawing that names a shipped face has to hand jsPDF the same TTF the canvas draws with,
 * or the page comes out in a font the drawing never asked for. These tests read the captured calls, and
 * the file on disk, rather than a rendered PDF.
 */
const { captured } = vi.hoisted(() => ({
  captured: {
    added: [] as { name: string; base64: string }[],
    registered: [] as { name: string; family: string; style: string }[],
    fonts: [] as { family: string; style: string }[],
    texts: [] as string[],
  },
}))

vi.mock('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getHeight: () => 210 } }
    setLineJoin() {}
    setLineCap() {}
    setDrawColor() {}
    setTextColor() {}
    setFontSize() {}
    setLineWidth() {}
    lines() {}
    rect() {}
    clip() {}
    discardPath() {}
    saveGraphicsState() {}
    restoreGraphicsState() {}
    setCurrentTransformationMatrix() {}
    save() {}
    text(value: string) {
      captured.texts.push(value)
    }
    setFont(family: string, style: string) {
      captured.fonts.push({ family, style })
    }
    addFileToVFS(name: string, base64: string) {
      captured.added.push({ name, base64 })
    }
    addFont(name: string, family: string, style: string) {
      captured.registered.push({ name, family, style })
    }
  },
}))

/** public/fonts, as a plain path. */
const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public')

const fontBytes = (file: string): Uint8Array => {
  if (typeof file !== 'string' || !file.startsWith('/fonts/')) {
    throw new Error(`fontBytes got ${JSON.stringify(file)} (type ${typeof file})`)
  }
  /*
   * Resolved with node's path helpers rather than `new URL(relative, import.meta.url)`: under this
   * environment's jsdom the two-argument URL constructor ignores the base and yields a path ending
   * '/undefined', which reads as a missing font file.
   */
  return new Uint8Array(readFileSync(join(FONT_DIR, file)))
}

/** Serves the shipped faces from disk: the plot fetches them from the app's own origin. */
const serveFonts = (): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async (url: string) => ({
    arrayBuffer: async () => fontBytes(url).buffer,
  }))
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

const view: ViewFrame = { camera: { x: 0, y: 0, zoom: 1 }, width: 800, height: 600 }

const withText = (font: TextFont, value = 'NOTES'): DrawingDocument => {
  const base = makeDefaultDocument()
  const style: TextStyle = { ...STANDARD_STYLE, id: 'notes', name: 'Notes', font }
  const text: TextEntity = {
    id: 'text-1',
    type: 'text',
    layerId: base.layers[0].id,
    styleId: style.id,
    position: { x: 0, y: 0 },
    value,
    height: 20,
  }
  return { ...base, textStyles: [...(base.textStyles ?? []), style], entities: [text] }
}

describe('plotting a shipped face', () => {
  it('embeds the same file the canvas loads', async () => {
    serveFonts()
    captured.added.length = 0
    captured.registered.length = 0

    await exportPdf(withText('inter'), DEFAULT_PRINT_OPTIONS, view, [], 'notes.pdf')

    const inter = captured.added.find((entry) => entry.name === 'inter.ttf')
    expect(inter).toBeDefined()
    // The bytes are the font, not a placeholder: a PDF with the wrong outlines is a rewrap on paper.
    expect(inter!.base64).toBe(Buffer.from(fontBytes('/fonts/inter.ttf')).toString('base64'))
    expect(captured.registered).toContainEqual({ name: 'inter.ttf', family: 'Inter', style: 'normal' })
  })

  it('draws the text in the family rather than the built-in', async () => {
    serveFonts()
    captured.fonts.length = 0

    await exportPdf(withText('lora-italic'), DEFAULT_PRINT_OPTIONS, view, [], 'notes.pdf')

    expect(captured.fonts.at(-1)).toEqual({ family: 'Lora', style: 'italic' })
    expect(captured.texts).toContain('NOTES')
  })

  it('fetches nothing for a drawing that only uses the built-in faces', async () => {
    const fetchMock = serveFonts()

    await exportPdf(withText('helvetica-bold'), DEFAULT_PRINT_OPTIONS, view, [], 'notes.pdf')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(captured.fonts.at(-1)).toEqual({ family: 'helvetica', style: 'bold' })
  })

  it('embeds a face once, however many objects use it', async () => {
    const fetchMock = serveFonts()
    const document = withText('oswald')
    const second = { ...(document.entities[0] as TextEntity), id: 'text-2' }
    const plot = await exportPdf(
      { ...document, entities: [...document.entities, second] },
      DEFAULT_PRINT_OPTIONS,
      view,
      [],
      'notes.pdf',
    )

    expect(plot).not.toBeNull()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('oswald.ttf'))).toHaveLength(1)
  })
})

describe('a style the drawing owns', () => {
  it('is what an object that names no style is drawn with', async () => {
    /*
     * The style dialog edits the DRAWING's Standard. An object without a style of its own has to
     * follow that edit — otherwise picking a font in the dialog changes the list and nothing else.
     */
    serveFonts()
    const document = withText('inter')
    const styled = {
      ...document,
      textStyles: (document.textStyles ?? []).map((style) =>
        style.id === 'notes' ? { ...style, id: 'standard', name: 'Standard' } : style,
      ),
      // no styleId: this object is in Standard, by name
      entities: [{ ...(document.entities[0] as TextEntity), styleId: undefined }],
    }
    captured.fonts.length = 0

    await exportPdf(styled, DEFAULT_PRINT_OPTIONS, view, [], 'notes.pdf')

    expect(captured.fonts.at(-1)).toEqual({ family: 'Inter', style: 'normal' })
  })
})

describe('the face table', () => {
  it('lists every face once, and knows how to draw each of them', () => {
    expect(new Set(TEXT_FONTS).size).toBe(TEXT_FONTS.length)
    for (const font of TEXT_FONTS) {
      const face = FONT_FACES[font]
      expect(face, font).toBeDefined()
      expect(face.label.length, font).toBeGreaterThan(0)
      expect(face.pdfFamily.length, font).toBeGreaterThan(0)
      /*
       * An @font-face declared as `font-family: 'InterTrim, Helvetica, sans-serif'` names a family
       * literally called that, so the shipped file is never the font drawn — and the canvas silently
       * falls back. The declared family is one name; the fallback list is what the canvas sets.
       */
      expect(face.cssFamily, font).not.toContain(',')
      expect(face.cssStack.split(',')[0].trim().replace(/['"]/g, ''), font).toBe(face.cssFamily)
      expect(['normal', 'bold', 'italic', 'bolditalic'], font).toContain(face.pdfStyle)
    }
    expect(Object.keys(FONT_FACES).sort()).toEqual([...TEXT_FONTS].sort())
  })

  it('ships a real TrueType file for every face it claims to embed', () => {
    const bundled = FONT_FACES && Object.entries(FONT_FACES).filter(([, face]) => face.file)
    expect(bundled).toHaveLength(14)
    for (const [font, face] of bundled) {
      const bytes = fontBytes(face.file as string)
      const sfnt =
        ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
      // 0x00010000 is TrueType; jsPDF parses the same tables and refuses anything else.
      expect(sfnt, `${font} (${face.file})`).toBe(0x00010000)
    }
  })

  it('measures each face rather than reusing one', () => {
    for (const font of TEXT_FONTS) {
      const row = FONT_ADVANCES[font]
      expect(row, font).toHaveLength(95)
      expect(row.some((width) => width > 0), font).toBe(true)
    }
    // A bold face is not its regular under another name, and a shipped one is not Helvetica.
    const widthIn = (font: TextFont) => measureText('Handrail', 10, { ...STANDARD_STYLE, font })
    expect(widthIn('lora-bold')).not.toBeCloseTo(widthIn('lora'))
    expect(widthIn('inter')).not.toBeCloseTo(widthIn('helvetica'))
  })
})
