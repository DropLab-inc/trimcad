import { beforeEach, describe, expect, it } from 'vitest'
import { suggestCommand } from './commandRegistry'
import { createLine } from './commands'
import { applyDrawTool, useCadStore } from './store'
import type { BlockDefinition, CadEntity, InsertEntity } from './types'

const state = () => useCadStore.getState()
const run = (line: string) => state().executeCommand(line)
const lastLine = () => state().history.at(-1)!
const recentLog = () => state().history.map((line) => line.text).join('\n')
const layerId = () => state().doc.layers[0].id

const titleBlock: BlockDefinition = {
  id: 'b-title',
  name: 'TITLE',
  entities: [createLine('0', { x: 0, y: 0 }, { x: 180, y: 0 })],
  basePoint: { x: 0, y: 0 },
}

const placed = (blockId: string, id: string): InsertEntity => ({
  id,
  type: 'insert',
  layerId: layerId(),
  blockId,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: 1,
})

const seed = (blocks: BlockDefinition[] = [], entities: CadEntity[] = []) => {
  state().cancelCommand()
  state().setSelection([])
  // Through the controller the store mirrors, so the drawing is really replaced.
  state().newDrawing()
  state().updateDocument((doc) => ({ ...doc, blocks, entities }))
  useCadStore.setState({ history: [], lastCommand: null, cursorWorld: null, activeTool: 'select' })
}

describe('finding out what blocks exist', () => {
  beforeEach(() => seed())

  it('answers the `?` keyword hidden inside INSERT with the block names', () => {
    seed([titleBlock])
    state().setTool('insert')

    run('?')

    // This is the route that mattered: a `?` at the name prompt. It had no test, and a user who
    // typed "list blocks" instead had nowhere to land. The list is logged and then the prompt is
    // repeated after it, so the answer sits above the last line rather than on it.
    expect(recentLog()).toContain('Blocks: TITLE')
  })

  it('says so plainly when the drawing has no blocks', () => {
    state().setTool('insert')

    run('?')

    expect(recentLog()).toMatch(/No blocks defined yet/)
  })

  it('answers BLOCKPALETTE with every block and how often it is placed', () => {
    seed([titleBlock], [placed('b-title', 'i1'), placed('b-title', 'i2')])

    run('BLOCKPALETTE')

    expect(lastLine().text).toBe('TITLE — placed 2 times')
  })

  it('counts placements for BCOUNT the same way, so the two cannot disagree', () => {
    seed([titleBlock], [placed('b-title', 'i1')])

    run('BLOCKPALETTE')
    const fromPalette = lastLine().text
    run('BCOUNT')

    expect(lastLine().text).toBe(fromPalette)
    expect(lastLine().text).toBe('TITLE — placed 1 time')
  })

  it('counts placements on sheets as well as in the model', () => {
    seed([titleBlock])
    // A block placed on a sheet is still a placement of it.
    state().updateDocument((doc) => ({
      ...doc,
      layouts: [
        {
          id: 'l1',
          name: 'Sheet',
          paper: 'a4',
          orientation: 'landscape',
          marginMm: 10,
          entities: [placed('b-title', 'i1')],
          viewports: [],
        },
      ],
    }))

    run('BLOCKPALETTE')

    expect(lastLine().text).toBe('TITLE — placed 1 time')
  })
})

describe('offering the block palette', () => {
  beforeEach(() => seed([titleBlock]))

  it('arms INSERT with the chosen block and skips the name step', () => {
    state().insertBlockFromPalette('b-title')

    expect(state().activeTool).toBe('insert')
    expect(state().insertBlockId).toBe('b-title')
    // Straight to where it goes — no name to remember, which is the point of a palette.
    expect(lastLine().text).toMatch(/Specify insertion point/)
  })

  it('places the block where the next point is picked', () => {
    state().insertBlockFromPalette('b-title')

    // The point, then the defaults for scale and rotation — no name was ever asked for.
    applyDrawTool({ x: 40, y: 25 })
    run('')
    run('')

    const insert = state().doc.entities.find((entity) => entity.type === 'insert')
    expect(insert).toBeTruthy()
    if (insert?.type !== 'insert') return
    expect([insert.position.x, insert.position.y]).toEqual([40, 25])
    expect(insert.blockId).toBe('b-title')
  })

  it('ignores a block that is not there', () => {
    state().insertBlockFromPalette('gone')

    expect(state().activeTool).toBe('select')
    expect(state().insertBlockId).toBeNull()
  })
})

describe('suggesting a command after a mistyped one', () => {
  it('leads "list blocks" to the palette that lists them', () => {
    // AutoCAD has no LIST BLOCKS either; this is the command that actually answers the question.
    expect(suggestCommand('list blocks')).toBe('BLOCKPALETTE')
  })

  it('leads a near miss to the command it nearly was', () => {
    expect(suggestCommand('inser')).toBe('INSERT')
    // A one-character slip is the commonest mistake: BLOCK, not the longer name that also contains it.
    expect(suggestCommand('blok')).toBe('BLOCK')
  })

  it('leaves a real command alone and offers nothing for gibberish', () => {
    expect(suggestCommand('PLINE')).toBe('PLINE')
    expect(suggestCommand('wfrobnitz')).toBeNull()
  })

  it('reports the suggestion in the command history', () => {
    seed([titleBlock])

    run('list blocks')

    expect(lastLine().text).toContain('Did you mean BLOCKPALETTE?')
  })
})
