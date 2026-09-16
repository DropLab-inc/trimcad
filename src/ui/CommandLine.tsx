import { useEffect, useMemo, useRef, useState } from 'react'
import { matchCommands, COMMANDS, type CommandDef } from '../core/commandRegistry'
import { currentPrompt, useCadStore } from '../core/store'
import { formatPrompt, matchKeyword } from '../core/prompts'
import { COMMAND_INPUT_ID, focusCommandInput } from './commandFocus'
import { Icon } from './Icon'
import { useFileActions } from './useFileActions'

/** The canvas focuses the input by id so any keystroke can start a command. */
export { COMMAND_INPUT_ID, focusCommandInput }

/** Whether what was typed already reaches a command, so Enter needs no help interpreting it. */
const reachesACommand = (typed: string): boolean => {
  const wanted = typed.toUpperCase()
  return COMMANDS.some(
    (command) => command.name === wanted || command.aliases.some((alias) => alias.toUpperCase() === wanted),
  )
}

/**
 * The suggestion Enter should take, or null when the typed text should be sent as written.
 *
 * The row that looks highlighted is the first one, so testing for `highlight > 0` — as this did — let
 * the line show CIRCLE highlighted and still answer "Unknown command CIRC". Anything that already
 * reaches a command is sent as written, and so is an answer to a prompt that wants text or a number:
 * a block name that happens to start with a command's letters has to go in untouched.
 */
export const completionFor = (
  typed: string,
  suggestions: CommandDef[],
  highlight: number,
  /** True while a prompt is waiting for text or a number, which is an answer rather than a command. */
  answering: boolean,
): CommandDef | null => {
  const wanted = typed.trim().toUpperCase()
  if (!wanted || answering || suggestions.length === 0) return null
  if (reachesACommand(wanted)) return null

  const highlighted = suggestions[highlight] ?? suggestions[0]
  return highlighted.name.toUpperCase().startsWith(wanted) ? highlighted : null
}

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

  /**
   * The option of the running prompt that what was typed names, if any.
   *
   * A prompt's bracketed options ARE commands of a sort, and the store reads one before it reads a
   * command name — `T` cuts edges during TRIM at the same time as it starts TEXT at an idle prompt.
   * So the line has to agree rather than "helpfully" completing the text: without this, `T` was
   * filled in as TEXT, `S` as SAVE and `R` as RECTANG, and most of the sub-menu in the command line
   * silently ran a different command instead of picking the option.
   */
  const option = useMemo(
    () => (prompt ? matchKeyword(value, prompt.keywords) : null),
    [prompt, value],
  )

  /**
   * A prompt waiting for text or a number is asking a question, so the line answers it literally —
   * and so does one of its own options, which is an answer too.
   */
  const answering = prompt?.kind === 'text' || prompt?.kind === 'number' || option !== null

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
    // The mirrored value in the on-canvas box belongs to the text that is being submitted, so it
    // goes with it rather than lingering in the box.
    mirrorTypedValue('')
    setHighlight(0)

    const fileCommand = fileCommands[command]
    if (fileCommand) {
      log('input', command)
      fileCommand()
      return
    }
    executeCommand(line)
  }

  /**
   * Shows what is being typed in the box it is going to fill.
   *
   * The keyboard on a phone is attached to this input, not to the drawing, so without this the
   * digits appear only in the bar at the bottom while the box the user tapped still reads its
   * tracked value — which looks exactly like the app ignoring the input.
   */
  const mirrorTypedValue = (text: string) => {
    // Anything a number pad can put on the way to a number is allowed through, so the box keeps
    // showing what is being typed instead of blanking: a comma on a keyboard in a comma-decimal
    // locale, a trailing separator, a lone minus sign. A predictive keyboard's trailing space is
    // trimmed off rather than treated as the end of the number. Text with no numeric character at
    // all — a command, a coordinate pair — is not a field value and clears the mirror instead.
    const value = text.trim()
    if (value !== '' && !/^-?[\d.,]*$/.test(value)) {
      useCadStore.getState().mirrorTypedValue('')
      return
    }
    useCadStore.getState().mirrorTypedValue(value)
  }

  /** Earlier inputs, newest first, for arrow-key recall. */
  const recallable = useMemo(
    () => history.filter((line) => line.kind === 'input').map((line) => line.text).reverse(),
    [history],
  )
  const [recallIndex, setRecallIndex] = useState(-1)

  /**
   * The value the field shows.
   *
   * While an on-screen keyboard is composing — and Android composes for plain digits too — the
   * browser owns the text and the composing characters are not in the store yet. Re-rendering the
   * input from the store mid-composition is what makes syllables vanish, double, or land out of
   * order, so the composing text is held here and only written through when the composition ends.
   */
  const [composing, setComposing] = useState<string | null>(null)
  const composingRef = useRef(false)
  const displayValue = composing ?? value

  const acceptText = (text: string) => {
    setValue(text)
    mirrorTypedValue(text)
    setHighlight(0)
    setRecallIndex(-1)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // A key event that belongs to a composition is the keyboard's, not the command line's.
    if (composingRef.current || event.nativeEvent.isComposing) return
    /*
     * Enter submits. Space does too, which is how AutoCAD accepts a COMMAND — but only on a keyboard
     * that cannot insert one by itself (predictive keyboards add a trailing space as the user types,
     * and treating that as Enter runs a command before the word is finished) and never while a prompt
     * is waiting for words. A note is mostly spaces: with space accepting the line, `NOTES SEE SHEET`
     * arrived as three separate text objects, one per word, because TEXT asks for the next line after
     * every one of them.
     */
    const spaceSubmits = event.key === ' ' && !navigator.maxTouchPoints && prompt?.kind !== 'text'
    if (event.key === 'Enter' || spaceSubmits || event.keyCode === 13) {
      event.preventDefault()
      // Enter takes the suggestion on show when what was typed cannot stand on its own.
      const completion = completionFor(value, suggestions, highlight, answering)
      runCommand(completion ? completion.name : value)
      setRecallIndex(-1)
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
          {/*
            * A form so the soft keyboard's action key has something to submit. Android and iOS
            * both submit a form from the Go/Done key even when the key event itself arrives as
            * "Unidentified", which is the shape the key handler cannot catch on its own.
            */}
          <form
            className="command-entry-form"
            onSubmit={(event) => {
              event.preventDefault()
              // The soft keyboard's Go key means the same as Enter, completion included.
              const completion = completionFor(value, suggestions, highlight, answering)
              runCommand(completion ? completion.name : value)
              setRecallIndex(-1)
            }}
          >
            <input
              id={COMMAND_INPUT_ID}
              value={displayValue}
              onChange={(event) => {
                // Mid-composition the browser's text is ahead of the store; hold it locally.
                if (composingRef.current) {
                  setComposing(event.target.value)
                  return
                }
                setComposing(null)
                acceptText(event.target.value)
              }}
              onCompositionStart={() => {
                composingRef.current = true
                setComposing(value)
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false
                setComposing(null)
                acceptText((event.target as HTMLInputElement).value)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a command, or press Enter to repeat the last one"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              enterKeyHint="enter"
              spellCheck={false}
            />
          </form>
          {suggestions.length > 0 && option === null && (
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
