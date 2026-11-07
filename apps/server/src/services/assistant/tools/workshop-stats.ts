/**
 * Taller (órdenes de trabajo: leer y actualizar; crear = producción, siempre con confirmación) y estadísticas
 * del negocio con datos reales. Las estadísticas son lecturas agregadas por organización (consultas
 * fijas y parametrizadas, nunca SQL del modelo), con los mismos criterios que Inicio: lo vendido es
 * lo que el cliente aceptó, no el documento vivo.
 */
import { and, count, eq, gte, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm'
import { matchTypology, type WindowDesign } from '@dekopen/engine'
import type { AgentToolArgs, Paged, Quote, QuoteStatus, WorkOrder } from '@dekopen/shared'
import { quotes } from '../../../db/schema'
import { dayStartInZone, monthStartInZone } from '../../../lib/dates'
import { committedTotalSql, wonTotalSql } from '../../quotes'
import { ensureOk, loadQuoteFor, quoteNo } from './common'
import { orderWindows, stationCounts } from './operations'
import { ToolFailure, type ToolContext, type ToolHandler } from './types'

const WON: QuoteStatus[] = ['accepted', 'workshop', 'installed', 'closed']

const workOrderForModel = (w: WorkOrder) => ({
  id: w.id,
  number: w.number,
  quoteId: w.quoteId,
  quoteNumber: w.quoteNumber,
  title: w.title || undefined,
  client: w.clientName,
  status: w.status,
  dueDate: w.dueDate,
})

const listWorkOrders: ToolHandler<'list_work_orders'> = async (ctx, args) => {
  const res = ensureOk(await ctx.call<Paged<WorkOrder>>('workOrdersList', { query: { status: args.status, limit: 100 } }))
  const orders = args.station ? res.items.filter((w) => Object.values(w.progress).includes(args.station!)) : res.items
  return {
    ok: true,
    summary: ctx.text.t('done.list_work_orders', { count: orders.length }),
    data: { total: orders.length, workOrders: orders.map((w) => ({ ...workOrderForModel(w), windowsByStation: stationCounts(Object.values(w.progress)) })) },
  }
}

const getWorkOrder: ToolHandler<'get_work_order'> = async (ctx, args) => {
  let id = args.workOrderId
  if (!id && args.number) {
    const list = ensureOk(await ctx.call<Paged<WorkOrder>>('workOrdersList', { query: { limit: 200 } })).items
    id = list.find((w) => w.number === args.number)?.id
    if (!id) throw new ToolFailure('not_found', `Work order ${args.number} not found.`)
  }
  if (!id) throw new ToolFailure('invalid', 'Give workOrderId or number.')
  const wo = ensureOk(await ctx.call<WorkOrder & { quote?: Quote }>('workOrderGet', { params: { id } }))
  const windows = orderWindows(wo)
  return {
    ok: true,
    summary: ctx.text.t('done.get_work_order', { number: String(wo.number) }),
    data: { ...workOrderForModel(wo), windows, windowsByStation: stationCounts(windows.map((w) => w.station)) },
  }
}

const updateWorkOrder: ToolHandler<'update_work_order'> = async (ctx, args) => {
  const t = ctx.text
  let id = args.workOrderId
  if (!id && args.number !== undefined) {
    const list = ensureOk(await ctx.call<Paged<WorkOrder>>('workOrdersList', { query: { limit: 200 } })).items
    id = list.find((w) => w.number === args.number)?.id
  }
  if (!id) throw new ToolFailure('invalid', 'Give workOrderId or number.')
  const wo = ensureOk(await ctx.call<WorkOrder>('workOrderGet', { params: { id } }))
  const number = String(wo.number)
  const patch: Record<string, unknown> = {}
  const previous: Record<string, unknown> = {}
  const changes: { field: string; label: string; before?: string; after?: string }[] = []
  const candidates = [
    ['status', args.status, wo.status, 'workOrderStatus'],
    ['notes', args.notes, wo.notes, 'workOrderNotes'],
    ['dueDate', args.due_date, wo.dueDate, 'workOrderDueDate'],
  ] as const
  for (const [field, value, before, label] of candidates) {
    if (value === undefined || value === before) continue
    patch[field] = value
    previous[field] = before ?? null
    changes.push({ field, label: t.t(`field.${label}`), before: before ?? '—', after: value })
  }
  if (!changes.length) return { ok: true, summary: t.t('done.update_work_order', { number, changes: t.t('change.nothing') }), data: { changed: false } }
  if (ctx.dryRun) {
    const title = t.t('propose.update_work_order', { number })
    return { ok: true, summary: title, preview: { title, lines: [], changes }, affected: [{ type: 'work_order', id }] }
  }
  const after = ensureOk(await ctx.call<WorkOrder>('workOrderPatch', { params: { id }, body: patch }))
  const saved = after as unknown as Record<string, unknown>
  return {
    ok: true,
    summary: t.t('done.update_work_order', { number, changes: t.list(changes.map((c) => c.label)) }),
    data: workOrderForModel(after),
    affected: [{ type: 'work_order', id }],
    undo: {
      method: 'PATCH' as const,
      path: `/api/work-orders/${encodeURIComponent(id)}`,
      route: 'workOrderPatch' as const,
      params: { id },
      body: previous,
      entity: { type: 'work_order' as const, id },
      expect: { route: 'workOrderGet' as const, params: { id }, checks: Object.keys(patch).map((key) => ({ path: [key], value: saved[key] ?? null })) },
    },
  }
}

const createWorkOrder: ToolHandler<'create_work_order'> = async (ctx, args) => {
  const quote: Quote = await loadQuoteFor(ctx, args)
  const title = ctx.text.t('propose.create_work_order', { number: quoteNo(ctx, quote) })
  if (ctx.dryRun) {
    return {
      ok: true,
      summary: title,
      preview: {
        title,
        lines: [
          quote.title || quoteNo(ctx, quote),
          ...(quote.client ? [`${ctx.text.t('field.client')}: ${quote.client.name}`] : []),
          `${ctx.text.t('field.windows')}: ${quote.items.reduce((n, i) => n + (i.qty || 0), 0)}`,
          ...(args.due_date ? [`${ctx.text.t('field.dueDate')}: ${ctx.text.fmt.date(args.due_date)}`] : []),
        ],
        irreversible: ctx.text.t('irreversible.production'),
      },
      affected: [{ type: 'quote', id: quote.id, version: quote.version }],
    }
  }
  const wo = ensureOk(
    await ctx.call<WorkOrder>('workOrderCreate', { body: { quoteId: quote.id, ...(args.due_date ? { dueDate: args.due_date } : {}), ...(args.notes ? { notes: args.notes } : {}) } }),
  )
  return {
    ok: true,
    summary: ctx.text.t('done.create_work_order', { number: quoteNo(ctx, quote) }),
    data: workOrderForModel(wo),
    affected: [{ type: 'work_order', id: wo.id }, { type: 'quote', id: quote.id }],
    ui: [{ kind: 'navigate', to: 'work_order', id: wo.id }],
    undo: null,
  }
}

type Period = NonNullable<AgentToolArgs['get_stats']['period']>

/** Rango [desde, hasta) del período en hora de Chile (la del negocio). */
export function periodRange(period: Period, now: Date): { from?: Date; to?: Date } {
  switch (period) {
    case 'today':
      return { from: dayStartInZone(now) }
    case 'week':
      return { from: dayStartInZone(now, -6) }
    case 'month':
      return { from: monthStartInZone(now) }
    case 'last_month':
      return { from: monthStartInZone(now, -1), to: monthStartInZone(now) }
    case 'quarter': {
      const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', month: 'numeric' }).format(now))
      return { from: monthStartInZone(now, -((month - 1) % 3)) }
    }
    case 'year': {
      const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', month: 'numeric' }).format(now))
      return { from: monthStartInZone(now, -(month - 1)) }
    }
    case 'last_12_months':
      return { from: monthStartInZone(now, -11) }
    default:
      return {}
  }
}

function within(column: Parameters<typeof gte>[0], range: { from?: Date; to?: Date }): SQL[] {
  return [...(range.from ? [gte(column, range.from)] : []), ...(range.to ? [lt(column, range.to)] : [])]
}

async function stats(ctx: ToolContext, metric: AgentToolArgs['get_stats']['metric'], period: Period) {
  const db = ctx.deps.db
  const orgId = ctx.auth.org.id
  const range = periodRange(period, ctx.deps.now())
  const base = [eq(quotes.orgId, orgId), isNull(quotes.deletedAt)]
  const currency = ctx.text.fmt.currency
  switch (metric) {
    case 'sales':
    case 'average_ticket': {
      const [row] = await db
        .select({ n: count(), total: sql<number>`coalesce(sum(${wonTotalSql}), 0)::bigint` })
        .from(quotes)
        .where(and(...base, inArray(quotes.status, WON), isNotNull(quotes.acceptedAt), ...within(quotes.acceptedAt, range)))
      const n = Number(row?.n ?? 0)
      const total = Number(row?.total ?? 0)
      return metric === 'sales' ? { accepted: n, total, currency } : { accepted: n, averageTicket: n ? Math.round(total / n) : 0, currency }
    }
    case 'pipeline': {
      const rows = await db
        .select({ status: quotes.status, n: count(), total: sql<number>`coalesce(sum(${committedTotalSql}), 0)::bigint` })
        .from(quotes)
        .where(and(...base, ...within(quotes.createdAt, range)))
        .groupBy(quotes.status)
      return { byStatus: Object.fromEntries(rows.map((r) => [r.status, { count: Number(r.n), total: Number(r.total) }])), currency }
    }
    case 'conversion': {
      const sent = await db
        .select({ status: quotes.status, n: count() })
        .from(quotes)
        .where(and(...base, isNotNull(quotes.sentAt), ...within(quotes.sentAt, range)))
        .groupBy(quotes.status)
      const totalSent = sent.reduce((n, r) => n + Number(r.n), 0)
      const won = sent.filter((r) => WON.includes(r.status)).reduce((n, r) => n + Number(r.n), 0)
      const rejected = sent.filter((r) => r.status === 'rejected').reduce((n, r) => n + Number(r.n), 0)
      return { sent: totalSent, accepted: won, rejected, pending: totalSent - won - rejected, conversionPct: totalSent ? Math.round((won / totalSent) * 1000) / 10 : 0 }
    }
    case 'quotes_created': {
      const [row] = await db
        .select({ n: count(), total: sql<number>`coalesce(sum(${quotes.total}), 0)::bigint` })
        .from(quotes)
        .where(and(...base, ...within(quotes.createdAt, range)))
      return { created: Number(row?.n ?? 0), totalQuoted: Number(row?.total ?? 0), currency }
    }
    case 'top_typologies': {
      const rows = await db
        .select({ data: quotes.data })
        .from(quotes)
        .where(and(...base, ...within(quotes.createdAt, range)))
        .limit(500)
      const counts = new Map<string, number>()
      for (const r of rows) {
        for (const item of r.data?.items ?? []) {
          const id = matchTypology(item.design as WindowDesign) ?? 'custom'
          counts.set(id, (counts.get(id) ?? 0) + (Number(item.qty) || 0))
        }
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      return { top: top.map(([id, units]) => ({ typology: id, name: id === 'custom' ? 'custom' : ctx.text.typology(id), units })), quotesAnalysed: rows.length }
    }
  }
}

const getStats: ToolHandler<'get_stats'> = async (ctx, args) => {
  const period = args.period ?? 'month'
  const range = periodRange(period, ctx.deps.now())
  const data = await stats(ctx, args.metric, period)
  return {
    ok: true,
    summary: ctx.text.t('done.get_stats'),
    data: { metric: args.metric, period, from: range.from?.toISOString(), to: range.to?.toISOString(), timeZone: 'America/Santiago', ...data },
  }
}

export const WORKSHOP_STATS_HANDLERS = {
  list_work_orders: listWorkOrders,
  get_work_order: getWorkOrder,
  update_work_order: updateWorkOrder,
  create_work_order: createWorkOrder,
  get_stats: getStats,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
