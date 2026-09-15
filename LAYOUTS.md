# Paper space: layouts, viewports and page setups

Tracking issue: **#2** — *Paper space: layouts, viewports and page setups*

## The problem

TrimCAD has one drawing space. Everything is drawn in world coordinates and `PLOT` maps a
region of that space onto a sheet. That is enough to get lines onto paper, but not enough to
**issue** a drawing: there is no sheet with a title block, no way to place a scaled view of
the model at a known position, and no way to keep several sheets in one file.

AutoCAD splits this in two. **Model space** is where geometry is drawn, at full size.
**Paper space** — one or more *layouts* — is the sheet: a page of a given size, onto which
*viewports* project the model at a chosen scale.

## The model

```ts
type Viewport = {
  id: string
  /** Centre of the viewport on the sheet, in millimetres from the paper's bottom-left. */
  center: Vec2
  widthMm: number
  heightMm: number
  /** The drawing point shown at the viewport's centre. */
  modelCenter: Vec2
  /** Drawing units per millimetre of paper. 50 means 1:50. */
  unitsPerMm: number
  /** A locked viewport keeps its scale and its model centre when panned or zoomed. */
  locked: boolean
}

type Layout = {
  id: string
  name: string
  paper: PaperSize
  orientation: PaperOrientation
  marginMm: number
  /** Paper-space geometry: a title block, notes, a border. Drawn in paper millimetres. */
  entities: CadEntity[]
  viewports: Viewport[]
}
```

`DrawingDocument` gains `layouts: Layout[]`, and the store gains `activeLayoutId: string | null`
— `null` meaning model space, which is where the app starts and where every existing tool
already works.

**Why `unitsPerMm` rather than a paper:drawing ratio.** The plot dialog already names scales as
paper:drawing (`1:50`), and `scaleFactor` in `print.ts` already converts between the two. A
viewport stores the same number that function produces, so a viewport at 1:50 and a plot of a
model at 1:50 agree by construction rather than by two conversion paths that can drift.

## Space switching

One active space at a time, the way AutoCAD works:

- **Model space** — unchanged. Grid, snaps, picks, every draw and modify tool.
- **Paper space** — the sheet is drawn as a white page on the canvas. New drawing tools are
  disabled (a layout is composed, not drawn freehand); `MVIEW` places viewports; selecting a
  viewport shows its scale in the properties panel.

The camera is shared. Switching spaces re-frames rather than trying to keep a transform that
means nothing across the two.

## Rendering

In a layout the canvas draws, in order:

1. The sheet: paper rectangle, drop shadow, printable margin.
2. Paper-space entities, transformed millimetres → screen (no model transform).
3. Each viewport: its frame, then the model geometry transformed into it
   (`screen = viewportOrigin + (modelPoint - modelCenter) / unitsPerMm * zoom + zoom/pan`),
   clipped to the frame.
4. The active viewport's frame highlighted, the way AutoCAD marks the one being worked in.

Entities hidden by a frozen or unplottable layer are skipped inside a viewport, reusing
`plottableEntities` so paper and model agree on what belongs on a sheet.

## Plotting

`PLOT` gains a layout target. Plotting a layout is **1:1, always** — the sheet is already the
sheet, so no scale or area choice applies; `exportPdf` is handed the layout's paper size and
its viewports are flattened into ordinary geometry at their own scales. Plotting model space
keeps every existing option. This is exactly how AutoCAD splits the two, and it removes the
"fit the model to A4" guesswork from the issuing path.

## Save and load

Free, mostly: DXF export already embeds the whole document as a `999 TRIMCAD-DOCUMENT:` comment,
so layouts ride along in the file the app already writes, and `parseDrawing` merges defaults so
an older file without `layouts` opens with none. Verifying that round-trip is part of Phase 1.

**Phase 2** writes real DXF paperspace: a `LAYOUT` record per layout, paper-space entities into
the layout's block, and `VIEWPORT` entities for the frames, so AutoCAD sees the sheets rather
than only TrimCAD.

## Phases

- **Phase 1 — the space exists.** Layout and Viewport types, `layouts` on the document, layout
  tabs, switching, sheet + viewport rendering with clipping, `MVIEW` to place a viewport,
  viewport move/scale by grip, viewport scale and lock in the properties panel, `PLOT` a layout
  at 1:1, save/load round-trip, tests.
- **Phase 2 — files.** DXF paperspace records and viewport entities both ways.
- **Phase 3 — paper-space annotation.** Draw and edit in paper space, page setups that carry a
  title block, `LAYOUT` copy/rename/delete from a manager, per-layout plot styles (depends on
  #13).

## Out of scope

Named page setups as a reusable library, and sheet sets — both are on the roadmap separately
(#13), and neither is needed for a layout to be useful.
