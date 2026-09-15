import type { Vec2 } from './math/vec2'

export type Units = 'mm' | 'in'

export type Linetype = {
  id: string
  name: string
  pattern: number[]
}

export type Layer = {
  id: string
  name: string
  color: string
  linetypeId: string
  /** Plotted width in millimetres. Like AutoCAD, it is not drawn on screen by default. */
  lineweight: number
  /** AutoCAD's On/Off: the layer is hidden but still regenerates and can be snapped to. */
  visible: boolean
  /** Frozen layers are hidden and take no part in selection, snapping or editing. */
  frozen: boolean
  /** Locked layers stay visible and snappable but cannot be selected or changed. */
  locked: boolean
  /** Whether the layer appears on a plot. */
  plottable: boolean
}

export type DimStyle = {
  precision: number
  textHeight: number
  arrowSize: number
  suffix: string
}

export type BaseEntity = {
  id: string
  type: string
  layerId: string
  color?: string
  linetypeId?: string
  lineweight?: number
}

export type LineEntity = BaseEntity & {
  type: 'line'
  start: Vec2
  end: Vec2
}

export type CircleEntity = BaseEntity & {
  type: 'circle'
  center: Vec2
  radius: number
}

export type ArcEntity = BaseEntity & {
  type: 'arc'
  center: Vec2
  radius: number
  startAngle: number
  endAngle: number
}

export type EllipseEntity = BaseEntity & {
  type: 'ellipse'
  center: Vec2
  rx: number
  ry: number
  rotation: number
}

export type PolylineEntity = BaseEntity & {
  type: 'polyline'
  points: Vec2[]
  closed: boolean
}

export type SplineEntity = BaseEntity & {
  type: 'spline'
  controlPoints: Vec2[]
}

export type HatchPattern = 'solid' | 'ansi31' | 'ansi37' | 'dots' | 'net' | 'line'

export type HatchEntity = BaseEntity & {
  type: 'hatch'
  boundary: Vec2[]
  pattern: HatchPattern
  /** Spacing multiplier for the pattern. Solid ignores it. */
  scale: number
  /** Extra rotation of the pattern in degrees. Solid ignores it. */
  angle: number
}

export type TextEntity = BaseEntity & {
  type: 'text'
  position: Vec2
  value: string
  height: number
}

export type DimensionType = 'linear' | 'aligned' | 'radial' | 'diameter' | 'angular'

export type DimensionEntity = BaseEntity & {
  type: 'dimension'
  dimType: DimensionType
  p1: Vec2
  p2: Vec2
  p3?: Vec2
  /** Where the dimension line sits, picked as the final click. */
  placement?: Vec2
  valueOverride?: string
  /**
   * AutoCAD's DIMSCALE, held per dimension rather than per drawing: it multiplies the drawing's
   * text height and arrow size so one dimension can be sized for its own view. Absent means 1,
   * which is what dimensions saved before this existed should measure.
   */
  scale?: number
}

export type InsertEntity = BaseEntity & {
  type: 'insert'
  blockId: string
  position: Vec2
  rotation: number
  scale: number
}

export type CadEntity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | EllipseEntity
  | PolylineEntity
  | SplineEntity
  | HatchEntity
  | TextEntity
  | DimensionEntity
  | InsertEntity

export type Group = {
  id: string
  name: string
  entityIds: string[]
}

export type BlockDefinition = {
  id: string
  name: string
  entities: CadEntity[]
  /** Where the block's own origin sits. INSERT places this point. Absent means {0, 0}. */
  basePoint?: Vec2
}

export type DrawingDocument = {
  units: Units
  layers: Layer[]
  linetypes: Linetype[]
  dimStyle: DimStyle
  blocks: BlockDefinition[]
  entities: CadEntity[]
  groups: Group[]
}

export type SnapMode =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'quadrant'
  | 'intersection'
  | 'perpendicular'
  | 'tangent'
  | 'nearest'
  | 'node'

/**
 * How CIRCLE is being pinned down: by a centre and a radius or a diameter, by two ends of a
 * diameter, by three points on the rim, or tangent to two objects at a given radius.
 */
export type CircleMode = 'center' | 'diameter' | '2p' | '3p' | 'ttr'

/**
 * How ARC is pinned down: by a centre then its ends, by three points on the curve, by a start
 * then the centre then the end, or by a start, the centre, and an included angle.
 */
export type ArcMode = 'cse' | '3p' | 'sce' | 'sca'

/**
 * How RECTANG is pinned down: by two opposite corners, by its centre and a corner, or by a
 * corner plus typed length and width.
 */
export type RectMode = 'corners' | 'center' | 'dimensions'

/**
 * How a polygon is sized: by a circle its corners sit on, by one its sides sit against, or by
 * drawing a single edge and letting the rest of the shape follow from it.
 */
export type PolygonFit = 'inscribed' | 'circumscribed' | 'edge'

/** Whether ARRAY repeats the selection in a grid or around a centre. */
export type ArrayType = 'rect' | 'polar'

export type ToolMode =
  | 'select'
  | 'array'
  | 'line'
  | 'polyline'
  | 'rect'
  | 'circle'
  | 'arc'
  | 'ellipse'
  | 'polygon'
  | 'spline'
  | 'text'
  | 'hatch'
  | 'boundary'
  | 'dimension'
  | 'insert'
  | 'block'
  | 'offset'
  | 'trim'
  | 'extend'
  | 'fillet'
  | 'chamfer'
  | 'mirror'
  | 'move'
  | 'copy'
  | 'rotate'
  | 'scale'
