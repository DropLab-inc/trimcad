# DropLabCad Architecture

## Runtime modules

- `src/core/types.ts`: canonical CAD document/entity model.
- `src/core/document.ts`: mutable document controller with undo/redo snapshots.
- `src/core/geometry.ts`: hit tests, transforms, offsets, dimensions, utility math.
- `src/core/snap.ts`: object snap candidate extraction + best candidate scoring.
- `src/core/selection.ts`: entity bounds, window/crossing hit tests, selection modifiers.
- `src/core/boundary.ts`: planar arrangement of curves used to find hatch regions.
- `src/core/modify.ts`: offset, trim and extend geometry.
- `src/core/dynamicInput.ts`: on-canvas dimension fields and typed coordinate parsing.
- `src/core/commands.ts`: command implementations for draw and modify operations.
- `src/core/dxf.ts`: DXF import/export adapters.
- `src/core/print.ts`: scaled PDF output.
- `src/core/store.ts`: Zustand app state and tool orchestration.

## UI composition

- `src/ui/Toolbar.tsx`: tool selection, dimension type, polygon sides, hatch pattern.
- `src/ui/CanvasViewport.tsx`: drafting viewport, pan/zoom, pick/snap, draw interactions.
- `src/ui/renderers.tsx`: entity and dimension drawing, spline curves, hatch fills.
- `src/ui/HatchDefs.tsx`: SVG pattern definitions for hatch fills.
- `src/ui/SnapPanel.tsx`: running object snap toggles.
- `src/ui/LayerPanel.tsx`: layer visibility and management.
- `src/ui/PropertiesPanel.tsx`: selected entity property editing.
- `src/ui/CommandLine.tsx`: typed command execution and file I/O actions.
- `src/ui/StatusBar.tsx`: drawing/session status.

## Data flow

1. User chooses a tool from toolbar or command line.
2. Viewport click(s) emit world-space points.
3. Snap engine adjusts points based on enabled modes.
4. Command helper creates/modifies entities.
5. Store writes through document controller (history tracked).
6. Autosave persists document snapshots.
7. Renderer re-renders from document state.
