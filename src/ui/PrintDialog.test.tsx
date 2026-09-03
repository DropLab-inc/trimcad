import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createLine } from '../core/commands'
import { DEFAULT_PRINT_OPTIONS } from '../core/print'
import { closePrintDialog, getPrintSession, openPrintDialog } from '../core/printSession'
import { useCadStore } from '../core/store'
import { PrintDialog } from './PrintDialog'

const seed = () => {
  closePrintDialog()
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.setTool('select')
  state.updateDocument((doc) => ({ ...doc, entities: [], groups: [] }))
  useCadStore.setState({ history: [] })
}

const open = (patch?: Parameters<typeof openPrintDialog>[0]['patch']) => {
  openPrintDialog({
    camera: useCadStore.getState().camera,
    selectedIds: useCadStore.getState().selectedIds,
    patch,
  })
  return render(<PrintDialog />)
}

describe('the Plot dialog', () => {
  beforeEach(seed)

  it('stays out of the way until Plot is started', () => {
    render(<PrintDialog />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens with the common plot options', () => {
    open()

    expect(screen.getByRole('dialog', { name: 'Plot' })).toBeInTheDocument()
    expect(screen.getByLabelText('Size')).toBeInTheDocument()
    expect(screen.getByLabelText('Orientation')).toBeInTheDocument()
    expect(screen.getByLabelText('What to plot')).toBeInTheDocument()
    expect(screen.getByLabelText('Scale')).toBeInTheDocument()
    expect(screen.getByLabelText('Center on paper')).toBeInTheDocument()
  })

  it('lists the usual paper sizes', () => {
    open()
    const size = screen.getByLabelText('Size')
    const labels = [...size.querySelectorAll('option')].map((option) => option.textContent ?? '')
    expect(labels.some((label) => label.includes('A3'))).toBe(true)
    expect(labels.some((label) => label.includes('Letter'))).toBe(true)
    expect(labels.some((label) => label.includes('Tabloid'))).toBe(true)
  })

  it('switches the plot area to a window and asks for the corners', () => {
    open()
    fireEvent.change(screen.getByLabelText('What to plot'), { target: { value: 'window' } })

    expect(getPrintSession().options.area).toBe('window')
    expect(screen.getByRole('button', { name: /Select window/ })).toBeInTheDocument()
    expect(screen.getByText(/Pick two corners/)).toBeInTheDocument()
  })

  it('refuses to plot a window that has not been picked', () => {
    open({ area: 'window', window: null })

    expect(screen.getByRole('button', { name: 'Plot' })).toBeDisabled()
  })

  it('refuses to plot an empty selection', () => {
    open({ area: 'selection' })

    expect(screen.getByText(/Select something/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plot' })).toBeDisabled()
  })

  it('lets a selection plot once something is chosen', () => {
    const line = createLine(useCadStore.getState().doc.layers[0].id, { x: 0, y: 0 }, { x: 40, y: 0 })
    useCadStore.getState().updateDocument((doc) => ({ ...doc, entities: [line] }))
    useCadStore.getState().setSelection([line.id])
    open({ area: 'selection' })

    expect(screen.getByRole('button', { name: 'Plot' })).not.toBeDisabled()
  })

  it('changes the scale', () => {
    open()
    fireEvent.change(screen.getByLabelText('Scale'), { target: { value: '1:10' } })

    expect(getPrintSession().options.scaleMode).toBe('1:10')
  })

  it('offers a custom units-per-millimetre field', () => {
    open({ scaleMode: 'custom', customScale: 5 })

    fireEvent.change(screen.getByLabelText('Units / mm'), { target: { value: '25' } })
    expect(getPrintSession().options.customScale).toBe(25)
  })

  it('toggles centering', () => {
    open({ center: true })
    fireEvent.click(screen.getByLabelText('Center on paper'))

    expect(getPrintSession().options.center).toBe(false)
  })

  it('changes the paper and the orientation', () => {
    open()
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'a3' } })
    fireEvent.change(screen.getByLabelText('Orientation'), { target: { value: 'portrait' } })

    expect(getPrintSession().options.paper).toBe('a3')
    expect(getPrintSession().options.orientation).toBe('portrait')
  })

  it('puts the options back to the defaults', () => {
    open({ paper: 'a3', scaleMode: '1:50', center: false, marginMm: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'Defaults' }))

    expect(getPrintSession().options).toMatchObject({
      paper: DEFAULT_PRINT_OPTIONS.paper,
      scaleMode: DEFAULT_PRINT_OPTIONS.scaleMode,
      center: DEFAULT_PRINT_OPTIONS.center,
      marginMm: DEFAULT_PRINT_OPTIONS.marginMm,
    })
  })

  it('closes on Escape', () => {
    open()
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(getPrintSession().open).toBe(false)
  })

  it('closes when Cancel is clicked', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('steps aside to pick a window', () => {
    open({ area: 'window' })
    fireEvent.click(screen.getByRole('button', { name: /Select window/ }))

    expect(getPrintSession().open).toBe(false)
    expect(getPrintSession().pickingWindow).toBe(true)
  })
})
