/**
 * Datos de los documentos (cotización, taller y catálogo) armados con el motor.
 *
 * El motor es la única fuente de cifras. Cotización, taller y catálogo usan los constructores
 * puros de '@framezen/documents' (buildQuoteDocData / buildWorkshopDocInput /
 * buildCatalogDocData), los mismos de la vista previa de la web: el PDF muestra exactamente lo
 * que se ve en pantalla.
 */
import {
  buildCatalogDocData,
  buildQuoteDocData,
  buildWorkshopDocInput,
  canSeeWorkshopCosts,
  mergeQuoteDocPrefs,
  pinQuoteDocPrices,
  type CatalogDocData,
  type QuoteDocData,
  type QuoteDocOverrides,
  type WorkshopDocInput,
} from '@framezen/documents'
import type { Catalog, QuoteTotals } from '@framezen/engine'
import type { Client, DocumentPrefs, Feature, Org, OrgSettings, Quote, Role, WorkOrder } from '@framezen/shared'
import type { ItemPrices } from '../pricing'

// ── Cotización ───────────────────────────────────────────────────────────────

export interface QuoteDocInput {
  quote: Quote
  org: Org
  catalog: Catalog
  settings: OrgSettings
  client?: Client | null
  portalUrl?: string
  /** Precios fijados al enviar (portal): reemplazan a los recalculados. */
  itemPrices?: ItemPrices
  /** Totales fijados al enviar (portal). */
  totals?: QuoteTotals
  /** Fecha del documento (por defecto, la de envío o la última edición). */
  date?: string
}

/** Preferencias del documento ya combinadas con los textos propios de la cotización. */
export function quotePrefs(settings: Pick<OrgSettings, 'documents'>, quote: Pick<Quote, 'documentOverrides'>): DocumentPrefs {
  return mergeQuoteDocPrefs(settings.documents, quote.documentOverrides as QuoteDocOverrides | undefined)
}

/**
 * Cifras congeladas al enviar (portal): cada ventana se cruza con su ítem por id (o ref), nunca
 * por posición, porque el documento omite las de cantidad 0. Ver `pinQuoteDocPrices`.
 */
export function pinPrices(data: QuoteDocData, quote: Pick<Quote, 'items'>, itemPrices?: ItemPrices, totals?: QuoteTotals): QuoteDocData {
  return pinQuoteDocPrices(data, quote, itemPrices, totals)
}

/** QuoteDocData listo para cualquiera de las cuatro plantillas. */
export function buildQuoteDoc(input: QuoteDocInput): QuoteDocData {
  const data = buildQuoteDocData({
    quote: input.quote,
    org: input.org,
    catalog: input.catalog,
    settings: input.settings,
    ...(input.client !== undefined ? { client: input.client } : {}),
    ...(input.portalUrl ? { portalUrl: input.portalUrl } : {}),
    ...(input.date ? { date: input.date } : {}),
  })
  return pinPrices(data, input.quote, input.itemPrices, input.totals)
}

// ── Taller ───────────────────────────────────────────────────────────────────

export interface WorkshopDocArgs {
  workOrder: WorkOrder
  quote: Quote
  org: Org
  catalog: Catalog
  settings: OrgSettings
  client?: Client | null
  paper?: 'letter' | 'a4'
  /** Quién descarga: sin permiso para costos, los datos salen sin costos ni precios. */
  viewer: { role: Role; features: readonly Feature[] }
  now?: Date
}

export function buildWorkshopDoc(args: WorkshopDocArgs): WorkshopDocInput {
  return buildWorkshopDocInput({
    quote: args.quote,
    org: args.org,
    catalog: args.catalog,
    settings: args.settings,
    workOrder: args.workOrder,
    ...(args.client !== undefined ? { client: args.client } : {}),
    ...(args.paper ? { paper: args.paper } : {}),
    redactCosts: !canSeeWorkshopCosts(args.viewer),
    ...(args.now ? { now: args.now } : {}),
  })
}

// ── Catálogo de productos ────────────────────────────────────────────────────

/**
 * Mismas reglas que la vista previa de /documentos: ambos usan `buildCatalogDocData` de
 * '@framezen/documents' (tipologías por línea, color y vidrio del taller, «desde $X/m²»).
 */
export { CATALOG_DOC_MAX_TYPOLOGIES as CATALOG_MAX_TYPOLOGIES, fromPricePerM2 } from '@framezen/documents'

export interface CatalogDocInput {
  org: Org
  catalog: Catalog
  settings: OrgSettings
  /** Líneas a incluir (por defecto, todas las del catálogo). */
  lineIds?: readonly string[]
  title?: string
  /** Fecha de emisión (ISO o Date; se lleva al día de Chile). */
  date?: string | Date
  /**
   * Incluir líneas con datos parciales. Por defecto sí; la ruta debería pasar `false` cuando no
   * llega `?lines=` (folleto por defecto) y dejarlas cuando la web manda la lista elegida.
   */
  includePartial?: boolean
}

/** Folleto con las líneas del catálogo (activas), sus tipologías dibujadas y «desde $X/m²». */
export function buildCatalogDoc(input: CatalogDocInput): CatalogDocData {
  return buildCatalogDocData({
    org: input.org,
    catalog: input.catalog,
    settings: input.settings,
    ...(input.lineIds ? { lineIds: input.lineIds } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.date ? { date: input.date } : {}),
    ...(input.includePartial !== undefined ? { includePartial: input.includePartial } : {}),
  })
}
