# Testing Guide

## Goals

- Keep geometric operations deterministic.
- Ensure document undo/redo integrity.
- Verify command-level behavior for key drafting operations.
- Validate DXF round-trip smoke paths.

## Current suite

- `src/core/math/vec2.test.ts`
- `src/core/document.test.ts`
- `src/core/commands.test.ts`
- `src/core/dxf.test.ts`
- `src/core/snap.test.ts` (every snap mode, snap priority, polar tracking tolerance, ortho)
- `src/core/selection.test.ts` (window vs crossing selection, bounds, modifiers, groups)
- `src/core/hatch.test.ts` (boundary detection under the picked point)
- `src/core/boundary.test.ts` (regions formed by crossing geometry, checked by area)
- `src/core/dimension.test.ts` (labels, dimension line geometry, multi-click workflow)
- `src/core/store.test.ts` (end-to-end draw pipeline for each tool)
- `src/ui/CanvasViewport.test.tsx` (snap marker position, window/crossing drag selection)

`CanvasViewport.test.tsx` renders the real viewport in jsdom and drives it with mouse events.
Because jsdom reports a zero-origin bounding box, client coordinates map straight to viewport
coordinates; with the camera at the origin and zoom 1 the expected marker positions are exact.
That is what lets the suite assert the snap marker is drawn *at the snap point* rather than
under the raw cursor, which was a real bug.

## Run tests

```bash
npm run test
```

## Watch mode while developing

```bash
npm run test:watch
```

## Coverage report

The default test script writes:

- terminal text summary
- HTML report in `coverage/index.html`

Use the report to add targeted tests around new commands and snap modes as features evolve.
