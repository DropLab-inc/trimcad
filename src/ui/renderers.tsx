import type { ReactElement } from 'react'
import { angularSweep, makeDimensionLabel, polar } from '../core/geometry'
import { distance } from '../core/math/vec2'
import { hatchBaseAngle, hatchFamily, hatchTileSize, HATCH_PATTERNS as PATTERN_LIST, type HatchFamily } from '../core/hatch'
import { add, mul, normalize, sub, type Vec2 } from '../core/math/vec2'
import { effectiveStyleFor, faceOf, textLinesOf } from '../core/text'
import type {
  BlockDefinition,
  CadEntity,
  DimensionEntity,
  DimStyle,
  HatchEntity,
  HatchPattern,
  LeaderEntity,
  MTextEntity,
  ToleranceEntity,
  TextEntity,
  TextStyle,
} from '../core/types'
import type { CanvasPalette } from './theme'

export const HATCH_PATTERNS: HatchPattern[] = PATTERN_LIST

/**
 * How a style's font is drawn on the canvas.
 *
 * Every face here can also be PLOTTED — jsPDF's built-ins directly, the shipped files embedded into the
 * PDF from the same TTF the page loads — so a drawing's typography is the same on screen and on paper,
 * and a paragraph wraps from the widths the plot draws it with. See src/core/textMetrics.ts.
 */
export const cssFont = (font: string): { fontFamily: string; fontWeight: string; fontStyle: string } => {
  const face = faceOf(font)
  return { fontFamily: face.cssStack, fontWeight: face.cssWeight, fontStyle: face.cssStyle }
}

/**
 * The transform a text object is drawn under, as one string.
 *
 * Width factor and oblique angle are style properties in AutoCAD, and both are a shape change rather
 * than a placement, so they belong here with the rotation — the line positions stay in text units and
 * one transform carries all three. `skewX` takes the angle negated because drawing y runs down: the
 * top of the letters is what leans to the right for a positive oblique angle.
 */
const textTransform = (entity: { position: Vec2; rotation?: number }, style: TextStyle): string => {
  const parts = [`translate(${entity.position.x} ${entity.position.y})`]
  if (entity.rotation) parts.push(`rotate(${entity.rotation})`)
  if (style.widthFactor !== 1) parts.push(`scale(${style.widthFactor} 1)`)
  if (style.obliqueAngle) parts.push(`skewX(${-style.obliqueAngle})`)
  return parts.join(' ')
}

/** Draws a single line of text or a paragraph, in the style the drawing gives it. */
const renderText = (
  entity: TextEntity | MTextEntity,
  stroke: string,
  textStyles: TextStyle[],
): ReactElement => {
  const style = effectiveStyleFor({ textStyles }, entity)
  const { lines, placement } = textLinesOf(entity, style)

  return (
    <text
      key={entity.id}
      transform={textTransform(entity, style)}
      fill={stroke}
      fontSize={entity.height}
      {...cssFont(style.font)}
    >
      {lines.map((line, index) => (
        <tspan key={`${entity.id}-line-${index}`} x={placement.starts[index].x} y={placement.starts[index].y}>
          {/* An empty paragraph still takes a line, and a space keeps its row in the layout. */}
          {line === '' ? ' ' : line}
        </tspan>
      ))}
    </text>
  )
}


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
 * How much a dimension enlarges the drawing's dimension style. Dimensions drawn before the size
 * was adjustable have none, and must keep measuring the same as they always did.
 */
export const dimensionScale = (dimension: DimensionEntity): number =>
  dimension.scale && dimension.scale > 0 ? dimension.scale : 1

/**
 * Resolves the drawn geometry for a dimension. `placement` is the point the user picked for the
 * dimension line, which is what makes dimensions behave like AutoCAD rather than a bare line.
 */
export const dimensionGeometry = (dimension: DimensionEntity): DimensionGeometry => {
  const placement = dimension.placement ?? dimension.p2
  const scale = dimensionScale(dimension)
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
      // The label sits just beyond the leader, so the gap has to grow with the text.
      textPosition: add(edge, mul(direction, 2 * scale)),
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

  if (dimension.dimType === 'ordinate') {
    // AutoCAD's ordinate has no dimension line: a leader runs from the feature along ONE axis and the
    // value sits at its end. The axis follows the leader's own direction when it was not forced.
    const along = dimension.ordinateAxis
      ? dimension.ordinateAxis
      : Math.abs(placement.x - dimension.p1.x) >= Math.abs(placement.y - dimension.p1.y)
        ? 'x'
        : 'y'
    const end = along === 'x' ? { x: placement.x, y: dimension.p1.y } : { x: dimension.p1.x, y: placement.y }
    return {
      extensions: [],
      line: { a: dimension.p1, b: end },
      arc: null,
      textPosition: end,
      textAngleDeg: 0,
      arrows: [],
    }
  }

  if (dimension.dimType === 'jogged') {
    // A radius whose line is broken by a jog: centre (possibly an override), bend, then the arc's
    // edge. The value reads from the TRUE centre to the arc, so p1 stays the arc's centre.
    const radius = Math.max(1, distance(dimension.p1, dimension.p2))
    const toPlacement = sub(placement, dimension.p1)
    const direction = Math.hypot(toPlacement.x, toPlacement.y) < 1e-9 ? { x: 1, y: 0 } : normalize(toPlacement)
    const edge = add(dimension.p1, mul(direction, radius))
    const angle = Math.atan2(direction.y, direction.x)
    // The jog sits halfway out the leader, bent to the side; its radius is the one the user gave.
    const jogCentre = add(dimension.p1, mul(direction, radius * 0.6))
    const jogR = Math.min(dimension.jogRadius ?? radius * 0.25, radius * 0.45)
    return {
      extensions: [],
      line: { a: dimension.p1, b: edge },
      arc: { center: jogCentre, radius: jogR, start: angle + Math.PI * 0.75, end: angle + Math.PI * 1.35 },
      textPosition: add(edge, mul(direction, 2 * scale)),
      textAngleDeg: (angle * 180) / Math.PI,
      arrows: [{ tip: edge, angle: angle + Math.PI }],
    }
  }

  if (dimension.dimType === 'arclength' && dimension.p3) {
    // An arc along the measured arc itself, offset out to where the user placed the dimension.
    const centre = dimension.p1
    const radius = Math.max(1, distance(centre, dimension.p2))
    const startAngle = Math.atan2(dimension.p2.y - centre.y, dimension.p2.x - centre.x)
    const endAngle = Math.atan2(dimension.p3.y - centre.y, dimension.p3.x - centre.x)
    let sweep = endAngle - startAngle
    while (sweep <= -Math.PI) sweep += Math.PI * 2
    while (sweep > Math.PI) sweep -= Math.PI * 2
    const midAngle = startAngle + sweep / 2
    // How far out the dimension arc sits: the placement's distance from the centre, clamped inside.
    const outRadius = Math.max(radius * 1.1, Math.min(distance(centre, placement), radius * 2.5))
    return {
      extensions: [
        { a: polar(centre, radius, startAngle), b: polar(centre, outRadius, startAngle) },
        { a: polar(centre, radius, endAngle), b: polar(centre, outRadius, endAngle) },
      ],
      line: null,
      arc: { center: centre, radius: outRadius, start: sweep >= 0 ? startAngle : endAngle, end: sweep >= 0 ? endAngle : startAngle },
      textPosition: polar(centre, (radius + outRadius) / 2, midAngle),
      textAngleDeg: (midAngle * 180) / Math.PI,
      arrows: [
        { tip: polar(centre, outRadius, startAngle), angle: startAngle + (sweep >= 0 ? -Math.PI / 2 : Math.PI / 2) },
        { tip: polar(centre, outRadius, endAngle), angle: endAngle + (sweep >= 0 ? Math.PI / 2 : -Math.PI / 2) },
      ],
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
  const scale = dimensionScale(dimension)
  const textHeight = dimStyle.textHeight * scale
  const arrowSize = dimStyle.arrowSize * scale
  const stroke = color
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
        <polygon key={`arrow-${index}`} points={arrowPoints(arrow.tip, arrow.angle, arrowSize)} fill={stroke} />
      ))}
      <text
        transform={`translate(${geometry.textPosition.x}, ${geometry.textPosition.y}) rotate(${textAngle})`}
        dy={-textHeight * 0.35}
        textAnchor="middle"
        fill={stroke}
        fontSize={textHeight}
      >
        {label}
      </text>
    </g>
  )
}

/**
 * AutoCAD's leader: the arrow lands on the object, the landing runs to the hook, and the words sit
 * beside the hook. The whole shape is two segments, so it draws the same in model space and on paper.
 */
export const renderLeader = (
  leader: LeaderEntity,
  color: string,
  key?: string,
  preview = false,
): ReactElement => {
  const stroke = color
  const dash = preview ? '6 4' : undefined
  const textHeight = leader.height
  const hook = 3.5 * (leader.height / 2.5)
  const direction = normalize(sub(leader.landingEnd, leader.arrow))
  // The landing is horizontal in AutoCAD's default style; the hook is the short rise to the text.
  const hooked = { x: leader.landingEnd.x, y: leader.landingEnd.y + hook }
  const anchorRight = leader.flipped ? leader.landingEnd.x < leader.arrow.x : leader.landingEnd.x >= leader.arrow.x

  return (
    <g key={key}>
      <line
        x1={leader.arrow.x}
        y1={leader.arrow.y}
        x2={leader.landingEnd.x}
        y2={leader.landingEnd.y}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={leader.landingEnd.x}
        y1={leader.landingEnd.y}
        x2={hooked.x}
        y2={hooked.y}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
      />
      <polygon points={arrowPoints(leader.arrow, Math.atan2(direction.y, direction.x) + Math.PI, textHeight * 0.6)} fill={stroke} />
      <text
        transform={`translate(${leader.landingEnd.x + (anchorRight ? textHeight * 0.4 : -textHeight * 0.4)}, ${hooked.y})`}
        dy={-textHeight * 0.35}
        textAnchor={anchorRight ? 'start' : 'end'}
        fill={stroke}
        fontSize={textHeight}
      >
        {leader.value}
      </text>
    </g>
  )
}

/**
 * AutoCAD's tolerance frame: boxed compartments, the geometric symbol in the first, the value and
 * then the datum references. The symbol set is the small round of shapes a drawing actually uses.
 */
export const renderTolerance = (
  tolerance: ToleranceEntity,
  color: string,
  key?: string,
  preview = false,
): ReactElement => {
  const stroke = color
  const dash = preview ? '6 4' : undefined
  const h = tolerance.height
  const compartments = [
    tolerance.symbol ? { text: gdtSymbol(tolerance.symbol), w: h * 1.4 } : null,
    { text: tolerance.value, w: Math.max(h * 1.6, h * 0.85 * Math.max(1, tolerance.value.length)) },
    ...tolerance.datums.map((datum) => ({ text: datum, w: Math.max(h * 1.2, h * 0.85 * Math.max(1, datum.length)) })),
  ].filter((compartment): compartment is { text: string; w: number } => compartment !== null)
  const totalWidth = compartments.reduce((width, compartment) => width + compartment.w, 0)

  let cursor = tolerance.position.x - totalWidth / 2
  const boxes = compartments.map((compartment) => {
    const box = { x: cursor, w: compartment.w, text: compartment.text }
    cursor += compartment.w
    return box
  })

  return (
    <g key={key}>
      {boxes.map((box, index) => (
        <g key={`box-${index}`}>
          <rect
            x={box.x}
            y={tolerance.position.y - h / 2}
            width={box.w}
            height={h}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            strokeDasharray={dash}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={box.x + box.w / 2}
            y={tolerance.position.y}
            dy={h * 0.35}
            textAnchor="middle"
            fill={stroke}
            fontSize={h * 0.85}
          >
            {box.text}
          </text>
        </g>
      ))}
    </g>
  )
}

/**
 * The GD&T symbols, as unicode where a glyph exists. A missing shape degrades to its ABBR — legible,
 * and honest about the limitation rather than drawing a box that means nothing.
 */
const gdtSymbol = (code: string): string => {
  const symbols: Record<string, string> = {
    pos: '\u25CE',      // position
    flat: '\u2B1F',     // flatness
    straight: '\u2014', // straightness
    circ: '\u25CB',     // circularity
    cyl: '\u232D',      // cylindricity
    prof: '\u23DC',     // profile of a surface
    perp: '\u27C2',     // perpendicularity
    ang: '\u2220',      // angularity
    par: '\u2225',      // parallelism
    run: '\u2197',      // circular runout
    totrun: '\u21DD',   // total runout
    edge: '\u2300',     // concentricity stands for symmetry here; edge is the honest gap
  }
  return symbols[code] ?? code
}

/** How deep a block may nest before rendering gives up; a definition cycle cannot loop forever. */
const MAX_BLOCK_NESTING = 8

/**
 * The most members one insert may expand to. A drawing's own blocks are thousands of objects at most;
 * beyond this the geometry is not being drawn, it is being counted, and what the budget removes is
 * reported by the canvas rather than silently vanishing.
 */
const MAX_BLOCK_MEMBERS = 8000

/** The SVG transform an insert applies: place, turn, size, then shift off the block's base point. */
const insertTransform = (position: Vec2, rotation: number, scale: number, basePoint: Vec2): string =>
  `translate(${position.x}, ${position.y}) rotate(${(rotation * 180) / Math.PI}) scale(${scale}) translate(${-basePoint.x}, ${-basePoint.y})`

/** A block's members, following the chain of blocks being expanded so a cycle cannot branch. */
const renderBlockMembers = (
  block: BlockDefinition,
  blocks: BlockDefinition[],
  depth: number,
  options: Parameters<typeof renderEntity>[1],
  chain: ReadonlySet<string> = new Set(),
  budget = { left: MAX_BLOCK_MEMBERS },
): (ReactElement | null)[] => {
  if (depth > MAX_BLOCK_NESTING) return []
  /*
   * Following the chain, not just a depth: a block that inserts itself expands to its branching
   * factor raised to the nesting limit — 9^8 is 43 million elements from one insert — and the tab
   * dies building them. Reaching the same block twice means the drawing is cyclic, so that branch
   * ends here. The budget is the second guard, for a nesting that is deep but legitimate.
   */
  if (chain.has(block.id)) return []
  const nextChain = new Set(chain)
  nextChain.add(block.id)
  const members: (ReactElement | null)[] = []
  for (const member of block.entities) {
    if (budget.left <= 0) break
    budget.left -= 1
    if (member.type === 'insert') {
      const nested = blocks.find((candidate) => candidate.id === member.blockId)
      if (!nested) continue
      const base = nested.basePoint ?? { x: 0, y: 0 }
      members.push(
        <g key={member.id} transform={insertTransform(member.position, member.rotation, member.scale, base)}>
          {renderBlockMembers(nested, blocks, depth + 1, options, nextChain, budget)}
        </g>,
      )
      continue
    }
    members.push(renderEntity(member, options))
  }
  return members
}

export const renderEntity = (
  entity: CadEntity,
  options: {
    selected: boolean
    color: string
    dash?: string
    dimStyle: DimStyle
    width?: number
    palette: CanvasPalette
    /** Definitions to expand an insert against; absent means inserts draw nothing. */
    blocks?: BlockDefinition[]
    /** The drawing's text styles; absent means everything draws in Standard. */
    textStyles?: TextStyle[]
  },
): ReactElement | null => {
  const { selected, color, dash, dimStyle, width, palette, blocks = [], textStyles = [] } = options
  const stroke = selected ? palette.selection : color
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
      return renderHatch(entity, selected, palette)
    case 'text':
    case 'mtext':
      return renderText(entity, stroke, textStyles)
    case 'dimension':
      return renderDimension(entity, dimStyle, selected ? palette.selection : palette.dimension, entity.id)
    case 'leader':
      return renderLeader(entity, selected ? palette.selection : palette.dimension, entity.id)
    case 'tolerance':
      return renderTolerance(entity, selected ? palette.selection : palette.dimension, entity.id)
    case 'insert': {
      const block = blocks.find((candidate) => candidate.id === entity.blockId)
      if (!block) return null
      const base = block.basePoint ?? { x: 0, y: 0 }
      return (
        <g key={entity.id} transform={insertTransform(entity.position, entity.rotation, entity.scale, base)}>
          {renderBlockMembers(block, blocks, 0, options)}
        </g>
      )
    }
    default:
      return null
  }
}

/**
 * Draws a hatch with its own pattern tile so scale and angle belong to the entity rather than a
 * shared definition. A light outline stays on so the fill can be found and selected the way
 * AutoCAD's hatches are, even when the pattern is sparse.
 */
const renderHatch = (
  entity: HatchEntity,
  selected: boolean,
  palette: CanvasPalette,
): ReactElement => {
  const points = entity.boundary.map((point) => `${point.x},${point.y}`).join(' ')
  const outline = selected ? palette.selection : palette.hatch
  const pattern = entity.pattern ?? 'ansi31'

  if (pattern === 'solid') {
    return (
      <polygon
        key={entity.id}
        points={points}
        fill={palette.hatchSolid}
        stroke={outline}
        strokeWidth={1}
        strokeOpacity={selected ? 1 : 0.45}
        vectorEffect="non-scaling-stroke"
      />
    )
  }

  const tile = hatchTileSize(pattern, entity.scale ?? 1)
  const angle = hatchBaseAngle(pattern) + (entity.angle ?? 0)
  const patternId = `hatch-fill-${entity.id}`

  return (
    <g key={entity.id}>
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={tile}
          height={tile}
          patternTransform={`rotate(${angle})`}
        >
          {hatchPatternMarks(hatchFamily(pattern), tile, palette.hatch)}
        </pattern>
      </defs>
      <polygon
        points={points}
        fill={`url(#${patternId})`}
        stroke={outline}
        strokeWidth={1}
        strokeOpacity={selected ? 1 : 0.45}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}

/**
 * The marks drawn inside one pattern tile, sized to the tile so scale changes the spacing.
 *
 * Drawing goes by FAMILY, not by name: a dozen of AutoCAD's standard patterns are the same geometry
 * under different names — ANSI31 and ANSI34 differ only in whether the run is dashed, ANSI37 and
 * ANSI33 only in a phase offset that a repeating tile cannot show. `hatchFamily` holds the mapping.
 */
const hatchPatternMarks = (family: HatchFamily, tile: number, color: string): ReactElement => {
  const stroke = { stroke: color, strokeWidth: Math.max(0.4, tile * 0.08) }
  /*
   * The dash ratio is what makes ANSI32/34/35/36/38 read as a double line the way they do on a drawing.
   * It is measured on the tile's own diagonal so it keeps its proportions at any scale.
   */
  const dashed = { ...stroke, strokeDasharray: `${tile * 0.36} ${tile * 0.16}` }
  switch (family) {
    case 'cross':
      return (
        <g>
          <line x1={0} y1={0} x2={tile} y2={tile} {...stroke} />
          <line x1={tile} y1={0} x2={0} y2={tile} {...stroke} />
        </g>
      )
    case 'crossDashed':
      return (
        <g>
          <line x1={0} y1={0} x2={tile} y2={tile} {...stroke} />
          <line x1={tile} y1={0} x2={0} y2={tile} {...dashed} />
        </g>
      )
    case 'dots':
      return <circle cx={tile / 2} cy={tile / 2} r={Math.max(0.4, tile * 0.12)} fill={color} />
    case 'grid':
      return (
        <g>
          <line x1={0} y1={tile / 2} x2={tile} y2={tile / 2} {...stroke} />
          <line x1={tile / 2} y1={0} x2={tile / 2} y2={tile} {...stroke} />
        </g>
      )
    case 'line':
      return <line x1={0} y1={tile / 2} x2={tile} y2={tile / 2} {...stroke} />
    case 'brick': {
      // A running bond: bed joints across the tile, head joints staggered half a tile between courses.
      const half = tile / 2
      return (
        <g>
          <line x1={0} y1={0} x2={tile} y2={0} {...stroke} />
          <line x1={0} y1={half} x2={tile} y2={half} {...stroke} />
          <line x1={0} y1={0} x2={0} y2={half} {...stroke} />
          <line x1={half} y1={half} x2={half} y2={tile} {...stroke} />
        </g>
      )
    }
    case 'dashed':
      return <line x1={0} y1={0} x2={0} y2={tile} {...dashed} />
    case 'solid':
      // The filled case is drawn as a solid polygon before a tile is ever built.
      return <g />
    default:
      // ANSI31: a single run of lines; the pattern's rotate transform supplies the 45° tilt.
      return <line x1={0} y1={0} x2={0} y2={tile} {...stroke} />
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
