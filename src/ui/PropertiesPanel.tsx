import { DEFAULT_LAYER_COLOR } from '../core/layers'
import { HATCH_PATTERN_LABELS, HATCH_PATTERNS } from '../core/hatch'
import { pageSizeMm, VIEWPORT_SCALES } from '../core/print'
import type { PaperOrientation, PaperSize } from '../core/types'

/** The paper a sheet can be plotted on, in the order a drawing office thinks of them. */
const PAPER_SIZES: { value: PaperSize; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'a3', label: 'A3' },
  { value: 'a2', label: 'A2' },
  { value: 'a1', label: 'A1' },
  { value: 'letter', label: 'Letter' },
  { value: 'legal', label: 'Legal' },
  { value: 'tabloid', label: 'Tabloid' },
]
import { useCadStore } from '../core/store'
import { STANDARD_STYLE, textStylesOf } from '../core/text'
import { ATTACHMENT_CODES, JUSTIFY_CODES } from '../core/prompts'
import { dimensionScale } from './renderers'
import type {
  DimensionEntity,
  HatchEntity,
  HatchPattern,
  Layout,
  LeaderEntity,
  MTextAttachment,
  MTextEntity,
  ToleranceEntity,
  TextEntity,
  TextJustify,
} from '../core/types'

const round1 = (value: number) => Math.round(value * 10) / 10

export function PropertiesPanel() {
  const doc = useCadStore((state) => state.doc)
  const selectedIds = useCadStore((state) => state.selectedIds)
  const setSelectionColor = useCadStore((state) => state.setSelectionColor)
  const updateSpaceEntities = useCadStore((state) => state.updateSpaceEntities)
  const moveSelectionToLayer = useCadStore((state) => state.moveSelectionToLayer)
  const resizeDimensions = useCadStore((state) => state.resizeDimensions)
  const updateHatches = useCadStore((state) => state.updateHatches)
  const updateSelectedText = useCadStore((state) => state.updateSelectedText)
  const activeLayoutId = useCadStore((state) => state.activeLayoutId)
  const updateLayout = useCadStore((state) => state.updateLayout)
  const activeViewportId = useCadStore((state) => state.activeViewportId)
  const updateViewport = useCadStore((state) => state.updateViewport)
  const selected = doc.entities.filter((entity) => selectedIds.includes(entity.id))
  const dimensions = selected.filter((entity): entity is DimensionEntity => entity.type === 'dimension')
  const leaders = selected.filter((entity): entity is LeaderEntity => entity.type === 'leader')
  const tolerances = selected.filter((entity): entity is ToleranceEntity => entity.type === 'tolerance')
  const hatches = selected.filter((entity): entity is HatchEntity => entity.type === 'hatch')
  /** Text and MTEXT share most of their rows, so they share one block; the rest are per-kind. */
  const notes = selected.filter(
    (entity): entity is TextEntity | MTextEntity => entity.type === 'text' || entity.type === 'mtext',
  )
  const singleLine = notes.filter((entity): entity is TextEntity => entity.type === 'text')
  const paragraphs = notes.filter((entity): entity is MTextEntity => entity.type === 'mtext')
  const layout = activeLayoutId
    ? doc.layouts.find((candidate) => candidate.id === activeLayoutId) ?? null
    : null
  const viewport =
    layout && activeViewportId
      ? layout.viewports.find((candidate) => candidate.id === activeViewportId) ?? null
      : null

  /*
   * A viewport takes over the panel while one is picked on a sheet: its scale is what decides how
   * big the drawing reads on the paper, so it is the property that matters most here, and a fitted
   * viewport can land on a scale the standard list does not carry.
   */
  if (layout && viewport) {
    const scales = VIEWPORT_SCALES.includes(viewport.unitsPerMm)
      ? VIEWPORT_SCALES
      : [...VIEWPORT_SCALES, viewport.unitsPerMm].sort((a, b) => a - b)
    const patch = (next: Parameters<typeof updateViewport>[2]) =>
      updateViewport(layout.id, viewport.id, next)
    return (
      <section className="panel">
        <h3>Viewport</h3>
        <p>On {layout.name}</p>
        <label title="How much of the drawing the viewport shows. 50 draws the model at 1:50.">
          Scale
          <select
            aria-label="Viewport scale"
            value={String(viewport.unitsPerMm)}
            onChange={(event) => patch({ unitsPerMm: Number(event.target.value) })}
          >
            {scales.map((scale) => (
              <option key={scale} value={String(scale)}>
                1:{scale}
              </option>
            ))}
          </select>
        </label>
        <label title="A locked viewport holds its view: the wheel and a drag leave what it shows alone.">
          Locked
          <input
            type="checkbox"
            checked={viewport.locked}
            onChange={(event) => patch({ locked: event.target.checked })}
          />
        </label>
        <label title="Position of the frame on the sheet, in millimetres from its top-left corner.">
          X (mm)
          <input
            type="number"
            step={1}
            value={round1(viewport.center.x)}
            onChange={(event) =>
              patch({ center: { ...viewport.center, x: Number(event.target.value) } })
            }
          />
        </label>
        <label title="Position of the frame on the sheet, in millimetres from its top-left corner.">
          Y (mm)
          <input
            type="number"
            step={1}
            value={round1(viewport.center.y)}
            onChange={(event) =>
              patch({ center: { ...viewport.center, y: Number(event.target.value) } })
            }
          />
        </label>
        <label title="How much paper the frame covers.">
          Width (mm)
          <input
            type="number"
            min={5}
            step={1}
            value={round1(viewport.widthMm)}
            onChange={(event) => patch({ widthMm: Math.max(5, Number(event.target.value)) })}
          />
        </label>
        <label title="How much paper the frame covers.">
          Height (mm)
          <input
            type="number"
            min={5}
            step={1}
            value={round1(viewport.heightMm)}
            onChange={(event) => patch({ heightMm: Math.max(5, Number(event.target.value)) })}
          />
        </label>
      </section>
    )
  }

  if (selected.length === 0) {
    /*
     * With nothing selected, AutoCAD's Properties palette shows the drawing's own settings — and for a
     * sheet that means its page setup. There was no way at all to change a layout's paper before: the
     * size was fixed when the sheet was made, so "how do I change the paper type" had no answer.
     */
    if (layout) {
      const sheet = layout
      const page = pageSizeMm(sheet.paper, sheet.orientation)
      const patchSheet = (patch: Partial<Layout>) => updateLayout(sheet.id, patch)
      return (
        <section className="panel">
          <h3>Sheet</h3>
          <label title="The name on the layout's tab.">
            Name
            <input
              value={sheet.name}
              aria-label="Layout name"
              onChange={(event) => patchSheet({ name: event.target.value })}
            />
          </label>
          <label title={`${Math.round(page.width)} × ${Math.round(page.height)} mm`}>
            Paper
            <select
              value={sheet.paper}
              aria-label="Paper size"
              onChange={(event) => patchSheet({ paper: event.target.value as PaperSize })}
            >
              {PAPER_SIZES.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>
          <label title="Which way round the paper goes.">
            Orientation
            <select
              value={sheet.orientation}
              aria-label="Paper orientation"
              onChange={(event) => patchSheet({ orientation: event.target.value as PaperOrientation })}
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label title="How far the printable area is inset from the paper's edge, in millimetres.">
            Margin (mm)
            <input
              type="number"
              min={0}
              step={1}
              value={sheet.marginMm}
              aria-label="Margin in millimetres"
              onChange={(event) => patchSheet({ marginMm: Math.max(0, Number(event.target.value)) })}
            />
          </label>
          <p className="panel-note">
            {Math.round(page.width)} × {Math.round(page.height)} mm of paper
          </p>
        </section>
      )
    }
    return (
      <section className="panel">
        <h3>Properties</h3>
        <p>No selection</p>
      </section>
    )
  }

  const first = selected[0]
  const layerIds = new Set(selected.map((entity) => entity.layerId))
  const commonLayerId = layerIds.size === 1 ? first.layerId : ''
  const typeLabel =
    selected.length === 1
      ? first.type
      : layerIds.size === 1
        ? `${selected.length} objects`
        : `${selected.length} objects`

  return (
    <section className="panel">
      <h3>Properties</h3>
      <p>Type: {typeLabel}</p>
      <label title="Which layer the selection sits on. Changing it moves every selected object.">
        Layer
        <select
          aria-label="Layer"
          value={commonLayerId}
          onChange={(event) => {
            if (event.target.value) moveSelectionToLayer(event.target.value)
          }}
        >
          {commonLayerId === '' && (
            <option value="" disabled>
              *Varies*
            </option>
          )}
          {doc.layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>
      </label>
      <label title="The colour this object is drawn in. ByLayer takes the layer's colour, so recolouring the layer moves the object with it.">
        Color
        <span className="property-color">
          <input
            type="color"
            aria-label="Colour of the selection"
            value={
              first.color ??
              doc.layers.find((layer) => layer.id === first.layerId)?.color ??
              DEFAULT_LAYER_COLOR
            }
            onChange={(event) => setSelectionColor(event.target.value)}
          />
          <button
            type="button"
            className={`property-color-owner ${first.color === undefined ? 'active' : ''}`}
            aria-pressed={first.color === undefined}
            title="Take the colour of the layer this object is on"
            onClick={() => setSelectionColor(null)}
          >
            ByLayer
          </button>
        </span>
      </label>
      <label>
        Lineweight
        <input
          type="number"
          min={1}
          max={10}
          step={1}
          value={first.lineweight ?? 1}
          onChange={(event) => {
            const lineweight = Number(event.target.value)
            // Written through the space that is open, so a sheet's objects are not left out.
            updateSpaceEntities((entities) =>
              entities.map((entity) =>
                selectedIds.includes(entity.id) ? { ...entity, lineweight } : entity,
              ),
            )
          }}
        />
      </label>
      {leaders.length > 0 && (
        <label title="The words the callout says">
          Leader text
          <input
            type="text"
            value={leaders[0].value}
            aria-label="Leader text"
            onChange={(event) => {
              const value = event.target.value
              updateSpaceEntities((entities) =>
                entities.map((entity) =>
                  selectedIds.includes(entity.id) && entity.type === 'leader' ? { ...entity, value } : entity,
                ),
              )
            }}
          />
        </label>
      )}
      {tolerances.length > 0 && (
        <>
          <label title="The GD&T symbol code (pos, flat, perp, ang, par, circ, cyl, run…)">
            Tolerance symbol
            <input
              type="text"
              value={tolerances[0].symbol}
              aria-label="Tolerance symbol"
              onChange={(event) => {
                const symbol = event.target.value
                updateSpaceEntities((entities) =>
                  entities.map((entity) =>
                    selectedIds.includes(entity.id) && entity.type === 'tolerance' ? { ...entity, symbol } : entity,
                  ),
                )
              }}
            />
          </label>
          <label title="The tolerance value">
            Tolerance value
            <input
              type="text"
              value={tolerances[0].value}
              aria-label="Tolerance value"
              onChange={(event) => {
                const value = event.target.value
                updateSpaceEntities((entities) =>
                  entities.map((entity) =>
                    selectedIds.includes(entity.id) && entity.type === 'tolerance' ? { ...entity, value } : entity,
                  ),
                )
              }}
            />
          </label>
          <label title="Datum references, separated by spaces">
            Datums
            <input
              type="text"
              value={tolerances[0].datums.join(' ')}
              aria-label="Tolerance datums"
              onChange={(event) => {
                const datums = event.target.value.split(/\s+/).filter(Boolean)
                updateSpaceEntities((entities) =>
                  entities.map((entity) =>
                    selectedIds.includes(entity.id) && entity.type === 'tolerance' ? { ...entity, datums } : entity,
                  ),
                )
              }}
            />
          </label>
        </>
      )}
      {dimensions.length > 0 && (
        <label title="Size of the text and arrows, as a multiple of the drawing's dimension style">
          Dimension size
          <input
            type="number"
            min={0.01}
            step={0.25}
            value={dimensionScale(dimensions[0])}
            onChange={(event) => {
              resizeDimensions(
                dimensions.map((entity) => entity.id),
                Number(event.target.value),
              )
            }}
          />
        </label>
      )}
      {hatches.length > 0 && (
        <>
          <label title="Hatch pattern name">
            Hatch pattern
            <select
              aria-label="Hatch pattern"
              value={hatches[0].pattern}
              onChange={(event) =>
                updateHatches(
                  hatches.map((entity) => entity.id),
                  { pattern: event.target.value as HatchPattern },
                )
              }
            >
              {HATCH_PATTERNS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {HATCH_PATTERN_LABELS[pattern]}
                </option>
              ))}
            </select>
          </label>
          <label title="Spacing of the hatch pattern">
            Hatch scale
            <input
              type="number"
              min={0.01}
              step={0.25}
              value={hatches[0].scale ?? 1}
              onChange={(event) =>
                updateHatches(
                  hatches.map((entity) => entity.id),
                  { scale: Number(event.target.value) },
                )
              }
            />
          </label>
          <label title="Extra rotation of the hatch pattern, in degrees">
            Hatch angle
            <input
              type="number"
              step={15}
              value={hatches[0].angle ?? 0}
              onChange={(event) =>
                updateHatches(
                  hatches.map((entity) => entity.id),
                  { angle: Number(event.target.value) },
                )
              }
            />
          </label>
        </>
      )}
      {notes.length > 0 && (
        <>
          <label title="The words themselves. Changing this rewrites every selected note.">
            Text
            <input
              type="text"
              aria-label="Text value"
              value={notes[0].value}
              onChange={(event) => updateSelectedText({ value: event.target.value })}
            />
          </label>
          <label title="Character height, in drawing units">
            Height
            <input
              type="number"
              min={0.01}
              step={1}
              aria-label="Text height"
              value={notes[0].height}
              onChange={(event) => updateSelectedText({ height: Math.abs(Number(event.target.value)) || 1 })}
            />
          </label>
          <label title="Rotation about the insertion point, in degrees">
            Rotation
            <input
              type="number"
              step={15}
              aria-label="Text rotation"
              value={notes[0].rotation ?? 0}
              onChange={(event) => updateSelectedText({ rotation: Number(event.target.value) || undefined })}
            />
          </label>
          {singleLine.length > 0 && (
            <label title="AutoCAD's justification: where the insertion point sits on the text">
              Justification
              <select
                aria-label="Text justification"
                value={singleLine[0].justify ?? 'Left'}
                onChange={(event) => updateSelectedText({ justify: event.target.value as TextJustify })}
              >
                {JUSTIFY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          )}
          {paragraphs.length > 0 && (
            <>
              <label title="Which corner or edge of the paragraph its insertion point anchors">
                Attachment
                <select
                  aria-label="Text attachment"
                  value={paragraphs[0].attachment ?? 'TL'}
                  onChange={(event) => updateSelectedText({ attachment: event.target.value as MTextAttachment })}
                >
                  {ATTACHMENT_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label title="The column the paragraphs wrap to. 0 wraps only at the paragraph breaks.">
                Column width
                <input
                  type="number"
                  min={0}
                  step={1}
                  aria-label="Column width"
                  value={paragraphs[0].width}
                  onChange={(event) => updateSelectedText({ width: Math.max(0, Number(event.target.value)) })}
                />
              </label>
            </>
          )}
          <label title="The named style this text is set in, which is where its font comes from">
            Style
            <select
              aria-label="Text style"
              value={notes[0].styleId ?? ''}
              onChange={(event) => updateSelectedText({ styleId: event.target.value || undefined })}
            >
              {textStylesOf(doc).map((style) => (
                <option key={style.id} value={style.id === STANDARD_STYLE.id ? '' : style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </section>
  )
}
