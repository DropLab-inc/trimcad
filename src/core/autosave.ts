import type { DrawingDocument } from './types'

const KEY = 'droplabcad.autosave.v1'

type AutosavePayload = {
  savedAt: number
  document: DrawingDocument
}

export const saveAutosave = (document: DrawingDocument) => {
  const payload: AutosavePayload = {
    savedAt: Date.now(),
    document,
  }
  localStorage.setItem(KEY, JSON.stringify(payload))
}

export const loadAutosave = (): AutosavePayload | null => {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AutosavePayload
  } catch {
    return null
  }
}

export const clearAutosave = () => {
  localStorage.removeItem(KEY)
}
