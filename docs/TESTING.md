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
- `src/core/dimension.test.ts` (labels, dimension line geometry, multi-click workflow)
- `src/core/store.test.ts` (end-to-end draw pipeline for each tool)

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
