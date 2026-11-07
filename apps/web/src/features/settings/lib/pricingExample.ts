/**
 * Ventanas de ejemplo calculadas con el motor real (misma fuente de cifras que la cotización).
 * Si el catálogo del taller todavía no tiene precios, usamos el catálogo de ejemplo de DEKOPEN y
 * lo decimos («precios de ejemplo»): nunca inventamos números.
 */
import {
  computeBom,
  computeLayout,
  createDesign,
  designName,
  explainPrice,
  priceItem,
  type Catalog,
  type CutSettings,
  type ItemPriceDetail,
  type Layout,
  type Line,
  type PriceExplanationLine,
  type PricingSettings,
  type TypologyId,
  type WindowDesign,
} from '@dekopen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import type { Defaults } from '@dekopen/shared'

export interface ExampleSpec {
  typology: TypologyId
  width: number
  height: number
  qty?: number
  /** Preferir una línea de corredera o practicable. */
  kind: 'sliding' | 'casement'
}

export interface PricedExample {
  design: WindowDesign
  layout: Layout
  catalog: Catalog
  line?: Line
  /** Tipología pedida (el nombre visible sale del glosario con este id). */
  typology: TypologyId
  /** Nombre del motor (español), respaldo si el glosario no tiene el id. */
  name: string
  price: ItemPriceDetail
  explanation: PriceExplanationLine[]
  /** true si se calculó con el catálogo de ejemplo (el del taller no tiene precios para esto). */
  sample: boolean
}

/**
 * Líneas candidatas del tipo pedido, en orden: la por defecto del taller, las de su misma marca y
 * luego las demás (primero las verificadas y completas).
 */
export function candidateLines(catalog: Catalog, kind: 'sliding' | 'casement', defaults?: Defaults): Line[] {
  const lines = catalog?.lines ?? []
  const preferred = lines.find((l) => l.id === defaults?.lineId)
  const quality = (l: Line) => (l.completeness === 'verified' ? 0 : l.completeness === 'complete' ? 1 : 2)
  const rank = (l: Line) => (l.id === preferred?.id ? 0 : preferred && l.brandId === preferred.brandId ? 1 : 2) * 10 + quality(l)
  return lines.filter((l) => l.kind === kind).sort((a, b) => rank(a) - rank(b))
}

/** La línea que se usaría para el ejemplo (la primera candidata). */
export function pickLine(catalog: Catalog, kind: 'sliding' | 'casement', defaults?: Defaults): Line | undefined {
  const lines = catalog?.lines ?? []
  return candidateLines(catalog, kind, defaults)[0] ?? lines.find((l) => l.id === defaults?.lineId) ?? lines[0]
}

function buildOn(catalog: Catalog, spec: ExampleSpec, defaults: Defaults | undefined, line: Line | undefined) {
  const colorId =
    defaults?.colorId && (!line || line.colorIds?.includes(defaults.colorId))
      ? defaults.colorId
      : (line?.colorIds?.[0] ?? catalog.colors?.[0]?.id ?? 'blanco')
  const glassId = defaults?.glassId && catalog.glass?.some((g) => g.id === defaults.glassId) ? defaults.glassId : (catalog.glass?.[0]?.id ?? 'vidrio')
  return createDesign(spec.typology, { lineId: line?.id ?? 'linea', width: spec.width, height: spec.height, colorId, glassId })
}

/**
 * Precio de una ventana de ejemplo con los ajustes dados. Prueba las líneas del taller hasta dar
 * con una que tenga precio de perfiles; si ninguna lo tiene, usa el catálogo de ejemplo. Nunca lanza.
 */
export function priceExample(
  orgCatalog: Catalog | null | undefined,
  pricing: PricingSettings,
  spec: ExampleSpec,
  options: { defaults?: Defaults; cut?: Partial<CutSettings> } = {},
): PricedExample {
  const attempt = (catalog: Catalog, line: Line | undefined, defaults: Defaults | undefined, sample: boolean): PricedExample | null => {
    try {
      const design = buildOn(catalog, spec, defaults, line)
      const bom = computeBom(design, catalog)
      const price = priceItem(bom, design, catalog, pricing, { qty: spec.qty ?? 1, cut: options.cut })
      if (!(price.materialsTotal > 0) || !(price.materials.profiles > 0)) return null
      return {
        design,
        layout: computeLayout(design, catalog),
        catalog,
        line,
        typology: spec.typology,
        name: designName(design),
        price,
        explanation: explainPrice(price),
        sample,
      }
    } catch {
      return null
    }
  }
  if (orgCatalog?.lines?.length) {
    for (const line of candidateLines(orgCatalog, spec.kind, options.defaults).slice(0, 8)) {
      const own = attempt(orgCatalog, line, options.defaults, false)
      if (own) return own
    }
  }
  for (const line of candidateLines(SAMPLE_CATALOG, spec.kind, SAMPLE_DEFAULTS)) {
    const fallback = attempt(SAMPLE_CATALOG, line, SAMPLE_DEFAULTS, true)
    if (fallback) return fallback
  }
  // Último recurso (no debería pasar): diseño sin precio, para que la pantalla siga en pie.
  const line = pickLine(SAMPLE_CATALOG, spec.kind, SAMPLE_DEFAULTS)
  const design = buildOn(SAMPLE_CATALOG, spec, SAMPLE_DEFAULTS, line)
  const price = priceItem(computeBom(design, SAMPLE_CATALOG), design, SAMPLE_CATALOG, pricing, { qty: spec.qty ?? 1 })
  return {
    design,
    layout: computeLayout(design, SAMPLE_CATALOG),
    catalog: SAMPLE_CATALOG,
    line,
    typology: spec.typology,
    name: designName(design),
    price,
    explanation: explainPrice(price),
    sample: true,
  }
}

/** La ventana que usamos para explicar los precios: corredera 2 hojas de 1.500 × 1.200 mm. */
export const PRICING_EXAMPLE: ExampleSpec = { typology: 'sliding_2', width: 1500, height: 1200, kind: 'sliding' }
