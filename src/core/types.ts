import type { Vec2 } from './math/vec2'

export type Units = 'mm' | 'in'

/** Paper a layout is issued on. Sizes in millimetres live in `print.ts`. */
export type PaperSize = 'a4' | 'a3' | 'a2' | 'a1' | 'letter' | 'legal' | 'tabloid'
export type PaperOrientation = 'landscape' | 'portrait'

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

/**
 * A named text style, AutoCAD's STYLE: the font, the width factor that stretches the letters, the
 * oblique angle that leans them, and a fixed height. A height of 0 is AutoCAD's "not fixed", where
 * every TEXT asks for its own height — which is what `Standard` is, so the drawing's own text can be
 * sized one object at a time while a style made for a title block can pin the size.
 */
export type TextStyle = {
  id: string
  name: string
  /** A font from `TextFont` in `metrics`, the twelve the plot can also draw. */
  font: string
  /** Fixed character height, or 0 for "ask each time". */
  height: number
  widthFactor: number
  /** Degrees off vertical, AutoCAD's oblique angle. */
  obliqueAngle: number
}

/**
 * AutoCAD's single-line justification codes, as they read in the prompt. `Align` and `Fit` are
 * deliberately absent: both stretch the text between two points rather than placing it at one, which
 * is a different construction rather than another anchor.
 */
export type TextJustify = 'Left' | 'Center' | 'Right' | 'Middle' | 'TL' | 'TC' | 'TR' | 'ML' | 'MC' | 'MR' | 'BL' | 'BC' | 'BR'

/** AutoCAD's nine MTEXT attachment points, which anchor the whole block of paragraphs. */
export type MTextAttachment = 'TL' | 'TC' | 'TR' | 'ML' | 'MC' | 'MR' | 'BL' | 'BC' | 'BR'

/** What the text editor is open on: an object being changed, or a new MTEXT waiting for its words. */
export type TextEditorState = {
  entityId: string | null
  kind: 'text' | 'mtext' | 'leader' | 'tolerance'
  value: string
  /** The words are the whole object, so a single line opens the same editor as a paragraph. */
  title: string
}

/** What the text editor hands back when it is done: the words, and any field it offered. */
export type TextEditResult = {
  value: string
  height?: number
  rotation?: number
  width?: number
  attachment?: MTextAttachment
  lineSpacing?: number
  /** null means the drawing's Standard, which is what an unset styleId means on an object. */
  styleId?: string | null
  /** A tolerance frame's GD&T symbol code, and its datum compartments. */
  symbol?: string
  datums?: string[]
}

/** The text properties a palette row or a dialog can set on the selection. */
export type TextPatch = Partial<{
  value: string
  height: number
  rotation: number
  styleId: string | undefined
  justify: TextJustify
  attachment: MTextAttachment
  width: number
  lineSpacing: number
}>

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
  /** Degrees, turned about the insertion point, as AutoCAD's TEXT Rotation is. Absent means 0. */
  rotation?: number
  /** The text style's id. Absent means the drawing's `Standard`. */
  styleId?: string
  /** AutoCAD's justification. Absent means Left, the baseline start of the string. */
  justify?: TextJustify
  /** The object's own width factor, as DXF group 41 carries it; absent means the style's. */
  widthFactor?: number
  /** The object's own oblique angle in degrees, DXF group 51; absent means the style's. */
  obliqueAngle?: number
}

/**
 * MTEXT: AutoCAD's multiline text, which is a different object from TEXT rather than a longer one.
 * A paragraph has a column WIDTH it wraps to, an attachment point on the whole block, and its own
 * line spacing — none of which single-line text has.
 */
export type MTextEntity = BaseEntity & {
  type: 'mtext'
  /** The attachment point: which corner or edge of the text block sits here. */
  position: Vec2
  /** The column width the paragraphs wrap to, in drawing units. 0 wraps only at the hard breaks. */
  width: number
  /** Paragraphs separated by newlines. */
  value: string
  /** Character height, AutoCAD's MTEXT Height. */
  height: number
  rotation?: number
  styleId?: string
  attachment?: MTextAttachment
  /**
   * Multiple of AutoCAD's single line spacing, which is 5/3 of the character height. Absent means 1.
   */
  lineSpacing?: number
  /** The object's own width factor, as DXF group 41 carries it; absent means the style's. */
  widthFactor?: number
  /** The object's own oblique angle in degrees, DXF group 51; absent means the style's. */
  obliqueAngle?: number
}

export type DimensionType =
  | 'linear'
  | 'aligned'
  | 'radial'
  | 'diameter'
  | 'angular'
  | 'ordinate'
  | 'arclength'
  | 'jogged'

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
  /**
   * AUTO -- AutoCAD's ordinate measures one axis only. Absent means X, the datum's X read along the
   * leader. A Y ordinate measures the datum's Y instead.
   */
  ordinateAxis?: 'x' | 'y'
  /** The bend radius AutoCAD's JOGGED dimension asks for, in drawing units. */
  jogRadius?: number
}

/**
 * AutoCAD's tolerance frame (TOLERANCE): the symbol row of GD&T, a datum, and the tolerance itself.
 * Rendered as the boxed frame AutoCAD draws — symbol in the first compartment, the value beside it.
 */
export type ToleranceEntity = BaseEntity & {
  type: 'tolerance'
  position: Vec2
  /** The GD&T symbol code: one of the geometric characteristic symbols, or '' for none. */
  symbol: string
  /** The tolerance value as typed, e.g. '0.05' or '⌀0.1'. */
  value: string
  /** The datum references, up to three compartments. */
  datums: string[]
  height: number
}

/**
 * AutoCAD's MLEADER: an arrow lands on the object, a landing runs to a hook, and multiline text sits
 * at the hook. The arrow side and landing length are what the click sequence implies, as AutoCAD's
 * MLEADER with its default style draws them.
 */
export type LeaderEntity = BaseEntity & {
  type: 'leader'
  /** Where the arrow lands, on the object being called out. */
  arrow: Vec2
  /** Where the landing ends and the text begins. */
  landingEnd: Vec2
  /** The words, drawn as one line of text (multiline arrives with the text editor). */
  value: string
  height: number
  styleId?: string
  /** True when the leader points right-to-left, so the text sits left of the hook. */
  flipped?: boolean
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
  | MTextEntity
  | DimensionEntity
  | ToleranceEntity
  | LeaderEntity
  | InsertEntity

/**
 * A window onto the model placed on a sheet. Its frame is measured in paper millimetres; the
 * drawing it shows is the model scaled by `unitsPerMm` about `modelCenter`.
 */
export type Viewport = {
  id: string
  /** Centre of the frame on the sheet, in millimetres from the sheet's top-left corner. */
  center: Vec2
  widthMm: number
  heightMm: number
  /** The drawing point sitting at the centre of the frame. */
  modelCenter: Vec2
  /** Drawing units per millimetre of paper, so 50 shows the model at 1:50. */
  unitsPerMm: number
  /** A locked viewport holds its scale and centring; panning or zooming inside it is refused. */
  locked: boolean
}

/**
 * A sheet. Model space holds the drawing at full size; a layout holds the paper it is issued on,
 * whatever is written on that paper, and the viewports that show the model.
 */
export type Layout = {
  id: string
  name: string
  paper: PaperSize
  orientation: PaperOrientation
  marginMm: number
  /** Geometry in paper millimetres — a border, a title block, notes. Reserved for phase 3. */
  entities: CadEntity[]
  viewports: Viewport[]
}

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
  /**
   * Named text styles. Optional so a drawing written before they existed still loads; the
   * `Standard` style is always available, and `textStylesOf` hands it back when this is absent.
   */
  textStyles?: TextStyle[]
  blocks: BlockDefinition[]
  entities: CadEntity[]
  groups: Group[]
  /** Sheets issued from this drawing. Empty until the user makes one; model space always exists. */
  layouts: Layout[]
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
  | 'mtext'
  | 'textedit'
  | 'leader'
  | 'tolerance'
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
