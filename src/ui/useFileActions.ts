import { useMemo } from 'react'
import { exportDocumentToDxf, importDocumentFromDxf, unsupportedForDxf } from '../core/dxf'
import {
  DRAWING_EXTENSION,
  DRAWING_MIME,
  downloadFile,
  parseDrawing,
  pickFile,
  withExtension,
} from '../core/fileIo'
import { exportPdf } from '../core/print'
import { useCadStore } from '../core/store'

export type PrintScale = '1:1' | 'fit'

export type FileActions = {
  newDrawing: () => void
  openDrawing: () => Promise<void>
  saveDrawing: () => void
  saveDrawingAs: () => void
  print: (scale: PrintScale) => void
}

/** "2 hatches, 1 dimension" — what another CAD program will not see in the saved file. */
const describeLosses = (counts: Map<string, number>): string =>
  [...counts.entries()].map(([type, count]) => `${count} ${type}${count === 1 ? '' : 's'}`).join(', ')

/**
 * Writes the drawing out as DXF. Everything comes back when this app reopens the file, so there is
 * nothing to confirm; the note only says which objects another CAD program will not be able to see.
 */
const writeDrawing = (name: string) => {
  const { doc, setFileName, log } = useCadStore.getState()
  downloadFile(name, DRAWING_MIME, exportDocumentToDxf(doc))
  setFileName(name)

  const losses = unsupportedForDxf(doc)
  log(
    'result',
    losses.size > 0
      ? `Saved ${name} — ${describeLosses(losses)} will only reopen here, not in other CAD programs`
      : `Saved ${name}`,
  )
}

/**
 * The one place file commands live, so the File menu, the command line and the keyboard shortcuts
 * all do exactly the same thing. Reads the store directly rather than subscribing, because these
 * only run in response to a user action and should never re-render anything on their own.
 */
export const useFileActions = (): FileActions =>
  useMemo(
    () => ({
      newDrawing: () => {
        const { doc, newDrawing, log } = useCadStore.getState()
        if (doc.entities.length > 0 && !window.confirm('Start a new drawing? Unsaved changes will be lost.')) {
          log('result', 'New drawing cancelled')
          return
        }
        newDrawing()
      },

      openDrawing: async () => {
        const file = await pickFile('.dxf,.dlc,application/dxf,application/json')
        if (!file) return
        const { doc, loadDrawing, log } = useCadStore.getState()
        try {
          const text = await file.text()
          // Drawings saved before DXF became the working format are still JSON.
          const opened = file.name.toLowerCase().endsWith('.dlc')
            ? parseDrawing(text)
            : importDocumentFromDxf(text, doc)
          loadDrawing(opened, withExtension(file.name, DRAWING_EXTENSION))
          log('result', `Opened ${file.name} — ${opened.entities.length} object(s)`)
        } catch (error) {
          log('error', error instanceof Error ? error.message : 'Could not open that file.')
        }
      },

      saveDrawing: () => writeDrawing(withExtension(useCadStore.getState().fileName, DRAWING_EXTENSION)),

      saveDrawingAs: () => {
        const typed = window.prompt(
          'Save drawing as',
          withExtension(useCadStore.getState().fileName, DRAWING_EXTENSION),
        )
        if (typed) writeDrawing(withExtension(typed, DRAWING_EXTENSION))
      },

      print: (scale) => {
        const { doc, log } = useCadStore.getState()
        exportPdf(doc, scale)
        log('result', `Plotted at ${scale === '1:1' ? '1:1' : 'fit to page'}`)
      },
    }),
    [],
  )
