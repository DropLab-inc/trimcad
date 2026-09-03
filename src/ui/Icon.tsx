import type { ReactElement } from 'react'

/**
 * Line-art glyphs in AutoCAD's house style: the geometry the command acts on is drawn in the
 * button's own colour, and the part the command changes is picked out in amber by the `accent`
 * class. Everything is drawn on a 24x24 grid with a single stroke weight.
 */
export type IconName =
  | 'select'
  | 'line'
  | 'polyline'
  | 'rect'
  | 'circle'
  | 'arc'
  | 'ellipse'
  | 'polygon'
  | 'spline'
  | 'move'
  | 'copy'
  | 'rotate'
  | 'scale'
  | 'offset'
  | 'trim'
  | 'extend'
  | 'fillet'
  | 'chamfer'
  | 'mirror'
  | 'dim-linear'
  | 'dim-aligned'
  | 'dim-radius'
  | 'dim-diameter'
  | 'dim-angular'
  | 'text'
  | 'hatch'
  | 'insert'
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'import'
  | 'export'
  | 'print'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'clipboard-copy'
  | 'paste'
  | 'erase'
  | 'bulb-on'
  | 'bulb-off'
  | 'thaw'
  | 'freeze'
  | 'unlocked'
  | 'locked'
  | 'plot-on'
  | 'plot-off'
  | 'layer-add'
  | 'layer-delete'

/** A small filled square, the way AutoCAD marks pick points and grips. */
const grip = (x: number, y: number, key?: string) => (
  <rect key={key} className="accent" x={x - 1.6} y={y - 1.6} width={3.2} height={3.2} rx={0.4} fill="currentColor" />
)

const GLYPHS: Record<IconName, ReactElement> = {
  select: (
    <g>
      <path d="M5 3 L5 17 L9 13.4 L11.6 19.4 L14.2 18.2 L11.7 12.6 L17 12.4 Z" />
    </g>
  ),
  line: (
    <g>
      <path d="M5 18 L19 6" />
      {grip(5, 18)}
      {grip(19, 6)}
    </g>
  ),
  polyline: (
    <g>
      <path d="M4 18 L9 9 L15 14 L20 5" />
      {grip(4, 18)}
      {grip(9, 9)}
      {grip(15, 14)}
      {grip(20, 5)}
    </g>
  ),
  rect: (
    <g>
      <rect x={4} y={6} width={16} height={12} />
      {grip(4, 6)}
      {grip(20, 18)}
    </g>
  ),
  circle: (
    <g>
      <circle cx={12} cy={12} r={8} />
      <path className="accent" d="M12 9.5 L12 14.5 M9.5 12 L14.5 12" />
    </g>
  ),
  arc: (
    <g>
      <path d="M4 18 A 9 9 0 0 1 20 18" />
      {grip(4, 18)}
      {grip(20, 18)}
    </g>
  ),
  ellipse: (
    <g>
      <ellipse cx={12} cy={12} rx={9} ry={6} />
      <path className="accent" d="M3 12 L21 12" strokeDasharray="2 2" />
    </g>
  ),
  polygon: (
    <g>
      <path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" />
    </g>
  ),
  spline: (
    <g>
      <path d="M3 17 C 7 5, 12 21, 16 9 S 20 5, 21 6" />
      {grip(3, 17)}
      {grip(21, 6)}
    </g>
  ),
  move: (
    <g>
      <rect x={3} y={12} width={8} height={7} strokeDasharray="2 2" />
      <rect className="accent" x={13} y={5} width={8} height={7} fill="none" />
      <path className="accent" d="M9 13 L15 7 M15 11 L15 7 L11 7" />
    </g>
  ),
  copy: (
    <g>
      <rect x={3} y={9} width={11} height={11} />
      <rect className="accent" x={9} y={4} width={11} height={11} fill="none" />
    </g>
  ),
  rotate: (
    <g>
      <path className="accent" d="M20 12 A 8 8 0 1 1 14.5 4.4" />
      <path className="accent" d="M14.8 8.6 L14.5 4.2 L10.2 5" />
      <rect x={9} y={9} width={6} height={6} />
    </g>
  ),
  scale: (
    <g>
      <rect x={4} y={13} width={7} height={7} />
      <rect className="accent" x={4} y={4} width={16} height={16} strokeDasharray="2 2" fill="none" />
      <path className="accent" d="M12 12 L19 5 M19 9 L19 5 L15 5" />
    </g>
  ),
  offset: (
    <g>
      <path d="M6 20 L6 9 A 4 4 0 0 1 10 5 L18 5" />
      <path className="accent" d="M11 20 L11 11 A 1.6 1.6 0 0 1 12.6 9.4 L18 9.4" strokeDasharray="3 2" />
    </g>
  ),
  trim: (
    <g>
      <path d="M12 3 L12 21" className="accent" />
      <path d="M3 12 L9 12" />
      <path d="M15 12 L21 12" strokeDasharray="2 2" opacity={0.5} />
      <path className="accent" d="M16 9 L20 13 M20 9 L16 13" />
    </g>
  ),
  extend: (
    <g>
      <path d="M20 3 L20 21" className="accent" />
      <path d="M3 12 L11 12" />
      <path className="accent" d="M11 12 L18 12 M15 9 L18 12 L15 15" strokeDasharray="2 2" />
    </g>
  ),
  // The corner that is cut away is dashed; the rounded or bevelled replacement is picked out.
  fillet: (
    <g>
      <path d="M20 20 L20 11" />
      <path d="M4 4 L13 4" />
      <path className="accent" d="M13 4 A 7 7 0 0 1 20 11" />
      <path d="M13 4 L20 4 L20 11" strokeDasharray="2 2" opacity={0.5} />
    </g>
  ),
  chamfer: (
    <g>
      <path d="M20 20 L20 11" />
      <path d="M4 4 L13 4" />
      <path className="accent" d="M13 4 L20 11" />
      <path d="M13 4 L20 4 L20 11" strokeDasharray="2 2" opacity={0.5} />
    </g>
  ),
  mirror: (
    <g>
      <path d="M4 6 L9 12 L4 18 Z" />
      <path className="accent" d="M20 6 L15 12 L20 18 Z" fill="none" />
      <path className="accent" d="M12 2 L12 22" strokeDasharray="3 2" />
    </g>
  ),
  'dim-linear': (
    <g>
      <path d="M5 4 L5 14 M19 4 L19 14" />
      <path className="accent" d="M5 18 L19 18 M8 15.5 L5 18 L8 20.5 M16 15.5 L19 18 L16 20.5" />
    </g>
  ),
  'dim-aligned': (
    <g>
      <path d="M4 8 L9 3 M16 20 L21 15" />
      <path className="accent" d="M5.5 15.5 L15.5 5.5 M5.5 11.5 L5.5 15.5 L9.5 15.5 M11.5 5.5 L15.5 5.5 L15.5 9.5" />
    </g>
  ),
  'dim-radius': (
    <g>
      <circle cx={11} cy={13} r={7} />
      <path className="accent" d="M11 13 L20 5 M20 9 L20 5 L16 5" />
    </g>
  ),
  'dim-diameter': (
    <g>
      <circle cx={12} cy={12} r={8} />
      <path className="accent" d="M6.3 17.7 L17.7 6.3 M6.3 13.7 L6.3 17.7 L10.3 17.7 M13.7 6.3 L17.7 6.3 L17.7 10.3" />
    </g>
  ),
  'dim-angular': (
    <g>
      <path d="M4 20 L20 20 M4 20 L17 6" />
      <path className="accent" d="M15 20 A 11 11 0 0 0 12.2 12.8" />
    </g>
  ),
  text: (
    <g>
      <path d="M4 6 L4 4 L20 4 L20 6" />
      <path d="M12 4 L12 20 M8.5 20 L15.5 20" />
    </g>
  ),
  hatch: (
    <g>
      <rect x={3} y={5} width={18} height={14} />
      <path className="accent" d="M6 19 L14 5 M10 19 L18 5 M14 19 L21 6 M3 16 L9 5" />
    </g>
  ),
  insert: (
    <g>
      <rect x={4} y={8} width={12} height={12} strokeDasharray="2 2" />
      <path className="accent" d="M14 10 L21 3 M21 7 L21 3 L17 3" />
      {grip(4, 20)}
    </g>
  ),
  erase: (
    <g>
      <path d="M8 19 L20 19" />
      <path className="accent" d="M4.5 15.5 L12.5 7.5 L17.5 12.5 L14.5 15.5 Z" fill="none" />
      <path d="M9 19 L4.5 15.5" />
    </g>
  ),
  new: (
    <g>
      <path d="M6 3 L14 3 L19 8 L19 21 L6 21 Z" />
      <path d="M14 3 L14 8 L19 8" />
      <path className="accent" d="M12.5 12 L12.5 18 M9.5 15 L15.5 15" />
    </g>
  ),
  open: (
    <g>
      <path d="M3 19 L3 5 L9.5 5 L11.5 8 L19 8 L19 11" />
      <path className="accent" d="M3 19 L6.5 11 L22 11 L18.5 19 Z" fill="none" />
    </g>
  ),
  save: (
    <g>
      <path d="M4 4 L16.5 4 L20 7.5 L20 20 L4 20 Z" />
      <path className="accent" d="M8 4 L8 10 L16 10 L16 4" />
      <rect x={7} y={14} width={10} height={6} />
    </g>
  ),
  'save-as': (
    <g>
      <path d="M4 4 L14 4 L18 8 L18 15" />
      <path d="M4 4 L4 20 L12 20" />
      <path className="accent" d="M14 21 L14 17.5 L20 11.5 L22.5 14 L16.5 20 Z" fill="none" />
    </g>
  ),
  import: (
    <g>
      <path d="M14 3 L20 3 L20 21 L14 21" />
      <path className="accent" d="M3 12 L13 12 M9.5 8.5 L13 12 L9.5 15.5" />
    </g>
  ),
  export: (
    <g>
      <path d="M10 3 L4 3 L4 21 L10 21" />
      <path className="accent" d="M11 12 L21 12 M17.5 8.5 L21 12 L17.5 15.5" />
    </g>
  ),
  print: (
    <g>
      <path d="M7 8 L7 3 L17 3 L17 8" />
      <path d="M7 17 L4 17 A 1 1 0 0 1 3 16 L3 10 A 1 1 0 0 1 4 9 L20 9 A 1 1 0 0 1 21 10 L21 16 A 1 1 0 0 1 20 17 L17 17" />
      <rect className="accent" x={7} y={13} width={10} height={8} fill="none" />
    </g>
  ),
  undo: (
    <g>
      <path className="accent" d="M4 9 L9 9 L9 4" />
      <path d="M4.5 9.5 A 8 8 0 1 1 6 16.5" />
    </g>
  ),
  redo: (
    <g>
      <path className="accent" d="M20 9 L15 9 L15 4" />
      <path d="M19.5 9.5 A 8 8 0 1 0 18 16.5" />
    </g>
  ),
  cut: (
    <g>
      <path d="M7 4 L16 17 M17 4 L8 17" />
      <circle className="accent" cx={6.5} cy={19} r={2.4} fill="none" />
      <circle className="accent" cx={17.5} cy={19} r={2.4} fill="none" />
    </g>
  ),
  'clipboard-copy': (
    <g>
      <path d="M4 6 L4 20 L14 20" />
      <rect className="accent" x={8} y={4} width={12} height={14} rx={1} fill="none" />
    </g>
  ),
  paste: (
    <g>
      <path d="M8 4 L5 4 L5 21 L19 21 L19 4 L16 4" />
      <rect className="accent" x={9} y={2.5} width={6} height={3.5} rx={0.8} fill="none" />
      <path className="accent" d="M8.5 11 L15.5 11 M8.5 15 L15.5 15" />
    </g>
  ),
  'bulb-on': (
    <g>
      <path className="accent" d="M12 3 A 6 6 0 0 1 15.5 13.8 L15.5 16.5 L8.5 16.5 L8.5 13.8 A 6 6 0 0 1 12 3 Z" />
      <path d="M9.5 19 L14.5 19 M10.5 21.5 L13.5 21.5" />
    </g>
  ),
  'bulb-off': (
    <g>
      <path d="M12 3 A 6 6 0 0 1 15.5 13.8 L15.5 16.5 L8.5 16.5 L8.5 13.8 A 6 6 0 0 1 12 3 Z" opacity={0.55} />
      <path d="M9.5 19 L14.5 19 M10.5 21.5 L13.5 21.5" opacity={0.55} />
    </g>
  ),
  thaw: (
    <g>
      <circle className="accent" cx={12} cy={12} r={4.2} />
      <path className="accent" d="M12 2.5 L12 5 M12 19 L12 21.5 M2.5 12 L5 12 M19 12 L21.5 12" />
      <path className="accent" d="M5.4 5.4 L7 7 M17 17 L18.6 18.6 M18.6 5.4 L17 7 M7 17 L5.4 18.6" />
    </g>
  ),
  freeze: (
    <g>
      <path d="M12 2.5 L12 21.5 M3.8 7.2 L20.2 16.8 M20.2 7.2 L3.8 16.8" />
      <path d="M9.5 5 L12 7.5 L14.5 5 M9.5 19 L12 16.5 L14.5 19" />
    </g>
  ),
  unlocked: (
    <g>
      <rect x={5} y={11} width={14} height={9} rx={1.2} />
      <path d="M8.5 11 L8.5 7.5 A 3.5 3.5 0 0 1 15.5 7.5" />
    </g>
  ),
  locked: (
    <g>
      <rect className="accent" x={5} y={11} width={14} height={9} rx={1.2} />
      <path className="accent" d="M8.5 11 L8.5 7.5 A 3.5 3.5 0 0 1 15.5 7.5 L15.5 11" />
    </g>
  ),
  'plot-on': (
    <g>
      <path d="M7 8 L7 3.5 L17 3.5 L17 8" />
      <path d="M7 16.5 L4 16.5 A 1 1 0 0 1 3 15.5 L3 10 A 1 1 0 0 1 4 9 L20 9 A 1 1 0 0 1 21 10 L21 15.5 A 1 1 0 0 1 20 16.5 L17 16.5" />
      <rect className="accent" x={7} y={13} width={10} height={7.5} fill="none" />
    </g>
  ),
  'plot-off': (
    <g opacity={0.55}>
      <path d="M7 8 L7 3.5 L17 3.5 L17 8" />
      <path d="M7 16.5 L4 16.5 A 1 1 0 0 1 3 15.5 L3 10 A 1 1 0 0 1 4 9 L20 9 A 1 1 0 0 1 21 10 L21 15.5 A 1 1 0 0 1 20 16.5 L17 16.5" />
      <path d="M4 20.5 L20 3.5" />
    </g>
  ),
  'layer-add': (
    <g>
      <path d="M12 3 L21 8 L12 13 L3 8 Z" />
      <path d="M3 13 L12 18 L15 16.3" />
      <path className="accent" d="M18.5 15 L18.5 21 M15.5 18 L21.5 18" />
    </g>
  ),
  'layer-delete': (
    <g>
      <path d="M12 3 L21 8 L12 13 L3 8 Z" />
      <path d="M3 13 L12 18 L15 16.3" />
      <path className="accent" d="M16.4 15.9 L20.6 20.1 M20.6 15.9 L16.4 20.1" />
    </g>
  ),
}

export function Icon({ name }: { name: IconName }): ReactElement {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  )
}
