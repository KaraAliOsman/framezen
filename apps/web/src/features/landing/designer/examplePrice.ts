import { computeBom, DEFAULT_PRICING, priceItem, type Catalog, type WindowDesign } from '@dekopen/engine'

/**
 * Precio unitario neto de ejemplo, calculado por el motor (el mismo de la app)
 * con el catálogo de muestra y los ajustes por defecto: margen 40 %, mano de
 * obra $12.000/m², merma 5 %, redondeo a $100. Devuelve null si el motor no puede.
 */
export function examplePrice(design: WindowDesign, catalog: Catalog): number | null {
  try {
    const bom = computeBom(design, catalog)
    const price = priceItem(bom, design, catalog, DEFAULT_PRICING)
    return Number.isFinite(price.unitNet) && price.unitNet > 0 ? price.unitNet : null
  } catch {
    return null
  }
}
