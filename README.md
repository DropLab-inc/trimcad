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

## Working at the command line

The command line drives the application, as it does in AutoCAD. You never have to click into it
first: start typing anywhere over the drawing and the keystrokes land there, with a suggestion
list that narrows as you type.

| Input | Action |
| --- | --- |
| Type a command | `LINE`, or its alias `L`. Case does not matter |
| `Enter` or `Space` | Accept the command, or finish the one that is running |
| `Enter` at an idle prompt | Repeat the last command |
| `Tab` | Complete to the highlighted suggestion |
| `↑` / `↓` | Move through the suggestions, or recall earlier entries |
| `Esc` | Leave the running command and go back to selecting |

### How a command begins and ends

Commands behave the way they do in AutoCAD, so the crosshair is either running a command or
sitting at an idle prompt ready to select.

- **`LINE` keeps going.** Each click draws a segment and leaves the rubber band attached to the
  point you just placed, so the next click continues the run. `C` closes it back to the start and
  `U` steps back a segment. `PLINE` and `SPLINE` behave the same way.
- **Everything else finishes on its own.** Once a circle, rectangle, arc or a `MOVE` is complete
  the command ends and you are back at the idle prompt where clicking picks objects. Press `Enter`
  or `Space` to run it again.
- **`Enter`, `Space` and right-click accept.** They close the running command and return you to
  the idle prompt; from there they repeat whatever ran last.
- **`Esc` always gets you out.** It abandons the running command, throws away any half-drawn
  geometry and returns to selection. Pressing it again at the idle prompt clears the selection.

The prompt tells you what the command wants next and lists its options in brackets, for example
`Select object to trim or shift-select to extend or [cuTting edges/Fence/Undo]:`. Typing an
option's letters picks it, and those letters win over any command of the same name: `C` closes a
polyline mid-command but starts CIRCLE at an idle prompt.

Everything that scrolls past is kept in the history panel above the input.

## Drafting controls

| Input | Action |
| --- | --- |
| Left click | Place the next point of the active command |
| Right click | Accept the current command, as `Enter` does |
| `Esc` | Leave the current command and go back to selecting |
| `Delete` | Erase the current selection |
| Middle mouse drag | Pan |
| Mouse wheel | Zoom at the cursor |
| Hold `Shift` | Ortho: constrain to horizontal/vertical |
| `F3` / `F8` / `F10` | Toggle object snap, ortho and polar tracking |
| `Ctrl`+`A` | Select everything on visible, unlocked layers |
| `Ctrl`+`Z` / `Ctrl`+`Y` | Undo / redo |

The status bar along the bottom shows the crosshair coordinates and carries the OSNAP, ORTHO and
POLAR toggles, which stay lit while they are on.

ORTHO and polar tracking steer picks that measure a direction from the previous point, such as the
next point of a line or the displacement of a `MOVE`. They deliberately leave alone the picks that
set two sizes at once — a rectangle's opposite corner and an ellipse's axis point — because
forcing those onto an axis would flatten the shape to nothing.

### Selecting objects

With the Select tool, click an object to pick it, or drag a box across the drawing:

| Drag direction | Box | Selects |
| --- | --- | --- |
| Left to right | Solid blue | Only objects **completely inside** the box (window) |
| Right to left | Dashed green | Objects **inside or touching** the box (crossing) |

Hold `Shift` while picking to add to the selection and `Ctrl` to remove from it. Picking any
member of a group selects the whole group. `Esc` clears the selection.

### Dynamic input

While a command is running, editable fields follow the crosshair, the same way AutoCAD's dynamic
input works. Drawing a line shows Length and Angle; a rectangle shows Width and Height; a circle
shows Radius.

Just start typing to set the highlighted field, `Tab` to move to the next one, and `Enter` to
place the point. A field you have typed into stops tracking the cursor while the others keep
following it, so you can type a length of `250`, press `Tab`, type `30`, and press `Enter` to
draw exactly 250 units at 30 degrees. `Backspace` corrects a digit and `Esc` discards the entry.

You can also type coordinates into the command line:

| Entry | Meaning |
| --- | --- |
| `50,30` | Absolute point |
| `@50,30` | Relative to the last point |
| `@250<30` | 250 units at 30 degrees from the last point |
| `250` | Direct distance entry: 250 units the way the crosshair points |

### Modifying objects

| Tool | How it works |
| --- | --- |
| Move | Select objects, pick a base point, then pick where it goes |
| Copy | As Move, but the originals stay put |
| Rotate | Select objects, pick a base point, then type an angle or pick a direction |
| Scale | Select objects, pick a base point, then type a factor |
| Offset | Set a distance in the ribbon, click the object, then click the side to offset toward |
| Trim | Click the part you want removed |
| Extend | Click the end you want lengthened |
| Mirror | Select objects first, then pick the two points of the mirror line |

Offset produces a true parallel outline, so offsetting a rectangle inwards gives a smaller
rectangle rather than a diagonally shifted one. "Keep source" in the ribbon controls whether
Mirror leaves the originals in place.

### Trim and extend

Trim and extend are the same command with the roles reversed, so **holding Shift swaps between
them** and the prompt updates to say so. Both start in AutoCAD's quick mode, where every visible
object acts as an edge.

As the crosshair passes over an object the piece that a click would remove is shaded in red
dashes, and the length an extend would gain is shown in green, so you can see the result before
committing to it.

- **Pick** an object to trim or extend it.
- **Drag a fence** across the drawing to do the whole run in one stroke and one undo step; every
  object the fence crosses is treated as its own pick.
- **`T` (or `B` for extend)** narrows the edges to a chosen set: select them, then press `Enter`.
  The ribbon shows whether all objects or a chosen few are acting as edges.
- **`U`** undoes the last edit without leaving the command.

Trimming a full circle leaves an arc covering everything except the piece you picked. A piece
whose ends already rest on edges, which is what you are left with after a first trim, has nothing
left to cut, so picking it erases it.

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

Choose a pattern in the ribbon, then click inside any enclosed area.

The boundary does not have to be a single object. Every visible curve is split at its
intersections and the resulting arrangement is searched for the smallest region surrounding
your pick point, so a line drawn across a circle lets you hatch either half, four crossing
lines enclose a rectangle, and two overlapping circles let you hatch just the lens between
them. Nested shapes hatch the region you actually clicked in rather than the outer shape.

While a command is running you get a full-screen crosshair, a live preview of the actual
shape (a circle previews as a circle, not just its radius), the dynamic input fields described
above, and the current prompt in the lower-left corner. Offset and Mirror preview their result
before you commit it.

Polar tracking only engages when the cursor is within a few degrees of a tracking angle,
so the cursor does not jump while you move it. Object snaps show a marker and a label at
the snapped point.

## Commands

Every command lives in one table, `src/core/commandRegistry.ts`, which also feeds the
autocomplete list. Type `HELP` to print the whole table into the history panel.

| Group | Commands |
| --- | --- |
| Draw | `LINE`/`L`, `PLINE`/`PL`, `RECTANG`/`REC`, `CIRCLE`/`C`, `ARC`/`A`, `ELLIPSE`/`EL`, `POLYGON`/`POL`, `SPLINE`/`SPL`, `HATCH`/`H` |
| Annotate | `TEXT`/`DT`, `DIM`/`D`, `DIMLINEAR`/`DLI`, `DIMALIGNED`/`DAL`, `DIMRADIUS`/`DRA`, `DIMDIAMETER`/`DDI`, `DIMANGULAR`/`DAN` |
| Modify | `MOVE`/`M`, `COPY`/`CO`, `ROTATE`/`RO`, `SCALE`/`SC`, `MIRROR`/`MI`, `OFFSET`/`O`, `TRIM`/`TR`, `EXTEND`/`EX`, `ERASE`/`E`, `JOIN`/`J`, `GROUP`/`G`, `EXPLODE`/`X`, `INSERT`/`I` |
| Edit | `SELECT`/`SE`, `ALL`, `UNDO`/`U`, `REDO`/`RE` |
| View | `ZOOM`/`Z`, `OSNAP`/`OS`, `ORTHO`/`OR`, `POLAR`/`PO`, `HELP` |
| File | `DXFIN`, `DXFOUT`, `PLOT`/`PRINT`, `PLOT1` |

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
