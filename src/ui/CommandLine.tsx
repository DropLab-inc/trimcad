import { useEffect, useMemo, useRef, useState } from 'react'
import { matchCommands, type CommandDef } from '../core/commandRegistry'
import { exportDocumentToDxf, importDocumentFromDxf } from '../core/dxf'
import { exportPdf } from '../core/print'
import { currentPrompt, useCadStore } from '../core/store'
import { formatPrompt } from '../core/prompts'

/** The canvas focuses the input by id so any keystroke can start a command. */
export const COMMAND_INPUT_ID = 'cad-command-input'

/** Commands that need the DOM directly, so they stay with the component that owns the file input. */
const FILE_COMMANDS = new Set(['DXFIN', 'DXFOUT', 'PLOT', 'PLOT1', 'PRINT'])

export function CommandLine() {
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)
  const [highlight, setHighlight] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const doc = useCadStore((state) => state.doc)
  const value = useCadStore((state) => state.commandInput)
  const setValue = useCadStore((state) => state.setCommandInput)
  const history = useCadStore((state) => state.history)
  const executeCommand = useCadStore((state) => state.executeCommand)
  const updateDocument = useCadStore((state) => state.updateDocument)
  const log = useCadStore((state) => state.log)
  const promptText = useCadStore((state) => formatPrompt(currentPrompt(state)))

  const suggestions = useMemo(() => matchCommands(value).slice(0, 8), [value])

  // Keep the newest scrollback line in view as commands run.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [history])

  const runCommand = (line: string) => {
    const command = line.trim().toUpperCase()
    setValue('')
    setHighlight(0)

    if (FILE_COMMANDS.has(command)) {
      log('input', command)
      runFileCommand(command)
      return
    }
    executeCommand(line)
  }

  const runFileCommand = (command: string) => {
    if (command === 'DXFIN') {
      fileInput?.click()
      return
    }
    if (command === 'DXFOUT') {
      const blob = new Blob([exportDocumentToDxf(doc)], { type: 'application/dxf' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'drawing.dxf'
      link.click()
      URL.revokeObjectURL(link.href)
      log('result', 'Exported drawing.dxf')
      return
    }
    exportPdf(doc, command === 'PLOT1' ? '1:1' : 'fit')
    log('result', `Plotted at ${command === 'PLOT1' ? '1:1' : 'fit to page'}`)
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
    <section className="command-line">
      <div className="command-history" ref={scrollRef} role="log" aria-label="Command history">
        {history.slice(-40).map((line) => (
          <div key={line.id} className={`command-history-line ${line.kind}`}>
            {line.kind === 'input' ? `> ${line.text}` : line.text}
          </div>
        ))}
      </div>

      <div className="command-entry">
        <span className="command-prompt">{promptText}</span>
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
      </div>

      <input
        ref={setFileInput}
        style={{ display: 'none' }}
        type="file"
        accept=".dxf"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          const content = await file.text()
          updateDocument((draft) => importDocumentFromDxf(content, draft))
          log('result', `Imported ${file.name}`)
        }}
      />
    </section>
  )
}

const aliasLabel = (command: CommandDef): string => (command.aliases.length > 0 ? command.aliases[0] : '')
