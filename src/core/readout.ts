/**
 * How the drawing's numbers are written out, so they stay useful at any zoom.
 *
 * The coordinate readout was fixed at two decimals. That is right at 1:1 and useless once a feature is
 * a millionth of a unit across, where every point reads "0.00" wherever you put the crosshair — the
 * zoom is no use if the app cannot tell you where you are.
 */

/** Decimals a coordinate needs to be readable: about one pixel's worth, and never fewer than two. */
export const decimalsFor = (zoom: number): number => {
  if (!Number.isFinite(zoom) || zoom <= 0) return 2
  // Stops at nine: that is where a double stops carrying meaningful decimal places.
  return Math.min(9, Math.max(2, Math.ceil(Math.log10(zoom)) + 2))
}

/** A coordinate at the current zoom, in the drawing's own units. */
export const formatPoint = (point: { x: number; y: number }, zoom: number): string => {
  const places = decimalsFor(zoom)
  return `${point.x.toFixed(places)}, ${point.y.toFixed(places)}`
}

/**
 * The zoom factor itself. Plain decimals stop being readable at the ends of the range — a million to
 * one is a wall of digits, and a millionth reads "0.00" — so the extremes are given as powers of ten.
 */
export const formatZoom = (zoom: number): string => {
  if (!Number.isFinite(zoom) || zoom <= 0) return '—'
  return zoom < 0.01 || zoom >= 10000 ? `${zoom.toExponential(1)}×` : `${zoom.toFixed(2)}×`
}
