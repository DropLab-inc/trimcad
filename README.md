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

## Drafting controls

The viewport follows AutoCAD conventions.

| Input | Action |
| --- | --- |
| Left click | Place the next point of the active command |
| Right click | Finish the current command |
| `Enter` | Finish an open polyline or spline |
| `C` | Close the current polyline |
| `Esc` | Cancel the current command |
| `Delete` | Erase the current selection |
| Middle mouse drag | Pan |
| Mouse wheel | Zoom at the cursor |
| Hold `Shift` | Ortho: constrain to horizontal/vertical |
| `Ctrl`+`A` | Select everything on visible, unlocked layers |
| `Ctrl`+`Z` / `Ctrl`+`Y` | Undo / redo |

### Selecting objects

With the Select tool, click an object to pick it, or drag a box across the drawing:

| Drag direction | Box | Selects |
| --- | --- | --- |
| Left to right | Solid blue | Only objects **completely inside** the box (window) |
| Right to left | Dashed green | Objects **inside or touching** the box (crossing) |

Hold `Shift` while picking to add to the selection and `Ctrl` to remove from it. Picking any
member of a group selects the whole group. `Esc` clears the selection.

### Object snap

The right-hand Object Snap panel toggles each running snap individually. Endpoint, midpoint,
centre, quadrant, intersection, perpendicular, tangent and node are implemented, each with its
own marker glyph. When several snaps are in range the more specific one wins, so an endpoint is
preferred over a point that merely lies on the curve. Perpendicular and tangent are measured
from the point you are drawing from, so they only appear once a command is in progress.

### Dimensions

Pick the dimension type in the ribbon first. Linear and aligned dimensions take three clicks
(the two extension line origins, then the dimension line location). Radius and diameter take two
(the circle or arc, then the label location). Angular takes four (vertex, both sides, then the
arc location). Dimensions are drawn with extension lines, arrowheads and a text label formatted
using the drawing's dimension style.

### Hatching

Choose a pattern in the ribbon, then click inside any closed area. The smallest closed region
containing the point you clicked is used as the boundary, so nested shapes hatch the way you
would expect.

While a command is running you get a full-screen crosshair, a live preview of the actual
shape (a circle previews as a circle, not just its radius), a dynamic input readout with
length/angle or radius, and the current prompt in the lower-left corner.

Polar tracking only engages when the cursor is within a few degrees of a tracking angle,
so the cursor does not jump while you move it. Object snaps show a marker and a label at
the snapped point.

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
