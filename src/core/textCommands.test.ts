import { beforeEach, describe, expect, it } from 'vitest'
import { applyDrawTool, useCadStore } from '../core/store'
import { STANDARD_STYLE, textStylesOf } from '../core/text'
import { exportDocumentToDxf, importDocumentFromDxf } from '../core/dxf'
import type { CadEntity, MTextEntity, TextEntity } from '../core/types'

const state = () => useCadStore.getState()
const run = (line: string) => state().executeCommand(line)
const click = (point: { x: number; y: number }) => applyDrawTool(point)
const entities = () => state().doc.entities as CadEntity[]
const notes = () => entities().filter((entity): entity is TextEntity | MTextEntity => entity.type === 'text' || entity.type === 'mtext')

const seed = () => {
  state().cancelCommand()
  state().setSelection([])
  state().setTool('select')
  state().updateDocument((doc) => ({ ...doc, entities: [], textStyles: undefined }))
  useCadStore.setState({
    history: [],
    lastCommand: null,
    cursorWorld: null,
    textHeight: 12,
    textRotation: 0,
    textStyleId: null,
    textEditor: null,
    textStylesOpen: false,
    mtextDraft: null,
  })
}

beforeEach(seed)

/**
 * TEXT is AutoCAD's DTEXT: a start point, then the height and rotation it will be drawn at, then the
 * words — all answered at the command line rather than in a browser dialog, which is what the old
 * `window.prompt` was and what a phone cannot use.
 */
describe('TEXT', () => {
  it('asks for the point, the height, the rotation and the words, in that order', () => {
    run('TEXT')
    expect(state().activeTool).toBe('text')

    click({ x: 10, y: 20 })
    run('5')
    run('30')
    run('NOTE 1')

    const [text] = notes() as TextEntity[]
    expect(text.type).toBe('text')
    expect(text.value).toBe('NOTE 1')
    expect(text.position).toEqual({ x: 10, y: 20 })
    expect(text.height).toBe(5)
    expect(text.rotation).toBe(30)
  })

  it('keeps asking, and drops each line below the last one it wrote', () => {
    run('TEXT')
    click({ x: 0, y: 0 })
    run('10')
    run('0')
    run('first')
    run('second')

    const written = notes() as TextEntity[]
    expect(written.map((text) => text.value)).toEqual(['first', 'second'])
    // One line spacing of a height-10 line, which is 5/3 of the height.
    expect(written[1].position.y).toBeCloseTo((10 * 5) / 3, 9)
  })

  it('finishes on an empty line, as DTEXT does', () => {
    run('TEXT')
    click({ x: 0, y: 0 })
    run('10')
    run('0')
    run('only line')
    run('')

    expect(state().activeTool).toBe('select')
    expect(notes()).toHaveLength(1)
  })

  it('takes the height and rotation it shows when Enter is pressed', () => {
    run('TEXT')
    click({ x: 0, y: 0 })
    run('')
    run('')
    run('defaults')

    const [text] = notes() as TextEntity[]
    expect(text.height).toBe(12)
    expect(text.rotation).toBeUndefined()
  })

  it('asks for nothing but the point when the style fixes the height', () => {
    run('STYLE')
    state().setTextStylesOpen(false)
    state().createTextStyle({ ...STANDARD_STYLE, name: 'Title', height: 40, font: 'times-bold' })
    const title = textStylesOf(state().doc).find((style) => style.name === 'Title')!
    state().setCurrentTextStyle(title.id)

    run('TEXT')
    click({ x: 0, y: 0 })
    run('0')
    run('TITLED')

    const [text] = notes() as TextEntity[]
    expect(text.height).toBe(40)
    expect(text.styleId).toBe(title.id)
  })

  it('places a justified line from its Justify option', () => {
    run('TEXT')
    run('J')
    run('TC')

    click({ x: 5, y: 5 })
    run('10')
    run('0')
    run('centred')

    const [text] = notes() as TextEntity[]
    expect(text.justify).toBe('TC')
  })

  it('names the styles it knows when asked', () => {
    run('TEXT')
    // AutoCAD offers the listing inside the Style option rather than at the start-point prompt.
    run('S')
    run('?')

    expect(state().history.map((line) => line.text).join('\n')).toContain('Standard')
  })
})

describe('MTEXT', () => {
  it('takes a box and opens the editor for the words', () => {
    run('MTEXT')
    click({ x: 10, y: 10 })
    click({ x: 110, y: 40 })

    const editor = state().textEditor
    expect(editor?.kind).toBe('mtext')
    expect(state().mtextDraft).toEqual({ position: { x: 10, y: 10 }, width: 100 })

    state().commitTextEditor({ value: 'first paragraph\nsecond paragraph' })

    const [mtext] = notes() as MTextEntity[]
    expect(mtext.type).toBe('mtext')
    expect(mtext.width).toBe(100)
    expect(mtext.value).toBe('first paragraph\nsecond paragraph')
    expect(mtext.position).toEqual({ x: 10, y: 10 })
  })

  it('normalises the box to its top-left corner, so the text reads downwards', () => {
    run('MTEXT')
    click({ x: 110, y: 40 })
    click({ x: 10, y: 10 })
    state().commitTextEditor({ value: 'note' })

    const [mtext] = notes() as MTextEntity[]
    expect(mtext.position).toEqual({ x: 10, y: 10 })
    expect(mtext.width).toBe(100)
  })

  it('anchors the block on the attachment point its Justify option set', () => {
    run('MTEXT')
    click({ x: 0, y: 0 })
    // The options belong to the second prompt, as they do in AutoCAD: the corner comes first.
    run('J')
    run('BL')
    click({ x: 50, y: 50 })
    state().commitTextEditor({ value: 'bottom left' })

    const [mtext] = notes() as MTextEntity[]
    expect(mtext.attachment).toBe('BL')
  })

  it('takes a width on its own, so one corner is the whole box', () => {
    run('MTEXT')
    click({ x: 5, y: 5 })
    run('W')
    run('80')
    // The width completes the box, so the editor opens without a second corner.
    state().commitTextEditor({ value: 'fixed column' })

    const [mtext] = notes() as MTextEntity[]
    expect(mtext.width).toBe(80)
    expect(mtext.position).toEqual({ x: 5, y: 5 })
  })

  it('does not create anything until the editor is committed', () => {
    run('MTEXT')
    click({ x: 0, y: 0 })
    click({ x: 40, y: 40 })

    expect(notes()).toHaveLength(0)
    state().cancelTextEditor()
    expect(notes()).toHaveLength(0)
    expect(state().activeTool).toBe('select')
  })
})

describe('editing text', () => {
  it('opens the editor on the note under the pointer and rewrites its words', () => {
    run('TEXT')
    click({ x: 0, y: 0 })
    run('10')
    run('0')
    run('before')
    run('')

    run('TEXTEDIT')
    click({ x: 0, y: 0 })

    const editor = state().textEditor
    expect(editor?.entityId).toBe(notes()[0].id)
    expect(editor?.value).toBe('before')

    state().commitTextEditor({ value: 'after' })
    expect((notes()[0] as TextEntity).value).toBe('after')
  })

  it('says so when the pick lands on nothing', () => {
    run('TEXTEDIT')
    click({ x: 500, y: 500 })

    expect(state().textEditor).toBeNull()
    expect(state().statusMessage).toContain('No text')
  })

  it('edits the properties a selected note is given', () => {
    run('TEXT')
    click({ x: 0, y: 0 })
    run('10')
    run('0')
    run('sized')
    run('')
    const id = notes()[0].id
    state().setSelection([id])

    state().updateSelectedText({ height: 25, rotation: 90 })

    const [text] = notes() as TextEntity[]
    expect(text.height).toBe(25)
    expect(text.rotation).toBe(90)
  })
})

describe('text styles', () => {
  it('is a dialog, and lists the styles when the command runs', () => {
    run('STYLE')
    expect(state().textStylesOpen).toBe(true)
    expect(state().history.map((line) => line.text).join('\n')).toContain('Standard')
  })

  it('keeps Standard whatever happens, and never twice', () => {
    state().createTextStyle({ ...STANDARD_STYLE, name: 'Notes' })
    state().createTextStyle({ ...STANDARD_STYLE, name: 'Notes' })

    const styles = textStylesOf(state().doc)
    expect(styles.map((style) => style.name)).toEqual(['Standard', 'Notes', 'Notes'])

    state().deleteTextStyle(STANDARD_STYLE.id)
    expect(textStylesOf(state().doc).some((style) => style.name === 'Standard')).toBe(true)
  })

  it('carries a style change to the text set in it', () => {
    state().createTextStyle({ ...STANDARD_STYLE, name: 'Notes', font: 'helvetica' })
    const notesStyle = textStylesOf(state().doc).find((style) => style.name === 'Notes')!
    state().setCurrentTextStyle(notesStyle.id)

    run('TEXT')
    click({ x: 0, y: 0 })
    run('10')
    run('0')
    run('styled')
    run('')

    state().updateTextStyle(notesStyle.id, { widthFactor: 0.5, obliqueAngle: 15 })

    // The object keeps naming the style, so it follows whatever the style becomes.
    expect((notes()[0] as TextEntity).styleId).toBe(notesStyle.id)
    expect(textStylesOf(state().doc).find((style) => style.id === notesStyle.id)?.widthFactor).toBe(0.5)
  })
})

describe('MTEXT through a DXF file', () => {
  it('comes back as a real paragraph rather than a flattened line', () => {
    const built: MTextEntity = {
      id: 'm1',
      type: 'mtext',
      layerId: state().doc.layers[0].id,
      position: { x: 5, y: 6 },
      width: 120,
      value: 'first paragraph\nsecond paragraph',
      height: 4,
      attachment: 'MC',
    }
    state().updateDocument((doc) => ({ ...doc, entities: [built] }))

    const file = exportDocumentToDxf(state().doc)
    const reopened = importDocumentFromDxf(file, state().doc)

    const [restored] = reopened.entities.filter(
      (entity): entity is MTextEntity => entity.type === 'mtext',
    )
    expect(restored.value).toBe('first paragraph\nsecond paragraph')
    expect(restored.width).toBe(120)
    expect(restored.attachment).toBe('MC')
  })

  it('reads an MTEXT out of a file as an MTEXT, with its paragraph breaks', () => {
    const file = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'MTEXT',
      '8', '0',
      '10', '10.0', '20', '20.0',
      '40', '5.0',
      '41', '80.0',
      '71', '1',
      '1', 'line one\\Pline two',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n')

    const document = importDocumentFromDxf(file, state().doc)
    const [mtext] = document.entities.filter((entity): entity is MTextEntity => entity.type === 'mtext')

    expect(mtext).toBeDefined()
    expect(mtext.value).toBe('line one\nline two')
    expect(mtext.width).toBe(80)
    expect(mtext.height).toBe(5)
    expect(mtext.attachment).toBe('TL')
  })
})
