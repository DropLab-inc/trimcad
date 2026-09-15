import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCircle, createLine } from '../core/commands'
import { useCadStore, EMPTY_TYPED } from '../core/store'
import type { Vec2 } from '../core/math/vec2'
import type { CadEntity } from '../core/types'
import { CanvasViewport } from './CanvasViewport'
import { COMMAND_INPUT_ID } from './commandFocus'

const seed = (entities: CadEntity[] = []) => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.updateDocument((doc) => ({ ...doc, entities, groups: [] }))
  state.setCamera({ x: 0, y: 0, zoom: 1 })
  // Typed field values live in the store now, so they survive a test unless cleared here.
  state.setTypedState(EMPTY_TYPED)
}

const layerId = () => useCadStore.getState().doc.layers[0].id

const type = (text: string) => {
  for (const character of text) fireEvent.keyDown(window, { key: character })
}

describe('dynamic input while drawing', () => {
  beforeEach(() => {
    seed()
    // Snapping would pull the cursor onto existing geometry and obscure what is being tested.
    useCadStore.setState({ osnapEnabled: false, polarEnabled: false })
  })

  it('shows length and angle fields once a line has its first point', () => {
    useCadStore.getState().setTool('line')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 100, clientY: 100 })
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 100 })

    expect(screen.getByText('Length')).toBeInTheDocument()
    expect(screen.getByText('Angle')).toBeInTheDocument()
    expect(screen.getByText('100.00')).toBeInTheDocument()
  })

  it('draws a line of the typed length when Enter is pressed', () => {
    useCadStore.getState().setTool('line')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 0, clientY: 0 })
    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 30, clientY: 0 })

    type('250')
    fireEvent.keyDown(window, { key: 'Enter' })

    const line = useCadStore.getState().doc.entities.at(-1)!
    expect(line.type).toBe('line')
    if (line.type === 'line') {
      expect(Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y)).toBeCloseTo(250, 6)
      expect(line.end.y).toBeCloseTo(0, 6)
    }
  })

  it('applies a typed angle after Tab moves to the angle field', () => {
    useCadStore.getState().setTool('line')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 0, clientY: 0 })
    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 40, clientY: 3 })

    type('100')
    fireEvent.keyDown(window, { key: 'Tab' })
    type('90')
    fireEvent.keyDown(window, { key: 'Enter' })

    const line = useCadStore.getState().doc.entities.at(-1)!
    if (line.type === 'line') {
      expect(line.end.x).toBeCloseTo(0, 6)
      expect(line.end.y).toBeCloseTo(100, 6)
    }
  })

  it('shows the typed text in the field instead of the tracked value', () => {
    useCadStore.getState().setTool('line')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 0, clientY: 0 })
    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 40, clientY: 0 })
    type('12')

    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('removes a character on Backspace', () => {
    useCadStore.getState().setTool('line')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 0, clientY: 0 })
    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 40, clientY: 0 })
    type('125')
    fireEvent.keyDown(window, { key: 'Backspace' })

    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('forgets typed values once the point is placed', () => {
    useCadStore.getState().setTool('polyline')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 0, clientY: 0 })
    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 40, clientY: 0 })
    type('60')
    fireEvent.keyDown(window, { key: 'Enter' })

    fireEvent.mouseMove(svg, { clientX: 90, clientY: 0 })

    expect(screen.queryByText('60')).toBeNull()
  })

  it('uses a typed radius for a circle', () => {
    useCadStore.getState().setTool('circle')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 100, clientY: 100 })
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 140, clientY: 100 })
    type('75')
    fireEvent.keyDown(window, { key: 'Enter' })

    const circle = useCadStore.getState().doc.entities.at(-1)!
    expect(circle.type === 'circle' && circle.radius).toBeCloseTo(75, 6)
  })

  it('leaves Enter finishing the command when nothing has been typed', () => {
    useCadStore.getState().setTool('polyline')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseMove(svg, { clientX: 0, clientY: 0 })
    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseDown(svg, { clientX: 50, clientY: 0, button: 0 })
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(useCadStore.getState().draftPoints).toHaveLength(0)
    expect(useCadStore.getState().doc.entities.at(-1)?.type).toBe('polyline')
  })
})

describe('modify tools in the viewport', () => {
  beforeEach(() => {
    seed()
    useCadStore.setState({ osnapEnabled: false, polarEnabled: false })
  })

  it('offsets an object to the side that was clicked', () => {
    const line = createLine(layerId(), { x: 100, y: 100 }, { x: 300, y: 100 })
    seed([line])
    useCadStore.getState().setTool('offset')
    useCadStore.getState().setOffsetDistance(25)

    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseDown(svg, { clientX: 200, clientY: 100, button: 0 })
    expect(useCadStore.getState().modifyTargetId).toBe(line.id)

    fireEvent.mouseDown(svg, { clientX: 200, clientY: 200, button: 0 })

    const created = useCadStore.getState().doc.entities.at(-1)!
    expect(created.type === 'line' && created.start.y).toBeCloseTo(125, 6)
    expect(useCadStore.getState().modifyTargetId).toBeNull()
  })

  /** TRIM and EXTEND commit on release, because a drag is a fence rather than a pick. */
  const pick = (svg: SVGSVGElement, x: number, y: number, options: { shiftKey?: boolean } = {}) => {
    fireEvent.mouseDown(svg, { clientX: x, clientY: y, button: 0, ...options })
    fireEvent.mouseUp(svg, { clientX: x, clientY: y, button: 0, ...options })
  }

  const drag = (svg: SVGSVGElement, from: Vec2, to: Vec2, options: { shiftKey?: boolean } = {}) => {
    fireEvent.mouseDown(svg, { clientX: from.x, clientY: from.y, button: 0, ...options })
    fireEvent.mouseMove(svg, { clientX: to.x, clientY: to.y, ...options })
    fireEvent.mouseUp(svg, { clientX: to.x, clientY: to.y, button: 0, ...options })
  }

  it('trims the clicked part of a line away', () => {
    const target = createLine(layerId(), { x: 0, y: 100 }, { x: 400, y: 100 })
    const cutter = createLine(layerId(), { x: 200, y: 0 }, { x: 200, y: 200 })
    seed([target, cutter])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    pick(container.querySelector('svg')!, 320, 100)

    const lines = useCadStore.getState().doc.entities.filter((entity) => entity.id === target.id)
    expect(lines).toHaveLength(1)
    expect(lines[0].type === 'line' && lines[0].end.x).toBeCloseTo(200, 6)
  })

  it('extends a line to the boundary ahead of it', () => {
    const target = createLine(layerId(), { x: 0, y: 100 }, { x: 100, y: 100 })
    const boundary = createLine(layerId(), { x: 300, y: 0 }, { x: 300, y: 200 })
    seed([target, boundary])
    useCadStore.getState().setTool('extend')

    const { container } = render(<CanvasViewport />)
    pick(container.querySelector('svg')!, 98, 100)

    const updated = useCadStore.getState().doc.entities.find((entity) => entity.id === target.id)!
    expect(updated.type === 'line' && updated.end.x).toBeCloseTo(300, 6)
  })

  it('extends instead of trimming while Shift is held', () => {
    const target = createLine(layerId(), { x: 0, y: 100 }, { x: 100, y: 100 })
    const boundary = createLine(layerId(), { x: 300, y: 0 }, { x: 300, y: 200 })
    seed([target, boundary])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    pick(container.querySelector('svg')!, 98, 100, { shiftKey: true })

    const updated = useCadStore.getState().doc.entities.find((entity) => entity.id === target.id)!
    expect(updated.type === 'line' && updated.end.x).toBeCloseTo(300, 6)
  })

  it('trims every object a dragged fence crosses', () => {
    const rungs = [120, 160, 200].map((y) => createLine(layerId(), { x: 0, y }, { x: 400, y }))
    const cutter = createLine(layerId(), { x: 100, y: 0 }, { x: 100, y: 400 })
    seed([...rungs, cutter])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    // A vertical swipe at x=50 crosses all three rungs on the short side of the cutter.
    drag(container.querySelector('svg')!, { x: 50, y: 100 }, { x: 50, y: 220 })

    for (const rung of rungs) {
      const piece = useCadStore.getState().doc.entities.find((entity) => entity.id === rung.id)!
      expect(piece.type === 'line' && piece.start.x).toBeCloseTo(100, 6)
      expect(piece.type === 'line' && piece.end.x).toBeCloseTo(400, 6)
    }
  })

  it('can trim the same line a second time', () => {
    const target = createLine(layerId(), { x: 0, y: 100 }, { x: 400, y: 100 })
    const left = createLine(layerId(), { x: 100, y: 0 }, { x: 100, y: 200 })
    const right = createLine(layerId(), { x: 300, y: 0 }, { x: 300, y: 200 })
    seed([target, left, right])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    pick(svg, 350, 100)
    expect(useCadStore.getState().doc.entities.filter((entity) => entity.type === 'line')).toHaveLength(4)

    // The middle piece now runs edge to edge, and picking it should clear it away.
    pick(svg, 200, 100)

    const horizontals = useCadStore
      .getState()
      .doc.entities.filter((entity) => entity.type === 'line' && entity.start.y === 100)
    expect(horizontals).toHaveLength(1)
    expect(horizontals[0].type === 'line' && horizontals[0].end.x).toBeCloseTo(100, 6)
  })

  it('shades the doomed piece in red as the crosshair passes over it', () => {
    const target = createLine(layerId(), { x: 0, y: 100 }, { x: 400, y: 100 })
    const cutter = createLine(layerId(), { x: 200, y: 0 }, { x: 200, y: 200 })
    seed([target, cutter])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 320, clientY: 100 })

    const ghost = container.querySelector('line[stroke="#f87171"]')!
    expect(ghost).toBeTruthy()
    expect(ghost.getAttribute('x1')).toBe('200')
    expect(ghost.getAttribute('x2')).toBe('400')
  })

  it('shows the extend preview in green while Shift is held', () => {
    const target = createLine(layerId(), { x: 0, y: 100 }, { x: 100, y: 100 })
    const boundary = createLine(layerId(), { x: 300, y: 0 }, { x: 300, y: 200 })
    seed([target, boundary])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    fireEvent.keyDown(window, { key: 'Shift' })
    fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 98, clientY: 100 })

    const ghost = container.querySelector('line[stroke="#4ade80"]')!
    expect(ghost).toBeTruthy()
    // Only the new material is drawn, running from the old end out to the boundary.
    expect(ghost.getAttribute('x1')).toBe('100')
    expect(ghost.getAttribute('x2')).toBe('300')
    fireEvent.keyUp(window, { key: 'Shift' })
  })

  it('shows no preview when the object does not meet an edge', () => {
    seed([createLine(layerId(), { x: 0, y: 100 }, { x: 400, y: 100 })])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 320, clientY: 100 })

    expect(container.querySelector('line[stroke="#f87171"]')).toBeNull()
  })

  it('draws the fence while it is being dragged', () => {
    seed([createLine(layerId(), { x: 0, y: 100 }, { x: 400, y: 100 })])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!
    fireEvent.mouseDown(svg, { clientX: 50, clientY: 50, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 250 })

    const fence = container.querySelector('line[stroke-dasharray="7 4"]')!
    expect(fence).toBeTruthy()
    expect(fence.getAttribute('y2')).toBe('250')
  })

  it('tells the user what the command wants next', () => {
    seed()
    useCadStore.getState().setTool('trim')
    render(<CanvasViewport />)

    expect(
      screen.getByText('Select object to trim or shift-select to extend or [cuTting edges/Fence/Undo]:'),
    ).toBeInTheDocument()
  })

  it('only trims against the chosen cutting edges', () => {
    const target = createLine(layerId(), { x: 0, y: 100 }, { x: 400, y: 100 })
    const near = createLine(layerId(), { x: 100, y: 0 }, { x: 100, y: 200 })
    const far = createLine(layerId(), { x: 300, y: 0 }, { x: 300, y: 200 })
    seed([target, near, far])
    useCadStore.getState().setTool('trim')
    useCadStore.getState().beginEdgeSelection()
    useCadStore.getState().setSelection([far.id])
    useCadStore.getState().finishEdgeSelection()

    const { container } = render(<CanvasViewport />)
    pick(container.querySelector('svg')!, 200, 100)

    // With only the far edge cutting, the piece removed runs from the start to x=300.
    const piece = useCadStore.getState().doc.entities.find((entity) => entity.id === target.id)!
    expect(piece.type === 'line' && piece.start.x).toBeCloseTo(300, 6)
    expect(piece.type === 'line' && piece.end.x).toBeCloseTo(400, 6)
  })

  it('mirrors the selection about the picked axis and keeps the original', () => {
    const circle = createCircle(layerId(), { x: 100, y: 100 }, 20)
    seed([circle])
    useCadStore.getState().setSelection([circle.id])
    useCadStore.getState().setTool('mirror')

    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseDown(svg, { clientX: 200, clientY: 0, button: 0 })
    fireEvent.mouseDown(svg, { clientX: 200, clientY: 300, button: 0 })

    const circles = useCadStore.getState().doc.entities.filter((entity) => entity.type === 'circle')
    expect(circles).toHaveLength(2)
    expect(circles.some((entity) => entity.type === 'circle' && Math.abs(entity.center.x - 300) < 1e-6)).toBe(true)
  })

  it('refuses to mirror when nothing is selected', () => {
    seed([createCircle(layerId(), { x: 100, y: 100 }, 20)])
    useCadStore.getState().setSelection([])
    useCadStore.getState().setTool('mirror')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseDown(container.querySelector('svg')!, { clientX: 200, clientY: 0, button: 0 })

    expect(useCadStore.getState().statusMessage).toMatch(/select objects/i)
    expect(useCadStore.getState().doc.entities).toHaveLength(1)
  })
})

describe('starting and leaving commands from the keyboard', () => {
  beforeEach(() => {
    seed()
    useCadStore.setState({ osnapEnabled: false, polarEnabled: false, orthoEnabled: false })
  })

  it('goes back to picking objects when Escape leaves a command', () => {
    useCadStore.getState().setTool('circle')
    const { container } = render(<CanvasViewport />)
    fireEvent.mouseDown(container.querySelector('svg')!, { clientX: 100, clientY: 100, button: 0 })

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(useCadStore.getState().activeTool).toBe('select')
    expect(useCadStore.getState().draftPoints).toHaveLength(0)
    expect(useCadStore.getState().doc.entities).toHaveLength(0)
  })

  it('clears the selection when Escape is pressed with nothing running', () => {
    seed([createCircle(layerId(), { x: 100, y: 100 }, 20)])
    const state = useCadStore.getState()
    state.setTool('select')
    state.setSelection([useCadStore.getState().doc.entities[0].id])
    render(<CanvasViewport />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(useCadStore.getState().selectedIds).toHaveLength(0)
  })

  it('ends a run of lines on Enter and hands the crosshair back to selection', () => {
    useCadStore.getState().setTool('line')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 0, button: 0 })
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(useCadStore.getState().doc.entities).toHaveLength(1)
    expect(useCadStore.getState().activeTool).toBe('select')
  })

  it('brings the last command back when Enter is pressed at the empty prompt', () => {
    useCadStore.getState().executeCommand('CIRCLE')
    render(<CanvasViewport />)

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(useCadStore.getState().activeTool).toBe('circle')
  })

  it('treats a right-click as Enter and closes the command', () => {
    useCadStore.getState().setTool('line')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 0, button: 0 })
    fireEvent.contextMenu(svg)

    expect(useCadStore.getState().activeTool).toBe('select')
  })
})

describe('drawing with ortho latched on', () => {
  beforeEach(() => {
    seed()
    useCadStore.setState({ osnapEnabled: false, polarEnabled: false, orthoEnabled: true })
  })

  it('holds a line square to the axis', () => {
    useCadStore.getState().setTool('line')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 20, button: 0 })

    const line = useCadStore.getState().doc.entities.at(-1)!
    expect(line.type).toBe('line')
    if (line.type === 'line') expect(line.end).toEqual({ x: 100, y: 0 })
  })

  it('still gives a rectangle both a width and a height', () => {
    useCadStore.getState().setTool('rect')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 40, button: 0 })

    // A rectangle is stored as a closed polyline through its four corners.
    const rect = useCadStore.getState().doc.entities.at(-1)!
    expect(rect.type).toBe('polyline')
    if (rect.type === 'polyline') {
      const xs = rect.points.map((corner) => corner.x)
      const ys = rect.points.map((corner) => corner.y)
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 6)
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(40, 6)
    }
  })

  it('still gives an ellipse a minor axis', () => {
    useCadStore.getState().setTool('ellipse')
    const { container } = render(<CanvasViewport />)
    const svg = container.querySelector('svg')!

    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 40, button: 0 })

    const ellipse = useCadStore.getState().doc.entities.at(-1)!
    expect(ellipse.type).toBe('ellipse')
    if (ellipse.type === 'ellipse') {
      expect(ellipse.rx).toBeGreaterThan(0)
      expect(ellipse.ry).toBeGreaterThan(0)
    }
  })
})

describe('the dimension boxes as controls', () => {
  beforeEach(() => {
    seed()
    // Snapping would pull the cursor onto geometry and obscure what is being tested.
    useCadStore.setState({ osnapEnabled: false, polarEnabled: false })
  })

  /**
   * The command input lives in the shell, so it is not rendered here. What matters is
   * that tapping a box focuses it, which a stand-in with the same id answers.
   */
  const commandInput = () => {
    const input = document.createElement('input')
    input.id = COMMAND_INPUT_ID
    document.body.append(input)
    return input
  }

  /** A line with its first point placed and the cursor away from it. */
  const startLine = (container: HTMLElement) => {
    useCadStore.getState().setTool('line')
    const svg = container.querySelector('svg')!
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 100 })
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.mouseMove(svg, { clientX: 220, clientY: 140 })
    return svg
  }

  const fields = (container: HTMLElement) => Array.from(container.querySelectorAll('.dynamic-field'))

  /**
   * What a finger does: a pointer event, then the mousedown the browser synthesises
   * afterwards. Both have to be absorbed, because the canvas draws on mousedown.
   */
  const tap = (element: Element) => {
    fireEvent.pointerDown(element, { pointerType: 'touch' })
    fireEvent.touchStart(element)
    fireEvent.mouseDown(element, { button: 0 })
    fireEvent.mouseUp(element, { button: 0 })
  }

  it('focuses the command input on a tap instead of placing a point', () => {
    const input = commandInput()
    const { container } = render(<CanvasViewport />)
    startLine(container)

    expect(useCadStore.getState().draftPoints).toHaveLength(1)

    tap(fields(container)[0])

    expect(document.activeElement).toBe(input)
    // The tap must not have reached the canvas: no second point, nothing drawn.
    expect(useCadStore.getState().draftPoints).toHaveLength(1)
    expect(useCadStore.getState().doc.entities).toHaveLength(0)
  })

  it('sends the value to the box that was tapped, through the field', () => {
    // The box tap puts the caret in the command line, so the digits belong to that input: the
    // window key path deliberately stands aside once it has focus (see the single-writer test).
    commandInput()
    const { container } = render(<CanvasViewport />)
    startLine(container)

    // The second box is Angle. Making it active is what sends "90" there rather than to the
    // length, which is the whole point of tapping a specific box.
    tap(fields(container)[1])
    act(() => useCadStore.getState().mirrorTypedValue('90'))
    expect(fields(container)[1].textContent).toContain('90')

    useCadStore.getState().executeCommand('90')

    const line = useCadStore.getState().doc.entities.at(-1)!
    expect(line.type).toBe('line')
    if (line.type === 'line') {
      // A typed angle turns the segment onto that bearing: vertical from x=100. Had the
      // digits gone to Length instead, "90" would have run along the cursor's own
      // bearing and ended near x=185, which is what makes this a real check.
      expect(line.end.x).toBeCloseTo(100, 6)
      expect(line.end.y).toBeGreaterThan(100)
      // The length is whatever the command tracks from the cursor, not the typed digits.
      expect(Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y)).toBeCloseTo(120, 6)
    }
  })

  it('still places points on the canvas away from the boxes', () => {
    const { container } = render(<CanvasViewport />)
    const svg = startLine(container)

    fireEvent.mouseDown(svg, { clientX: 600, clientY: 500, button: 0 })

    expect(useCadStore.getState().doc.entities).toHaveLength(1)
  })

  it('sizes the boxes for a finger and keeps them inside the viewport', () => {
    // jsdom has no matchMedia, which useMediaQuery reads as desktop, so a phone has to
    // be reported explicitly. This is the only part of the geometry a phone changes.
    window.matchMedia = ((query: string) => ({
      matches: query.includes('820px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia

    const { container } = render(<CanvasViewport />)
    startLine(container)

    const boxes = fields(container).map((field) => field.querySelector('rect')!)
    expect(boxes).toHaveLength(2)
    for (const box of boxes) {
      expect(Number(box.getAttribute('height'))).toBe(36)
      expect(Number(box.getAttribute('x'))).toBeGreaterThanOrEqual(4)
    }
    // Rows are 36 tall with an 8 gap: 44 of separation, which is a thumb's worth.
    const gap = Number(boxes[1].getAttribute('y')) - Number(boxes[0].getAttribute('y'))
    expect(gap).toBe(44)

    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('fills the length field from a number submitted at the command line', () => {
    const { container } = render(<CanvasViewport />)
    startLine(container)

    // The phone's route, in order: tap the box (which puts the keyboard on the command line),
    // type a number, submit it. Nothing here touches the canvas with a mouse.
    useCadStore.getState().executeCommand('150')

    const line = useCadStore.getState().doc.entities.at(-1)!
    expect(line.type).toBe('line')
    if (line.type === 'line') {
      const length = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y)
      expect(length).toBeCloseTo(150, 6)
    }
    // The value belonged to that one step and is not left hanging around.
    expect(useCadStore.getState().typed).toEqual(EMPTY_TYPED)
  })

  it('sends a command-line number to the angle when the angle box was tapped', () => {
    const { container } = render(<CanvasViewport />)
    startLine(container)

    tap(fields(container)[1])
    useCadStore.getState().executeCommand('90')

    const line = useCadStore.getState().doc.entities.at(-1)!
    expect(line.type).toBe('line')
    if (line.type === 'line') {
      // Vertical from the first point: the number went to the angle, not to the length. Had it
      // gone to the length, the segment would have run along the cursor's own bearing instead, and
      // its end would sit far from x=100. How far it travels on a typed angle alone is the command's
      // own business, so that is not asserted here.
      expect(line.end.x).toBeCloseTo(100, 6)
      expect(line.end.y).toBeGreaterThan(100)
    }
  })

  it('holds an angle typed with no distance to travel and waits for the length', () => {
    const { container } = render(<CanvasViewport />)
    const svg = startLine(container)

    // The phone's situation: the finger is still on the first point, so the tracked length is
    // zero and an angle alone describes a segment of no length.
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 100 })
    tap(fields(container)[1])
    useCadStore.getState().executeCommand('90')

    // Nothing is drawn — a zero-length object is junk — and the value is kept.
    expect(useCadStore.getState().doc.entities).toHaveLength(0)
    expect(useCadStore.getState().typed.values.angle).toBe('90')

    // The length then joins it, describing the segment both numbers were for.
    useCadStore.getState().executeCommand('150')

    const line = useCadStore.getState().doc.entities.at(-1)!
    expect(line.type).toBe('line')
    if (line.type === 'line') {
      expect(line.start.x).toBeCloseTo(100, 6)
      expect(line.start.y).toBeCloseTo(100, 6)
      expect(line.end.x).toBeCloseTo(100, 6)
      expect(line.end.y).toBeCloseTo(250, 6)
    }
  })

  it('shows a value being typed on the command line in the box it will fill', () => {
    const { container } = render(<CanvasViewport />)
    startLine(container)

    // The keyboard is on the command line, so this is the only place the digits can appear in the
    // drawing: without it the box keeps reading 0.00 and the input looks ignored. act() because
    // the call is a store write from outside React, not a rendered event.
    act(() => useCadStore.getState().mirrorTypedValue('175'))
    expect(fields(container)[0].textContent).toContain('175')

    // A command or a coordinate is not a field value, and must not be shown as one.
    act(() => useCadStore.getState().mirrorTypedValue(''))
    expect(fields(container)[0].textContent).not.toContain('175')

    // And what is on the box is what a press in the drawing uses: type a length, tap a direction.
    act(() => useCadStore.getState().mirrorTypedValue('175'))
    fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 300, clientY: 100 })
    fireEvent.mouseDown(container.querySelector('svg')!, { clientX: 300, clientY: 100, button: 0 })

    const line = useCadStore.getState().doc.entities.at(-1)!
    expect(line.type).toBe('line')
    if (line.type === 'line') {
      expect(Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y)).toBeCloseTo(175, 6)
    }
  })

  /*
   * One writer per keystroke. The canvas has its own global key handler — that is what lets typing
   * anywhere start a command — and it writes to the same value the browser puts in the focused
   * field. Two writers with a focus() in between is how "20" arrives as "02" on a phone: the key
   * event reaches the document rather than the field, so the canvas appends it, focuses the input
   * halfway through the word, and the browser inserts the next one at a caret that has moved.
   */
  it('leaves the typing to the field while the command input has the caret', () => {
    const input = commandInput()
    const { container } = render(<CanvasViewport />)
    startLine(container)

    // Nothing focused: the canvas takes the keystroke, which is how typing anywhere starts a command.
    fireEvent.keyDown(document.body, { key: '2' })
    expect(fields(container)[0].textContent).toContain('2')

    // Caret in the field: the same keystroke must now leave the canvas alone, or it is written twice.
    input.focus()
    const boxBefore = fields(container)[0].textContent
    fireEvent.keyDown(document.body, { key: '0' })
    expect(fields(container)[0].textContent).toBe(boxBefore)
    expect(useCadStore.getState().commandInput).toBe('')
  })
})
