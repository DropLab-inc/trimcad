import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCircle, createLine } from './commands'
import { makeDefaultDocument } from './document'
import {
  editableEntities,
  isLayerEditable,
  isLayerPlottable,
  isLayerVisible,
  makeLayer,
  nextLayerName,
  normalizeLayer,
  plottableEntities,
  visibleEntities,
} from './layers'
import { useCadStore } from './store'
import type { DrawingDocument, Layer } from './types'

const layer = (overrides: Partial<Layer> = {}): Layer => ({
  ...makeLayer('l1', 'WALLS', 'lt-continuous'),
  ...overrides,
})

describe('what a layer state means', () => {
  it('draws a layer that is on and thawed', () => {
    expect(isLayerVisible(layer())).toBe(true)
  })

  it('hides a layer that is switched off', () => {
    expect(isLayerVisible(layer({ visible: false }))).toBe(false)
  })

  it('hides a frozen layer', () => {
    expect(isLayerVisible(layer({ frozen: true }))).toBe(false)
  })

  it('keeps a locked layer on screen but refuses to edit it', () => {
    const locked = layer({ locked: true })
    expect(isLayerVisible(locked)).toBe(true)
    expect(isLayerEditable(locked)).toBe(false)
  })

  it('leaves a layer marked not to plot off the drawing sheet', () => {
    expect(isLayerPlottable(layer({ plottable: false }))).toBe(false)
    expect(isLayerVisible(layer({ plottable: false }))).toBe(true)
  })

  it('keeps a hidden layer off the plot even when it is set to plot', () => {
    expect(isLayerPlottable(layer({ visible: false }))).toBe(false)
  })
})

describe('picking entities by their layer', () => {
  const twoLayers = (): DrawingDocument => {
    const doc = makeDefaultDocument()
    const hidden = layer({ id: 'hidden', name: 'HIDDEN', visible: false })
    const locked = layer({ id: 'locked', name: 'LOCKED', locked: true })
    return {
      ...doc,
      layers: [...doc.layers, hidden, locked],
      entities: [
        createLine(doc.layers[0].id, { x: 0, y: 0 }, { x: 1, y: 0 }),
        createLine('hidden', { x: 0, y: 1 }, { x: 1, y: 1 }),
        createCircle('locked', { x: 5, y: 5 }, 2),
      ],
    }
  }

  it('leaves objects on a hidden layer undrawn', () => {
    expect(visibleEntities(twoLayers())).toHaveLength(2)
  })

  it('leaves objects on a locked layer visible but unpickable', () => {
    const editable = editableEntities(twoLayers())
    expect(editable).toHaveLength(1)
    expect(editable[0].layerId).toBe('layer-0')
  })

  it('leaves hidden layers off a plot', () => {
    expect(plottableEntities(twoLayers())).toHaveLength(2)
  })
})

describe('reading layers from an older drawing', () => {
  it('fills in flags that were never written', () => {
    const filled = normalizeLayer({ id: 'a', name: 'OLD', color: '#123456' }, 'lt-continuous')
    expect(filled).toMatchObject({ visible: true, frozen: false, locked: false, plottable: true })
    expect(filled.lineweight).toBeGreaterThan(0)
  })

  it('keeps flags that were written', () => {
    const filled = normalizeLayer({ id: 'a', name: 'OLD', frozen: true, plottable: false }, 'lt-continuous')
    expect(filled.frozen).toBe(true)
    expect(filled.plottable).toBe(false)
  })
})

describe('naming a new layer', () => {
  it('starts at Layer1', () => {
    expect(nextLayerName([layer({ name: '0' })])).toBe('Layer1')
  })

  it('skips names already taken, whatever the case', () => {
    expect(nextLayerName([layer({ name: 'layer1' }), layer({ name: 'Layer2' })])).toBe('Layer3')
  })
})

describe('the layer manager', () => {
  const state = () => useCadStore.getState()

  beforeEach(() => {
    const store = useCadStore.getState()
    store.setSelection([])
    store.updateDocument(() => makeDefaultDocument())
    store.setActiveLayerId(useCadStore.getState().doc.layers[0].id)
  })

  it('adds a layer with a name of its own', () => {
    state().addLayer()
    expect(state().doc.layers).toHaveLength(2)
    expect(state().doc.layers[1].name).toBe('Layer1')
  })

  it('changes a layer setting', () => {
    const id = state().doc.layers[0].id
    state().updateLayer(id, { color: '#ff0000', locked: true })

    expect(state().doc.layers[0].color).toBe('#ff0000')
    expect(state().doc.layers[0].locked).toBe(true)
  })

  it('drops objects from the selection once their layer is locked', () => {
    const id = state().doc.layers[0].id
    state().updateDocument((doc) => ({ ...doc, entities: [createLine(id, { x: 0, y: 0 }, { x: 1, y: 0 })] }))
    state().setSelection([state().doc.entities[0].id])

    state().updateLayer(id, { locked: true })
    expect(state().selectedIds).toHaveLength(0)
  })

  it('refuses to delete the last layer', () => {
    state().deleteLayer(state().doc.layers[0].id)
    expect(state().doc.layers).toHaveLength(1)
    expect(state().statusMessage).toMatch(/at least one layer/i)
  })

  it('refuses to delete the current layer', () => {
    state().addLayer()
    state().deleteLayer(state().activeLayerId)

    expect(state().doc.layers).toHaveLength(2)
    expect(state().statusMessage).toMatch(/current layer/i)
  })

  it('deletes an empty layer without asking', () => {
    state().addLayer()
    const spare = state().doc.layers[1].id
    state().deleteLayer(spare)

    expect(state().doc.layers).toHaveLength(1)
  })

  it('checks before deleting a layer with objects on it, and takes them too', () => {
    state().addLayer()
    const spare = state().doc.layers[1].id
    state().updateDocument((doc) => ({ ...doc, entities: [createLine(spare, { x: 0, y: 0 }, { x: 1, y: 0 })] }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    state().deleteLayer(spare)

    expect(confirm).toHaveBeenCalled()
    expect(state().doc.layers).toHaveLength(1)
    expect(state().doc.entities).toHaveLength(0)
    confirm.mockRestore()
  })

  it('keeps the layer when that is declined', () => {
    state().addLayer()
    const spare = state().doc.layers[1].id
    state().updateDocument((doc) => ({ ...doc, entities: [createLine(spare, { x: 0, y: 0 }, { x: 1, y: 0 })] }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    state().deleteLayer(spare)

    expect(state().doc.layers).toHaveLength(2)
    expect(state().doc.entities).toHaveLength(1)
    confirm.mockRestore()
  })
})
