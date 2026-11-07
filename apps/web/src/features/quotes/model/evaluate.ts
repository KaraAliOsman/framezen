/**
 * Cálculo en vivo con el motor (mismo que usa el servidor). Los diseños son inmutables, así que
 * el despiece de cada ventana se recuerda por referencia: al cambiar una ventana solo se
 * recalcula esa, y los totales se rehacen al instante.
 */
import {
  computeBom,
  evaluateQuoteWithBoms,
  safeBom,
  type Bom,
  type Catalog,
  type CutSettings,
  type PricingSettings,
  type QuoteEvaluation,
  type Warning,
  type WindowDesign,
} from '@dekopen/engine'
import type { QuoteDoc } from './doc'

export interface EvaluationSettings {
  pricing?: Partial<PricingSettings>
  cut?: Partial<CutSettings>
}

export interface Evaluator {
  evaluate(doc: QuoteDoc): QuoteEvaluation
}

export function createEvaluator(catalog: Catalog, settings: EvaluationSettings): Evaluator {
  const boms = new WeakMap<WindowDesign, Bom>()
  const bomOf = (design: WindowDesign): Bom => {
    let bom = boms.get(design)
    if (!bom) {
      bom = safeBom({ computeBom }, design, catalog)
      boms.set(design, bom)
    }
    return bom
  }
  return {
    evaluate(doc) {
      const quote = { items: doc.items, extras: doc.extras, discountPct: doc.discountPct, pricing: doc.pricing }
      try {
        return evaluateQuoteWithBoms(quote, doc.items.map((item) => bomOf(item.design)), catalog, settings.pricing ?? {}, { cut: settings.cut })
      } catch {
        // El motor no lanza por datos incompletos; esto es solo una red de seguridad.
        return evaluateQuoteWithBoms({ ...quote, items: [] }, [], catalog, settings.pricing ?? {}, { cut: settings.cut })
      }
    },
  }
}

/**
 * Avisos de una ventana sin duplicados: el despiece y el precio pueden avisar lo mismo
 * (precio faltante); se deja el del precio, que habla en pesos.
 */
export function itemWarnings(bom: Bom | undefined, priceWarnings: readonly Warning[] | undefined): Warning[] {
  const fromPrice = priceWarnings ?? []
  const pricedMissing = fromPrice.some((w) => w.code.startsWith('price_missing'))
  const fromBom = (bom?.warnings ?? []).filter((w) => !(pricedMissing && w.code.startsWith('price_missing')))
  const seen = new Set<string>()
  const out: Warning[] = []
  for (const w of [...fromBom, ...fromPrice]) {
    const key = `${w.code}|${w.nodeId ?? ''}|${w.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  const rank = { error: 0, warn: 1, info: 2 } as const
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}
