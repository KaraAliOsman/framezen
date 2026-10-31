import { Hono } from 'hono'
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { Paged, Quote, QuoteFollowUp, QuoteItem, QuoteStats, QuoteStatus, QuoteSummary, SendQuoteResponse } from '@framezen/shared'
import type { QuoteExtra, WindowDesign } from '@framezen/engine'
import { mergeQuoteDocPrefs, type QuoteDocOverrides } from '@framezen/documents'
import type { Context } from 'hono'
import type { AppDeps, AppEnv } from '../context'
import type { Db } from '../db/client'
import { clients, quoteRevisions, quotes, users, type QuoteData } from '../db/schema'
import { newId, randomToken, shortId } from '../lib/crypto'
import { monthStartInZone } from '../lib/dates'
import { badRequest, conflict, notFound } from '../lib/errors'
import { folded, pageParams, readBody } from '../lib/http'
import { simpleHtml } from '../lib/mail'
import { emailSchema, quoteStatusSchema } from '../lib/schemas'
import { requireWritable } from '../middleware/auth'
import { QUOTE_WRITE_DENIED, canSeeMargins, canWriteQuotes, redactQuote, requirePermission, viewerFor } from '../services/access'
import { firstName, logActivity } from '../services/activity'
import { mailQuotaError, takeMailQuota } from '../services/outbound'
import { summaryNumbers, type ItemPrices } from '../services/pricing'
import {
  acceptedTotalOf,
  allocateQuoteNumber,
  committedTotalSql,
  findClient,
  findQuote,
  priceQuote,
  publicClient,
  quoteLabel,
  summaryColumns,
  toClient,
  toQuote,
  toSummary,
  wonTotalSql,
  type QuoteRow,
} from '../services/quotes'
import { getSettings } from '../services/settings'
import { WON_STATUSES } from './clients'

// ── Validación del documento ────────────────────────────────────────────────
// El diseño se valida de forma laxa: el motor nunca falla por datos incompletos (avisa).
const designSchema = z.looseObject({
  version: z.number().optional(),
  lineId: z.string({ error: 'Cada ventana necesita una línea.' }),
  width: z.number({ error: 'El ancho de la ventana debe ser un número en mm.' }).min(0).max(100_000),
  height: z.number({ error: 'El alto de la ventana debe ser un número en mm.' }).min(0).max(100_000),
  colorId: z.string(),
  glassId: z.string(),
  root: z.looseObject({ id: z.string(), type: z.enum(['leaf', 'split', 'sliding'], { error: 'El diseño de la ventana está incompleto.' }) }),
})

const itemSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  ref: z.string().trim().max(20, 'La referencia admite hasta 20 caracteres.').optional(),
  name: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
  qty: z.number({ error: 'La cantidad debe ser un número.' }).int('La cantidad debe ser un número entero.').min(0, 'La cantidad no puede ser negativa.').max(100_000).default(1),
  design: designSchema,
  notes: z.string().max(4000).nullish(),
  manualUnitPrice: z.number().min(0, 'El precio manual no puede ser negativo.').max(10_000_000_000).nullish(),
})

const extraSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  label: z.string().trim().max(200, 'El nombre del extra es demasiado largo.').default(''),
  amount: z.number({ error: 'El monto del extra debe ser un número.' }).min(-10_000_000_000).max(10_000_000_000),
  hidden: z.boolean().optional(),
})

const pricingOverrideSchema = z
  .object({
    marginMode: z.enum(['margin', 'markup']),
    marginPct: z.number().min(0).max(95),
    laborPerM2: z.number().min(0),
    installMode: z.enum(['none', 'per_m2', 'per_unit']),
    installValue: z.number().min(0),
    wastePct: z.number().min(0).max(50),
    roundTo: z.union([z.literal(1), z.literal(10), z.literal(100), z.literal(1000)]),
    ivaPct: z.number().min(0).max(50),
    chargeFullBars: z.boolean(),
  })
  .partial()

const documentFields = {
  title: z.string().trim().max(200, 'El título admite hasta 200 caracteres.').optional(),
  clientId: z.string().max(64).nullish(),
  items: z.array(itemSchema).max(1000, 'Una cotización admite hasta 1.000 ítems.').optional(),
  extras: z.array(extraSchema).max(100).optional(),
  discountPct: z.number({ error: 'El descuento debe ser un número.' }).min(0, 'El descuento no puede ser negativo.').max(100, 'El descuento no puede pasar de 100 %.').optional(),
  pricing: pricingOverrideSchema.nullish(),
  notes: z.string().max(20_000).nullish(),
  documentOverrides: z.record(z.string(), z.unknown()).nullish(),
  validUntil: z.string().max(40).nullish(),
}

const createSchema = z.object(documentFields)

/** PUT: documento completo o parcial + versión. status/sentAt/accepted* se ignoran (tienen rutas propias). */
const saveSchema = z.object({
  ...documentFields,
  version: z.number({ error: 'Falta la versión de la cotización.' }).int(),
})

const sendSchema = z.object({
  channel: z.enum(['link', 'email', 'whatsapp']).default('link'),
  to: emailSchema.optional(),
  message: z.string().max(4000).optional(),
})

type ItemInput = z.output<typeof itemSchema>
type ExtraInput = z.output<typeof extraSchema>

function normalizeItems(items: ItemInput[]): QuoteItem[] {
  const seen = new Set<string>()
  return items.map((item, index) => {
    let id = item.id && !seen.has(item.id) ? item.id : shortId()
    while (seen.has(id)) id = shortId()
    seen.add(id)
    return {
      id,
      ref: item.ref || `V${index + 1}`,
      ...(item.name ? { name: item.name } : {}),
      ...(item.location ? { location: item.location } : {}),
      qty: item.qty,
      design: item.design as unknown as WindowDesign,
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.manualUnitPrice !== null && item.manualUnitPrice !== undefined ? { manualUnitPrice: item.manualUnitPrice } : {}),
    }
  })
}

function normalizeExtras(extras: ExtraInput[]): QuoteExtra[] {
  return extras.map((e) => ({ id: e.id || shortId(), label: e.label, amount: e.amount, ...(e.hidden ? { hidden: true } : {}) }))
}

/** Aplica al documento sólo los campos enviados (undefined = no se toca; null = se borra). */
function applyDocument(base: QuoteData, body: z.output<typeof createSchema>): QuoteData {
  const next: QuoteData = { ...base }
  if (body.items !== undefined) next.items = normalizeItems(body.items)
  if (body.extras !== undefined) next.extras = normalizeExtras(body.extras)
  if (body.discountPct !== undefined) next.discountPct = body.discountPct
  for (const key of ['pricing', 'notes', 'documentOverrides', 'validUntil'] as const) {
    const value = body[key]
    if (value === undefined) continue
    if (value === null || value === '') delete next[key]
    else (next as unknown as Record<string, unknown>)[key] = value
  }
  return next
}

function emptyData(): QuoteData {
  return { items: [], extras: [], discountPct: 0 }
}

/** Días de validez al enviar: los propios de la cotización (inspector) o los de la empresa. */
export function sendValidityDays(documents: Parameters<typeof mergeQuoteDocPrefs>[0], overrides: QuoteData['documentOverrides']): number {
  return mergeQuoteDocPrefs(documents, (overrides ?? null) as QuoteDocOverrides | null).validityDays
}

export function quoteRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  // Con roles activos: crear, editar, enviar, cambiar estado y borrar es del dueño y el cotizador.
  const writable = [requirePermission(deps, canWriteQuotes, QUOTE_WRITE_DENIED), requireWritable(deps)] as const

  async function withClient(orgId: string, row: QuoteRow): Promise<Quote> {
    const client = await findClient(deps.db, orgId, row.clientId)
    return toQuote(row, client ? toClient(client) : null)
  }

  /** La cotización como la puede ver quien pide (sin costo ni margen según su rol). */
  async function shown(c: Context<AppEnv>, quote: Quote): Promise<Quote> {
    return redactQuote(quote, await viewerFor(c, deps))
  }

  /** El margen propio de la cotización solo lo cambia quien ve márgenes (con roles: el dueño). */
  async function allowedPricing<T extends { pricing?: unknown }>(c: Context<AppEnv>, body: T): Promise<T> {
    if (body.pricing === undefined || canSeeMargins(await viewerFor(c, deps))) return body
    return { ...body, pricing: undefined }
  }

  async function assertClient(orgId: string, clientId: string | null | undefined): Promise<void> {
    if (!clientId) return
    if (!(await findClient(deps.db, orgId, clientId))) throw badRequest('Ese cliente no existe en tu cuenta. Elige otro o créalo.', 'clientId', 'invalid_client')
  }

  async function price(orgId: string, data: QuoteData) {
    const settings = await getSettings(deps.db, orgId)
    const evaluation = await priceQuote(deps.catalogs, orgId, settings, data, deps.logger)
    const totals = evaluation?.totals ?? data.totals
    const withTotals: QuoteData = { ...data, ...(totals ? { totals } : {}) }
    return { data: withTotals, settings, itemPrices: evaluation?.itemPrices ?? {}, ...summaryNumbers(data, totals) }
  }

  // ── Lista y estadísticas ───────────────────────────────────────────────────
  app.get('/', async (c) => {
    const orgId = c.get('auth').org.id
    const { limit, offset } = pageParams(c)
    const conditions: SQL[] = [eq(quotes.orgId, orgId)]
    conditions.push(c.req.query('deleted') === '1' || c.req.query('deleted') === 'true' ? isNotNull(quotes.deletedAt) : isNull(quotes.deletedAt))
    const statuses = (c.req.query('status') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is QuoteStatus => quoteStatusSchema.safeParse(s).success)
    if (statuses.length) conditions.push(inArray(quotes.status, statuses))
    const clientId = c.req.query('clientId')
    if (clientId) conditions.push(eq(quotes.clientId, clientId))
    const q = c.req.query('q')?.trim()
    if (q) {
      const numeric = q.replace(/^(n[°º]?|#)\s*/i, '')
      conditions.push(
        or(folded(quotes.title, q), folded(clients.name, q), ...(/^\d{1,9}$/.test(numeric) ? [eq(quotes.number, Number(numeric))] : []))!,
      )
    }
    const where = and(...conditions)
    const rows = await deps.db
      .select(summaryColumns)
      .from(quotes)
      .leftJoin(clients, and(eq(clients.id, quotes.clientId), eq(clients.orgId, quotes.orgId)))
      .where(where)
      .orderBy(desc(quotes.updatedAt))
      .limit(limit)
      .offset(offset)
    const [{ total }] = await deps.db.select({ total: count() }).from(quotes).leftJoin(clients, and(eq(clients.id, quotes.clientId), eq(clients.orgId, quotes.orgId))).where(where)
    const body: Paged<QuoteSummary> = { items: rows.map(toSummary), total: Number(total) }
    return c.json(body)
  })

  /**
   * Para Inicio: embudo por estado, vendido del mes (y del mes anterior, para comparar) y
   * seguimientos pendientes con el teléfono del cliente y el enlace del portal (WhatsApp en un clic).
   * Los meses se cuentan en hora de Chile.
   */
  app.get('/stats', async (c) => {
    const orgId = c.get('auth').org.id
    const now = deps.now()
    const monthStart = monthStartInZone(now)
    const lastMonthStart = monthStartInZone(now, -1)
    // Lo enviado y lo vendido se suman con lo que vio y aceptó el cliente, no con el documento
    // vivo: editar una aceptada o subir precios después no cambia lo vendido.
    const byStatus = await deps.db
      .select({ status: quotes.status, n: count(), total: sql<number>`coalesce(sum(${committedTotalSql}), 0)::bigint` })
      .from(quotes)
      .where(and(eq(quotes.orgId, orgId), isNull(quotes.deletedAt)))
      .groupBy(quotes.status)
    const soldBetween = async (from: Date, to?: Date) => {
      const [row] = await deps.db
        .select({ n: count(), total: sql<number>`coalesce(sum(${wonTotalSql}), 0)::bigint` })
        .from(quotes)
        .where(
          and(
            eq(quotes.orgId, orgId),
            isNull(quotes.deletedAt),
            inArray(quotes.status, [...WON_STATUSES]),
            gte(quotes.acceptedAt, from),
            ...(to ? [lt(quotes.acceptedAt, to)] : []),
          ),
        )
      return { count: Number(row?.n ?? 0), total: Number(row?.total ?? 0) }
    }
    // Enviadas hace más de 3 días sin respuesta: hay que llamar.
    const followUps = await deps.db
      .select({ ...summaryColumns, clientPhone: clients.phone, shareToken: quotes.shareToken })
      .from(quotes)
      .leftJoin(clients, and(eq(clients.id, quotes.clientId), eq(clients.orgId, quotes.orgId)))
      .where(and(eq(quotes.orgId, orgId), isNull(quotes.deletedAt), eq(quotes.status, 'sent'), lt(quotes.sentAt, new Date(now.getTime() - 3 * 86_400_000))))
      .orderBy(quotes.sentAt)
      .limit(10)
    const counts: Record<QuoteStatus, { count: number; total: number }> = {
      draft: { count: 0, total: 0 },
      sent: { count: 0, total: 0 },
      accepted: { count: 0, total: 0 },
      rejected: { count: 0, total: 0 },
      workshop: { count: 0, total: 0 },
      installed: { count: 0, total: 0 },
      closed: { count: 0, total: 0 },
    }
    for (const row of byStatus) counts[row.status] = { count: Number(row.n), total: Number(row.total) }
    const body: QuoteStats = {
      byStatus: counts,
      soldThisMonth: await soldBetween(monthStart),
      soldLastMonth: await soldBetween(lastMonthStart, monthStart),
      followUps: followUps.map(({ clientPhone, shareToken, ...row }): QuoteFollowUp => ({
        ...toSummary(row),
        ...(clientPhone ? { clientPhone } : {}),
        ...(shareToken ? { shareToken } : {}),
      })),
    }
    return c.json(body)
  })

  // ── Crear ──────────────────────────────────────────────────────────────────
  app.post('/', ...writable, async (c) => {
    const body = await allowedPricing(c, await readBody(c, createSchema))
    const { org, user } = c.get('auth')
    await assertClient(org.id, body.clientId)
    const number = await allocateQuoteNumber(deps.db, org.id)
    const client = body.clientId ? await findClient(deps.db, org.id, body.clientId) : undefined
    const priced = await price(org.id, applyDocument(emptyData(), body))
    const now = deps.now()
    const id = newId()
    const [row] = await deps.db
      .insert(quotes)
      .values({
        id,
        orgId: org.id,
        number,
        // Sin nombre queda vacío: el cliente ve «Cotización N° 412» y el editor muestra su placeholder.
        title: body.title || (client ? `Obra ${client.name}` : ''),
        clientId: body.clientId ?? null,
        status: 'draft',
        revision: 0,
        version: 1,
        total: priced.total,
        units: priced.units,
        firstItem: priced.data.items[0] ?? null,
        data: priced.data,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'quote.created',
      text: `${firstName(user.name)} creó ${quoteLabel(number)}`,
      link: `/cotizaciones/${id}`,
      subject: { type: 'quote', id },
    })
    return c.json(await shown(c, await withClient(org.id, row!)), 201)
  })

  // ── Leer ───────────────────────────────────────────────────────────────────
  app.get('/:id', async (c) => {
    const orgId = c.get('auth').org.id
    const row = await findQuote(deps.db, orgId, c.req.param('id'), { includeDeleted: true })
    if (!row) throw notFound('No encontramos esa cotización. Puede que la hayan eliminado.')
    return c.json({ ...(await shown(c, await withClient(orgId, row))), ...(row.deletedAt ? { deletedAt: row.deletedAt.toISOString() } : {}) })
  })

  app.get('/:id/revisions', async (c) => {
    const orgId = c.get('auth').org.id
    const row = await findQuote(deps.db, orgId, c.req.param('id'), { includeDeleted: true })
    if (!row) throw notFound('No encontramos esa cotización.')
    const revisions = await deps.db
      .select({ revision: quoteRevisions.revision, createdAt: quoteRevisions.createdAt, viewedAt: quoteRevisions.viewedAt, sentBy: users.name })
      .from(quoteRevisions)
      .leftJoin(users, eq(users.id, quoteRevisions.sentBy))
      .where(and(eq(quoteRevisions.quoteId, row.id), eq(quoteRevisions.orgId, orgId)))
      .orderBy(desc(quoteRevisions.revision))
    return c.json({
      items: revisions.map((r) => ({
        revision: r.revision,
        sentAt: r.createdAt.toISOString(),
        ...(r.viewedAt ? { viewedAt: r.viewedAt.toISOString() } : {}),
        ...(r.sentBy ? { sentBy: r.sentBy } : {}),
      })),
      total: revisions.length,
    })
  })

  // ── Autoguardado con control de versión ────────────────────────────────────
  app.put('/:id', ...writable, async (c) => {
    const body = await allowedPricing(c, await readBody(c, saveSchema))
    const orgId = c.get('auth').org.id
    const id = c.req.param('id')
    const current = await findQuote(deps.db, orgId, id)
    if (!current) throw notFound('No encontramos esa cotización. Puede que la hayan eliminado.')
    const versionConflict = async (row: QuoteRow) =>
      conflict('version_conflict', 'Esta cotización cambió en otra pestaña o la editó otra persona. Te mostramos la versión más reciente para que no se pierda nada.', {
        version: row.version,
        quote: await shown(c, await withClient(orgId, row)),
      })
    if (current.version !== body.version) throw await versionConflict(current)
    if (body.clientId !== undefined) await assertClient(orgId, body.clientId)

    const priced = await price(orgId, applyDocument(current.data, body))
    const [row] = await deps.db
      .update(quotes)
      .set({
        // Borrar el nombre de la obra es válido: el cliente vuelve a ver «Cotización N° …».
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
        data: priced.data,
        total: priced.total,
        units: priced.units,
        firstItem: priced.data.items[0] ?? null,
        version: sql`${quotes.version} + 1`,
        updatedAt: deps.now(),
      })
      .where(and(eq(quotes.id, id), eq(quotes.orgId, orgId), eq(quotes.version, body.version), isNull(quotes.deletedAt)))
      .returning()
    if (!row) {
      const latest = await findQuote(deps.db, orgId, id)
      if (!latest) throw notFound('No encontramos esa cotización. Puede que la hayan eliminado.')
      throw await versionConflict(latest)
    }
    return c.json(await shown(c, await withClient(orgId, row)))
  })

  // ── Duplicar ───────────────────────────────────────────────────────────────
  app.post('/:id/duplicate', ...writable, async (c) => {
    const { org, user } = c.get('auth')
    const source = await findQuote(deps.db, org.id, c.req.param('id'), { includeDeleted: true })
    if (!source) throw notFound('No encontramos esa cotización.')
    const number = await allocateQuoteNumber(deps.db, org.id)
    const data: QuoteData = {
      ...source.data,
      items: source.data.items.map((item) => ({ ...item, id: shortId() })),
      extras: source.data.extras.map((e) => ({ ...e, id: shortId() })),
    }
    delete data.validUntil
    const priced = await price(org.id, data)
    const now = deps.now()
    const id = newId()
    const [row] = await deps.db
      .insert(quotes)
      .values({
        id,
        orgId: org.id,
        number,
        title: source.title ? `${source.title} (copia)`.slice(0, 200) : '',
        clientId: source.clientId,
        status: 'draft',
        revision: 0,
        version: 1,
        total: priced.total,
        units: priced.units,
        firstItem: priced.data.items[0] ?? null,
        data: priced.data,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'quote.duplicated',
      text: `${firstName(user.name)} duplicó ${quoteLabel(source.number)} como ${quoteLabel(number)}`,
      link: `/cotizaciones/${id}`,
      subject: { type: 'quote', id },
    })
    return c.json(await shown(c, await withClient(org.id, row!)), 201)
  })

  // ── Papelera (suave y recuperable) ─────────────────────────────────────────
  app.delete('/:id', ...writable, async (c) => {
    const { org, user } = c.get('auth')
    const [row] = await deps.db
      .update(quotes)
      .set({ deletedAt: deps.now(), version: sql`${quotes.version} + 1` })
      .where(and(eq(quotes.id, c.req.param('id')), eq(quotes.orgId, org.id), isNull(quotes.deletedAt)))
      .returning({ id: quotes.id, number: quotes.number })
    if (!row) throw notFound('No encontramos esa cotización.')
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'quote.deleted',
      text: `${firstName(user.name)} movió ${quoteLabel(row.number)} a la papelera`,
      link: `/cotizaciones/${row.id}`,
      subject: { type: 'quote', id: row.id },
    })
    return c.json({ ok: true, id: row.id })
  })

  app.post('/:id/restore', ...writable, async (c) => {
    const orgId = c.get('auth').org.id
    const [row] = await deps.db
      .update(quotes)
      .set({ deletedAt: null, version: sql`${quotes.version} + 1`, updatedAt: deps.now() })
      .where(and(eq(quotes.id, c.req.param('id')), eq(quotes.orgId, orgId), isNotNull(quotes.deletedAt)))
      .returning()
    if (!row) throw notFound('Esa cotización no está en la papelera.')
    return c.json(await shown(c, await withClient(orgId, row)))
  })

  // ── Enviar: revisión siguiente + foto fija + enlace público ────────────────
  app.post('/:id/send', ...writable, async (c) => {
    const body = await readBody(c, sendSchema)
    const { org, user } = c.get('auth')
    const id = c.req.param('id')
    const emailing = body.channel === 'email' && Boolean(body.to)
    // El correo sale desde nuestro dominio con texto libre: tope diario por organización.
    if (emailing && !(await takeMailQuota(deps, org.id))) throw mailQuotaError()

    // Leer → calcular → escribir con la versión leída como condición, todo junto a la foto de la
    // revisión en una transacción. Si otro guardado o envío entró en medio (otra pestaña, un
    // compañero), se vuelve a leer y calcular: nunca se pisa un cambio ya guardado ni se repite
    // un número de revisión (antes: cambios perdidos sin aviso o un 500 con el enlace muerto).
    let sent: { row: QuoteRow; revision: number; shareToken: string } | undefined
    for (let attempt = 0; !sent; attempt++) {
      if (attempt >= 4) throw conflict('version_conflict', 'La cotización cambió mientras la enviábamos. Revisa la versión más reciente y vuelve a enviarla.')
      const current = await findQuote(deps.db, org.id, id)
      if (!current) throw notFound('No encontramos esa cotización.')
      const priced = await price(org.id, current.data)
      const now = deps.now()
      const revision = current.revision + 1
      const shareToken = current.shareToken ?? randomToken(18)
      // La validez propia de la cotización (inspector) manda sobre la de la empresa.
      const validityDays = sendValidityDays(priced.settings.documents, current.data.documentOverrides)
      const validUntil =
        current.data.validUntil && new Date(current.data.validUntil) > now
          ? current.data.validUntil
          : new Date(now.getTime() + validityDays * 86_400_000).toISOString().slice(0, 10)
      // Re-enviar algo aceptado pide aceptar la nueva revisión; en taller/instalada se conserva el estado.
      const keepStatus = ['workshop', 'installed', 'closed'].includes(current.status)
      const status: QuoteStatus = keepStatus ? current.status : 'sent'
      const data: QuoteData = { ...priced.data, validUntil }
      sent = await deps.db.transaction(async (raw) => {
        const tx = raw as unknown as Db
        const [row] = await tx
          .update(quotes)
          .set({
            status,
            revision,
            shareToken,
            data,
            total: priced.total,
            units: priced.units,
            sentTotal: priced.total,
            firstItem: data.items[0] ?? null,
            sentAt: now,
            ...(keepStatus ? {} : { acceptedAt: null, acceptedBy: null, acceptedRevision: null, acceptedTotal: null }),
            version: sql`${quotes.version} + 1`,
            updatedAt: now,
          })
          .where(and(eq(quotes.id, current.id), eq(quotes.orgId, org.id), eq(quotes.version, current.version), isNull(quotes.deletedAt)))
          .returning()
        if (!row) return undefined
        // La foto que verá el cliente: datos de contacto del cliente, nunca sus notas internas.
        const client = await findClient(tx, org.id, row.clientId)
        const snapshot: Quote & { itemPrices: ItemPrices } = { ...toQuote(row, client ? publicClient(toClient(client)) : null), itemPrices: priced.itemPrices }
        await tx.insert(quoteRevisions).values({ id: newId(), orgId: org.id, quoteId: current.id, revision, snapshot, sentBy: user.id, createdAt: now })
        return { row, revision, shareToken }
      })
    }
    const { row, revision, shareToken } = sent
    const quote = await withClient(org.id, row)
    const url = `${deps.config.appUrl}/c/${shareToken}`

    if (emailing && body.to) {
      const intro = body.message?.trim() || `Hola${quote.client ? `, ${firstName(quote.client.name)}` : ''}: te enviamos la cotización N° ${quote.number}${quote.title ? ` (${quote.title})` : ''}. Puedes revisarla, ver cada ventana y aceptarla en línea.`
      try {
        await deps.mailer.send({
          to: body.to,
          subject: `Cotización N° ${quote.number} · ${org.name}`,
          text: `${intro}\n\n${url}\n\n${org.name}`,
          html: simpleHtml([intro], { label: 'Ver cotización', url }),
        })
      } catch {
        // El enlace sigue sirviendo aunque falle el correo.
      }
    }
    const to = quote.client?.name ?? body.to
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'quote.sent',
      text: `${firstName(user.name)} envió ${quoteLabel(quote.number)}${revision > 1 ? ` (versión ${revisionLetter(revision)})` : ''}${to ? ` a ${to}` : ''}`,
      link: `/cotizaciones/${quote.id}`,
      subject: { type: 'quote', id: quote.id },
      meta: { revision, channel: body.channel },
    })
    const response: SendQuoteResponse = { quote: await shown(c, quote), url, revision, revisionLabel: revisionLetter(revision) }
    return c.json(response)
  })

  // ── Cambiar estado a mano ──────────────────────────────────────────────────
  app.post('/:id/status', ...writable, async (c) => {
    const { status } = await readBody(c, z.object({ status: quoteStatusSchema }))
    const { org, user } = c.get('auth')
    const current = await findQuote(deps.db, org.id, c.req.param('id'))
    if (!current) throw notFound('No encontramos esa cotización.')
    const now = deps.now()
    const accepting = status === 'accepted' && !current.acceptedAt
    const [row] = await deps.db
      .update(quotes)
      .set({
        status,
        ...(accepting
          ? { acceptedAt: now, acceptedBy: { name: user.name, at: now.toISOString() }, acceptedRevision: current.revision, acceptedTotal: acceptedTotalOf(current) }
          : {}),
        ...(status === 'draft' || status === 'sent' ? { acceptedAt: null, acceptedBy: null, acceptedRevision: null, acceptedTotal: null } : {}),
        version: sql`${quotes.version} + 1`,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, current.id), eq(quotes.orgId, org.id)))
      .returning()
    if (status !== current.status) {
      await logActivity(deps.db, {
        orgId: org.id,
        actor: { userId: user.id, name: user.name },
        kind: `quote.status`,
        text: `${firstName(user.name)} marcó ${quoteLabel(current.number)} como ${STATUS_COPY[status]}`,
        link: `/cotizaciones/${current.id}`,
        subject: { type: 'quote', id: current.id },
        meta: { from: current.status, to: status },
      })
    }
    return c.json(await shown(c, await withClient(org.id, row!)))
  })

  // Punto de montaje (otra ola): GET /api/quotes/:id/pdf → PDF con Chromium (playwright-core).

  return app
}

export const STATUS_COPY: Record<QuoteStatus, string> = {
  draft: 'borrador',
  sent: 'enviada',
  accepted: 'aceptada',
  rejected: 'rechazada',
  workshop: 'en taller',
  installed: 'instalada',
  closed: 'cerrada',
}

/** Revisión 1 = A, 2 = B… (27 = AA). */
export function revisionLetter(revision: number): string {
  let n = Math.max(1, revision)
  let out = ''
  while (n > 0) {
    n--
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26)
  }
  return out
}
