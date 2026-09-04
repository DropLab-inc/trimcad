import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createLine } from '../core/commands'
import { makeDefaultDocument } from '../core/document'
import { useCadStore } from '../core/store'
import { LayerPanel } from './LayerPanel'

const state = () => useCadStore.getState()
const layers = () => useCadStore.getState().doc.layers

beforeEach(() => {
  const store = useCadStore.getState()
  store.setSelection([])
  store.updateDocument(() => makeDefaultDocument())
  store.setActiveLayerId(useCadStore.getState().doc.layers[0].id)
})

describe('the layer manager', () => {
  it('lists every layer with a name you can edit', () => {
    state().addLayer()
    render(<LayerPanel />)

    const names = screen.getAllByTitle(/object\(s\)/)
    expect(names).toHaveLength(2)

    fireEvent.change(names[1], { target: { value: 'WALLS' } })
    expect(layers()[1].name).toBe('WALLS')
  })

  it('marks which layer new objects land on, and moves it when asked', () => {
    state().addLayer()
    render(<LayerPanel />)

    const makeCurrent = screen.getByRole('button', { name: 'Make Layer1 current' })
    expect(makeCurrent).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(makeCurrent)
    expect(state().activeLayerId).toBe(layers()[1].id)
  })

  it('turns a layer off and on again', () => {
    render(<LayerPanel />)
    const toggle = screen.getByRole('button', { name: 'visible 0' })

    fireEvent.click(toggle)
    expect(layers()[0].visible).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'visible 0' }))
    expect(layers()[0].visible).toBe(true)
  })

  it('freezes, locks and stops a layer plotting', () => {
    render(<LayerPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'frozen 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'locked 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'plottable 0' }))

    expect(layers()[0]).toMatchObject({ frozen: true, locked: true, plottable: false })
  })

  it('opens a palette from the swatch and takes a colour from it', () => {
    render(<LayerPanel />)
    expect(screen.queryByRole('group', { name: /Colour for/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Colour of 0' }))
    const palette = screen.getByRole('group', { name: 'Colour for 0' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Red' }))

    expect(layers()[0].color).toBe('#ff0000')
  })

  it('stays open so the colour can be changed again straight away', () => {
    render(<LayerPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Colour of 0' }))

    const palette = screen.getByRole('group', { name: 'Colour for 0' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Red' }))
    fireEvent.click(within(palette).getByRole('button', { name: 'Green' }))

    expect(layers()[0].color).toBe('#00ff00')
  })

  it('puts the palette away when the pointer goes elsewhere', () => {
    render(<LayerPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Colour of 0' }))
    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('group', { name: 'Colour for 0' })).not.toBeInTheDocument()
  })

  it('sets linetype and lineweight for the current layer', () => {
    render(<LayerPanel />)

    fireEvent.change(screen.getByLabelText('Lineweight of 0'), { target: { value: '0.5' } })
    expect(layers()[0].lineweight).toBe(0.5)

    const dashed = useCadStore.getState().doc.linetypes[1]
    fireEvent.change(screen.getByLabelText('Linetype of 0'), { target: { value: dashed.id } })
    expect(layers()[0].linetypeId).toBe(dashed.id)
  })

  it('adds and removes layers from the header buttons', () => {
    render(<LayerPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'New layer' }))
    expect(layers()).toHaveLength(2)

    // Deleting acts on the current layer, which the app refuses to remove.
    fireEvent.click(screen.getByRole('button', { name: 'Delete layer' }))
    expect(layers()).toHaveLength(2)
    expect(state().statusMessage).toMatch(/current layer/i)
  })

  it('counts what is drawn on each layer', () => {
    const layerId = layers()[0].id
    state().updateDocument((doc) => ({
      ...doc,
      entities: [createLine(layerId, { x: 0, y: 0 }, { x: 1, y: 0 })],
    }))
    render(<LayerPanel />)

    expect(screen.getByTitle('0 — 1 object(s)')).toBeInTheDocument()
  })

  it('moves the selection onto a layer from the row button', () => {
    state().addLayer()
    const [home, walls] = layers()
    const line = createLine(home.id, { x: 0, y: 0 }, { x: 8, y: 0 })
    state().updateDocument((doc) => ({ ...doc, entities: [line] }))
    state().setSelection([line.id])
    render(<LayerPanel />)

    fireEvent.click(screen.getByRole('button', { name: `Move selection to ${walls.name}` }))

    expect(state().doc.entities[0].layerId).toBe(walls.id)
  })

  it('keeps the move-here buttons quiet until something is selected', () => {
    state().addLayer()
    render(<LayerPanel />)

    expect(screen.getByRole('button', { name: 'Move selection to 0' })).toBeDisabled()
  })

  it('offers move-to-current and make-current from the options menu', () => {
    state().addLayer()
    const [home, walls] = layers()
    const line = createLine(walls.id, { x: 0, y: 0 }, { x: 8, y: 0 })
    state().updateDocument((doc) => ({ ...doc, entities: [line] }))
    state().setSelection([line.id])
    state().setActiveLayerId(home.id)
    render(<LayerPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Layer options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Make object's layer current/ }))
    expect(state().activeLayerId).toBe(walls.id)

    state().setActiveLayerId(home.id)
    fireEvent.click(screen.getByRole('button', { name: 'Layer options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Move selection to current layer/ }))
    expect(state().doc.entities[0].layerId).toBe(home.id)
  })
})
