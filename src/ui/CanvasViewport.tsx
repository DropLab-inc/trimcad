import { useMemo, useRef, useState, type MouseEvent, type ReactElement, type WheelEvent } from 'react'
import { applyDrawTool, useCadStore } from '../core/store'
import { findBestSnap } from '../core/snap'
import { isPointNearEntity } from '../core/geometry'
import type { CadEntity } from '../core/types'
import type { Vec2 } from '../core/math/vec2'

const screenToWorld = (point: Vec2, camera: { x: number; y: number; zoom: number }): Vec2 => ({
  x: (point.x - camera.x) / camera.zoom,
  y: (point.y - camera.y) / camera.zoom,
})

const entityToSvg = (entity: CadEntity, selected: boolean, strokeDasharray?: string) => {
  const stroke = selected ? '#ffd166' : '#7cc6ff'
  const common = { stroke, strokeWidth: selected ? 2 : 1, fill: 'none', strokeDasharray }
  switch (entity.type) {
    case 'line':
      return <line key={entity.id} x1={entity.start.x} y1={entity.start.y} x2={entity.end.x} y2={entity.end.y} {...common} />
    case 'circle':
      return <circle key={entity.id} cx={entity.center.x} cy={entity.center.y} r={entity.radius} {...common} />
    case 'arc': {
      const sx = entity.center.x + Math.cos(entity.startAngle) * entity.radius
      const sy = entity.center.y + Math.sin(entity.startAngle) * entity.radius
      const ex = entity.center.x + Math.cos(entity.endAngle) * entity.radius
      const ey = entity.center.y + Math.sin(entity.endAngle) * entity.radius
      const large = Math.abs(entity.endAngle - entity.startAngle) > Math.PI ? 1 : 0
      return <path key={entity.id} d={`M ${sx} ${sy} A ${entity.radius} ${entity.radius} 0 ${large} 1 ${ex} ${ey}`} {...common} />
    }
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
      return (
        <polyline
          key={entity.id}
          points={entity.points.map((point) => `${point.x},${point.y}`).join(' ')}
          {...common}
          fill={entity.closed ? 'rgba(124,198,255,0.05)' : 'none'}
        />
      )
    case 'spline':
      return (
        <polyline
          key={entity.id}
          points={entity.controlPoints.map((point) => `${point.x},${point.y}`).join(' ')}
          {...common}
          strokeDasharray="4 2"
        />
      )
    case 'hatch':
      return (
        <polygon
          key={entity.id}
          points={entity.boundary.map((point) => `${point.x},${point.y}`).join(' ')}
          stroke="#88c0ff"
          strokeWidth={1}
          fill="rgba(136,192,255,0.2)"
        />
      )
    case 'text':
      return (
        <text key={entity.id} x={entity.position.x} y={entity.position.y} fill="#dbeafe" fontSize={entity.height}>
          {entity.value}
        </text>
      )
    case 'dimension':
      return (
        <g key={entity.id}>
          <line x1={entity.p1.x} y1={entity.p1.y} x2={entity.p2.x} y2={entity.p2.y} stroke="#f9c74f" strokeWidth={1} />
        </g>
      )
    case 'insert':
      return (
        <g key={entity.id} transform={`translate(${entity.position.x}, ${entity.position.y}) rotate(${entity.rotation}) scale(${entity.scale})`}>
          <rect x={-5} y={-5} width={10} height={10} stroke="#e5e7eb" strokeWidth={1} fill="none" />
          <line x1={-5} y1={-5} x2={5} y2={5} stroke="#e5e7eb" strokeWidth={1} />
        </g>
      )
  }
}

export function CanvasViewport() {
  const {
    doc,
    selectedIds,
    activeTool,
    camera,
    setCamera,
    setSelection,
    statusMessage,
    setStatusMessage,
    snapModes,
    osnapEnabled,
    polarEnabled,
    draftPoints,
  } = useCadStore()
  const ref = useRef<SVGSVGElement | null>(null)
  const [snapPoint, setSnapPoint] = useState<Vec2 | null>(null)
  const [dragging, setDragging] = useState(false)
  const [lastMouse, setLastMouse] = useState<Vec2 | null>(null)
  const visibleEntities = useMemo(
    () => doc.entities.filter((entity) => doc.layers.find((layer) => layer.id === entity.layerId)?.visible !== false),
    [doc],
  )

  const pickPoint = (event: MouseEvent): Vec2 => {
    const box = ref.current!.getBoundingClientRect()
    const screenPoint = { x: event.clientX - box.left, y: event.clientY - box.top }
    const worldPoint = screenToWorld(screenPoint, camera)
    if (!osnapEnabled) return worldPoint
    const snap = findBestSnap(worldPoint, visibleEntities, snapModes, 12 / camera.zoom)
    if (!snap) return worldPoint
    return snap.point
  }

  const handleMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (event.button === 1 || event.shiftKey) {
      setDragging(true)
      setLastMouse({ x: event.clientX, y: event.clientY })
      return
    }
    const point = pickPoint(event)
    if (activeTool === 'select') {
      const hit = [...visibleEntities].reverse().find((entity) => isPointNearEntity(point, entity, 8 / camera.zoom))
      if (hit) {
        setSelection([hit.id])
        setStatusMessage(`Selected ${hit.type}`)
      } else {
        setSelection([])
      }
      return
    }
    applyDrawTool(point)
  }

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (dragging && lastMouse) {
      const dx = event.clientX - lastMouse.x
      const dy = event.clientY - lastMouse.y
      setCamera({ x: camera.x + dx, y: camera.y + dy })
      setLastMouse({ x: event.clientX, y: event.clientY })
      return
    }
    const point = pickPoint(event)
    if (polarEnabled && draftPoints.length > 0) {
      const base = draftPoints.at(-1)!
      const angle = Math.atan2(point.y - base.y, point.x - base.x)
      const increment = Math.PI / 4
      const snapped = Math.round(angle / increment) * increment
      const distanceValue = Math.hypot(point.x - base.x, point.y - base.y)
      setSnapPoint({ x: base.x + Math.cos(snapped) * distanceValue, y: base.y + Math.sin(snapped) * distanceValue })
    } else {
      setSnapPoint(point)
    }
  }

  const handleMouseUp = () => {
    setDragging(false)
    setLastMouse(null)
  }

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const box = ref.current!.getBoundingClientRect()
    const mouse = { x: event.clientX - box.left, y: event.clientY - box.top }
    const worldBefore = screenToWorld(mouse, camera)
    const nextZoom = Math.min(20, Math.max(0.05, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1)))
    const nextCamera = {
      zoom: nextZoom,
      x: mouse.x - worldBefore.x * nextZoom,
      y: mouse.y - worldBefore.y * nextZoom,
    }
    setCamera(nextCamera)
  }

  const width = 1200
  const height = 800
  const spacing = 25
  const grid: ReactElement[] = []
  for (let x = -2000; x <= 2000; x += spacing) {
    grid.push(<line key={`gx-${x}`} x1={x} y1={-2000} x2={x} y2={2000} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />)
  }
  for (let y = -2000; y <= 2000; y += spacing) {
    grid.push(<line key={`gy-${y}`} x1={-2000} y1={y} x2={2000} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />)
  }

  return (
    <div className="viewport-shell">
      <svg
        ref={ref}
        className="viewport"
        viewBox={`0 0 ${width} ${height}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <rect x={0} y={0} width={width} height={height} fill="#101826" />
        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
          {grid}
          {visibleEntities.map((entity) => {
            const layer = doc.layers.find((candidate) => candidate.id === entity.layerId)
            const linetypeId = entity.linetypeId ?? layer?.linetypeId
            const linetype = doc.linetypes.find((candidate) => candidate.id === linetypeId)
            const dash = linetype?.pattern.length ? linetype.pattern.join(' ') : undefined
            return entityToSvg(entity, selectedIds.includes(entity.id), dash)
          })}
          {draftPoints.length > 0 && (
            <polyline
              points={draftPoints.map((point) => `${point.x},${point.y}`).join(' ')}
              stroke="#ffaa00"
              strokeDasharray="4 3"
              fill="none"
            />
          )}
          {snapPoint && <circle cx={snapPoint.x} cy={snapPoint.y} r={3 / camera.zoom} fill="#00f5d4" />}
        </g>
      </svg>
      <div className="viewport-status">{statusMessage}</div>
    </div>
  )
}
