// Comercio y taller: precio, totales, optimizador de cortes, datos de producción y formato.
export { DEFAULT_PRICING, DEFAULT_CUT, defaultBrandSettings, sanitizePricing, resolvePricing, sanitizeCut } from './defaults'
export { roundHalfUp, roundUpTo, formatCLP, formatMM, formatSize, formatArea, formatPct, formatMeters } from './format'
export { catalogLookup, familyDiscount, profileBarPrice, type CatalogLookup } from './lookup'
export {
  optimizeCuts,
  summarizePlan,
  reusableOffcuts,
  type CutPieceInput,
  type CutPlan,
  type Offcut,
} from './optimizer'
export {
  planCuts,
  fullBarFactors,
  cutKey,
  pieceKey,
  pieceColorId,
  cutForBrand,
  type PlanEntry,
  type CutGroupMeta,
  type PlanCutsOptions,
} from './plan'
export { priceItem, explainPrice, type PriceItemOptions, type ItemPriceDetail, type PriceExplanationLine } from './pricing'
export { quoteTotals, type QuoteTotalsLine, type QuoteTotalsOptions } from './totals'
export {
  altGroupOf,
  applyQuoteSelection,
  includedLineIds,
  lineDiscount,
  lineRole,
  selectionTotals,
  withTax,
  type QuoteChoiceLine,
  type QuoteSelection,
  type SelectionInput,
  type SelectionLine,
} from './choices'
export {
  evaluateQuoteWith,
  evaluateQuoteWithBoms,
  safeBom,
  safeLayout,
  safeDescribe,
  type DesignCore,
  type QuoteInput,
  type QuoteItemInput,
  type EvaluatedItem,
  type QuoteEvaluation,
  type EvaluateOptions,
} from './evaluate'
export {
  buildWorkshopDataWith,
  glassListFrom,
  materialListFrom,
  purchaseOrdersFrom,
  materialCostFrom,
  type MaterialLineDetail,
  type WorkshopOptions,
  type WorkshopDataDetail,
} from './workshop'
export { toSawCsv } from './saw-csv'
export { evaluateQuote, buildWorkshopData } from './quote'
