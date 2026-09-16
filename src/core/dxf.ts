import DxfParser from 'dxf-parser'
import Drawing from 'dxf-writer'
import type { Vec2 } from './math/vec2'
import type { BlockDefinition, CadEntity, DrawingDocument, Layer, MTextAttachment, TextJustify } from './types'
import { makeDefaultDocument } from './document'
import { ellipticalArcPoints, expandBulges, sampleBSpline } from './dxfCurves'
import { DEFAULT_LAYER_COLOR, makeLayer, normalizeLayer } from './layers'
import { uid } from './geometry'
import { reflectBlocksY, reflectEntitiesY } from './dxfCoordinates'
import { decodeControlCodes } from './text'
import { hatchesFromDxf } from './dxfHatch'

/** Marks the comment line carrying the full drawing. DXF readers ignore group code 999. */
const EMBED_TAG = 'TRIMCAD-DOCUMENT:'
/** Earlier embeds from before the TrimCAD rename; still accepted when opening a file. */
const LEGACY_EMBED_TAGS = [EMBED_TAG, 'DROPLABCAD-DOCUMENT:'] as const

/**
 * DXF is the drawing's own save format, so the writer keeps layers and their colours and puts each
 * object back on the layer it was drawn on.
 *
 * DXF alone cannot describe everything the app holds: a layer's lineweight and its frozen and
 * locked flags have nowhere to go, and hatches, dimensions and groups have no equivalent at all.
 * So the whole document is written again into a comment, which other programs skip over and this
 * one reads back to restore the drawing exactly. The geometry is still written properly as DXF, so
 * the file remains a real DXF anywhere else.
 */
export const exportDocumentToDxf = (document: DrawingDocument): string => {
  const drawing = new Drawing()

  for (const layer of document.layers) {
    drawing.addLayer(layer.name, toAci(layer.color), linetypeNameFor(document, layer))
  }

  /*
   * The records are written in AutoCAD's axis, so the geometry is reflected on the way out; the embedded
   * document below is written as it is held, because that is this app's own format and reads back
   * without a conversion. Same function both ways, so the two sides cannot drift apart.
   */
  for (const entity of reflectEntitiesY(document.entities)) {
    const layer = document.layers.find((candidate) => candidate.id === entity.layerId)
    drawing.setActiveLayer(layer?.name ?? document.layers[0]?.name ?? '0')
    addEntity(drawing, entity)
  }

  const body = drawing.toDxfString()
  // JSON.stringify escapes newlines, so the whole document stays on the single line a comment needs.
  const embedded = JSON.stringify({ fingerprint: fingerprintOfDxf(body), document })
  return `999\n${EMBED_TAG}${embedded}\n${body}`
}

/**
 * Fingerprints the DXF that was actually written, rather than the document in memory.
 *
 * Not every shape has an exact DXF form. A spline is written as control points and read back as the
 * curve those points describe, and an ellipse comes back with its longer radius first. Fingerprinting
 * the original would therefore never match on reload, and the embedded document — the only place
 * hatches, dimensions and groups are kept — would be thrown away every time one of those was in the
 * drawing. Taking both fingerprints through the same pipeline makes a match mean what it should:
 * that nothing outside this app has touched the file.
 */
const fingerprintOfDxf = (dxf: string): string => {
  try {
    return fingerprintOf(entitiesFromDxf(dxf))
  } catch {
    // An unreadable file just means the embedded copy is not trusted, and the DXF itself is used.
    return ''
  }
}

const entitiesFromDxf = (
  content: string,
  layerIdFor: (name: unknown) => string = () => '',
  blocks?: { definitions: BlockDefinition[]; idFor: (name: unknown) => string | null },
  parsedInput?: any,
  counted: ImportCounts = { impossible: 0 },
): CadEntity[] => {
  /*
   * The parsed file is passed in when the caller has it: parsing a large drawing twice — once for
   * the BLOCKS section and once for the entities — costs seconds on a real sheet, and the parse is
   * the expensive half of opening a file.
   */
  const parsed = parsedInput ?? (new DxfParser().parseSync(content) as any)
  const entities: CadEntity[] = []
  for (const raw of (parsed?.entities ?? []) as any[]) {
    const entity = readEntity(raw, layerIdFor(raw.layer), blocks?.idFor)
    if (!entity) counted.impossible += 1
    if (entity) entities.push(entity)
  }
  return entities
}

/**
 * The BLOCKS section, as the drawing's own block definitions.
 *
 * A block holds geometry in its OWN coordinate system, placed by an INSERT; the app models that
 * exactly (`BlockDefinition` + `InsertEntity`), so a title block, a notes table or the anonymous
 * block behind a dimension all arrive as what they are rather than as loose lines at the origin.
 * A definition with nothing readable in it is skipped: an empty block would place nothing.
 */
const blocksFromDxf = (
  content: string,
  layerIdFor: (name: unknown) => string = () => '',
  parsedInput?: any,
): { definitions: BlockDefinition[]; idFor: (name: unknown) => string | null; parsed: any } => {
  const parsed = parsedInput ?? (new DxfParser().parseSync(content) as any)
  const definitions: BlockDefinition[] = []
  const byName = new Map<string, string>()
  const raw = (parsed?.blocks ?? {}) as Record<string, any>

  // Two passes: the ids have to exist before a block that inserts ANOTHER block is read.
  for (const name of Object.keys(raw)) byName.set(name.toUpperCase(), uid())
  const idFor = (name: unknown): string | null =>
    typeof name === 'string' ? byName.get(name.toUpperCase()) ?? null : null

  for (const [name, block] of Object.entries(raw)) {
    /*
     * A layout block is not a definition anyone can place. `*Model_Space` and `*Paper_Space` describe
     * the layout itself, and a converter may write the drawing's entities INTO one of them — importing
     * that as a block would carry a second copy of the drawing, placeable from the palette.
     */
    if (/^\*(Model|Paper)_Space/i.test(name)) continue
    const members: CadEntity[] = []
    for (const member of (block?.entities ?? []) as any[]) {
      const entity = readEntity(member, layerIdFor(member.layer), idFor)
      if (entity) members.push(entity)
    }
    if (members.length === 0) continue
    // DXF block names are case-insensitive and often differ only in case from a reference.
    const id = idFor(name)
    if (!id) continue
    definitions.push({
      id,
      name,
      entities: members,
      basePoint: { x: block?.position?.x ?? 0, y: block?.position?.y ?? 0 },
    })
  }
  return { definitions, idFor, parsed }
}

/**
 * A short summary of the geometry, used to notice when a file has been edited by another program.
 * Only the shapes DXF can carry are counted, since those are the only ones that could have changed.
 */
const fingerprintOf = (entities: CadEntity[]): string => {
  const round = (value: number) => Math.round(value * 1000) / 1000
  return entities
    .filter((entity) => WRITABLE.has(entity.type))
    .map((entity) => {
      switch (entity.type) {
        case 'line':
          return `l:${round(entity.start.x)},${round(entity.start.y)},${round(entity.end.x)},${round(entity.end.y)}`
        case 'circle':
          return `c:${round(entity.center.x)},${round(entity.center.y)},${round(entity.radius)}`
        case 'arc':
          return `a:${round(entity.center.x)},${round(entity.center.y)},${round(entity.radius)}`
        case 'ellipse':
          return `e:${round(entity.center.x)},${round(entity.center.y)},${round(entity.rx)},${round(entity.ry)}`
        case 'polyline':
          return `p:${entity.points.length},${round(entity.points[0]?.x ?? 0)},${round(entity.points[0]?.y ?? 0)}`
        case 'spline':
          return `s:${entity.controlPoints.length}`
        case 'text':
          return `t:${entity.value}`
        default:
          return ''
      }
    })
    .join('|')
}

/**
 * Reads back the document written into the comment, but only if the DXF geometry still matches it.
 * If another program has moved or added something, the comment is stale and the DXF itself wins.
 */
const readEmbedded = (content: string, dxfEntities: CadEntity[]): DrawingDocument | null => {
  let start = -1
  let tagLength = 0
  for (const tag of LEGACY_EMBED_TAGS) {
    const at = content.indexOf(tag)
    if (at !== -1) {
      start = at
      tagLength = tag.length
      break
    }
  }
  if (start === -1) return null

  const end = content.indexOf('\n', start)
  const line = content.slice(start + tagLength, end === -1 ? undefined : end).trim()

  try {
    const parsed = JSON.parse(line) as { fingerprint?: string; document?: DrawingDocument }
    if (!parsed.document || !Array.isArray(parsed.document.entities)) return null
    if (parsed.fingerprint !== fingerprintOf(dxfEntities)) return null
    return parsed.document
  } catch {
    return null
  }
}

/**
 * What the file contains that this app cannot draw, counted by type.
 *
 * A drawing that arrives missing its hatches or its leaders should SAY so: a silent drop reads as
 * the tool being unable to open the file at all, and leaves the user comparing a sheet against
 * something that is quietly not the same drawing. The scan is over the raw text, because the
 * parser drops what it does not know before any of our code sees it.
 */
export const unreadableInDxf = (content: string): Map<string, number> => {
  const counts = new Map<string, number>()
  const lines = content.split(/\r\n|\r|\n/)
  /*
   * A DXF is a flat list of (code, value) PAIRS, so the scan has to step two lines at a time. Reading
   * it one line at a time confuses a value of "0" with a group code of 0 and reports "-1" and "2" as
   * entity types, which is how a young scanner produces a confident wrong answer.
   */
  let section: string | null = null
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = lines[index].trim()
    const value = lines[index + 1].trim()
    if (code === '0' && value === 'SECTION') {
      section = null
      continue
    }
    // The section's name is the first code 2 after SECTION.
    if (code === '2' && section === null) {
      section = value
      continue
    }
    if (code === '0' && value === 'ENDSEC') {
      section = null
      continue
    }
    if (section !== 'ENTITIES' || code !== '0') continue
    if (READABLE_TYPES.has(value)) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

/** The DXF entity types `readEntity` turns into objects. Everything else is reported, not dropped. */
const READABLE_TYPES = new Set([
  'LINE',
  'CIRCLE',
  // A block's fields and an insert's values, which are text on the drawing.
  'ARC',
  'ELLIPSE',
  'LWPOLYLINE',
  'POLYLINE',
  'SPLINE',
  'TEXT',
  'MTEXT',
  'INSERT',
  'DIMENSION',
  'HATCH',
  'ATTRIB',
  'ATTDEF',
  'SEQEND',
  'VERTEX',
])

/** Entity types the DXF writer cannot carry, counted by type for a warning before saving. */
export const unsupportedForDxf = (document: DrawingDocument): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const entity of document.entities) {
    if (WRITABLE.has(entity.type)) continue
    counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1)
  }
  return counts
}

const WRITABLE = new Set(['line', 'circle', 'arc', 'ellipse', 'polyline', 'spline', 'text'])

const linetypeNameFor = (document: DrawingDocument, layer: Layer): string => {
  const linetype = document.linetypes.find((candidate) => candidate.id === layer.linetypeId)
  return (linetype?.name ?? 'Continuous').toUpperCase()
}

const addEntity = (drawing: any, entity: CadEntity) => {
  switch (entity.type) {
    case 'line':
      drawing.drawLine(entity.start.x, entity.start.y, entity.end.x, entity.end.y)
      return
    case 'circle':
      drawing.drawCircle(entity.center.x, entity.center.y, entity.radius)
      return
    case 'arc':
      drawing.drawArc(
        entity.center.x,
        entity.center.y,
        entity.radius,
        (entity.startAngle * 180) / Math.PI,
        (entity.endAngle * 180) / Math.PI,
      )
      return
    case 'ellipse': {
      /**
       * DXF does not describe an ellipse by two radii and a rotation. It gives the endpoint of the
       * major axis relative to the centre, and the ratio of the minor axis to it, which must be no
       * greater than one. So the longer radius always leads, and if that is `ry` the axis is a
       * quarter turn on from the stored rotation.
       */
      const major = Math.max(entity.rx, entity.ry)
      const minor = Math.min(entity.rx, entity.ry)
      const angle = entity.rx >= entity.ry ? entity.rotation : entity.rotation + Math.PI / 2
      drawing.drawEllipse(
        entity.center.x,
        entity.center.y,
        Math.cos(angle) * major,
        Math.sin(angle) * major,
        major === 0 ? 0 : minor / major,
        0,
        Math.PI * 2,
      )
      return
    }
    case 'polyline':
      drawing.drawPolyline(
        entity.points.map((point) => [point.x, point.y]),
        entity.closed,
      )
      return
    case 'spline':
      drawing.drawSpline(entity.controlPoints.map((point) => [point.x, point.y]))
      return
    case 'text':
      /*
       * An MTEXT goes out as one TEXT record holding its paragraphs joined by spaces: dxf-writer has no
       * MTEXT, and leaving the object out would lose the note entirely for anything but this app. The
       * paragraph itself is kept in the document embedded in the file, so it comes back whole.
       */
      drawing.drawText(
        entity.position.x,
        entity.position.y,
        entity.height,
        entity.rotation ?? 0,
        entity.value.replace(/\n+/g, ' '),
      )
      return
    default:
      return
  }
}

/**
 * Reads a DXF into a whole drawing: layers first, with their colours, then every entity onto the
 * layer it names. `base` supplies the linetypes and dimension style, which DXF does not carry.
 */
/**
 * The furthest any real drawing reaches. Millimetres make a survey 1e9 and a machine datum 1e11, so
 * this leaves a thousandfold margin over anything legitimate while excluding the coordinate no
 * drawing has: a customer file carried polylines at 1e59, an artifact of whatever converted it.
 */
export const MAX_DRAWING_COORDINATE = 1e12

/**
 * Whether an object carries a number no drawing could hold — infinite, not a number, or beyond any
 * coordinate a real file means.
 *
 * Such a value is not a feature at a very great distance; it is damage. Its bounds swamp everything
 * else, so the camera fits to it, and at that magnitude adding a grid spacing to a coordinate no
 * longer changes it: the canvas then loops for ever drawing grid lines that never advance and the tab
 * dies. The object is dropped and counted instead, which is what AutoCAD does with a value it cannot
 * place — the alternative is an app that cannot open the file at all.
 */
const holdsImpossibleNumbers = (value: unknown, depth = 0): boolean => {
  if (depth > 6) return false
  if (typeof value === 'number') return !Number.isFinite(value) || Math.abs(value) > MAX_DRAWING_COORDINATE
  if (Array.isArray(value)) return value.some((item) => holdsImpossibleNumbers(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => holdsImpossibleNumbers(item, depth + 1))
  }
  return false
}

/** The objects an import refuses for their coordinates, counted so the drop can be reported. */
export const impossibleCoordinates = (content: string): number => {
  const parsed = new DxfParser().parseSync(content) as any
  const entities: any[] = [...(parsed?.entities ?? [])]
  for (const block of parsed?.blocks ?? []) entities.push(...(block?.entities ?? []))
  return entities.filter((entity: any) => holdsImpossibleNumbers(entity)).length
}

/** What an import left out, so the command line can say so rather than the drawing going quiet. */
export type ImportCounts = { impossible: number }

/**
 * An insert's attribute VALUES, read from the raw records.
 *
 * `ATTDEF` is a member of the block — the field, with the text it shows until something fills it in —
 * and the parser hands those over like any other member. `ATTRIB` is not: it belongs to the INSERT, and
 * the parser consumes it with the insert, so it never reaches `readEntity`. Without this the customer's
 * title block drew as a grid of empty cells, because every field label and every value on that sheet is
 * an attribute.
 *
 * Each value is a TEXT record in its own right, written where it appears on the drawing, so it is read
 * here as one: the alignment point when a justification is set, otherwise the insertion point.
 */
const attributesFromDxf = (
  content: string,
  layerIdFor: (name: unknown) => string,
): { entities: CadEntity[]; suppliedTags: Set<string> } => {
  const lines = content.split(/\r\n|\r|\n/)
  const entities: CadEntity[] = []
  const suppliedTags = new Set<string>()
  let record: Array<[string, string]> = []
  const flush = () => {
    if (record.length > 0 && record[0][1] === 'ATTRIB') {
      const first = (code: string) => record.find(([c]) => c === code)?.[1]
      const value = first('1')
      const tag = first('2')
      if (tag) suppliedTags.add(tag)
      if (value !== undefined && value !== '') {
        const halign = Number(first('72') ?? 0)
        const valign = Number(first('73') ?? 0)
        const x = Number((halign !== 0 || valign !== 0 ? first('11') ?? first('10') : first('10')) ?? 0)
        const y = Number((halign !== 0 || valign !== 0 ? first('21') ?? first('20') : first('20')) ?? 0)
        const rotation = Number(first('50') ?? 0)
        const justify = singleLineJustify(halign, valign)
        if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= MAX_DRAWING_COORDINATE && Math.abs(y) <= MAX_DRAWING_COORDINATE) {
          entities.push({
            id: uid(),
            type: 'text',
            layerId: layerIdFor(first('8')),
            position: { x, y },
            value: decodeControlCodes(value),
            height: Number(first('40') ?? 12),
            rotation: rotation ? (rotation * Math.PI) / 180 : undefined,
            ...(justify ? { justify } : {}),
            ...(first('2') ? { attributeTag: String(first('2')) } : {}),
          })
        }
      }
    }
    record = []
  }
  // A DXF is (code, value) PAIRS: stepping two lines at a time is what keeps a value of "0" from
  // reading as the start of a new record.
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = lines[index].trim()
    const value = lines[index + 1].trim()
    if (code === '0') {
      flush()
      record.push([code, value])
      continue
    }
    if (record.length > 0) record.push([code, value])
  }
  flush()
  return { entities, suppliedTags }
}

export const importDocumentFromDxf = (
  content: string,
  base: DrawingDocument,
  report?: (counts: ImportCounts) => void,
): DrawingDocument => {
  const parsed = new DxfParser().parseSync(content) as any

  const layers = readLayers(parsed, base)
  const byName = new Map(layers.map((layer) => [layer.name.toUpperCase(), layer.id]))
  const fallbackLayerId = layers[0].id
  const layerIdFor = (name: unknown): string =>
    (typeof name === 'string' ? byName.get(name.toUpperCase()) : undefined) ?? fallbackLayerId

  const counted: ImportCounts = { impossible: 0 }
  const blocks = blocksFromDxf(content, layerIdFor, parsed)
  /*
   * Hatches are read from the raw text rather than from the parse, because dxf-parser has no handler
   * for the record and drops it. A block's hatches are members of that block, so they have to be
   * merged into the definition rather than added to the drawing.
   */
  const hatches = hatchesFromDxf(content, layerIdFor, fromAci)
  for (const definition of blocks.definitions) {
    const extra = hatches.byBlock.get(definition.name)
    if (extra && extra.length > 0) definition.entities = [...definition.entities, ...extra]
  }
  const parsedEntities = entitiesFromDxf(content, layerIdFor, blocks, blocks.parsed, counted)
  const attributes = attributesFromDxf(content, layerIdFor)
  const entities = [...parsedEntities, ...hatches.top, ...attributes.entities]
  report?.(counted)

  // A file this app wrote carries the whole drawing, including everything DXF has no room for.
  const embedded = readEmbedded(content, entities)
  if (embedded) {
    return {
      ...base,
      ...embedded,
      layers: embedded.layers.map((layer) => normalizeLayer(layer, base.linetypes[0]?.id ?? 'lt-continuous')),
    }
  }

  /*
   * The file's blocks come with it, unless the drawing already has blocks by those names — a name
   * collision would silently repoint existing inserts at imported geometry.
   */
  const taken = new Set((base.blocks ?? []).map((block) => block.name.toUpperCase()))
  /*
   * A block's field is a PLACEHOLDER. Where the drawing supplies a value for that tag, the value
   * REPLACES it, which is what AutoCAD draws; drawing both made a cell read "NAME NAME".
   */
  const filledIn = (block: BlockDefinition): BlockDefinition => ({
    ...block,
    entities: block.entities.filter(
      (member) =>
        !(member.type === 'text' && member.attributeTag && attributes.suppliedTags.has(member.attributeTag)),
    ),
  })
  const imported = blocks.definitions
    .filter((block) => !taken.has(block.name.toUpperCase()))
    .map(filledIn)
  /*
   * The file's coordinates are AutoCAD's — y up — and this app's model space is y down, so everything the
   * file brought is reflected once, here. The drawing's own blocks are NOT: those are this app's already.
   */
  return {
    ...base,
    layers,
    entities: reflectEntitiesY(entities),
    blocks: [...(base.blocks ?? []), ...reflectBlocksY(imported)],
    groups: [],
  }
}

const readLayers = (parsed: any, base: DrawingDocument): Layer[] => {
  const table = parsed?.tables?.layer?.layers as Record<string, any> | undefined
  const linetypeId = base.linetypes[0]?.id ?? 'lt-continuous'
  if (!table) return base.layers.length > 0 ? base.layers : makeDefaultDocument().layers

  const layers = Object.values(table).map((layer: any) =>
    makeLayer(uid(), String(layer.name ?? '0'), linetypeId, fromAci(layer.colorIndex ?? layer.color)),
  )
  return layers.length > 0 ? layers : makeDefaultDocument().layers
}

/**
 * `blockIdFor` resolves a DXF block name to the drawing's own block definition, or null when the
 * file referenced one we have no geometry for. Blocks are how a real drawing carries its title
 * block, its notes and its dimension geometry, so an INSERT that cannot resolve is a visible hole.
 */
const readEntity = (
  raw: any,
  layerId: string,
  blockIdFor: (name: unknown) => string | null = () => null,
): CadEntity | null => {
  /*
   * One door, so one test: an object carrying a coordinate no drawing holds is refused here rather
   * than reaching the canvas, where its bounds would take the camera with them.
   */
  if (holdsImpossibleNumbers(raw)) return null
  switch (raw.type) {
    case 'LINE':
      if (!raw.vertices?.[0] || !raw.vertices?.[1]) return null
      return {
        id: uid(),
        type: 'line',
        layerId,
        start: { x: raw.vertices[0].x, y: raw.vertices[0].y },
        end: { x: raw.vertices[1].x, y: raw.vertices[1].y },
      }
    case 'CIRCLE':
      return {
        id: uid(),
        type: 'circle',
        layerId,
        center: { x: raw.center.x, y: raw.center.y },
        radius: raw.radius,
      }
    case 'ARC':
      return {
        id: uid(),
        type: 'arc',
        layerId,
        center: { x: raw.center.x, y: raw.center.y },
        radius: raw.radius,
        // dxf-parser hands back radians for an arc's limits, unlike the degrees DXF stores.
        startAngle: raw.startAngle ?? 0,
        endAngle: raw.endAngle ?? Math.PI * 2,
      }
    case 'ELLIPSE': {
      const major = { x: raw.majorAxisEndPoint?.x ?? 1, y: raw.majorAxisEndPoint?.y ?? 0 }
      const center = { x: raw.center.x, y: raw.center.y }
      const ratio = raw.axisRatio ?? 1
      const start = raw.startAngle ?? 0
      const end = raw.endAngle ?? Math.PI * 2
      const isFull = Math.abs(Math.abs(end - start) - Math.PI * 2) < 1e-6

      // Only a whole ellipse fits the ellipse entity; a partial one is kept as its traced outline.
      if (!isFull) {
        return {
          id: uid(),
          type: 'polyline',
          layerId,
          closed: false,
          points: ellipticalArcPoints(center, major, ratio, start, end),
        }
      }

      const rx = Math.hypot(major.x, major.y)
      return {
        id: uid(),
        type: 'ellipse',
        layerId,
        center,
        rx,
        ry: rx * ratio,
        rotation: Math.atan2(major.y, major.x),
      }
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      if (!Array.isArray(raw.vertices) || raw.vertices.length < 2) return null
      const closed = Boolean(raw.shape ?? raw.closed)
      // Bulges turn polyline segments into arcs; without this they arrive as straight chords.
      const points = expandBulges(raw.vertices, closed)
      if (points.length < 2) return null
      return { id: uid(), type: 'polyline', layerId, closed, points }
    }
    case 'SPLINE': {
      // Fit points sit on the curve, which is exactly what this app's splines are drawn through.
      if (Array.isArray(raw.fitPoints) && raw.fitPoints.length >= 2) {
        return {
          id: uid(),
          type: 'spline',
          layerId,
          controlPoints: raw.fitPoints.map((point: Vec2) => ({ x: point.x, y: point.y })),
        }
      }

      if (!Array.isArray(raw.controlPoints) || raw.controlPoints.length < 2) return null
      const control = raw.controlPoints.map((point: Vec2) => ({ x: point.x, y: point.y }))
      const sampled = sampleBSpline(control, raw.degreeOfSplineCurve ?? 3, raw.knotValues)

      return {
        id: uid(),
        type: 'spline',
        layerId,
        controlPoints: sampled.length >= 2 ? sampled : control,
      }
    }
    case 'INSERT': {
      const blockId = blockIdFor(raw.name)
      if (!blockId || !raw.position) return null
      // Uniform insert scaling is unchanged here; independent axis scales are a separate feature.
      const scale = raw.xScale ?? 1
      if (!Number.isFinite(scale) || scale === 0) return null
      return {
        id: uid(),
        type: 'insert',
        layerId,
        blockId,
        position: { x: raw.position.x, y: raw.position.y },
        // DXF rotation is degrees; the entity carries radians.
        rotation: ((raw.rotation ?? 0) * Math.PI) / 180,
        scale,
      }
    }
    case 'DIMENSION': {
      /*
       * A dimension in a DXF file is a MEASUREMENT plus a reference to an anonymous block holding
       * the lines, arrows and text that draw it. The app's own dimension entity cannot adopt one
       * (it has no style table to read, and its geometry is generated from points), so the block is
       * placed instead: the dimension LOOKS right on screen and plots right, and is edited by
       * deleting and re-dimensioning rather than by dragging a grip. That is honest, and better
       * than a dimension that silently disappears.
       */
      const blockId = blockIdFor(raw.block)
      if (!blockId) return null
      return {
        id: uid(),
        type: 'insert',
        layerId,
        blockId,
        position: { x: raw.anchorPoint?.x ?? 0, y: raw.anchorPoint?.y ?? 0 },
        rotation: 0,
        scale: 1,
      }
    }
    case 'TEXT': {
      // Group 41 is the object's own width factor and 72/73 its justification: both belong to the
      // object in DXF, so both are read here rather than pushed onto a style.
      const justify = singleLineJustify(raw.halign, raw.valign)
      /*
       * When a justification is set, group 11 — the second alignment point — is the one the text is
       * anchored on, and group 10 is left over from where it was typed. Anchoring on group 10 anyway
       * and then applying middle/middle puts the words half a text height below the cell they belong
       * in, which is what makes a table's text sit on its own row lines instead of inside them. On the
       * customer's sheet 41 of 45 texts are justified this way, each a half height out.
       */
      const aligned = (raw.halign ?? 0) !== 0 || (raw.valign ?? 0) !== 0
      const point = aligned && raw.endPoint ? raw.endPoint : raw.startPoint
      return {
        id: uid(),
        type: 'text',
        layerId,
        position: { x: point?.x ?? 0, y: point?.y ?? 0 },
        value: decodeControlCodes(String(raw.text ?? '')),
        height: raw.textHeight ?? 12,
        rotation: raw.rotation || undefined,
        ...(raw.xScale && raw.xScale !== 1 ? { widthFactor: raw.xScale } : {}),
        ...(justify ? { justify } : {}),
      }
    }
    /*
     * A block attribute. ATTDEF is the field a block DEFINES, with the text it shows until something
     * fills it in; ATTRIB is the value one INSERT carries. AutoCAD draws both as ordinary text, and on
     * the customer's sheet they ARE the title block — every field label and every value, plus the zone
     * letters and numbers around the border — so dropping them emptied the title block and left the
     * sheet missing text it plainly has in its own plot. Read as text: they draw, they plot, and they
     * can be edited like any other words.
     */
    case 'ATTDEF':
    case 'ATTRIB': {
      const value = raw.text ?? raw.tag
      if (value === undefined || value === null || String(value) === '') return null
      const justify = singleLineJustify(raw.halign, raw.valign)
      const aligned = (raw.halign ?? 0) !== 0 || (raw.valign ?? 0) !== 0
      // Group 11 governs when a justification is set, exactly as it does for TEXT.
      const point = (aligned ? raw.endPoint : raw.startPoint) ?? raw.startPoint ?? raw.position
      return {
        id: uid(),
        type: 'text',
        layerId,
        position: { x: point?.x ?? 0, y: point?.y ?? 0 },
        value: decodeControlCodes(String(value)),
        height: raw.textHeight ?? raw.height ?? 12,
        rotation: raw.rotation || undefined,
        ...(justify ? { justify } : {}),
        ...(raw.tag ? { attributeTag: String(raw.tag) } : {}),
      }
    }
    case 'MTEXT':
      /*
       * A real multiline entity, not a TEXT with the codes still in it. MTEXT's paragraphs are `\P`
       * inside its text and its formatting is written as `\f…;`, `\H…;` and braces around the runs
       * they apply to, so the codes are stripped and the breaks become newlines.
       */
      return {
        id: uid(),
        type: 'mtext',
        layerId,
        position: { x: raw.position?.x ?? 0, y: raw.position?.y ?? 0 },
        width: raw.width ?? 0,
        value: mtextPlainText(String(raw.text ?? '')),
        height: raw.height ?? 12,
        rotation: raw.rotation || undefined,
        attachment: MTEXT_ATTACHMENTS[raw.attachmentPoint ?? 1] ?? 'TL',
      }
    default:
      return null
  }
}

/**
 * The words of an MTEXT with its formatting codes taken out: paragraph breaks become newlines and the
 * inline codes that set a font, height, width or colour are dropped. Trimming a note to its words is
 * lossy on purpose — a style is what carries typography here, and a code that survives into the text
 * would be drawn literally.
 */
const mtextPlainText = (value: string): string =>
  decodeControlCodes(value)
    .replace(/\\P/gi, '\n')
    .replace(/\\([A-Za-z][^;\\\\{}]*;)/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\~/g, ' ')

/** AutoCAD's MTEXT attachment codes, which count from the top left down and across. */
const MTEXT_ATTACHMENTS: Record<number, MTextAttachment> = {
  1: 'TL',
  2: 'TC',
  3: 'TR',
  4: 'ML',
  5: 'MC',
  6: 'MR',
  7: 'BL',
  8: 'BC',
  9: 'BR',
}

/** DXF's two alignment numbers as one of AutoCAD's single-line justification codes. */
const singleLineJustify = (halign: unknown, valign: unknown): TextJustify | undefined => {
  const horizontal = Number(halign ?? 0)
  const vertical = Number(valign ?? 0)
  if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) return undefined
  const across = ['Left', 'Center', 'Right'][horizontal] ?? 'Left'
  const down = ['baseline', 'bottom', 'middle', 'top'][vertical] ?? 'baseline'
  if (across === 'Left' && down === 'baseline') return 'Left'
  if (down === 'baseline') return across as TextJustify
  const prefix = down === 'top' ? 'T' : down === 'middle' ? 'M' : 'B'
  // 'across' is capitalised here, and comparing it against a lower-case name silently made every
  // centred and right-justified text left-anchored — half the reason a table's text sat off its cells.
  const letter = across === 'Center' ? 'C' : across === 'Right' ? 'R' : 'L'
  return `${prefix}${letter}` as TextJustify
}

/** AutoCAD's first nine index colours, which is what the layer palette offers. */
const ACI: Array<[number, string]> = [
  [1, '#ff0000'],
  [2, '#ffff00'],
  [3, '#00ff00'],
  [4, '#00ffff'],
  [5, '#0000ff'],
  [6, '#ff00ff'],
  [7, '#ffffff'],
  [8, '#808080'],
  [9, '#c0c0c0'],
]

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.replace(/./g, (char) => char + char) : clean.padEnd(6, '0')
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

/** Nearest index colour, since DXF layers carry an ACI number rather than a hex value. */
const toAci = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex)
  let best = 7
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [index, candidate] of ACI) {
    const [cr, cg, cb] = hexToRgb(candidate)
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

const fromAci = (index: unknown): string => {
  if (typeof index === 'number') {
    const match = ACI.find(([aci]) => aci === index)
    if (match) return match[1]
    // Anything outside the small palette arrives as a packed RGB value.
    if (index > 255) return `#${(index & 0xffffff).toString(16).padStart(6, '0')}`
  }
  return DEFAULT_LAYER_COLOR
}
