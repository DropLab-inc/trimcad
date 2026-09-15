import { useEffect, useId, useRef } from 'react'
import {
  DEFAULT_PRINT_OPTIONS,
  PAPER_SIZES_MM,
  describeArea,
  describeScale,
  exportPdf,
  exportLayoutPdf,
  layoutPlot,
  pageSizeMm,
  resolvePlotBounds,
  type PaperOrientation,
  type PaperSize,
  type PlotArea,
  type PlotScaleMode,
  type PrintOptions,
} from '../core/print'
import {
  beginPlotWindow,
  closePrintDialog,
  setPrintOptions,
  usePrintSession,
} from '../core/printSession'
import { useCadStore } from '../core/store'

const AREAS: { value: PlotArea; label: string; hint: string }[] = [
  { value: 'extents', label: 'Extents', hint: 'Everything on a plottable layer.' },
  { value: 'display', label: 'Display', hint: 'Whatever is currently on screen.' },
  { value: 'window', label: 'Window', hint: 'A rectangle you pick on the drawing.' },
  { value: 'selection', label: 'Selection', hint: 'Only the objects that are currently selected.' },
]

const SCALES: { value: PlotScaleMode; label: string }[] = [
  { value: 'fit', label: 'Fit to paper' },
  { value: '1:1', label: '1:1' },
  { value: '1:2', label: '1:2' },
  { value: '1:5', label: '1:5' },
  { value: '1:10', label: '1:10' },
  { value: '1:20', label: '1:20' },
  { value: '1:50', label: '1:50' },
  { value: '1:100', label: '1:100' },
  { value: 'custom', label: 'Custom…' },
]

const previewBox = (options: PrintOptions) => {
  const page = layoutPlot(
    options.window ?? { minX: 0, minY: 0, maxX: 100, maxY: 70 },
    options,
  )
  return page
}

export function PrintDialog() {
  const session = usePrintSession()
  const log = useCadStore((state) => state.log)
  const doc = useCadStore((state) => state.doc)
  /** The sheet being plotted, if one is open — a layout plots itself, not a region of the model. */
  const activeLayoutId = useCadStore((state) => state.activeLayoutId)
  const activeLayout = activeLayoutId
    ? doc.layouts.find((layout) => layout.id === activeLayoutId) ?? null
    : null
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Escape closes the dialog unless a window is being picked (the canvas owns Escape then).
  useEffect(() => {
    if (!session.open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePrintDialog()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session.open])

  // Focus the dialog when it opens so Enter and Escape reach it.
  useEffect(() => {
    if (session.open) dialogRef.current?.querySelector<HTMLElement>('button, select, input')?.focus()
  }, [session.open])

  if (!session.open) return null

  const options = session.options
  const bounds = resolvePlotBounds(doc, options, session.view, session.selectedIds)
  const layout = bounds ? layoutPlot(bounds, options) : null
  const canPlot = bounds !== null && (options.area !== 'window' || options.window !== null)
  const selectionEmpty = options.area === 'selection' && session.selectedIds.length === 0
  const windowMissing = options.area === 'window' && !options.window

  const patch = (next: Partial<PrintOptions>) => setPrintOptions(next)

  const plot = () => {
    /*
     * A sheet is already at paper scale, so plotting one asks nothing about area or scale. Anything
     * the model-space controls are holding is deliberately ignored here rather than half-applied.
     */
    if (activeLayout) {
      exportLayoutPdf(doc, activeLayout)
      log(
        'result',
        `Plotted ${activeLayout.name} at 1:1 on ${activeLayout.paper.toUpperCase()} ${activeLayout.orientation}`,
      )
      closePrintDialog()
      return
    }
    if (!canPlot) return
    const result = exportPdf(doc, options, session.view, session.selectedIds)
    if (!result) {
      log('error', 'Nothing to plot in that area.')
      return
    }
    log(
      'result',
      `Plotted ${describeArea(options)} at ${describeScale(options)} on ${options.paper.toUpperCase()} ${options.orientation}`,
    )
    closePrintDialog()
  }

  const preview = previewBox(options)
  const contentW = bounds ? (bounds.maxX - bounds.minX) * (layout?.applied ?? 1) : 40
  const contentH = bounds ? (bounds.maxY - bounds.minY) * (layout?.applied ?? 1) : 30
  const scale = Math.min(180 / preview.pageW, 120 / preview.pageH)
  const sheetW = preview.pageW * scale
  const sheetH = preview.pageH * scale
  const margin = preview.margin * scale
  const drawnW = Math.max(2, Math.min((layout?.printableW ?? 1) * scale, contentW * scale))
  const drawnH = Math.max(2, Math.min((layout?.printableH ?? 1) * scale, contentH * scale))
  const drawnX = options.center
    ? margin + ((layout?.printableW ?? 0) * scale - drawnW) / 2
    : margin
  const drawnY = options.center
    ? margin + ((layout?.printableH ?? 0) * scale - drawnH) / 2
    : margin

  return (
    <div className="print-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closePrintDialog()}>
      <div
        className="print-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <header className="print-dialog-header">
          <h2 id={titleId}>Plot</h2>
          <button type="button" className="print-dialog-close" aria-label="Close" onClick={closePrintDialog}>
            ×
          </button>
        </header>

        <div className="print-dialog-body">
          {activeLayout ? (
            <section className="print-dialog-group">
              <h3>{activeLayout.name}</h3>
              <p className="print-dialog-note">
                A sheet plots at 1:1 on its own paper — the size, orientation and margin come from
                the layout, and each viewport brings the model to it at its own scale.
              </p>
              <p className="print-dialog-note">
                {pageSizeMm(activeLayout.paper, activeLayout.orientation).width} ×{' '}
                {pageSizeMm(activeLayout.paper, activeLayout.orientation).height} mm ·{' '}
                {activeLayout.viewports.length} viewport
                {activeLayout.viewports.length === 1 ? '' : 's'}
              </p>
            </section>
          ) : (
            <>
          <section className="print-dialog-group">
            <h3>Printer / plotter</h3>
            <p className="print-dialog-note">PDF file — downloads when you plot.</p>
          </section>

          <section className="print-dialog-group">
            <h3>Paper size</h3>
            <label className="print-dialog-row">
              <span>Size</span>
              <select
                value={options.paper}
                onChange={(event) => patch({ paper: event.target.value as PaperSize })}
              >
                {(Object.keys(PAPER_SIZES_MM) as PaperSize[]).map((size) => (
                  <option key={size} value={size}>
                    {PAPER_SIZES_MM[size].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="print-dialog-row">
              <span>Orientation</span>
              <select
                value={options.orientation}
                onChange={(event) => patch({ orientation: event.target.value as PaperOrientation })}
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label className="print-dialog-row">
              <span>Margins (mm)</span>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                value={options.marginMm}
                onChange={(event) => patch({ marginMm: Number(event.target.value) })}
              />
            </label>
          </section>

          <section className="print-dialog-group">
            <h3>Plot area</h3>
            <label className="print-dialog-row">
              <span>What to plot</span>
              <select
                value={options.area}
                onChange={(event) => patch({ area: event.target.value as PlotArea })}
              >
                {AREAS.map((area) => (
                  <option key={area.value} value={area.value} title={area.hint}>
                    {area.label}
                  </option>
                ))}
              </select>
            </label>
            {options.area === 'window' && (
              <div className="print-dialog-row">
                <span>{options.window ? 'Window set' : 'No window yet'}</span>
                <button type="button" className="print-dialog-action" onClick={beginPlotWindow}>
                  {options.window ? 'Reselect window…' : 'Select window…'}
                </button>
              </div>
            )}
            {selectionEmpty && (
              <p className="print-dialog-warning">Select something on the drawing first.</p>
            )}
            {windowMissing && (
              <p className="print-dialog-warning">Pick two corners of the area to plot.</p>
            )}
          </section>

          <section className="print-dialog-group">
            <h3>Plot scale</h3>
            <label className="print-dialog-row">
              <span>Scale</span>
              <select
                value={options.scaleMode}
                onChange={(event) => patch({ scaleMode: event.target.value as PlotScaleMode })}
              >
                {SCALES.map((scaleOption) => (
                  <option key={scaleOption.value} value={scaleOption.value}>
                    {scaleOption.label}
                  </option>
                ))}
              </select>
            </label>
            {options.scaleMode === 'custom' && (
              <label className="print-dialog-row" title="Drawing units that map to one millimetre on the paper.">
                <span>Units / mm</span>
                <input
                  type="number"
                  min={0.001}
                  step={0.1}
                  value={options.customScale}
                  onChange={(event) => patch({ customScale: Number(event.target.value) })}
                />
              </label>
            )}
            <label className="print-dialog-row">
              <span>Center on paper</span>
              <input
                type="checkbox"
                checked={options.center}
                onChange={(event) => patch({ center: event.target.checked })}
              />
            </label>
          </section>

          <section className="print-dialog-group print-dialog-preview-group">
            <h3>Preview</h3>
            <div className="print-preview" aria-hidden="true">
              <div className="print-preview-sheet" style={{ width: sheetW, height: sheetH }}>
                <div
                  className="print-preview-margin"
                  style={{
                    left: margin,
                    top: margin,
                    width: Math.max(0, sheetW - margin * 2),
                    height: Math.max(0, sheetH - margin * 2),
                  }}
                />
                {canPlot && (
                  <div
                    className="print-preview-content"
                    style={{ left: drawnX, top: drawnY, width: drawnW, height: drawnH }}
                  />
                )}
              </div>
            </div>
            {layout && (
              <p className="print-dialog-note">
                {layout.pageW.toFixed(0)} × {layout.pageH.toFixed(0)} mm · scale{' '}
                {options.scaleMode === 'fit'
                  ? `fit (${(1 / layout.applied).toFixed(2)} drawing units / mm)`
                  : describeScale(options)}
              </p>
            )}
          </section>
            </>
          )}
        </div>

        <footer className="print-dialog-footer">
          <button type="button" onClick={() => setPrintOptions({ ...DEFAULT_PRINT_OPTIONS })}>
            Defaults
          </button>
          <div className="print-dialog-footer-actions">
            <button type="button" onClick={closePrintDialog}>
              Cancel
            </button>
            <button type="button" className="print-dialog-primary" disabled={!canPlot} onClick={plot}>
              Plot
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
