# DropLabCad

Lightweight browser-based 2D drafting software inspired by AutoCAD workflows.

## Implemented v1 scope

- Draw: line, polyline, rectangle, circle, arc, ellipse, polygon, spline, hatch, text, block insert
- Modify: move, copy, rotate, scale, mirror, offset, delete, fillet, join, explode, break, rectangular/polar array
- Drafting aids: OSNAP, polar tracking, command line aliases, crosshair viewport, pan/zoom
- Structure: layers, linetypes, lineweights, groups, blocks, document history (undo/redo)
- Data I/O: JSON document model, DXF import/export subset, PDF print at drawing scale
- Reliability: autosave + recovery prompt

## Project structure

- `src/core`: CAD kernel (types, geometry, commands, document state, snaps, autosave, dxf, print)
- `src/ui`: UI chrome (toolbar, viewport, layer/properties panels, command line, status bar)
- `src/test`: test harness setup

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown by Vite (typically `http://localhost:5173`).

## Command aliases

- `L`/`LINE`, `C`/`CIRCLE`, `PL`/`POLYLINE`, `REC`/`RECT`
- `A`/`ARC`, `EL`/`ELLIPSE`, `PG`/`POLYGON`, `SP`/`SPLINE`
- `H`/`HATCH`, `D`/`DIM`, `I`/`INSERT`
- `M`/`MOVE`, `MI`/`MIRROR`, `RO`/`ROTATE`, `SC`/`SCALE`
- `O`/`OFFSET`, `F`/`FILLET`, `J`/`JOIN`, `BR`/`BREAK`, `AR`/`ARRAY`
- `G`/`GROUP`, `B`/`BLOCK`, `X`/`EXPLODE`
- `DXFIN`, `DXFOUT`, `PRINT`, `UNDO`, `REDO`, `DEL`

## Self-tests

```bash
npm run test
```

Coverage output:

- terminal summary (text)
- HTML report in `coverage/index.html`

## Build

```bash
npm run build
```

## Notes

- DXF support is intentionally a subset for lightweight interoperability.
- Hatch, spline, and some modify operations are pragmatic implementations aimed at speed and usability in v1.
