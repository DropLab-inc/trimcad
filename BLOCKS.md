# TrimCAD blocks — detailed implementation plan

Dev environment: `/home/hermes/trimcad-blocks` (git worktree, branch `feat/blocks`, off
`feat/docs-requests-sponsorship`). Dev server `http://127.0.0.1:5199/` (loopback). Live site is
`/home/hermes/trimcad/dist` on `:8097` via the Cloudflare tunnel — never `npm run build` the main
checkout or restart `trimcad.service` while working here.

## Decisions (confirmed)

- **BLOCK converts the selection to an insert in place** — the source objects become the definition
  and are replaced by a single INSERT at the same place; nothing moves on screen.
- **No block editor in v1** — redefine = run BLOCK again with the same name; every insert updates.
- **DXF round-trip is in v1** — a drawing with blocks must survive save/load; losing them is a bug.

## Current state (verified against source)

The schema is half-built in `src/core/types.ts`:

- `InsertEntity` — `type: 'insert'`, `blockId`, `position: Vec2`, `rotation` (radians), `scale` (uniform).
- `BlockDefinition` — `id`, `name`, `entities: CadEntity[]`. **No base point.**
- `DrawingDocument.blocks: BlockDefinition[]`.
- `ToolMode` includes `'insert'` (unreachable — no command maps to it).

Working plumbing: move/rotate/scale/mirror all handle inserts (`commands.ts`); selection has crude
bounds (`selection.ts`, a `6*scale` square); snap hits `position` (`snap.ts`); EXPLODE expands an
insert to its block's members with scale→rotate→translate about the **origin** (`explode.ts`,
`explodeInsert`); a move grip exists (`grips.ts`).

Gaps:

1. **No BLOCK or INSERT command** (`commandRegistry.ts` has neither).
2. **Renderer draws a placeholder** (`renderers.tsx` `case 'insert'` is a 10×10 X-box).
3. **No base point** — nothing for `position` to mean; explode/transform assume origin.
4. **DXF ignores blocks** — `dxf.ts` `WRITABLE` and `readEntity` have no INSERT/BLOCK.
5. **No management** — cannot list/pick/redefine/delete a definition.

Two findings that shape the DXF work:

- **The whole document is already embedded in the file.** `exportDocumentToDxf` writes the entire
  `DrawingDocument` as a `999` comment (`TRIMCAD-DOCUMENT:` + JSON), and `readEmbedded` restores it
  when the DXF geometry fingerprint still matches. So blocks already survive save/load *inside
  TrimCAD* with zero new code — the real DXF BLOCK/INSERT work exists for **interoperability** and
  for the "edited in another program" case, not for our own round-trip.
- **dxf-writer ships block primitives** (`Block.js`, `BlockRecord.js`); the exact public call must be
  confirmed as the first step of Phase 2 (see below).

## Data model change

Add to `BlockDefinition` (types.ts):

```ts
/** Where the block's own origin sits. INSERT places this point. Absent = {0, 0}. */
basePoint?: Vec2
```

Optional (not required) so existing fixtures and tests that build `BlockDefinition` without it keep
passing — same migration pattern as `DimensionEntity.scale`. `InsertEntity.position` is where the
base point lands.

## Design

### BLOCK (command, alias `B`, category Modify)

Prompt sequence (uses the existing prompt/step state machine — `prompts.ts`):

1. `selection` "Select objects to make a block" — skipped if a selection already exists.
2. `text` "Enter block name" — default = last used name or a generated one; keyword `?` lists
   existing names into the command history.
3. `point` "Specify base point".

Commit (atomic, undoable as one action):

- `BlockDefinition { id: uid(), name, basePoint, entities: <selected entities> }`.
- Remove those entities from `doc.entities`.
- Add `InsertEntity { blockId, position: basePoint, rotation: 0, scale: 1 }` on the current layer.

**Redefine:** if `name` already exists, ask "Block '<name>' already exists. Redefine it? <No>" (a
confirm prompt). On yes, keep the **same `id`**, replace `entities` and `basePoint`. Inserts
reference `blockId`, and the renderer reads the definition live, so every insert in the drawing
updates for free. On no, back to the name step.

### INSERT (command, alias `I`, tool `insert`, category Draw)

1. `text` "Enter block name" — default = last inserted; `?` lists names.
2. `point` "Specify insertion point" (base point lands here).
3. `number` "Specify scale factor" `<1>`.
4. `number` "Specify rotation angle" `<0>` (degrees, like the rest of the app's prompts; stored as
   radians).

Uniform scale only — matches the single `scale` field. Non-uniform X/Y is Phase 3 (`scaleX`/`scaleY`).

### Free-text entry (`text` PromptKind)

`PromptKind` is currently `point | number | entity | selection`. Block names are free text, so add
`'text'`. Route it through the existing command-line input field (which already mirrors typed text
and drives the soft keyboard) — not `window.prompt`, which is what TEXT uses today and is the
wrong UX on touch. `text` prompts accept an empty default (Enter keeps the default), and `?` as a
keyword that lists names.

### Rendering (renderers.tsx)

Replace the placeholder with a recursive expansion. For an insert with block `B` and members `m`:

- Member local point → `p' = position + R(rotation) · (scale · (m − basePoint))`.
- SVG: `<g transform="translate(pos) rotate(deg) scale(s) translate(-basePoint)">` then render each
  member; a member that is itself an insert recurses with the **composed** transform.
- Keep the outer `<g>` keyed by the insert's `id` so selection still lands on the insert, not the
  members.
- Depth cap (e.g. 8) and a visited-`blockId` set guard against definition cycles.

### Hit-testing and bounds

- `geometry.ts` `pointOnEntity` currently treats an insert as a point (`distance ≤ 2·tol`). Change
  it to test against the block's transformed member geometry, so clicking any part of a block picks
  the insert — the difference between "feels like a block" and "feels broken".
- `selection.ts` insert bounds (the `6*scale` square) become the union of the members' transformed
  bounds, so zoom-extents and window selection include the real shape.

### Explode (explode.ts)

`explodeInsert` rotates/scales about `{0,0}`. Change the pivot to `block.basePoint ?? {0,0}` and
translate by `position`. Layer-0 adoption (members on layer `0` take the insert's layer) already
works and stays.

### DXF (dxf.ts) — Phase 2

Write (export):

- For each definition: a BLOCK/ENDBLK table section (name group 2, base point 10/20, members as
  real entities on their layers). Confirm dxf-writer's block call — it ships `Block`/`BlockRecord`
  classes; if the high-level API is awkward, emit the BLOCK/ENDBLK section directly via
  `TagsManager`/string and keep the writer for entities.
- For each `insert` entity: an INSERT entity — name (2), position (10/20), scale (41/42/43),
  rotation (50, degrees).

Read (import):

- Parse BLOCK sections into `blocks[]` (confirm `dxf-parser` exposes block definitions; it returns
  per-entity records, so this may need the raw section walk) and INSERT entities into `InsertEntity`
  referencing the block's id by name.
- Extend `fingerprintOf` to cover insert and block-member geometry, so an external edit to a block
  is detected and the embedded document is correctly discarded. Today `WRITABLE` excludes
  inserts/blocks, which would silently mask an external edit once blocks become real DXF.

The embedded `999` document keeps carrying the app-only extras (hatch, dimension scale, groups,
lineweights) exactly as today.

### Management (Phase 3)

Palette/panel listing definitions (name, member count) with Insert-by-click, plus rename, redefine,
delete (delete refuses while referenced), and non-uniform scale.

## Files to touch

- `src/core/types.ts` — `basePoint?` on `BlockDefinition`.
- `src/core/prompts.ts` — `'text'` kind; BLOCK and INSERT sequences; `PromptContext` fields
  (pending block name, scale, rotation).
- `src/core/commandRegistry.ts` — `BLOCK` (B), `INSERT` (I).
- `src/core/store.ts` — BLOCK/INSERT actions, typed-`text` routing, atomic undo.
- `src/ui/renderers.tsx` — recursive expansion with composed transform.
- `src/core/geometry.ts` — transformed hit-test for inserts; `src/core/selection.ts` bounds.
- `src/core/explode.ts` — base-point pivot.
- `src/core/dxf.ts` — BLOCK/INSERT write+read, fingerprint.
- New `src/ui/` block palette (Phase 3).
- Tests: `commands`, `store`, `explode`, `geometry`/`selection`, renderer, `dxf` round-trip.

## Phase order (test-first, one PR-worth each)

**Phase 1 — create, place, render, explode.** types → prompts → commands → store → renderer →
hit-test/bounds → explode. Round-trip test: draw shapes → BLOCK → INSERT → explode → same geometry.

**Phase 2 — DXF.** writer + parser BLOCK/INSERT, fingerprint, round-trip tests including "edited in
another program invalidates the embedded copy".

**Phase 3 — management + polish.** palette, rename/redefine/delete, non-uniform scale.

## Edge cases

- BLOCK with an empty selection → error, no definition.
- Self-referential / cyclic definitions → depth cap + visited set in the renderer; validation on
  redefine (refuse a cycle).
- Duplicate name → redefine confirm.
- Insert with a missing `blockId` → render the current placeholder (or nothing) rather than crash;
  explode already returns null.
- Undo/redo across a BLOCK or redefine must restore the definition, the members and the insert
  together (one history entry).
- Degrees vs radians: prompts take degrees (app convention), `InsertEntity.rotation` stays radians.
