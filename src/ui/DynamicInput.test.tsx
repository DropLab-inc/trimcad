import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCircle, createLine } from '../core/commands'
import { useCadStore } from '../core/store'
import type { CadEntity } from '../core/types'
import { CanvasViewport } from './CanvasViewport'

const seed = (entities: CadEntity[] = []) => {
  const state = useCadStore.getState()
  state.cancelDraft()
  state.setSelection([])
  state.updateDocument((doc) => ({ ...doc, entities, groups: [] }))
  state.setCamera({ x: 0, y: 0, zoom: 1 })
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

  it('trims the clicked part of a line away', () => {
    const target = createLine(layerId(), { x: 0, y: 100 }, { x: 400, y: 100 })
    const cutter = createLine(layerId(), { x: 200, y: 0 }, { x: 200, y: 200 })
    seed([target, cutter])
    useCadStore.getState().setTool('trim')

    const { container } = render(<CanvasViewport />)
    fireEvent.mouseDown(container.querySelector('svg')!, { clientX: 320, clientY: 100, button: 0 })

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
    fireEvent.mouseDown(container.querySelector('svg')!, { clientX: 98, clientY: 100, button: 0 })

    const updated = useCadStore.getState().doc.entities.find((entity) => entity.id === target.id)!
    expect(updated.type === 'line' && updated.end.x).toBeCloseTo(300, 6)
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
