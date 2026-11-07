import type {
  Bom,
  Catalog,
  CutSettings,
  Id,
  Layout,
  PricingSettings,
  QuoteExtra,
  QuoteLineRole,
  QuoteTotals,
  WindowDesign,
} from '../types'
import { warning } from '../warnings'
import { includedLineIds, lineDiscount, type QuoteSelection } from './choices'
import { resolvePricing } from './defaults'
import { formatSize, roundHalfUp } from './format'
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
  /** Sin dato, `base`: la ventana siempre cuenta. Ver `choices.ts`. */
  role?: QuoteLineRole
  altGroup?: string
  included?: boolean
  /** Descuento de esta línea en %, antes del descuento de la cotización. */
  discountPct?: number
}

/** Cotización mínima para calcular (compatible con Quote del contrato HTTP). */
export interface QuoteInput {
  items: readonly QuoteItemInput[]
  extras: readonly QuoteExtra[]
  discountPct: number
  /** Ajustes de esta cotización: se aplican encima de los de la organización. */
  pricing?: Partial<PricingSettings>
  /** Elección sobre opcionales y alternativas (si no, lo guardado en cada línea). */
  selection?: QuoteSelection
}

export interface EvaluatedItem {
  id: Id
  ref: string
  bom: Bom
  price: ItemPriceDetail
  /** Cuenta en el total. Un opcional sin marcar o una alternativa no elegida se cotiza pero no suma. */
  included: boolean
}

export interface QuoteEvaluation {
  items: EvaluatedItem[]
  totals: QuoteTotals
  /** Ajustes de precio efectivos (organización + cotización). */
  pricing: PricingSettings
}

export interface EvaluateOptions {
  /** Sierra del taller: largo de barra si el perfil no lo trae, y barras completas (si `chargeFullBars`). */
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
        warning({
          level: 'error',
          code: 'bom_failed',
          message: 'No pudimos calcular los materiales de esta ventana. Revisa sus medidas o la línea elegida.',
        }),
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
  const extras = quote?.extras ?? []
  const included = includedLineIds([...items, ...extras], quote?.selection)
  let factors: Record<string, number> | undefined
  if (pricing.chargeFullBars) {
    // Barras completas de lo que se va a fabricar, repartidas entre las piezas que las usan.
    const entries = items.flatMap((item, i) => (included.has(item.id) ? [{ ref: item.ref, design: item.design, bom: boms[i] ?? emptyBom(), qty: item.qty }] : []))
    factors = fullBarFactors(planCuts(entries, catalog, opts.cut ?? {}, { lookup }).plan)
  }
  const evaluated: EvaluatedItem[] = items.map((item, i) => {
    const bom = boms[i] ?? emptyBom()
    const listed = priceItem(bom, item.design, catalog, pricing, {
      qty: item.qty,
      manualUnitPrice: item.manualUnitPrice,
      fullBarFactors: factors,
      cut: opts.cut,
    })
    return { id: item.id, ref: item.ref, bom, price: discounted(listed, item.discountPct), included: included.has(item.id) }
  })
  const totals = quoteTotals(
    evaluated.filter((e) => e.included).map((e) => ({ price: e.price, bom: e.bom })),
    { discountPct: quote?.discountPct ?? 0, extras: extras.filter((e) => included.has(e.id)), ivaPct: pricing.ivaPct },
  )
  return { items: evaluated, totals, pricing }
}

/**
 * Descuento de línea: `unitNet` sigue siendo el precio de lista (el documento lo muestra junto al
 * porcentaje) y `totalNet` es lo que suma. El margen se mide sobre lo que se cobra.
 */
function discounted(price: ItemPriceDetail, pct: number | undefined): ItemPriceDetail {
  const amount = lineDiscount(price.totalNet, pct)
  if (amount === 0) return price
  const totalNet = price.totalNet - amount
  const sold = price.qty > 0 ? totalNet / price.qty : 0
  return { ...price, totalNet, lineDiscountPct: pct, lineDiscount: amount, marginPct: sold > 0 ? roundHalfUp(((sold - price.cost) / sold) * 100, 1) : 0 }
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
