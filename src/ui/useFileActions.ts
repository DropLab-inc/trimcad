import { useMemo } from 'react'
import { isDwgFile, dwgToDxfText } from '../core/dwg'
import { exportDocumentToDxf, importDocumentFromDxf, unreadableInDxf, unsupportedForDxf } from '../core/dxf'
import {
  DRAWING_EXTENSION,
  DRAWING_MIME,
  downloadFile,
  parseDrawing,
  pickFile,
  withExtension,
} from '../core/fileIo'
import { openPrintDialog } from '../core/printSession'
import { useCadStore } from '../core/store'
import type { PrintOptions } from '../core/print'

export type FileActions = {
  newDrawing: () => void
  openDrawing: () => Promise<void>
  saveDrawing: () => void
  saveDrawingAs: () => void
  /** Opens the Plot dialog. Pass a patch to seed options (e.g. scale 1:1). */
  print: (patch?: Partial<PrintOptions>) => void
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
        const file = await pickFile('.dxf,.dwg,.dlc,application/dxf,application/acad,application/json')
        if (!file) return
        const { doc, loadDrawing, log } = useCadStore.getState()
        try {
          let text: string
          let name = file.name
          if (isDwgFile(file.name)) {
            // DWG is converted to DXF in the browser (WASM, no upload); what loads afterwards is
            // the DXF this app already reads. The file keeps its DWG name.
            log('prompt', `Converting ${file.name} (DWG → DXF)…`)
            text = await dwgToDxfText(new Uint8Array(await file.arrayBuffer()))
          } else {
            text = await file.text()
          }
          // Drawings saved before DXF became the working format are still JSON.
          /*
           * A drawing opens into a drawing of its own. The file being opened supplies the layers,
           * blocks and styles — not the drawing that happens to be open at the time, or opening this
           * week's sheet would inherit last week's block definitions and carry them back out.
           */
          let impossible = 0
          const opened = name.toLowerCase().endsWith('.dlc')
            ? parseDrawing(text)
            : importDocumentFromDxf(text, { ...doc, blocks: [] }, (counts) => {
                impossible = counts.impossible
              })
          loadDrawing(opened, withExtension(name, DRAWING_EXTENSION))
          const blocks = opened.blocks?.length ? `, ${opened.blocks.length} block definition(s)` : ''
          log('result', `Opened ${name} — ${opened.entities.length} object(s)${blocks}`)
          /*
           * Say what could not be read. A drawing that arrives without its hatches should be
           * reported as such rather than quietly matching the file's name and not its contents.
           */
          /*
           * An object at a coordinate no drawing holds is damage, not a distant feature, and it is
           * left out — so it is named here. Left unsaid, it reads as the file not having opened.
           */
          if (impossible > 0) {
            log(
              'result',
              `${impossible} object(s) left out: they sit at coordinates no drawing can hold (a corrupted or converted record).`,
            )
          }
          const unreadable = unreadableInDxf(text)
          if (unreadable.size > 0) {
            const summary = [...unreadable.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([type, count]) => `${count} ${type}`)
              .join(', ')
            log('error', `Not read (kept in the file, not drawn here): ${summary}.`)
          }
        } catch (error) {
          /*
           * A DWG that will not convert is a different problem from a DXF that will not parse, and
           * the user needs to know which: one is the file's format version or content, the other is
           * our reader. Saying only "could not open" hides which side failed.
           */
          const detail = error instanceof Error ? error.message : ''
          if (isDwgFile(file.name)) {
            log(
              'error',
              `Could not read ${file.name} as a DWG${detail ? ` — ${detail}` : ''}. It may be a DWG version or content the converter does not support; open it in AutoCAD and save as DXF to bring it in.`,
            )
          } else {
            log('error', detail || 'Could not open that file.')
          }
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

      print: (patch) => {
        const { camera, selectedIds, log } = useCadStore.getState()
        openPrintDialog({ camera, selectedIds, patch })
        log('prompt', 'Plot')
      },
    }),
    [],
  )
