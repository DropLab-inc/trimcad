import { describe, expect, it } from 'vitest'
import { COMMANDS, matchCommands, resolveCommand, shortestAlias } from './commandRegistry'

describe('resolveCommand', () => {
  it('finds a command by its canonical name', () => {
    expect(resolveCommand('CIRCLE')?.name).toBe('CIRCLE')
  })

  it('finds a command by alias, ignoring case and spacing', () => {
    expect(resolveCommand('l')?.name).toBe('LINE')
    expect(resolveCommand('  tr ')?.name).toBe('TRIM')
    expect(resolveCommand('rec')?.name).toBe('RECTANG')
  })

  it('returns null for text that names nothing', () => {
    expect(resolveCommand('NOPE')).toBeNull()
    expect(resolveCommand('')).toBeNull()
  })
})

describe('the command table', () => {
  it('never gives the same token to two commands', () => {
    const seen = new Map<string, string>()
    for (const command of COMMANDS) {
      for (const token of [command.name, ...command.aliases]) {
        expect(seen.has(token), `${token} is claimed by both ${seen.get(token)} and ${command.name}`).toBe(false)
        seen.set(token, command.name)
      }
    }
  })

  it('uses upper case throughout so typed input can be compared directly', () => {
    for (const command of COMMANDS) {
      expect(command.name).toBe(command.name.toUpperCase())
      for (const alias of command.aliases) expect(alias).toBe(alias.toUpperCase())
    }
  })

  it('reports the shortest way to reach a command', () => {
    expect(shortestAlias(resolveCommand('LINE')!)).toBe('L')
    expect(shortestAlias(resolveCommand('ALL')!)).toBe('ALL')
  })
})

describe('matchCommands', () => {
  it('puts an exact alias first even when other names start with the same letters', () => {
    expect(matchCommands('C')[0].name).toBe('CIRCLE')
  })

  it('lists every command starting with the text', () => {
    const names = matchCommands('DIM').map((command) => command.name)

    expect(names).toContain('DIMLINEAR')
    expect(names).toContain('DIMRADIUS')
    expect(names).toContain('DIM')
  })

  it('falls back to alias matches after name matches', () => {
    const names = matchCommands('E').map((command) => command.name)

    // ERASE is reached by the exact alias E, so it comes before names merely starting with E.
    expect(names[0]).toBe('ERASE')
    expect(names).toContain('ELLIPSE')
    expect(names).toContain('EXTEND')
  })

  it('returns nothing for empty input', () => {
    expect(matchCommands('')).toEqual([])
    expect(matchCommands('   ')).toEqual([])
  })

  it('returns nothing when the text matches no command', () => {
    expect(matchCommands('ZZZZ')).toEqual([])
  })
})
