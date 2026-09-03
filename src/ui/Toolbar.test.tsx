import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCadStore } from '../core/store'
import { Toolbar } from './Toolbar'

/** The flyout's face, which names the option currently in use. */
const flyout = (title: string) => screen.queryByRole('button', { name: new RegExp(`^${title}`, 'i') })
const menuItems = () => screen.queryAllByRole('menuitemradio')
const openMenu = (title: string) => {
  fireEvent.click(flyout(title)!)
  return menuItems()
}

describe('circle construction flyout', () => {
  beforeEach(() => {
    useCadStore.getState().setTool('select')
  })

  it('stays out of the way until CIRCLE is running', () => {
    render(<Toolbar />)
    expect(flyout('Centre, radius')).toBeNull()
  })

  it('takes only one button of ribbon width, showing the construction in use', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    expect(flyout('Centre, radius')).not.toBeNull()
    // The alternatives stay hidden until the flyout is opened.
    expect(menuItems()).toHaveLength(0)
  })

  it('drops down every construction when opened', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    expect(openMenu('Centre, radius').map((item) => item.textContent)).toEqual([
      'Centre, radius',
      'Centre, diameter',
      '2 point',
      '3 point',
      'Tan, tan, radius',
    ])
  })

  it('switches construction when one is chosen, and closes behind itself', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    fireEvent.click(openMenu('Centre, radius')[3])

    expect(useCadStore.getState().circleMode).toBe('3p')
    expect(menuItems()).toHaveLength(0)
    // The face now names the construction that was chosen.
    expect(flyout('3 point')).not.toBeNull()
  })

  it('marks which construction is in use when reopened', () => {
    useCadStore.getState().setTool('circle')
    useCadStore.getState().setCircleMode('ttr')
    render(<Toolbar />)

    const checked = openMenu('Tan, tan, radius').filter((item) => item.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0].textContent).toBe('Tan, tan, radius')
  })

  it('closes on Escape without changing anything', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)
    openMenu('Centre, radius')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(menuItems()).toHaveLength(0)
    expect(useCadStore.getState().circleMode).toBe('center')
  })

  it('closes when the pointer goes elsewhere', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)
    openMenu('Centre, radius')

    fireEvent.mouseDown(document.body)

    expect(menuItems()).toHaveLength(0)
  })

  it('draws a different glyph for each construction, so they can be told apart', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    const glyphs = openMenu('Centre, radius').map((item) => item.querySelector('svg')!.innerHTML)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })
})

describe('polygon fit flyout', () => {
  beforeEach(() => {
    useCadStore.getState().setTool('select')
    useCadStore.getState().setPolygonFit('inscribed')
  })

  it('offers the three ways of sizing a polygon, each with its own icon', () => {
    useCadStore.getState().setTool('polygon')
    render(<Toolbar />)

    const items = openMenu('Inscribed')
    expect(items.map((item) => item.textContent)).toEqual(['Inscribed', 'Circumscribed', 'By one edge'])
    for (const item of items) expect(item.querySelector('svg')).not.toBeNull()
  })

  it('tells the inscribed and circumscribed glyphs apart', () => {
    useCadStore.getState().setTool('polygon')
    render(<Toolbar />)

    const [inscribed, circumscribed] = openMenu('Inscribed').map((item) => item.querySelector('svg')!.innerHTML)
    expect(inscribed).not.toBe(circumscribed)
  })

  it('switches the fit when one is chosen', () => {
    useCadStore.getState().setTool('polygon')
    render(<Toolbar />)

    fireEvent.click(openMenu('Inscribed')[1])

    expect(useCadStore.getState().polygonFit).toBe('circumscribed')
    expect(flyout('Circumscribed')).not.toBeNull()
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
    expect(flyout('Centre, radius')).toBeNull()
  })
})
