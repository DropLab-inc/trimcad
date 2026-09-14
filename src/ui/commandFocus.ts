/**
 * The command input, and how to get the caret into it.
 *
 * Kept in its own module because three places need it: the command line itself,
 * the canvas (any keystroke starts a command), and the on-canvas value boxes,
 * which on a touch screen are the only way to say "type this one".
 */
export const COMMAND_INPUT_ID = 'cad-command-input'

export function focusCommandInput(): void {
  const input = document.getElementById(COMMAND_INPUT_ID) as HTMLInputElement | null
  if (!input) return
  input.focus()
  /*
   * The caret goes to the end. A tap can leave it where the finger landed, and text inserted at a
   * caret in the middle of a value produces exactly the scrambled number a user reads as "it typed
   * 02 instead of 20".
   */
  if (typeof input.setSelectionRange === 'function') {
    const end = input.value.length
    input.setSelectionRange(end, end)
  }
  // The on-screen keyboard is about to cover the bottom of the window. jsdom has
  // no layout, so the call is not always there to make.
  if (typeof input.scrollIntoView === 'function') input.scrollIntoView({ block: 'nearest' })
}
