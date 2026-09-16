import { useEffect, useId, useRef, useState } from 'react'
import { useCadStore } from '../core/store'
import { SINGLE_LINE_SPACING, styleFor, textStylesOf, wrapParagraph } from '../core/text'
import type { MTextAttachment } from '../core/types'
import { ATTACHMENT_CODES } from '../core/prompts'

const ATTACHMENT_LABELS: Record<MTextAttachment, string> = {
  TL: 'Top left',
  TC: 'Top centre',
  TR: 'Top right',
  ML: 'Middle left',
  MC: 'Middle centre',
  MR: 'Middle right',
  BL: 'Bottom left',
  BC: 'Bottom centre',
  BR: 'Bottom right',
}

/**
 * Where a note's words are written.
 *
 * AutoCAD opens MTEXT's in-place editor with a context ribbon for the style, height and attachment,
 * and DDEDIT opens the same editor on an object that already exists. This is that editor as a panel:
 * the words in a box that takes Enter as a new paragraph — which the command line cannot, because
 * there Enter submits — and the fields MTEXT is placed with beside it.
 *
 * The preview is not decoration: how a paragraph breaks at a given width and height is the one thing
 * about MTEXT that cannot be judged from the words themselves.
 */
export function MTextEditor() {
  const editor = useCadStore((state) => state.textEditor)
  const doc = useCadStore((state) => state.doc)
  const commit = useCadStore((state) => state.commitTextEditor)
  const cancel = useCadStore((state) => state.cancelTextEditor)
  const storeHeight = useCadStore((state) => state.textHeight)
  const storeRotation = useCadStore((state) => state.textRotation)
  const storeStyleId = useCadStore((state) => state.textStyleId)

  const [value, setValue] = useState('')
  const [height, setHeight] = useState(storeHeight)
  const [rotation, setRotation] = useState(storeRotation)
  const [styleId, setStyleId] = useState<string | null>(storeStyleId)
  const [attachment, setAttachment] = useState<MTextAttachment>('TL')
  const [width, setWidth] = useState(0)
  const [lineSpacing, setLineSpacing] = useState(1)
  // The tolerance frame's compartments: one symbol code and up to three datum references.
  const [symbol, setSymbol] = useState('')
  const [datums, setDatums] = useState('')
  const wordsRef = useRef<HTMLTextAreaElement | null>(null)
  const titleId = useId()

  const entityId = editor?.entityId ?? null
  const kind = editor?.kind ?? 'mtext'

  // An object being edited brings its own fields; a new MTEXT starts from the drawing's settings and
  // the box it was drawn.
  useEffect(() => {
    if (!editor) return
    const entity = entityId
      ? [...doc.entities, ...doc.layouts.flatMap((layout) => layout.entities)].find(
          (candidate) => candidate.id === entityId,
        )
      : undefined
    const mtext = entity && entity.type === 'mtext' ? entity : null
    const tolerance = entity && entity.type === 'tolerance' ? entity : null
    const leader = entity && entity.type === 'leader' ? entity : null
    const drawn = useCadStore.getState().mtextDraft

    setValue(editor.value)
    setHeight(mtext?.height ?? tolerance?.height ?? leader?.height ?? storeHeight)
    setRotation(mtext?.rotation ?? storeRotation)
    setStyleId(mtext?.styleId ?? leader?.styleId ?? storeStyleId)
    setAttachment(mtext?.attachment ?? useCadStore.getState().mtextAttachment)
    setWidth(mtext?.width ?? drawn?.width ?? 0)
    setLineSpacing(mtext?.lineSpacing ?? 1)
    setSymbol(tolerance?.symbol ?? '')
    setDatums(tolerance?.datums.join(' ') ?? '')
    // The caret belongs in the words: this dialog exists to type them.
    window.setTimeout(() => wordsRef.current?.select(), 0)
  }, [editor, entityId, doc, storeHeight, storeRotation, storeStyleId])

  if (!editor) return null

  const styles = textStylesOf(doc)
  const style = styleFor({ textStyles: styles }, { styleId: styleId ?? undefined })
  const shown =
    kind === 'mtext'
      ? value.split('\n').flatMap((paragraph) => wrapParagraph(paragraph, width, height, style))
      : [value]

  const done = () =>
    commit(
      kind === 'tolerance'
        ? { value, symbol, datums: datums.split(/\s+/).filter(Boolean) }
        : kind === 'mtext'
          ? { value, height, rotation, styleId, attachment, width, lineSpacing }
          : { value, height, rotation, styleId },
    )

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && cancel()}>
      <div className="dialog text-editor" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <h2 id={titleId}>
            {editor.title}
            {kind === 'mtext' ? ' — paragraphs wrap to the width' : ' — one line'}
          </h2>
          <button type="button" className="dialog-close" aria-label="Close" onClick={cancel}>
            ×
          </button>
        </header>

        <div className="dialog-body">
          <section className="dialog-group">
            <h3>Words</h3>
            {kind === 'mtext' ? (
              <textarea
                ref={wordsRef}
                className="text-editor-words"
                value={value}
                rows={6}
                aria-label="Text"
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancel()
                    return
                  }
                  // Enter is a new paragraph here, so the way to finish is the button or Ctrl+Enter.
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    done()
                  }
                }}
              />
            ) : (
              /* One line of text IS one line: a box that accepted Enter would make it a paragraph. */
              <input
                ref={wordsRef as unknown as React.RefObject<HTMLInputElement>}
                className="text-editor-words"
                value={value}
                aria-label="Text"
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancel()
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    done()
                  }
                }}
              />
            )}
            <p className="dialog-note">
              {kind === 'mtext'
                ? 'Enter starts a new paragraph. Ctrl+Enter or Done finishes.'
                : 'Enter is not available in one line of text. Done finishes.'}
            </p>
          </section>

          {kind === 'mtext' ? (
            <section className="dialog-group">
              <h3>Paragraph</h3>
              <label className="dialog-row">
                <span>Width</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={width}
                  aria-label="Column width"
                  onChange={(event) => setWidth(Math.max(0, Number(event.target.value)))}
                />
                <span className="dialog-note">0 wraps only where you pressed Enter</span>
              </label>
              <label className="dialog-row">
                <span>Height</span>
                <input
                  type="number"
                  min={0.01}
                  step={1}
                  value={height}
                  aria-label="Character height"
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </label>
              <label className="dialog-row">
                <span>Rotation</span>
                <input
                  type="number"
                  step={15}
                  value={rotation}
                  aria-label="Rotation angle"
                  onChange={(event) => setRotation(Number(event.target.value))}
                />
                <span className="dialog-note">degrees</span>
              </label>
              <label className="dialog-row">
                <span>Attachment</span>
                <select
                  value={attachment}
                  aria-label="Attachment point"
                  onChange={(event) => setAttachment(event.target.value as MTextAttachment)}
                >
                  {ATTACHMENT_CODES.map((code) => (
                    <option key={code} value={code}>
                      {ATTACHMENT_LABELS[code]} ({code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="dialog-row">
                <span>Line spacing</span>
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={lineSpacing}
                  aria-label="Line spacing"
                  onChange={(event) => setLineSpacing(Number(event.target.value) || 1)}
                />
                <span className="dialog-note">
                  x {SINGLE_LINE_SPACING.toFixed(2)} of the height per line
                </span>
              </label>
              <label className="dialog-row">
                <span>Style</span>
                <select
                  value={styleId ?? ''}
                  aria-label="Text style"
                  onChange={(event) => setStyleId(event.target.value || null)}
                >
                  {styles.map((candidate) => (
                    <option key={candidate.id} value={candidate.id === 'standard' && candidate.font === 'helvetica' ? '' : candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          ) : (
            <section className="dialog-group">
              <h3>Text</h3>
              <label className="dialog-row">
                <span>Height</span>
                <input
                  type="number"
                  min={0.01}
                  step={1}
                  value={height}
                  aria-label="Character height"
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </label>
              <label className="dialog-row">
                <span>Rotation</span>
                <input
                  type="number"
                  step={15}
                  value={rotation}
                  aria-label="Rotation angle"
                  onChange={(event) => setRotation(Number(event.target.value))}
                />
                <span className="dialog-note">degrees</span>
              </label>
            </section>
          )}

          <section className="dialog-group">
            <h3>Preview</h3>
            <div className="text-editor-preview" aria-label="Preview">
              {shown.map((line, index) => (
                <div key={`preview-${index}`} className="text-editor-preview-line">
                  {line === '' ? '\u00a0' : line}
                </div>
              ))}
            </div>
            <p className="dialog-note">
              {shown.length} line{shown.length === 1 ? '' : 's'} at height {height}, in {style.name}
            </p>
          </section>
        </div>

        <footer className="dialog-footer">
          <button type="button" className="dialog-close" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="dialog-primary" onClick={done}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
