import { describe, expect, it } from 'vitest'
import { createCircle, createLine, offsetEntities } from './commands'

describe('commands', () => {
  it('creates line and circle', () => {
    const line = createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 })
    const circle = createCircle('L', { x: 0, y: 0 }, 12)
    expect(line.type).toBe('line')
    expect(circle.radius).toBe(12)
  })

  it('offsets selected entities', () => {
    const entities = [
      createLine('L', { x: 0, y: 0 }, { x: 10, y: 0 }),
      createCircle('L', { x: 0, y: 0 }, 10),
    ]
    const out = offsetEntities(
      entities,
      entities.map((e) => e.id),
      2,
    )
    expect(out.length).toBeGreaterThan(entities.length)
  })

})
