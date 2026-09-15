import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCadStore } from '../core/store'
import { Toolbar } from './Toolbar'

/** The dropdown a ribbon field wraps, found through the field's tooltip. */
const dropdown = (titleFragment: string): HTMLSelectElement | null => {
  const field = screen
    .queryAllByTitle(new RegExp(titleFragment, 'i'))
    .find((element) => element.querySelector('select'))
  return field?.querySelector('select') ?? null
}

const optionLabels = (select: HTMLSelectElement) => [...select.options].map((option) => option.textContent)

/** The glyph shown beside a dropdown, which follows whichever option is chosen. */
const glyphBeside = (select: HTMLSelectElement) => select.closest('label')!.querySelector('svg')!.innerHTML

describe('circle construction dropdown', () => {
  beforeEach(() => {
    useCadStore.getState().setTool('select')
  })

  it('stays out of the way until CIRCLE is running', () => {
    render(<Toolbar />)
    expect(dropdown('how the circle is pinned down')).toBeNull()
  })

  it('lists every construction in the box, so they can all be seen at once', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    expect(optionLabels(dropdown('how the circle is pinned down')!)).toEqual([
      'Centre, radius',
      'Centre, diameter',
      '2 point',
      '3 point',
      'Tan, tan, radius',
    ])
  })

  it('opens on the construction in use', () => {
    useCadStore.getState().setTool('circle')
    useCadStore.getState().setCircleMode('ttr')
    render(<Toolbar />)

    expect(dropdown('how the circle is pinned down')!.value).toBe('ttr')
  })

  it('switches construction when another is picked', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)

    fireEvent.change(dropdown('how the circle is pinned down')!, { target: { value: '3p' } })

    expect(useCadStore.getState().circleMode).toBe('3p')
  })

  it('shows an icon beside the box that follows the choice', () => {
    useCadStore.getState().setTool('circle')
    render(<Toolbar />)
    const select = dropdown('how the circle is pinned down')!
    const before = glyphBeside(select)

    fireEvent.change(select, { target: { value: 'ttr' } })

    expect(glyphBeside(dropdown('how the circle is pinned down')!)).not.toBe(before)
  })

  it('draws a different glyph for each construction, so they can be told apart', () => {
    useCadStore.getState().setTool('circle')
    const { rerender } = render(<Toolbar />)

    const glyphs = new Set<string>()
    for (const mode of ['center', 'diameter', '2p', '3p', 'ttr'] as const) {
      useCadStore.getState().setCircleMode(mode)
      rerender(<Toolbar />)
      glyphs.add(glyphBeside(dropdown('how the circle is pinned down')!))
    }
    expect(glyphs.size).toBe(5)
  })
})

describe('polygon fit dropdown', () => {
  const fit = () => dropdown('corners or the flats|sit on the circle|sides sit against|single side')

  beforeEach(() => {
    useCadStore.getState().setTool('select')
    useCadStore.getState().setPolygonFit('inscribed')
  })

  it('lists the three ways of sizing a polygon', () => {
    useCadStore.getState().setTool('polygon')
    render(<Toolbar />)

    expect(optionLabels(fit()!)).toEqual(['Inscribed', 'Circumscribed', 'By one edge'])
  })

  it('switches the fit when another is picked', () => {
    useCadStore.getState().setTool('polygon')
    render(<Toolbar />)

    fireEvent.change(fit()!, { target: { value: 'circumscribed' } })

    expect(useCadStore.getState().polygonFit).toBe('circumscribed')
  })

  it('tells the inscribed and circumscribed glyphs apart', () => {
    useCadStore.getState().setTool('polygon')
    const { rerender } = render(<Toolbar />)
    const inscribed = glyphBeside(fit()!)

    useCadStore.getState().setPolygonFit('circumscribed')
    rerender(<Toolbar />)

    expect(glyphBeside(fit()!)).not.toBe(inscribed)
  })
})

describe('arc construction dropdown', () => {
  beforeEach(() => {
    useCadStore.getState().setTool('select')
  })

  it('stays out of the way until ARC is running', () => {
    render(<Toolbar />)
    expect(dropdown('how the arc is pinned down')).toBeNull()
  })

  it('lists every construction in the box', () => {
    useCadStore.getState().setTool('arc')
    render(<Toolbar />)

    expect(optionLabels(dropdown('how the arc is pinned down')!)).toEqual([
      'Centre, start, end',
      '3 point',
      'Start, centre, end',
      'Start, centre, angle',
    ])
  })

  it('switches construction when another is picked', () => {
    useCadStore.getState().setTool('arc')
    render(<Toolbar />)

    fireEvent.change(dropdown('how the arc is pinned down')!, { target: { value: '3p' } })

    expect(useCadStore.getState().arcMode).toBe('3p')
  })
})

describe('rectangle construction dropdown', () => {
  beforeEach(() => {
    useCadStore.getState().setTool('select')
  })

  it('stays out of the way until RECTANG is running', () => {
    render(<Toolbar />)
    expect(dropdown('how the rectangle is pinned down')).toBeNull()
  })

  it('lists every construction in the box', () => {
    useCadStore.getState().setTool('rect')
    render(<Toolbar />)

    expect(optionLabels(dropdown('how the rectangle is pinned down')!)).toEqual([
      'Two corners',
      'Centre, corner',
      'Dimensions',
    ])
  })

  it('switches construction when another is picked', () => {
    useCadStore.getState().setTool('rect')
    render(<Toolbar />)

    fireEvent.change(dropdown('how the rectangle is pinned down')!, { target: { value: 'center' } })

    expect(useCadStore.getState().rectMode).toBe('center')
  })
})

describe('the Edges control during TRIM and EXTEND', () => {
  const edgesButton = () =>
    screen.getByText(/All objects|Picking…|chosen/).closest('button') as HTMLButtonElement

  beforeEach(() => {
    useCadStore.getState().setTool('select')
    useCadStore.setState({ edgeIds: null, pickingEdges: false })
  })

  it('is not offered by commands that have no edges to pick', () => {
    render(<Toolbar />)
    expect(screen.queryByText('All objects')).toBeNull()
  })

  it('narrows to chosen edges and back to every object in one click each', () => {
    useCadStore.getState().setTool('trim')
    render(<Toolbar />)
    expect(edgesButton().textContent).toBe('All objects')

    fireEvent.click(edgesButton())
    expect(useCadStore.getState().pickingEdges).toBe(true)
    expect(edgesButton().textContent).toBe('Picking…')

    // Clicking again is how the option is turned off: while picking, no edges are chosen yet, so
    // testing the chosen set alone left this button re-entering the same state and no way back.
    fireEvent.click(edgesButton())
    expect(useCadStore.getState().pickingEdges).toBe(false)
    expect(useCadStore.getState().edgeIds).toBeNull()
    expect(edgesButton().textContent).toBe('All objects')
  })

  it('drops a chosen set back to every object', () => {
    useCadStore.getState().setTool('extend')
    useCadStore.setState({ edgeIds: ['a', 'b'] })
    render(<Toolbar />)
    expect(edgesButton().textContent).toBe('2 chosen')

    fireEvent.click(edgesButton())

    expect(useCadStore.getState().edgeIds).toBeNull()
    expect(edgesButton().textContent).toBe('All objects')
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
    expect(dropdown('how the circle is pinned down')).toBeNull()
  })
})
