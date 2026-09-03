/**
 * The Plot dialog and the window-picking gesture that feeds it. These belong to the person and the
 * session rather than to the drawing, so they live here rather than in the document store.
 */
import { useSyncExternalStore } from 'react'
import {
  DEFAULT_PRINT_OPTIONS,
  type PrintBounds,
  type PrintOptions,
  type ViewFrame,
} from './print'

export type PrintSession = {
  /** Whether the Plot dialog is on screen. */
  open: boolean
  /** True while the dialog has stepped aside for the two corners of a plot window. */
  pickingWindow: boolean
  options: PrintOptions
  /** The camera and viewport size captured when the dialog last opened, for "Display". */
  view: ViewFrame
  selectedIds: string[]
}

const DEFAULT_VIEW: ViewFrame = { camera: { x: 400, y: 300, zoom: 1 }, width: 1000, height: 700 }

let viewportSize = { width: 1000, height: 700 }

/** The canvas reports its size so a plot of the current display knows what is on screen. */
export const setViewportSize = (width: number, height: number) => {
  if (width <= 0 || height <= 0) return
  viewportSize = { width, height }
}

export const getViewportSize = () => viewportSize

let session: PrintSession = {
  open: false,
  pickingWindow: false,
  options: { ...DEFAULT_PRINT_OPTIONS },
  view: DEFAULT_VIEW,
  selectedIds: [],
}

const listeners = new Set<() => void>()

const announce = () => {
  for (const listener of listeners) listener()
}

const setSession = (next: PrintSession) => {
  session = next
  announce()
}

export const getPrintSession = (): PrintSession => session

export const openPrintDialog = (input: {
  camera: ViewFrame['camera']
  selectedIds: string[]
  /** Seed options (e.g. PLOT1 opening already set to 1:1). */
  patch?: Partial<PrintOptions>
}) => {
  setSession({
    open: true,
    pickingWindow: false,
    options: { ...DEFAULT_PRINT_OPTIONS, ...session.options, ...input.patch },
    view: { camera: { ...input.camera }, width: viewportSize.width, height: viewportSize.height },
    selectedIds: [...input.selectedIds],
  })
}

export const closePrintDialog = () => {
  setSession({ ...session, open: false, pickingWindow: false })
}

export const setPrintOptions = (patch: Partial<PrintOptions>) => {
  setSession({ ...session, options: { ...session.options, ...patch } })
}

/** Puts the dialog away and waits for the two corners of a plot window. */
export const beginPlotWindow = () => {
  setSession({ ...session, open: false, pickingWindow: true, options: { ...session.options, area: 'window' } })
}

/** Cancels window picking and brings the dialog back, leaving any previous window alone. */
export const cancelPlotWindow = () => {
  setSession({ ...session, open: true, pickingWindow: false })
}

/** Records the window and reopens the dialog with it selected. */
export const finishPlotWindow = (window: PrintBounds) => {
  setSession({
    ...session,
    open: true,
    pickingWindow: false,
    options: { ...session.options, area: 'window', window },
  })
}

export const subscribeToPrintSession = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = (): PrintSession => session

export const usePrintSession = (): PrintSession => useSyncExternalStore(subscribeToPrintSession, snapshot, snapshot)
