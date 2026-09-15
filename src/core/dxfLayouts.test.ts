import { describe, expect, it } from 'vitest'
import { createLine } from './commands'
import { makeDefaultDocument } from './document'
import { exportDocumentToDxf, importDocumentFromDxf } from './dxf'
import type { Layout } from './types'

const layerId = (doc: ReturnType<typeof makeDefaultDocument>) => doc.layers[0].id

/** A sheet with everything a viewport can carry set to something non-default. */
const busySheet = (): Layout => ({
  id: 'layout-a',
  name: 'Ground Floor',
  paper: 'a3',
  orientation: 'portrait',
  marginMm: 15,
  entities: [],
  viewports: [
    {
      id: 'viewport-a',
      center: { x: 111.25, y: 222.5 },
      widthMm: 200,
      heightMm: 120,
      modelCenter: { x: 1234.5, y: -678.9 },
      unitsPerMm: 100,
      locked: true,
    },
    {
      id: 'viewport-b',
      center: { x: 40, y: 60 },
      widthMm: 90,
      heightMm: 45,
      modelCenter: { x: 0, y: 0 },
      unitsPerMm: 2,
      locked: false,
    },
  ],
})

const roundTrip = (withLayouts: Layout[]) => {
  const doc = makeDefaultDocument()
  const line = createLine(layerId(doc), { x: 0, y: 0 }, { x: 250, y: 175 })
  const original = { ...doc, entities: [line], layouts: withLayouts }
  const text = exportDocumentToDxf(original)
  return { original, reloaded: importDocumentFromDxf(text, makeDefaultDocument()) }
}

describe('layouts through a save and a reload', () => {
  it('brings a sheet back exactly as it went in', () => {
    const { original, reloaded } = roundTrip([busySheet()])

    expect(reloaded.layouts).toHaveLength(1)
    // The scale, the lock and the off-centre position are what a sheet is; all of them must survive
    // a save, not just the name.
    expect(reloaded.layouts[0]).toEqual(original.layouts[0])
  })

  it('keeps each viewport of a sheet, in order', () => {
    const { reloaded } = roundTrip([busySheet()])
    expect(reloaded.layouts[0].viewports.map((viewport) => viewport.id)).toEqual([
      'viewport-a',
      'viewport-b',
    ])
    expect(reloaded.layouts[0].viewports[0].locked).toBe(true)
    expect(reloaded.layouts[0].viewports[1].locked).toBe(false)
    expect(reloaded.layouts[0].viewports[0].unitsPerMm).toBe(100)
  })

  it('keeps several sheets and their paper sizes apart', () => {
    const second: Layout = { ...busySheet(), id: 'layout-b', name: 'Roof', paper: 'a4', orientation: 'landscape' }
    const { reloaded } = roundTrip([busySheet(), second])

    expect(reloaded.layouts.map((layout) => layout.name)).toEqual(['Ground Floor', 'Roof'])
    expect(reloaded.layouts.map((layout) => layout.paper)).toEqual(['a3', 'a4'])
    expect(reloaded.layouts[1].viewports).toHaveLength(2)
  })

  it('reopens a drawing that was saved before sheets existed', () => {
    // A file written by an older build has no `layouts` key at all, and must not open broken.
    const doc = makeDefaultDocument()
    const line = createLine(layerId(doc), { x: 0, y: 0 }, { x: 10, y: 10 })
    const text = exportDocumentToDxf({ ...doc, entities: [line] }).replace(/"layouts":\[[^\]]*\]/, '')

    const reloaded = importDocumentFromDxf(text, makeDefaultDocument())

    expect(Array.isArray(reloaded.layouts)).toBe(true)
    expect(reloaded.entities).toHaveLength(1)
  })

  it('keeps the geometry too, so a sheet still has something to show', () => {
    const { reloaded } = roundTrip([busySheet()])
    expect(reloaded.entities).toHaveLength(1)
  })
})
