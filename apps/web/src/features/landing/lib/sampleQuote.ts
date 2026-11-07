import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { safeExample, type ExampleResult, type HeroTypology } from '../designer/designerModel'
import { examplePrice } from '../designer/examplePrice'

/** Ambientes de la cotización de ejemplo (el nombre se traduce: `sample.rooms.*`). */
export type SampleRoom = 'living' | 'bedroom' | 'entrance' | 'laundry'

/**
 * Cotización de muestra de la landing. El nombre de cada ventana
 * sale de su tipología (`useSampleText().item`), en el idioma de la página.
 */
export interface SampleItem {
  ref: string
  room: SampleRoom
  typology: HeroTypology
  width: number
  height: number
  /** Solo si el motor no entrega precio. */
  fallbackPrice: number
}

export const SAMPLE_ITEMS: SampleItem[] = [
  { ref: 'V1', room: 'living', typology: 'sliding_2', width: 1800, height: 1200, fallbackPrice: 406600 },
  { ref: 'V2', room: 'bedroom', typology: 'tilt_turn', width: 800, height: 1200, fallbackPrice: 220600 },
  { ref: 'V3', room: 'entrance', typology: 'door', width: 900, height: 2100, fallbackPrice: 494500 },
]

/** La ventana que agrega Marco en la demostración. */
export const MARCO_ITEM: SampleItem = {
  ref: 'V4',
  room: 'laundry',
  typology: 'sliding_2',
  width: 1500,
  height: 1200,
  fallbackPrice: 361500,
}

export interface PricedItem {
  item: SampleItem
  example: ExampleResult | null
  /** Precio unitario neto (motor; si no, el de respaldo). */
  price: number
  colorName: string
  colorHex: string
  glassName: string
}

export function priceSampleItem(item: SampleItem, colorId?: string): PricedItem {
  const example = safeExample({ typology: item.typology, width: item.width, height: item.height, colorId })
  const price = (example && examplePrice(example.design, SAMPLE_CATALOG)) ?? item.fallbackPrice
  return {
    item,
    example,
    price,
    colorName: example?.color?.name ?? 'Blanco',
    colorHex: example?.color?.hex ?? '#F6F5F1',
    glassName: example?.glass?.name ?? 'Termopanel',
  }
}

/** Id del primer color del catálogo de ejemplo cuyo nombre calza (p. ej. /nogal/i). */
export function findSampleColorId(pattern: RegExp): string | undefined {
  return SAMPLE_CATALOG.colors.find((color) => pattern.test(color.name))?.id
}
