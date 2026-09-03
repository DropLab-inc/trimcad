# DropLabCad

Lightweight browser-based 2D drafting software inspired by AutoCAD workflows.

## Implemented v1 scope

- Draw: line, polyline, rectangle, circle (centre, 2P, 3P, tangent-tangent-radius), arc, ellipse,
  polygon (inscribed, circumscribed, by edge), spline, hatch, text, block insert
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

### Drawing circles and polygons

`CIRCLE` opens on a centre and a radius, and the options at that prompt pin the circle down other
ways instead. `D` at the radius prompt reads the size across the circle rather than out from the
middle, so a diameter taken off a drawing can be typed in as it was measured.

| Option | What it takes |
| --- | --- |
| `2P` | Two points, taken as opposite ends of a diameter |
| `3P` | Three points on the rim, which one circle passes through |
| `T` | Two objects to sit tangent to, then a radius |

Three points in a straight line have no circle through them, and the command says so rather than
drawing something arbitrary. `Ttr` picks lines, polylines, arcs and circles; several circles of the
same radius usually touch a given pair, so **where you click each object chooses between them** —
clicking two lines near their crossing tucks the circle into that corner, and clicking the far
sides puts it on the far side. A radius too small to reach both objects is refused. Each `CIRCLE`
starts back at centre-and-radius, as AutoCAD's does.

`POLYGON` sizes its shape by a circle, and `I` and `C` decide which part of the polygon sits on
that circle. **Inscribed** puts the corners on it, which is the default; **circumscribed** puts the
middle of each side on it instead, so the corners stand further out. The distinction matters
whenever the polygon has to fit something real: a bolt head measured across its flats is
circumscribed, while one measured corner to corner is inscribed. Unlike the circle options, this
choice is remembered for the next polygon.

`E` takes the Edge route instead, where you draw one side and the rest of the shape follows from
it, built to the left of the direction you drew. Edge is a one-off, so the next polygon goes back
to being sized by its circle.

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
| Fillet | Set a radius, click one line then another, and the corner is rounded off |
| Chamfer | Set a distance, click one line then another, and the corner is cut square across |
| Mirror | Select objects first, then pick the two points of the mirror line |
| Array | Select objects first, then set the grid out or pick a centre to sweep around |

Offset produces a true parallel outline, so offsetting a rectangle inwards gives a smaller
rectangle rather than a diagonally shifted one. "Keep source" in the ribbon controls whether
Mirror leaves the originals in place.

### Arrays

`ARRAY` repeats the selection, either in a grid or around a centre. `R` and `PO` switch between
the two, and `ARRAYRECT` and `ARRAYPOLAR` start the command with the choice already made. The
whole array previews under the crosshair before you commit to it, and arrives as a single undo
step so a misjudged count costs one keystroke to take back.

A **rectangular** array takes its spacing the way Move takes a displacement: pick a base point,
then pick where the neighbouring item goes. This means the gap can be snapped off existing
geometry instead of guessed at, and the two axes can be set in one gesture, since the horizontal
part of that displacement spaces the columns and the vertical part spaces the rows. Dragging back
past the base point gives a negative spacing, which builds the grid down and to the left. Rows and
columns come from the ribbon, or from `R` and `COL` at the prompt.

A **polar** array needs only its centre. The item count includes the original, so six items over a
full turn sit sixty degrees apart. The fill angle behaves as AutoCAD's does: a partial sweep puts
an item at each end and divides the angle by the gaps between them, so four items over 180 degrees
land at 0, 60, 120 and 180; a full turn divides by the count instead, so the last item does not
stack on top of the first. A negative angle sweeps the other way. `I`, `A` and `ROT` set the
count, the angle, and whether copies turn to follow the sweep — turning it off carries each copy
around the same arc while leaving its heading alone, which is what you want for things like text
or fixture symbols that should stay upright.

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

### Fillet and chamfer

Both work the same way: click one straight edge, then another, and the corner between them is
replaced. Fillet rounds it with an arc of the radius set in the ribbon; chamfer cuts straight
across at the distance set there. `R` at the fillet prompt and `D` at the chamfer prompt set the
size without leaving the command, and the current value is shown in angle brackets on the prompt.

An edge is any straight run, so this covers **lines, polylines, rectangles and polygons**. Picking
two sides of one rectangle rounds that corner of the rectangle; picking a rectangle side and a
loose line joins the two.

Fillet also takes **arcs and circles**, on one side of the corner or on both, as AutoCAD does. A
given radius can usually touch two objects in more than one place — up to eight, once each curve
can be hugged from either side — so the fillet nearest your two clicks wins: click the part of each
circle you want it to land on. A circle is left whole rather than trimmed, again following AutoCAD,
so only the other edge is cut back and the fillet bridges the gap; an arc is trimmed to the tangent
point like any other edge. Filleting two circles therefore adds the arc and changes nothing else.

The radius has to be large enough to span the gap: two circles 100 apart cannot be joined by
anything under a radius of 50. Chamfer stays straight-only, which is also how AutoCAD behaves.

The arc drawn is always the shorter way round between the two tangent points, which is the one
wanted in ordinary use; a fillet that has to wrap more than half way around is not yet expressible.

**Where you click on each edge decides which side survives**, so on two lines that cross you
choose which of the four corners gets cut by picking the two arms that form it. The edges do not
have to meet: like AutoCAD, they are extended to the corner they would make if they did, so a
fillet closes an open corner as readily as it rounds a closed one.

A size of zero squares the corner off instead of rounding or bevelling it, trimming and extending
both edges to a sharp point. The command stays armed after each corner so a run of them can be
worked through, and `Esc` leaves.

Chamfering a rectangle keeps it a single object, because a bevel is just another vertex. A fillet
cannot be, since a polyline draws a straight chord between its points and that chord would sit
under the arc, so the outline is opened at the rounded corner and the arc closes the gap. The
shape looks the same and stays fully editable; it is simply an outline plus an arc rather than one
closed loop. Rounding a corner in the middle of an already-open polyline splits it into two runs
for the same reason.

Splines and ellipses are not supported by either command, and picking one says as much rather than
guessing.

Object snap is deliberately **off while these two commands pick edges**. A click here means "this
edge, on this side" rather than a position, and letting it jump to the nearest vertex would destroy
that: on a polygon, whose sides are short, both picks land on the shared corner and name the same
edge, so a perfectly good corner gets refused. Snapping resumes as soon as the command ends.

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

The **Size** box beside the dimension buttons sets how large the text and arrowheads are drawn, as
a multiple of the drawing's dimension style, and the preview under the crosshair follows it as you
place the dimension. Each dimension keeps the size it was drawn at, so a detail view can be
annotated larger than the rest of the drawing. To change one afterwards, select it and edit
**Dimension size** in the properties panel. `DIMSCALE 2` does the same from the command line, and
applies to the selection if there is one.

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
| Annotate | `TEXT`/`DT`, `DIM`/`D`, `DIMLINEAR`/`DLI`, `DIMALIGNED`/`DAL`, `DIMRADIUS`/`DRA`, `DIMDIAMETER`/`DDI`, `DIMANGULAR`/`DAN`, `DIMSCALE`/`DSC` |
| Modify | `MOVE`/`M`, `COPY`/`CO`, `ROTATE`/`RO`, `SCALE`/`SC`, `MIRROR`/`MI`, `ARRAY`/`AR`, `ARRAYRECT`, `ARRAYPOLAR`, `OFFSET`/`O`, `TRIM`/`TR`, `EXTEND`/`EX`, `FILLET`/`F`, `CHAMFER`/`CHA`, `ERASE`/`E`, `JOIN`/`J`, `GROUP`/`G`, `EXPLODE`/`X`, `INSERT`/`I` |
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
