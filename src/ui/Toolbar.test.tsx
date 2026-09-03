import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCadStore } from '../core/store'
import { Toolbar } from './Toolbar'

describe('circle construction buttons', () => {
  const modeButtons = () =>
    screen.queryAllByRole('button').filter((button) => /^(Centre|2 point|3 point|Tan)/.test(button.textContent ?? ''))

  beforeEach(() => {
    useCadStore.getState().setTool('select')
  })

  it('stays out of the way until CIRCLE is running', () => {
    render(<Toolbar />)
    expect(modeButtons()).toHaveLength(0)
  })

  it('offers one button per construction once CIRCLE starts', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    expect(modeButtons().map((button) => button.textContent)).toEqual([
      'Centre, radius',
      'Centre, diameter',
      '2 point',
      '3 point',
      'Tan, tan, radius',
    ])
  })

  it('marks the construction in use, starting on centre and radius', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    const [centre, diameter] = modeButtons()
    expect(centre.className).toContain('active')
    expect(diameter.className).not.toContain('active')
  })

  it('switches construction when a button is pressed', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    fireEvent.click(modeButtons()[3])

    expect(useCadStore.getState().circleMode).toBe('3p')
    expect(modeButtons()[3].className).toContain('active')
  })

  it('gives each button an icon rather than text alone', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    for (const button of modeButtons()) {
      expect(button.querySelector('svg')).not.toBeNull()
    }
  })

  it('draws a different glyph for each construction, so they can be told apart', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    const glyphs = modeButtons().map((button) => button.querySelector('svg')!.innerHTML)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })
})

describe('ribbon fields belong to the command that uses them', () => {
  const sidesBox = () => screen.queryByTitle('Number of polygon sides')

  beforeEach(() => {
    useCadStore.getState().setTool('select')
  })

  it('hides the sides box while no command needs it', () => {
    render(<Toolbar />)
    expect(sidesBox()).toBeNull()
  })

  it('hides the sides box during commands that have nothing to do with polygons', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)
    expect(sidesBox()).toBeNull()
  })

  it('shows the sides box for POLYGON', () => {
    useCadStore.getState().setTool('polygon')
    render(<Toolbar />)
    expect(sidesBox()).not.toBeNull()
  })

  it('keeps the circle constructions out of the polygon command', () => {
    useCadStore.getState().setTool('polygon')
    render(<Toolbar />)
    expect(modeButtonsIn(screen)).toHaveLength(0)
  })
})

/** The circle construction buttons, found by their labels wherever they are rendered. */
const modeButtonsIn = (within: typeof screen) =>
  within.queryAllByRole('button').filter((button) => /^(Centre|2 point|3 point|Tan)/.test(button.textContent ?? ''))
