import type {
  Bom,
  Catalog,
  CutSettings,
  Id,
  Layout,
  PricingSettings,
  QuoteExtra,
  QuoteTotals,
  WindowDesign,
} from '../types'
import { DEFAULT_CUT, resolvePricing } from './defaults'
import { formatSize } from './format'
import { catalogLookup } from './lookup'
import { fullBarFactors, planCuts } from './plan'
import { priceItem, type ItemPriceDetail } from './pricing'
import { quoteTotals } from './totals'

/** Funciones del núcleo que necesita comercio (inyectables para pruebas o cachés). */
export interface DesignCore {
  computeBom: (design: WindowDesign, catalog: Catalog) => Bom
  computeLayout: (design: WindowDesign, catalog: Catalog) => Layout
  describeDesign: (design: WindowDesign, catalog: Catalog) => string
}

/** Ítem de cotización (compatible con QuoteItem del contrato HTTP). */
export interface QuoteItemInput {
  id: Id
  ref: string
  qty: number
  design: WindowDesign
  manualUnitPrice?: number
  name?: string
  location?: string
}

/** Cotización mínima para calcular (compatible con Quote del contrato HTTP). */
export interface QuoteInput {
  items: readonly QuoteItemInput[]
  extras: readonly QuoteExtra[]
  discountPct: number
  /** Ajustes de esta cotización: se aplican encima de los de la organización. */
  pricing?: Partial<PricingSettings>
}

export interface EvaluatedItem {
  id: Id
  ref: string
  bom: Bom
  price: ItemPriceDetail
}

export interface QuoteEvaluation {
  items: EvaluatedItem[]
  totals: QuoteTotals
  /** Ajustes de precio efectivos (organización + cotización). */
  pricing: PricingSettings
}

export interface EvaluateOptions {
  /** Sierra usada para cobrar barras completas (si `chargeFullBars`). Por defecto DEFAULT_CUT. */
  cut?: Partial<CutSettings>
}

const emptyBom = (): Bom => ({ cuts: [], glass: [], items: [], warnings: [], area: 0, perimeter: 0 })

/** BOM a prueba de fallos: si el núcleo lanza, devuelve un BOM vacío con aviso (nunca bloquea). */
export function safeBom(core: Pick<DesignCore, 'computeBom'>, design: WindowDesign, catalog: Catalog): Bom {
  try {
    const bom = core.computeBom(design, catalog)
    if (!bom) return emptyBom()
    return {
      ...bom,
      cuts: bom.cuts ?? [],
      glass: bom.glass ?? [],
      items: bom.items ?? [],
      warnings: bom.warnings ?? [],
    }
  } catch {
    return {
      ...emptyBom(),
      warnings: [
        {
          level: 'error',
          code: 'bom_failed',
          message: 'No pudimos calcular los materiales de esta ventana. Revisa sus medidas o la línea elegida.',
        },
      ],
    }
  }
}

/** Layout a prueba de fallos: si el núcleo lanza, devuelve solo el contorno. */
export function safeLayout(core: Pick<DesignCore, 'computeLayout'>, design: WindowDesign, catalog: Catalog): Layout {
  try {
    const layout = core.computeLayout(design, catalog)
    if (layout) return layout
  } catch {
    // se dibuja el contorno
  }
  const width = Number.isFinite(design?.width) ? design.width : 0
  const height = Number.isFinite(design?.height) ? design.height : 0
  return {
    width,
    height,
    frame: { rect: { x: 0, y: 0, w: width, h: height }, face: 0 },
    mullions: [],
    sashes: [],
    panes: [],
    sliding: [],
    dimensions: [],
    cells: [],
  }
}

/** Descripción a prueba de fallos (si el núcleo lanza, las medidas). */
export function safeDescribe(core: Pick<DesignCore, 'describeDesign'>, design: WindowDesign, catalog: Catalog): string {
  try {
    const text = core.describeDesign(design, catalog)
    if (typeof text === 'string' && text) return text
  } catch {
    // se usan las medidas
  }
  return Number.isFinite(design?.width) && Number.isFinite(design?.height) ? `Ventana ${formatSize(design.width, design.height)}` : 'Ventana'
}

/** Precio de todos los ítems y totales a partir de BOM ya calculados (uno por ítem, en orden). */
export function evaluateQuoteWithBoms(
  quote: QuoteInput,
  boms: readonly Bom[],
  catalog: Catalog,
  settings: Partial<PricingSettings>,
  opts: EvaluateOptions = {},
): QuoteEvaluation {
  const pricing = resolvePricing(settings, quote?.pricing)
  const items = quote?.items ?? []
  const lookup = catalogLookup(catalog)
  let factors: Record<string, number> | undefined
  if (pricing.chargeFullBars) {
    // Barras completas de toda la obra, repartidas entre las piezas que las usan.
    const entries = items.map((item, i) => ({ ref: item.ref, design: item.design, bom: boms[i] ?? emptyBom(), qty: item.qty }))
    factors = fullBarFactors(planCuts(entries, catalog, opts.cut ?? DEFAULT_CUT, { lookup }).plan)
  }
  const evaluated: EvaluatedItem[] = items.map((item, i) => {
    const bom = boms[i] ?? emptyBom()
    const price = priceItem(bom, item.design, catalog, pricing, {
      qty: item.qty,
      manualUnitPrice: item.manualUnitPrice,
      fullBarFactors: factors,
      cut: opts.cut,
    })
    return { id: item.id, ref: item.ref, bom, price }
  })
  const totals = quoteTotals(
    evaluated.map((e) => ({ price: e.price, bom: e.bom })),
    { discountPct: quote?.discountPct ?? 0, extras: quote?.extras ?? [], ivaPct: pricing.ivaPct },
  )
  return { items: evaluated, totals, pricing }
}

/** Como `evaluateQuote`, con el núcleo inyectado. */
export function evaluateQuoteWith(
  core: Pick<DesignCore, 'computeBom'>,
  quote: QuoteInput,
  catalog: Catalog,
  settings: Partial<PricingSettings>,
  opts: EvaluateOptions = {},
): QuoteEvaluation {
  const boms = (quote?.items ?? []).map((item) => safeBom(core, item.design, catalog))
  return evaluateQuoteWithBoms(quote, boms, catalog, settings, opts)
}
