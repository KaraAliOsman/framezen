/**
 * Utilidades compartidas por los manejadores: resolver la cotización de la orden, leerla y
 * guardarla por la ruta REST (con versión y un reintento), datos para deshacer y resúmenes
 * compactos para el modelo (sin costos si el rol no los ve).
 */
import { describeDesign, evaluateQuote, matchTypology, type Catalog, type PendingPrice, type PendingPriceCode, type QuoteTotals } from '@dekopen/engine'
import type { Defaults, Quote, QuoteItem, QuoteSummary, Paged } from '@dekopen/shared'
import { canSeeMargins } from '../../access'
import { getSettings } from '../../settings'
import type { DispatchResult } from '../../dispatch'
import type { DesignEnv } from '../design'
import { ToolFailure, type AgentUndo, type ToolContext } from './types'

/** Lanza ToolFailure con el código y mensaje de la ruta si la llamada falló. */
export function ensureOk<T>(res: DispatchResult<T>): T {
  if (!res.ok) throw new ToolFailure(res.error?.code ?? `http_${res.status}`, res.error?.message || `request failed (${res.status})`)
  return res.data as T
}

export interface QuoteRefArgs {
  quoteId?: string
  quoteNumber?: number
}

/**
 * Cotización a la que apunta la orden: id explícito, número, la creada/abierta en este turno o la
 * que la persona tiene abierta. Sin ninguna → ToolFailure('no_quote').
 */
export async function resolveQuoteId(ctx: ToolContext, args: QuoteRefArgs, options: { optional?: boolean } = {}): Promise<string | undefined> {
  if (args.quoteId) return args.quoteId
  if (args.quoteNumber) {
    const res = await ctx.call<Paged<QuoteSummary>>('quotesList', { query: { q: String(args.quoteNumber), limit: 20 } })
    const found = ensureOk(res).items.find((q) => q.number === args.quoteNumber)
    if (!found) throw new ToolFailure('not_found', `Quote N° ${args.quoteNumber} does not exist in this account.`)
    return found.id
  }
  const fallback = ctx.memo.quoteId ?? ctx.ui.quoteId
  if (fallback) return fallback
  if (options.optional) return undefined
  throw new ToolFailure('no_quote', 'No quote is open. Ask which quote (number) or create one.')
}

export async function loadQuote(ctx: ToolContext, id: string): Promise<Quote> {
  return ensureOk(await ctx.call<Quote>('quoteGet', { params: { id } }))
}

export async function loadQuoteFor(ctx: ToolContext, args: QuoteRefArgs): Promise<Quote> {
  const id = (await resolveQuoteId(ctx, args))!
  return loadQuote(ctx, id)
}

/** Campos del documento que se restauran al deshacer (lo demás tiene rutas propias). */
export function quoteSnapshot(quote: Quote): Record<string, unknown> {
  return {
    title: quote.title ?? '',
    siteAddress: quote.siteAddress ?? null,
    clientId: quote.clientId ?? null,
    items: quote.items,
    extras: quote.extras,
    discountPct: quote.discountPct ?? 0,
    notes: quote.notes ?? null,
    documentOverrides: quote.documentOverrides ?? null,
    validUntil: quote.validUntil ?? null,
  }
}

/** Deshacer de una edición de cotización: PUT con la foto previa y la versión que dejó la acción. */
export function quoteUndo(before: Quote, after: Quote): AgentUndo {
  return {
    method: 'PUT',
    path: `/api/quotes/${after.id}`,
    route: 'quoteSave',
    params: { id: after.id },
    body: { ...quoteSnapshot(before), version: after.version },
    expectedVersion: after.version,
    entity: { type: 'quote', id: after.id, version: after.version },
  }
}

export type QuotePatch = Partial<Pick<Quote, 'title' | 'items' | 'extras' | 'discountPct' | 'validUntil' | 'pricing'>> & {
  notes?: string | null
  documentOverrides?: unknown
  clientId?: string | null
  siteAddress?: string | null
}

/**
 * Guarda cambios con control de versión. Si otra persona (o el autoguardado) guardó en medio,
 * vuelve a leer y recalcula una vez con `rebuild`.
 */
export async function saveQuote(ctx: ToolContext, quote: Quote, patch: QuotePatch, rebuild?: (fresh: Quote) => QuotePatch | null): Promise<{ before: Quote; after: Quote }> {
  const first = await ctx.call<Quote>('quoteSave', { params: { id: quote.id }, body: { ...patch, version: quote.version } })
  if (first.ok) return { before: quote, after: first.data! }
  if (first.error?.code !== 'version_conflict' || !rebuild) ensureOk(first)
  const fresh = await loadQuote(ctx, quote.id)
  const again = rebuild!(fresh)
  if (!again) throw new ToolFailure('version_conflict', 'The quote changed meanwhile and the change no longer applies.')
  const second = await ctx.call<Quote>('quoteSave', { params: { id: fresh.id }, body: { ...again, version: fresh.version } })
  return { before: fresh, after: ensureOk(second) }
}

/** Totales para el modelo: costo y margen solo si el rol los ve. */
export function totalsForModel(ctx: ToolContext, totals: QuoteTotals | undefined | null) {
  if (!totals) return undefined
  const base = { net: totals.net, tax: totals.iva, total: totals.total, units: totals.units, area_m2: totals.area, discountPct: totals.discountPct, currency: ctx.text.fmt.currency }
  const out = totals.pendingItems ? { ...base, pendingItems: totals.pendingItems, note: 'The total leaves out pending items: it is not the final total.' } : base
  return canSeeMargins(ctx.viewer) ? { ...out, cost: totals.cost, profit: totals.net - totals.cost, marginPct: totals.marginPct } : out
}

const PENDING_REASON: Record<PendingPriceCode, string> = {
  profile_missing: 'the line does not have this profile',
  price_missing: 'this material has no price in the catalogue',
  hardware_missing: 'there is no hardware for this opening or size',
  extra_missing: 'this accessory has no pricing rule in the catalogue',
  no_materials: 'the engine could not list the materials',
  line_missing: 'the window has no valid line',
  joint_missing: 'the line has no coupling profile or post for this joint',
}

/** Código con que el despiece marca una pieza que lleva refuerzo sin acero asignado en la línea. */
const NO_STEEL_CODE = 'REF'

/** El motor nombra los materiales por código: el nombre del catálogo es lo que se entiende. */
function pendingName(ref: string, catalog: Catalog): string {
  const code = /^(\S+)(.*)$/.exec(ref)
  if (!code) return ref
  const match = catalog.profiles.find((p) => p.code === code[1]) ?? catalog.items.find((i) => i.code === code[1])
  return match?.name ? `${match.name} (${code[1]})${code[2]}` : ref
}

/** Lo que falta para que una ventana tenga precio, en una forma que el modelo cite tal cual. */
export function pendingForModel(item: Pick<QuoteItem, 'ref'>, price: { unitNet: number; pending?: readonly PendingPrice[] }, catalog: Catalog) {
  const pending = price.pending ?? []
  if (!pending.length) return undefined
  // Un conjunto conserva lo que sí tiene precio: el resto queda fuera del total.
  const partial = price.unitNet > 0
  return {
    ref: item.ref,
    scope: partial ? 'part of this assembly is out of the total; the rest keeps its price' : 'this whole window is out of the total',
    missing: pending.slice(0, 12).map((p) => ({
      code: p.code,
      ...(p.ref === NO_STEEL_CODE
        ? { what: 'steel reinforcement', why: 'the line has no reinforcement steel assigned in the catalogue' }
        : { what: p.code === 'price_missing' ? pendingName(p.ref, catalog) : p.ref, why: PENDING_REASON[p.code] ?? 'it has no price' }),
      ...(p.unitId ? { unit: p.unitId } : {}),
    })),
    ...(pending.length > 12 ? { more: pending.length - 12 } : {}),
    fix: 'Load the missing data in the catalogue, or set a manual price on the window.',
  }
}

/** Ítems pendientes de una cotización. Solo calcula si los totales dicen que hay alguno. */
export async function quotePendingForModel(ctx: ToolContext, quote: Quote) {
  if (!quote.totals?.pendingItems) return undefined
  const settings = await getSettings(ctx.deps.db, ctx.auth.org.id)
  const { catalog } = await ctx.deps.catalogs.effective(ctx.auth.org.id, { onlyEnabled: false, kerf: settings.cut.kerf })
  const evaluation = evaluateQuote({ items: quote.items, extras: quote.extras, discountPct: quote.discountPct ?? 0, pricing: quote.pricing }, catalog as Catalog, settings.pricing, { cut: settings.cut })
  const list = evaluation.items.flatMap((priced) => {
    const item = quote.items.find((i) => i.id === priced.id)
    const entry = item ? pendingForModel(item, priced.price, catalog as Catalog) : undefined
    return entry ? [entry] : []
  })
  return list.length ? list : undefined
}

/** Catálogo efectivo (marcas activas) y valores por defecto del taller. */
export async function designEnv(ctx: ToolContext): Promise<DesignEnv> {
  const [{ catalog }, settings] = await Promise.all([ctx.deps.catalogs.effective(ctx.auth.org.id, { onlyEnabled: true }), getSettings(ctx.deps.db, ctx.auth.org.id)])
  return { catalog, defaults: (settings.defaults ?? {}) as Defaults, text: ctx.text }
}

/** Descripción compacta de un ítem para el modelo. */
export function itemForModel(item: QuoteItem, catalog: Catalog | null) {
  const d = item.design
  const color = catalog?.colors.find((c) => c.id === d.colorId)?.name ?? d.colorId
  const colorIn = d.colorInId ? (catalog?.colors.find((c) => c.id === d.colorInId)?.name ?? d.colorInId) : undefined
  let description: string | undefined
  try {
    description = catalog ? describeDesign(d, catalog) : undefined
  } catch {
    description = undefined
  }
  return {
    id: item.id,
    ref: item.ref,
    qty: item.qty,
    typology: matchTypology(d) ?? 'custom',
    width: d.width,
    height: d.height,
    line: catalog?.lines.find((l) => l.id === d.lineId)?.name ?? d.lineId,
    color,
    ...(colorIn ? { color_in: colorIn } : {}),
    glass: catalog?.glass.find((g) => g.id === d.glassId)?.name ?? d.glassId,
    ...(d.extras && Object.keys(d.extras).length ? { accessories: d.extras } : {}),
    ...(item.location ? { location: item.location } : {}),
    ...(item.name ? { name: item.name } : {}),
    ...(description ? { description } : {}),
  }
}

/** Cotización compacta para el modelo (sin notas de otros clientes ni costos ocultos). */
export function quoteForModel(ctx: ToolContext, quote: Quote, catalog: Catalog | null) {
  const overrides = quote.documentOverrides as { locale?: string; templateId?: string } | undefined
  return {
    id: quote.id,
    number: quote.number,
    title: quote.title || undefined,
    status: quote.status,
    client: quote.client ? { id: quote.client.id, name: quote.client.name } : undefined,
    revision: quote.revision,
    discountPct: quote.discountPct,
    validUntil: quote.validUntil,
    documentLocale: overrides?.locale,
    template: overrides?.templateId,
    notes: quote.notes ? quote.notes.slice(0, 1000) : undefined,
    siteAddress: quote.siteAddress,
    extras: quote.extras.length ? quote.extras.map((e) => ({ id: e.id, label: e.label, amount: e.amount, hidden: e.hidden })) : undefined,
    items: quote.items.slice(0, 60).map((i) => itemForModel(i, catalog)),
    ...(quote.items.length > 60 ? { itemsOmitted: quote.items.length - 60 } : {}),
    totals: totalsForModel(ctx, quote.totals),
  }
}

/** «V1», «V1 y V3», «las 4 ventanas». */
export function refsLabel(ctx: ToolContext, items: readonly QuoteItem[], total: number): string {
  if (items.length > 1 && items.length === total) return ctx.text.t('refs.all', { count: total })
  const refs = items.map((i) => i.ref || ctx.text.t('refs.one'))
  return refs.length ? ctx.text.list(refs) : ctx.text.t('refs.one')
}

/** Número legible de la cotización («N° 412»). */
export function quoteNo(ctx: ToolContext, quote: Pick<Quote, 'number'>): string {
  return ctx.text.quoteNo(quote.number)
}
