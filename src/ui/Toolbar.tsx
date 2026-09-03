import { useCadStore } from '../core/store'
import { shortestAlias, resolveCommand } from '../core/commandRegistry'
import { Icon, type IconName } from './Icon'
import type { ArrayType, CircleMode, DimensionType, HatchPattern, PolygonFit, ToolMode } from '../core/types'

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
    ],
  },
]

const dimensionTypes: Array<{ value: DimensionType; label: string; icon: IconName; command: string }> = [
  { value: 'linear', label: 'Linear', icon: 'dim-linear', command: 'DIMLINEAR' },
  { value: 'aligned', label: 'Aligned', icon: 'dim-aligned', command: 'DIMALIGNED' },
  { value: 'radial', label: 'Radius', icon: 'dim-radius', command: 'DIMRADIUS' },
  { value: 'diameter', label: 'Diameter', icon: 'dim-diameter', command: 'DIMDIAMETER' },
  { value: 'angular', label: 'Angular', icon: 'dim-angular', command: 'DIMANGULAR' },
]

const hatchPatterns: HatchPattern[] = ['ansi31', 'ansi37', 'dots', 'solid']

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
  const polygonSides = useCadStore((state) => state.polygonSides)
  const setPolygonSides = useCadStore((state) => state.setPolygonSides)
  const polygonFit = useCadStore((state) => state.polygonFit)
  const setPolygonFit = useCadStore((state) => state.setPolygonFit)
  const circleMode = useCadStore((state) => state.circleMode)
  const setCircleMode = useCadStore((state) => state.setCircleMode)
  const dimensionType = useCadStore((state) => state.dimensionType)
  const setDimensionType = useCadStore((state) => state.setDimensionType)
  const dimScale = useCadStore((state) => state.dimScale)
  const setDimScale = useCadStore((state) => state.setDimScale)
  const hatchPattern = useCadStore((state) => state.hatchPattern)
  const setHatchPattern = useCadStore((state) => state.setHatchPattern)
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
            {activeTool === 'circle' && (
              <label className="ribbon-field" title="How the circle is pinned down">
                Circle by
                <select value={circleMode} onChange={(event) => setCircleMode(event.target.value as CircleMode)}>
                  <option value="center">Centre, radius</option>
                  <option value="2p">2 points</option>
                  <option value="3p">3 points</option>
                  <option value="ttr">Tangent, tangent, radius</option>
                </select>
              </label>
            )}
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
            {activeTool === 'polygon' && (
              <label className="ribbon-field" title="Whether the corners or the flats sit on the radius you pick">
                Fit
                <select value={polygonFit} onChange={(event) => setPolygonFit(event.target.value as PolygonFit)}>
                  <option value="inscribed">Inscribed in circle</option>
                  <option value="circumscribed">Circumscribed about circle</option>
                  <option value="edge">By one edge</option>
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
              {hatchPatterns.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {pattern}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`ribbon-btn ${activeTool === 'insert' ? 'active' : ''}`}
            onClick={() => setTool('insert')}
            title={tooltip({ label: 'Insert block', command: 'INSERT' })}
          >
            <Icon name="insert" />
            <span>Insert</span>
          </button>
        </div>
      </section>
    </div>
  )
}
