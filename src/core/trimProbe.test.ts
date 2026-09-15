import { describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { applyDrawTool, useCadStore } from './store'
import type { CadEntity } from './types'

const state = () => useCadStore.getState()
const shapeOf = (entities: CadEntity[]) =>
  entities.map((entity) =>
    entity.type === 'line' ? `line ${entity.start.x},${entity.start.y} -> ${entity.end.x},${entity.end.y}` : entity.type,
  )

const reset = () => {
  state().cancelCommand()
  state().setSelection([])
  state().newDrawing()
  useCadStore.setState({ activeLayoutId: null, selectedIds: [] })
}

const sheetEntities = () =>
  state().doc.layouts.find((layout) => layout.id === state().activeLayoutId)?.entities ?? []

describe('where trim actually writes', () => {
  /**
   * Two crossing lines, the same numbers either way, so the only difference between these two tests
   * is which space is open. Whatever trim does, it should do it to the space on screen.
   */
  const draw = (on: 'model' | 'sheet') => {
    reset()
    if (on === 'sheet') state().addLayout()
    const target = createLine(state().doc.layers[0].id, { x: 0, y: 0 }, { x: 100, y: 0 })
    const edge = createLine(state().doc.layers[0].id, { x: 50, y: -20 }, { x: 50, y: 20 })
    state().addEntity(target)
    state().addEntity(edge)
    return { target, edge }
  }

  it('MODEL SPACE: trims the model object', () => {
    draw('model')
    state().setTool('trim')
    applyDrawTool({ x: 80, y: 0 })

    console.log('MODEL after trim  ->', state().statusMessage, '|', JSON.stringify(shapeOf(state().doc.entities)))
    expect(state().doc.entities.length).toBeGreaterThan(0)
  })

  /**
   * The same numbers as the model-space test above, so the only difference is which space is open.
   *
   * This test previously pinned the fault: `pickEntity` and `edgesFor` read `doc.entities`, so the
   * pick found nothing and trim answered "No object found at that point." Both read the open space
   * now, and the write follows them.
   */
  it('SHEET: trims the sheet object', () => {
    draw('sheet')
    state().setTool('trim')
    applyDrawTool({ x: 80, y: 0 })

    expect(state().statusMessage).toBe('Trimmed')
    // The half under the pick is cut away at the crossing line; the cutter itself is left alone.
    expect(shapeOf(sheetEntities())).toEqual(['line 0,0 -> 50,0', 'line 50,-20 -> 50,20'])
    // And the model behind the sheet is untouched, which is the whole point of two spaces.
    expect(state().doc.entities).toHaveLength(0)
  })
})
