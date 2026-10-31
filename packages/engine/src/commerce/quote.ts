import type { Catalog, CutSettings, PricingSettings } from '../types'
import { computeBom, computeLayout, describeDesign } from '../core'
import { evaluateQuoteWith, type DesignCore, type EvaluateOptions, type QuoteEvaluation, type QuoteInput } from './evaluate'
import { buildWorkshopDataWith, type WorkshopDataDetail, type WorkshopOptions } from './workshop'

const core: DesignCore = { computeBom, computeLayout, describeDesign }

/**
 * Calcula BOM y precio de cada ítem con el núcleo y los totales de la cotización. Los ajustes
 * de la cotización (`quote.pricing`) se aplican encima de `settings`.
 */
export function evaluateQuote(
  quote: QuoteInput,
  catalog: Catalog,
  settings: Partial<PricingSettings>,
  opts?: EvaluateOptions,
): QuoteEvaluation {
  return evaluateQuoteWith(core, quote, catalog, settings, opts)
}

/**
 * Todo lo que necesitan los documentos de taller: ventanas con dibujo y BOM, optimización de
 * perfiles y refuerzos, vidrios agrupados, materiales, órdenes de compra y costos.
 */
export function buildWorkshopData(
  quote: QuoteInput,
  catalog: Catalog,
  pricing: Partial<PricingSettings>,
  cut: Partial<CutSettings>,
  opts?: WorkshopOptions,
): WorkshopDataDetail {
  return buildWorkshopDataWith(core, quote, catalog, pricing, cut, opts)
}
