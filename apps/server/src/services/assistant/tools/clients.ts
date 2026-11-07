/**
 * Clientes y búsqueda: buscar cotizaciones y clientes, ficha con sus cotizaciones, crear,
 * actualizar y mandar a la papelera (todo por /api/clients y /api/quotes).
 */
import type { AgentToolArgs, Client, Paged, QuoteSummary } from '@dekopen/shared'
import { ensureOk } from './common'
import { ToolFailure, type ToolContext, type ToolHandler } from './types'

const CLIENT_FIELDS = ['name', 'rut', 'email', 'phone', 'address', 'city', 'notes'] as const
type ClientField = (typeof CLIENT_FIELDS)[number]

const clientForModel = (c: Client) => ({
  id: c.id,
  name: c.name,
  ...(c.rut ? { rut: c.rut } : {}),
  ...(c.email ? { email: c.email } : {}),
  ...(c.phone ? { phone: c.phone } : {}),
  ...(c.city ? { city: c.city } : {}),
  ...(c.address ? { address: c.address } : {}),
  ...(c.notes ? { notes: c.notes.slice(0, 600) } : {}),
  quotesCount: c.quotesCount,
  totalAccepted: c.totalAccepted,
})

const search: ToolHandler<'search'> = async (ctx, args) => {
  const kind = args.kind ?? 'all'
  const [quotes, clients] = await Promise.all([
    kind === 'clients' ? null : ctx.call<Paged<QuoteSummary>>('quotesList', { query: { q: args.query, limit: 10 } }),
    kind === 'quotes' ? null : ctx.call<Paged<Client>>('clientsList', { query: { q: args.query, limit: 10 } }),
  ])
  const q = quotes ? ensureOk(quotes).items : []
  const c = clients ? ensureOk(clients).items : []
  return {
    ok: true,
    summary: ctx.text.t('done.search', { count: q.length + c.length, query: args.query }),
    data: {
      quotes: q.map((x) => ({ id: x.id, number: x.number, title: x.title || undefined, client: x.clientName, status: x.status, total: x.total })),
      clients: c.map((x) => ({ id: x.id, name: x.name, city: x.city, quotesCount: x.quotesCount })),
    },
  }
}

async function findClient(ctx: ToolContext, args: { clientId?: string; name?: string }): Promise<Client> {
  if (args.clientId) return ensureOk(await ctx.call<Client>('clientGet', { params: { id: args.clientId } }))
  if (!args.name) throw new ToolFailure('invalid', 'Give a clientId or a name.')
  const list = ensureOk(await ctx.call<Paged<Client>>('clientsList', { query: { q: args.name, limit: 5 } })).items
  const wanted = args.name.trim().toLocaleLowerCase()
  const found = list.find((c) => c.name.trim().toLocaleLowerCase() === wanted) ?? (list.length === 1 ? list[0] : undefined)
  if (!found) {
    if (list.length) throw new ToolFailure('ambiguous', `Several clients match "${args.name}": ${list.map((c) => `${c.name} (${c.id})`).join(', ')}.`)
    throw new ToolFailure('not_found', `No client matches "${args.name}".`)
  }
  return ensureOk(await ctx.call<Client>('clientGet', { params: { id: found.id } }))
}

const getClient: ToolHandler<'get_client'> = async (ctx, args) => {
  const client = await findClient(ctx, args)
  const quotes = ensureOk(await ctx.call<Paged<QuoteSummary>>('quotesList', { query: { clientId: client.id, limit: 10 } })).items
  return {
    ok: true,
    summary: ctx.text.t('done.get_client', { name: client.name }),
    data: { client: clientForModel(client), quotes: quotes.map((q) => ({ id: q.id, number: q.number, title: q.title || undefined, status: q.status, total: q.total })) },
  }
}

const createClient: ToolHandler<'create_client'> = async (ctx, args) => {
  const body = Object.fromEntries(CLIENT_FIELDS.filter((f) => args[f]).map((f) => [f, args[f]]))
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.create_client', { name: args.name })
    return { ok: true, summary: title, preview: { title, lines: CLIENT_FIELDS.filter((f) => f !== 'name' && args[f]).map((f) => `${ctx.text.t(`field.${f}`)}: ${args[f]}`) } }
  }
  const client = ensureOk(await ctx.call<Client>('clientCreate', { body }))
  return {
    ok: true,
    summary: ctx.text.t('done.create_client', { name: client.name }),
    data: { client: clientForModel(client), ...(client.warnings?.length ? { warnings: client.warnings } : {}) },
    affected: [{ type: 'client', id: client.id }],
    undo: {
      method: 'DELETE',
      path: `/api/clients/${client.id}`,
      route: 'clientDelete',
      params: { id: client.id },
      entity: { type: 'client', id: client.id },
      guard: { route: 'clientGet', params: { id: client.id }, field: 'updatedAt', value: client.updatedAt },
    },
  }
}

const updateClient: ToolHandler<'update_client'> = async (ctx, args) => {
  const client = ensureOk(await ctx.call<Client>('clientGet', { params: { id: args.clientId } }))
  const patch: Partial<Record<ClientField, string | null>> = {}
  const previous: Partial<Record<ClientField, string | null>> = {}
  for (const f of CLIENT_FIELDS) {
    const value = args[f]
    if (value === undefined || value === (client[f] ?? '')) continue
    if (f === 'name' && !value) continue
    patch[f] = value || null
    previous[f] = client[f] ?? null
  }
  const changes = (Object.keys(patch) as ClientField[]).map((f) => ({ field: f, label: ctx.text.t(`field.${f}`), before: client[f] || '—', after: patch[f] || '—' }))
  if (!changes.length) return { ok: true, summary: ctx.text.t('done.update_client', { name: client.name }), data: { changed: false } }
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.update_client', { name: client.name })
    return { ok: true, summary: title, preview: { title, lines: [], changes }, affected: [{ type: 'client', id: client.id }] }
  }
  const after = ensureOk(await ctx.call<Client>('clientPatch', { params: { id: client.id }, body: patch }))
  return {
    ok: true,
    summary: ctx.text.t('done.update_client', { name: after.name }),
    data: { client: clientForModel(after), changed: Object.keys(patch) },
    affected: [{ type: 'client', id: after.id }],
    undo: {
      method: 'PATCH',
      path: `/api/clients/${after.id}`,
      route: 'clientPatch',
      params: { id: after.id },
      body: previous,
      entity: { type: 'client', id: after.id },
      guard: { route: 'clientGet', params: { id: after.id }, field: 'updatedAt', value: after.updatedAt },
    },
  }
}

const deleteClient: ToolHandler<'delete_client'> = async (ctx, args) => {
  const client = ensureOk(await ctx.call<Client>('clientGet', { params: { id: args.clientId } }))
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.delete_client', { name: client.name })
    return { ok: true, summary: title, preview: { title, lines: [client.name], irreversible: ctx.text.t('irreversible.trash') } }
  }
  ensureOk(await ctx.call('clientDelete', { params: { id: client.id } }))
  return {
    ok: true,
    summary: ctx.text.t('done.delete_client', { name: client.name }),
    data: { id: client.id, restorable: true },
    affected: [{ type: 'client', id: client.id }],
    undo: { method: 'POST', path: `/api/clients/${client.id}/restore`, route: 'clientRestore', params: { id: client.id }, entity: { type: 'client', id: client.id } },
  }
}

export const CLIENT_HANDLERS = {
  search,
  get_client: getClient,
  create_client: createClient,
  update_client: updateClient,
  delete_client: deleteClient,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
