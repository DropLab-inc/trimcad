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
  lineweight: number
  visible: boolean
  locked: boolean
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

export type HatchPattern = 'solid' | 'ansi31' | 'ansi37' | 'dots'

export type HatchEntity = BaseEntity & {
  type: 'hatch'
  boundary: Vec2[]
  pattern: HatchPattern
  scale: number
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

export type ToolMode =
  | 'select'
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
  | 'dimension'
  | 'insert'
  | 'offset'
  | 'trim'
  | 'extend'
  | 'mirror'
