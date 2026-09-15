import { beforeEach, describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { useCadStore } from './store'
import type { CadEntity } from './types'

const state = () => useCadStore.getState()

const reset = () => {
  useCadStore.setState({
    activeLayoutId: null,
    activeViewportId: null,
    enteredViewportId: null,
    selectedIds: [],
    currentColor: null,
  })
  // Through the store's own path: the controller it mirrors is what actually holds the drawing.
  state().newDrawing()
}

const layerId = () => state().doc.layers[0].id

const draw = (): CadEntity => {
  const line = createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })
  state().addEntity(line)
  return line
}

const model = () => state().doc.entities
const sheet = () =>
  state().doc.layouts.find((layout) => layout.id === state().activeLayoutId)?.entities ?? []

describe('object colour, separate from the layer', () => {
  beforeEach(reset)

  it("leaves a new object on its layer's colour until told otherwise", () => {
    draw()

    // No colour of its own, which is what ByLayer means and what keeps AutoCAD-style drawings from
    // needing one layer per colour.
    expect(model()[0].color).toBeUndefined()
  })

  it('draws new objects in the colour being drawn in', () => {
    state().setCurrentColor('#ff0000')
    draw()

    expect(model()[0].color).toBe('#ff0000')
  })

  it('keeps a colour an object already carried', () => {
    state().setCurrentColor('#ff0000')
    state().addEntity({ ...createLine(layerId(), { x: 0, y: 0 }, { x: 5, y: 0 }), color: '#00ff00' })

    // Pasting or duplicating in one colour must not repaint the pasted objects.
    expect(model()[0].color).toBe('#00ff00')
  })

  it('recolours the selection', () => {
    const line = draw()
    state().setSelection([line.id])
    state().setSelectionColor('#0000ff')

    expect(model()[0].color).toBe('#0000ff')
  })

  it('hands the selection back to its layer when asked for ByLayer', () => {
    const line = draw()
    state().setSelection([line.id])
    state().setSelectionColor('#0000ff')
    state().setSelectionColor(null)

    // Back to ByLayer means the override is gone, not that the layer's colour was painted on — which
    // is the difference that lets recolouring the layer move the object with it.
    expect(model()[0].color).toBeUndefined()
  })

  it('recolours only what is selected', () => {
    const first = draw()
    draw()
    state().setSelection([first.id])
    state().setSelectionColor('#0000ff')

    expect(model()[0].color).toBe('#0000ff')
    expect(model()[1].color).toBeUndefined()
  })

  it("sets colour on a sheet's own object without reaching the model", () => {
    state().addLayout()
    const onSheet = draw()
    state().setSelection([onSheet.id])
    state().setSelectionColor('#ff8800')

    expect(sheet()[0].color).toBe('#ff8800')
    expect(model()).toHaveLength(0)
  })

  it('moves a sheet object to another layer in the sheet’s own space', () => {
    state().addLayout()
    const onSheet = draw()
    state().addLayer()
    const other = state().doc.layers[state().doc.layers.length - 1]
    state().setSelection([onSheet.id])

    state().moveSelectionToLayer(other.id)

    expect(sheet()[0].layerId).toBe(other.id)
    expect(model()).toHaveLength(0)
  })
})
