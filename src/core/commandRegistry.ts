import type { ToolMode } from './types'

/**
 * The single table of everything the user can type at the command line.
 *
 * The command line, the ribbon and the autocomplete list all read from here, so a command is only
 * ever described once. Aliases follow AutoCAD's defaults (L, C, REC, TR, ...) so muscle memory
 * carries over.
 */

export type CommandCategory = 'Draw' | 'Modify' | 'Annotate' | 'Edit' | 'View' | 'File'

export type CommandDef = {
  /** Canonical name, always upper case. This is what gets echoed and what Enter repeats. */
  name: string
  aliases: string[]
  category: CommandCategory
  summary: string
  /** Commands that hand control to a tool collecting points on the canvas. */
  tool?: ToolMode
}

export const COMMANDS: CommandDef[] = [
  // Draw
  { name: 'LINE', aliases: ['L'], category: 'Draw', summary: 'Straight segment', tool: 'line' },
  { name: 'PLINE', aliases: ['PL'], category: 'Draw', summary: 'Connected polyline', tool: 'polyline' },
  { name: 'RECTANG', aliases: ['REC'], category: 'Draw', summary: 'Rectangle by corners, centre, or dimensions', tool: 'rect' },
  { name: 'CIRCLE', aliases: ['C'], category: 'Draw', summary: 'Circle by centre and radius', tool: 'circle' },
  { name: 'ARC', aliases: ['A'], category: 'Draw', summary: 'Arc by centre, 3 points, or start-centre', tool: 'arc' },
  { name: 'ELLIPSE', aliases: ['EL'], category: 'Draw', summary: 'Ellipse by centre and axes', tool: 'ellipse' },
  { name: 'POLYGON', aliases: ['POL'], category: 'Draw', summary: 'Regular polygon', tool: 'polygon' },
  { name: 'SPLINE', aliases: ['SPL'], category: 'Draw', summary: 'Smooth curve through points', tool: 'spline' },
  { name: 'HATCH', aliases: ['H'], category: 'Draw', summary: 'Fill an enclosed area', tool: 'hatch' },
  { name: 'INSERT', aliases: ['I'], category: 'Draw', summary: 'Insert a block', tool: 'insert' },
  { name: 'BLOCKPALETTE', aliases: [], category: 'Draw', summary: 'List the blocks in the drawing, and insert one' },
  { name: 'BCOUNT', aliases: [], category: 'Draw', summary: 'How many times each block is placed' },

  // Annotate
  { name: 'TEXT', aliases: ['DT'], category: 'Annotate', summary: 'Single line of text', tool: 'text' },
  { name: 'MTEXT', aliases: ['MT'], category: 'Annotate', summary: 'Paragraph that wraps to a column', tool: 'mtext' },
  { name: 'TEXTEDIT', aliases: ['ED', 'DDEDIT'], category: 'Annotate', summary: 'Change the words of a note', tool: 'textedit' },
  { name: 'STYLE', aliases: ['ST'], category: 'Annotate', summary: 'Text styles: font, height, width factor, oblique' },
  { name: 'DIM', aliases: ['D'], category: 'Annotate', summary: 'Dimension, current type', tool: 'dimension' },
  { name: 'DIMLINEAR', aliases: ['DLI'], category: 'Annotate', summary: 'Horizontal or vertical dimension' },
  { name: 'DIMALIGNED', aliases: ['DAL'], category: 'Annotate', summary: 'Dimension parallel to the edge' },
  { name: 'DIMRADIUS', aliases: ['DRA'], category: 'Annotate', summary: 'Radius dimension' },
  { name: 'DIMDIAMETER', aliases: ['DDI'], category: 'Annotate', summary: 'Diameter dimension' },
  { name: 'DIMANGULAR', aliases: ['DAN'], category: 'Annotate', summary: 'Angular dimension' },
  { name: 'DIMSCALE', aliases: ['DSC'], category: 'Annotate', summary: 'Size of dimension text and arrows' },

  // Modify
  { name: 'MOVE', aliases: ['M'], category: 'Modify', summary: 'Move objects by a displacement', tool: 'move' },
  { name: 'COPY', aliases: ['CO', 'CP'], category: 'Modify', summary: 'Copy objects by a displacement', tool: 'copy' },
  { name: 'ROTATE', aliases: ['RO'], category: 'Modify', summary: 'Rotate about a base point', tool: 'rotate' },
  { name: 'SCALE', aliases: ['SC'], category: 'Modify', summary: 'Scale about a base point', tool: 'scale' },
  { name: 'MIRROR', aliases: ['MI'], category: 'Modify', summary: 'Reflect across an axis', tool: 'mirror' },
  { name: 'ARRAY', aliases: ['AR'], category: 'Modify', summary: 'Repeat objects in a grid or around a centre', tool: 'array' },
  { name: 'ARRAYRECT', aliases: [], category: 'Modify', summary: 'Repeat objects in rows and columns', tool: 'array' },
  { name: 'ARRAYPOLAR', aliases: [], category: 'Modify', summary: 'Repeat objects around a centre', tool: 'array' },
  { name: 'OFFSET', aliases: ['O'], category: 'Modify', summary: 'Parallel copy at a distance', tool: 'offset' },
  { name: 'TRIM', aliases: ['TR'], category: 'Modify', summary: 'Cut objects back to an edge', tool: 'trim' },
  { name: 'EXTEND', aliases: ['EX'], category: 'Modify', summary: 'Lengthen objects to an edge', tool: 'extend' },
  { name: 'FILLET', aliases: ['F'], category: 'Modify', summary: 'Round a corner with an arc', tool: 'fillet' },
  { name: 'CHAMFER', aliases: ['CHA'], category: 'Modify', summary: 'Bevel a corner with a straight cut', tool: 'chamfer' },
  { name: 'ERASE', aliases: ['E'], category: 'Modify', summary: 'Delete the selection' },
  { name: 'JOIN', aliases: ['J'], category: 'Modify', summary: 'Make one object out of several that meet' },
  { name: 'EXPLODE', aliases: ['X'], category: 'Modify', summary: 'Break objects into their pieces' },
  { name: 'BLOCK', aliases: ['B'], category: 'Modify', summary: 'Define a block from the selection', tool: 'block' },
  { name: 'OVERKILL', aliases: ['OV'], category: 'Modify', summary: 'Delete duplicate and overlapping geometry' },
  { name: 'BOUNDARY', aliases: ['BO'], category: 'Modify', summary: 'Trace a closed area as a polyline', tool: 'boundary' },
  { name: 'GROUP', aliases: ['G'], category: 'Modify', summary: 'Group the selection' },
  { name: 'UNGROUP', aliases: ['UNG'], category: 'Modify', summary: 'Break up the groups in the selection' },
  { name: 'LAYMOV', aliases: ['MOVETOLAYER'], category: 'Modify', summary: 'Move the selection to a layer' },
  { name: 'LAYCUR', aliases: ['LAYMCUR'], category: 'Modify', summary: "Make the selected object's layer current" },

  // Edit
  { name: 'SELECT', aliases: ['SE'], category: 'Edit', summary: 'Return to the selection tool', tool: 'select' },
  { name: 'ALL', aliases: [], category: 'Edit', summary: 'Select every unlocked object' },
  { name: 'UNDO', aliases: ['U'], category: 'Edit', summary: 'Undo the last change' },
  { name: 'REDO', aliases: ['RE'], category: 'Edit', summary: 'Redo the last undone change' },
  { name: 'COPYCLIP', aliases: ['CTRL+C'], category: 'Edit', summary: 'Copy the selection to the clipboard' },
  { name: 'CUTCLIP', aliases: ['CTRL+X'], category: 'Edit', summary: 'Cut the selection to the clipboard' },
  { name: 'PASTECLIP', aliases: ['CTRL+V'], category: 'Edit', summary: 'Paste the clipboard at the crosshair' },

  // View
  { name: 'ZOOM', aliases: ['Z'], category: 'View', summary: 'Zoom to the drawing extents' },
  { name: 'OSNAP', aliases: ['OS'], category: 'View', summary: 'Toggle object snap' },
  { name: 'ORTHO', aliases: ['OR'], category: 'View', summary: 'Toggle orthogonal tracking' },
  { name: 'POLAR', aliases: ['PO'], category: 'View', summary: 'Toggle polar tracking' },
  { name: 'LWDISPLAY', aliases: ['LWT'], category: 'View', summary: 'Show or hide plotted lineweights' },
  { name: 'HELP', aliases: ['?'], category: 'View', summary: 'List every command' },

  // File
  { name: 'NEW', aliases: [], category: 'File', summary: 'Start an empty drawing' },
  { name: 'OPEN', aliases: [], category: 'File', summary: 'Open a saved drawing' },
  { name: 'SAVE', aliases: [], category: 'File', summary: 'Save the drawing' },
  { name: 'SAVEAS', aliases: [], category: 'File', summary: 'Save the drawing under a new name' },
  { name: 'DXFOUT', aliases: ['EXPORT'], category: 'File', summary: 'Export the drawing as DXF' },
  { name: 'DXFIN', aliases: ['IMPORT'], category: 'File', summary: 'Import a DXF file' },
  { name: 'PLOT', aliases: ['PRINT'], category: 'File', summary: 'Open the Plot dialog' },
  { name: 'PLOT1', aliases: [], category: 'File', summary: 'Open Plot preset to 1:1' },
]

const BY_TOKEN = new Map<string, CommandDef>()
for (const command of COMMANDS) {
  BY_TOKEN.set(command.name, command)
  for (const alias of command.aliases) BY_TOKEN.set(alias, command)
}

/** Looks up a command by its canonical name or any alias. Input is case insensitive. */
export const resolveCommand = (input: string): CommandDef | null =>
  BY_TOKEN.get(input.trim().toUpperCase()) ?? null

/**
 * Autocomplete candidates for partially typed text, ordered the way AutoCAD orders them: an exact
 * alias first, then names beginning with the text, then commands whose aliases begin with it.
 */
export const matchCommands = (prefix: string): CommandDef[] => {
  const text = prefix.trim().toUpperCase()
  if (!text) return []

  const exact = BY_TOKEN.get(text) ?? null
  const byName: CommandDef[] = []
  const byAlias: CommandDef[] = []

  for (const command of COMMANDS) {
    if (command === exact) continue
    if (command.name.startsWith(text)) byName.push(command)
    else if (command.aliases.some((alias) => alias.startsWith(text))) byAlias.push(command)
  }

  byName.sort((a, b) => a.name.localeCompare(b.name))
  byAlias.sort((a, b) => a.name.localeCompare(b.name))
  return [...(exact ? [exact] : []), ...byName, ...byAlias]
}

/**
 * How many single-character edits apart two words are. Only ever called for words of similar length,
 * so the quadratic cost is bounded by the command names it is compared against.
 */
const editsApart = (a: string, b: string): number => {
  const cols = b.length + 1
  let previous = Array.from({ length: cols }, (_, index) => index)

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j < cols; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[cols - 1] ?? 0
}

/**
 * The command a mistyped one was probably meant, the way AutoCAD offers a correction rather than only
 * reporting a dead end.
 *
 * A shared word is enough to guess, which is the case that matters here: AutoCAD has no LIST BLOCKS
 * either, and someone typing it should be led to the palette that actually lists them. Where two
 * commands match equally, the longer and more specific name wins — BLOCKPALETTE over BLOCK — and a
 * one- or two-character slip is still recognised, since that is the commonest mistake of all.
 */
export const suggestCommand = (typed: string): string | null => {
  const wanted = typed.trim().toUpperCase()
  if (!wanted) return null
  const words = wanted.split(/[\s_-]+/).filter((word) => word.length >= 3)

  let bestName: string | null = null
  let bestScore = 0

  for (const command of COMMANDS) {
    const name = command.name
    if (name === wanted) return name

    let score = 0
    if (name.startsWith(wanted)) score = 100
    else if (name.includes(wanted)) score = 80
    else {
      for (const word of words) {
        // The plural is tried as its singular too, so "blocks" reaches BLOCKPALETTE.
        if (name.includes(word) || name.includes(word.replace(/S$/, ''))) {
          score = 60
          break
        }
      }
      // A misspelling scores below a shared word, so a real word match is never beaten by a typo.
      if (score === 0 && wanted.length >= 3 && Math.abs(name.length - wanted.length) <= 2) {
        if (editsApart(name, wanted) <= 2) score = 40
      }
    }

    const longer = score === bestScore && bestName !== null && name.length > bestName.length
    if (score > 0 && (score > bestScore || longer)) {
      bestName = name
      bestScore = score
    }
  }
  return bestName
}

/** The shortest token that reaches a command, used for the hints shown on ribbon buttons. */
export const shortestAlias = (command: CommandDef): string =>
  [command.name, ...command.aliases].reduce((best, token) => (token.length < best.length ? token : best))
