import { useCanvasPalette } from './theme'

export function HatchDefs() {
  const { hatch } = useCanvasPalette()

  return (
    <defs>
      <pattern id="hatch-ansi31" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="8" stroke={hatch} strokeWidth="0.7" />
      </pattern>
      <pattern id="hatch-ansi37" patternUnits="userSpaceOnUse" width="8" height="8">
        <line x1="0" y1="0" x2="8" y2="8" stroke={hatch} strokeWidth="0.7" />
        <line x1="8" y1="0" x2="0" y2="8" stroke={hatch} strokeWidth="0.7" />
      </pattern>
      <pattern id="hatch-dots" patternUnits="userSpaceOnUse" width="6" height="6">
        <circle cx="3" cy="3" r="0.8" fill={hatch} />
      </pattern>
    </defs>
  )
}
