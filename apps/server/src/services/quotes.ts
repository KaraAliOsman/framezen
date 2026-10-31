import { and, desc, eq, sql } from 'drizzle-orm'
import type { QuoteTotals } from '@framezen/engine'
import type { Client, OrgSettings, Quote, QuoteItem, QuoteSummary } from '@framezen/shared'
import type { Db } from '../db/client'
import { clients, orgSettings, quoteRevisions, quotes, workOrders, type QuoteData } from '../db/schema'
import type { Logger } from '../lib/logger'
import { defaultStoredSettings, getSettings } from './settings'
import type { CatalogService } from './catalog'
import { evaluate, summaryNumbers, type Evaluation, type ItemPrices } from './pricing'

export type QuoteRow = typeof quotes.$inferSelect
export type ClientRow = typeof clients.$inferSelect

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined)

export function toClient(row: ClientRow, aggregates?: { quotesCount?: number; totalAccepted?: number }): Client {
  return {
    id: row.id,
    name: row.name,
    ...(row.rut ? { rut: row.rut } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.address ? { address: row.address } : {}),
    ...(row.city ? { city: row.city } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(aggregates?.quotesCount !== undefined ? { quotesCount: aggregates.quotesCount } : {}),
    ...(aggregates?.totalAccepted !== undefined ? { totalAccepted: aggregates.totalAccepted } : {}),
  }
}

/**
 * Cliente tal como puede verlo el cliente final (foto enviada, portal, PDF público): lista
 * blanca de datos de contacto. Nunca las notas internas del CRM ni los agregados de venta.
 */
export function publicClient(client: Client): Client {
  return {
    id: client.id,
    name: client.name,
    ...(client.rut ? { rut: client.rut } : {}),
    ...(client.email ? { email: client.email } : {}),
    ...(client.phone ? { phone: client.phone } : {}),
    ...(client.address ? { address: client.address } : {}),
    ...(client.city ? { city: client.city } : {}),
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  }
}

export function toQuote(row: QuoteRow, client?: Client | null): Quote {
  const d = row.data
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    ...(row.clientId ? { clientId: row.clientId } : {}),
    ...(client ? { client } : {}),
    status: row.status,
    items: d.items ?? [],
    extras: d.extras ?? [],
    discountPct: d.discountPct ?? 0,
    ...(d.pricing ? { pricing: d.pricing } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    ...(d.documentOverrides ? { documentOverrides: d.documentOverrides } : {}),
    ...(d.validUntil ? { validUntil: d.validUntil } : {}),
    revision: row.revision,
    ...(row.shareToken ? { shareToken: row.shareToken } : {}),
    ...(d.totals ? { totals: d.totals } : {}),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.sentAt ? { sentAt: iso(row.sentAt) } : {}),
    ...(row.acceptedAt ? { acceptedAt: iso(row.acceptedAt) } : {}),
    ...(row.acceptedBy ? { acceptedBy: row.acceptedBy } : {}),
  }
}

export interface SummaryRow {
  id: string
  number: number
  title: string
  status: QuoteRow['status']
  revision: number
  createdAt: Date
  updatedAt: Date
  sentAt: Date | null
  acceptedAt: Date | null
  total: number
  units: number
  firstItem: QuoteItem | null
  clientName: string | null
}

export function toSummary(row: SummaryRow): QuoteSummary {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.sentAt ? { sentAt: row.sentAt.toISOString() } : {}),
    ...(row.acceptedAt ? { acceptedAt: row.acceptedAt.toISOString() } : {}),
    ...(row.clientName ? { clientName: row.clientName } : {}),
    total: Number(row.total),
    units: row.units,
    ...(row.firstItem ? { firstItem: row.firstItem } : {}),
  }
}

// ── Cifras comprometidas (embudo, vendido del mes, ficha del cliente) ──────
// `total` sigue al documento vivo (cada guardado lo recalcula). Lo vendido y lo enviado son lo
// que vio y aceptó el cliente: no cambian si después se edita o suben los precios del catálogo.

/** Total de lo vendido: el aceptado; si no quedó registro (datos antiguos), lo enviado o el vivo. */
export const wonTotalSql = sql<number>`coalesce(${quotes.acceptedTotal}, ${quotes.sentTotal}, ${quotes.total})`

/** Total por estado: aceptadas → aceptado; enviadas/rechazadas → enviado; borradores → vivo. */
export const committedTotalSql = sql<number>`coalesce(case when ${quotes.status} in ('accepted', 'workshop', 'installed', 'closed') then ${quotes.acceptedTotal} end, case when ${quotes.status} <> 'draft' then ${quotes.sentTotal} end, ${quotes.total})`

/** Total que queda como aceptado cuando se acepta sin pasar por el portal (a mano o «Pasar a taller»). */
export function acceptedTotalOf(row: Pick<QuoteRow, 'revision' | 'sentTotal' | 'total'>): number {
  return row.revision > 0 && row.sentTotal !== null ? row.sentTotal : row.total
}

/** Columnas que necesita una fila de lista (sin el documento completo). */
export const summaryColumns = {
  id: quotes.id,
  number: quotes.number,
  title: quotes.title,
  status: quotes.status,
  revision: quotes.revision,
  createdAt: quotes.createdAt,
  updatedAt: quotes.updatedAt,
  sentAt: quotes.sentAt,
  acceptedAt: quotes.acceptedAt,
  total: quotes.total,
  units: quotes.units,
  firstItem: quotes.firstItem,
  clientName: clients.name,
}

async function ensureSettingsRow(db: Db, orgId: string): Promise<void> {
  await db.insert(orgSettings).values({ orgId, data: defaultStoredSettings() }).onConflictDoNothing()
}

/**
 * Número humano siguiente (atómico: un UPDATE … RETURNING bloquea la fila del contador).
 * Si alguien bajó el contador en Ajustes, salta por sobre los números ya usados.
 */
export async function allocateQuoteNumber(db: Db, orgId: string): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [row] = await db
      .update(orgSettings)
      .set({
        nextQuoteNumber: sql`greatest(${orgSettings.nextQuoteNumber}, (select coalesce(max(q.number), 0) + 1 from ${quotes} q where q.org_id = ${orgId})) + 1`,
      })
      .where(eq(orgSettings.orgId, orgId))
      .returning({ next: orgSettings.nextQuoteNumber })
    if (row) return row.next - 1
    await ensureSettingsRow(db, orgId)
  }
  throw new Error('No se pudo asignar el número de cotización')
}

export async function allocateWorkOrderNumber(db: Db, orgId: string): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [row] = await db
      .update(orgSettings)
      .set({
        nextWorkOrderNumber: sql`greatest(${orgSettings.nextWorkOrderNumber}, (select coalesce(max(w.number), 0) + 1 from ${workOrders} w where w.org_id = ${orgId})) + 1`,
      })
      .where(eq(orgSettings.orgId, orgId))
      .returning({ next: orgSettings.nextWorkOrderNumber })
    if (row) return row.next - 1
    await ensureSettingsRow(db, orgId)
  }
  throw new Error('No se pudo asignar el número de OT')
}

/**
 * Recalcula los totales con el motor. Si el motor falla con algún dato raro, se guarda
 * igual (nunca bloquear) y queda en el log; la interfaz muestra los totales del navegador.
 */
export async function priceQuote(
  catalogs: CatalogService,
  orgId: string,
  settings: OrgSettings,
  data: QuoteData,
  logger: Logger,
): Promise<Evaluation | undefined> {
  try {
    const { catalog } = await catalogs.effective(orgId, { onlyEnabled: false, kerf: settings.cut.kerf })
    return evaluate(data, catalog, settings.pricing, settings.cut)
  } catch (error) {
    logger.error('El motor no pudo calcular los totales de una cotización', error)
    return undefined
  }
}

// ── Totales de los borradores al día ────────────────────────────────────────

export interface RepriceDeps {
  db: Db
  catalogs: CatalogService
  logger: Logger
}

function sameTotals(next: QuoteTotals, stored: QuoteTotals | undefined): boolean {
  if (!stored) return false
  return (Object.keys(next) as (keyof QuoteTotals)[]).every((key) => next[key] === stored[key])
}

/**
 * Recalcula con el motor y guarda los totales de los borradores de una organización. Va
 * después de cambiar Ajustes › Precios/Taller o los precios, pautas y vidrios del catálogo,
 * para que la lista, Inicio y la ficha del cliente digan lo mismo que el editor. Las
 * enviadas (y las que siguieron) no se tocan: conservan lo que vio el cliente.
 *
 * Sólo escribe los totales (data.totals, total y units): no cambia `version` ni `updatedAt`,
 * así no choca con el autoguardado del editor ni reordena la lista. Si la cotización se
 * guardó mientras tanto, ese guardado ya trae los totales nuevos y ésta se salta.
 * Devuelve cuántas cotizaciones cambiaron.
 */
export async function repriceDrafts(deps: RepriceDeps, orgId: string): Promise<number> {
  const rows = await deps.db
    .select({ id: quotes.id, version: quotes.version, data: quotes.data })
    .from(quotes)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.status, 'draft')))
  if (!rows.length) return 0
  const settings = await getSettings(deps.db, orgId)
  const { catalog } = await deps.catalogs.effective(orgId, { onlyEnabled: false, kerf: settings.cut.kerf })
  let changed = 0
  for (const [index, row] of rows.entries()) {
    // El motor es síncrono: cede el turno de vez en cuando para no frenar otras peticiones.
    if (index > 0 && index % 25 === 0) await new Promise((resolve) => setImmediate(resolve))
    let totals: QuoteTotals
    try {
      totals = evaluate(row.data, catalog, settings.pricing, settings.cut).totals
    } catch (error) {
      deps.logger.error('El motor no pudo recalcular los totales de un borrador', error)
      continue
    }
    if (sameTotals(totals, row.data.totals)) continue
    const { total, units } = summaryNumbers(row.data, totals)
    const updated = await deps.db
      .update(quotes)
      .set({ data: sql`jsonb_set(${quotes.data}, '{totals}', ${JSON.stringify(totals)}::jsonb)`, total, units })
      .where(and(eq(quotes.id, row.id), eq(quotes.orgId, orgId), eq(quotes.status, 'draft'), eq(quotes.version, row.version)))
      .returning({ id: quotes.id })
    if (updated.length) changed++
  }
  return changed
}

interface RepriceJob {
  again: boolean
  done: Promise<void>
}
const repriceJobs = new WeakMap<Db, Map<string, RepriceJob>>()

/**
 * Pone en cola el recálculo de los borradores: uno a la vez por organización y, si llegan
 * más cambios mientras corre (p. ej. varios ajustes seguidos), una pasada más al terminar.
 * Nunca rechaza: un error queda en el log y los totales se corrigen en el próximo guardado.
 */
export function queueDraftRepricing(deps: RepriceDeps, orgId: string): Promise<void> {
  let jobs = repriceJobs.get(deps.db)
  if (!jobs) repriceJobs.set(deps.db, (jobs = new Map()))
  const running = jobs.get(orgId)
  if (running) {
    running.again = true
    return running.done
  }
  const job: RepriceJob = { again: true, done: Promise.resolve() }
  jobs.set(orgId, job)
  job.done = (async () => {
    try {
      while (job.again) {
        job.again = false
        try {
          await repriceDrafts(deps, orgId)
        } catch (error) {
          deps.logger.error('No pude actualizar los totales de los borradores', error)
        }
      }
    } finally {
      jobs.delete(orgId)
    }
  })()
  return job.done
}

/**
 * Deja al día los totales de los borradores tras un cambio de precios. Espera un momento
 * (lo normal son milisegundos) para que la lista e Inicio ya vengan con la cifra nueva; si la
 * cuenta tiene muchísimos borradores, el resto sigue en segundo plano y la respuesta no se demora.
 */
export async function refreshDraftTotals(deps: RepriceDeps, orgId: string, waitMs = 1500): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitMs)
  })
  await Promise.race([queueDraftRepricing(deps, orgId), waited])
  clearTimeout(timer)
}

// ── PDF interno de una cotización enviada ───────────────────────────────────

/** JSON con las claves ordenadas (jsonb no conserva el orden): sirve para comparar documentos. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const DOCUMENT_KEYS = ['title', 'clientId', 'items', 'extras', 'discountPct', 'pricing', 'notes', 'documentOverrides', 'validUntil'] as const

/** ¿El documento de la cotización es el mismo que el de la foto enviada? (estado y totales aparte). */
export function sameAsSent(row: QuoteRow, snapshot: Quote): boolean {
  const live = toQuote(row, null) as unknown as Record<string, unknown>
  const sent = snapshot as unknown as Record<string, unknown>
  return DOCUMENT_KEYS.every((key) => stableJson(live[key]) === stableJson(sent[key]))
}

export type SentQuoteDoc =
  /** Sin cambios desde el último envío: cifras y fecha de esa revisión, como el portal. */
  | { kind: 'sent'; itemPrices?: ItemPrices; totals?: QuoteTotals; date: string }
  /** Editada después de enviar: es el borrador de la revisión siguiente (sin fecha de envío). */
  | { kind: 'draft'; revision: number }
  /** Nunca enviada. */
  | { kind: 'unsent' }

/**
 * Cómo rotular el PDF interno. Recalcular una cotización enviada con los precios de hoy y ponerle
 * «Rev. B» con la fecha del envío dejaba dos documentos con el mismo número, revisión y fecha y
 * totales distintos (el del portal y el del editor).
 */
export async function sentQuoteDoc(db: Db, row: QuoteRow): Promise<SentQuoteDoc> {
  if (row.revision < 1) return { kind: 'unsent' }
  const [last] = await db
    .select({ snapshot: quoteRevisions.snapshot, createdAt: quoteRevisions.createdAt })
    .from(quoteRevisions)
    .where(and(eq(quoteRevisions.quoteId, row.id), eq(quoteRevisions.orgId, row.orgId)))
    .orderBy(desc(quoteRevisions.revision))
    .limit(1)
  if (!last) return { kind: 'unsent' }
  const snapshot = last.snapshot as Quote & { itemPrices?: ItemPrices }
  if (!sameAsSent(row, snapshot)) return { kind: 'draft', revision: row.revision + 1 }
  return {
    kind: 'sent',
    ...(snapshot.itemPrices ? { itemPrices: snapshot.itemPrices } : {}),
    ...(snapshot.totals ? { totals: snapshot.totals } : {}),
    date: last.createdAt.toISOString().slice(0, 10),
  }
}

/**
 * Tras sembrar una versión nueva del catálogo base, deja al día los borradores de TODAS las
 * organizaciones que tienen alguno (en segundo plano, una organización a la vez), igual que
 * después de cambiar precios propios. Nunca rechaza.
 */
export async function repriceAllDrafts(deps: RepriceDeps): Promise<void> {
  try {
    const rows = await deps.db.selectDistinct({ orgId: quotes.orgId }).from(quotes).where(eq(quotes.status, 'draft'))
    for (const { orgId } of rows) await queueDraftRepricing(deps, orgId)
  } catch (error) {
    deps.logger.error('No pude actualizar los borradores tras el cambio del catálogo base', error)
  }
}

export async function findQuote(db: Db, orgId: string, id: string, options: { includeDeleted?: boolean } = {}): Promise<QuoteRow | undefined> {
  const [row] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.orgId, orgId)))
    .limit(1)
  if (!row || (row.deletedAt && !options.includeDeleted)) return undefined
  return row
}

export async function findClient(db: Db, orgId: string, id: string | null | undefined): Promise<ClientRow | undefined> {
  if (!id) return undefined
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
    .limit(1)
  return row
}

/** "Cotización N° 412" */
export const quoteLabel = (n: number) => `la cotización N° ${n}`
