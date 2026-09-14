import { useEffect, useMemo, useRef, useState } from 'react'
import { matchCommands, type CommandDef } from '../core/commandRegistry'
import { currentPrompt, useCadStore } from '../core/store'
import { formatPrompt } from '../core/prompts'
import { COMMAND_INPUT_ID, focusCommandInput } from './commandFocus'
import { Icon } from './Icon'
import { useFileActions } from './useFileActions'

/** The canvas focuses the input by id so any keystroke can start a command. */
export { COMMAND_INPUT_ID, focusCommandInput }

export function CommandLine() {
  const [highlight, setHighlight] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const files = useFileActions()

  const value = useCadStore((state) => state.commandInput)
  const setValue = useCadStore((state) => state.setCommandInput)
  const history = useCadStore((state) => state.history)
  const executeCommand = useCadStore((state) => state.executeCommand)
  const log = useCadStore((state) => state.log)
  const applyKeyword = useCadStore((state) => state.applyKeyword)
  /**
   * The prompt is needed whole, so its options can be rendered as buttons. Building it inside the
   * selector would hand back a new object on every render and spin forever, so the subscription is
   * to the formatted text, which is a plain string that only changes when the prompt really does.
   */
  const promptText = useCadStore((state) => formatPrompt(currentPrompt(state)))
  const prompt = useMemo(() => currentPrompt(useCadStore.getState()), [promptText])

  /** Commands that reach for the file system, so they run through the shared file actions. */
  const fileCommands: Record<string, () => void> = {
    NEW: files.newDrawing,
    OPEN: () => void files.openDrawing(),
    SAVE: files.saveDrawing,
    SAVEAS: files.saveDrawingAs,
    // Drawings are DXF now, so importing and exporting are just opening and saving.
    DXFIN: () => void files.openDrawing(),
    IMPORT: () => void files.openDrawing(),
    DXFOUT: files.saveDrawing,
    EXPORT: files.saveDrawing,
    PLOT: () => files.print(),
    PRINT: () => files.print(),
    PLOT1: () => files.print({ scaleMode: '1:1' }),
  }

  const suggestions = useMemo(() => matchCommands(value).slice(0, 8), [value])

  // Keep the newest scrollback line in view as commands run.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [history, expanded])

  // F2 opens the taller history, as it does in AutoCAD, wherever the focus happens to be.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return
      event.preventDefault()
      setExpanded((open) => !open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const runCommand = (line: string) => {
    const command = line.trim().toUpperCase()
    setValue('')
    setHighlight(0)

    const fileCommand = fileCommands[command]
    if (fileCommand) {
      log('input', command)
      fileCommand()
      return
    }
    executeCommand(line)
  }

  /** Earlier inputs, newest first, for arrow-key recall. */
  const recallable = useMemo(
    () => history.filter((line) => line.kind === 'input').map((line) => line.text).reverse(),
    [history],
  )
  const [recallIndex, setRecallIndex] = useState(-1)

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Space submits just like Enter, which is how AutoCAD accepts a command.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      // Arrowing onto a suggestion runs that command rather than the raw text.
      const chosen = highlight > 0 ? suggestions[highlight] : null
      runCommand(chosen ? chosen.name : value)
      setRecallIndex(-1)
      return
    }
    if (event.key === 'Tab' && suggestions.length > 0) {
      event.preventDefault()
      setValue(suggestions[highlight].name)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (suggestions.length > 0) setHighlight((index) => (index + 1) % suggestions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (suggestions.length > 0) {
        setHighlight((index) => (index - 1 + suggestions.length) % suggestions.length)
        return
      }
      // With nothing to complete, walk back through what was typed before.
      const next = Math.min(recallIndex + 1, recallable.length - 1)
      if (next >= 0) {
        setRecallIndex(next)
        setValue(recallable[next])
      }
      return
    }
    if (event.key === 'Escape') {
      setValue('')
      setHighlight(0)
      setRecallIndex(-1)
    }
  }

  return (
    <section className={expanded ? 'command-line expanded' : 'command-line'}>
      <div className="command-history" ref={scrollRef} role="log" aria-label="Command history">
        {history.slice(expanded ? -400 : -40).map((line) => (
          <div key={line.id} className={`command-history-line ${line.kind}`}>
            {line.kind === 'input' ? `Command: ${line.text}` : line.text}
          </div>
        ))}
      </div>

      {/*
        * On a desktop you type wherever the crosshair is and the value boxes on
        * the canvas do the teaching. A phone has neither a cursor nor a keyboard
        * until asked, so the three forms worth knowing are written down here.
        */}
      <p className="command-hint">
        Type <b>10,20</b> for a point, <b>@50,0</b> to step from the last one, or <b>120&lt;45</b> for a
        length and angle.
      </p>

      <div className="command-entry">
        <span
          className="command-prompt"
          onPointerDown={(event) => {
            // Tapping the prompt is the same as tapping the field: the phone has
            // no keyboard to start typing into. Tapping an option still means the
            // option, so those stop this themselves.
            event.preventDefault()
            focusCommandInput()
          }}
        >
          {prompt.text}
          {prompt.keywords.length > 0 && (
            <>
              {' or ['}
              {prompt.keywords.map((keyword, index) => (
                <span key={keyword.label}>
                  {index > 0 && '/'}
                  <button
                    type="button"
                    className="prompt-option"
                    title={`Type ${keyword.key} or click`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      log('input', keyword.label)
                      applyKeyword(keyword)
                    }}
                  >
                    {keyword.label}
                  </button>
                </span>
              ))}
              {']'}
            </>
          )}
          {prompt.defaultValue ? ` <${prompt.defaultValue}>` : ''}:
        </span>
        <div className="command-input-wrap">
          <input
            id={COMMAND_INPUT_ID}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setHighlight(0)
              setRecallIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, or press Enter to repeat the last one"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            enterKeyHint="enter"
            spellCheck={false}
          />
          {suggestions.length > 0 && (
            <ul className="command-suggestions">
              {suggestions.map((command, index) => (
                <li key={command.name}>
                  <button
                    type="button"
                    className={index === highlight ? 'active' : ''}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      runCommand(command.name)
                    }}
                  >
                    <span className="suggestion-name">{command.name}</span>
                    <span className="suggestion-alias">{aliasLabel(command)}</span>
                    <span className="suggestion-summary">{command.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/*
          * The phone's keyboard only exists once something has focus. This raises
          * it, on its own, without the user having to find the input.
          */}
        <button
          type="button"
          className="command-type"
          aria-label="Type a value or a command"
          title="Type a value or a command"
          onPointerDown={(event) => {
            event.preventDefault()
            focusCommandInput()
          }}
        >
          <Icon name="keyboard" />
        </button>
      </div>

    </section>
  )
}

const aliasLabel = (command: CommandDef): string => (command.aliases.length > 0 ? command.aliases[0] : '')
