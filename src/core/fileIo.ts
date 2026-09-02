import { makeDefaultDocument } from './document'
import { normalizeLayer } from './layers'
import type { DrawingDocument } from './types'

/** DXF is the working format, so drawings interchange with AutoCAD without an extra export step. */
export const DRAWING_EXTENSION = '.dxf'
export const DRAWING_MIME = 'application/dxf'

/** The JSON format drawings used before DXF took over; still readable when opening a file. */
export const LEGACY_EXTENSION = '.dlc'
export const DRAWING_FORMAT = 'droplabcad-drawing'
export const DRAWING_VERSION = 1

export type DrawingFile = {
  format: typeof DRAWING_FORMAT
  version: number
  savedAt: string
  document: DrawingDocument
}

export const serializeDrawing = (document: DrawingDocument): string =>
  JSON.stringify(
    { format: DRAWING_FORMAT, version: DRAWING_VERSION, savedAt: new Date().toISOString(), document },
    null,
    2,
  )

/**
 * Reads a drawing file. Anything that is not one throws with a message worth showing the user,
 * because a silent empty drawing looks identical to losing their work.
 */
export const parseDrawing = (text: string): DrawingDocument => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not a DropLabCad drawing.')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That file is not a DropLabCad drawing.')
  }

  const wrapper = parsed as Partial<DrawingFile>
  // Files written before the wrapper existed were the bare document.
  const document = (wrapper.format === DRAWING_FORMAT ? wrapper.document : parsed) as Partial<DrawingDocument>

  if (!document || !Array.isArray(document.entities) || !Array.isArray(document.layers)) {
    throw new Error('That drawing file is missing its layers or entities.')
  }
  if (document.layers.length === 0) {
    throw new Error('That drawing file has no layers.')
  }
  if (typeof wrapper.version === 'number' && wrapper.version > DRAWING_VERSION) {
    throw new Error(`That drawing was saved by a newer version (${wrapper.version}).`)
  }

  // Fill in anything an older or hand-edited file left out so the app never meets a missing list.
  const defaults = makeDefaultDocument()
  const merged = { ...defaults, ...document } as DrawingDocument
  return {
    ...merged,
    layers: merged.layers.map((layer) => normalizeLayer(layer, merged.linetypes[0]?.id ?? 'lt-continuous')),
  }
}

/** Swaps a file name's extension, so `plan.dxf` saves as `plan.dlc`. */
export const withExtension = (name: string, extension: string): string => {
  const trimmed = name.trim() || 'drawing'
  const base = trimmed.replace(/\.[^./\\]+$/, '')
  return `${base || 'drawing'}${extension}`
}

/** Hands the browser a file to download. */
export const downloadFile = (name: string, mime: string, contents: string) => {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Opens the browser's file picker and resolves with what was chosen, or null if the user backed
 * out. Building the input on demand keeps file handling out of the component tree.
 */
export const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'

    const finish = (file: File | null) => {
      input.remove()
      resolve(file)
    }

    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => finish(null))
    document.body.appendChild(input)
    input.click()
  })
