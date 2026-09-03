import type { CircleMode, DimensionType, PolygonFit, ToolMode } from './types'

/**
 * Prompts shown at the command line and under the crosshair.
 *
 * A prompt says what the command wants next (`kind`) and which words the user may type instead
 * (`keywords`). Keeping both in one place is what lets the command line, the status strip and the
 * keyboard handler agree on what a keystroke means at any moment.
 */

/** What kind of answer the running command is waiting for. */
export type PromptKind = 'point' | 'number' | 'entity' | 'selection'

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
  /** TRIM and EXTEND are collecting their cutting or boundary edges. */
  pickingEdges: boolean
  /** How many edges have been picked, or null while every object counts as an edge. */
  edgeCount: number | null
  /** Shift is held, which swaps TRIM and EXTEND. */
  swapped: boolean
}

const point = (text: string, keywords: Keyword[] = []): Prompt => ({ text, kind: 'point', keywords })
const entity = (text: string, keywords: Keyword[] = []): Prompt => ({ text, kind: 'entity', keywords })
const selection = (text: string, keywords: Keyword[] = []): Prompt => ({ text, kind: 'selection', keywords })

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
    case 'rect':
      return [point('Specify first corner'), point('Specify other corner')]
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
        default:
          return [point('Specify centre point', ways), point('Specify radius', [{ key: 'D', label: 'Diameter' }])]
      }
    }
    case 'arc':
      return [point('Specify centre point'), point('Specify start point'), point('Specify end point')]
    case 'ellipse':
      return [point('Specify centre point'), point('Specify axis endpoint')]
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
    case 'text':
      return [point('Specify text insertion point')]
    case 'hatch':
      return [point('Pick an internal point of a closed area')]
    case 'insert':
      return [point('Specify insertion point')]
    case 'dimension':
      return DIM_PROMPTS[ctx.dimensionType] ?? DIM_PROMPTS.linear
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
