import { useId, useState } from 'react'
import { useCadStore } from '../core/store'
import { STANDARD_STYLE, styleFor, textStylesOf } from '../core/text'
import { FONT_FACES, TEXT_FONTS, type TextFont } from '../core/textMetrics'

/**
 * AutoCAD's Text Style dialog: the drawing's styles, and the four things a style is.
 *
 * A style can be named at the command line, but the point of a style is that a drawing's typography
 * is standardised — and nobody can standardise what they cannot see the list of. Editing here is
 * live: every text object naming the style follows it, which is what makes a style worth having.
 */
export function TextStylesDialog() {
  const open = useCadStore((state) => state.textStylesOpen)
  const setOpen = useCadStore((state) => state.setTextStylesOpen)
  const doc = useCadStore((state) => state.doc)
  const currentStyleId = useCadStore((state) => state.textStyleId)
  const setCurrentStyle = useCadStore((state) => state.setCurrentTextStyle)
  const createStyle = useCadStore((state) => state.createTextStyle)
  const updateStyle = useCadStore((state) => state.updateTextStyle)
  const deleteStyle = useCadStore((state) => state.deleteTextStyle)
  const [name, setName] = useState('')
  const titleId = useId()

  if (!open) return null

  const styles = textStylesOf(doc)
  const close = () => setOpen(false)

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (styles.some((style) => style.name.toLowerCase() === trimmed.toLowerCase())) return
    createStyle({ ...STANDARD_STYLE, name: trimmed })
    setName('')
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="dialog text-styles-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <h2 id={titleId}>Text styles</h2>
          <button type="button" className="dialog-close" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>

        <div className="dialog-body">
          {styles.map((style) => {
            const isStandard = style.id === STANDARD_STYLE.id || style.name === STANDARD_STYLE.name
            const used = [...doc.entities, ...doc.layouts.flatMap((layout) => layout.entities)].filter(
              (entity) => (entity.type === 'text' || entity.type === 'mtext') && style.id === styleFor(doc, entity).id,
            ).length
            return (
              <section className="dialog-group text-style-row" key={style.id}>
                <h3>
                  {style.name}
                  <span className="dialog-note">
                    {' '}
                    — {used} object{used === 1 ? '' : 's'}
                  </span>
                </h3>
                <label className="dialog-row">
                  <span>Font</span>
                  <select
                    value={style.font}
                    aria-label={`Font of ${style.name}`}
                    onChange={(event) => updateStyle(style.id, { font: event.target.value as TextFont })}
                  >
                    {TEXT_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {FONT_FACES[font].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dialog-row">
                  <span>Height</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={style.height}
                    aria-label={`Height of ${style.name}`}
                    onChange={(event) => updateStyle(style.id, { height: Math.max(0, Number(event.target.value)) })}
                  />
                  <span className="dialog-note">0 asks for a height on every text object</span>
                </label>
                <label className="dialog-row">
                  <span>Width factor</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.05}
                    value={style.widthFactor}
                    aria-label={`Width factor of ${style.name}`}
                    onChange={(event) =>
                      updateStyle(style.id, { widthFactor: Math.abs(Number(event.target.value)) || 1 })
                    }
                  />
                </label>
                <label className="dialog-row">
                  <span>Oblique angle</span>
                  <input
                    type="number"
                    step={5}
                    value={style.obliqueAngle}
                    aria-label={`Oblique angle of ${style.name}`}
                    onChange={(event) => updateStyle(style.id, { obliqueAngle: Number(event.target.value) })}
                  />
                  <span className="dialog-note">degrees off vertical</span>
                </label>
                <div className="dialog-row">
                  <button
                    type="button"
                    className={currentStyleId === style.id || (isStandard && !currentStyleId) ? 'text-style-current' : ''}
                    aria-pressed={currentStyleId === style.id || (isStandard && !currentStyleId)}
                    onClick={() => setCurrentStyle(isStandard ? null : style.id)}
                  >
                    {currentStyleId === style.id || (isStandard && !currentStyleId) ? 'Current' : 'Make current'}
                  </button>
                  <button type="button" disabled={isStandard} onClick={() => deleteStyle(style.id)}>
                    Delete
                  </button>
                </div>
              </section>
            )
          })}

          <section className="dialog-group">
            <h3>New style</h3>
            <div className="dialog-row">
              <input
                type="text"
                value={name}
                placeholder="Style name"
                aria-label="New style name"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    add()
                  }
                }}
              />
              <button type="button" onClick={add} disabled={name.trim() === ''}>
                Add
              </button>
            </div>
            <p className="dialog-note">
              A new style starts from Standard. Standard itself cannot be deleted: every text object
              without a style of its own reads it.
            </p>
          </section>
        </div>

        <footer className="dialog-footer">
          <button type="button" className="dialog-primary" onClick={close}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
