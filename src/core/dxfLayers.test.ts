import { describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { makeDefaultDocument } from './document'
import { exportDocumentToDxf, importDocumentFromDxf } from './dxf'
import { makeLayer } from './layers'
import type { CadEntity, DrawingDocument } from './types'

const roundTrip = (doc: DrawingDocument): DrawingDocument =>
  importDocumentFromDxf(exportDocumentToDxf(doc), makeDefaultDocument())

describe('a new layer with nothing drawn on it', () => {
  const withSpareLayer = (linetypeName: string): DrawingDocument => {
    const doc = makeDefaultDocument()
    const linetype = doc.linetypes.find((candidate) => candidate.name === linetypeName)!
    return { ...doc, layers: [...doc.layers, makeLayer('spare', 'Layer1', linetype.id, '#ff0000')] }
  }

  it('survives a save and reopen even with no objects on it', () => {
    const names = roundTrip(withSpareLayer('Continuous')).layers.map((layer) => layer.name)
    expect(names).toContain('Layer1')
  })

  it('survives when it uses a linetype DXF has to be told about', () => {
    const names = roundTrip(withSpareLayer('Hidden')).layers.map((layer) => layer.name)
    expect(names).toContain('Layer1')
  })

  it('keeps its linetype', () => {
    const reopened = roundTrip(withSpareLayer('Hidden'))
    const spare = reopened.layers.find((layer) => layer.name === 'Layer1')
    const linetype = reopened.linetypes.find((candidate) => candidate.id === spare?.linetypeId)
    expect(linetype?.name).toBe('Hidden')
  })

  it('keeps its lineweight', () => {
    const doc = makeDefaultDocument()
    const spare = { ...makeLayer('spare', 'Layer1', doc.linetypes[0].id, '#ff0000'), lineweight: 0.5 }
    const reopened = roundTrip({ ...doc, layers: [...doc.layers, spare] })
    expect(reopened.layers.find((layer) => layer.name === 'Layer1')?.lineweight).toBe(0.5)
  })

  it('keeps a layer that is switched off or frozen', () => {
    const doc = makeDefaultDocument()
    const off = { ...makeLayer('off', 'OFF', doc.linetypes[0].id), visible: false }
    const frozen = { ...makeLayer('frz', 'FROZEN', doc.linetypes[0].id), frozen: true }
    const reopened = roundTrip({ ...doc, layers: [...doc.layers, off, frozen] })

    expect(reopened.layers.find((layer) => layer.name === 'OFF')?.visible).toBe(false)
    expect(reopened.layers.find((layer) => layer.name === 'FROZEN')?.frozen).toBe(true)
  })

  it('keeps a locked layer locked and one marked not to plot', () => {
    const doc = makeDefaultDocument()
    const locked = { ...makeLayer('lk', 'LOCKED', doc.linetypes[0].id), locked: true }
    const noplot = { ...makeLayer('np', 'NOPLOT', doc.linetypes[0].id), plottable: false }
    const reopened = roundTrip({ ...doc, layers: [...doc.layers, locked, noplot] })

    expect(reopened.layers.find((layer) => layer.name === 'LOCKED')?.locked).toBe(true)
    expect(reopened.layers.find((layer) => layer.name === 'NOPLOT')?.plottable).toBe(false)
  })
})

describe('objects DXF has no shape for', () => {
  it('brings a hatch back when the file is reopened here', () => {
    const doc = makeDefaultDocument()
    const hatch: CadEntity = {
      id: 'h',
      type: 'hatch',
      layerId: doc.layers[0].id,
      pattern: 'ansi31',
      scale: 1,
      angle: 0,
      boundary: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ],
    }

    const reopened = roundTrip({ ...doc, entities: [hatch] })
    expect(reopened.entities.find((entity) => entity.type === 'hatch')).toMatchObject({ pattern: 'ansi31' })
  })

  it('brings a dimension back', () => {
    const doc = makeDefaultDocument()
    const dim: CadEntity = {
      id: 'd',
      type: 'dimension',
      layerId: doc.layers[0].id,
      dimType: 'linear',
      p1: { x: 0, y: 0 },
      p2: { x: 5, y: 0 },
    }

    const reopened = roundTrip({ ...doc, entities: [dim] })
    expect(reopened.entities.find((entity) => entity.type === 'dimension')).toMatchObject({ p2: { x: 5, y: 0 } })
  })

  it('brings a dimension back at the size it was drawn', () => {
    const doc = makeDefaultDocument()
    const dim: CadEntity = {
      id: 'd',
      type: 'dimension',
      layerId: doc.layers[0].id,
      dimType: 'linear',
      p1: { x: 0, y: 0 },
      p2: { x: 5, y: 0 },
      scale: 2.5,
    }

    const reopened = roundTrip({ ...doc, entities: [dim] })
    expect(reopened.entities.find((entity) => entity.type === 'dimension')).toMatchObject({ scale: 2.5 })
  })

  it('keeps groups together', () => {
    const doc = makeDefaultDocument()
    const a = createLine(doc.layers[0].id, { x: 0, y: 0 }, { x: 1, y: 0 })
    const b = createLine(doc.layers[0].id, { x: 0, y: 1 }, { x: 1, y: 1 })
    const grouped = { ...doc, entities: [a, b], groups: [{ id: 'g1', name: 'Pair', entityIds: [a.id, b.id] }] }

    expect(roundTrip(grouped).groups).toHaveLength(1)
  })
})

describe('a file another program has edited', () => {
  it('trusts the DXF geometry rather than the stale copy written into it', () => {
    const doc = makeDefaultDocument()
    const saved = exportDocumentToDxf({
      ...doc,
      entities: [createLine(doc.layers[0].id, { x: 0, y: 0 }, { x: 5, y: 0 })],
    })
    const movedElsewhere = exportDocumentToDxf({
      ...doc,
      entities: [createLine(doc.layers[0].id, { x: 0, y: 0 }, { x: 9, y: 0 })],
    })

    // The geometry another program rewrote, still carrying the comment from the original save.
    const staleComment = saved.split('\n').slice(0, 2).join('\n')
    const edited = `${staleComment}\n${movedElsewhere.split('\n').slice(2).join('\n')}`

    const reopened = importDocumentFromDxf(edited, makeDefaultDocument())
    const line = reopened.entities.find((entity) => entity.type === 'line')
    expect(line).toBeDefined()
    if (line?.type === 'line') expect(line.end.x).toBeCloseTo(9, 6)
  })

  it('still reads a plain DXF that was never written by this app', () => {
    const plain = exportDocumentToDxf(makeDefaultDocument()).split('\n').slice(2).join('\n')
    expect(plain).not.toContain('TRIMCAD-DOCUMENT')

    expect(() => importDocumentFromDxf(plain, makeDefaultDocument())).not.toThrow()
  })
})
