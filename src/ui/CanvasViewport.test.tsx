import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine, createPolygon, createRect } from '../core/commands'
import { resetPreferences, setPreference } from '../core/preferences'
import { useCadStore, EMPTY_TYPED } from '../core/store'
import type { Vec2 } from '../core/math/vec2'
import type { CadEntity, PolylineEntity } from '../core/types'
import { CanvasViewport } from './CanvasViewport'
import { canvasPalettes } from './theme'

/** Tests read colours from the palette, so a theme change does not need every assertion rewritten. */
const dark = canvasPalettes.dark

/**
 * jsdom reports a zero-origin bounding box for the SVG, so client coordinates map straight to
 * viewport coordinates. With the camera at the origin and zoom 1, screen and world coordinates
 * are identical, which makes the expected marker positions exact.
 */
const seed = (entities: CadEntity[]) => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.updateDocument((doc) => ({ ...doc, entities, groups: [] }))
  state.setCamera({ x: 0, y: 0, zoom: 1 })
  // Typed field values live in the store now, so they survive a test unless cleared here.
  state.setTypedState(EMPTY_TYPED)
  // Preferences persist across tests, so each one starts from the settings as shipped.
  resetPreferences()
}

const layerId = () => useCadStore.getState().doc.layers[0].id

const snapGlyph = (container: HTMLElement) => container.querySelector(`[stroke="${dark.snap}"]`)

describe('snap marker placement', () => {
  beforeEach(() => {
    seed([])
  })

  it('draws the endpoint marker at the endpoint, not under the raw cursor', () => {
    seed([createLine(layerId(), { x: 100, y: 100 }, { x: 300, y: 100 })])
    useCadStore.getState().setTool('line')

    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 296, clientY: 104 })

    expect(screen.getByText('endpoint')).toBeInTheDocument()
    const glyph = snapGlyph(container)
    expect(glyph).not.toBeNull()
    // The marker is a 14px square centred on the snap point at x=300, not on the cursor at x=296.
    expect(Number(glyph!.getAttribute('x'))).toBe(293)
    expect(Number(glyph!.getAttribute('y'))).toBe(93)
  })

  it('reports the snapped coordinates in the status readout', () => {
    seed([createLine(layerId(), { x: 100, y: 100 }, { x: 300, y: 100 })])
    useCadStore.getState().setTool('line')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 296, clientY: 104 })

    expect(screen.getByText(/X 300\.00 Y 100\.00/)).toBeInTheDocument()
  })

  it('labels a midpoint snap when hovering the middle of a segment', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 200, y: 0 })])
    useCadStore.getState().setTool('line')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 102, clientY: 3 })

    expect(screen.getByText('midpoint')).toBeInTheDocument()
  })

  it('labels a centre snap when hovering the middle of a circle', () => {
    seed([createCircle(layerId(), { x: 250, y: 250 }, 80)])
    useCadStore.getState().setTool('line')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 252, clientY: 248 })

    expect(screen.getByText('center')).toBeInTheDocument()
  })

  it('shows no marker in empty space', () => {
    seed([createLine(layerId(), { x: 0, y: 0 }, { x: 10, y: 0 })])
    useCadStore.getState().setTool('line')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 600, clientY: 400 })

    expect(snapGlyph(container)).toBeNull()
  })

  it('places the drawn point at the snapped location', () => {
    seed([createLine(layerId(), { x: 100, y: 100 }, { x: 300, y: 100 })])
    useCadStore.getState().setTool('line')

    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 296, clientY: 104 })
    fireEvent.mouseDown(svg, { clientX: 296, clientY: 104, button: 0 })

    expect(useCadStore.getState().draftPoints[0]).toEqual({ x: 300, y: 100 })
  })
})

describe('picking edges for FILLET', () => {
  const entities = () => useCadStore.getState().doc.entities
  const arcs = () => entities().filter((entity) => entity.type === 'arc')
  const click = (svg: Element, at: Vec2) => fireEvent.mouseDown(svg, { clientX: at.x, clientY: at.y, button: 0 })

  /** A point `by` units along the run from `from` towards `to`. */
  const towards = (from: Vec2, to: Vec2, by: number): Vec2 => {
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    return { x: from.x + ((to.x - from.x) / length) * by, y: from.y + ((to.y - from.y) / length) * by }
  }

  const armed = (radius: number) => {
    const state = useCadStore.getState()
    state.setFilletRadius(radius)
    state.executeCommand('FILLET')
    const { container } = render(<CanvasViewport />)
    return container.querySelector('svg')!
  }

  beforeEach(() => {
    seed([])
  })

  it('rounds a polygon corner even when both clicks fall inside snapping range of it', () => {
    // A hexagon's sides are short, so a click meaning "this edge" easily lands within the 12 unit
    // endpoint snap of the corner. Were the picks snapped, both would be dragged onto the shared
    // corner, name the same edge, and the corner would be refused.
    const hexagon = createPolygon(layerId(), { x: 300, y: 300 }, 100, 6) as PolylineEntity
    seed([hexagon])
    const [first, corner, third] = hexagon.points
    const svg = armed(10)

    click(svg, towards(corner, first, 8))
    click(svg, towards(corner, third, 8))

    expect(arcs()).toHaveLength(1)
    expect(useCadStore.getState().statusMessage).toBe('Filleted at radius 10')
  })

  it('still rounds a polygon corner when the clicks sit at the middle of each side', () => {
    const hexagon = createPolygon(layerId(), { x: 300, y: 300 }, 100, 6) as PolylineEntity
    seed([hexagon])
    const [first, corner, third] = hexagon.points
    const svg = armed(10)

    click(svg, towards(corner, first, 50))
    click(svg, towards(corner, third, 50))

    expect(arcs()).toHaveLength(1)
  })

  it('joins two circles with an arc and leaves both of them alone', () => {
    // 200 apart with radius 50 each leaves a gap of 100, which a radius of 100 spans easily.
    seed([createCircle(layerId(), { x: 200, y: 300 }, 50), createCircle(layerId(), { x: 400, y: 300 }, 50)])
    const svg = armed(100)

    click(svg, { x: 200, y: 250 })
    click(svg, { x: 400, y: 250 })

    expect(arcs()).toHaveLength(1)
    expect(entities().filter((entity) => entity.type === 'circle')).toHaveLength(2)
    expect(entities()).toHaveLength(3)
  })

  it('leaves snapping alone for the tools that place points rather than pick edges', () => {
    seed([createLine(layerId(), { x: 100, y: 100 }, { x: 300, y: 100 })])
    useCadStore.getState().setTool('line')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseDown(container.querySelector('svg')!, { clientX: 296, clientY: 104, button: 0 })

    expect(useCadStore.getState().draftPoints[0]).toEqual({ x: 300, y: 100 })
  })
})

describe('picking tangent objects for a Ttr circle', () => {
  const click = (svg: Element, at: Vec2) => fireEvent.mouseDown(svg, { clientX: at.x, clientY: at.y, button: 0 })
  /** The green used to mark an object as chosen. */
  const chosen = (svg: Element) => svg.querySelectorAll(`[stroke="${dark.confirm}"]`)

  const armed = () => {
    seed([
      createLine(layerId(), { x: 50, y: 200 }, { x: 350, y: 200 }),
      createLine(layerId(), { x: 50, y: 200 }, { x: 50, y: 400 }),
    ])
    useCadStore.getState().executeCommand('CIRCLE')
    useCadStore.getState().setCircleMode('ttr')
    const { container } = render(<CanvasViewport />)
    return container.querySelector('svg')!
  }

  beforeEach(() => {
    seed([])
  })

  it('marks nothing before anything has been picked', () => {
    expect(chosen(armed())).toHaveLength(0)
  })

  it('picks out the first object once it is clicked, so the pick is visible', () => {
    const svg = armed()
    click(svg, { x: 200, y: 200 })

    expect(useCadStore.getState().tangentPicks).toHaveLength(1)
    expect(chosen(svg).length).toBeGreaterThan(0)
    expect(useCadStore.getState().statusMessage).toMatch(/first tangent object selected/i)
  })

  it('picks out both objects while the radius is being typed', () => {
    const svg = armed()
    click(svg, { x: 200, y: 200 })
    click(svg, { x: 50, y: 300 })

    expect(useCadStore.getState().circlePending).toBe(true)
    // Two objects in green, each with its own marker where it was clicked.
    expect(chosen(svg).length).toBeGreaterThanOrEqual(2)
    expect(svg.querySelectorAll(`[fill="${dark.confirm}"]`)).toHaveLength(2)
  })

  it('drops the marks once the circle is drawn', () => {
    const svg = armed()
    click(svg, { x: 200, y: 200 })
    click(svg, { x: 50, y: 300 })
    // Typing the radius happens at the command line rather than on the canvas, so the resulting
    // render has to be flushed by hand.
    act(() => useCadStore.getState().executeCommand('40'))

    expect(useCadStore.getState().tangentPicks).toHaveLength(0)
    expect(chosen(svg)).toHaveLength(0)
    expect(useCadStore.getState().doc.entities.filter((entity) => entity.type === 'circle')).toHaveLength(1)
  })

  it('leaves the marks alone for the constructions that place points instead', () => {
    const svg = armed()
    useCadStore.getState().setCircleMode('3p')
    click(svg, { x: 200, y: 200 })

    expect(chosen(svg)).toHaveLength(0)
  })
})

describe('ARRAY through the canvas', () => {
  const entities = () => useCadStore.getState().doc.entities
  const circles = () => entities().filter((entity) => entity.type === 'circle')
  const click = (svg: Element, at: Vec2) => fireEvent.mouseDown(svg, { clientX: at.x, clientY: at.y, button: 0 })

  /** One circle in the drawing, selected, with ARRAY running against it. */
  const armed = () => {
    const source = createCircle(layerId(), { x: 100, y: 100 }, 10)
    seed([source])
    useCadStore.getState().setSelection([source.id])
    useCadStore.getState().executeCommand('ARRAY')
    const { container } = render(<CanvasViewport />)
    return container.querySelector('svg')!
  }

  beforeEach(() => {
    seed([])
    useCadStore.getState().setArrayType('rect')
    useCadStore.getState().setArrayOption('rows', 2)
    useCadStore.getState().setArrayOption('columns', 3)
  })

  it('keeps the selection when the command starts, so there is something to repeat', () => {
    armed()
    expect(useCadStore.getState().selectedIds).toHaveLength(1)
    expect(useCadStore.getState().activeTool).toBe('array')
  })

  it('lays out a grid from a base point and the neighbouring item', () => {
    const svg = armed()

    click(svg, { x: 100, y: 100 })
    expect(circles()).toHaveLength(1)
    click(svg, { x: 160, y: 140 })

    expect(circles()).toHaveLength(6)
  })

  it('previews the grid before the second click commits it', () => {
    const svg = armed()
    click(svg, { x: 100, y: 100 })
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 140 })

    // The preview draws the copies as ghosts, so more circles are on screen than in the drawing.
    expect(circles()).toHaveLength(1)
    expect(svg.querySelectorAll('circle').length).toBeGreaterThan(1)
  })

  it('sweeps a ring from the single point a polar array is given', () => {
    const svg = armed()
    useCadStore.getState().setArrayType('polar')
    useCadStore.getState().setArrayOption('count', 4)
    useCadStore.getState().setArrayOption('fillAngle', 360)

    click(svg, { x: 300, y: 100 })

    expect(circles()).toHaveLength(4)
  })

  it('says what is missing when nothing is selected', () => {
    seed([createCircle(layerId(), { x: 100, y: 100 }, 10)])
    useCadStore.getState().setSelection([])
    useCadStore.getState().executeCommand('ARRAY')
    const { container } = render(<CanvasViewport />)

    click(container.querySelector('svg')!, { x: 100, y: 100 })

    expect(circles()).toHaveLength(1)
    expect(useCadStore.getState().statusMessage).toMatch(/select objects/i)
  })
})

describe('rectangular selection', () => {
  beforeEach(() => {
    seed([])
    useCadStore.getState().setTool('select')
  })

  const drag = (container: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const svg = container.querySelector('svg')!
    fireEvent.mouseDown(svg, { clientX: from.x, clientY: from.y, button: 0 })
    fireEvent.mouseMove(svg, { clientX: to.x, clientY: to.y })
    return svg
  }

  it('shows a solid blue box when dragging left to right', () => {
    const { container } = render(<CanvasViewport />)
    drag(container, { x: 50, y: 50 }, { x: 250, y: 200 })

    const box = container.querySelector(`[stroke="${dark.windowSelect}"]`)
    expect(box).not.toBeNull()
    expect(box!.getAttribute('stroke-dasharray')).toBeNull()
    expect(Number(box!.getAttribute('width'))).toBe(200)
  })

  it('shows a dashed green box when dragging right to left', () => {
    const { container } = render(<CanvasViewport />)
    drag(container, { x: 250, y: 200 }, { x: 50, y: 50 })

    const box = container.querySelector(`[stroke="${dark.crossingSelect}"]`)
    expect(box).not.toBeNull()
    expect(box!.getAttribute('stroke-dasharray')).toBe('6 4')
  })

  it('window drag selects only fully enclosed objects', () => {
    const inside = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 })
    const straddling = createLine(layerId(), { x: 200, y: 100 }, { x: 900, y: 100 })
    seed([inside, straddling])
    useCadStore.getState().setTool('select')

    const { container } = render(<CanvasViewport />)
    const svg = drag(container, { x: 20, y: 20 }, { x: 400, y: 400 })
    fireEvent.mouseUp(svg, { clientX: 400, clientY: 400, button: 0 })

    expect(useCadStore.getState().selectedIds).toEqual([inside.id])
  })

  it('crossing drag also selects objects the box merely touches', () => {
    const inside = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 })
    const straddling = createLine(layerId(), { x: 200, y: 100 }, { x: 900, y: 100 })
    seed([inside, straddling])
    useCadStore.getState().setTool('select')

    const { container } = render(<CanvasViewport />)
    const svg = drag(container, { x: 400, y: 400 }, { x: 20, y: 20 })
    fireEvent.mouseUp(svg, { clientX: 20, clientY: 20, button: 0 })

    const selected = useCadStore.getState().selectedIds
    expect(selected).toContain(inside.id)
    expect(selected).toContain(straddling.id)
  })

  it('treats a drag shorter than the pick threshold as a single click pick', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    seed([line])
    useCadStore.getState().setTool('select')

    const { container } = render(<CanvasViewport />)
    const svg = drag(container, { x: 250, y: 101 }, { x: 251, y: 101 })
    fireEvent.mouseUp(svg, { clientX: 251, clientY: 101, button: 0 })

    expect(useCadStore.getState().selectedIds).toEqual([line.id])
  })

  it('adds to the selection when Shift is held', () => {
    const first = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 })
    const second = createRect(layerId(), { x: 300, y: 300 }, { x: 360, y: 360 })
    seed([first, second])
    useCadStore.getState().setTool('select')

    const { container } = render(<CanvasViewport />)
    let svg = drag(container, { x: 20, y: 20 }, { x: 200, y: 200 })
    fireEvent.mouseUp(svg, { clientX: 200, clientY: 200, button: 0 })
    expect(useCadStore.getState().selectedIds).toEqual([first.id])

    svg = drag(container, { x: 250, y: 250 }, { x: 500, y: 500 })
    fireEvent.mouseUp(svg, { clientX: 500, clientY: 500, button: 0, shiftKey: true })

    expect(useCadStore.getState().selectedIds).toHaveLength(2)
  })

  it('does not leave a selection box on screen after the drag ends', () => {
    const { container } = render(<CanvasViewport />)
    const svg = drag(container, { x: 50, y: 50 }, { x: 250, y: 200 })
    fireEvent.mouseUp(svg, { clientX: 250, clientY: 200, button: 0 })

    expect(container.querySelector(`[stroke="${dark.windowSelect}"]`)).toBeNull()
  })
})

describe('drawing a selection window out with two clicks', () => {
  const click = (svg: SVGSVGElement, at: Vec2, options: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => {
    fireEvent.mouseDown(svg, { clientX: at.x, clientY: at.y, button: 0, ...options })
    fireEvent.mouseUp(svg, { clientX: at.x, clientY: at.y, button: 0, ...options })
  }
  const moveTo = (svg: SVGSVGElement, at: Vec2) => fireEvent.mouseMove(svg, { clientX: at.x, clientY: at.y })

  const canvas = (entities: CadEntity[]) => {
    seed(entities)
    useCadStore.getState().setTool('select')
    const { container } = render(<CanvasViewport />)
    return { container, svg: container.querySelector('svg')! }
  }

  it('opens a window on the first click and closes it on the second', () => {
    const inside = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 })
    const outside = createRect(layerId(), { x: 500, y: 500 }, { x: 560, y: 560 })
    const { svg } = canvas([inside, outside])

    click(svg, { x: 20, y: 20 })
    moveTo(svg, { x: 300, y: 300 })
    click(svg, { x: 300, y: 300 })

    expect(useCadStore.getState().selectedIds).toEqual([inside.id])
  })

  it('says what it is waiting for once the first corner is down', () => {
    const { svg } = canvas([])

    click(svg, { x: 20, y: 20 })

    expect(useCadStore.getState().statusMessage).toBe('Specify opposite corner:')
  })

  it('draws the window as the cursor moves, with no button held', () => {
    const { container, svg } = canvas([])

    click(svg, { x: 20, y: 20 })
    moveTo(svg, { x: 220, y: 170 })

    const box = container.querySelector(`[stroke="${dark.windowSelect}"]`)
    expect(box).not.toBeNull()
    expect(Number(box!.getAttribute('width'))).toBe(200)
  })

  it('shows a crossing window when the second corner is to the left', () => {
    const { container, svg } = canvas([])

    click(svg, { x: 300, y: 300 })
    moveTo(svg, { x: 100, y: 100 })

    expect(container.querySelector(`[stroke="${dark.crossingSelect}"]`)).not.toBeNull()
  })

  it('catches what it merely touches when drawn right to left', () => {
    const straddling = createLine(layerId(), { x: 200, y: 100 }, { x: 900, y: 100 })
    const { svg } = canvas([straddling])

    click(svg, { x: 400, y: 400 })
    moveTo(svg, { x: 20, y: 20 })
    click(svg, { x: 20, y: 20 })

    expect(useCadStore.getState().selectedIds).toEqual([straddling.id])
  })

  it('lets the second click land on an object without picking it instead', () => {
    // The far corner is a position, not a pick, so an object under it must not steal the click.
    const inside = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 })
    const under = createLine(layerId(), { x: 300, y: 300 }, { x: 700, y: 300 })
    const { svg } = canvas([inside, under])

    click(svg, { x: 20, y: 20 })
    moveTo(svg, { x: 400, y: 300 })
    click(svg, { x: 400, y: 300 })

    expect(useCadStore.getState().selectedIds).toEqual([inside.id])
  })

  it('picks an object outright when the first click lands on one', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = canvas([line])

    click(svg, { x: 250, y: 100 })

    expect(useCadStore.getState().selectedIds).toEqual([line.id])
    expect(useCadStore.getState().statusMessage).not.toBe('Specify opposite corner:')
  })

  it('calls the window off on Escape, leaving the selection alone', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { container, svg } = canvas([line])
    act(() => useCadStore.getState().setSelection([line.id]))

    click(svg, { x: 700, y: 700 })
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(useCadStore.getState().selectedIds).toEqual([line.id])
    expect(container.querySelector(`[stroke="${dark.windowSelect}"]`)).toBeNull()
  })

  it('adds to the selection when the window is closed with Shift held', () => {
    const first = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 })
    const second = createRect(layerId(), { x: 300, y: 300 }, { x: 360, y: 360 })
    const { svg } = canvas([first, second])
    act(() => useCadStore.getState().setSelection([first.id]))

    click(svg, { x: 250, y: 250 })
    moveTo(svg, { x: 500, y: 500 })
    click(svg, { x: 500, y: 500 }, { shiftKey: true })

    expect(useCadStore.getState().selectedIds).toHaveLength(2)
  })

  it('still lets a window be dragged out in the usual way', () => {
    const inside = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 })
    const { svg } = canvas([inside])

    fireEvent.mouseDown(svg, { clientX: 20, clientY: 20, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 300 })
    fireEvent.mouseUp(svg, { clientX: 300, clientY: 300, button: 0 })

    expect(useCadStore.getState().selectedIds).toEqual([inside.id])
  })

  it('does not open a window at all when only dragging is allowed', () => {
    const { svg } = canvas([])
    act(() => setPreference('windowSelection', 'drag'))

    click(svg, { x: 20, y: 20 })
    moveTo(svg, { x: 300, y: 300 })

    expect(useCadStore.getState().statusMessage).toBe('Nothing selected')
  })

  it('makes every pick add to the selection when Shift is not required', () => {
    const first = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const second = createLine(layerId(), { x: 100, y: 300 }, { x: 400, y: 300 })
    const { svg } = canvas([first, second])
    act(() => setPreference('shiftToAdd', false))

    click(svg, { x: 250, y: 100 })
    click(svg, { x: 250, y: 300 })

    expect(useCadStore.getState().selectedIds).toHaveLength(2)
  })

  it('still lets Ctrl take something back out when every pick adds', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = canvas([line])
    act(() => setPreference('shiftToAdd', false))

    // Clear of the midpoint grip, which a press would otherwise take hold of instead.
    click(svg, { x: 200, y: 100 })
    click(svg, { x: 200, y: 100 }, { ctrlKey: true })

    expect(useCadStore.getState().selectedIds).toEqual([])
  })

  it('puts an open window away when a command starts, so it cannot swallow the first point', () => {
    const { container, svg } = canvas([])

    click(svg, { x: 700, y: 500 })
    act(() => useCadStore.getState().setTool('line'))
    click(svg, { x: 200, y: 200 })

    expect(container.querySelector(`[stroke="${dark.windowSelect}"]`)).toBeNull()
    expect(useCadStore.getState().draftPoints).toHaveLength(1)
  })

  it('ignores a drag when windows have to be clicked out', () => {
    const inside = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 })
    const { svg } = canvas([inside])
    act(() => setPreference('windowSelection', 'click'))

    // The press-drag-release leaves the window open rather than closing it at the far corner.
    fireEvent.mouseDown(svg, { clientX: 20, clientY: 20, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 300 })
    fireEvent.mouseUp(svg, { clientX: 300, clientY: 300, button: 0 })

    expect(useCadStore.getState().selectedIds).toEqual([])
    expect(useCadStore.getState().statusMessage).toBe('Specify opposite corner:')
  })
})

describe('dragging grips and selected objects', () => {
  /** Selects the given objects and hands back the rendered canvas. */
  const showing = (entities: CadEntity[], chosen: CadEntity[]) => {
    seed(entities)
    const state = useCadStore.getState()
    state.setTool('select')
    act(() => state.setSelection(chosen.map((entity) => entity.id)))
    const { container } = render(<CanvasViewport />)
    return { container, svg: container.querySelector('svg')! }
  }

  const pressDragRelease = (svg: SVGSVGElement, from: Vec2, to: Vec2) => {
    fireEvent.mouseDown(svg, { clientX: from.x, clientY: from.y, button: 0 })
    fireEvent.mouseMove(svg, { clientX: to.x, clientY: to.y })
    fireEvent.mouseUp(svg, { clientX: to.x, clientY: to.y, button: 0 })
  }

  const entityById = (id: string) => useCadStore.getState().doc.entities.find((entity) => entity.id === id)!

  beforeEach(() => {
    seed([])
    useCadStore.getState().setTool('select')
  })

  it('puts a grip on each end of a selected line and one in the middle', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })

    const { container } = showing([line], [line])

    expect(container.querySelectorAll('[data-grip]')).toHaveLength(3)
  })

  it('shows no grips until something is selected', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })

    const { container } = showing([line], [])

    expect(container.querySelectorAll('[data-grip]')).toHaveLength(0)
  })

  it('drags a line endpoint without disturbing the other end', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = showing([line], [line])

    pressDragRelease(svg, { x: 400, y: 100 }, { x: 400, y: 220 })

    const after = entityById(line.id)
    expect(after.type === 'line' && after.end).toEqual({ x: 400, y: 220 })
    expect(after.type === 'line' && after.start).toEqual({ x: 100, y: 100 })
  })

  it('drags a rectangle corner and leaves the rest of the outline in place', () => {
    const rect = createRect(layerId(), { x: 60, y: 60 }, { x: 120, y: 120 }) as PolylineEntity
    const { svg } = showing([rect], [rect])

    pressDragRelease(svg, { x: 120, y: 120 }, { x: 200, y: 180 })

    const after = entityById(rect.id) as PolylineEntity
    expect(after.points).toContainEqual({ x: 200, y: 180 })
    expect(after.points).toContainEqual({ x: 60, y: 60 })
    expect(after.points).toHaveLength(4)
  })

  it('resizes a circle by its quadrant grip', () => {
    const circle = createCircle(layerId(), { x: 250, y: 250 }, 80)
    const { svg } = showing([circle], [circle])

    pressDragRelease(svg, { x: 330, y: 250 }, { x: 400, y: 250 })

    const after = entityById(circle.id)
    expect(after.type === 'circle' && after.radius).toBeCloseTo(150, 6)
    expect(after.type === 'circle' && after.center).toEqual({ x: 250, y: 250 })
  })

  it('leaves the shape alone when a grip is clicked but not dragged', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = showing([line], [line])

    pressDragRelease(svg, { x: 400, y: 100 }, { x: 400, y: 100 })

    const after = entityById(line.id)
    expect(after.type === 'line' && after.end).toEqual({ x: 400, y: 100 })
  })

  it('takes hold of a grip rather than starting a selection window', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { container, svg } = showing([line], [line])

    fireEvent.mouseDown(svg, { clientX: 400, clientY: 100, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 500, clientY: 300 })

    expect(container.querySelector(`[stroke="${dark.windowSelect}"]`)).toBeNull()
  })

  it('previews the new shape while a grip is being dragged', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { container, svg } = showing([line], [line])

    fireEvent.mouseDown(svg, { clientX: 400, clientY: 100, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 400, clientY: 220 })

    expect(container.querySelector(`[stroke="${dark.preview}"]`)).not.toBeNull()
  })

  it('drags a whole object when the press lands on it away from any grip', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = showing([line], [line])

    pressDragRelease(svg, { x: 200, y: 100 }, { x: 200, y: 160 })

    const after = entityById(line.id)
    expect(after.type === 'line' && after.start).toEqual({ x: 100, y: 160 })
    expect(after.type === 'line' && after.end).toEqual({ x: 400, y: 160 })
  })

  it('drags every selected object together', () => {
    const first = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const second = createCircle(layerId(), { x: 600, y: 400 }, 50)
    const { svg } = showing([first, second], [first, second])

    pressDragRelease(svg, { x: 200, y: 100 }, { x: 200, y: 160 })

    const circle = entityById(second.id)
    expect(circle.type === 'circle' && circle.center).toEqual({ x: 600, y: 460 })
  })

  it('still opens a selection window when the press lands on empty space', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { container, svg } = showing([line], [line])

    fireEvent.mouseDown(svg, { clientX: 700, clientY: 500, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 900, clientY: 650 })

    expect(container.querySelector(`[stroke="${dark.windowSelect}"]`)).not.toBeNull()
  })

  it('leaves an unselected object alone, since only grips on show can be grabbed', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = showing([line], [])

    pressDragRelease(svg, { x: 200, y: 100 }, { x: 200, y: 160 })

    const after = entityById(line.id)
    expect(after.type === 'line' && after.start).toEqual({ x: 100, y: 100 })
  })

  it('narrows the selection to what was clicked, even if it was already selected', () => {
    const first = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const second = createCircle(layerId(), { x: 600, y: 400 }, 50)
    const { svg } = showing([first, second], [first, second])

    pressDragRelease(svg, { x: 200, y: 100 }, { x: 200, y: 100 })

    expect(useCadStore.getState().selectedIds).toEqual([first.id])
  })

  it('clears the selection when the click lands on nothing, with press-and-drag windows', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = showing([line], [line])
    act(() => setPreference('windowSelection', 'drag'))

    pressDragRelease(svg, { x: 800, y: 600 }, { x: 800, y: 600 })

    expect(useCadStore.getState().selectedIds).toEqual([])
  })

  it('opens a window instead of clearing when a click may start one', () => {
    // AutoCAD reads a click on bare paper as the first corner of a window, so the selection is
    // left alone until the window closes. Escape is what clears it.
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = showing([line], [line])

    pressDragRelease(svg, { x: 800, y: 600 }, { x: 800, y: 600 })

    expect(useCadStore.getState().selectedIds).toEqual([line.id])
    expect(useCadStore.getState().statusMessage).toBe('Specify opposite corner:')
  })

  it('abandons a drag on Escape, leaving the shape as it was', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = showing([line], [line])

    fireEvent.mouseDown(svg, { clientX: 400, clientY: 100, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 400, clientY: 220 })
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    fireEvent.mouseUp(svg, { clientX: 400, clientY: 220, button: 0 })

    const after = entityById(line.id)
    expect(after.type === 'line' && after.end).toEqual({ x: 400, y: 100 })
    expect(useCadStore.getState().selectedIds).toEqual([line.id])
  })

  it('undoes a grip drag in one step', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 400, y: 100 })
    const { svg } = showing([line], [line])

    pressDragRelease(svg, { x: 400, y: 100 }, { x: 400, y: 220 })
    act(() => useCadStore.getState().undo())

    const after = entityById(line.id)
    expect(after.type === 'line' && after.end).toEqual({ x: 400, y: 100 })
  })
})

describe('what a view draws', () => {
  const lineAt = (id: string, x: number, y: number): CadEntity => ({
    id,
    type: 'line',
    layerId: useCadStore.getState().doc.layers[0].id,
    start: { x, y },
    end: { x: x + 10, y: y + 10 },
  })

  it('leaves out objects far outside the view, so a large drawing costs what is visible', () => {
    seed([lineAt('near', 0, 0), lineAt('far', 500_000, 500_000)])
    const { container } = render(<CanvasViewport />)
    const lines = [...container.querySelectorAll('svg line')].map((node) => node.getAttribute('x1'))
    expect(lines).toContain('0')
    expect(lines).not.toContain('500000')
  })

  it('draws the model inside a sheet viewport, culled to what the frame shows', () => {
    seed([lineAt('seen', 0, 0), lineAt('elsewhere', 400_000, 400_000)])
    const state = useCadStore.getState()
    // A sheet whose single frame is centred on the model's origin at one unit per millimetre.
    act(() => {
      state.updateDocument((doc) => ({
        ...doc,
        layouts: [
          {
            id: 'sheet-1',
            name: 'Layout 1',
            paper: 'a4' as const,
            orientation: 'landscape' as const,
            marginMm: 12,
            entities: [],
            viewports: [
              {
                id: 'vp-1',
                center: { x: 148, y: 105 },
                widthMm: 200,
                heightMm: 140,
                modelCenter: { x: 0, y: 0 },
                unitsPerMm: 1,
                locked: false,
              },
            ],
          },
        ],
      }))
    })
    act(() => {
      useCadStore.getState().setActiveLayout('sheet-1')
    })

    const { container } = render(<CanvasViewport />)
    // The frame's transform sits on its group, so its contents stay in model coordinates.
    const frame = container.querySelector('svg g[clip-path]')!
    const inFrame = [...frame.getElementsByTagName('line')].map((node) => node.getAttribute('x1'))
    expect(inFrame).toEqual(['0'])
    // The model object far outside the frame is not drawn inside it.
    const everywhere = [...container.querySelectorAll('svg line')].map((node) => node.getAttribute('x1'))
    expect(everywhere).not.toContain('400000')
  })
})
