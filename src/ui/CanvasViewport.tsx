import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type WheelEvent,
} from 'react'
import { applyDrawTool, useCadStore } from '../core/store'
import { applyOrtho, applyPolarTracking, findBestSnap } from '../core/snap'
import { getEntityAnchorPoints, isPointNearEntity } from '../core/geometry'
import type { CadEntity, ToolMode } from '../core/types'
import type { Vec2 } from '../core/math/vec2'

type Camera = { x: number; y: number; zoom: number }

const screenToWorld = (point: Vec2, camera: Camera): Vec2 => ({
  x: (point.x - camera.x) / camera.zoom,
  y: (point.y - camera.y) / camera.zoom,
})

const PROMPTS: Record<ToolMode, string[]> = {
  select: ['Select objects:'],
  line: ['Specify first point:', 'Specify next point:'],
  polyline: ['Specify start point:', 'Specify next point (Enter to finish, C to close):'],
  rect: ['Specify first corner:', 'Specify opposite corner:'],
  circle: ['Specify center point:', 'Specify radius:'],
  arc: ['Specify center point:', 'Specify start point:', 'Specify end point:'],
  ellipse: ['Specify center point:', 'Specify axis endpoint:'],
  polygon: ['Specify center of polygon:', 'Specify radius:'],
  spline: ['Specify first point:', 'Specify next point (Enter to finish):'],
  text: ['Specify text insertion point:'],
  hatch: ['Select closed boundary:'],
  dimension: ['Specify first extension line origin:', 'Specify second extension line origin:'],
  insert: ['Specify insertion point:'],
}

const promptFor = (tool: ToolMode, placed: number): string => {
  const steps = PROMPTS[tool] ?? ['Ready']
  return steps[Math.min(placed, steps.length - 1)]
}

const arcPath = (center: Vec2, radius: number, startAngle: number, endAngle: number): string => {
  const sx = center.x + Math.cos(startAngle) * radius
  const sy = center.y + Math.sin(startAngle) * radius
  const ex = center.x + Math.cos(endAngle) * radius
  const ey = center.y + Math.sin(endAngle) * radius
  let sweep = endAngle - startAngle
  while (sweep < 0) sweep += Math.PI * 2
  const large = sweep > Math.PI ? 1 : 0
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${large} 1 ${ex} ${ey}`
}

const polygonPoints = (center: Vec2, radius: number, sides: number): Vec2[] =>
  Array.from({ length: Math.max(3, sides) }, (_, index) => {
    const angle = (index / Math.max(3, sides)) * Math.PI * 2
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
  })

const entityToSvg = (entity: CadEntity, selected: boolean, color: string, strokeDasharray?: string) => {
  const stroke = selected ? '#ffd166' : color
  const common = {
    stroke,
    strokeWidth: selected ? 2 : 1,
    fill: 'none',
    strokeDasharray,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  switch (entity.type) {
    case 'line':
      return <line key={entity.id} x1={entity.start.x} y1={entity.start.y} x2={entity.end.x} y2={entity.end.y} {...common} />
    case 'circle':
      return <circle key={entity.id} cx={entity.center.x} cy={entity.center.y} r={entity.radius} {...common} />
    case 'arc':
      return <path key={entity.id} d={arcPath(entity.center, entity.radius, entity.startAngle, entity.endAngle)} {...common} />
    case 'ellipse':
      return (
        <ellipse
          key={entity.id}
          cx={entity.center.x}
          cy={entity.center.y}
          rx={entity.rx}
          ry={entity.ry}
          transform={`rotate(${(entity.rotation * 180) / Math.PI} ${entity.center.x} ${entity.center.y})`}
          {...common}
        />
      )
    case 'polyline':
      return entity.closed ? (
        <polygon key={entity.id} points={entity.points.map((point) => `${point.x},${point.y}`).join(' ')} {...common} />
      ) : (
        <polyline key={entity.id} points={entity.points.map((point) => `${point.x},${point.y}`).join(' ')} {...common} />
      )
    case 'spline':
      return (
        <polyline
          key={entity.id}
          points={entity.controlPoints.map((point) => `${point.x},${point.y}`).join(' ')}
          {...common}
        />
      )
    case 'hatch':
      return (
        <polygon
          key={entity.id}
          points={entity.boundary.map((point) => `${point.x},${point.y}`).join(' ')}
          stroke={stroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          fill="rgba(136,192,255,0.18)"
        />
      )
    case 'text':
      return (
        <text key={entity.id} x={entity.position.x} y={entity.position.y} fill="#dbeafe" fontSize={entity.height}>
          {entity.value}
        </text>
      )
    case 'dimension': {
      const label = Math.hypot(entity.p2.x - entity.p1.x, entity.p2.y - entity.p1.y).toFixed(2)
      return (
        <g key={entity.id}>
          <line
            x1={entity.p1.x}
            y1={entity.p1.y}
            x2={entity.p2.x}
            y2={entity.p2.y}
            stroke="#f9c74f"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={(entity.p1.x + entity.p2.x) / 2}
            y={(entity.p1.y + entity.p2.y) / 2 - 4}
            fill="#f9c74f"
            fontSize={10}
            textAnchor="middle"
          >
            {label}
          </text>
        </g>
      )
    }
    case 'insert':
      return (
        <g
          key={entity.id}
          transform={`translate(${entity.position.x}, ${entity.position.y}) rotate(${entity.rotation}) scale(${entity.scale})`}
        >
          <rect x={-5} y={-5} width={10} height={10} stroke="#e5e7eb" strokeWidth={1} fill="none" vectorEffect="non-scaling-stroke" />
          <line x1={-5} y1={-5} x2={5} y2={5} stroke="#e5e7eb" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </g>
      )
  }
}

export function CanvasViewport() {
  const doc = useCadStore((state) => state.doc)
  const selectedIds = useCadStore((state) => state.selectedIds)
  const activeTool = useCadStore((state) => state.activeTool)
  const camera = useCadStore((state) => state.camera)
  const setCamera = useCadStore((state) => state.setCamera)
  const setSelection = useCadStore((state) => state.setSelection)
  const setStatusMessage = useCadStore((state) => state.setStatusMessage)
  const snapModes = useCadStore((state) => state.snapModes)
  const osnapEnabled = useCadStore((state) => state.osnapEnabled)
  const polarEnabled = useCadStore((state) => state.polarEnabled)
  const draftPoints = useCadStore((state) => state.draftPoints)
  const polygonSides = useCadStore((state) => state.polygonSides)
  const finishDraft = useCadStore((state) => state.finishDraft)
  const closeDraft = useCadStore((state) => state.closeDraft)
  const cancelDraft = useCadStore((state) => state.cancelDraft)
  const deleteSelection = useCadStore((state) => state.deleteSelection)

  const frameRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [cursorScreen, setCursorScreen] = useState<Vec2 | null>(null)
  const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null)
  const [snapMode, setSnapMode] = useState<string | null>(null)
  const [orthoHeld, setOrthoHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const [lastMouse, setLastMouse] = useState<Vec2 | null>(null)
  const [size, setSize] = useState({ width: 1000, height: 700 })

  const visibleEntities = useMemo(
    () => doc.entities.filter((entity) => doc.layers.find((layer) => layer.id === entity.layerId)?.visible !== false),
    [doc],
  )

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setSize({ width: Math.max(320, rect.width), height: Math.max(240, rect.height) })
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setOrthoHeld(true)
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.key === 'Escape') cancelDraft()
      if (event.key === 'Enter') finishDraft()
      if (event.key.toLowerCase() === 'c' && draftPoints.length >= 2) closeDraft()
      if (event.key === 'Delete') deleteSelection()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setOrthoHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [cancelDraft, closeDraft, deleteSelection, draftPoints.length, finishDraft])

  const resolvePoint = (screenPoint: Vec2): { point: Vec2; mode: string | null } => {
    const raw = screenToWorld(screenPoint, camera)
    if (osnapEnabled) {
      const snap = findBestSnap(raw, visibleEntities, snapModes, 12 / camera.zoom)
      if (snap) {
        return { point: snap.point, mode: snap.mode }
      }
    }
    const base = draftPoints.at(-1)
    if (!base) {
      return { point: raw, mode: null }
    }
    if (orthoHeld) {
      return { point: applyOrtho(base, raw), mode: 'ortho' }
    }
    if (polarEnabled) {
      const tracked = applyPolarTracking(base, raw, 45)
      if (tracked.snapped) {
        return { point: tracked.point, mode: 'polar' }
      }
    }
    return { point: raw, mode: null }
  }

  const localPoint = (event: MouseEvent): Vec2 => {
    const box = svgRef.current!.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  const handleMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (event.button === 1) {
      event.preventDefault()
      setPanning(true)
      setLastMouse({ x: event.clientX, y: event.clientY })
      return
    }
    if (event.button !== 0) return
    const { point } = resolvePoint(localPoint(event))
    if (activeTool === 'select') {
      const hit = [...visibleEntities].reverse().find((entity) => isPointNearEntity(point, entity, 8 / camera.zoom))
      if (hit) {
        setSelection(event.ctrlKey || event.shiftKey ? [...selectedIds, hit.id] : [hit.id])
        setStatusMessage(`Selected ${hit.type}`)
      } else {
        setSelection([])
      }
      return
    }
    applyDrawTool(point)
  }

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const local = localPoint(event)
    setCursorScreen(local)
    if (panning && lastMouse) {
      setCamera({ x: camera.x + (event.clientX - lastMouse.x), y: camera.y + (event.clientY - lastMouse.y) })
      setLastMouse({ x: event.clientX, y: event.clientY })
      return
    }
    const { point, mode } = resolvePoint(local)
    setCursorWorld(point)
    setSnapMode(mode)
  }

  const handleMouseUp = () => {
    setPanning(false)
    setLastMouse(null)
  }

  const handleMouseLeave = () => {
    setPanning(false)
    setLastMouse(null)
    setCursorScreen(null)
    setCursorWorld(null)
  }

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    const local = localPoint(event)
    const worldBefore = screenToWorld(local, camera)
    const zoom = Math.min(50, Math.max(0.02, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1)))
    setCamera({ zoom, x: local.x - worldBefore.x * zoom, y: local.y - worldBefore.y * zoom })
  }

  const { width, height } = size

  const grid = useMemo(() => {
    const lines: ReactElement[] = []
    let spacing = 10
    let guard = 0
    while (spacing * camera.zoom < 8 && guard < 12) {
      spacing *= 5
      guard += 1
    }
    while (spacing * camera.zoom > 90 && guard < 24) {
      spacing /= 5
      guard += 1
    }
    const topLeft = screenToWorld({ x: 0, y: 0 }, camera)
    const bottomRight = screenToWorld({ x: width, y: height }, camera)
    const startX = Math.floor(topLeft.x / spacing) * spacing
    const endX = Math.ceil(bottomRight.x / spacing) * spacing
    const startY = Math.floor(topLeft.y / spacing) * spacing
    const endY = Math.ceil(bottomRight.y / spacing) * spacing
    const major = spacing * 5

    for (let x = startX; x <= endX; x += spacing) {
      const isMajor = Math.abs(x % major) < spacing / 100
      lines.push(
        <line
          key={`gx-${x}`}
          x1={x}
          y1={startY}
          x2={x}
          y2={endY}
          stroke={isMajor ? 'rgba(148,187,233,0.16)' : 'rgba(148,187,233,0.07)'}
          strokeWidth={isMajor ? 1 : 0.6}
          vectorEffect="non-scaling-stroke"
        />,
      )
    }
    for (let y = startY; y <= endY; y += spacing) {
      const isMajor = Math.abs(y % major) < spacing / 100
      lines.push(
        <line
          key={`gy-${y}`}
          x1={startX}
          y1={y}
          x2={endX}
          y2={y}
          stroke={isMajor ? 'rgba(148,187,233,0.16)' : 'rgba(148,187,233,0.07)'}
          strokeWidth={isMajor ? 1 : 0.6}
          vectorEffect="non-scaling-stroke"
        />,
      )
    }
    return lines
  }, [camera, width, height])

  const preview = useMemo(() => {
    if (!cursorWorld || draftPoints.length === 0) return null
    const style = {
      stroke: '#f59e0b',
      strokeWidth: 1,
      strokeDasharray: '6 4',
      fill: 'none',
      vectorEffect: 'non-scaling-stroke' as const,
    }
    const first = draftPoints[0]
    const last = draftPoints.at(-1)!
    const radius = Math.hypot(cursorWorld.x - first.x, cursorWorld.y - first.y)

    switch (activeTool) {
      case 'line':
      case 'dimension':
        return <line x1={last.x} y1={last.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
      case 'rect':
        return (
          <rect
            x={Math.min(first.x, cursorWorld.x)}
            y={Math.min(first.y, cursorWorld.y)}
            width={Math.abs(cursorWorld.x - first.x)}
            height={Math.abs(cursorWorld.y - first.y)}
            {...style}
          />
        )
      case 'circle':
        return (
          <g>
            <circle cx={first.x} cy={first.y} r={radius} {...style} />
            <line x1={first.x} y1={first.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} strokeDasharray="2 4" />
          </g>
        )
      case 'ellipse':
        return (
          <ellipse
            cx={first.x}
            cy={first.y}
            rx={Math.abs(cursorWorld.x - first.x)}
            ry={Math.abs(cursorWorld.y - first.y)}
            {...style}
          />
        )
      case 'polygon':
        return (
          <polygon points={polygonPoints(first, radius, polygonSides).map((p) => `${p.x},${p.y}`).join(' ')} {...style} />
        )
      case 'arc': {
        if (draftPoints.length === 1) {
          return (
            <g>
              <circle cx={first.x} cy={first.y} r={radius} {...style} strokeDasharray="2 4" />
              <line x1={first.x} y1={first.y} x2={cursorWorld.x} y2={cursorWorld.y} {...style} />
            </g>
          )
        }
        const start = draftPoints[1]
        const arcRadius = Math.hypot(start.x - first.x, start.y - first.y)
        const startAngle = Math.atan2(start.y - first.y, start.x - first.x)
        const endAngle = Math.atan2(cursorWorld.y - first.y, cursorWorld.x - first.x)
        return <path d={arcPath(first, arcRadius, startAngle, endAngle)} {...style} />
      }
      case 'polyline':
      case 'spline':
        return (
          <polyline points={[...draftPoints, cursorWorld].map((p) => `${p.x},${p.y}`).join(' ')} {...style} />
        )
      default:
        return null
    }
  }, [activeTool, cursorWorld, draftPoints, polygonSides])

  const dynamicInput = useMemo(() => {
    if (!cursorWorld || draftPoints.length === 0) return null
    const first = draftPoints[0]
    const last = draftPoints.at(-1)!
    const radius = Math.hypot(cursorWorld.x - first.x, cursorWorld.y - first.y)
    const length = Math.hypot(cursorWorld.x - last.x, cursorWorld.y - last.y)
    const angle = (Math.atan2(cursorWorld.y - last.y, cursorWorld.x - last.x) * 180) / Math.PI
    if (activeTool === 'circle' || activeTool === 'polygon') return `R ${radius.toFixed(2)}`
    if (activeTool === 'rect') {
      return `${Math.abs(cursorWorld.x - first.x).toFixed(2)} x ${Math.abs(cursorWorld.y - first.y).toFixed(2)}`
    }
    if (activeTool === 'ellipse') {
      return `RX ${Math.abs(cursorWorld.x - first.x).toFixed(2)}  RY ${Math.abs(cursorWorld.y - first.y).toFixed(2)}`
    }
    return `${length.toFixed(2)} < ${((angle + 360) % 360).toFixed(1)}°`
  }, [activeTool, cursorWorld, draftPoints])

  const grips = useMemo(() => {
    if (selectedIds.length === 0) return []
    const size = 4 / camera.zoom
    return visibleEntities
      .filter((entity) => selectedIds.includes(entity.id))
      .flatMap((entity) =>
        getEntityAnchorPoints(entity).map((point, index) => (
          <rect
            key={`${entity.id}-grip-${index}`}
            x={point.x - size / 2}
            y={point.y - size / 2}
            width={size}
            height={size}
            fill="#38bdf8"
            stroke="#0b1220"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        )),
      )
  }, [camera.zoom, selectedIds, visibleEntities])

  const prompt = promptFor(activeTool, draftPoints.length)

  return (
    <div className="viewport-shell" ref={frameRef}>
      <svg
        ref={svgRef}
        className="viewport"
        viewBox={`0 0 ${width} ${height}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={(event) => {
          event.preventDefault()
          finishDraft()
        }}
      >
        <rect x={0} y={0} width={width} height={height} fill="#0d1524" />

        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
          {grid}
          <line x1={-1e5} y1={0} x2={1e5} y2={0} stroke="rgba(239,68,68,0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={-1e5} x2={0} y2={1e5} stroke="rgba(34,197,94,0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />

          {visibleEntities.map((entity) => {
            const layer = doc.layers.find((candidate) => candidate.id === entity.layerId)
            const linetypeId = entity.linetypeId ?? layer?.linetypeId
            const linetype = doc.linetypes.find((candidate) => candidate.id === linetypeId)
            const dash = linetype?.pattern.length ? linetype.pattern.join(' ') : undefined
            return entityToSvg(entity, selectedIds.includes(entity.id), entity.color ?? layer?.color ?? '#7cc6ff', dash)
          })}

          {grips}
          {preview}
        </g>

        {cursorScreen && (
          <g pointerEvents="none">
            <line x1={0} y1={cursorScreen.y} x2={width} y2={cursorScreen.y} stroke="rgba(226,232,240,0.35)" strokeWidth={1} />
            <line x1={cursorScreen.x} y1={0} x2={cursorScreen.x} y2={height} stroke="rgba(226,232,240,0.35)" strokeWidth={1} />
            <rect
              x={cursorScreen.x - 5}
              y={cursorScreen.y - 5}
              width={10}
              height={10}
              fill="none"
              stroke="rgba(226,232,240,0.6)"
              strokeWidth={1}
            />
            {snapMode && (
              <>
                <rect
                  x={cursorScreen.x - 8}
                  y={cursorScreen.y - 8}
                  width={16}
                  height={16}
                  fill="none"
                  stroke="#00f5d4"
                  strokeWidth={1.5}
                />
                <text x={cursorScreen.x + 14} y={cursorScreen.y - 12} fill="#00f5d4" fontSize={11}>
                  {snapMode}
                </text>
              </>
            )}
            {dynamicInput && (
              <text x={cursorScreen.x + 14} y={cursorScreen.y + 20} fill="#fbbf24" fontSize={12}>
                {dynamicInput}
              </text>
            )}
          </g>
        )}
      </svg>

      <div className="viewport-status">
        <span className="prompt">{prompt}</span>
        {cursorWorld && (
          <span className="coords">
            X {cursorWorld.x.toFixed(2)} Y {cursorWorld.y.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}
