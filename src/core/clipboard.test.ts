import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine } from './commands'
import { applyDrawTool, useCadStore } from './store'
import type { CadEntity, LineEntity } from './types'

const seed = (entities: CadEntity[] = []) => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.setTool('select')
  state.updateDocument((doc) => ({ ...doc, entities, groups: [] }))
  useCadStore.setState({ history: [], lastCommand: null, cursorWorld: null, clipboard: [] })
}

const state = () => useCadStore.getState()
const entities = () => useCadStore.getState().doc.entities
const layerId = () => useCadStore.getState().doc.layers[0].id

describe('copying to the clipboard', () => {
  beforeEach(() => seed())

  it('takes a copy of the selection', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])
    state().setSelection([entities()[0].id])
    state().copySelection()

    expect(state().clipboard).toHaveLength(1)
    expect(entities()).toHaveLength(1)
  })

  it('holds the objects apart from the drawing, so later edits do not follow them', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])
    state().setSelection([entities()[0].id])
    state().copySelection()
    state().deleteSelection()

    expect(entities()).toHaveLength(0)
    expect(state().clipboard).toHaveLength(1)
  })

  it('asks for a selection rather than copying nothing', () => {
    state().copySelection()
    expect(state().statusMessage).toMatch(/select objects/i)
    expect(state().clipboard).toHaveLength(0)
  })

  it('removes the objects when cutting', () => {
    seed([createCircle(layerId(), { x: 0, y: 0 }, 5)])
    state().setSelection([entities()[0].id])
    state().cutSelection()

    expect(entities()).toHaveLength(0)
    expect(state().clipboard).toHaveLength(1)
  })
})

describe('pasting', () => {
  beforeEach(() => seed())

  it('adds fresh objects rather than reusing the copied ones', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])
    const originalId = entities()[0].id
    state().setSelection([originalId])
    state().copySelection()
    state().pasteClipboard()

    expect(entities()).toHaveLength(2)
    expect(entities()[1].id).not.toBe(originalId)
  })

  it('hands the pasted objects to MOVE so they ride the crosshair', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])
    state().setSelection([entities()[0].id])
    state().copySelection()
    state().pasteClipboard()

    expect(state().activeTool).toBe('move')
    expect(state().draftPoints).toHaveLength(1)
    expect(state().selectedIds).toEqual([entities()[1].id])
  })

  it('takes its base point from the corner of what was copied', () => {
    seed([createLine(layerId(), { x: 4, y: 7 }, { x: 14, y: 20 })])
    state().setSelection([entities()[0].id])
    state().copySelection()
    state().pasteClipboard()

    expect(state().draftPoints[0]).toEqual({ x: 4, y: 7 })
  })

  it('lands where the next click goes', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])
    state().setSelection([entities()[0].id])
    state().copySelection()
    state().pasteClipboard()
    applyDrawTool({ x: 50, y: 30 })

    const pasted = entities()[1] as LineEntity
    expect(pasted.start).toEqual({ x: 50, y: 30 })
    expect(pasted.end).toEqual({ x: 60, y: 30 })
    expect(state().activeTool).toBe('select')
  })

  it('can be pasted more than once from a single copy', () => {
    seed([createCircle(layerId(), { x: 0, y: 0 }, 5)])
    state().setSelection([entities()[0].id])
    state().copySelection()

    state().pasteClipboard()
    applyDrawTool({ x: 40, y: 0 })
    state().pasteClipboard()
    applyDrawTool({ x: 80, y: 0 })

    expect(entities()).toHaveLength(3)
  })

  it('says there is nothing to paste when the clipboard is empty', () => {
    state().pasteClipboard()
    expect(state().statusMessage).toMatch(/nothing on the clipboard/i)
    expect(entities()).toHaveLength(0)
  })
})

describe('the clipboard commands', () => {
  beforeEach(() => seed())

  it('runs from the command line', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])
    state().setSelection([entities()[0].id])
    state().executeCommand('COPYCLIP')
    state().executeCommand('PASTECLIP')

    expect(entities()).toHaveLength(2)
    expect(state().activeTool).toBe('move')
  })
})
