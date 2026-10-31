import { SAMPLE_CATALOG } from '@framezen/catalog'
import { roundHalfUp } from '@framezen/engine'
import { safeExample, type ExampleResult, type HeroTypology } from '../designer/designerModel'
import { examplePrice } from '../designer/examplePrice'

/** Cotización de muestra de la landing (Familia Rojas, casa en Frutillar). */
export interface SampleItem {
  ref: string
  room: string
  title: string
  typology: HeroTypology
  width: number
  height: number
  /** Solo si el motor no entrega precio. */
  fallbackPrice: number
}

export const SAMPLE_ITEMS: SampleItem[] = [
  { ref: 'V1', room: 'Living', title: 'Corredera 2 hojas', typology: 'sliding_2', width: 1800, height: 1200, fallbackPrice: 406600 },
  { ref: 'V2', room: 'Dormitorio', title: 'Oscilobatiente', typology: 'tilt_turn', width: 800, height: 1200, fallbackPrice: 220600 },
  { ref: 'V3', room: 'Acceso cocina', title: 'Puerta 1 hoja', typology: 'door', width: 900, height: 2100, fallbackPrice: 494500 },
]

/** La ventana que agrega Marco en la demostración. */
export const MARCO_ITEM: SampleItem = {
  ref: 'V4',
  room: 'Logia',
  title: 'Corredera 2 hojas',
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

/** Neto, IVA (19 %, redondeo a $1) y total de la cotización de muestra. */
export function totalsWithIva(net: number): { net: number; iva: number; total: number } {
  const iva = roundHalfUp(net * 0.19)
  return { net, iva, total: net + iva }
}
