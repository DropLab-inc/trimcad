import type {
  ArcMode,
  ArrayType,
  CircleMode,
  DimensionType,
  HatchPattern,
  MTextAttachment,
  PolygonFit,
  RectMode,
  TextJustify,
  ToolMode,
} from './types'

/** One of ARRAY's counts or angles, named so a typed number knows where to land. */
export type ArrayOption = 'rows' | 'columns' | 'rowSpacing' | 'columnSpacing' | 'count' | 'fillAngle'

/** Which size RECTANG is waiting to type once Dimensions or Rotation has been taken. */
export type RectPending = 'length' | 'width' | 'rotation'

/** Which step of TEXT is waiting for an answer. */
export type TextPending = 'height' | 'rotation' | 'justify' | 'style' | 'text' | null

/** Which step of MTEXT is waiting for an answer. */
export type MTextPending = 'height' | 'rotation' | 'width' | 'justify' | 'style' | null

/**
 * Prompts shown at the command line and under the crosshair.
 *
 * A prompt says what the command wants next (`kind`) and which words the user may type instead
 * (`keywords`). Keeping both in one place is what lets the command line, the status strip and the
 * keyboard handler agree on what a keystroke means at any moment.
 */

/** What kind of answer the running command is waiting for. */
export type PromptKind = 'point' | 'number' | 'entity' | 'selection' | 'text'

export type Keyword = {
  /** The letters the user types, upper case. */
  key: string
  /** How the option reads inside the brackets. */
  label: string
}

export type Prompt = {
  /** Prompt text without the trailing colon or option list. */
  text: string
  kind: PromptKind
  keywords: Keyword[]
  /** Shown in angle brackets as the value Enter would accept. */
  defaultValue?: string
}

export type PromptContext = {
  tool: ToolMode
  /** How many points the running command has collected. */
  step: number
  dimensionType: DimensionType
  hasSelection: boolean
  /** True once OFFSET has an object picked. */
  hasTarget: boolean
  offsetDistance: number
  /** OFFSET is still waiting for the distance it opens by asking for. */
  offsetPending: boolean
  /** OFFSET's Through option is on, so the copy passes through a picked point. */
  offsetThrough: boolean
  filletRadius: number
  chamferDistance: number
  /** FILLET or CHAMFER is waiting for a typed radius or distance. */
  cornerPending: boolean
  polygonSides: number
  /** Whether a polygon is sized inside its circle, around it, or by a single edge. */
  polygonFit: PolygonFit
  /** Which of CIRCLE's constructions is running. */
  circleMode: CircleMode
  /** A Ttr circle has both its objects and is waiting for the radius. */
  circlePending: boolean
  /** Which of ARC's constructions is running. */
  arcMode: ArcMode
  /** Start-centre-angle is waiting for the included angle. */
  arcPending: boolean
  /** Which of RECTANG's constructions is running. */
  rectMode: RectMode
  /** RECTANG is waiting for a typed length, width, or rotation. */
  rectPending: RectPending | null
  /** Which hatch pattern the next pick will use. */
  hatchPattern: HatchPattern
  hatchScale: number
  hatchAngle: number
  /** HATCH is waiting for a typed scale or angle. */
  hatchPending: 'scale' | 'angle' | null
  arrayType: ArrayType
  arrayRows: number
  arrayColumns: number
  arrayRowSpacing: number
  arrayColumnSpacing: number
  arrayCount: number
  arrayFillAngle: number
  /** Which of ARRAY's counts is waiting to be typed, or null while it wants a point. */
  arrayPending: ArrayOption | null
  /** TRIM and EXTEND are collecting their cutting or boundary edges. */
  pickingEdges: boolean
  /** How many edges have been picked, or null while every object counts as an edge. */
  edgeCount: number | null
  /** Shift is held, which swaps TRIM and EXTEND. */
  swapped: boolean
  /** INSERT is waiting for a block name; once set it holds the definition it will place. */
  insertBlockId: string | null
  /** INSERT is waiting for a typed scale or rotation, or null while it wants the base point. */
  insertPending: 'scale' | 'rotation' | null
  /** BLOCK is waiting for the block's name. */
  blockNamePending: boolean
  /** Which step of TEXT is running: its height, its rotation, or the words themselves. */
  textPending: TextPending
  textHeight: number
  textRotation: number
  /** The style TEXT will be created in, by name, as AutoCAD's prompt says it. */
  textStyleName: string
  /** Which step of MTEXT is running, and the column width once it has one. */
  mtextPending: MTextPending
  mtextWidth: number
  mtextAttachment: MTextAttachment
}

const point = (text: string, keywords: Keyword[] = []): Prompt => ({ text, kind: 'point', keywords })
const entity = (text: string, keywords: Keyword[] = []): Prompt => ({ text, kind: 'entity', keywords })
const selection = (text: string, keywords: Keyword[] = []): Prompt => ({ text, kind: 'selection', keywords })
const textPrompt = (text: string, keywords: Keyword[] = []): Prompt => ({ text, kind: 'text', keywords })

/** The option shared by BLOCK and INSERT that lists every defined block into the command line. */
const LIST_BLOCKS: Keyword[] = [{ key: '?', label: 'List blocks' }]

/** AutoCAD's `?` inside a text style prompt, which lists the styles in the drawing. */
const LIST_STYLES: Keyword[] = [{ key: '?', label: 'List styles' }]

/** What ARRAY asks for once one of its counts has been chosen for editing. */
const ARRAY_OPTION_PROMPTS: Record<ArrayOption, string> = {
  rows: 'Enter the number of rows',
  columns: 'Enter the number of columns',
  rowSpacing: 'Enter the distance between rows',
  columnSpacing: 'Enter the distance between columns',
  count: 'Enter the number of items in the array',
  fillAngle: 'Specify the angle to fill, in degrees',
}

/** AutoCAD's single-line justification codes, in the order its own prompt lists them. */
export const JUSTIFY_CODES: TextJustify[] = [
  'Left',
  'Center',
  'Right',
  'Middle',
  'TL',
  'TC',
  'TR',
  'ML',
  'MC',
  'MR',
  'BL',
  'BC',
  'BR',
]

/** `Specify justification [Left/Center/...]` — spelled out, because the codes are the labels. */
const JUSTIFY_KEYWORDS: Keyword[] = JUSTIFY_CODES.map((code) => ({ key: code, label: code }))

/** AutoCAD's nine MTEXT attachment points, which are the same anchors as the justify codes. */
export const ATTACHMENT_CODES: MTextAttachment[] = ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR']

const ATTACHMENT_KEYWORDS: Keyword[] = ATTACHMENT_CODES.map((code) => ({ key: code, label: code }))

/** What TEXT and MTEXT offer before they have any words. */
const TEXT_OPENING: Keyword[] = [
  { key: 'J', label: 'Justify' },
  { key: 'S', label: 'Style' },
]

/** AutoCAD's MTEXT option list, minus Line spacing and Columns, which this does not offer yet. */
const MTEXT_OPENING: Keyword[] = [
  { key: 'H', label: 'Height' },
  { key: 'J', label: 'Justify' },
  { key: 'R', label: 'Rotation' },
  { key: 'S', label: 'Style' },
  { key: 'W', label: 'Width' },
]

const CLOSE_UNDO: Keyword[] = [
  { key: 'C', label: 'Close' },
  { key: 'U', label: 'Undo' },
]

const DIM_PROMPTS: Record<DimensionType, Prompt[]> = {
  linear: [
    point('Specify first extension line origin'),
    point('Specify second extension line origin'),
    point('Specify dimension line location'),
  ],
  aligned: [
    point('Specify first extension line origin'),
    point('Specify second extension line origin'),
    point('Specify dimension line location'),
  ],
  radial: [entity('Select a circle or arc'), point('Specify dimension line location')],
  diameter: [entity('Select a circle or arc'), point('Specify dimension line location')],
  angular: [
    point('Specify vertex'),
    point('Specify first side'),
    point('Specify second side'),
    point('Specify dimension arc location'),
  ],
  // AutoCAD's DIMORDINATE: pick the feature, then lead out; the axis follows the leader's direction.
  ordinate: [
    point('Specify feature location', [
      { key: 'X', label: 'Xdatum' },
      { key: 'Y', label: 'Ydatum' },
    ]),
    point('Specify leader endpoint or [Xdatum/Ydatum]'),
  ],
  // AutoCAD's DIMARC, on an arc or polyline arc segment: endpoints then where the arc sits.
  arclength: [
    entity('Select an arc or polyline arc segment'),
    point('Specify dimension line location', [{ key: 'M', label: 'Mtext' }]),
  ],
  // AutoCAD's DIMJOGGED: a radius measured through a jog, so the centre and the bend come separately.
  jogged: [
    entity('Select a circle or arc'),
    point('Specify center location override'),
    point('Specify dimension line location'),
    point('Specify jog location'),
  ],
}

/**
 * TRIM and EXTEND are the same command with the roles reversed, which is why holding Shift swaps
 * them. Both start in AutoCAD's quick mode, where every visible object acts as an edge, and both
 * can be narrowed to a chosen set of edges.
 */
const trimExtendPrompts = (ctx: PromptContext): Prompt[] => {
  const extending = (ctx.tool === 'extend') !== ctx.swapped
  const edgeWord = ctx.tool === 'extend' ? 'boundary' : 'cutting'
  const edgeKey: Keyword =
    ctx.tool === 'extend' ? { key: 'B', label: 'Boundary edges' } : { key: 'T', label: 'cuTting edges' }

  if (ctx.pickingEdges) {
    return [selection(`Select ${edgeWord} edges, then press Enter`, [{ key: 'A', label: 'All' }])]
  }

  const keywords: Keyword[] = [edgeKey, { key: 'F', label: 'Fence' }, { key: 'U', label: 'Undo' }]
  const verb = extending ? 'extend' : 'trim'
  const other = extending ? 'trim' : 'extend'
  const edges = ctx.edgeCount === null ? undefined : `${ctx.edgeCount} edges`
  return [{ ...entity(`Select object to ${verb} or shift-select to ${other}`, keywords), defaultValue: edges }]
}

const promptsForTool = (ctx: PromptContext): Prompt[] => {
  switch (ctx.tool) {
    case 'select':
      // Nothing is running, so this is AutoCAD's idle prompt rather than a request for a selection.
      return [selection('Command')]
    case 'line':
      return [point('Specify first point'), point('Specify next point', CLOSE_UNDO)]
    case 'polyline':
      return [point('Specify start point'), point('Specify next point', CLOSE_UNDO)]
    case 'rect': {
      if (ctx.rectPending === 'rotation') {
        return [{ ...point('Specify rotation angle'), kind: 'number' }]
      }
      if (ctx.rectPending === 'length') {
        return [{ ...point('Specify length for rectangle'), kind: 'number' }]
      }
      if (ctx.rectPending === 'width') {
        return [{ ...point('Specify width for rectangle'), kind: 'number' }]
      }
      const cornerWays: Keyword[] = [
        { key: 'C', label: 'Center' },
        { key: 'D', label: 'Dimensions' },
      ]
      const afterFirst: Keyword[] = [
        { key: 'R', label: 'Rotation' },
        { key: 'D', label: 'Dimensions' },
      ]
      switch (ctx.rectMode) {
        case 'center':
          return [
            point('Specify centre point of rectangle', [{ key: 'D', label: 'Dimensions' }]),
            point('Specify corner point of rectangle', [{ key: 'R', label: 'Rotation' }]),
          ]
        case 'dimensions':
          return [point('Specify first corner', [{ key: 'C', label: 'Center' }, { key: 'R', label: 'Rotation' }])]
        default:
          return [point('Specify first corner', cornerWays), point('Specify other corner', afterFirst)]
      }
    }
    case 'circle': {
      const ways: Keyword[] = [
        { key: '3P', label: '3 Point' },
        { key: '2P', label: '2 Point' },
        { key: 'T', label: 'Ttr (tangent tangent radius)' },
      ]
      if (ctx.circlePending) {
        return [{ ...point('Specify radius of circle'), kind: 'number' }]
      }
      switch (ctx.circleMode) {
        case '2p':
          return [point('Specify first end point of diameter'), point('Specify second end point of diameter')]
        case '3p':
          return [
            point('Specify first point on circle'),
            point('Specify second point on circle'),
            point('Specify third point on circle'),
          ]
        case 'ttr':
          return [
            entity('Specify point on object for first tangent'),
            entity('Specify point on object for second tangent'),
          ]
        case 'diameter':
          return [point('Specify centre point', ways), point('Specify diameter of circle')]
        default:
          return [point('Specify centre point', ways), point('Specify radius', [{ key: 'D', label: 'Diameter' }])]
      }
    }
    case 'arc': {
      if (ctx.arcPending) {
        return [{ ...point('Specify included angle'), kind: 'number' }]
      }
      const ways: Keyword[] = [
        { key: '3P', label: '3 Point' },
        { key: 'S', label: 'Start' },
        { key: 'A', label: 'Angle' },
      ]
      switch (ctx.arcMode) {
        case '3p':
          return [
            point('Specify first point on arc'),
            point('Specify second point on arc'),
            point('Specify end point of arc'),
          ]
        case 'sce':
          return [
            point('Specify start point of arc'),
            point('Specify centre point of arc'),
            point('Specify end point of arc'),
          ]
        case 'sca':
          return [
            point('Specify start point of arc'),
            point('Specify centre point of arc'),
            point('Specify end point of arc'),
          ]
        default:
          return [
            point('Specify centre point of arc', ways),
            point('Specify start point of arc'),
            point('Specify end point of arc'),
          ]
      }
    }
    case 'ellipse':
      return [point('Specify centre point'), point('Specify axis endpoint')]
    case 'array': {
      if (!ctx.hasSelection) {
        return [
          selection('Select objects to array', [
            { key: 'R', label: 'Rectangular' },
            { key: 'PO', label: 'Polar' },
          ]),
        ]
      }
      if (ctx.arrayPending) {
        return [{ ...point(ARRAY_OPTION_PROMPTS[ctx.arrayPending]), kind: 'number' }]
      }
      if (ctx.arrayType === 'polar') {
        return [
          {
            ...point('Specify centre point of array', [
              { key: 'I', label: 'Items' },
              { key: 'A', label: 'Angle to fill' },
              { key: 'ROT', label: 'Rotate items' },
            ]),
            defaultValue: `${ctx.arrayCount} items over ${ctx.arrayFillAngle}\u00b0`,
          },
        ]
      }
      return [
        {
          ...point('Press Enter to build the grid, or pick a base point to set the spacing by eye', [
            { key: 'R', label: 'Rows' },
            { key: 'COL', label: 'Columns' },
            { key: 'RS', label: 'Row spacing' },
            { key: 'CS', label: 'Column spacing' },
          ]),
          defaultValue: `${ctx.arrayRows} by ${ctx.arrayColumns} at ${ctx.arrayRowSpacing} by ${ctx.arrayColumnSpacing}`,
        },
        point('Specify where the neighbouring item goes'),
      ]
    }
    case 'polygon': {
      if (ctx.polygonFit === 'edge') {
        return [point('Specify first endpoint of edge'), point('Specify second endpoint of edge')]
      }
      const inside = ctx.polygonFit === 'inscribed'
      return [
        {
          ...point('Specify centre of polygon', [
            { key: 'I', label: 'Inscribed in circle' },
            { key: 'C', label: 'Circumscribed about circle' },
            { key: 'E', label: 'Edge' },
          ]),
          defaultValue: `${ctx.polygonSides} sides, ${inside ? 'inscribed' : 'circumscribed'}`,
        },
        point(inside ? 'Specify radius to a corner' : 'Specify radius to the middle of a side'),
      ]
    }
    case 'spline':
      return [point('Specify first point'), point('Specify next point (Enter to finish)')]
    case 'text': {
      // AutoCAD's DTEXT: a start point, then the height and rotation the words are drawn at, then the
      // words themselves — which are typed at the command line rather than into a browser dialog.
      if (ctx.textPending === 'height') {
        return [{ ...point('Specify height'), kind: 'number', defaultValue: String(ctx.textHeight) }]
      }
      if (ctx.textPending === 'rotation') {
        return [{ ...point('Specify rotation angle of text'), kind: 'number', defaultValue: String(ctx.textRotation) }]
      }
      if (ctx.textPending === 'justify') {
        return [textPrompt('Specify justification', JUSTIFY_KEYWORDS)]
      }
      if (ctx.textPending === 'style') {
        return [{ ...textPrompt('Enter style name', LIST_STYLES), defaultValue: ctx.textStyleName }]
      }
      if (ctx.textPending === 'text') {
        return [textPrompt('Enter text')]
      }
      return [{ ...point('Specify start point of text'), keywords: TEXT_OPENING, kind: 'point' }]
    }
    case 'mtext': {
      if (ctx.mtextPending === 'height') {
        return [{ ...point('Specify height'), kind: 'number', defaultValue: String(ctx.textHeight) }]
      }
      if (ctx.mtextPending === 'rotation') {
        return [{ ...point('Specify rotation angle of text'), kind: 'number', defaultValue: String(ctx.textRotation) }]
      }
      if (ctx.mtextPending === 'width') {
        return [{ ...point('Specify width of the paragraph'), kind: 'number', defaultValue: String(ctx.mtextWidth) }]
      }
      // Justify chooses the attachment, so it reads as AutoCAD's MTEXT attachment prompt.
      if (ctx.mtextPending === 'justify') {
        return [textPrompt('Specify attachment point', ATTACHMENT_KEYWORDS)]
      }
      if (ctx.mtextPending === 'style') {
        return [{ ...textPrompt('Enter style name', LIST_STYLES), defaultValue: ctx.textStyleName }]
      }
      if (ctx.step === 0) return [point('Specify first corner')]
      return [{ ...point('Specify opposite corner'), keywords: MTEXT_OPENING, kind: 'point' }]
    }
    case 'hatch': {
      if (ctx.hatchPending === 'scale') {
        return [{ ...point('Specify hatch scale'), kind: 'number', defaultValue: String(ctx.hatchScale) }]
      }
      if (ctx.hatchPending === 'angle') {
        return [{ ...point('Specify hatch angle'), kind: 'number', defaultValue: String(ctx.hatchAngle) }]
      }
      return [
        {
          ...point('Pick an internal point of a closed area', [
            { key: 'P', label: 'Pattern' },
            { key: 'S', label: 'Scale' },
            { key: 'A', label: 'Angle' },
          ]),
          defaultValue: `${ctx.hatchPattern} @ ${ctx.hatchScale}, ${ctx.hatchAngle}\u00b0`,
        },
      ]
    }
    case 'boundary':
      return [point('Pick an internal point to trace')]
    case 'insert':
      if (ctx.insertBlockId === null) return [textPrompt('Enter block name', LIST_BLOCKS)]
      if (ctx.insertPending === 'scale') {
        return [{ ...point('Specify scale factor'), kind: 'number', defaultValue: '1' }]
      }
      if (ctx.insertPending === 'rotation') {
        return [{ ...point('Specify rotation angle'), kind: 'number', defaultValue: '0' }]
      }
      return [point('Specify insertion point')]
    case 'block':
      if (ctx.blockNamePending) return [textPrompt('Enter block name', LIST_BLOCKS)]
      return [point('Specify base point')]
    case 'dimension':
      return DIM_PROMPTS[ctx.dimensionType] ?? DIM_PROMPTS.linear
    case 'leader':
      // AutoCAD's MLEADER: the arrow lands first, then the landing ends where the text will sit.
      return [point('Specify arrow location'), point('Specify landing location')]
    case 'tolerance':
      return [point('Specify tolerance frame location')]
    case 'offset':
      // AutoCAD asks for the distance first, then loops between picking an object and a side.
      if (ctx.offsetPending) {
        return [
          {
            ...point('Specify offset distance', [
              { key: 'T', label: 'Through' },
              { key: 'E', label: 'Erase' },
              { key: 'L', label: 'Layer' },
            ]),
            kind: 'number',
            defaultValue: String(ctx.offsetDistance),
          },
        ]
      }
      if (ctx.hasTarget) {
        return [point(ctx.offsetThrough ? 'Specify through point' : 'Specify point on side to offset')]
      }
      return [
        {
          ...entity('Select object to offset', [{ key: 'E', label: 'Exit' }, { key: 'U', label: 'Undo' }]),
          defaultValue: 'Exit',
        },
      ]
    case 'trim':
    case 'extend':
      return trimExtendPrompts(ctx)
    case 'fillet':
    case 'chamfer': {
      // Both open at the pick, with the size reachable through an option, the way AutoCAD does.
      const rounding = ctx.tool === 'fillet'
      const size = rounding ? ctx.filletRadius : ctx.chamferDistance
      if (ctx.cornerPending) {
        return [
          {
            ...point(rounding ? 'Specify fillet radius' : 'Specify chamfer distance'),
            kind: 'number',
            defaultValue: String(size),
          },
        ]
      }
      const option: Keyword = rounding ? { key: 'R', label: 'Radius' } : { key: 'D', label: 'Distance' }
      return [
        {
          ...entity('Select first object', [option]),
          defaultValue: `${rounding ? 'Radius' : 'Dist'} = ${size}`,
        },
        entity('Select second object'),
      ]
    }
    case 'mirror':
      if (!ctx.hasSelection) return [selection('Select objects to mirror')]
      return [
        point('Specify first point of mirror line', [{ key: 'E', label: 'Erase source' }]),
        point('Specify second point of mirror line'),
      ]
    case 'move':
      if (!ctx.hasSelection) return [selection('Select objects to move')]
      return [point('Specify base point'), point('Specify second point of displacement')]
    case 'copy':
      if (!ctx.hasSelection) return [selection('Select objects to copy')]
      return [point('Specify base point'), point('Specify second point of displacement')]
    case 'rotate':
      if (!ctx.hasSelection) return [selection('Select objects to rotate')]
      return [point('Specify base point'), { ...point('Specify rotation angle'), defaultValue: '0' }]
    case 'scale':
      if (!ctx.hasSelection) return [selection('Select objects to scale')]
      return [point('Specify base point'), { ...point('Specify scale factor'), defaultValue: '1' }]
    default:
      return [point('Specify point')]
  }
}

/** The prompt for the current step of the running command. */
export const promptFor = (ctx: PromptContext): Prompt => {
  const prompts = promptsForTool(ctx)
  // Commands that collect an unbounded run of points repeat their last prompt.
  const index = Math.min(Math.max(0, ctx.step), prompts.length - 1)
  return prompts[index]
}

/** Renders a prompt the way AutoCAD writes it: `Select object to trim or [Fence/Undo] <3 edges>:` */
export const formatPrompt = (prompt: Prompt): string => {
  const options = prompt.keywords.length > 0 ? ` or [${prompt.keywords.map((word) => word.label).join('/')}]` : ''
  const fallback = prompt.defaultValue ? ` <${prompt.defaultValue}>` : ''
  return `${prompt.text}${options}${fallback}:`
}

/**
 * Matches typed text against a prompt's options. A keyword answers to its shortcut letters or to
 * any unambiguous prefix of its label, so `F`, `FE` and `FENCE` all pick "Fence".
 */
export const matchKeyword = (input: string, keywords: Keyword[]): Keyword | null => {
  const text = input.trim().toUpperCase()
  if (!text) return null
  const byKey = keywords.find((word) => word.key.toUpperCase() === text)
  if (byKey) return byKey
  const byLabel = keywords.filter((word) => word.label.toUpperCase().replace(/\s+/g, '').startsWith(text))
  return byLabel.length === 1 ? byLabel[0] : null
}
