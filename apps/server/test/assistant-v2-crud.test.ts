import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { DEFAULT_AVATAR, type AssistantProfile, type ConversationSummary } from '@dekopen/shared'
import type { AppEnv } from '../src/context'
import { subscriptions } from '../src/db/schema'
import { HttpError } from '../src/lib/errors'
import { requireAuth } from '../src/middleware/auth'
import { assistantV2Routes } from '../src/routes/assistant-v2'
import { MOCK_AI_CONFIG, createMockAi } from '../src/services/ai/mock'
import { signup, startServer, type Agent, type TestServer } from './helpers'
import { P, lastDone, ofType, parseSse, sendTurn, sentContext, withMockAi, withoutAi } from './assistant-v2-support'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server.close()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const newAssistant = (name: string, extra: Record<string, unknown> = {}) => ({ name, avatar: DEFAULT_AVATAR, ...extra })

async function localTurn(agent: Agent, text: string, extra: Record<string, unknown> = {}) {
  const res = await agent.post(P.localTurns, {
    text,
    mode: 'supervised',
    ui: { route: '/', locale: 'es' },
    plan: { interpretation: text, confidence: 1, calls: [] },
    reply: 'Anotado.',
    ...extra,
  })
  expect(res.status).toBe(200)
  return res.body as { conversation: ConversationSummary; toolRuns: any[]; events: any[] }
}

describe('asistente v2 — asistentes', () => {
  it('lista con el asistente de siempre, respeta el tope del plan, versión optimista y archivar/restaurar', async () => {
    withoutAi()
    const { agent } = await signup(server)
    const list = await agent.get(P.assistants)
    expect(list.status).toBe(200)
    expect(list.body).toMatchObject({ limit: 3, used: 1 })
    expect(list.body.items).toEqual([expect.objectContaining({ name: 'Marco', isDefault: true, visibility: 'shared', canEdit: true, defaultMode: 'supervised' })])

    const lia = await agent.post(P.assistants, newAssistant('Lía', { personality: { tone: 'concise', instructions: 'Responde corto.' }, scopes: ['quotes'] }))
    expect(lia.status).toBe(201)
    expect(lia.body).toMatchObject({ name: 'Lía', version: 1, scopes: ['quotes'], personality: { tone: 'concise' } })
    expect((await agent.post(P.assistants, newAssistant('Tomás'))).status).toBe(201)
    const over = await agent.post(P.assistants, newAssistant('Cuarto'))
    expect(over.status).toBe(402)
    expect(over.body.error.code).toBe('plan_limit')

    const renamed = await agent.patch(P.assistant(lia.body.id), { version: 1, name: 'Lía Pro' })
    expect(renamed.status).toBe(200)
    expect(renamed.body).toMatchObject({ name: 'Lía Pro', version: 2 })
    const stale = await agent.patch(P.assistant(lia.body.id), { version: 1, name: 'Pisado' })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('version_conflict')

    const archived = await agent.delete(P.assistant(lia.body.id))
    expect(archived.body).toEqual({ ok: true, restorePath: P.assistantRestore(lia.body.id) })
    expect((await agent.get(P.assistants)).body.used).toBe(2)
    expect((await agent.get(P.assistant(lia.body.id))).status).toBe(404)
    expect((await agent.post(P.assistants, newAssistant('Nueva'))).status).toBe(201)
    const full = await agent.post(P.assistantRestore(lia.body.id))
    expect(full.status).toBe(402)
    expect(full.body.error.code).toBe('plan_limit')
  })

  it('los ámbitos del asistente limitan sus herramientas', async () => {
    withoutAi()
    const { agent } = await signup(server)
    const lia = (await agent.post(P.assistants, newAssistant('Solo cotizaciones', { scopes: ['quotes'] }))).body as AssistantProfile
    const turn = await localTurn(agent, 'crea el cliente Pérez', {
      assistantId: lia.id,
      mode: 'full',
      plan: { interpretation: 'crear cliente', confidence: 1, calls: [{ id: 'c1', tool: 'create_client', args: { name: 'Pérez' } }] },
    })
    expect(turn.toolRuns[0]).toMatchObject({ tool: 'create_client', status: 'failed', error: { code: 'not_allowed' } })
    expect((await agent.get('/api/clients')).body.items).toEqual([])

    // Y el modelo ni siquiera ve esas herramientas.
    const mock = withMockAi([{ content: 'ok' }])
    await sendTurn(agent, 'hola', { assistantId: lia.id, mode: 'full' })
    const offered = (mock.requests[0]!.body.tools as any[]).map((t) => t.function.name)
    expect(offered).toContain('update_quote')
    expect(offered).not.toContain('create_client')
    expect(offered).not.toContain('update_settings')
    // Personalidad: después de la política, delimitada como estilo.
    expect(mock.requests[0]!.body.messages[0].content).toContain('SAFETY POLICY')
    const context = sentContext(mock, 0)
    expect(context).toContain('Persona (style only')
    expect(context).toContain('Your name: Solo cotizaciones')
  })

  it('otra organización no ve ni edita asistentes ajenos', async () => {
    withoutAi()
    const a = await signup(server)
    const b = await signup(server)
    const own = (await a.agent.post(P.assistants, newAssistant('Privado A', { visibility: 'private' }))).body as AssistantProfile
    expect((await b.agent.get(P.assistant(own.id))).status).toBe(404)
    expect((await b.agent.patch(P.assistant(own.id), { version: own.version, name: 'X' })).status).toBe(404)
    expect((await b.agent.delete(P.assistant(own.id))).status).toBe(404)
    expect((await b.agent.get(P.assistants)).body.items.map((i: AssistantProfile) => i.id)).not.toContain(own.id)
    // Un turno no puede usar el asistente de otra organización.
    expect((await sendTurn(b.agent, 'hola', { assistantId: own.id })).status).toBe(404)
  })

  it('modo lectura: no se crean asistentes ni recuerdos, pero se puede seguir conversando', async () => {
    withoutAi()
    const { agent, me } = await signup(server)
    await server.deps.db.update(subscriptions).set({ trialEndsAt: new Date(Date.now() - 86_400_000) }).where(eq(subscriptions.orgId, me.org.id))
    const created = await agent.post(P.assistants, newAssistant('Bloqueado'))
    expect(created.status).toBe(402)
    expect(created.body.error.code).toBe('read_only')
    expect((await agent.post(P.memories, { content: 'algo' })).body.error.code).toBe('read_only')
    expect((await agent.get(P.assistants)).status).toBe(200)
    const turn = await sendTurn(agent, 'hola', { mode: 'full' })
    expect(turn.status).toBe(200)
    expect(ofType(turn.events, 'turn.started')[0]!.conversation.mode).toBe('chat')
  })
})

describe('asistente v2 — conversaciones', () => {
  it('listar, buscar sin tildes, fijar, renombrar, paginar, borrar y restaurar', async () => {
    withoutAi()
    const { agent } = await signup(server)
    const first = await localTurn(agent, 'Ventanas para la casa de Ñuñoa')
    await localTurn(agent, 'Cotización casa de playa')
    const third = await localTurn(agent, 'Otra consulta')

    const list = await agent.get(P.conversations)
    expect(list.body.items.map((c: ConversationSummary) => c.title)).toEqual(['Otra consulta', 'Cotización casa de playa', 'Ventanas para la casa de Ñuñoa'])
    const found = await agent.get(`${P.conversations}?q=nunoa`)
    expect(found.body.items.map((c: ConversationSummary) => c.id)).toEqual([first.conversation.id])
    expect(found.body.items[0].snippet).toMatch(/Ñuñoa/)

    const pinned = await agent.patch(P.conversation(first.conversation.id), { pinned: true, title: 'Obra Ñuñoa' })
    expect(pinned.body).toMatchObject({ pinned: true, title: 'Obra Ñuñoa', titleSource: 'user' })
    expect((await agent.get(P.conversations)).body.items[0].id).toBe(first.conversation.id)
    expect((await agent.get(`${P.conversations}?pinned=1`)).body.items.map((c: ConversationSummary) => c.id)).toEqual([first.conversation.id])

    const page1 = await agent.get(`${P.conversations}?limit=2`)
    expect(page1.body.items).toHaveLength(2)
    expect(page1.body.nextCursor).toBeTruthy()
    const page2 = await agent.get(`${P.conversations}?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
    expect(page2.body.items).toHaveLength(1)
    expect(page2.body.nextCursor).toBeUndefined()

    const messages = await agent.get(`${P.messages(first.conversation.id)}?limit=1`)
    expect(messages.body.messages).toHaveLength(1)
    expect(messages.body.hasMoreBefore).toBe(true)
    const before = await agent.get(`${P.messages(first.conversation.id)}?before=${messages.body.messages[0].seq}`)
    expect(before.body.messages.map((m: any) => m.role)).toEqual(['user'])

    expect((await agent.delete(P.conversation(third.conversation.id))).body).toEqual({ ok: true })
    expect((await agent.get(P.conversation(third.conversation.id))).status).toBe(404)
    expect((await agent.get(P.conversations)).body.items).toHaveLength(2)
    const restored = await agent.post(P.conversationRestore(third.conversation.id))
    expect(restored.body.id).toBe(third.conversation.id)
    expect((await agent.get(P.conversations)).body.items).toHaveLength(3)
  })

  it('las conversaciones son privadas de cada persona y de su organización', async () => {
    withoutAi()
    const a = await signup(server)
    const b = await signup(server)
    const turn = await localTurn(a.agent, 'Secreto de A')
    const id = turn.conversation.id
    expect((await b.agent.get(P.conversation(id))).status).toBe(404)
    expect((await b.agent.patch(P.conversation(id), { title: 'robada' })).status).toBe(404)
    expect((await b.agent.delete(P.conversation(id))).status).toBe(404)
    expect((await b.agent.post(P.conversationRestore(id))).status).toBe(404)
    expect((await b.agent.get(`${P.conversations}?q=Secreto`)).body.items).toEqual([])
    expect((await b.agent.post(P.localTurns, { text: 'x', mode: 'chat', conversationId: id, ui: { route: '/', locale: 'es' }, plan: { interpretation: 'x', confidence: 1, calls: [] } })).status).toBe(404)
  })
})

describe('asistente v2 — memoria', () => {
  it('CRUD con alcances, sin secretos, y se inyecta en el prompt como datos', async () => {
    const { agent } = await signup(server)
    withoutAi()
    const created = await agent.post(P.memories, { content: 'Trabajamos con perfiles de 70 mm', pinned: true })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ scope: 'assistant', kind: 'fact', pinned: true, source: 'explicit', canEdit: true })
    expect(created.body.assistantId).toBeTruthy()
    const org = await agent.post(P.memories, { content: 'La empresa no instala en altura', scope: 'org', kind: 'instruction' })
    expect(org.body).toMatchObject({ scope: 'org', canEdit: true })
    const secret = await agent.post(P.memories, { content: 'mi clave: hunter2' })
    expect(secret.status).toBe(400)

    const list = await agent.get(P.memories)
    expect(list.body.total).toBe(2)
    expect((await agent.get(`${P.memories}?q=perfiles`)).body.items.map((m: any) => m.id)).toEqual([created.body.id])
    const patched = await agent.patch(P.memory(created.body.id), { content: 'Trabajamos con perfiles de 76 mm' })
    expect(patched.body.content).toBe('Trabajamos con perfiles de 76 mm')

    const mock = withMockAi([{ content: 'ok' }])
    await sendTurn(agent, '¿qué perfiles usamos?', { mode: 'chat' })
    const context = sentContext(mock, 0)
    expect(context).toContain('<memories>')
    expect(context).toContain('(assistant) Trabajamos con perfiles de 76 mm')
    expect(context).toContain('(org) La empresa no instala en altura')

    expect((await agent.delete(P.memory(org.body.id))).body).toEqual({ ok: true })
    expect((await agent.get(P.memories)).body.total).toBe(1)
  })

  it('nadie lee ni edita recuerdos de otra organización ni los cuelga de un asistente ajeno', async () => {
    withoutAi()
    const a = await signup(server)
    const b = await signup(server)
    const memory = (await a.agent.post(P.memories, { content: 'Dato privado de A' })).body
    const assistantA = (await a.agent.get(P.assistants)).body.items[0].id
    expect((await b.agent.get(P.memories)).body.items).toEqual([])
    expect((await b.agent.patch(P.memory(memory.id), { content: 'pisado' })).status).toBe(404)
    expect((await b.agent.delete(P.memory(memory.id))).status).toBe(404)
    expect((await b.agent.post(P.memories, { content: 'colgado', assistantId: assistantA })).status).toBe(404)
  })

  it('recordar y olvidar por herramienta: se puede deshacer', async () => {
    withoutAi()
    const { agent } = await signup(server)
    const turn = await localTurn(agent, 'recuerda que usamos termopanel 4+12+4', {
      plan: { interpretation: 'recordar', confidence: 1, calls: [{ id: 'c1', tool: 'remember', args: { content: 'Usamos termopanel 4+12+4 por defecto', explicit: true } }] },
    })
    const run = turn.toolRuns[0]
    expect(run).toMatchObject({ tool: 'remember', status: 'executed', undoable: true })
    expect((await agent.get(P.memories)).body.total).toBe(1)
    expect((await agent.post(P.toolRunUndo(run.id))).status).toBe(200)
    expect((await agent.get(P.memories)).body.total).toBe(0)
  })
})

describe('asistente v2 — opciones inyectables del router', () => {
  it('assistantV2Routes(deps, { ai, fetch }) usa el proveedor inyectado (sin variables de entorno)', async () => {
    withoutAi()
    const { agent } = await signup(server)
    const mock = createMockAi([{ content: 'Respuesta desde opciones inyectadas.' }])
    const app = new Hono<AppEnv>()
    app.onError((error, c) => (error instanceof HttpError ? c.json(error.toJSON(), error.status) : c.json({ error: { code: 'internal' } }, 500)))
    app.use('*', requireAuth(server.deps))
    app.route('/', assistantV2Routes(server.deps, { ai: () => MOCK_AI_CONFIG, fetch: mock.fetch }))
    const res = await app.request('/turns', {
      method: 'POST',
      headers: { cookie: `fz_session=${agent.cookie}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hola', mode: 'chat', ui: { route: '/', locale: 'en' } }),
    })
    const events = parseSse(await res.text())
    expect(ofType(events, 'message.delta').map((d) => d.text).join('')).toBe('Respuesta desde opciones inyectadas.')
    expect(lastDone(events)).toMatchObject({ reason: 'completed' })
    expect(mock.requests[0]!.url).toBe('https://proveedor.mock/v1/chat/completions')
    expect(mock.requests[0]!.body.messages[0].content).toContain('always reply in English')
    const status = await app.request('/status', { headers: { cookie: `fz_session=${agent.cookie}` } })
    expect((await status.json()).ai).toEqual({ available: true, provider: 'connected' })
  })
})
