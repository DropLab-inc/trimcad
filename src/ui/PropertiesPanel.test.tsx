import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createLine } from '../core/commands'
import { makeDefaultDocument } from '../core/document'
import { useCadStore } from '../core/store'
import { PropertiesPanel } from './PropertiesPanel'

const state = () => useCadStore.getState()

beforeEach(() => {
  const store = useCadStore.getState()
  store.setSelection([])
  store.updateDocument(() => makeDefaultDocument())
  store.setActiveLayerId(useCadStore.getState().doc.layers[0].id)
})

describe('the Properties panel layer control', () => {
  it('moves the selection when a different layer is chosen', () => {
    state().addLayer()
    const [home, walls] = state().doc.layers
    state().updateLayer(walls.id, { name: 'WALLS' })
    const line = createLine(home.id, { x: 0, y: 0 }, { x: 10, y: 0 })
    state().updateDocument((doc) => ({ ...doc, entities: [line] }))
    state().setSelection([line.id])
    render(<PropertiesPanel />)

    fireEvent.change(screen.getByLabelText('Layer'), { target: { value: walls.id } })

    expect(state().doc.entities[0].layerId).toBe(walls.id)
  })

  it('shows *Varies* when the selection sits on more than one layer', () => {
    state().addLayer()
    const [home, walls] = state().doc.layers
    const a = createLine(home.id, { x: 0, y: 0 }, { x: 10, y: 0 })
    const b = createLine(walls.id, { x: 0, y: 5 }, { x: 10, y: 5 })
    state().updateDocument((doc) => ({ ...doc, entities: [a, b] }))
    state().setSelection([a.id, b.id])
    render(<PropertiesPanel />)

    expect(screen.getByLabelText('Layer')).toHaveDisplayValue('*Varies*')
  })
})
