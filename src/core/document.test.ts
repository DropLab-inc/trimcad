import { describe, expect, it } from 'vitest'
import { DocumentController, makeDefaultDocument } from './document'

describe('DocumentController', () => {
  it('adds and deletes entities with undo/redo', () => {
    const controller = new DocumentController(makeDefaultDocument())
    const layerId = controller.getDocument().layers[0].id
    controller.addEntity({
      id: '1',
      type: 'line',
      layerId,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    })
    expect(controller.getDocument().entities).toHaveLength(1)
    controller.deleteEntities(['1'])
    expect(controller.getDocument().entities).toHaveLength(0)
    controller.undo()
    expect(controller.getDocument().entities).toHaveLength(1)
    controller.redo()
    expect(controller.getDocument().entities).toHaveLength(0)
  })
})
