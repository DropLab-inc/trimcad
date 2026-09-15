import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BlocksPanel } from './BlocksPanel'
import { createLine } from '../core/commands'
import { useCadStore } from '../core/store'
import type { BlockDefinition, CadEntity, InsertEntity } from '../core/types'

const state = () => useCadStore.getState()

const titleBlock: BlockDefinition = {
  id: 'b-title',
  name: 'TITLE',
  entities: [createLine('0', { x: 0, y: 0 }, { x: 180, y: 0 })],
  basePoint: { x: 0, y: 0 },
}

const placed = (id: string): InsertEntity => ({
  id,
  type: 'insert',
  layerId: state().doc.layers[0].id,
  blockId: 'b-title',
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: 1,
})

const seed = (blocks: BlockDefinition[] = [], entities: CadEntity[] = []) => {
  state().cancelCommand()
  state().setSelection([])
  state().newDrawing()
  state().updateDocument((doc) => ({ ...doc, blocks, entities }))
  useCadStore.setState({ history: [], lastCommand: null, activeTool: 'select' })
}

describe('the Blocks panel', () => {
  beforeEach(() => seed())

  it('says how to make one when the drawing has none', () => {
    render(<BlocksPanel />)

    // The empty case is the one that has to teach, since it is where someone starts.
    expect(screen.getByText(/Nothing defined yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Insert block/ })).not.toBeInTheDocument()
  })

  it('lists a block by name, with how often it is placed', () => {
    seed([titleBlock], [placed('i1'), placed('i2')])

    render(<BlocksPanel />)

    expect(screen.getByText('TITLE')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('draws a preview of the block, not just its name', () => {
    seed([titleBlock])

    const { container } = render(<BlocksPanel />)

    // Picking the right block out of a list of names is the problem a palette exists to solve.
    const preview = container.querySelector('svg.block-preview')
    expect(preview).toBeTruthy()
    expect(preview?.querySelectorAll('line').length).toBe(1)
  })

  it('arms INSERT with the block that was clicked', () => {
    seed([titleBlock])

    render(<BlocksPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Insert block TITLE' }))

    expect(state().activeTool).toBe('insert')
    expect(state().insertBlockId).toBe('b-title')
  })
})
