/**
 * Herramientas de cotizaciones: listar, leer, abrir, crear (con ventanas), cambiar cabecera,
 * duplicar, papelera, estado, enviar y enlace público. Toda escritura pasa por /api/quotes.
 */
import { MARGIN_LIMITS } from '@dekopen/shared'
import {
  applyDocOps,
  migrateQuoteDocOverrides,
  type AgentToolArgs,
  type Client,
  type Paged,
  type Quote,
  type QuoteSummary,
  type SendFormat,
  type SendQuoteResponse,
  type ToolPreview,
} from '@dekopen/shared'
import type { QuoteData } from '../../../db/schema'
import { canSeeMargins } from '../../access'
import { priceQuote } from '../../quotes'
import { getSettings } from '../../settings'
import { buildWindowDesign, rejectMisses } from '../design'
import { ensureOk, designEnv, loadQuote, loadQuoteFor, quoteForModel, quoteNo, quotePendingForModel, quoteUndo, resolveQuoteId, saveQuote, totalsForModel, type QuotePatch } from './common'
import { quoteBaseTemplate } from './documents-base'
import { ToolFailure, type AgentUndo, type ToolContext, type ToolHandler, type ToolOutcome } from './types'

/** Totales del motor para un documento hipotético (vista previa; no guarda nada). */
export async function previewTotals(ctx: ToolContext, data: QuoteData) {
  const settings = await getSettings(ctx.deps.db, ctx.auth.org.id)
  const evaluation = await priceQuote(ctx.deps.catalogs, ctx.auth.org.id, settings, data, ctx.deps.logger)
  return evaluation?.totals
}

const dataOf = (quote: Quote, patch: Partial<QuoteData> = {}): QuoteData => ({
  items: quote.items,
  extras: quote.extras,
  discountPct: quote.discountPct ?? 0,
  ...(quote.pricing ? { pricing: quote.pricing } : {}),
  ...patch,
})

/**
 * Al deshacer, el cliente creado junto con la cotización se retira solo si nadie lo editó ni lo
 * usa en otra cotización (si no, se conserva: borrarlo pisaría el trabajo de otra persona).
 */
function createdClientCleanup(client: Pick<Client, 'id'> & Partial<Pick<Client, 'updatedAt'>>): NonNullable<AgentUndo['then']>[number] {
  return {
    route: 'clientDelete',
    params: { id: client.id },
    onlyIf: {
      route: 'clientGet',
      params: { id: client.id },
      checks: [{ path: ['quotesCount'], value: 0 }, ...(client.updatedAt ? [{ path: ['updatedAt'], value: client.updatedAt }] : [])],
    },
  }
}

/** Cliente por id o por nombre: lo encuentra o (fuera de la vista previa) lo crea. */
export async function findOrCreateClient(
  ctx: ToolContext,
  input: { clientId?: string; name?: string; email?: string; phone?: string; rut?: string },
): Promise<{ client: (Pick<Client, 'id' | 'name'> & Partial<Pick<Client, 'updatedAt'>>) | null; created: boolean; name: string }> {
  if (input.clientId) {
    const client = ensureOk(await ctx.call<Client>('clientGet', { params: { id: input.clientId } }))
    return { client, created: false, name: client.name }
  }
  const name = (input.name ?? '').trim()
  if (!name) throw new ToolFailure('invalid', 'Client name is empty.')
  const list = ensureOk(await ctx.call<Paged<Client>>('clientsList', { query: { q: name, limit: 10 } })).items
  const wanted = name.toLocaleLowerCase()
  const exact = list.find((c) => c.name.trim().toLocaleLowerCase() === wanted)
  if (exact) return { client: exact, created: false, name: exact.name }
  if (list.length === 1) return { client: list[0]!, created: false, name: list[0]!.name }
  if (ctx.dryRun) return { client: null, created: true, name }
  const created = ensureOk(
    await ctx.call<Client>('clientCreate', {
      body: { name, ...(input.email ? { email: input.email } : {}), ...(input.phone ? { phone: input.phone } : {}), ...(input.rut ? { rut: input.rut } : {}) },
    }),
  )
  return { client: created, created: true, name: created.name }
}

const listQuotes: ToolHandler<'list_quotes'> = async (ctx, args) => {
  const res = ensureOk(
    await ctx.call<Paged<QuoteSummary>>('quotesList', {
      query: { q: args.query, status: args.status, clientId: args.clientId, deleted: args.deleted ? 1 : undefined, limit: args.limit ?? 20 },
    }),
  )
  return {
    ok: true,
    summary: ctx.text.t('done.list_quotes', { count: res.total }),
    data: {
      total: res.total,
      quotes: res.items.map((q) => ({ id: q.id, number: q.number, title: q.title || undefined, client: q.clientName, status: q.status, total: q.total, units: q.units, updatedAt: q.updatedAt })),
    },
  }
}

const getQuote: ToolHandler<'get_quote'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const { catalog } = await ctx.deps.catalogs.effective(ctx.auth.org.id, { onlyEnabled: false })
  return { ok: true, summary: ctx.text.t('done.get_quote', { number: quoteNo(ctx, quote) }), data: { ...quoteForModel(ctx, quote, catalog), pending: await quotePendingForModel(ctx, quote) } }
}

const openQuote: ToolHandler<'open_quote'> = async (ctx, args) => {
  let id = args.quoteId || (args.quoteNumber ? await resolveQuoteId(ctx, args) : undefined)
  if (!id && args.query) {
    const found = ensureOk(await ctx.call<Paged<QuoteSummary>>('quotesList', { query: { q: args.query, limit: 5 } })).items
    if (!found.length) throw new ToolFailure('not_found', `No quote matches "${args.query}".`)
    id = found[0]!.id
  }
  id ??= await resolveQuoteId(ctx, {})
  const quote = await loadQuote(ctx, id!)
  ctx.memo.quoteId = quote.id
  return {
    ok: true,
    summary: ctx.text.t('done.open_quote', { number: quoteNo(ctx, quote) }),
    data: { id: quote.id, number: quote.number, title: quote.title || undefined, status: quote.status, items: quote.items.length },
    ui: [{ kind: 'open_quote', quoteId: quote.id }],
  }
}

const createQuote: ToolHandler<'create_quote'> = async (ctx, args) => {
  const env = await designEnv(ctx)
  const notes: string[] = []
  const items = (args.items ?? []).map((input) => {
    const built = buildWindowDesign(env, input, [])
    rejectMisses(env, built.misses)
    notes.push(...built.notes)
    return {
      ref: '',
      qty: input.qty ?? 1,
      design: built.design,
      ...(input.location ? { location: input.location } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    }
  })
  const clientRes = args.clientId || args.client ? await findOrCreateClient(ctx, { clientId: args.clientId, name: args.client }) : null
  const body = {
    ...(args.title ? { title: args.title } : {}),
    ...(clientRes?.client ? { clientId: clientRes.client.id } : {}),
    ...(items.length ? { items } : {}),
    ...(args.discount !== undefined ? { discountPct: args.discount } : {}),
  }
  if (ctx.dryRun) {
    const totals = items.length ? await previewTotals(ctx, { items: items.map((i, n) => ({ id: `p${n}`, ...i, ref: `V${n + 1}` })), extras: [], discountPct: args.discount ?? 0 }) : undefined
    const lines = [
      ...(clientRes ? [`${ctx.text.t('field.client')}: ${clientRes.name}`] : []),
      ...(args.title ? [`${ctx.text.t('field.title')}: ${args.title}`] : []),
      ...items.map((i, n) => `V${n + 1} · ${ctx.text.typology(String(args.items![n]!.typology ?? ''))} ${ctx.text.fmt.size(i.design.width, i.design.height)}${i.qty > 1 ? ` · ${ctx.text.t('change.qty', { qty: i.qty })}` : ''}`),
    ]
    return {
      ok: true,
      summary: ctx.text.t('propose.create_quote'),
      preview: { title: ctx.text.t('propose.create_quote'), lines, ...(totals ? { totals: { after: totals.net, currency: ctx.text.fmt.currency } } : {}) },
    }
  }
  const quote = ensureOk(await ctx.call<Quote>('quoteCreate', { body }))
  ctx.memo.quoteId = quote.id
  if (quote.items.length) ctx.memo.lastItemId = quote.items[quote.items.length - 1]!.id
  const undo: AgentUndo = {
    method: 'DELETE',
    path: `/api/quotes/${quote.id}`,
    route: 'quoteDelete',
    params: { id: quote.id },
    expectedVersion: quote.version,
    entity: { type: 'quote', id: quote.id, version: quote.version },
    guard: { route: 'quoteGet', params: { id: quote.id }, field: 'version', value: quote.version },
    ...(clientRes?.created && clientRes.client ? { then: [createdClientCleanup(clientRes.client)] } : {}),
  }
  return {
    ok: true,
    summary: ctx.text.t('done.create_quote', { number: quoteNo(ctx, quote) }),
    data: { id: quote.id, number: quote.number, client: clientRes?.name, clientCreated: clientRes?.created || undefined, items: quote.items.map((i) => i.ref), pending: await quotePendingForModel(ctx, quote), totals: totalsForModel(ctx, quote.totals), notes },
    affected: [{ type: 'quote', id: quote.id, version: quote.version }, ...(clientRes?.created && clientRes.client ? [{ type: 'client' as const, id: clientRes.client.id }] : [])],
    ui: args.open === false ? [] : [{ kind: 'open_quote', quoteId: quote.id }],
    undo,
  }
}

const updateQuote: ToolHandler<'update_quote'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const t = ctx.text
  const changes: string[] = []
  const previewChanges: NonNullable<ToolPreview['changes']> = []
  const patch: QuotePatch = {}
  let createdClientId: string | undefined
  let createdClient: (Pick<Client, 'id'> & Partial<Pick<Client, 'updatedAt'>>) | undefined

  if (args.site_address !== undefined && args.site_address !== (quote.siteAddress ?? '')) {
    patch.siteAddress = args.site_address || null
    changes.push(t.t('field.siteAddress'))
    previewChanges.push({ field: 'siteAddress', label: t.t('field.siteAddress'), before: quote.siteAddress || '—', after: args.site_address || '—' })
  }
  if (args.title !== undefined && args.title !== (quote.title ?? '')) {
    patch.title = args.title
    changes.push(t.t('change.title', { title: args.title }))
    previewChanges.push({ field: 'title', label: t.t('field.title'), before: quote.title || '—', after: args.title || '—' })
  }
  if (args.clear_client) {
    if (quote.clientId) {
      patch.clientId = null
      changes.push(t.t('change.clientOff'))
      previewChanges.push({ field: 'client', label: t.t('field.client'), before: quote.client?.name ?? '—', after: '—' })
    }
  } else if (args.clientId || args.client) {
    const res = await findOrCreateClient(ctx, { clientId: args.clientId, name: args.client, email: args.client_email, phone: args.client_phone, rut: args.client_rut })
    if (res.client?.id !== quote.clientId) {
      if (res.client) patch.clientId = res.client.id
      if (res.created && res.client) {
        createdClientId = res.client.id
        createdClient = res.client
      }
      changes.push(t.t('change.client', { name: res.name }))
      previewChanges.push({ field: 'client', label: t.t('field.client'), before: quote.client?.name ?? '—', after: res.name })
    }
  }
  if (args.discount !== undefined && args.discount !== (quote.discountPct ?? 0)) {
    patch.discountPct = Math.round(args.discount * 100) / 100
    changes.push(args.discount ? t.t('change.discount', { pct: t.fmt.pct(args.discount) }) : t.t('change.discountOff'))
    previewChanges.push({ field: 'discount', label: t.t('field.discount'), before: t.fmt.pct(quote.discountPct ?? 0), after: t.fmt.pct(args.discount) })
  }
  if (args.margin_pct !== undefined || args.clear_margin) {
    if (!canSeeMargins(ctx.viewer)) throw new ToolFailure('forbidden', 'This role cannot see or change the profit of a quote.')
    const settings = await getSettings(ctx.deps.db, ctx.auth.org.id)
    const mode = args.margin_mode ?? quote.pricing?.marginMode ?? settings.pricing.marginMode
    if (args.clear_margin) {
      if (quote.pricing?.marginPct !== undefined) {
        const { marginPct: _pct, marginMode: _mode, ...rest } = quote.pricing
        patch.pricing = rest
        changes.push(t.t('change.marginOff'))
        previewChanges.push({ field: 'marginPct', label: t.t('field.marginPct'), before: t.fmt.pct(quote.pricing.marginPct), after: t.fmt.pct(settings.pricing.marginPct) })
      }
    } else {
      const pct = args.margin_pct!
      // Un margen sobre la venta no llega a 100 %: lo que se pide es vender sobre el costo.
      const marginMode = pct > MARGIN_LIMITS.margin ? 'markup' : mode
      patch.pricing = { ...quote.pricing, marginPct: pct, marginMode }
      changes.push(t.t(marginMode === 'markup' ? 'change.markup' : 'change.margin', { pct: t.fmt.pct(pct) }))
      previewChanges.push({ field: 'marginPct', label: t.t('field.marginPct'), before: t.fmt.pct(quote.pricing?.marginPct ?? settings.pricing.marginPct), after: t.fmt.pct(pct) })
    }
  }
  if (args.notes !== undefined && args.notes !== (quote.notes ?? '')) {
    patch.notes = args.notes ? args.notes : null
    changes.push(t.t('change.notes'))
    previewChanges.push({ field: 'notes', label: t.t('field.notes'), before: quote.notes ? quote.notes.slice(0, 120) : '—', after: args.notes ? args.notes.slice(0, 120) : '—' })
  }
  if (args.valid_until !== undefined && args.valid_until !== quote.validUntil) {
    patch.validUntil = args.valid_until
    changes.push(t.t('change.validUntil', { date: t.fmt.date(args.valid_until) }))
    previewChanges.push({ field: 'validUntil', label: t.t('field.validUntil'), before: quote.validUntil ? t.fmt.date(quote.validUntil) : '—', after: t.fmt.date(args.valid_until) })
  }
  if (args.document_locale || args.template) {
    const ops = [...(args.document_locale ? [{ op: 'setLocale', locale: args.document_locale }] : []), ...(args.template ? [{ op: 'setTemplate', templateId: args.template }] : [])]
    const base = await quoteBaseTemplate(ctx, quote)
    const current = migrateQuoteDocOverrides(quote.documentOverrides ?? null).overrides
    const applied = applyDocOps(current, ops, { template: base })
    if (!applied.ok) throw new ToolFailure('invalid', `Document change rejected: ${applied.issues.map((i) => i.message).join('; ')}`)
    if (applied.changed) {
      patch.documentOverrides = applied.result
      if (args.document_locale) {
        changes.push(t.t('change.documentLocale', { language: t.language(args.document_locale) }))
        previewChanges.push({ field: 'documentLocale', label: t.t('field.documentLocale'), before: current.locale ? t.language(current.locale) : '—', after: t.language(args.document_locale) })
      }
      if (args.template) {
        changes.push(t.t('change.template', { name: args.template }))
        previewChanges.push({ field: 'template', label: t.t('field.template'), before: current.templateId ?? '—', after: args.template })
      }
    }
  }
  if (!Object.keys(patch).length) {
    return { ok: true, summary: t.t('done.update_quote', { number: quoteNo(ctx, quote), changes: t.t('change.nothing') }), data: { changed: false } }
  }
  if (ctx.dryRun) {
    const totals = patch.discountPct !== undefined || patch.pricing ? await previewTotals(ctx, dataOf(quote, { ...(patch.discountPct !== undefined ? { discountPct: patch.discountPct } : {}), ...(patch.pricing ? { pricing: patch.pricing } : {}) })) : undefined
    return {
      ok: true,
      summary: t.t('propose.update_quote', { number: quoteNo(ctx, quote) }),
      preview: {
        title: t.t('propose.update_quote', { number: quoteNo(ctx, quote) }),
        lines: changes,
        changes: previewChanges,
        ...(totals ? { totals: { before: quote.totals?.net, after: totals.net, currency: t.fmt.currency } } : {}),
      },
      affected: [{ type: 'quote', id: quote.id, version: quote.version }],
    }
  }
  const { before, after } = await saveQuote(ctx, quote, patch, () => patch)
  const undo = quoteUndo(before, after)
  if (createdClient) undo.then = [createdClientCleanup(createdClient)]
  return {
    ok: true,
    summary: t.t('done.update_quote', { number: quoteNo(ctx, after), changes: t.list(changes) }),
    data: { number: after.number, changes: previewChanges.map((c) => ({ field: c.field, after: c.after })), totals: totalsForModel(ctx, after.totals) },
    affected: [{ type: 'quote', id: after.id, version: after.version }, ...(createdClientId ? [{ type: 'client' as const, id: createdClientId }] : [])],
    undo,
  }
}

const duplicateQuote: ToolHandler<'duplicate_quote'> = async (ctx, args) => {
  const source = await loadQuoteFor(ctx, args)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.duplicate_quote', { number: quoteNo(ctx, source) })
    return { ok: true, summary: title, preview: { title, lines: [source.title || quoteNo(ctx, source)] } }
  }
  const copy = ensureOk(await ctx.call<Quote>('quoteDuplicate', { params: { id: source.id } }))
  ctx.memo.quoteId = copy.id
  return {
    ok: true,
    summary: ctx.text.t('done.duplicate_quote', { source: quoteNo(ctx, source), number: quoteNo(ctx, copy) }),
    data: { id: copy.id, number: copy.number, source: source.number },
    affected: [{ type: 'quote', id: copy.id, version: copy.version }],
    ui: [{ kind: 'open_quote', quoteId: copy.id }],
    undo: {
      method: 'DELETE',
      path: `/api/quotes/${copy.id}`,
      route: 'quoteDelete',
      params: { id: copy.id },
      expectedVersion: copy.version,
      entity: { type: 'quote', id: copy.id, version: copy.version },
      guard: { route: 'quoteGet', params: { id: copy.id }, field: 'version', value: copy.version },
    },
  }
}

const deleteQuote: ToolHandler<'delete_quote'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const title = ctx.text.t('propose.delete_quote', { number: quoteNo(ctx, quote) })
  if (ctx.dryRun) {
    return {
      ok: true,
      summary: title,
      preview: { title, lines: [quote.title || quoteNo(ctx, quote), ...(quote.client ? [`${ctx.text.t('field.client')}: ${quote.client.name}`] : [])], irreversible: ctx.text.t('irreversible.trash') },
    }
  }
  ensureOk(await ctx.call('quoteDelete', { params: { id: quote.id } }))
  if (ctx.memo.quoteId === quote.id) delete ctx.memo.quoteId
  return {
    ok: true,
    summary: ctx.text.t('done.delete_quote', { number: quoteNo(ctx, quote) }),
    data: { id: quote.id, number: quote.number, restorable: true },
    affected: [{ type: 'quote', id: quote.id }],
    undo: { method: 'POST', path: `/api/quotes/${quote.id}/restore`, route: 'quoteRestore', params: { id: quote.id }, entity: { type: 'quote', id: quote.id } },
  }
}

const setQuoteStatus: ToolHandler<'set_quote_status'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const status = ctx.text.status(args.status)
  if (quote.status === args.status) {
    return { ok: true, summary: ctx.text.t('done.set_quote_status', { number: quoteNo(ctx, quote), status }), data: { changed: false, status: quote.status } }
  }
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.set_quote_status', { number: quoteNo(ctx, quote), status })
    return {
      ok: true,
      summary: title,
      preview: { title, lines: [], changes: [{ field: 'status', label: ctx.text.t('field.status'), before: ctx.text.status(quote.status), after: status }] },
      affected: [{ type: 'quote', id: quote.id, version: quote.version }],
    }
  }
  const after = ensureOk(await ctx.call<Quote>('quoteStatus', { params: { id: quote.id }, body: { status: args.status } }))
  return {
    ok: true,
    summary: ctx.text.t('done.set_quote_status', { number: quoteNo(ctx, after), status }),
    data: { number: after.number, from: quote.status, to: after.status },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    undo: {
      method: 'POST',
      path: `/api/quotes/${after.id}/status`,
      route: 'quoteStatus',
      params: { id: after.id },
      body: { status: quote.status },
      expectedVersion: after.version,
      entity: { type: 'quote', id: after.id, version: after.version },
      guard: { route: 'quoteGet', params: { id: after.id }, field: 'version', value: after.version },
    },
  }
}

async function sendOrShare(ctx: ToolContext, quote: Quote, channel: 'email' | 'whatsapp' | 'link', to: string | undefined, message: string | undefined, kind: 'send_quote' | 'share_quote_link', format?: SendFormat): Promise<ToolOutcome> {
  const t = ctx.text
  const recipient = channel === 'email' ? (to ?? quote.client?.email) : undefined
  if (channel === 'email' && !recipient) throw new ToolFailure('missing_recipient', 'There is no email address: ask the user for the recipient or use WhatsApp/link.')
  const channelName = t.t(`channel.${channel}`)
  const title = kind === 'share_quote_link' ? t.t('propose.share_quote_link', { number: quoteNo(ctx, quote) }) : t.t('propose.send_quote', { number: quoteNo(ctx, quote), channel: channelName })
  if (ctx.dryRun) {
    const lines = [
      ...(quote.client ? [`${t.t('field.client')}: ${quote.client.name}`] : []),
      ...(recipient ? [`${t.t('field.to')}: ${recipient}`] : channel === 'whatsapp' && quote.client?.phone ? [`${t.t('field.to')}: ${quote.client.phone}`] : []),
      `${t.t('field.channel')}: ${channelName}`,
      ...(message ? [`${t.t('field.message')}: ${message}`] : []),
    ]
    return {
      ok: true,
      summary: title,
      preview: {
        title,
        lines,
        ...(quote.totals ? { totals: { after: quote.totals.net, currency: t.fmt.currency } } : {}),
        irreversible: t.t(`irreversible.${channel}`),
      },
      affected: [{ type: 'quote', id: quote.id, version: quote.version }],
    }
  }
  const res = ensureOk(
    await ctx.call<SendQuoteResponse>('quoteSend', {
      params: { id: quote.id },
      body: { channel, ...(format ? { format } : {}), ...(recipient ? { to: recipient } : {}), ...(message ? { message } : {}) },
    }),
  )
  // La versión quedó creada, pero el correo no: no se dice «enviado».
  if (channel === 'email' && res.emailed !== 'sent') {
    throw new ToolFailure('email_not_sent', res.emailed === 'no_provider' ? 'This server has no email provider: nothing was emailed. Tell the user to send it from their own email or WhatsApp.' : 'The email could not be sent. Tell the user and suggest WhatsApp or their own email.')
  }
  return {
    ok: true,
    summary: kind === 'share_quote_link' ? t.t('done.share_quote_link', { number: quoteNo(ctx, quote) }) : t.t('done.send_quote', { number: quoteNo(ctx, quote), channel: channelName }),
    data: {
      number: quote.number,
      channel,
      url: res.url,
      revision: res.revisionLabel,
      ...(recipient ? { to: recipient } : {}),
      ...(channel === 'whatsapp' && quote.client?.phone ? { phone: quote.client.phone } : {}),
    },
    affected: [{ type: 'quote', id: quote.id, version: res.quote.version }],
    undo: null,
  }
}

const sendQuote: ToolHandler<'send_quote'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  const channel = args.channel ?? (args.to ? 'email' : 'link')
  return sendOrShare(ctx, quote, channel, args.to, args.message, 'send_quote', args.format)
}

const shareQuoteLink: ToolHandler<'share_quote_link'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  return sendOrShare(ctx, quote, 'link', undefined, undefined, 'share_quote_link')
}

export const QUOTE_HANDLERS = {
  list_quotes: listQuotes,
  get_quote: getQuote,
  open_quote: openQuote,
  create_quote: createQuote,
  update_quote: updateQuote,
  duplicate_quote: duplicateQuote,
  delete_quote: deleteQuote,
  set_quote_status: setQuoteStatus,
  send_quote: sendQuote,
  share_quote_link: shareQuoteLink,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
