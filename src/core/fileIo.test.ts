import { describe, expect, it } from 'vitest'
import { createCircle, createLine } from './commands'
import { makeDefaultDocument } from './document'
import { DRAWING_EXTENSION, parseDrawing, serializeDrawing, withExtension } from './fileIo'

const sample = () => {
  const doc = makeDefaultDocument()
  const layerId = doc.layers[0].id
  return {
    ...doc,
    entities: [createLine(layerId, { x: 0, y: 0 }, { x: 10, y: 4 }), createCircle(layerId, { x: 5, y: 5 }, 3)],
  }
}

describe('saving and opening a drawing', () => {
  it('brings back everything that was saved', () => {
    const original = sample()
    const reopened = parseDrawing(serializeDrawing(original))

    expect(reopened.entities).toEqual(original.entities)
    expect(reopened.layers).toEqual(original.layers)
    expect(reopened.dimStyle).toEqual(original.dimStyle)
  })

  it('reads a bare document from before the file wrapper existed', () => {
    const reopened = parseDrawing(JSON.stringify(sample()))
    expect(reopened.entities).toHaveLength(2)
  })

  it('fills in lists an older file never had', () => {
    const bare = { ...sample(), groups: undefined }
    const reopened = parseDrawing(JSON.stringify(bare))
    expect(reopened.groups).toEqual([])
  })

  it('refuses a file that is not JSON at all', () => {
    expect(() => parseDrawing('DXF 0 SECTION')).toThrow(/not a DropLabCad drawing/i)
  })

  it('refuses JSON that carries no drawing', () => {
    expect(() => parseDrawing('{"hello":"world"}')).toThrow(/layers or entities/i)
  })

  it('says so plainly when the file is from a newer version', () => {
    const future = JSON.stringify({
      format: 'droplabcad-drawing',
      version: 99,
      document: sample(),
    })
    expect(() => parseDrawing(future)).toThrow(/newer version/i)
  })
})

describe('naming the file', () => {
  it('saves as DXF, so drawings open in AutoCAD directly', () => {
    expect(DRAWING_EXTENSION).toBe('.dxf')
  })

  it('swaps the extension rather than piling them up', () => {
    expect(withExtension('plan.dlc', DRAWING_EXTENSION)).toBe('plan.dxf')
    expect(withExtension('plan.dxf', DRAWING_EXTENSION)).toBe('plan.dxf')
  })

  it('adds an extension to a bare name', () => {
    expect(withExtension('plan', DRAWING_EXTENSION)).toBe('plan.dxf')
  })

  it('falls back to a usable name when given nothing', () => {
    expect(withExtension('   ', DRAWING_EXTENSION)).toBe('drawing.dxf')
  })

  it('leaves dots in a folder-like name alone', () => {
    expect(withExtension('site.plan.v2', DRAWING_EXTENSION)).toBe('site.plan.dxf')
  })
})
