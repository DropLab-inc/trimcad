import type { ReactElement } from 'react'
import { angularSweep, makeDimensionLabel, polar } from '../core/geometry'
import { add, mul, normalize, sub, type Vec2 } from '../core/math/vec2'
import type { CadEntity, DimensionEntity, DimStyle, HatchPattern } from '../core/types'

export const HATCH_PATTERNS: HatchPattern[] = ['ansi31', 'ansi37', 'dots', 'solid']

const hatchFill = (pattern: HatchPattern = 'ansi31'): string =>
  pattern === 'solid' ? 'rgba(136,192,255,0.35)' : `url(#hatch-${pattern})`

const arcPath = (center: Vec2, radius: number, startAngle: number, endAngle: number): string => {
  const start = polar(center, radius, startAngle)
  const end = polar(center, radius, endAngle)
  let sweep = endAngle - startAngle
  while (sweep < 0) sweep += Math.PI * 2
  const large = sweep > Math.PI ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`
}

const perpendicular = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x })

export type DimensionGeometry = {
  extensions: Array<{ a: Vec2; b: Vec2 }>
  line: { a: Vec2; b: Vec2 } | null
  arc: { center: Vec2; radius: number; start: number; end: number } | null
  textPosition: Vec2
  textAngleDeg: number
  arrows: Array<{ tip: Vec2; angle: number }>
}

/**
 * Resolves the drawn geometry for a dimension. `placement` is the point the user picked for the
 * dimension line, which is what makes dimensions behave like AutoCAD rather than a bare line.
 */
export const dimensionGeometry = (dimension: DimensionEntity): DimensionGeometry => {
  const placement = dimension.placement ?? dimension.p2
  const empty: DimensionGeometry = {
    extensions: [],
    line: null,
    arc: null,
    textPosition: placement,
    textAngleDeg: 0,
    arrows: [],
  }

  if (dimension.dimType === 'linear') {
    const dx = Math.abs(dimension.p2.x - dimension.p1.x)
    const dy = Math.abs(dimension.p2.y - dimension.p1.y)
    const horizontal = dx >= dy
    const a = horizontal ? { x: dimension.p1.x, y: placement.y } : { x: placement.x, y: dimension.p1.y }
    const b = horizontal ? { x: dimension.p2.x, y: placement.y } : { x: placement.x, y: dimension.p2.y }
    return {
      extensions: [
        { a: dimension.p1, b: a },
        { a: dimension.p2, b },
      ],
      line: { a, b },
      arc: null,
      textPosition: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      textAngleDeg: horizontal ? 0 : -90,
      arrows: [
        { tip: a, angle: Math.atan2(b.y - a.y, b.x - a.x) },
        { tip: b, angle: Math.atan2(a.y - b.y, a.x - b.x) },
      ],
    }
  }

  if (dimension.dimType === 'aligned') {
    const direction = normalize(sub(dimension.p2, dimension.p1))
    if (Number.isNaN(direction.x)) return empty
    const normal = perpendicular(direction)
    const offset = (placement.x - dimension.p1.x) * normal.x + (placement.y - dimension.p1.y) * normal.y
    const a = add(dimension.p1, mul(normal, offset))
    const b = add(dimension.p2, mul(normal, offset))
    return {
      extensions: [
        { a: dimension.p1, b: a },
        { a: dimension.p2, b },
      ],
      line: { a, b },
      arc: null,
      textPosition: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      textAngleDeg: (Math.atan2(direction.y, direction.x) * 180) / Math.PI,
      arrows: [
        { tip: a, angle: Math.atan2(b.y - a.y, b.x - a.x) },
        { tip: b, angle: Math.atan2(a.y - b.y, a.x - b.x) },
      ],
    }
  }

  if (dimension.dimType === 'radial' || dimension.dimType === 'diameter') {
    const radius = Math.hypot(dimension.p2.x - dimension.p1.x, dimension.p2.y - dimension.p1.y)
    const towards = sub(placement, dimension.p1)
    const direction = Math.hypot(towards.x, towards.y) < 1e-9 ? { x: 1, y: 0 } : normalize(towards)
    const edge = add(dimension.p1, mul(direction, radius))
    const start = dimension.dimType === 'diameter' ? add(dimension.p1, mul(direction, -radius)) : dimension.p1
    const angle = Math.atan2(direction.y, direction.x)
    return {
      extensions: [],
      line: { a: start, b: edge },
      arc: null,
      textPosition: add(edge, mul(direction, 2)),
      textAngleDeg: (angle * 180) / Math.PI,
      arrows:
        dimension.dimType === 'diameter'
          ? [
              { tip: edge, angle: angle + Math.PI },
              { tip: start, angle },
            ]
          : [{ tip: edge, angle: angle + Math.PI }],
    }
  }

  if (dimension.dimType === 'angular' && dimension.p3) {
    const vertex = dimension.p1
    const radius = Math.max(1, Math.hypot(placement.x - vertex.x, placement.y - vertex.y))
    const startAngle = Math.atan2(dimension.p2.y - vertex.y, dimension.p2.x - vertex.x)
    const sweep = angularSweep(vertex, dimension.p2, dimension.p3)
    const endAngle = startAngle + sweep
    const midAngle = startAngle + sweep / 2
    return {
      extensions: [
        { a: vertex, b: polar(vertex, radius * 1.1, startAngle) },
        { a: vertex, b: polar(vertex, radius * 1.1, endAngle) },
      ],
      line: null,
      arc: {
        center: vertex,
        radius,
        start: sweep >= 0 ? startAngle : endAngle,
        end: sweep >= 0 ? endAngle : startAngle,
      },
      textPosition: polar(vertex, radius, midAngle),
      textAngleDeg: 0,
      arrows: [
        { tip: polar(vertex, radius, startAngle), angle: startAngle + Math.PI / 2 },
        { tip: polar(vertex, radius, endAngle), angle: endAngle - Math.PI / 2 },
      ],
    }
  }

  return empty
}

const arrowPoints = (tip: Vec2, angle: number, size: number): string => {
  const back = polar(tip, size, angle)
  const spread = size * 0.32
  const left = { x: back.x - Math.sin(angle) * spread, y: back.y + Math.cos(angle) * spread }
  const right = { x: back.x + Math.sin(angle) * spread, y: back.y - Math.cos(angle) * spread }
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`
}

export const renderDimension = (
  dimension: DimensionEntity,
  dimStyle: DimStyle,
  color: string,
  key?: string,
  preview = false,
): ReactElement => {
  const geometry = dimensionGeometry(dimension)
  const label = makeDimensionLabel(dimension, dimStyle.precision, dimStyle.suffix)
  const stroke = preview ? '#f59e0b' : color
  const dash = preview ? '6 4' : undefined
  let textAngle = geometry.textAngleDeg
  if (textAngle > 90 || textAngle < -90) textAngle += 180

  return (
    <g key={key}>
      {geometry.extensions.map((extension, index) => (
        <line
          key={`ext-${index}`}
          x1={extension.a.x}
          y1={extension.a.y}
          x2={extension.b.x}
          y2={extension.b.y}
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {geometry.line && (
        <line
          x1={geometry.line.a.x}
          y1={geometry.line.a.y}
          x2={geometry.line.b.x}
          y2={geometry.line.b.y}
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {geometry.arc && (
        <path
          d={arcPath(geometry.arc.center, geometry.arc.radius, geometry.arc.start, geometry.arc.end)}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {geometry.arrows.map((arrow, index) => (
        <polygon key={`arrow-${index}`} points={arrowPoints(arrow.tip, arrow.angle, dimStyle.arrowSize)} fill={stroke} />
      ))}
      <text
        transform={`translate(${geometry.textPosition.x}, ${geometry.textPosition.y}) rotate(${textAngle})`}
        dy={-dimStyle.textHeight * 0.35}
        textAnchor="middle"
        fill={stroke}
        fontSize={dimStyle.textHeight}
      >
        {label}
      </text>
    </g>
  )
}

export const renderEntity = (
  entity: CadEntity,
  options: { selected: boolean; color: string; dash?: string; dimStyle: DimStyle; width?: number },
): ReactElement | null => {
  const { selected, color, dash, dimStyle, width } = options
  const stroke = selected ? '#ffd166' : color
  const common = {
    stroke,
    strokeWidth: width ?? (selected ? 2 : 1),
    fill: 'none',
    strokeDasharray: dash,
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
      return <path key={entity.id} d={splinePath(entity.controlPoints)} {...common} />
    case 'hatch':
      return (
        <polygon
          key={entity.id}
          points={entity.boundary.map((point) => `${point.x},${point.y}`).join(' ')}
          fill={hatchFill(entity.pattern)}
          stroke={selected ? '#ffd166' : 'none'}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )
    case 'text':
      return (
        <text key={entity.id} x={entity.position.x} y={entity.position.y} fill={stroke} fontSize={entity.height}>
          {entity.value}
        </text>
      )
    case 'dimension':
      return renderDimension(entity, dimStyle, selected ? '#ffd166' : '#f9c74f', entity.id)
    case 'insert':
      return (
        <g
          key={entity.id}
          transform={`translate(${entity.position.x}, ${entity.position.y}) rotate(${(entity.rotation * 180) / Math.PI}) scale(${entity.scale})`}
        >
          <rect x={-5} y={-5} width={10} height={10} {...common} />
          <line x1={-5} y1={-5} x2={5} y2={5} {...common} />
        </g>
      )
    default:
      return null
  }
}

/** Catmull-Rom through the control points, converted to cubic Beziers so splines look curved. */
export const splinePath = (points: Vec2[]): string => {
  if (points.length < 2) return ''
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`

  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    path += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`
  }
  return path
}
