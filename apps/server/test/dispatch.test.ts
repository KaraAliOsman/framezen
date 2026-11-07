import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import type { Me } from '@dekopen/shared'
import { activity, subscriptions } from '../src/db/schema'
import { runWithDispatchMeta } from '../src/lib/request-context'
import { DispatchError, buildDispatchPath, defineDispatchRoute, dispatch, type DispatchActor } from '../src/services/dispatch'
import { signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server.close()
})

const LIST_CLIENTS = defineDispatchRoute('GET', '/api/clients')
const GET_CLIENT = defineDispatchRoute('GET', '/api/clients/:id')
const CREATE_CLIENT = defineDispatchRoute('POST', '/api/clients')
const PATCH_SETTINGS = defineDispatchRoute('PATCH', '/api/settings')
const GET_QUOTE = defineDispatchRoute('GET', '/api/quotes/:id')

function actorOf(agent: { cookie?: string }, me: Me): DispatchActor {
  return { sessionToken: agent.cookie!, orgId: me.org.id, userId: me.user.id }
}

describe('despacho interno de herramientas (services/dispatch)', () => {
  it('rutas fijas: prohíbe facturación, equipo, sesión, portal y el propio asistente; valida plantillas', () => {
    for (const path of ['/api/billing/checkout', '/api/team/invite', '/api/auth/login', '/api/me', '/api/me/org', '/api/public/quotes/:token', '/api/assistant/chat', '/api/assistant/v2/turns', '/api/invitations/:token/accept']) {
      expect(() => defineDispatchRoute('POST', path)).toThrow(/no puede usar/)
    }
    expect(() => defineDispatchRoute('GET', '/cotizaciones')).toThrow()
    expect(() => defineDispatchRoute('GET', '/api/quotes/../billing')).toThrow()
    expect(() => defineDispatchRoute('GET', '/api/quotes/*')).toThrow()
    expect(() => defineDispatchRoute('GET', '/api/quotes/:id/:id')).toThrow()
    expect(GET_QUOTE.params).toEqual(['id'])
    expect(buildDispatchPath(GET_QUOTE, { params: { id: 'abc-123' }, query: { include: ['a', 'b'], skip: undefined } })).toBe('/api/quotes/abc-123?include=a%2Cb')
    for (const id of ['../billing', 'a/b', 'a b', '', 'x'.repeat(200), '%2e%2e']) {
      expect(() => buildDispatchPath(GET_QUOTE, { params: { id } })).toThrow(DispatchError)
    }
    expect(() => buildDispatchPath(GET_QUOTE, { params: { id: 'a', extra: 'b' } })).toThrow(/desconocidos/)
    expect(() => buildDispatchPath(GET_QUOTE, { params: { id: 'a' }, query: { 'bad key': 1 } })).toThrow(DispatchError)
  })

  it('actúa con la sesión de la persona: ve lo suyo y nunca lo de otra organización', async () => {
    const a = await signup(server)
    const b = await signup(server)
    const mine = await a.agent.post('/api/clients', { name: 'Cliente de A' })
    const theirs = await b.agent.post('/api/clients', { name: 'Cliente de B' })
    const actor = actorOf(a.agent, a.me)

    const list = await dispatch<{ items: { name: string }[] }>(server.deps, actor, LIST_CLIENTS)
    expect(list.ok).toBe(true)
    expect(list.data!.items.map((c) => c.name)).toEqual(['Cliente de A'])

    expect((await dispatch(server.deps, actor, GET_CLIENT, { params: { id: mine.body.id } })).ok).toBe(true)
    const foreign = await dispatch(server.deps, actor, GET_CLIENT, { params: { id: theirs.body.id } })
    expect(foreign).toMatchObject({ ok: false, status: 404, error: { code: 'not_found' }, request: { method: 'GET', path: `/api/clients/${theirs.body.id}` } })

    const anonymous = await dispatch(server.deps, { ...actor, sessionToken: 'token-inventado' }, LIST_CLIENTS)
    expect(anonymous).toMatchObject({ ok: false, status: 401, error: { code: 'unauthorized' } })
  })

  it('la actividad queda marcada como acción del asistente (y las de la persona no)', async () => {
    const { agent, me } = await signup(server)
    const created = await dispatch<{ id: string }>(server.deps, actorOf(agent, me), CREATE_CLIENT, { body: { name: 'Cliente del bot' } }, {
      assistantId: 'asst-1',
      assistantName: 'Marco',
      toolRunId: 'run-1',
      tool: 'create_client',
    })
    expect(created).toMatchObject({ ok: true, status: 201 })
    await agent.post('/api/clients', { name: 'Cliente a mano' })
    const rows = await server.deps.db.select().from(activity).where(and(eq(activity.orgId, me.org.id), eq(activity.kind, 'client.created')))
    const bot = rows.find((r) => r.subjectId === created.data!.id)!
    expect(bot.meta).toMatchObject({ via: 'assistant', assistantId: 'asst-1', assistantName: 'Marco', toolRunId: 'run-1', tool: 'create_client' })
    const human = rows.find((r) => r.subjectId !== created.data!.id)!
    expect(human.meta?.via).toBeUndefined()
    // Una cabecera no puede fingir la marca.
    await agent.post('/api/clients', { name: 'Cliente falso' }, { 'x-dekopen-dispatch': '1', via: 'assistant' })
    const after = await server.deps.db.select().from(activity).where(and(eq(activity.orgId, me.org.id), eq(activity.kind, 'client.created')))
    expect(after.filter((r) => r.meta?.via === 'assistant')).toHaveLength(1)
  })

  it('respeta el modo lectura y los roles del plan, igual que la web', async () => {
    const expired = await signup(server)
    await server.deps.db.update(subscriptions).set({ trialEndsAt: new Date(Date.now() - 86_400_000) }).where(eq(subscriptions.orgId, expired.me.org.id))
    const readOnly = await dispatch(server.deps, actorOf(expired.agent, expired.me), CREATE_CLIENT, { body: { name: 'No debería' } })
    expect(readOnly).toMatchObject({ ok: false, status: 402, error: { code: 'read_only' } })

    const owner = await signup(server, { company: 'Taller con roles (dispatch)' })
    expect((await owner.agent.post('/api/billing/checkout', { plan: 'empresa', period: 'monthly' })).status).toBe(200)
    const email = `cotizador.${Date.now()}@taller.cl`
    const invite = await owner.agent.post('/api/team/invite', { email, role: 'estimator' })
    const member = server.agent()
    const joined = await member.post<Me>(`/api/invitations/${invite.body.link.split('/invitacion/')[1]}/accept`, { name: 'Cotizador', email, password: 'clave-segura-123' })
    expect(joined.body.role).toBe('estimator')
    const denied = await dispatch(server.deps, actorOf(member, joined.body), PATCH_SETTINGS, { body: { pricing: { marginPct: 10 } } })
    expect(denied).toMatchObject({ ok: false, status: 403, error: { code: 'forbidden' } })
    const allowed = await dispatch(server.deps, actorOf(owner.agent, owner.me), PATCH_SETTINGS, { body: { pricing: { marginPct: 30 } } })
    expect(allowed.ok).toBe(true)
  })

  it('una herramienta no puede despachar otra; sin app interna no hay despacho', async () => {
    const { agent, me } = await signup(server)
    await expect(runWithDispatchMeta({ via: 'assistant' }, () => dispatch(server.deps, actorOf(agent, me), LIST_CLIENTS))).rejects.toMatchObject({ code: 'dispatch_denied' })
    await expect(dispatch({}, actorOf(agent, me), LIST_CLIENTS)).rejects.toMatchObject({ code: 'dispatch_unavailable' })
    // Una ruta armada a mano (sin defineDispatchRoute) hacia un prefijo prohibido tampoco pasa.
    await expect(dispatch(server.deps, actorOf(agent, me), { method: 'POST', template: '/api/billing/cancel', params: [] })).rejects.toMatchObject({ code: 'dispatch_denied' })
  })

  it('el idioma del actor viaja como Accept-Language y los errores llegan traducidos', async () => {
    const { agent, me } = await signup(server)
    const res = await dispatch(server.deps, { ...actorOf(agent, me), locale: 'en' }, GET_CLIENT, { params: { id: 'no-existe' } })
    expect(res.status).toBe(404)
    expect(res.error!.message).toBe('We could not find what you are looking for.')
  })
})
