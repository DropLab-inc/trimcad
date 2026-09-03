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

/**
 * What another CAD program would make of the file. Dropping the comment this app writes forces the
 * geometry to be read from the DXF itself, which is the only part anything else can see.
 */
const asAnotherProgramSeesIt = (doc: DrawingDocument): DrawingDocument => {
  const dxf = exportDocumentToDxf(doc)
  const withoutEmbedded = dxf.slice(dxf.indexOf('\n', dxf.indexOf('DROPLABCAD-DOCUMENT:')) + 1)
  return importDocumentFromDxf(withoutEmbedded, makeDefaultDocument())
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

  it('writes an ellipse as the shape it actually is', () => {
    const doc = withEntities((layerId) => [
      { id: 'e', type: 'ellipse', layerId, center: { x: 1, y: 2 }, rx: 9, ry: 4, rotation: 0.3 },
    ])

    const ellipse = asAnotherProgramSeesIt(doc).entities.find((entity) => entity.type === 'ellipse')
    expect(ellipse).toBeDefined()
    if (ellipse?.type === 'ellipse') {
      expect(ellipse.center).toEqual({ x: 1, y: 2 })
      expect(ellipse.rx).toBeCloseTo(9, 6)
      expect(ellipse.ry).toBeCloseTo(4, 6)
      expect(ellipse.rotation).toBeCloseTo(0.3, 6)
    }
  })

  it('writes a tall ellipse the right way round, since DXF wants the longer radius first', () => {
    const doc = withEntities((layerId) => [
      { id: 'e', type: 'ellipse', layerId, center: { x: 0, y: 0 }, rx: 4, ry: 9, rotation: 0 },
    ])

    const ellipse = asAnotherProgramSeesIt(doc).entities.find((entity) => entity.type === 'ellipse')
    if (ellipse?.type === 'ellipse') {
      // The same shape, described from its long axis: nine across, four deep, turned a quarter turn.
      expect(ellipse.rx).toBeCloseTo(9, 6)
      expect(ellipse.ry).toBeCloseTo(4, 6)
      expect(ellipse.rotation).toBeCloseTo(Math.PI / 2, 6)
    }
  })

  it('keeps the hatches and dimensions when the drawing also holds a spline or an ellipse', () => {
    const doc = withEntities((layerId) => [
      { id: 's', type: 'spline', layerId, controlPoints: [{ x: 0, y: 0 }, { x: 3, y: 9 }, { x: 6, y: 0 }, { x: 9, y: 9 }] },
      { id: 'e', type: 'ellipse', layerId, center: { x: 1, y: 2 }, rx: 9, ry: 4, rotation: 0.3 },
      { id: 'h', type: 'hatch', layerId, pattern: 'ansi31', scale: 1, boundary: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }] },
    ])

    const reopened = roundTrip(doc)

    expect(reopened.entities.map((entity) => entity.type).sort()).toEqual(['ellipse', 'hatch', 'spline'])
    // Restored from the embedded copy, so the spline keeps the four points it was drawn with.
    const spline = reopened.entities.find((entity) => entity.type === 'spline')
    if (spline?.type === 'spline') expect(spline.controlPoints).toHaveLength(4)
  })

  it('still prefers the DXF when another program has changed the geometry', () => {
    const doc = withEntities((layerId) => [
      createCircle(layerId, { x: 3, y: 3 }, 2),
      { id: 'h', type: 'hatch', layerId, pattern: 'ansi31', scale: 1, boundary: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }] },
    ])
    // An outside edit: the circle grows, which no longer matches the embedded copy.
    const edited = exportDocumentToDxf(doc).replace('\n40\n2\n', '\n40\n7\n')

    const reopened = importDocumentFromDxf(edited, makeDefaultDocument())
    const circle = reopened.entities.find((entity) => entity.type === 'circle')

    expect(circle).toMatchObject({ radius: 7 })
    expect(reopened.entities.some((entity) => entity.type === 'hatch')).toBe(false)
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
