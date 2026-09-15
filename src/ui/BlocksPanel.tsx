import { useCadStore } from '../core/store'
import { renderEntity } from './renderers'
import { entityBounds, type Bounds } from '../core/selection'
import { useCanvasPalette } from './theme'

/**
 * The Blocks panel — AutoCAD's Blocks palette, as a panel beside the layers.
 *
 * Its reason for existing is that nothing else answered "what blocks are in this drawing". The only
 * route to a block's name was a `?` keyword hidden inside INSERT's name prompt, which lists names into
 * a command history nobody reads unless they already know to look. A palette shows what exists, how
 * often each is placed, and places one on a click — no name to remember.
 */

const PREVIEW = 34

/** Every block in the drawing, with how many times it is placed. */
const placedCount = (blockId: string) =>
  [...useCadStore.getState().doc.entities, ...useCadStore.getState().doc.layouts.flatMap((l) => l.entities)]
    .filter((entity) => entity.type === 'insert' && entity.blockId === blockId).length

/**
 * A small drawing of the block itself, fitted into a square. A palette without previews is a list of
 * names, and picking the right block out of a list of names is exactly the problem it should solve.
 */
function BlockPreview({ blockId }: { blockId: string }) {
  const doc = useCadStore((state) => state.doc)
  const palette = useCanvasPalette()
  const block = doc.blocks.find((candidate) => candidate.id === blockId)
  if (!block) return <span className="block-preview" />

  const boxes = block.entities
    .map((entity) => entityBounds(entity, doc.blocks))
    .filter((box): box is Bounds => box !== null)
  if (boxes.length === 0) {
    return <span className="block-preview" aria-hidden="true" />
  }

  const minX = Math.min(...boxes.map((box) => box.min.x))
  const minY = Math.min(...boxes.map((box) => box.min.y))
  const maxX = Math.max(...boxes.map((box) => box.max.x))
  const maxY = Math.max(...boxes.map((box) => box.max.y))
  // A degenerate block is still a block: guard the ratio so a dot does not divide by zero.
  const width = Math.max(maxX - minX, 1e-6)
  const height = Math.max(maxY - minY, 1e-6)
  const scale = (PREVIEW - 6) / Math.max(width, height)

  return (
    <svg
      className="block-preview"
      width={PREVIEW}
      height={PREVIEW}
      viewBox={`0 0 ${PREVIEW} ${PREVIEW}`}
      aria-hidden="true"
    >
      <g transform={`translate(${PREVIEW / 2}, ${PREVIEW / 2}) scale(${scale}) translate(${-(minX + maxX) / 2}, ${-(minY + maxY) / 2})`}>
        {block.entities.map((entity) =>
          renderEntity(entity, {
            selected: false,
            color: palette.fallbackEntity,
            dimStyle: doc.dimStyle,
            palette,
          }),
        )}
      </g>
    </svg>
  )
}

export function BlocksPanel() {
  const blocks = useCadStore((state) => state.doc.blocks)
  const insertBlockFromPalette = useCadStore((state) => state.insertBlockFromPalette)

  return (
    <section className="panel">
      <h3>Blocks</h3>
      {blocks.length === 0 ? (
        <p className="panel-note">
          Nothing defined yet. Select objects and use <strong>BLOCK</strong> to make one — they then
          appear here to place.
        </p>
      ) : (
        <ul className="block-list">
          {blocks.map((block) => (
            <li key={block.id} className="block-row">
              <button
                type="button"
                className="block-insert"
                title={`Place "${block.name}" — inserted ${placedCount(block.id)} time(s) in this drawing`}
                aria-label={`Insert block ${block.name}`}
                onClick={() => insertBlockFromPalette(block.id)}
              >
                <BlockPreview blockId={block.id} />
                <span className="block-name">{block.name}</span>
                <span className="block-count">{placedCount(block.id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
