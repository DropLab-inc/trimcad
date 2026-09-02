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
- `src/core/modify.test.ts` (offset sides and parallelism, trim pieces, extend targets, mirror,
  trim and extend previews, fence crossings, re-trimming a piece that already rests on its edges)
- `src/core/dynamicInput.test.ts` (tracked fields, typed overrides, coordinate parsing)
- `src/core/commandRegistry.test.ts` (alias lookup, autocomplete ordering, no duplicate tokens)
- `src/core/prompts.test.ts` (prompt per step, bracketed options, keyword matching)
- `src/core/commandSession.test.ts` (typing commands, repeat, coordinates and direct distance
  entry, the transform commands, options winning over same-named commands)
- `src/core/commandLifecycle.test.ts` (a run of lines chaining, closing and stepping back; one-shot
  commands returning to the idle prompt; Escape abandoning a command; which picks tracking steers)
- `src/ui/CanvasViewport.test.tsx` (snap marker position, window/crossing drag selection)
- `src/ui/DynamicInput.test.tsx` (typing into dynamic fields, leaving commands with Escape, Enter
  and right-click, drawing with ortho latched on, and the modify tools end to end
  including trim previews, Shift swapping to extend, fence drags and chosen cutting edges)

The command registry test asserts that no two commands claim the same token. That check is the
reason aliases can be added confidently: a clash fails the suite rather than silently shadowing
an existing command.

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
