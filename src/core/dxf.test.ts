import { describe, expect, it } from 'vitest'
import { createCircle, createLine } from './commands'
import { makeDefaultDocument } from './document'
import { exportDocumentToDxf, importDocumentFromDxf, unsupportedForDxf } from './dxf'
import { makeLayer } from './layers'
import type { CadEntity, DrawingDocument } from './types'

const roundTrip = (doc: DrawingDocument): DrawingDocument =>
  importDocumentFromDxf(exportDocumentToDxf(doc), makeDefaultDocument())

const withEntities = (build: (layerId: string) => CadEntity[]): DrawingDocument => {
  const doc = makeDefaultDocument()
  return { ...doc, entities: build(doc.layers[0].id) }
}

describe('saving a drawing as DXF', () => {
  it('writes something a DXF reader recognises', () => {
    const doc = withEntities((layerId) => [createLine(layerId, { x: 0, y: 0 }, { x: 5, y: 0 })])
    expect(exportDocumentToDxf(doc)).toContain('SECTION')
  })

  it('brings lines and circles back where they were', () => {
    const doc = withEntities((layerId) => [
      createLine(layerId, { x: 0, y: 0 }, { x: 5, y: 0 }),
      createCircle(layerId, { x: 3, y: 3 }, 2),
    ])

    const reopened = roundTrip(doc)
    const line = reopened.entities.find((entity) => entity.type === 'line')
    const circle = reopened.entities.find((entity) => entity.type === 'circle')

    expect(line).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 5, y: 0 } })
    expect(circle).toMatchObject({ center: { x: 3, y: 3 }, radius: 2 })
  })

  it('brings back an arc', () => {
    const doc = withEntities((layerId) => [
      { id: 'a', type: 'arc', layerId, center: { x: 0, y: 0 }, radius: 4, startAngle: 0, endAngle: Math.PI / 2 },
    ])

    const arc = roundTrip(doc).entities.find((entity) => entity.type === 'arc')
    expect(arc).toBeDefined()
    if (arc?.type === 'arc') {
      expect(arc.radius).toBeCloseTo(4, 6)
      expect(arc.endAngle).toBeCloseTo(Math.PI / 2, 4)
    }
  })

  it('brings back a polyline and remembers whether it was closed', () => {
    const doc = withEntities((layerId) => [
      {
        id: 'p',
        type: 'polyline',
        layerId,
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 3 },
        ],
      },
    ])

    const polyline = roundTrip(doc).entities.find((entity) => entity.type === 'polyline')
    expect(polyline).toBeDefined()
    if (polyline?.type === 'polyline') {
      expect(polyline.points).toHaveLength(3)
      expect(polyline.closed).toBe(true)
    }
  })

  it('brings back text', () => {
    const doc = withEntities((layerId) => [
      { id: 't', type: 'text', layerId, position: { x: 2, y: 6 }, value: 'NOTE', height: 10 },
    ])

    const text = roundTrip(doc).entities.find((entity) => entity.type === 'text')
    expect(text).toMatchObject({ value: 'NOTE', position: { x: 2, y: 6 } })
  })
})

describe('layers through DXF', () => {
  const twoLayers = (): DrawingDocument => {
    const doc = makeDefaultDocument()
    const walls = makeLayer('walls', 'WALLS', doc.linetypes[0].id, '#ff0000')
    const grid = makeLayer('grid', 'GRID', doc.linetypes[0].id, '#00ff00')
    return {
      ...doc,
      layers: [...doc.layers, walls, grid],
      entities: [
        createLine(walls.id, { x: 0, y: 0 }, { x: 5, y: 0 }),
        createCircle(grid.id, { x: 1, y: 1 }, 2),
      ],
    }
  }

  it('keeps every layer', () => {
    const names = roundTrip(twoLayers()).layers.map((layer) => layer.name)
    expect(names).toEqual(expect.arrayContaining(['WALLS', 'GRID']))
  })

  it('keeps the layer colours', () => {
    const reopened = roundTrip(twoLayers())
    expect(reopened.layers.find((layer) => layer.name === 'WALLS')?.color).toBe('#ff0000')
    expect(reopened.layers.find((layer) => layer.name === 'GRID')?.color).toBe('#00ff00')
  })

  it('puts each object back on the layer it was drawn on', () => {
    const reopened = roundTrip(twoLayers())
    const walls = reopened.layers.find((layer) => layer.name === 'WALLS')!
    const grid = reopened.layers.find((layer) => layer.name === 'GRID')!

    expect(reopened.entities.find((entity) => entity.type === 'line')?.layerId).toBe(walls.id)
    expect(reopened.entities.find((entity) => entity.type === 'circle')?.layerId).toBe(grid.id)
  })
})

describe('what DXF cannot carry', () => {
  it('says nothing is lost for plain geometry', () => {
    const doc = withEntities((layerId) => [createLine(layerId, { x: 0, y: 0 }, { x: 1, y: 1 })])
    expect(unsupportedForDxf(doc).size).toBe(0)
  })

  it('counts the hatches and dimensions that would be dropped', () => {
    const doc = withEntities((layerId) => [
      createLine(layerId, { x: 0, y: 0 }, { x: 1, y: 1 }),
      { id: 'h', type: 'hatch', layerId, boundary: [{ x: 0, y: 0 }], pattern: 'ansi31', scale: 1 },
      { id: 'd', type: 'dimension', layerId, dimType: 'linear', p1: { x: 0, y: 0 }, p2: { x: 5, y: 0 } },
    ])

    const losses = unsupportedForDxf(doc)
    expect(losses.get('hatch')).toBe(1)
    expect(losses.get('dimension')).toBe(1)
  })
})
