import { useCadStore } from '../core/store'
import type { ToolMode } from '../core/types'

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
  {
    title: 'Annotate',
    items: [
      { tool: 'dimension', label: 'Dim' },
      { tool: 'text', label: 'Text' },
      { tool: 'hatch', label: 'Hatch' },
    ],
  },
  {
    title: 'Blocks',
    items: [{ tool: 'insert', label: 'Insert' }],
  },
]

export function Toolbar() {
  const activeTool = useCadStore((state) => state.activeTool)
  const setTool = useCadStore((state) => state.setTool)
  const polygonSides = useCadStore((state) => state.polygonSides)
  const setPolygonSides = useCadStore((state) => state.setPolygonSides)
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
            {group.title === 'Draw' && (
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
          </div>
        </section>
      ))}
    </div>
  )
}
