import { useCadStore } from '../core/store'
import type { ToolMode } from '../core/types'

const tools: ToolMode[] = [
  'select',
  'line',
  'polyline',
  'rect',
  'circle',
  'arc',
  'ellipse',
  'polygon',
  'spline',
  'text',
  'hatch',
  'dimension',
  'insert',
]

export function Toolbar() {
  const activeTool = useCadStore((state) => state.activeTool)
  const setTool = useCadStore((state) => state.setTool)
  return (
    <div className="toolbar">
      {tools.map((tool) => (
        <button
          key={tool}
          type="button"
          className={tool === activeTool ? 'active' : ''}
          onClick={() => setTool(tool)}
          title={tool.toUpperCase()}
        >
          {tool.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
