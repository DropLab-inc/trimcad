# TrimCAD

Lightweight browser-based 2D drafting software inspired by AutoCAD workflows.

## Implemented v1 scope

- Draw: line, polyline, rectangle, circle (centre, 2P, 3P, tangent-tangent-radius), arc, ellipse,
  polygon (inscribed, circumscribed, by edge), spline, hatch, text
- Modify: move, copy, rotate, scale, mirror, offset, delete, fillet, chamfer, join, explode,
  overkill, boundary, rectangular/polar array
- Drafting aids: OSNAP, polar tracking, grips for reshaping by hand, command line aliases,
  crosshair viewport, pan/zoom
- Structure: layers, linetypes, lineweights, groups, blocks, document history (undo/redo)
- Data I/O: JSON document model, DXF import/export subset, PDF print at drawing scale
- Reliability: autosave + recovery prompt
- Appearance: TrimCAD branding, with a dark and a light theme

## Project structure

- `src/core`: CAD kernel (types, geometry, commands, document state, snaps, preferences, autosave, dxf, print)
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

### Preferences

The **Preferences** menu beside **File** holds the settings that belong to you rather than to the
drawing, grouped the way AutoCAD's `OPTIONS` dialog groups them. They are kept in the browser and
come back the next time the app is opened; **Restore defaults** puts them all back at once.

| Setting | AutoCAD | Default | What it does |
| --- | --- | --- | --- |
| Window selection | `PICKDRAG` | Click twice or drag | Whether a selection window is dragged out, clicked out, or either |
| Pick box size | `PICKBOX` | 8 px | How near a click has to land to catch an object |
| Grip size | `GRIPSIZE` | 7 px | How wide the handles on a selected object are drawn |
| Use Shift to add to selection | `PICKADD` | On | Off makes every click add to the selection instead of replacing it |
| Snap aperture | `APERTURE` | 12 px | How near the cursor has to be for object snap to take hold |
| Snap marker size | | 7 px | How large the glyph naming the snap is drawn |
| Polar tracking angle | `POLARANG` | 45° | The angle polar tracking holds to, and its multiples |
| Crosshair size | `CURSORSIZE` | 100% | How far the crosshair reaches; 100 spans the whole viewport |
| Show grid | `GRIDDISPLAY` | On | Whether the background grid is drawn |
| Read polylines as their lines | | On | Makes `JOIN` and `OVERKILL` work on polyline segments |
| Keep unsaved work in the browser | `SAVETIME` | On | Off stops the drawing being kept for crash recovery |
| Theme | | Follows the system | Dark or light, the same setting as the toggle in the title bar |

Sizes are in screen pixels, so they hold their apparent size at any zoom. A value outside the
range a setting allows is pulled back into it rather than rejected.

### Layers

The Layers panel on the right is the Layer Properties Manager: on/off, freeze, lock, plot, colour,
rename, and which layer new objects land on. With a selection active you can also move objects
between layers:

| Where | What it does |
| --- | --- |
| Properties ▸ Layer | Dropdown that moves every selected object onto the chosen layer |
| Layer row ▸ move icon | Puts the selection onto that row's layer |
| Layer options ▾ | **Move selection to current layer**, or **Make object's layer current** |
| `LAYMOV` / `MOVETOLAYER` | Moves the selection to the current layer, or `LAYMOV WALLS` to a named one |
| `LAYCUR` / `LAYMCUR` | Makes the first selected object's layer the current one |

Moving onto a locked or off layer still works, but those objects then drop out of the selection,
since they can no longer be edited.

### Drawing circles, arcs, rectangles and polygons

`CIRCLE` opens on a centre and a radius, and the options at that prompt pin the circle down other
ways instead. `D` at the radius prompt reads the size across the circle rather than out from the
middle, so a diameter taken off a drawing can be typed in as it was measured. While the command
runs, the ribbon carries the same five constructions in a dropdown, with a small icon beside it
drawn with the points that construction asks you to pick.

| Option | What it takes |
| --- | --- |
| `2P` | Two points, taken as opposite ends of a diameter |
| `3P` | Three points on the rim, which one circle passes through |
| `T` | Two objects to sit tangent to, then a radius |
| `D` | The size across the circle instead of out from the centre |

Three points in a straight line have no circle through them, and the command says so rather than
drawing something arbitrary. `Ttr` picks lines, polylines, arcs and circles; several circles of the
same radius usually touch a given pair, so **where you click each object chooses between them** —
clicking two lines near their crossing tucks the circle into that corner, and clicking the far
sides puts it on the far side. A radius too small to reach both objects is refused. Each `CIRCLE`
starts back at centre-and-radius, as AutoCAD's does.

`Ttr` is the one construction that clicks objects rather than places points, so nothing would
otherwise appear on the drawing to show how far it has got. The object under the crosshair is
outlined in amber to show what the next click would take, and each object already chosen turns
green with a marker where it was clicked, which stays put while you type the radius.

`ARC` opens on a centre, start and end, with the same style of ribbon dropdown for the other
constructions. `3P` takes three points on the curve; `S` starts from the arc's start point then the
centre then the end; `A` is start, centre and an included angle (typed, or finished by picking the
end ray). Each `ARC` starts back at centre-start-end.

`RECTANG` opens on two opposite corners. `C` takes the centre then a corner; `D` takes a corner
then a typed length and width. After the first corner, `R` sets a rotation angle so the other
corner or the dimensions are read in that turned frame. Each `RECTANG` starts back at two corners.

`POLYGON` sizes its shape by a circle, and `I` and `C` decide which part of the polygon sits on
that circle. **Inscribed** puts the corners on it, which is the default; **circumscribed** puts the
middle of each side on it instead, so the corners stand further out. The distinction matters
whenever the polygon has to fit something real: a bolt head measured across its flats is
circumscribed, while one measured corner to corner is inscribed. Unlike the circle options, this
choice is remembered for the next polygon.

`E` takes the Edge route instead, where you draw one side and the rest of the shape follows from
it, built to the left of the direction you drew. Edge is a one-off, so the next polygon goes back
to being sized by its circle. All three sit in a ribbon dropdown as well, with an icon beside it
drawn on a triangle rather than the hexagon the command defaults to: on a hexagon the corners and
the flats are barely a pixel apart at icon size, which is the whole distinction the picture has to
make.

### Selecting objects

With the Select tool, click an object to pick it, or draw a box across the drawing. The box can be
drawn either way round, and which way decides what it catches:

| Direction | Box | Selects |
| --- | --- | --- |
| Left to right | Solid blue | Only objects **completely inside** the box (window) |
| Right to left | Dashed green | Objects **inside or touching** the box (crossing) |

There are two ways to draw the box out, and by default both work, as in AutoCAD with `PICKDRAG`
set to 2:

- **Press and drag** the far corner out, then let go.
- **Click one corner, then the other.** A click on bare paper puts the first corner down, the box
  then follows the cursor with no button held, and a second click closes it. `Esc` calls it off.

Because a click on bare paper opens a window rather than clearing the selection, `Esc` is what
clears the selection. Preferences ▸ Selection ▸ Window selection switches to press-and-drag only,
or to click-then-click only, if one gesture is preferred.

Hold `Shift` while picking to add to the selection and `Ctrl` to remove from it. Picking any
member of a group selects the whole group.

### Grips

Anything selected shows small squares on the points that define it, as AutoCAD does. Press one
and drag to reshape the object, with a dashed preview of the result following the cursor and the
grip under the cursor filling in to show what a press would take hold of. Releasing commits the
change as a single undo step; `Esc` during the drag abandons it.

| Object | Grips | What dragging one does |
| --- | --- | --- |
| Line | Both ends and the middle | An end stretches that end; the middle carries the whole line |
| Polyline, rectangle, polygon | Every vertex | Moves that vertex, so a rectangle can be pulled out of square |
| Circle | Centre and four quadrants | The centre moves it; a quadrant sets the radius |
| Arc | Centre, both ends, and the point halfway along | An end swings round the centre; the halfway point sets the radius |
| Ellipse | Centre and the ends of both axes | Each axis grip sets its own axis, ignoring sideways drift so the ellipse keeps its rotation |
| Spline | Every control point | Bends the curve |
| Dimension | The measured points and where the dimension line sits | Re-measures, or slides the dimension line |
| Hatch | Every boundary point | Reshapes the filled area |

Pressing on a selected object away from any grip drags the whole selection instead, and pressing
on empty space still opens a selection window, so the three gestures do not collide. Grip drags
snap to other objects but never to the object being dragged, which would otherwise fold a corner
onto its own neighbour. Dragging a whole object tracks ortho and polar but does not object-snap,
since there is no base point for a snap to measure from. A press that goes nowhere is treated as
a plain click and picks in the usual way. Objects on a locked layer show no grips.

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
| Join | Select the pieces, and they become one object |
| Explode | Select compound objects, and they come apart into their pieces |
| Overkill | Select a region, and duplicate and overlapping geometry is cleaned out of it |
| Boundary | Click inside an enclosed area to trace its outline as a polyline |

Offset produces a true parallel outline, so offsetting a rectangle inwards gives a smaller
rectangle rather than a diagonally shifted one. "Keep source" in the ribbon controls whether
Mirror leaves the originals in place.

### Putting objects together and taking them apart

`JOIN`, `EXPLODE` and `OVERKILL` act on whatever is already selected and finish immediately, so
there is nothing to pick on the canvas afterwards.

**`JOIN` (`J`)** makes one object out of several, following AutoCAD's rules about what may go with
what:

| What you select | What you get |
| --- | --- |
| Lines along one straight | A single line spanning the lot, gaps between them closed up |
| Arcs on one circle | A single arc, swept anticlockwise from the first one picked |
| Arcs that come the whole way round | A circle |
| Lines and open polylines that meet end to end | A polyline, closed if the chain returns to its start |

The pieces do not have to be picked in order, and any of them may have been drawn backwards; the
chain is threaded together from both ends until nothing else will attach. What comes out keeps the
layer and colour of the first object picked, and takes its place in the drawing order.

An arc will not be folded into a polyline. A polyline here stores only straight runs, so the arc
would quietly flatten to a chord, and `JOIN` says so rather than changing the drawing behind your
back.

**`EXPLODE` (`X`)** breaks compound objects into their pieces: a polyline, rectangle or polygon
into one line per segment, and a block insert into a copy of the block's contents, sized, turned
and moved to sit exactly where the insert was. It goes one level down, as AutoCAD's does, so a
polyline inside a block comes out whole. The pieces inherit the layer, colour, linetype and
lineweight of what they came from, and take its place in the drawing order. A line, circle, arc,
ellipse, spline or piece of text has nothing inside it, and `EXPLODE` says so instead of doing
nothing quietly. Anything in the selection that belongs to a group is ungrouped at the same time,
which is what this app's `EXPLODE` has always done; `UNGROUP` does only that part.

**`OVERKILL` (`OV`)** cleans up the drawing debris that builds up in a file that has been copied,
imported and edited a few too many times. It deletes objects that are copies of something already
there, counting a line drawn back over itself as the same line, and absorbs straight pieces that
overlap or meet end to end along the same line into a single one. Two collinear lines with a real
gap between them are left alone, and lines on different layers are never merged into each other,
since that would silently move geometry from one layer to the other. It reports what it removed,
or says there was nothing to do. Like AutoCAD's, it works on a selection rather than the whole
drawing — type `ALL` first to take everything in.

**Polylines read as the lines they are drawn from.** A rectangle or polygon is stored as a
polyline, and for `JOIN` and `OVERKILL` it is usually the individual edges that matter, so both
commands look at each segment rather than at the shape as a whole. This is AutoCAD's "optimize
segments within polylines" option, and it is on by default; Preferences ▸ Modify turns it off.

For `OVERKILL` this means a loose line lying along a rectangle's edge is seen for the duplicate it
is and deleted. The rectangle itself is only broken into loose lines if one of its edges really
did change — a shape that comes through the clean untouched is put back exactly as it was, which
is AutoCAD's "do not break polylines" rule. Where a loose line and a polyline edge are the same
line, the polyline's edge is the one kept. What is reported is counted in objects, so two
identical rectangles are one duplicate rather than four.

For `JOIN` it means a closed shape can take part in a join: select a rectangle and a line running
off one of its corners and the two become a single polyline. Read whole, a closed shape has no
free ends to join to, and `JOIN` says so.

### Tracing an area

**`BOUNDARY` (`BO`)** asks for a point inside an enclosed area and traces its outline as a closed
polyline, leaving the objects that enclose it exactly as they were. It reads the drawing the same
way `HATCH` does, so an area bounded by several crossing objects works as well as a single closed
shape, and picking inside the smaller of two nested areas traces the smaller one. The command
stays running, so several areas can be traced one after another.

What comes out is an ordinary polyline, so it can then be offset, dimensioned, filled or measured
like anything else you drew by hand — which is the usual reason for wanting it.

### Arrays

`ARRAY` repeats the selection, either in a grid or around a centre. `R` and `PO` switch between
the two, and `ARRAYRECT` and `ARRAYPOLAR` start the command with the choice already made. The
whole array previews under the crosshair before you commit to it, and arrives as a single undo
step so a misjudged count costs one keystroke to take back.

A **rectangular** array is defined by four numbers: rows, columns, row spacing and column spacing.
All four sit in the ribbon, or come from `R`, `COL`, `RS` and `CS` at the prompt, and the grid is
drawn as a preview against the selection as soon as the command starts, so the numbers can be
judged against the drawing rather than guessed at. Press Enter to build it. A negative spacing
builds the grid down or to the left instead.

When the gap is better taken off the drawing than typed, pick a base point and then pick where the
neighbouring item goes, the way Move takes a displacement. The horizontal part of that displacement
spaces the columns and the vertical part spaces the rows, so both axes are set in one gesture and
either can be snapped to existing geometry. The picked spacing is written back into the ribbon, so
the same grid can be repeated without measuring it again.

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

Choose a pattern in the ribbon, then click inside any enclosed area. While `HATCH` is running, the
ribbon also offers **Scale** (pattern spacing) and **Angle** (extra rotation in degrees), and the
command prompt offers the same as `P` / `S` / `A`. Selected hatches show those properties in the
properties panel so they can be changed afterwards. Hatches keep a light outline so a click on the
fill or near an edge selects them, and a crossing window that sits inside a hatch without cutting
an edge still catches it.

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
| Modify | `MOVE`/`M`, `COPY`/`CO`, `ROTATE`/`RO`, `SCALE`/`SC`, `MIRROR`/`MI`, `ARRAY`/`AR`, `ARRAYRECT`, `ARRAYPOLAR`, `OFFSET`/`O`, `TRIM`/`TR`, `EXTEND`/`EX`, `FILLET`/`F`, `CHAMFER`/`CHA`, `ERASE`/`E`, `JOIN`/`J`, `GROUP`/`G`, `EXPLODE`/`X`, `OVERKILL`/`OV`, `BOUNDARY`/`BO`, `UNGROUP`/`UNG`, `LAYMOV`/`MOVETOLAYER`, `LAYCUR`/`LAYMCUR` |
| Edit | `SELECT`/`SE`, `ALL`, `UNDO`/`U`, `REDO`/`RE` |
| View | `ZOOM`/`Z`, `OSNAP`/`OS`, `ORTHO`/`OR`, `POLAR`/`PO`, `HELP` |
| File | `DXFIN`, `DXFOUT`, `PLOT`/`PRINT` (opens the Plot dialog), `PLOT1` (Plot preset to 1:1) |

## Self-tests

```bash
npm run test
```

Coverage output:

- terminal summary (text)
- HTML report in `coverage/index.html`

## Themes and branding

**TrimCAD** ([trimcad.com](https://trimcad.com)) uses a dark teal ink (`#0c161d`) with a cyan accent
(`#35c8d2`), set in Space Grotesk and IBM Plex Sans.

There is a dark and a light theme, switched with the sun/moon button at the right of the title bar.
The first visit follows the operating system's own light/dark setting; after that your choice is
remembered. `index.html` settles the theme before the first paint, so a light-mode visitor never
sees a dark flash.

Two things make this work rather than just recolour:

- **Interface colours** all come from the CSS custom properties at the top of `src/index.css`. The
  light theme is the same file with one block of values swapped, keyed off `[data-theme='light']`.
- **Canvas colours** live in `src/ui/theme.ts` instead, because the drawing area is painted by hand
  in SVG rather than by the stylesheet. `useCanvasPalette()` gives any component the right set.

New layers are created on AutoCAD's colour 7, which is drawn white on the dark theme and black on
the light one, so a drawing stays readable either way round without storing anything
theme-specific in the file. Only plain white and plain black flip like this; every other layer
colour is drawn exactly as specified. Printing applies the same idea, plotting anything too light
to show on paper as black.

### The logo

`public/trimcad-logo.png` is the master asset — a square mark with the wordmark, used for the
social preview where a large image is the point. It is 1024px and a JPEG, so it is the wrong thing
to send to a phone drawing a 76px logo; `public/trimcad-logo-180.png` is the small PNG the app and
the home-screen icon actually use, and `scripts/make-logo-derivatives.py` regenerates it after any
change to the master.

## Build

```bash
npm run build
```

## Plotting

**Plot…** (Ctrl+P, or `PLOT` / `PRINT` at the command line) opens a dialog rather than downloading
straight away. The options match what other 2D drafting software puts on its plot sheet:

| Option | Choices |
| --- | --- |
| Paper size | ISO A4–A1, Letter, Legal, Tabloid |
| Orientation | Landscape or portrait |
| Margins | Millimetres of white border around the printable area |
| What to plot | Extents (everything), Display (what is on screen), Window (two corners you pick), or Selection |
| Scale | Fit to paper, 1:1 through 1:100, or a custom number of drawing units per millimetre of paper |
| Center on paper | Places the chosen area in the middle of the printable region instead of the lower-left corner |

Choosing **Window** and clicking **Select window…** puts the dialog aside so you can drag or
click-click a rectangle on the drawing; Escape brings the dialog back without plotting. The
preview on the right of the dialog shows how the sheet will look. `PLOT1` opens the same dialog
already set to 1:1. The result is a vector PDF download; light colours that would vanish on white
paper are plotted black, as before.

## Saving

DXF is the drawing's own save format. Layers, colours and geometry are written as real DXF, so the
file opens anywhere.

DXF has no room for some of what the app holds: hatches, dimensions and groups have no equivalent,
and a layer's lineweight and its frozen and locked flags have nowhere to go. So the whole document
is written a second time into a comment, which other programs skip over and this one reads back to
restore the drawing exactly as it was.

The comment is only trusted if the DXF geometry still matches it, so a file edited elsewhere is
read from its DXF rather than from a stale copy. That check compares two fingerprints taken through
the same pipeline — both from DXF as parsed — because not every shape has an exact DXF form. A
spline is written as control points and read back as the curve they describe, and DXF insists an
ellipse leads with its longer radius. Fingerprinting the in-memory document instead would never
match on reload, and the embedded copy would be discarded every time a drawing contained one of
those.

## Documentation, requests and sponsorship

The **Help** menu in the titlebar opens three pages inside the app. They are reached by hash
(`#/docs/guide`, `#/requests`, `#/support`) so a link can be sent to anyone, and Escape goes back
to the drawing with the drawing untouched.

- **Documentation** renders this README, `docs/ARCHITECTURE.md` and `docs/TESTING.md` from the
  repository's own markdown, bundled at build time. There is one manual, and it is the one in git.
- **Feature requests** reads the open issues labelled `feature request` from the GitHub API, with
  search, sorting by most-wanted, newest or most discussed, and a short-lived local cache so a
  visitor is never rate-limited by their own reloads. The form inside the app collects a title, a
  category and the point of the request, then opens a prefilled issue on GitHub — nothing is filed
  until a signed-in person presses *Submit new issue* there, and the app holds no token that could
  do it for them. Before the first labelled issue exists the page falls back to showing every open
  issue and says so.
- **Support TrimCAD** explains what sponsorship pays for and links to GitHub Sponsors. The button
  appears only when a build supplies a published profile, which `.env` does:

```
VITE_SPONSOR_URL=https://github.com/sponsors/DropLab-inc
```

Left unset, that page says sponsorship is not switched on rather than offering a dead link. Point it
at a different profile and the whole page follows, including `github:` in `.github/FUNDING.yml`, which
is what gives the repository GitHub's own Sponsor button.

## Notes

- DXF support is intentionally a subset for lightweight interoperability.
- Hatch, spline, and some modify operations are pragmatic implementations aimed at speed and usability in v1.
