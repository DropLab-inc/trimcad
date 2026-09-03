import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLine } from '../core/commands'
import { useCadStore } from '../core/store'
import { FileMenu } from './FileMenu'

const seed = () => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.setTool('select')
  state.updateDocument((doc) => ({ ...doc, entities: [], groups: [] }))
  useCadStore.setState({ history: [], clipboard: [], fileName: 'Drawing1.dlc' })
}

describe('the File menu', () => {
  beforeEach(seed)

  it('stays out of the way until it is opened', () => {
    render(<FileMenu />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('drops down the file commands when clicked', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    const labels = screen
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('.file-menu-label')?.textContent)
    expect(labels).toEqual(['New', 'Open…', 'Save', 'Save As…', 'Plot…'])
  })

  it('shows the shortcut beside the commands that have one', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))

    expect(screen.getByRole('menuitem', { name: 'New' })).toHaveTextContent('Ctrl+N')
    expect(screen.getByRole('menuitem', { name: 'Save' })).toHaveTextContent('Ctrl+S')
    expect(screen.getByRole('menuitem', { name: 'Save As…' })).toHaveTextContent('Ctrl+Shift+S')
    expect(screen.getByRole('menuitem', { name: 'Plot…' })).toHaveTextContent('Ctrl+P')
  })

  it('closes again once a command is chosen', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when Escape is pressed', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when the pointer goes elsewhere', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('names the drawing being edited', () => {
    useCadStore.setState({ fileName: 'site-plan.dlc' })
    render(<FileMenu />)
    expect(screen.getByText('site-plan.dlc')).toBeInTheDocument()
  })

  it('checks before throwing away a drawing that has something in it', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    useCadStore.getState().updateDocument((doc) => ({
      ...doc,
      entities: [createLine(layerId, { x: 0, y: 0 }, { x: 10, y: 0 })],
    }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New' }))

    expect(confirm).toHaveBeenCalled()
    expect(useCadStore.getState().doc.entities).toHaveLength(1)
    confirm.mockRestore()
  })

  it('starts the new drawing once that is confirmed', () => {
    const layerId = useCadStore.getState().doc.layers[0].id
    useCadStore.getState().updateDocument((doc) => ({
      ...doc,
      entities: [createLine(layerId, { x: 0, y: 0 }, { x: 10, y: 0 })],
    }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New' }))

    expect(useCadStore.getState().doc.entities).toHaveLength(0)
    confirm.mockRestore()
  })
})
