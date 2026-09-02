import { useCadStore } from '../core/store'
import type { DimensionType, HatchPattern, ToolMode } from '../core/types'

type ToolGroup = {
  title: string
  items: Array<{ tool: ToolMode; label: string }>
}

const groups: ToolGroup[] = [
  {
    title: 'Draw',
    items: [
      { tool: 'line', label: 'Line' },
      { tool: 'polyline', label: 'PLine' },
      { tool: 'rect', label: 'Rect' },
      { tool: 'circle', label: 'Circle' },
      { tool: 'arc', label: 'Arc' },
      { tool: 'ellipse', label: 'Ellipse' },
      { tool: 'polygon', label: 'Polygon' },
      { tool: 'spline', label: 'Spline' },
    ],
  },
]

const dimensionTypes: Array<{ value: DimensionType; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'aligned', label: 'Aligned' },
  { value: 'radial', label: 'Radius' },
  { value: 'diameter', label: 'Diameter' },
  { value: 'angular', label: 'Angular' },
]

const hatchPatterns: HatchPattern[] = ['ansi31', 'ansi37', 'dots', 'solid']

export function Toolbar() {
  const activeTool = useCadStore((state) => state.activeTool)
  const setTool = useCadStore((state) => state.setTool)
  const polygonSides = useCadStore((state) => state.polygonSides)
  const setPolygonSides = useCadStore((state) => state.setPolygonSides)
  const dimensionType = useCadStore((state) => state.dimensionType)
  const setDimensionType = useCadStore((state) => state.setDimensionType)
  const hatchPattern = useCadStore((state) => state.hatchPattern)
  const setHatchPattern = useCadStore((state) => state.setHatchPattern)

  return (
    <div className="toolbar-ribbon">
      <button
        type="button"
        className={`ribbon-btn ribbon-select ${activeTool === 'select' ? 'active' : ''}`}
        onClick={() => setTool('select')}
        title="Select"
      >
        Select
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
                title={item.tool.toUpperCase()}
              >
                {item.label}
              </button>
            ))}
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
          </div>
        </section>
      ))}

      <section className="toolbar-group">
        <h2>Dimension</h2>
        <div className="toolbar">
          {dimensionTypes.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`ribbon-btn ${activeTool === 'dimension' && dimensionType === item.value ? 'active' : ''}`}
              onClick={() => setDimensionType(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="toolbar-group">
        <h2>Annotate</h2>
        <div className="toolbar">
          <button
            type="button"
            className={`ribbon-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setTool('text')}
          >
            Text
          </button>
          <button
            type="button"
            className={`ribbon-btn ${activeTool === 'hatch' ? 'active' : ''}`}
            onClick={() => setTool('hatch')}
          >
            Hatch
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
          >
            Insert
          </button>
        </div>
      </section>
    </div>
  )
}
