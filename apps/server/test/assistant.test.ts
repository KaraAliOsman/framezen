import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AssistantChatResponse } from '@framezen/shared'
import { aiUsage, subscriptions } from '../src/db/schema'
import { newId } from '../src/lib/crypto'
import { toOpenAiMessages } from '../src/services/ai/openai'
import { aiConfigFromEnv } from '../src/services/ai/config'
import { signup, startServer, type TestServer } from './helpers'

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

const AI_URL = 'https://ia.test/v1/chat/completions'

function withAi(timeoutMs?: number) {
  vi.stubEnv('AI_API_KEY', 'clave-de-prueba')
  vi.stubEnv('AI_BASE_URL', 'https://ia.test/v1/')
  vi.stubEnv('AI_MODEL', 'modelo-prueba')
  if (timeoutMs) vi.stubEnv('AI_TIMEOUT_MS', String(timeoutMs))
}

function aiReply(message: Record<string, unknown>, usage: Record<string, number> | null = { total_tokens: 2345 }) {
  return new Response(JSON.stringify({ model: 'modelo-prueba-2026', choices: [{ message }], ...(usage ? { usage } : {}) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** fetch simulado: solo intercepta la API de IA. */
function mockFetch(handler: (body: any, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; body: any; init: RequestInit }[] = []
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url !== AI_URL) throw new Error(`fetch inesperado a ${url}`)
    const body = JSON.parse(String(init.body))
    calls.push({ url, body, init })
    return handler(body, init)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

const ask = (text: string, context: Record<string, unknown> = { route: '/inicio' }) => ({ messages: [{ role: 'user', content: text }], context })

describe('POST /api/assistant/chat', () => {
  it('pide sesión y valida el cuerpo con mensajes humanos', async () => {
    const anon = await server.agent().post('/api/assistant/chat', ask('hola'))
    expect(anon.status).toBe(401)
    const { agent } = await signup(server)
    const empty = await agent.post('/api/assistant/chat', { messages: [], context: { route: '/' } })
    expect(empty.status).toBe(400)
    expect(empty.body.error.message).toMatch(/mensaje/i)
  })

  it('sin clave de IA responde en modo local con herramientas y sin gastar créditos', async () => {
    const { agent } = await signup(server)
    const res = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('agrega una corredera de 1500 x 1200 blanca con termopanel', { route: '/cotizaciones/q1', quoteId: 'q1' }))
    expect(res.status).toBe(200)
    expect(res.body.mode).toBe('local')
    expect(res.body.reason).toBe('no_key')
    expect(res.body.creditsUsed).toBe(0)
    expect(res.body.creditsLeft).toBe(500)
    expect(res.body.message.toolCalls).toHaveLength(1)
    const call = res.body.message.toolCalls![0]
    expect(call.name).toBe('add_window')
    expect(JSON.parse(call.arguments)).toMatchObject({ typology: 'sliding_2', width: 1500, height: 1200, color: expect.stringMatching(/^blanco$/i), glass: 'termopanel' })

    const help = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('hola'))
    expect(help.body.message.toolCalls).toBeUndefined()
    expect(help.body.message.content).toMatch(/Hola/)

    // Tras ejecutar herramientas en modo local el navegador arma el resumen.
    const after = await agent.post<AssistantChatResponse>('/api/assistant/chat', {
      messages: [
        { role: 'user', content: 'duplica la V2' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'local_1', name: 'duplicate_window', arguments: '{"ref":"V2"}' }] },
        { role: 'tool', toolCallId: 'local_1', content: '{"ok":true}' },
      ],
      context: { route: '/inicio' },
    })
    expect(after.body).toMatchObject({ mode: 'local', message: { role: 'assistant', content: '' } })
  })

  it('el modo local usa los nombres del catálogo de la empresa', async () => {
    const { agent } = await signup(server)
    const catalog = (await agent.get('/api/catalog')).body
    const line = catalog.lines[0]
    const res = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask(`agrega una oscilobatiente de 800 x 1200 en ${line.name}`))
    expect(JSON.parse(res.body.message.toolCalls![0].arguments).line).toBe(line.name)
  })

  it('con IA: llama a /chat/completions con herramientas, prompt en español y contexto, y cobra 1 crédito por 1.000 tokens', async () => {
    withAi()
    const { agent } = await signup(server)
    const { calls } = mockFetch(() =>
      aiReply({
        content: null,
        tool_calls: [
          { id: 'call_a', type: 'function', function: { name: 'add_window', arguments: '{"typology":"sliding_2","width":1500,"height":1200}' } },
          { id: 'call_x', type: 'function', function: { name: 'borrar_todo', arguments: '{}' } },
        ],
      }),
    )
    const res = await agent.post<AssistantChatResponse>(
      '/api/assistant/chat',
      ask('agrega una corredera de 1,5 por 1,2', { route: '/cotizaciones/abc', quoteId: 'abc', summary: 'Cotización N° 7 «Casa Soto»: V1 Paño fijo 1.200 × 1.000 mm.', selectedRef: 'V1' }),
    )
    expect(res.status).toBe(200)
    expect(res.body.mode).toBe('ai')
    // Las herramientas desconocidas se descartan.
    expect(res.body.message.toolCalls).toEqual([{ id: 'call_a', name: 'add_window', arguments: '{"typology":"sliding_2","width":1500,"height":1200}' }])
    expect(res.body.creditsUsed).toBe(3)
    expect(res.body.creditsLeft).toBe(497)

    expect(calls).toHaveLength(1)
    const { body, init } = calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer clave-de-prueba')
    expect(body.model).toBe('modelo-prueba')
    expect(body.tool_choice).toBe('auto')
    expect(body.tools.map((t: any) => t.function.name)).toContain('add_window')
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toMatch(/Eres Marco/)
    expect(body.messages[0].content).toMatch(/Nunca inventes cifras/)
    expect(body.messages[0].content).toMatch(/tuteo/)
    expect(body.messages[1].content).toMatch(/editor de una cotización/)
    expect(body.messages[1].content).toMatch(/Casa Soto/)
    expect(body.messages[1].content).toMatch(/Ventana seleccionada: V1/)
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'agrega una corredera de 1,5 por 1,2' })

    // Queda registrado y se descuenta del plan.
    const billing = (await agent.get('/api/billing')).body
    expect(billing.aiCredits.used).toBe(3)
  })

  it('con IA: bucle de herramientas con resultados emparejados y respuesta final', async () => {
    withAi()
    const { agent } = await signup(server)
    const { calls } = mockFetch(() => aiReply({ content: 'Listo, agregué la V3: corredera 2 hojas de 1.500 × 1.200 mm.' }, { prompt_tokens: 900, completion_tokens: 50 }))
    const res = await agent.post<AssistantChatResponse>('/api/assistant/chat', {
      messages: [
        { role: 'user', content: 'agrega una corredera de 1500x1200' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_a', name: 'add_window', arguments: '{}' }, { id: 'call_b', name: 'set_discount', arguments: '{"percent":5}' }] },
        { role: 'tool', toolCallId: 'call_a', content: '{"ok":true,"ref":"V3"}' },
        { role: 'tool', toolCallId: 'huerfano', content: '{"ok":true}' },
      ],
      context: { route: '/cotizaciones/abc', quoteId: 'abc' },
    })
    expect(res.body).toMatchObject({ mode: 'ai', creditsUsed: 1, message: { role: 'assistant', content: expect.stringMatching(/V3/) } })
    const sent = calls[0].body.messages.slice(2)
    expect(sent.map((m: any) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool'])
    expect(sent[2]).toMatchObject({ tool_call_id: 'call_a' })
    // Resultado faltante: se completa con uno neutro; el huérfano no se envía.
    expect(sent[3]).toMatchObject({ tool_call_id: 'call_b', content: expect.stringMatching(/No se ejecutó/) })
  })

  it('si la IA falla responde en modo local con un aviso amable y sin cobrar', async () => {
    withAi()
    const { agent } = await signup(server)
    mockFetch(() => new Response('caído', { status: 503 }))
    const res = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('descuento 5%', { route: '/cotizaciones/abc', quoteId: 'abc' }))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ mode: 'local', reason: 'ai_error', creditsUsed: 0 })
    expect(res.body.notice).toMatch(/modo local/)
    expect(JSON.parse(res.body.message.toolCalls![0].arguments)).toEqual({ percent: 5 })

    mockFetch(() => new Response('{}', { status: 401 }))
    const auth = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('hola'))
    expect(auth.body.reason).toBe('ai_error')
    expect(auth.body.notice).not.toMatch(/401|error/i)

    mockFetch(() => new Response('no es json', { status: 200 }))
    const bad = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('duplica la V1'))
    expect(bad.body.mode).toBe('local')

    expect((await agent.get('/api/billing')).body.aiCredits.used).toBe(0)
  })

  it('respeta el tiempo máximo de la IA', async () => {
    withAi(2000)
    const { agent } = await signup(server)
    mockFetch(
      (_body, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const started = Date.now()
    const res = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('agrega una corredera de 1500x1200'))
    expect(Date.now() - started).toBeLessThan(6000)
    expect(res.body).toMatchObject({ mode: 'local', reason: 'ai_error' })
    expect(res.body.notice).toMatch(/demoró/)
    expect(res.body.message.toolCalls?.[0].name).toBe('add_window')
  }, 15000)

  it('sin saldo pasa a modo local sin llamar a la IA', async () => {
    withAi()
    const { agent, me } = await signup(server)
    await server.deps.db.insert(aiUsage).values({ id: newId(), orgId: me.org.id, userId: me.user.id, credits: 500, mode: 'ai', model: 'x' })
    const { fn } = mockFetch(() => aiReply({ content: 'no debería' }))
    const res = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('cambia todo a nogal'))
    expect(fn).not.toHaveBeenCalled()
    expect(res.body).toMatchObject({ mode: 'local', reason: 'no_credits', creditsLeft: 0 })
    expect(res.body.notice).toMatch(/créditos/)
    expect(JSON.parse(res.body.message.toolCalls![0].arguments)).toEqual({ all: true, color: expect.stringMatching(/^nogal$/i) })
  })

  it('pedidos simultáneos no sobregiran los créditos ni llaman a la IA sin saldo que los respalde', async () => {
    withAi()
    const { agent, me } = await signup(server)
    // Quedan 3 de 500; cada respuesta de la IA cuesta 5 créditos (5.000 tokens) y demora.
    await server.deps.db.insert(aiUsage).values({ id: newId(), orgId: me.org.id, userId: me.user.id, credits: 497, mode: 'ai', model: 'x' })
    const { fn } = mockFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return aiReply({ content: 'Listo.' }, { total_tokens: 5000 })
    })
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => agent.post<AssistantChatResponse>('/api/assistant/chat', ask('duplica la V1', { route: '/cotizaciones/abc', quoteId: 'abc' }))),
    )
    const rows = await server.deps.db.select({ credits: aiUsage.credits }).from(aiUsage).where(eq(aiUsage.orgId, me.org.id))
    const used = rows.reduce((sum, r) => sum + r.credits, 0)
    expect(used).toBeLessThanOrEqual(500)

    const ai = responses.filter((r) => r.body.mode === 'ai')
    const local = responses.filter((r) => r.body.mode === 'local')
    expect(ai.length).toBeGreaterThanOrEqual(1)
    // Cada llamada pagada a la IA tuvo saldo reservado; las demás se resolvieron en modo local.
    expect(fn).toHaveBeenCalledTimes(ai.length)
    expect(ai.length).toBeLessThan(4)
    for (const r of local) expect(r.body).toMatchObject({ reason: 'no_credits', creditsUsed: 0, creditsLeft: 0 })
    expect(497 + ai.reduce((sum, r) => sum + r.body.creditsUsed, 0)).toBe(used)
    expect((await agent.get('/api/assistant/status')).body).toMatchObject({ reason: 'no_credits', creditsLeft: 0 })
  })

  it('plan Taller (sin IA) o prueba vencida: modo local', async () => {
    withAi()
    const { agent, me } = await signup(server)
    await server.deps.db.update(subscriptions).set({ plan: 'taller', status: 'active' }).where(eq(subscriptions.orgId, me.org.id))
    const { fn } = mockFetch(() => aiReply({ content: 'no debería' }))
    const res = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('abre la cotización 412'))
    expect(fn).not.toHaveBeenCalled()
    expect(res.body).toMatchObject({ mode: 'local', reason: 'plan' })
    expect(JSON.parse(res.body.message.toolCalls![0].arguments)).toEqual({ number: 412 })

    const other = await signup(server)
    await server.deps.db
      .update(subscriptions)
      .set({ trialEndsAt: new Date(Date.now() - 86_400_000) })
      .where(eq(subscriptions.orgId, other.me.org.id))
    const expired = await other.agent.post<AssistantChatResponse>('/api/assistant/chat', ask('descuento 5%'))
    expect(expired.status).toBe(200)
    expect(expired.body.mode).toBe('local')
  })

  it('«prefer: local» fuerza el intérprete aunque haya IA', async () => {
    withAi()
    const { agent } = await signup(server)
    const { fn } = mockFetch(() => aiReply({ content: 'no debería' }))
    const res = await agent.post<AssistantChatResponse>('/api/assistant/chat', ask('ve al taller', { route: '/inicio', prefer: 'local' }))
    expect(fn).not.toHaveBeenCalled()
    expect(res.body).toMatchObject({ mode: 'local', reason: 'forced' })
  })

  it('GET /api/assistant/status informa modo y saldo', async () => {
    const { agent, me } = await signup(server)
    expect((await server.agent().get('/api/assistant/status')).status).toBe(401)
    expect((await agent.get('/api/assistant/status')).body).toEqual({ mode: 'local', reason: 'no_key', creditsLeft: 500, creditsIncluded: 500 })
    withAi()
    expect((await agent.get('/api/assistant/status')).body).toEqual({ mode: 'ai', creditsLeft: 500, creditsIncluded: 500 })
    await server.deps.db.update(subscriptions).set({ plan: 'taller', status: 'active' }).where(eq(subscriptions.orgId, me.org.id))
    expect((await agent.get('/api/assistant/status')).body).toMatchObject({ mode: 'local', reason: 'plan', creditsIncluded: 0 })
  })
})

describe('servicios de IA', () => {
  it('lee la configuración del entorno', () => {
    expect(aiConfigFromEnv({})).toBeNull()
    expect(aiConfigFromEnv({ AI_API_KEY: 'k', AI_BASE_URL: 'https://x.test/v1/', AI_MODEL: 'm' })).toEqual({
      apiKey: 'k',
      baseUrl: 'https://x.test/v1',
      model: 'm',
      timeoutMs: 25000,
    })
  })

  it('acota el historial sin cortar un bucle de herramientas', () => {
    const history = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? ('assistant' as const) : ('user' as const), content: `m${i}` }))
    const out = toOpenAiMessages(history, 10)
    expect(out[0]).toMatchObject({ role: 'user' })
    expect(out.length).toBeLessThanOrEqual(11)
    expect(out.at(-1)).toMatchObject({ content: 'm39' })
  })
})
