import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS } from '../core/commandRegistry'
import { makeDefaultDocument } from '../core/document'
import { applyDrawTool, useCadStore } from '../core/store'
import { CommandLine, completionFor } from './CommandLine'

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

const circle = COMMANDS.find((command) => command.name === 'CIRCLE')!
const line = COMMANDS.find((command) => command.name === 'LINE')!

describe('completing what was typed', () => {
  it('takes the highlighted suggestion for a partial that reaches nothing on its own', () => {
    expect(completionFor('CIRC', [circle], 0, false)?.name).toBe('CIRCLE')
  })

  it('leaves text that already reaches a command exactly as typed', () => {
    // Nothing to decide: REC reaches RECTANG, and an answer of "L" must stay the answer "L".
    expect(completionFor('REC', [circle], 0, false)).toBeNull()
    expect(completionFor('L', [circle], 0, false)).toBeNull()
  })

  it('refuses to complete an answer to a prompt', () => {
    expect(completionFor('CIRC', [circle], 0, true)).toBeNull()
  })

  it('takes the suggestion that is highlighted, not simply the first', () => {
    expect(completionFor('LI', [circle, line], 1, false)?.name).toBe('LINE')
    // And with the highlight elsewhere, "LI" is the start of nothing on offer.
    expect(completionFor('LI', [circle, line], 0, false)).toBeNull()
  })

  it('never invents a command the text is not the start of', () => {
    expect(completionFor('ZZZ', [circle], 0, false)).toBeNull()
    expect(completionFor('', [circle], 0, false)).toBeNull()
    expect(completionFor('CIRC', [], 0, false)).toBeNull()
  })
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

  it('never takes a space as Enter while a prompt is waiting for words', () => {
    /*
     * A note is mostly spaces. With space accepting the line, `NOTES SEE SHEET` arrived as three text
     * objects one line apart, because TEXT asks for the next line after every one of them.
     */
    render(<CommandLine />)
    state().setTool('text')
    useCadStore.setState({ textPending: 'text', draftPoints: [{ x: 0, y: 0 }] })
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'NOTES' } })
    fireEvent.keyDown(input, { key: ' ' })

    expect(state().doc.entities).toHaveLength(0)
    expect(state().activeTool).toBe('text')
    expect(input).toHaveValue('NOTES')
  })

  it('still takes a space as Enter for a command, as AutoCAD does', () => {
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

  it('completes the highlighted suggestion when Enter is pressed', () => {
    render(<CommandLine />)
    const input = screen.getByRole('textbox')

    // "CIRC" reaches no command on its own, but CIRCLE is on show and drawn as highlighted — so Enter
    // takes it instead of answering "Unknown command CIRC", which is what it used to do.
    fireEvent.change(input, { target: { value: 'CIRC' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(state().activeTool).toBe('circle')
  })

  it('sends text that already reaches a command as written', () => {
    render(<CommandLine />)
    const input = screen.getByRole('textbox')

    // REC is RECTANG's own alias, so no completion is needed and none should be invented.
    fireEvent.change(input, { target: { value: 'REC' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(state().activeTool).toBe('rect')
  })

  it('does not complete while a prompt is waiting for an answer', () => {
    render(<CommandLine />)
    const input = screen.getByRole('textbox')
    // INSERT is asking for a block name, and "CI" happens to start CIRCLE — but a name is what was
    // typed. Completing it would make any block unreachable by a name that looks like a command.
    run('INSERT')
    fireEvent.change(input, { target: { value: 'CI' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(state().activeTool).toBe('insert')
    expect(state().history.at(-1)!.text).toMatch(/No block named "CI"/)
  })

  it('echoes what ran into the history', () => {
    render(<CommandLine />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'LINE' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('Command: LINE')).toBeInTheDocument()
  })

  /*
   * A phone has no keyboard until something has focus, so typing a length or a
   * coordinate while drawing depends entirely on these two ways in.
   */
  describe('typing on a touch screen', () => {
    it('raises the keyboard from the button beside the field', () => {
      render(<CommandLine />)
      const input = screen.getByRole('textbox')
      input.blur()
      expect(document.activeElement).not.toBe(input)

      fireEvent.pointerDown(screen.getByRole('button', { name: /type a value/i }))
      expect(document.activeElement).toBe(input)
    })

    it('treats a tap on the prompt as a tap on the field', () => {
      run('LINE')
      render(<CommandLine />)
      const input = screen.getByRole('textbox')
      input.blur()

      const prompt = document.querySelector('.command-prompt')
      expect(prompt?.textContent).toMatch(/Specify first point/)
      fireEvent.pointerDown(prompt as HTMLElement)
      expect(document.activeElement).toBe(input)
    })

    it('does not steal a tap meant for one of the prompt options', () => {
      // TRIM asks for the cutting edges in its first prompt, so it offers options straight away.
      run('TRIM')
      render(<CommandLine />)
      const input = screen.getByRole('textbox')
      input.blur()
      const option = screen.getByRole('button', { name: 'Undo' })

      fireEvent.pointerDown(option)
      fireEvent.click(option)

      // The keyword ran; the caret did not jump into the field as a side effect.
      expect(document.activeElement).not.toBe(input)
    })

    /*
     * A soft keyboard's action key is not a normal key event on every device. Android's Go key
     * arrives as "Unidentified" with keyCode 229 on plenty of builds, and matching on `key` alone
     * left the typed value sitting in the field, which reads as the app ignoring the input.
     */
    it('submits when the soft keyboard sends an unlabelled action key', () => {
      render(<CommandLine />)
      const input = screen.getByRole('textbox')

      fireEvent.change(input, { target: { value: 'LINE' } })
      fireEvent.keyDown(input, { key: 'Unidentified', keyCode: 13 })

      expect(screen.getByText('Command: LINE')).toBeInTheDocument()
    })

    it('has a form for the action key to submit, and submits what is in it', () => {
      render(<CommandLine />)
      const input = screen.getByRole('textbox')
      // The IME action submits the form natively; without one there is nothing to submit.
      const form = input.closest('form')
      expect(form).not.toBeNull()

      fireEvent.change(input, { target: { value: 'CIRCLE' } })
      fireEvent.submit(form as HTMLFormElement)

      expect(screen.getByText('Command: CIRCLE')).toBeInTheDocument()
      expect((input as HTMLInputElement).value).toBe('')
    })

    it('puts the caret at the end of whatever is already in the field', () => {
      render(<CommandLine />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      fireEvent.change(input, { target: { value: '20' } })
      // A tap can leave the caret in the middle, and text inserted there is how a value comes out
      // as "02" instead of "20".
      input.setSelectionRange(0, 0)

      fireEvent.pointerDown(screen.getByRole('button', { name: /type a value/i }))

      expect(input.selectionStart).toBe(2)
      expect(input.selectionEnd).toBe(2)
    })

    /*
     * An on-screen keyboard composes, and Android composes for plain digits. Re-rendering the input
     * from the store while the browser still owns the composing text is how characters vanish,
     * double, or land in the wrong order.
     */
    it('keeps composing text out of the store until the keyboard commits it', () => {
      render(<CommandLine />)
      const input = screen.getByRole('textbox') as HTMLInputElement

      fireEvent.compositionStart(input)
      fireEvent.change(input, { target: { value: '2' } })
      expect(input.value).toBe('2')
      expect(state().commandInput).toBe('')

      fireEvent.change(input, { target: { value: '20' } })
      expect(input.value).toBe('20')
      expect(state().commandInput).toBe('')

      fireEvent.compositionEnd(input, { data: '20' })
      expect(state().commandInput).toBe('20')
    })

    it('does not run a command from a space a predictive keyboard inserted', () => {
      // A phone keyboard adds the space itself, so a space must not submit there.
      const descriptor = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints')
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, configurable: true })
      try {
        render(<CommandLine />)
        const input = screen.getByRole('textbox')
        fireEvent.change(input, { target: { value: 'LINE' } })
        fireEvent.keyDown(input, { key: ' ' })

        // Nothing ran, and the half-typed word is still there.
        expect(state().activeTool).toBe('select')
        expect(input).toHaveValue('LINE')
      } finally {
        if (descriptor) Object.defineProperty(navigator, 'maxTouchPoints', descriptor)
        else Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
      }
    })
  })
})
