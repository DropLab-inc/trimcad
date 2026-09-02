import { useState } from 'react'
import {
  breakLine,
  createFillet,
  joinEntities,
  mirrorEntities,
  moveEntities,
  offsetEntities,
  polarArray,
  rectangularArray,
  rotateEntities,
  scaleEntities,
} from '../core/commands'
import { exportDocumentToDxf, importDocumentFromDxf } from '../core/dxf'
import { exportPdf } from '../core/print'
import { useCadStore } from '../core/store'

export function CommandLine() {
  const [value, setValue] = useState('')
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)
  const doc = useCadStore((state) => state.doc)
  const selectedIds = useCadStore((state) => state.selectedIds)
  const executeCommand = useCadStore((state) => state.executeCommand)
  const updateDocument = useCadStore((state) => state.updateDocument)
  const undo = useCadStore((state) => state.undo)
  const redo = useCadStore((state) => state.redo)
  const deleteSelection = useCadStore((state) => state.deleteSelection)

  const runCommand = (line: string) => {
    const command = line.trim().toUpperCase()
    if (!command) return
    if (command === 'UNDO') return undo()
    if (command === 'REDO') return redo()
    if (command === 'DEL') return deleteSelection()
    if ((command === 'M' || command === 'MOVE') && selectedIds.length > 0) {
      const dx = Number(window.prompt('Move dx', '10') ?? '0')
      const dy = Number(window.prompt('Move dy', '10') ?? '0')
      updateDocument((draft) => ({ ...draft, entities: moveEntities(draft.entities, selectedIds, { x: dx, y: dy }) }))
      return
    }
    if ((command === 'CP' || command === 'COPY') && selectedIds.length > 0) {
      const dx = Number(window.prompt('Copy dx', '10') ?? '0')
      const dy = Number(window.prompt('Copy dy', '10') ?? '0')
      updateDocument((draft) => {
        const moved = moveEntities(draft.entities, selectedIds, { x: dx, y: dy }).filter((entity) =>
          selectedIds.includes(entity.id),
        )
        return { ...draft, entities: [...draft.entities, ...moved.map((entity) => ({ ...entity, id: crypto.randomUUID() }))] }
      })
      return
    }
    if ((command === 'MI' || command === 'MIRROR') && selectedIds.length > 0) {
      updateDocument((draft) => ({
        ...draft,
        entities: mirrorEntities(draft.entities, selectedIds, { x: 0, y: 0 }, { x: 100, y: 0 }),
      }))
      return
    }
    if ((command === 'RO' || command === 'ROTATE') && selectedIds.length > 0) {
      const angle = Number(window.prompt('Angle degrees', '45') ?? '0')
      updateDocument((draft) => ({
        ...draft,
        entities: rotateEntities(draft.entities, selectedIds, { x: 0, y: 0 }, angle),
      }))
      return
    }
    if ((command === 'SC' || command === 'SCALE') && selectedIds.length > 0) {
      const factor = Number(window.prompt('Scale factor', '1.5') ?? '1')
      updateDocument((draft) => ({
        ...draft,
        entities: scaleEntities(draft.entities, selectedIds, { x: 0, y: 0 }, factor),
      }))
      return
    }
    if ((command === 'O' || command === 'OFFSET') && selectedIds.length > 0) {
      const dist = Number(window.prompt('Offset distance', '10') ?? '0')
      updateDocument((draft) => ({ ...draft, entities: offsetEntities(draft.entities, selectedIds, dist) }))
      return
    }
    if ((command === 'J' || command === 'JOIN') && selectedIds.length > 1) {
      const layerId = doc.layers[0].id
      updateDocument((draft) => ({ ...draft, entities: joinEntities(draft.entities, selectedIds, layerId) }))
      return
    }
    if ((command === 'BR' || command === 'BREAK') && selectedIds.length === 1) {
      updateDocument((draft) => ({ ...draft, entities: breakLine(draft.entities, selectedIds[0], { x: 0, y: 0 }) }))
      return
    }
    if ((command === 'F' || command === 'FILLET') && selectedIds.length >= 2) {
      updateDocument((draft) => {
        const selected = draft.entities.filter((entity) => selectedIds.includes(entity.id))
        const lines = selected.filter((entity) => entity.type === 'line')
        if (lines.length < 2) return draft
        const fillet = createFillet(draft.layers[0].id, lines[0], lines[1], Number(window.prompt('Fillet radius', '10') ?? '10'))
        if (!fillet) return draft
        return { ...draft, entities: [...draft.entities, fillet] }
      })
      return
    }
    if ((command === 'CHA' || command === 'CHAMFER') && selectedIds.length >= 2) {
      updateDocument((draft) => {
        const selected = draft.entities.filter((entity) => selectedIds.includes(entity.id))
        const lines = selected.filter((entity) => entity.type === 'line')
        if (lines.length < 2) return draft
        return {
          ...draft,
          entities: [
            ...draft.entities,
            {
              id: crypto.randomUUID(),
              type: 'line',
              layerId: draft.layers[0].id,
              start: lines[0].end,
              end: lines[1].start,
            },
          ],
        }
      })
      return
    }
    if ((command === 'AR' || command === 'ARRAY') && selectedIds.length > 0) {
      const kind = window.prompt('Array type: rect|polar', 'rect')
      if (kind === 'polar') {
        updateDocument((draft) => ({
          ...draft,
          entities: polarArray(draft.entities, selectedIds, { x: 0, y: 0 }, 8, 360),
        }))
      } else {
        updateDocument((draft) => ({
          ...draft,
          entities: rectangularArray(draft.entities, selectedIds, 2, 3, 30, 30),
        }))
      }
      return
    }
    if (command === 'X' || command === 'EXPLODE') {
      updateDocument((draft) => ({
        ...draft,
        groups: draft.groups.filter((group) => !selectedIds.some((id) => group.entityIds.includes(id))),
      }))
      return
    }
    if (command === 'G' || command === 'GROUP') {
      updateDocument((draft) => ({
        ...draft,
        groups: [...draft.groups, { id: crypto.randomUUID(), name: `G${draft.groups.length + 1}`, entityIds: selectedIds }],
      }))
      return
    }
    if (command === 'B' || command === 'BLOCK') {
      const name = window.prompt('Block name', `Block${doc.blocks.length + 1}`)
      if (!name) return
      updateDocument((draft) => ({
        ...draft,
        blocks: [
          ...draft.blocks,
          {
            id: crypto.randomUUID(),
            name,
            entities: draft.entities.filter((entity) => selectedIds.includes(entity.id)),
          },
        ],
      }))
      return
    }
    if (command === 'I' || command === 'INSERT') {
      if (!doc.blocks[0]) return
      updateDocument((draft) => ({
        ...draft,
        entities: [
          ...draft.entities,
          {
            id: crypto.randomUUID(),
            type: 'insert',
            layerId: draft.layers[0].id,
            blockId: draft.blocks[0].id,
            position: { x: 0, y: 0 },
            rotation: 0,
            scale: 1,
          },
        ],
      }))
      return
    }
    if (command === 'PRINT') {
      exportPdf(doc, 'fit')
      return
    }
    if (command === 'PRINT1' || command === 'PRINT 1:1') {
      exportPdf(doc, '1:1')
      return
    }
    if (command === 'DXFOUT') {
      const dxf = exportDocumentToDxf(doc)
      const blob = new Blob([dxf], { type: 'application/dxf' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'drawing.dxf'
      link.click()
      URL.revokeObjectURL(link.href)
      return
    }
    if (command === 'DXFIN') {
      fileInput?.click()
      return
    }
    executeCommand(command)
  }

  return (
    <section className="command-line">
      <span>Command:</span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            runCommand(value)
            setValue('')
          }
          if (event.key === 'Escape') {
            setValue('')
          }
        }}
        placeholder="LINE, CIRCLE, OFFSET, MIRROR, ARRAY, DXFOUT..."
      />
      <button type="button" onClick={() => runCommand(value)}>
        Run
      </button>
      <input
        ref={setFileInput}
        style={{ display: 'none' }}
        type="file"
        accept=".dxf"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          const content = await file.text()
          updateDocument((draft) => importDocumentFromDxf(content, draft))
        }}
      />
    </section>
  )
}
