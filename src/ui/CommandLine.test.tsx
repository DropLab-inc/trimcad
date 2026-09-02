import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDefaultDocument } from '../core/document'
import { applyDrawTool, useCadStore } from '../core/store'
import { CommandLine } from './CommandLine'

const state = () => useCadStore.getState()

/** Store changes made from outside an event handler still have to be flushed by React. */
const run = (line: string) => act(() => state().executeCommand(line))

beforeEach(() => {
  const store = useCadStore.getState()
  store.cancelCommand()
  store.setSelection([])
  store.updateDocument(() => makeDefaultDocument())
  store.setCommandInput('')
  // The store is a singleton, so the scrollback would otherwise carry over between tests.
  useCadStore.setState({ history: [] })
})

describe('the command line', () => {
  /**
   * Reading the prompt out of the store has to hand back something stable. Building it inside the
   * selector returns a new object every render, which React sees as an endless stream of changes.
   */
  it('renders without spinning on repeated store reads', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<CommandLine />)).not.toThrow()
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth|getSnapshot/)

    errors.mockRestore()
  })

  it('shows the idle prompt', () => {
    render(<CommandLine />)
    expect(screen.getByText(/Command/)).toBeInTheDocument()
  })

  it('keeps rendering as the running command changes', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<CommandLine />)

    run('LINE')
    act(() => applyDrawTool({ x: 0, y: 0 }))
    run('OFFSET')

    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth|getSnapshot/)
    errors.mockRestore()
  })

  it('offers the options of the running command as buttons', () => {
    render(<CommandLine />)
    run('OFFSET')

    // OFFSET opens with [Through/Erase/Layer].
    expect(screen.getByRole('button', { name: 'Through' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erase' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Layer' })).toBeInTheDocument()
  })

  it('runs an option when its button is clicked', () => {
    render(<CommandLine />)
    run('OFFSET')

    fireEvent.click(screen.getByRole('button', { name: 'Through' }))
    expect(state().offsetThrough).toBe(true)
  })

  it('shows no options at the idle prompt', () => {
    render(<CommandLine />)
    expect(screen.queryByRole('button', { name: 'Through' })).not.toBeInTheDocument()
  })

  it('runs what is typed when Enter is pressed', () => {
    render(<CommandLine />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'CIRCLE' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(state().activeTool).toBe('circle')
  })

  it('accepts a command on the space bar, as AutoCAD does', () => {
    render(<CommandLine />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'LINE' } })
    fireEvent.keyDown(input, { key: ' ' })

    expect(state().activeTool).toBe('line')
  })

  it('suggests commands as you type', () => {
    render(<CommandLine />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'CIR' } })

    expect(screen.getByText('CIRCLE')).toBeInTheDocument()
  })

  it('echoes what ran into the history', () => {
    render(<CommandLine />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'LINE' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('Command: LINE')).toBeInTheDocument()
  })
})
