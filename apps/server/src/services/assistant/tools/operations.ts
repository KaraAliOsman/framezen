/**
 * Operaciones que un clic hace en la web y Marco también: estaciones del taller, documentos de una
 * OT, abonos, extras, datos comerciales de una línea, orden de las ventanas, papelera y actividad.
 * Todo pasa por las rutas fijas de routes-map.ts: mismos permisos, plan, versiones y actividad.
 */
import type { QuoteExtra } from '@dekopen/engine'
import type {
  ActivityEvent,
  AgentToolArgs,
  CatalogColorMutationResponse,
  CatalogColorsResponse,
  CatalogResponse,
  Client,
  DocTemplateRecord,
  ImportCsvResult,
  Paged,
  Quote,
  QuoteItem,
  QuotePaymentsResponse,
  Station,
  TextureAsset,
  WorkOrder,
} from '@dekopen/shared'
import { WORK_STATIONS } from '@dekopen/shared'
import { shortId } from '../../../lib/crypto'
import { fabricatedItems } from '../../../routes/work-orders'
import { resolveItems, resolveLine } from '../resolve'
import { ensureOk, loadQuote, loadQuoteFor, quoteNo, quoteUndo, refsLabel, resolveQuoteId, saveQuote, totalsForModel, type QuotePatch } from './common'
import { ToolFailure, type AgentUndo, type ToolContext, type ToolHandler } from './types'

// ── Taller ───────────────────────────────────────────────────────────────

type OrderWithQuote = WorkOrder & { quote?: Quote }

/** Ventanas que se fabrican en la OT, con su estación («corte» si aún no tienen avance). */
export function orderWindows(order: OrderWithQuote): { ref: string; qty: number; station: Station }[] {
  const list = order.quote ? fabricatedItems(order.quote.items) : Object.keys(order.progress).map((ref) => ({ ref, qty: 1 }))
  return list.map((item) => ({ ref: item.ref, qty: item.qty, station: order.progress[item.ref] ?? 'cut' }))
}

export function stationCounts(stations: readonly Station[]): Partial<Record<Station, number>> {
  const counts: Partial<Record<Station, number>> = {}
  for (const station of WORK_STATIONS) {
    const n = stations.filter((s) => s === station).length
    if (n) counts[station] = n
  }
  return counts
}

const orderById = async (ctx: ToolContext, id: string) => ensureOk(await ctx.call<OrderWithQuote>('workOrderGet', { params: { id } }))

async function orderIdFrom(ctx: ToolContext, args: { workOrderId?: string; number?: number }): Promise<string | undefined> {
  if (args.workOrderId) return args.workOrderId
  if (args.number === undefined) return ctx.ui.workOrderId
  const list = ensureOk(await ctx.call<Paged<WorkOrder>>('workOrdersList', { query: { limit: 200 } })).items
  const found = list.find((w) => w.number === args.number)
  if (!found) throw new ToolFailure('not_found', `Work order ${args.number} does not exist in this account.`)
  return found.id
}

async function requireOrder(ctx: ToolContext, args: { workOrderId?: string; number?: number }): Promise<OrderWithQuote> {
  const id = await orderIdFrom(ctx, args)
  if (id) return orderById(ctx, id)
  const list = ensureOk(await ctx.call<Paged<WorkOrder>>('workOrdersList', { query: { status: ['open', 'in_progress'], limit: 2 } })).items
  if (list.length === 1) return orderById(ctx, list[0]!.id)
  throw new ToolFailure('no_work_order', 'Say which work order: list_work_orders shows them.')
}

/** Órdenes que toca el movimiento: la nombrada, la de la pantalla o todas las activas. */
async function ordersToMove(ctx: ToolContext, args: AgentToolArgs['move_windows_to_station']): Promise<OrderWithQuote[]> {
  const named = args.workOrderId !== undefined || args.number !== undefined
  if (named) return [await requireOrder(ctx, args)]
  if (!args.all_orders && ctx.ui.workOrderId) return [await orderById(ctx, ctx.ui.workOrderId)]
  if (!args.all_orders && !args.from_station) throw new ToolFailure('no_work_order', 'Say which work order, set from_station or use all_orders.')
  const list = ensureOk(await ctx.call<Paged<WorkOrder>>('workOrdersList', { query: { status: ['open', 'in_progress'], limit: 200 } })).items
  return Promise.all(list.map((order) => orderById(ctx, order.id)))
}

interface OrderMove {
  order: OrderWithQuote
  refs: string[]
  previous: Record<string, Station>
}

function planMoves(orders: readonly OrderWithQuote[], args: AgentToolArgs['move_windows_to_station']): { moves: OrderMove[]; missing: string[] } {
  const wanted = args.refs?.length ? new Set(args.refs.map((r) => r.toUpperCase())) : null
  const seen = new Set<string>()
  const moves: OrderMove[] = []
  for (const order of orders) {
    const previous: Record<string, Station> = {}
    for (const window of orderWindows(order)) {
      if (wanted && !wanted.has(window.ref.toUpperCase())) continue
      seen.add(window.ref.toUpperCase())
      if (args.from_station && window.station !== args.from_station) continue
      if (window.station === args.to_station) continue
      previous[window.ref] = window.station
    }
    const refs = Object.keys(previous)
    if (refs.length) moves.push({ order, refs, previous })
  }
  return { moves, missing: wanted ? [...wanted].filter((ref) => !seen.has(ref)) : [] }
}

const moveWindowsToStation: ToolHandler<'move_windows_to_station'> = async (ctx, args) => {
  const t = ctx.text
  const orders = await ordersToMove(ctx, args)
  const { moves, missing } = planMoves(orders, args)
  if (missing.length) throw new ToolFailure('not_found', `Window ${missing.join(', ')} is not in this work order.`)
  const station = t.station(args.to_station)
  const count = moves.reduce((n, m) => n + m.refs.length, 0)
  if (!count) {
    const where = orders.flatMap((order) => orderWindows(order).map((w) => w.station))
    return { ok: true, summary: t.t('done.move_windows_none'), data: { moved: 0, ordersChecked: orders.length, windowsByStation: stationCounts(where) } }
  }
  if (ctx.dryRun) {
    const title = t.t('propose.move_windows_to_station', { count, station })
    return {
      ok: true,
      summary: title,
      preview: { title, lines: moves.slice(0, 12).map((m) => `${t.t('field.workOrder', { number: String(m.order.number) })}: ${t.list(m.refs)}`) },
      affected: moves.map((m) => ({ type: 'work_order' as const, id: m.order.id })),
    }
  }
  const undoSteps: AgentUndo['then'] = []
  for (const move of moves) {
    ensureOk(await ctx.call<WorkOrder>('workOrderPatch', { params: { id: move.order.id }, body: { progress: Object.fromEntries(move.refs.map((ref) => [ref, args.to_station])) } }))
  }
  const checksOf = (move: OrderMove) => move.refs.map((ref) => ({ path: ['progress', ref], value: args.to_station }))
  for (const move of moves.slice(1)) {
    undoSteps.push({
      route: 'workOrderPatch',
      params: { id: move.order.id },
      body: { progress: move.previous },
      onlyIf: { route: 'workOrderGet', params: { id: move.order.id }, checks: checksOf(move) },
    })
  }
  const first = moves[0]!
  return {
    ok: true,
    summary: t.t('done.move_windows_to_station', { count, station }),
    data: { moved: count, station: args.to_station, orders: moves.map((m) => ({ number: m.order.number, client: m.order.clientName, windows: m.refs })) },
    affected: moves.map((m) => ({ type: 'work_order' as const, id: m.order.id })),
    undo: {
      method: 'PATCH',
      path: `/api/work-orders/${encodeURIComponent(first.order.id)}`,
      route: 'workOrderPatch',
      params: { id: first.order.id },
      body: { progress: first.previous },
      entity: { type: 'work_order', id: first.order.id },
      expect: { route: 'workOrderGet', params: { id: first.order.id }, checks: checksOf(first) },
      ...(undoSteps.length ? { then: undoSteps } : {}),
    },
  }
}

const openWorkOrder: ToolHandler<'open_work_order'> = async (ctx, args) => {
  const order = await requireOrder(ctx, args)
  return {
    ok: true,
    summary: ctx.text.t('done.open_work_order', { number: String(order.number) }),
    data: { id: order.id, number: order.number },
    ui: [{ kind: 'open_work_order', workOrderId: order.id, ...(args.tab ? { tab: args.tab } : {}) }],
  }
}

const exportWorkOrderDoc: ToolHandler<'export_work_order_doc'> = async (ctx, args) => {
  const order = await requireOrder(ctx, args)
  return {
    ok: true,
    summary: ctx.text.t('done.export_work_order_doc', { number: String(order.number) }),
    data: { id: order.id, number: order.number, doc: args.doc },
    ui: [{ kind: 'download_work_order_doc', workOrderId: order.id, doc: args.doc, number: order.number }],
  }
}

// ── Cotización: papelera, versiones, abonos ──────────────────────────────

const restoreQuote: ToolHandler<'restore_quote'> = async (ctx, args) => {
  const id = (await resolveQuoteId(ctx, args))!
  const trashed = args.quoteNumber ? ensureOk(await ctx.call<Paged<{ id: string; number: number }>>('quotesList', { query: { deleted: 1, q: String(args.quoteNumber), limit: 5 } })).items.find((q) => q.number === args.quoteNumber) : undefined
  const targetId = trashed?.id ?? id
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.restore_quote', { id: args.quoteNumber ? String(args.quoteNumber) : targetId })
    return { ok: true, summary: title, preview: { title, lines: [] }, affected: [{ type: 'quote', id: targetId }] }
  }
  const quote = ensureOk(await ctx.call<Quote>('quoteRestore', { params: { id: targetId } }))
  return {
    ok: true,
    summary: ctx.text.t('done.restore_quote', { number: quoteNo(ctx, quote) }),
    data: { id: quote.id, number: quote.number },
    affected: [{ type: 'quote', id: quote.id }],
    undo: { method: 'DELETE', path: `/api/quotes/${quote.id}`, route: 'quoteDelete', params: { id: quote.id }, entity: { type: 'quote', id: quote.id } },
  }
}

const getQuoteVersions: ToolHandler<'get_quote_versions'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const res = ensureOk(await ctx.call<Paged<{ revision: number; sentAt: string; viewedAt?: string; sentBy?: string }>>('quoteRevisions', { params: { id: quote.id } }))
  return { ok: true, summary: ctx.text.t('done.get_quote_versions', { number: quoteNo(ctx, quote) }), data: { quoteId: quote.id, current: quote.revision, versions: res.items } }
}

const getQuotePayments: ToolHandler<'get_quote_payments'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const res = ensureOk(await ctx.call<QuotePaymentsResponse>('quotePayments', { params: { id: quote.id } }))
  return { ok: true, summary: ctx.text.t('done.get_quote_payments', { number: quoteNo(ctx, quote) }), data: { quoteId: quote.id, ...res, currency: ctx.text.fmt.currency } }
}

const recordQuotePayment: ToolHandler<'record_quote_payment'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const t = ctx.text
  const number = quoteNo(ctx, quote)
  if (ctx.dryRun) {
    const title = t.t('propose.record_quote_payment', { number })
    return { ok: true, summary: title, preview: { title, lines: [t.fmt.money(args.amount), ...(args.reference ? [args.reference] : [])] }, affected: [{ type: 'quote', id: quote.id }] }
  }
  const res = ensureOk(
    await ctx.call<QuotePaymentsResponse>('quotePaymentAdd', {
      params: { id: quote.id },
      body: { amount: args.amount, method: args.method, ...(args.reference ? { reference: args.reference } : {}), ...(args.paid_on ? { paidAt: `${args.paid_on}T12:00:00.000Z` } : {}) },
    }),
  )
  return { ok: true, summary: t.t('done.record_quote_payment', { number }), data: { received: res.received, due: res.due, currency: t.fmt.currency }, affected: [{ type: 'quote', id: quote.id }] }
}

const removeQuotePayment: ToolHandler<'remove_quote_payment'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const t = ctx.text
  const number = quoteNo(ctx, quote)
  const current = ensureOk(await ctx.call<QuotePaymentsResponse>('quotePayments', { params: { id: quote.id } }))
  const payment = current.payments.find((p) => p.id === args.paymentId)
  if (!payment) throw new ToolFailure('not_found', 'That payment is not on this quote: read them again.')
  if (ctx.dryRun) {
    const title = t.t('propose.remove_quote_payment', { number })
    return { ok: true, summary: title, preview: { title, lines: [t.fmt.money(payment.amount)] }, affected: [{ type: 'quote', id: quote.id }] }
  }
  const res = ensureOk(await ctx.call<QuotePaymentsResponse>('quotePaymentDelete', { params: { id: quote.id, paymentId: payment.id } }))
  return { ok: true, summary: t.t('done.remove_quote_payment', { number }), data: { received: res.received, due: res.due, currency: t.fmt.currency }, affected: [{ type: 'quote', id: quote.id }] }
}

// ── Cotización: extras, línea comercial y orden ──────────────────────────

function nextExtras(current: readonly QuoteExtra[], args: AgentToolArgs['set_quote_extras']): QuoteExtra[] {
  const removed = new Set(args.remove ?? [])
  const known = new Set(current.map((e) => e.id))
  const unknown = [...(args.change ?? []).map((c) => c.id), ...removed].filter((id) => !known.has(id))
  if (unknown.length) throw new ToolFailure('not_found', `Extra ${unknown.join(', ')} is not on this quote: read it with get_quote.`)
  const changes = new Map((args.change ?? []).map((c) => [c.id, c]))
  const kept = current
    .filter((e) => !removed.has(e.id))
    .map((e) => {
      const change = changes.get(e.id)
      if (!change) return e
      const { id: _id, ...fields } = change
      return { ...e, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) }
    })
  const added = (args.add ?? []).map((e) => ({ id: shortId(), label: e.label, amount: e.amount, line: !e.hidden, ...(e.hidden ? { hidden: true } : {}), ...(e.description ? { description: e.description } : {}) }))
  return [...kept, ...added] as QuoteExtra[]
}

const setQuoteExtras: ToolHandler<'set_quote_extras'> = async (ctx, args) => {
  if (!args.add?.length && !args.change?.length && !args.remove?.length) throw new ToolFailure('invalid_args', 'Say what to add, change or remove.')
  const quote = await loadQuoteFor(ctx, args)
  const t = ctx.text
  const number = quoteNo(ctx, quote)
  const extras = nextExtras(quote.extras, args)
  if (ctx.dryRun) {
    const title = t.t('propose.set_quote_extras', { number })
    return { ok: true, summary: title, preview: { title, lines: extras.slice(0, 12).map((e) => `${e.label}: ${t.fmt.money(e.amount)}`) }, affected: [{ type: 'quote', id: quote.id, version: quote.version }] }
  }
  const { before, after } = await saveQuote(ctx, quote, { extras }, (fresh) => ({ extras: nextExtras(fresh.extras, args) }))
  ctx.memo.quoteId = after.id
  return {
    ok: true,
    summary: t.t('done.set_quote_extras', { number }),
    data: { extras: after.extras.map((e) => ({ id: e.id, label: e.label, amount: e.amount })), totals: totalsForModel(ctx, after.totals) },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    undo: quoteUndo(before, after),
  }
}

function applyLineFields(item: QuoteItem, args: AgentToolArgs['update_window_line']): QuoteItem {
  const next: QuoteItem = { ...item }
  if (args.new_ref !== undefined) next.ref = args.new_ref
  if (args.manual_unit_price === null) delete next.manualUnitPrice
  else if (args.manual_unit_price !== undefined) next.manualUnitPrice = args.manual_unit_price
  if (args.discount_pct !== undefined) {
    if (args.discount_pct === 0) delete next.discountPct
    else next.discountPct = args.discount_pct
  }
  if (args.role !== undefined) next.role = args.role
  if (args.alt_group !== undefined) next.altGroup = args.alt_group || undefined
  if (args.included !== undefined) next.included = args.included
  if (args.floor !== undefined) next.floor = args.floor || undefined
  if (args.notes !== undefined) next.notes = args.notes || undefined
  if (args.opening_width !== undefined || args.opening_height !== undefined) {
    next.rough = { ...item.rough, ...(args.opening_width !== undefined ? { width: args.opening_width } : {}), ...(args.opening_height !== undefined ? { height: args.opening_height } : {}) }
  }
  return next
}

const updateWindowLine: ToolHandler<'update_window_line'> = async (ctx, args) => {
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { items, missing } = resolveItems(quote, args, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  if (!items.length) throw new ToolFailure('not_found', `Window ${missing.join(', ')} not found in this quote.`.trim())
  if (args.new_ref !== undefined) {
    if (items.length > 1) throw new ToolFailure('invalid_args', 'A new reference applies to one window.')
    if (quote.items.some((i) => i.ref === args.new_ref && i.id !== items[0]!.id)) throw new ToolFailure('invalid_args', `${args.new_ref} is already used in this quote.`)
  }
  const refs = refsLabel(ctx, items, quote.items.length)
  const ids = new Set(items.map((i) => i.id))
  const apply = (list: readonly QuoteItem[]) => list.map((i) => (ids.has(i.id) ? applyLineFields(i, args) : i))
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.update_window_line', { refs, number: quoteNo(ctx, quote) })
    return { ok: true, summary: title, preview: { title, lines: [] }, affected: [{ type: 'quote', id: quote.id, version: quote.version }] }
  }
  const { before, after } = await saveQuote(ctx, quote, { items: apply(quote.items) }, (fresh) => ({ items: apply(fresh.items) }))
  ctx.memo.quoteId = after.id
  return {
    ok: true,
    summary: ctx.text.t('done.update_window_line', { refs }),
    data: { changed: items.map((i) => i.ref), totals: totalsForModel(ctx, after.totals) },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    undo: quoteUndo(before, after),
  }
}

function reordered(items: readonly QuoteItem[], order: readonly string[]): QuoteItem[] {
  const byRef = new Map(items.map((i) => [i.ref.toUpperCase(), i]))
  const first: QuoteItem[] = []
  for (const ref of order) {
    const item = byRef.get(ref.toUpperCase())
    if (!item) throw new ToolFailure('not_found', `Window ${ref} is not in this quote.`)
    if (!first.includes(item)) first.push(item)
  }
  return [...first, ...items.filter((i) => !first.includes(i))]
}

const reorderWindows: ToolHandler<'reorder_windows'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const number = quoteNo(ctx, quote)
  const items = reordered(quote.items, args.order)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.reorder_windows', { number })
    return { ok: true, summary: title, preview: { title, lines: [items.map((i) => i.ref).join(' · ')] }, affected: [{ type: 'quote', id: quote.id, version: quote.version }] }
  }
  const patch: QuotePatch = { items }
  const { before, after } = await saveQuote(ctx, quote, patch, (fresh) => ({ items: reordered(fresh.items, args.order) }))
  ctx.memo.quoteId = after.id
  return { ok: true, summary: ctx.text.t('done.reorder_windows', { number }), data: { order: after.items.map((i) => i.ref) }, affected: [{ type: 'quote', id: after.id, version: after.version }], undo: quoteUndo(before, after) }
}

// ── Clientes ─────────────────────────────────────────────────────────────

const listClients: ToolHandler<'list_clients'> = async (ctx, args) => {
  const res = ensureOk(await ctx.call<Paged<Client>>('clientsList', { query: { q: args.query, limit: args.limit ?? 30 } }))
  return {
    ok: true,
    summary: ctx.text.t('done.list_clients', { count: res.total }),
    data: { total: res.total, clients: res.items.map((c) => ({ id: c.id, name: c.name, city: c.city, quotesCount: c.quotesCount, totalAccepted: c.totalAccepted })) },
  }
}

const restoreClient: ToolHandler<'restore_client'> = async (ctx, args) => {
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.restore_client')
    return { ok: true, summary: title, preview: { title, lines: [] }, affected: [{ type: 'client', id: args.clientId }] }
  }
  const client = ensureOk(await ctx.call<Client>('clientRestore', { params: { id: args.clientId } }))
  return {
    ok: true,
    summary: ctx.text.t('done.restore_client', { name: client.name }),
    data: { id: client.id, name: client.name },
    affected: [{ type: 'client', id: client.id }],
    undo: { method: 'DELETE', path: `/api/clients/${client.id}`, route: 'clientDelete', params: { id: client.id }, entity: { type: 'client', id: client.id } },
  }
}

// ── Catálogo ─────────────────────────────────────────────────────────────

async function customColor(ctx: ToolContext, id: string) {
  const color = ensureOk(await ctx.call<CatalogColorsResponse>('customColorsList')).items.find((c) => c.id === id)
  if (!color) throw new ToolFailure('not_found', `Colour ${id} is not an own colour of this company.`)
  return color
}

const updateCustomColor: ToolHandler<'update_custom_color'> = async (ctx, args) => {
  const color = await customColor(ctx, args.colorId)
  let lineIds: string[] | undefined
  if (args.lines) {
    const catalog = ensureOk(await ctx.call<CatalogResponse>('catalogGet'))
    const found = args.lines.map((name) => resolveLine(catalog as never, name))
    const unknown = args.lines.filter((_, i) => !found[i]!.line || found[i]!.missed)
    if (unknown.length) throw new ToolFailure('not_found', `Line ${unknown.join(', ')} not found.`)
    lineIds = found.map((f) => f.line!.id)
  }
  const body = {
    ...(args.name ? { name: args.name } : {}),
    ...(args.hex ? { hex: args.hex.toUpperCase() } : {}),
    ...(args.code !== undefined ? { code: args.code || null } : {}),
    ...(args.price_factor !== undefined ? { priceFactor: args.price_factor } : {}),
    ...(lineIds ? { lineIds } : {}),
  }
  if (!Object.keys(body).length) throw new ToolFailure('invalid_args', 'Say what to change.')
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.update_custom_color', { name: color.name })
    return { ok: true, summary: title, preview: { title, lines: [] }, affected: [{ type: 'catalog' }] }
  }
  const after = ensureOk(await ctx.call<CatalogColorMutationResponse>('customColorPatch', { params: { id: color.id }, body }))
  return { ok: true, summary: ctx.text.t('done.update_custom_color', { name: after.color.name }), data: { id: color.id, name: after.color.name }, affected: [{ type: 'catalog' }] }
}

const deleteCustomColor: ToolHandler<'delete_custom_color'> = async (ctx, args) => {
  const color = await customColor(ctx, args.colorId)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.delete_custom_color', { name: color.name })
    return { ok: true, summary: title, preview: { title, lines: [color.name], irreversible: ctx.text.t('irreversible.trash') } }
  }
  ensureOk(await ctx.call('customColorDelete', { params: { id: color.id } }))
  return {
    ok: true,
    summary: ctx.text.t('done.delete_custom_color', { name: color.name }),
    data: { id: color.id, restorable: true },
    affected: [{ type: 'catalog' }],
    undo: { method: 'POST', path: `/api/catalog/colors/${color.id}/restore`, route: 'customColorRestore', params: { id: color.id }, entity: { type: 'catalog' } },
  }
}

const restoreCustomColor: ToolHandler<'restore_custom_color'> = async (ctx, args) => {
  const color = await customColor(ctx, args.colorId)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.restore_custom_color', { name: color.name })
    return { ok: true, summary: title, preview: { title, lines: [color.name] } }
  }
  ensureOk(await ctx.call('customColorRestore', { params: { id: color.id } }))
  return {
    ok: true,
    summary: ctx.text.t('done.restore_custom_color', { name: color.name }),
    data: { id: color.id },
    affected: [{ type: 'catalog' }],
    undo: { method: 'DELETE', path: `/api/catalog/colors/${color.id}`, route: 'customColorDelete', params: { id: color.id }, entity: { type: 'catalog' } },
  }
}

const deleteTexture: ToolHandler<'delete_texture'> = async (ctx, args) => {
  const texture = ensureOk(await ctx.call<TextureAsset>('textureGet', { params: { id: args.textureId } }))
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.delete_texture', { name: texture.name })
    return { ok: true, summary: title, preview: { title, lines: [texture.name], irreversible: ctx.text.t('irreversible.trash') } }
  }
  ensureOk(await ctx.call('textureDelete', { params: { id: texture.id } }))
  return {
    ok: true,
    summary: ctx.text.t('done.delete_texture', { name: texture.name }),
    data: { id: texture.id, restorable: true },
    affected: [{ type: 'texture', id: texture.id }],
    undo: { method: 'POST', path: `/api/textures/${texture.id}/restore`, route: 'textureRestore', params: { id: texture.id }, entity: { type: 'texture', id: texture.id } },
  }
}

const restoreTexture: ToolHandler<'restore_texture'> = async (ctx, args) => {
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.restore_texture')
    return { ok: true, summary: title, preview: { title, lines: [] } }
  }
  const texture = ensureOk(await ctx.call<TextureAsset>('textureRestore', { params: { id: args.textureId } }))
  return {
    ok: true,
    summary: ctx.text.t('done.restore_texture', { name: texture.name }),
    data: { id: texture.id },
    affected: [{ type: 'texture', id: texture.id }],
    undo: { method: 'DELETE', path: `/api/textures/${texture.id}`, route: 'textureDelete', params: { id: texture.id }, entity: { type: 'texture', id: texture.id } },
  }
}

const updateGlassMinimum: ToolHandler<'update_glass_minimum'> = async (ctx, args) => {
  const catalog = ensureOk(await ctx.call<CatalogResponse>('catalogGet')) as unknown as { glass: { id: string; name: string; minArea?: number }[] }
  const glass = catalog.glass.find((g) => g.id === args.glassId)
  if (!glass) throw new ToolFailure('not_found', `Glass ${args.glassId} not found: read it with get_catalog.`)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.update_glass_minimum', { name: glass.name })
    return { ok: true, summary: title, preview: { title, lines: [], changes: [{ field: 'minArea', label: glass.name, before: String(glass.minArea ?? '—'), after: String(args.min_area ?? '—') }] }, affected: [{ type: 'catalog' }] }
  }
  ensureOk(await ctx.call('glassPatch', { params: { id: glass.id }, body: { minArea: args.min_area } }))
  return { ok: true, summary: ctx.text.t('done.update_glass_minimum', { name: glass.name }), data: { id: glass.id, minArea: args.min_area }, affected: [{ type: 'catalog' }] }
}

const importPricesCsv: ToolHandler<'import_prices_csv'> = async (ctx, args) => {
  let brandId: string | undefined
  if (args.brand) {
    const catalog = ensureOk(await ctx.call<CatalogResponse>('catalogGet')) as unknown as { brands?: { id: string; name: string }[] }
    brandId = catalog.brands?.find((b) => b.name.toLocaleLowerCase() === args.brand!.toLocaleLowerCase())?.id
    if (!brandId) throw new ToolFailure('not_found', `Brand "${args.brand}" not found.`)
  }
  const body = { csv: args.csv, ...(brandId ? { brandId } : {}) }
  const check = ensureOk(await ctx.call<ImportCsvResult>('pricesImportCsv', { body: { ...body, dryRun: true } }))
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.import_prices_csv', { count: check.matched })
    return { ok: true, summary: title, preview: { title, lines: [check.message], irreversible: ctx.text.t('irreversible.prices') }, affected: [{ type: 'catalog' }] }
  }
  const result = ensureOk(await ctx.call<ImportCsvResult>('pricesImportCsv', { body }))
  return {
    ok: true,
    summary: ctx.text.t('done.import_prices_csv', { count: result.matched }),
    data: { matched: result.matched, unmatched: result.unmatched, skipped: result.skipped, unmatchedSample: result.unmatchedSample, brands: result.brands },
    affected: [{ type: 'catalog' }],
  }
}

const downloadCatalogPdf: ToolHandler<'download_catalog_pdf'> = async (ctx, args) => {
  let lineIds: string[] | undefined
  if (args.lines?.length) {
    const catalog = ensureOk(await ctx.call<CatalogResponse>('catalogGet'))
    const found = args.lines.map((name) => resolveLine(catalog as never, name))
    const unknown = args.lines.filter((_, i) => !found[i]!.line || found[i]!.missed)
    if (unknown.length) throw new ToolFailure('not_found', `Line ${unknown.join(', ')} not found.`)
    lineIds = found.map((f) => f.line!.id)
  }
  return {
    ok: true,
    summary: ctx.text.t('done.download_catalog_pdf'),
    data: { lines: args.lines ?? 'all' },
    ui: [{ kind: 'download_catalog_pdf', ...(lineIds ? { lineIds } : {}), ...(args.title ? { title: args.title } : {}) }],
  }
}

// ── Plantillas ───────────────────────────────────────────────────────────

const deleteTemplate: ToolHandler<'delete_template'> = async (ctx, args) => {
  const record = ensureOk(await ctx.call<DocTemplateRecord>('templateGet', { params: { id: args.templateId } }))
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.delete_template', { name: record.name })
    return { ok: true, summary: title, preview: { title, lines: [record.name], irreversible: ctx.text.t('irreversible.trash') }, affected: [{ type: 'template', id: record.id }] }
  }
  ensureOk(await ctx.call('templateDelete', { params: { id: record.id } }))
  return {
    ok: true,
    summary: ctx.text.t('done.delete_template', { name: record.name }),
    data: { id: record.id, restorable: true },
    affected: [{ type: 'template', id: record.id }],
    undo: { method: 'POST', path: `/api/templates/${record.id}/restore`, route: 'templateRestore', params: { id: record.id }, entity: { type: 'template', id: record.id } },
  }
}

const restoreTemplate: ToolHandler<'restore_template'> = async (ctx, args) => {
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.restore_template')
    return { ok: true, summary: title, preview: { title, lines: [] }, affected: [{ type: 'template', id: args.templateId }] }
  }
  const record = ensureOk(await ctx.call<DocTemplateRecord>('templateRestore', { params: { id: args.templateId } }))
  return {
    ok: true,
    summary: ctx.text.t('done.restore_template', { name: record.name }),
    data: { id: record.id },
    affected: [{ type: 'template', id: record.id }],
    undo: { method: 'DELETE', path: `/api/templates/${record.id}`, route: 'templateDelete', params: { id: record.id }, entity: { type: 'template', id: record.id } },
  }
}

// ── Actividad ────────────────────────────────────────────────────────────

const getActivity: ToolHandler<'get_activity'> = async (ctx, args) => {
  const res = ensureOk(await ctx.call<Paged<ActivityEvent>>('activityList', { query: { pending: args.pending ? 1 : undefined, subjectId: args.subjectId, limit: args.limit ?? 20 } }))
  return { ok: true, summary: ctx.text.t('done.get_activity'), data: { total: res.total, events: res.items.map((e) => ({ id: e.id, at: e.at, actor: e.actor, kind: e.kind, text: e.text })) } }
}

const resolveActivity: ToolHandler<'resolve_activity'> = async (ctx, args) => {
  const pending = args.pending ?? false
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.resolve_activity')
    return { ok: true, summary: title, preview: { title, lines: [] } }
  }
  ensureOk(await ctx.call('activityPatch', { params: { id: args.activityId }, body: { pending } }))
  return {
    ok: true,
    summary: ctx.text.t('done.resolve_activity'),
    data: { id: args.activityId, pending },
    undo: { method: 'PATCH', path: `/api/activity/${args.activityId}`, route: 'activityPatch', params: { id: args.activityId }, body: { pending: !pending }, entity: { type: 'org' } },
  }
}

export const OPERATION_HANDLERS = {
  move_windows_to_station: moveWindowsToStation,
  open_work_order: openWorkOrder,
  export_work_order_doc: exportWorkOrderDoc,
  restore_quote: restoreQuote,
  get_quote_versions: getQuoteVersions,
  get_quote_payments: getQuotePayments,
  record_quote_payment: recordQuotePayment,
  remove_quote_payment: removeQuotePayment,
  set_quote_extras: setQuoteExtras,
  update_window_line: updateWindowLine,
  reorder_windows: reorderWindows,
  list_clients: listClients,
  restore_client: restoreClient,
  update_custom_color: updateCustomColor,
  delete_custom_color: deleteCustomColor,
  restore_custom_color: restoreCustomColor,
  delete_texture: deleteTexture,
  restore_texture: restoreTexture,
  update_glass_minimum: updateGlassMinimum,
  import_prices_csv: importPricesCsv,
  download_catalog_pdf: downloadCatalogPdf,
  delete_template: deleteTemplate,
  restore_template: restoreTemplate,
  get_activity: getActivity,
  resolve_activity: resolveActivity,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
