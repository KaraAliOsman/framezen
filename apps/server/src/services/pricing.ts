/**
 * Único punto donde el servidor llama al motor para calcular cifras. El motor es la
 * única fuente de números (SPEC §1.5): aquí sólo se le entregan datos y se guarda lo que devuelve.
 */
import { evaluateQuote } from '@framezen/engine'
import type { Catalog, CutSettings, PricingSettings, QuoteTotals } from '@framezen/engine'
import type { ItemPrices } from '@framezen/shared'
import type { QuoteData } from '../db/schema'

export type PricingInput = Pick<QuoteData, 'items' | 'extras' | 'discountPct' | 'pricing'>

/** Precio neto por ítem (id del ítem → unitario y total), para el portal y los documentos. */
export type { ItemPrices }

export interface Evaluation {
  totals: QuoteTotals
  itemPrices: ItemPrices
}

/**
 * Evalúa la cotización con el motor: `orgPricing` son los ajustes de la organización y el
 * motor aplica encima los de la cotización (`quote.pricing`).
 */
export function evaluate(quote: PricingInput, catalog: Catalog, orgPricing: PricingSettings, cut?: CutSettings): Evaluation {
  const result = evaluateQuote(quote, catalog, orgPricing, cut ? { cut } : undefined)
  const itemPrices: ItemPrices = {}
  for (const item of result.items) itemPrices[item.id] = { unitNet: item.price.unitNet, totalNet: item.price.totalNet }
  return { totals: result.totals, itemPrices }
}

/** Total y unidades para las columnas indexadas (listas y embudo). */
export function summaryNumbers(quote: PricingInput, totals: QuoteTotals | undefined): { total: number; units: number } {
  const units = totals?.units ?? quote.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
  return { total: Math.round(totals?.total ?? 0), units }
}
