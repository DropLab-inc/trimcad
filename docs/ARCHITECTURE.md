# DropLabCad Architecture

## Runtime modules

- `src/core/types.ts`: canonical CAD document/entity model.
- `src/core/document.ts`: mutable document controller with undo/redo snapshots.
- `src/core/geometry.ts`: hit tests, transforms, offsets, dimensions, utility math.
- `src/core/snap.ts`: object snap candidate extraction + best candidate scoring.
- `src/core/selection.ts`: entity bounds, window/crossing hit tests, selection modifiers.
- `src/core/boundary.ts`: planar arrangement of curves used to find hatch regions.
- `src/core/modify.ts`: offset, trim and extend geometry, plus the previews and fence crossings
  those tools need.
- `src/core/dynamicInput.ts`: on-canvas dimension fields and typed coordinate parsing.
- `src/core/commandRegistry.ts`: the one table of command names, aliases and summaries.
- `src/core/prompts.ts`: what each command step asks for and which options it accepts.
- `src/core/commands.ts`: command implementations for draw and modify operations.
- `src/core/dxf.ts`: DXF import/export adapters.
- `src/core/print.ts`: scaled PDF output.
- `src/core/store.ts`: Zustand app state, tool orchestration and the command session.

## UI composition

- `src/ui/Toolbar.tsx`: tool selection, dimension type, polygon sides, hatch pattern.
- `src/ui/CanvasViewport.tsx`: drafting viewport, pan/zoom, pick/snap, draw interactions.
- `src/ui/renderers.tsx`: entity and dimension drawing, spline curves, hatch fills.
- `src/ui/HatchDefs.tsx`: SVG pattern definitions for hatch fills.
- `src/ui/SnapPanel.tsx`: running object snap toggles.
- `src/ui/LayerPanel.tsx`: layer visibility and management.
- `src/ui/PropertiesPanel.tsx`: selected entity property editing.
- `src/ui/CommandLine.tsx`: command entry, autocomplete, scrollback and file I/O actions.
- `src/ui/StatusBar.tsx`: coordinates, drafting toggles and session facts.

## Data flow

1. User starts a command by typing anywhere or clicking the ribbon. Keystrokes over the canvas
   are forwarded into the command input, so the two routes converge immediately.
2. `executeCommand` resolves the text in a fixed order: an option of the running command, then a
   coordinate, then a bare number, then a command name. That order is what lets `C` mean "close"
   during PLINE and "circle" when nothing is running.
3. Viewport click(s) emit world-space points.
4. Snap engine adjusts points based on enabled modes.
5. Command helper creates/modifies entities.
6. Store writes through document controller (history tracked).
7. Autosave persists document snapshots.
8. Renderer re-renders from document state.

## Prompts

`prompts.ts` is deliberately separate from the registry. The registry answers "what commands
exist", the prompt engine answers "what does the running command want next", and both the
command line and the on-canvas status strip render from the same prompt object. Adding an option
to a command therefore only means adding a keyword in one place.
