import { useCadStore } from '../core/store'
import { DEFAULT_LAYER_COLOR } from '../core/layers'
import { shortestAlias, resolveCommand } from '../core/commandRegistry'
import { Icon, type IconName } from './Icon'
import { HATCH_PATTERN_LABELS, HATCH_PATTERNS } from '../core/hatch'
import type { ArcMode, ArrayType, CircleMode, DimensionType, HatchPattern, PolygonFit, RectMode, ToolMode } from '../core/types'

type ToolItem = { tool: ToolMode; label: string; icon: IconName; command: string; hint?: string }

type ToolGroup = {
  title: string
  items: ToolItem[]
}

const groups: ToolGroup[] = [
  {
    title: 'Draw',
    items: [
      { tool: 'line', label: 'Line', icon: 'line', command: 'LINE' },
      { tool: 'polyline', label: 'Polyline', icon: 'polyline', command: 'PLINE' },
      { tool: 'rect', label: 'Rectangle', icon: 'rect', command: 'RECTANG' },
      { tool: 'circle', label: 'Circle', icon: 'circle', command: 'CIRCLE' },
      { tool: 'arc', label: 'Arc', icon: 'arc', command: 'ARC' },
      { tool: 'ellipse', label: 'Ellipse', icon: 'ellipse', command: 'ELLIPSE' },
      { tool: 'polygon', label: 'Polygon', icon: 'polygon', command: 'POLYGON' },
      { tool: 'spline', label: 'Spline', icon: 'spline', command: 'SPLINE' },
      { tool: 'insert', label: 'Insert', icon: 'insert', command: 'INSERT', hint: 'Place a block by its base point, scaled and turned' },
    ],
  },
]

/** One entry of a ribbon dropdown: the value, how it reads, the glyph beside the box, and a hint. */
type Choice<T extends string> = { value: T; label: string; icon: IconName; hint: string }

/** Whichever option is currently chosen, so the icon and tooltip can follow the dropdown. */
const chosen = <T extends string>(choices: Choice<T>[], value: T): Choice<T> =>
  choices.find((choice) => choice.value === value) ?? choices[0]

/** The ways CIRCLE can be pinned down, offered while the command is running. */
const circleModes: Choice<CircleMode>[] = [
  {
    value: 'center',
    label: 'Centre, radius',
    icon: 'circle-center-radius',
    hint: 'Pick the centre, then a point at the radius',
  },
  {
    value: 'diameter',
    label: 'Centre, diameter',
    icon: 'circle-center-diameter',
    hint: 'Pick the centre, then give the size across the circle rather than out from the middle',
  },
  {
    value: '2p',
    label: '2 point',
    icon: 'circle-2p',
    hint: 'Pick two points, taken as opposite ends of a diameter',
  },
  {
    value: '3p',
    label: '3 point',
    icon: 'circle-3p',
    hint: 'Pick three points on the rim, which one circle passes through',
  },
  {
    value: 'ttr',
    label: 'Tan, tan, radius',
    icon: 'circle-ttr',
    hint: 'Click two objects to sit tangent to, then give the radius',
  },
]

/** The ways ARC can be pinned down, offered while the command is running. */
const arcModes: Choice<ArcMode>[] = [
  {
    value: 'cse',
    label: 'Centre, start, end',
    icon: 'arc-cse',
    hint: 'Pick the centre, then the start of the arc, then the end',
  },
  {
    value: '3p',
    label: '3 point',
    icon: 'arc-3p',
    hint: 'Pick three points the arc should pass through',
  },
  {
    value: 'sce',
    label: 'Start, centre, end',
    icon: 'arc-sce',
    hint: 'Pick the start, then the centre, then the end',
  },
  {
    value: 'sca',
    label: 'Start, centre, angle',
    icon: 'arc-sca',
    hint: 'Pick the start and centre, then type the included angle or pick the end ray',
  },
]

/** The ways RECTANG can be pinned down, offered while the command is running. */
const rectModes: Choice<RectMode>[] = [
  {
    value: 'corners',
    label: 'Two corners',
    icon: 'rect-corners',
    hint: 'Pick two opposite corners',
  },
  {
    value: 'center',
    label: 'Centre, corner',
    icon: 'rect-center',
    hint: 'Pick the centre, then a corner',
  },
  {
    value: 'dimensions',
    label: 'Dimensions',
    icon: 'rect-dimensions',
    hint: 'Pick a corner, then type the length and width',
  },
]

/** How POLYGON is sized, offered while the command is running. */
const polygonFits: Choice<PolygonFit>[] = [
  {
    value: 'inscribed',
    label: 'Inscribed',
    icon: 'polygon-inscribed',
    hint: 'The corners sit on the circle, so the radius you pick reaches a corner',
  },
  {
    value: 'circumscribed',
    label: 'Circumscribed',
    icon: 'polygon-circumscribed',
    hint: 'The sides sit against the circle, so the radius you pick reaches the middle of a side',
  },
  {
    value: 'edge',
    label: 'By one edge',
    icon: 'polygon-edge',
    hint: 'Draw a single side and let the rest of the shape follow from it',
  },
]

const dimensionTypes: Array<{ value: DimensionType; label: string; icon: IconName; command: string }> = [
  { value: 'linear', label: 'Linear', icon: 'dim-linear', command: 'DIMLINEAR' },
  { value: 'aligned', label: 'Aligned', icon: 'dim-aligned', command: 'DIMALIGNED' },
  { value: 'radial', label: 'Radius', icon: 'dim-radius', command: 'DIMRADIUS' },
  { value: 'diameter', label: 'Diameter', icon: 'dim-diameter', command: 'DIMDIAMETER' },
  { value: 'angular', label: 'Angular', icon: 'dim-angular', command: 'DIMANGULAR' },
]

const modifyTools: ToolItem[] = [
  {
    tool: 'move',
    label: 'Move',
    icon: 'move',
    command: 'MOVE',
    hint: 'Select objects, pick a base point, then pick where it goes',
  },
  {
    tool: 'copy',
    label: 'Copy',
    icon: 'copy',
    command: 'COPY',
    hint: 'Select objects, pick a base point, then pick where the copy goes',
  },
  {
    tool: 'rotate',
    label: 'Rotate',
    icon: 'rotate',
    command: 'ROTATE',
    hint: 'Select objects, pick a base point, then type or pick an angle',
  },
  {
    tool: 'scale',
    label: 'Scale',
    icon: 'scale',
    command: 'SCALE',
    hint: 'Select objects, pick a base point, then type a factor',
  },
  {
    tool: 'offset',
    label: 'Offset',
    icon: 'offset',
    command: 'OFFSET',
    hint: 'Pick an object, then pick the side to offset toward',
  },
  {
    tool: 'trim',
    label: 'Trim',
    icon: 'trim',
    command: 'TRIM',
    hint: 'Click the part to cut away, drag a fence across many, or hold Shift to extend',
  },
  {
    tool: 'extend',
    label: 'Extend',
    icon: 'extend',
    command: 'EXTEND',
    hint: 'Click the end to lengthen, drag a fence across many, or hold Shift to trim',
  },
  {
    tool: 'fillet',
    label: 'Fillet',
    icon: 'fillet',
    command: 'FILLET',
    hint: 'Click one line then another; the corner between them is rounded off',
  },
  {
    tool: 'chamfer',
    label: 'Chamfer',
    icon: 'chamfer',
    command: 'CHAMFER',
    hint: 'Click one line then another; the corner between them is cut square across',
  },
  {
    tool: 'mirror',
    label: 'Mirror',
    icon: 'mirror',
    command: 'MIRROR',
    hint: 'Select objects first, then pick the mirror line',
  },
  {
    tool: 'array',
    label: 'Array',
    icon: 'array-rect',
    command: 'ARRAY',
    hint: 'Select objects first, then set the grid out or pick a centre to sweep around',
  },
  {
    tool: 'boundary',
    label: 'Boundary',
    icon: 'boundary',
    command: 'BOUNDARY',
    hint: 'Click inside an enclosed area to trace its outline as a polyline',
  },
]

/**
 * Buttons for commands that act on whatever is already selected. They run there and then instead
 * of putting the canvas into a mode, so they never show as the active tool.
 */
const selectionCommands: { label: string; icon: IconName; command: string; hint: string }[] = [
  {
    label: 'Join',
    icon: 'join',
    command: 'JOIN',
    hint: 'Select pieces that meet end to end, or lines along one straight, to make a single object',
  },
  {
    label: 'Explode',
    icon: 'explode',
    command: 'EXPLODE',
    hint: 'Break polylines into their segments and blocks into their contents',
  },
  {
    label: 'Block',
    icon: 'block',
    command: 'BLOCK',
    hint: 'Turn the selection into a reusable block, kept in place as an insert',
  },
  {
    label: 'Overkill',
    icon: 'overkill',
    command: 'OVERKILL',
    hint: 'Delete duplicates and absorb overlapping lines into one another',
  },
]

/** Tooltip in AutoCAD's shape: what the button does, then how to type it. */
const tooltip = (item: { label: string; command: string; hint?: string }): string => {
  const command = resolveCommand(item.command)
  const alias = command ? shortestAlias(command) : item.command
  const detail = item.hint ? `\n${item.hint}` : ''
  return `${item.label} (${item.command}${alias && alias !== item.command ? `, ${alias}` : ''})${detail}`
}

export function Toolbar() {
  const activeTool = useCadStore((state) => state.activeTool)
  const setTool = useCadStore((state) => state.setTool)
  const currentColor = useCadStore((state) => state.currentColor)
  const setCurrentColor = useCadStore((state) => state.setCurrentColor)
  const executeCommand = useCadStore((state) => state.executeCommand)
  const polygonSides = useCadStore((state) => state.polygonSides)
  const setPolygonSides = useCadStore((state) => state.setPolygonSides)
  const polygonFit = useCadStore((state) => state.polygonFit)
  const setPolygonFit = useCadStore((state) => state.setPolygonFit)
  const circleMode = useCadStore((state) => state.circleMode)
  const setCircleMode = useCadStore((state) => state.setCircleMode)
  const arcMode = useCadStore((state) => state.arcMode)
  const setArcMode = useCadStore((state) => state.setArcMode)
  const rectMode = useCadStore((state) => state.rectMode)
  const setRectMode = useCadStore((state) => state.setRectMode)
  const dimensionType = useCadStore((state) => state.dimensionType)
  const setDimensionType = useCadStore((state) => state.setDimensionType)
  const dimScale = useCadStore((state) => state.dimScale)
  const setDimScale = useCadStore((state) => state.setDimScale)
  const hatchPattern = useCadStore((state) => state.hatchPattern)
  const setHatchPattern = useCadStore((state) => state.setHatchPattern)
  const hatchScale = useCadStore((state) => state.hatchScale)
  const setHatchScale = useCadStore((state) => state.setHatchScale)
  const hatchAngle = useCadStore((state) => state.hatchAngle)
  const setHatchAngle = useCadStore((state) => state.setHatchAngle)
  const offsetDistance = useCadStore((state) => state.offsetDistance)
  const setOffsetDistance = useCadStore((state) => state.setOffsetDistance)
  const filletRadius = useCadStore((state) => state.filletRadius)
  const setFilletRadius = useCadStore((state) => state.setFilletRadius)
  const chamferDistance = useCadStore((state) => state.chamferDistance)
  const setChamferDistance = useCadStore((state) => state.setChamferDistance)
  const arrayType = useCadStore((state) => state.arrayType)
  const setArrayType = useCadStore((state) => state.setArrayType)
  const arrayRows = useCadStore((state) => state.arrayRows)
  const arrayColumns = useCadStore((state) => state.arrayColumns)
  const arrayRowSpacing = useCadStore((state) => state.arrayRowSpacing)
  const arrayColumnSpacing = useCadStore((state) => state.arrayColumnSpacing)
  const arrayCount = useCadStore((state) => state.arrayCount)
  const arrayFillAngle = useCadStore((state) => state.arrayFillAngle)
  const setArrayOption = useCadStore((state) => state.setArrayOption)
  const arrayRotateItems = useCadStore((state) => state.arrayRotateItems)
  const toggleArrayRotateItems = useCadStore((state) => state.toggleArrayRotateItems)
  const mirrorKeepSource = useCadStore((state) => state.mirrorKeepSource)
  const toggleMirrorKeepSource = useCadStore((state) => state.toggleMirrorKeepSource)
  const edgeIds = useCadStore((state) => state.edgeIds)
  const pickingEdges = useCadStore((state) => state.pickingEdges)
  const beginEdgeSelection = useCadStore((state) => state.beginEdgeSelection)
  const useAllEdges = useCadStore((state) => state.useAllEdges)

  const editingEdges = activeTool === 'trim' || activeTool === 'extend'

  return (
    <div className="toolbar-ribbon">
      <button
        type="button"
        className={`ribbon-btn ribbon-select ${activeTool === 'select' ? 'active' : ''}`}
        onClick={() => setTool('select')}
        title="Select objects (Esc returns here from any command)"
      >
        <Icon name="select" />
        <span>Select</span>
      </button>

      {groups.map((group) => (
        <section key={group.title} className="toolbar-group">
          <h2>{group.title}</h2>
          <div className="toolbar">
            {group.items.map((item) => (
              <button
                key={item.tool}
                type="button"
                className={`ribbon-btn ${item.tool === activeTool ? 'active' : ''}`}
                onClick={() => setTool(item.tool)}
                title={tooltip(item)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
            {/*
             * The colour new objects are drawn in. ByLayer is the default and stays a real option:
             * colour is a property of an object, not only of a layer, so a red detail does not need a
             * red layer to live on.
             */}
            {group.title === 'Draw' && (
              <label
                className="ribbon-field ribbon-color"
                title={
                  currentColor
                    ? `New objects are drawn in ${currentColor}. ByLayer hands them back to their layer's colour.`
                    : "New objects take the colour of the layer they land on (ByLayer). Pick a colour to draw in one of your own without making a layer for every colour."
                }
              >
                <input
                  type="color"
                  aria-label="Colour for new objects"
                  value={currentColor ?? DEFAULT_LAYER_COLOR}
                  onChange={(event) => setCurrentColor(event.target.value)}
                />
                Draw in
                <button
                  type="button"
                  className={`ribbon-color-owner ${currentColor ? '' : 'active'}`}
                  aria-pressed={!currentColor}
                  onClick={() => setCurrentColor(null)}
                >
                  ByLayer
                </button>
              </label>
            )}
            {activeTool === 'circle' && (
              <label className="ribbon-field" title={`How the circle is pinned down\n${chosen(circleModes, circleMode).hint}`}>
                <Icon name={chosen(circleModes, circleMode).icon} />
                Circle by
                <select value={circleMode} onChange={(event) => setCircleMode(event.target.value as CircleMode)}>
                  {circleModes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {activeTool === 'arc' && (
              <label className="ribbon-field" title={`How the arc is pinned down\n${chosen(arcModes, arcMode).hint}`}>
                <Icon name={chosen(arcModes, arcMode).icon} />
                Arc by
                <select value={arcMode} onChange={(event) => setArcMode(event.target.value as ArcMode)}>
                  {arcModes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {activeTool === 'rect' && (
              <label className="ribbon-field" title={`How the rectangle is pinned down\n${chosen(rectModes, rectMode).hint}`}>
                <Icon name={chosen(rectModes, rectMode).icon} />
                Rect by
                <select value={rectMode} onChange={(event) => setRectMode(event.target.value as RectMode)}>
                  {rectModes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {activeTool === 'polygon' && (
              <label className="ribbon-field" title="Number of polygon sides">
                Sides
                <input
                  type="number"
                  min={3}
                  max={64}
                  value={polygonSides}
                  onChange={(event) => setPolygonSides(Number(event.target.value))}
                />
              </label>
            )}
            {activeTool === 'polygon' && (
              <label className="ribbon-field" title={chosen(polygonFits, polygonFit).hint}>
                <Icon name={chosen(polygonFits, polygonFit).icon} />
                Fit
                <select value={polygonFit} onChange={(event) => setPolygonFit(event.target.value as PolygonFit)}>
                  {polygonFits.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </section>
      ))}

      <section className="toolbar-group">
        <h2>Modify</h2>
        <div className="toolbar">
          {modifyTools.map((item) => (
            <button
              key={item.tool}
              type="button"
              className={`ribbon-btn ${item.tool === activeTool ? 'active' : ''}`}
              onClick={() => setTool(item.tool)}
              title={tooltip(item)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
          {selectionCommands.map((item) => (
            <button
              key={item.command}
              type="button"
              className="ribbon-btn"
              onClick={() => executeCommand(item.command)}
              title={tooltip(item)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
          <label className="ribbon-field" title="Offset distance">
            Distance
            <input
              type="number"
              min={0}
              step={1}
              value={offsetDistance}
              onChange={(event) => setOffsetDistance(Number(event.target.value))}
            />
          </label>
          <label className="ribbon-field" title="Keep the original objects when mirroring">
            Keep source
            <input type="checkbox" checked={mirrorKeepSource} onChange={toggleMirrorKeepSource} />
          </label>
          {activeTool === 'fillet' && (
            <label className="ribbon-field" title="Radius of the arc that rounds the corner. Zero squares it off.">
              Radius
              <input
                type="number"
                min={0}
                step={1}
                value={filletRadius}
                onChange={(event) => setFilletRadius(Number(event.target.value))}
              />
            </label>
          )}
          {activeTool === 'chamfer' && (
            <label className="ribbon-field" title="How far back along each line the corner is cut. Zero squares it off.">
              Chamfer
              <input
                type="number"
                min={0}
                step={1}
                value={chamferDistance}
                onChange={(event) => setChamferDistance(Number(event.target.value))}
              />
            </label>
          )}
          {activeTool === 'array' && (
            <label className="ribbon-field" title="Repeat in rows and columns, or around a centre">
              Array
              <select value={arrayType} onChange={(event) => setArrayType(event.target.value as ArrayType)}>
                <option value="rect">Rectangular</option>
                <option value="polar">Polar</option>
              </select>
            </label>
          )}
          {activeTool === 'array' && arrayType === 'rect' && (
            <>
              <label className="ribbon-field" title="Number of rows in the grid">
                Rows
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={arrayRows}
                  onChange={(event) => setArrayOption('rows', Number(event.target.value))}
                />
              </label>
              <label className="ribbon-field" title="Number of columns in the grid">
                Columns
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={arrayColumns}
                  onChange={(event) => setArrayOption('columns', Number(event.target.value))}
                />
              </label>
              <label className="ribbon-field" title="Distance from one row to the next. Negative builds downwards.">
                Row spacing
                <input
                  type="number"
                  value={arrayRowSpacing}
                  onChange={(event) => setArrayOption('rowSpacing', Number(event.target.value))}
                />
              </label>
              <label className="ribbon-field" title="Distance from one column to the next. Negative builds leftwards.">
                Col spacing
                <input
                  type="number"
                  value={arrayColumnSpacing}
                  onChange={(event) => setArrayOption('columnSpacing', Number(event.target.value))}
                />
              </label>
            </>
          )}
          {activeTool === 'array' && arrayType === 'polar' && (
            <>
              <label className="ribbon-field" title="How many items the finished array holds, counting the original">
                Items
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={arrayCount}
                  onChange={(event) => setArrayOption('count', Number(event.target.value))}
                />
              </label>
              <label className="ribbon-field" title="How much of a turn the array spans, in degrees">
                Fill angle
                <input
                  type="number"
                  min={-360}
                  max={360}
                  value={arrayFillAngle}
                  onChange={(event) => setArrayOption('fillAngle', Number(event.target.value))}
                />
              </label>
              <label className="ribbon-field" title="Turn each copy to follow the sweep, rather than keeping it upright">
                Rotate items
                <input type="checkbox" checked={arrayRotateItems} onChange={toggleArrayRotateItems} />
              </label>
            </>
          )}
          {editingEdges && (
            <label className="ribbon-field" title="Which objects act as cutting or boundary edges">
              Edges
              <button
                type="button"
                className="ribbon-btn"
                onClick={() => (edgeIds === null ? beginEdgeSelection() : useAllEdges())}
              >
                {pickingEdges ? 'Picking…' : edgeIds === null ? 'All objects' : `${edgeIds.length} chosen`}
              </button>
            </label>
          )}
        </div>
      </section>

      <section className="toolbar-group">
        <h2>Dimension</h2>
        <div className="toolbar">
          {dimensionTypes.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`ribbon-btn ${activeTool === 'dimension' && dimensionType === item.value ? 'active' : ''}`}
              onClick={() => setDimensionType(item.value)}
              title={tooltip(item)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
          <label
            className="ribbon-field"
            title="Size of the text and arrows on new dimensions, as a multiple of the drawing's dimension style (DIMSCALE)"
          >
            Size
            <input
              type="number"
              min={0.01}
              step={0.25}
              value={dimScale}
              onChange={(event) => setDimScale(Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="toolbar-group">
        <h2>Annotate</h2>
        <div className="toolbar">
          <button
            type="button"
            className={`ribbon-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setTool('text')}
            title={tooltip({ label: 'Text', command: 'TEXT' })}
          >
            <Icon name="text" />
            <span>Text</span>
          </button>
          <button
            type="button"
            className={`ribbon-btn ${activeTool === 'hatch' ? 'active' : ''}`}
            onClick={() => setTool('hatch')}
            title={tooltip({ label: 'Hatch', command: 'HATCH' })}
          >
            <Icon name="hatch" />
            <span>Hatch</span>
          </button>
          <label className="ribbon-field" title="Hatch pattern">
            Pattern
            <select value={hatchPattern} onChange={(event) => setHatchPattern(event.target.value as HatchPattern)}>
              {HATCH_PATTERNS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {HATCH_PATTERN_LABELS[pattern]}
                </option>
              ))}
            </select>
          </label>
          {activeTool === 'hatch' && (
            <>
              <label className="ribbon-field" title="Spacing of the hatch pattern, as a multiple of its built-in tile">
                Scale
                <input
                  type="number"
                  min={0.01}
                  step={0.25}
                  value={hatchScale}
                  onChange={(event) => setHatchScale(Number(event.target.value))}
                />
              </label>
              <label className="ribbon-field" title="Extra rotation of the hatch pattern, in degrees">
                Angle
                <input
                  type="number"
                  step={15}
                  value={hatchAngle}
                  onChange={(event) => setHatchAngle(Number(event.target.value))}
                />
              </label>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
