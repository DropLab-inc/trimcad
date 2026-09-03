import type { CadEntity, DrawingDocument, Layer } from './types'

/**
 * AutoCAD's first nine index colours, the ones the layer manager offers by name. Anything else is
 * still allowed; the panel keeps a free-form colour field beside the palette.
 */
export const LAYER_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Red', hex: '#ff0000' },
  { name: 'Yellow', hex: '#ffff00' },
  { name: 'Green', hex: '#00ff00' },
  { name: 'Cyan', hex: '#00ffff' },
  { name: 'Blue', hex: '#4a7dff' },
  { name: 'Magenta', hex: '#ff00ff' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Grey', hex: '#808080' },
  { name: 'Light grey', hex: '#c0c0c0' },
]

/**
 * New layers start on AutoCAD's colour 7, which is drawn white on a dark background and black on a
 * light one. That keeps a drawing readable in either theme without storing anything theme-specific
 * in the file.
 */
export const DEFAULT_LAYER_COLOR = '#ffffff'

/** The standard plotted widths, in millimetres. */
export const LINEWEIGHTS = [0, 0.05, 0.09, 0.13, 0.18, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.4, 2]

export const formatLineweight = (mm: number): string => (mm === 0 ? 'Default' : `${mm.toFixed(2)} mm`)

/** A lineweight of "Default" plots at this width, as it does in AutoCAD. */
export const DEFAULT_LINEWEIGHT_MM = 0.25

/**
 * Screen width for a plotted lineweight. Like AutoCAD, the on-screen thickness is indicative rather
 * than true to scale and does not change with zoom, so 0.25 mm shows as the usual thin line.
 */
export const lineweightPixels = (mm: number | undefined): number => {
  const width = mm && mm > 0 ? mm : DEFAULT_LINEWEIGHT_MM
  return Math.max(1, width / DEFAULT_LINEWEIGHT_MM)
}

/** Everything a layer needs beyond a name, so every place that makes one agrees. */
export const makeLayer = (id: string, name: string, linetypeId: string, color = DEFAULT_LAYER_COLOR): Layer => ({
  id,
  name,
  color,
  linetypeId,
  lineweight: 0.25,
  visible: true,
  frozen: false,
  locked: false,
  plottable: true,
})

/**
 * Fills in fields a drawing from an older version or another program never wrote, so the rest of
 * the app can read a layer without checking whether each flag exists.
 */
export const normalizeLayer = (layer: Partial<Layer>, fallbackLinetypeId: string): Layer => ({
  id: layer.id ?? crypto.randomUUID(),
  name: layer.name ?? '0',
  color: layer.color ?? DEFAULT_LAYER_COLOR,
  linetypeId: layer.linetypeId ?? fallbackLinetypeId,
  lineweight: typeof layer.lineweight === 'number' ? layer.lineweight : 0.25,
  visible: layer.visible !== false,
  frozen: layer.frozen === true,
  locked: layer.locked === true,
  plottable: layer.plottable !== false,
})

/** Drawn on screen: on, and not frozen. */
export const isLayerVisible = (layer: Layer | undefined): boolean =>
  layer === undefined || (layer.visible && !layer.frozen)

/** Available to pick, move or erase: visible, and not locked. */
export const isLayerEditable = (layer: Layer | undefined): boolean => isLayerVisible(layer) && layer?.locked !== true

/** Included on a plot: visible and marked plottable. */
export const isLayerPlottable = (layer: Layer | undefined): boolean =>
  isLayerVisible(layer) && layer?.plottable !== false

export const layerOf = (doc: DrawingDocument, entity: CadEntity): Layer | undefined =>
  doc.layers.find((layer) => layer.id === entity.layerId)

export const visibleEntities = (doc: DrawingDocument): CadEntity[] =>
  doc.entities.filter((entity) => isLayerVisible(layerOf(doc, entity)))

export const editableEntities = (doc: DrawingDocument): CadEntity[] =>
  doc.entities.filter((entity) => isLayerEditable(layerOf(doc, entity)))

export const plottableEntities = (doc: DrawingDocument): CadEntity[] =>
  doc.entities.filter((entity) => isLayerPlottable(layerOf(doc, entity)))

export const countEntitiesOnLayer = (doc: DrawingDocument, layerId: string): number =>
  doc.entities.reduce((total, entity) => (entity.layerId === layerId ? total + 1 : total), 0)

/** A name no other layer is using, for the `+ Layer` button. */
export const nextLayerName = (layers: Layer[]): string => {
  const taken = new Set(layers.map((layer) => layer.name.toLowerCase()))
  for (let index = 1; ; index += 1) {
    const candidate = `Layer${index}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}
