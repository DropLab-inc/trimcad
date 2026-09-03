import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine, createPolygon, createRect } from '../core/commands'
import { useCadStore } from '../core/store'
import type { Vec2 } from '../core/math/vec2'
import type { CadEntity, PolylineEntity } from '../core/types'
import { CanvasViewport } from './CanvasViewport'

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
}

const layerId = () => useCadStore.getState().doc.layers[0].id

const snapGlyph = (container: HTMLElement) => container.querySelector('[stroke="#00f5d4"]')

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

    const box = container.querySelector('[stroke="#3b82f6"]')
    expect(box).not.toBeNull()
    expect(box!.getAttribute('stroke-dasharray')).toBeNull()
    expect(Number(box!.getAttribute('width'))).toBe(200)
  })

  it('shows a dashed green box when dragging right to left', () => {
    const { container } = render(<CanvasViewport />)
    drag(container, { x: 250, y: 200 }, { x: 50, y: 50 })

    const box = container.querySelector('[stroke="#22c55e"]')
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

    expect(container.querySelector('[stroke="#3b82f6"]')).toBeNull()
  })
})
