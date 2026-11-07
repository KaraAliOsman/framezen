/**
 * Reglas que salieron de oír al asistente con un modelo real: una pregunta no cambia datos, lo que
 * no existe no se reemplaza en silencio, el contexto del turno no rompe la caché del proveedor. El
 * proveedor aquí es simulado: esto prueba nuestro lado, no el modelo.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '@dekopen/engine'
import { eq } from 'drizzle-orm'
import { LOCALES } from '@dekopen/shared'
import { conversations } from '../src/db/schema'
import { appendMessage, historyForModel } from '../src/services/assistant/conversations'
import { assistantText } from '../src/services/assistant/i18n'
import { withTurnContext } from '../src/services/assistant/loop'
import { pendingForModel } from '../src/services/assistant/tools/common'
import { closestNames } from '../src/services/assistant/resolve'
import { signup, startServer, type TestServer } from './helpers'
import { P, createQuote, lastDone, ofType, sendTurn, sentContext, sentMessages, withMockAi } from './assistant-v2-support'

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

const quotesOf = async (agent: Awaited<ReturnType<typeof signup>>['agent']) => (await agent.get('/api/quotes')).body.total as number

describe('una pregunta no es una orden', () => {
  it('estimate_window da el precio del motor sin crear ni cambiar nada', async () => {
    const { agent } = await signup(server)
    const mock = withMockAi([{ toolCalls: [{ name: 'estimate_window', arguments: { typology: 'casement', width: 1000, height: 1000 } }] }, { content: 'Sale tanto.' }])
    const res = await sendTurn(agent, '¿cuánto sale una ventana de 1 por 1?', { mode: 'full' })
    expect(ofType(res.events, 'tool.executed')).toHaveLength(1)
    expect(await quotesOf(agent)).toBe(0)
    const result = sentMessages(mock, 1).at(-1).content as string
    expect(result).toContain('"saved":false')
    expect(result).toMatch(/"unitNet":\d+/)
  })

  it('en modo Chat también está disponible: no cambia datos', async () => {
    const { agent } = await signup(server)
    const mock = withMockAi([{ content: 'Hola.' }])
    await sendTurn(agent, 'hola', { mode: 'chat' })
    expect((mock.requests[0]!.body.tools as any[]).map((t) => t.function.name)).toContain('estimate_window')
    expect((mock.requests[0]!.body.tools as any[]).map((t) => t.function.name)).not.toContain('add_assembly')
  })
})

describe('lo que no existe no se reemplaza', () => {
  it.each([
    ['add_window', { width: 1000, height: 1000, color: 'Azul marciano' }, /Azul marciano.{0,4} is not in the catalogue/],
    ['add_window', { width: 1000, height: 1000, line: 'Línea Fantasma 9000' }, /Línea Fantasma 9000.{0,4} is not in the catalogue/],
    ['estimate_window', { width: 1000, height: 1000, glass: 'Cuádruple de plasma' }, /plasma.{0,4} is not in the catalogue/],
    ['create_quote', { client: 'Rojas', items: [{ width: 1000, height: 1000, color: 'Azul marciano' }] }, /is not in the catalogue/],
  ])('%s falla sin crear nada', async (name, args, message) => {
    const { agent } = await signup(server)
    const mock = withMockAi([{ toolCalls: [{ name, arguments: args }] }, { content: 'No existe.' }])
    const res = await sendTurn(agent, 'dale', { mode: 'full' })
    expect(ofType(res.events, 'tool.failed')).toHaveLength(1)
    expect(await quotesOf(agent)).toBe(0)
    expect(sentMessages(mock, 1).at(-1).content).toMatch(message)
  })

  it('update_window no toca la ventana si el color no existe', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    withMockAi([{ toolCalls: [{ name: 'add_window', arguments: { quoteId: quote.id, width: 1000, height: 1000 } }] }, { content: 'ok' }])
    await sendTurn(agent, 'agrega', { mode: 'full' })
    const before = (await agent.get(`/api/quotes/${quote.id}`)).body.items[0].design.colorId
    const mock = withMockAi([{ toolCalls: [{ name: 'update_window', arguments: { quoteId: quote.id, ref: 'V1', color: 'Azul marciano' } }] }, { content: 'No existe.' }])
    await sendTurn(agent, 'cámbiala', { mode: 'full' })
    expect(sentMessages(mock, 1).at(-1).content).toContain('Nothing was changed')
    expect((await agent.get(`/api/quotes/${quote.id}`)).body.items[0].design.colorId).toBe(before)
  })

  it('una búsqueda vacía en el catálogo lo dice, para no probar con otras palabras', async () => {
    const { agent } = await signup(server)
    const mock = withMockAi([{ toolCalls: [{ name: 'get_catalog', arguments: { section: 'glass', query: 'plasma' } }] }, { content: 'No hay.' }])
    await sendTurn(agent, 'tienes vidrio de plasma?', { mode: 'chat' })
    expect(sentMessages(mock, 1).at(-1).content).toContain('Do not search again')
  })

  it('las alternativas salen de nombres reales, o no se ofrece ninguna', () => {
    expect(closestNames(['Roble dorado', 'Nogal', 'Roble gris'], 'roble azul')).toEqual(['Roble dorado', 'Roble gris'])
    expect(closestNames(['Nogal', 'Blanco'], 'azul marciano')).toEqual([])
  })
})

describe('conjuntos de ventanas', () => {
  const quoteWith = async (agent: Awaited<ReturnType<typeof signup>>['agent'], locale: string) => {
    const quote = await createQuote(agent)
    const ui = { route: `/cotizaciones/${quote.id}`, quoteId: quote.id, locale }
    return { quote, ui }
  }

  it.each(LOCALES)('%s: sin poste se crea como en el editor y dice lo que quedó fuera, sin «no encontré»', async (locale) => {
    const { agent } = await signup(server)
    withMockAi([])
    const { quote, ui } = await quoteWith(agent, locale)
    const res = await agent.post(P.localTurns, {
      text: 'bow',
      mode: 'full',
      ui,
      plan: { interpretation: 'bow', confidence: 1, calls: [{ id: 'c1', tool: 'add_assembly', args: { preset: 'bow', panes: 5, width: 700, height: 1400, quoteId: quote.id } }] },
      reply: 'ok',
    })
    expect(res.status).toBe(200)
    const run = res.body.toolRuns[0]
    expect(run).toMatchObject({ tool: 'add_assembly', status: 'executed' })
    const saved = (await agent.get(`/api/quotes/${quote.id}`)).body
    expect(saved.items[0].design.assembly.kind).toBe('bow')
    expect(saved.items[0].design.assembly.root.children).toHaveLength(5)
    const text = assistantText(locale, 'CLP')
    expect(saved.totals.pendingItems ?? 0).toBeGreaterThan(0)
    expect(run.result.summary).toContain(text.t('pending.joint'))
    expect(run.result.summary).not.toContain(text.t('failure.not_found'))
  })

  it('al modelo le llega la unión pendiente con su motivo', async () => {
    const { agent } = await signup(server)
    const mock = withMockAi([{ toolCalls: [{ name: 'add_assembly', arguments: { preset: 'bow', panes: 5, width: 700, height: 1400 } }] }, { content: 'Listo.' }])
    const res = await sendTurn(agent, 'agrega un bow window', { mode: 'full' })
    expect(ofType(res.events, 'tool.executed')).toHaveLength(1)
    const content = sentMessages(mock, 1).at(-1).content as string
    expect(content).toContain('joint_missing')
    expect(content).toContain('the line has no coupling profile or post for this joint')
  })

  it('unir sin pieza de acople también avisa, sin fallar', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    withMockAi([
      { toolCalls: [{ name: 'add_window', arguments: { quoteId: quote.id, typology: 'fixed', width: 1000, height: 1200 } }, { name: 'add_window', arguments: { quoteId: quote.id, typology: 'fixed', width: 800, height: 1200 } }] },
      { content: 'ok' },
    ])
    await sendTurn(agent, 'agrega', { mode: 'full' })
    withMockAi([{ toolCalls: [{ name: 'join_windows', arguments: { quoteId: quote.id, items: ['V1', 'V2'], angle: 135 } }] }, { content: 'ok' }])
    const res = await sendTurn(agent, 'une en ángulo', { mode: 'full' })
    expect(ofType(res.events, 'tool.failed')).toHaveLength(0)
    expect((await agent.get(`/api/quotes/${quote.id}`)).body.items).toHaveLength(1)
  })
})

describe('contexto del turno y caché del proveedor', () => {
  it('el sistema es idéntico entre empresas, personas, modos y pantallas', async () => {
    const a = await signup(server)
    const b = await signup(server)
    const quote = await createQuote(a.agent)
    const mock = withMockAi([{ content: 'a' }, { content: 'b' }, { content: 'c' }])
    await sendTurn(a.agent, 'hola', { mode: 'full' })
    await sendTurn(a.agent, 'hola', { mode: 'supervised', ui: { route: `/cotizaciones/${quote.id}`, quoteId: quote.id, locale: 'es' } })
    await sendTurn(b.agent, 'hola', { mode: 'full' })
    const system = (n: number) => sentMessages(mock, n)[0].content
    expect(system(1)).toBe(system(0))
    expect(system(2)).toBe(system(0))
    expect(sentContext(mock, 1)).toContain('CURRENT MODE: SUPERVISED')
  })

  it('el contexto no se guarda ni se repite en turnos anteriores', async () => {
    const { agent } = await signup(server)
    const mock = withMockAi([{ content: 'Hola.' }, { content: 'Sigo.' }])
    const first = await sendTurn(agent, 'hola', { mode: 'full' })
    await sendTurn(agent, 'sigue', { mode: 'full', conversationId: lastDone(first.events)!.conversationId })
    const contexts = sentMessages(mock, 1).filter((m) => m.role === 'user' && m.content.includes('<turn_context>'))
    expect(contexts).toHaveLength(1)
    expect(sentMessages(mock, 1).find((m) => m.role === 'user').content).toBe('hola')
  })

  it('después de una aprobación el contexto vuelve al último mensaje de la persona', () => {
    const history = [
      { role: 'user' as const, content: 'cámbiala' },
      { role: 'assistant' as const, content: '', tool_calls: [{ id: 't', type: 'function' as const, function: { name: 'x', arguments: '{}' } }] },
      { role: 'tool' as const, tool_call_id: 't', content: '{}' },
    ]
    const messages = withTurnContext(history, '<turn_context>x</turn_context>')
    expect(messages[0]!.content).toBe('<turn_context>x</turn_context>\n\ncámbiala')
    expect(messages.slice(1)).toEqual(history.slice(1))
    expect(history[0]!.content).toBe('cámbiala')
  })

  it('el historial se recorta a saltos: entre un turno y otro no cambia dónde empieza', async () => {
    const { agent } = await signup(server)
    withMockAi([{ content: 'Hola.' }])
    const first = await sendTurn(agent, 'hola', { mode: 'chat' })
    const id = lastDone(first.events)!.conversationId
    const [conversation] = await server.deps.db.select().from(conversations).where(eq(conversations.id, id))
    const say = (text: string) => appendMessage(server.deps, conversation!, { role: 'user', source: 'ai', parts: [], text })
    for (let i = 0; i < 12; i++) await say(`${i} ${'x'.repeat(2000)}`)
    const before = await historyForModel(server.deps, conversation!, 12_000)
    await say('uno corto')
    const after = await historyForModel(server.deps, conversation!, 12_000)
    expect(before.length).toBeLessThan(13)
    expect(after[0]).toEqual(before[0])
    expect(after.length).toBe(before.length + 1)
  })
})

describe('unir ventanas que ya están en la cotización', () => {
  const twoWindows = async (agent: Awaited<ReturnType<typeof signup>>['agent'], qty = 1) => {
    const quote = await createQuote(agent)
    withMockAi([
      {
        toolCalls: [
          { name: 'add_window', arguments: { quoteId: quote.id, typology: 'fixed', width: 1000, height: 1200, qty } },
          { name: 'add_window', arguments: { quoteId: quote.id, typology: 'casement', width: 800, height: 1200 } },
        ],
      },
      { content: 'ok' },
    ])
    await sendTurn(agent, 'agrega', { mode: 'full' })
    return quote
  }

  it('quedan como un solo ítem, se conserva cada diseño y se puede deshacer', async () => {
    const { agent } = await signup(server)
    const quote = await twoWindows(agent)
    withMockAi([{ toolCalls: [{ name: 'join_windows', arguments: { quoteId: quote.id, items: ['V1', 'V2'] } }] }, { content: 'Unidas.' }])
    const res = await sendTurn(agent, 'une la V1 con la V2', { mode: 'full' })
    const run = ofType(res.events, 'tool.executed')[0]!.toolRun
    const joined = (await agent.get(`/api/quotes/${quote.id}`)).body
    expect(joined.items).toHaveLength(1)
    expect(joined.items[0].ref).toBe('V1')
    const units = joined.items[0].design.assembly.root.children
    expect(units).toHaveLength(2)
    expect(units.map((u: any) => u.design.width)).toEqual([1000, 800])
    const undone = await agent.post(P.toolRunUndo(run.id), {})
    expect(undone.status).toBe(200)
    expect((await agent.get(`/api/quotes/${quote.id}`)).body.items).toHaveLength(2)
  })

  it('con cantidades distintas no une y explica por qué', async () => {
    const { agent } = await signup(server)
    const quote = await twoWindows(agent, 3)
    const mock = withMockAi([{ toolCalls: [{ name: 'join_windows', arguments: { quoteId: quote.id, items: ['V1', 'V2'] } }] }, { content: 'No se puede.' }])
    await sendTurn(agent, 'une', { mode: 'full' })
    expect(sentMessages(mock, 1).at(-1).content).toContain('V1 has 3, V2 has 1')
    expect((await agent.get(`/api/quotes/${quote.id}`)).body.items).toHaveLength(2)
  })

  it('una referencia que no existe no toca nada', async () => {
    const { agent } = await signup(server)
    const quote = await twoWindows(agent)
    const mock = withMockAi([{ toolCalls: [{ name: 'join_windows', arguments: { quoteId: quote.id, items: ['V1', 'V9'] } }] }, { content: 'No existe.' }])
    await sendTurn(agent, 'une', { mode: 'full' })
    expect(sentMessages(mock, 1).at(-1).content).toContain('V9')
    expect((await agent.get(`/api/quotes/${quote.id}`)).body.items).toHaveLength(2)
  })

  it('un comando local también llega al servidor, sin modelo', async () => {
    const { agent } = await signup(server)
    const quote = await twoWindows(agent)
    withMockAi([])
    const res = await agent.post(P.localTurns, {
      text: 'une la V1 con la V2',
      mode: 'full',
      ui: { route: `/cotizaciones/${quote.id}`, quoteId: quote.id, locale: 'es' },
      plan: { interpretation: 'unir', confidence: 1, calls: [{ id: 'c1', tool: 'join_windows', args: { items: ['V1', 'V2'], quoteId: quote.id } }] },
      reply: 'Listo.',
    })
    expect(res.status).toBe(200)
    expect(res.body.toolRuns[0]).toMatchObject({ tool: 'join_windows', status: 'executed' })
    expect((await agent.get(`/api/quotes/${quote.id}`)).body.items).toHaveLength(1)
  })

  it('en Supervisado queda como propuesta', async () => {
    const { agent } = await signup(server)
    const quote = await twoWindows(agent)
    withMockAi([{ toolCalls: [{ name: 'join_windows', arguments: { quoteId: quote.id, items: ['V1', 'V2'] } }] }])
    const res = await sendTurn(agent, 'une', { mode: 'supervised' })
    expect(ofType(res.events, 'tool.proposed')).toHaveLength(1)
    expect((await agent.get(`/api/quotes/${quote.id}`)).body.items).toHaveLength(2)
  })
})

describe('lo que queda pendiente se explica', () => {
  const catalog = { profiles: [{ code: 'P70', name: 'Marco 70' }], items: [{ code: 'H1', name: 'Bisagra' }] } as unknown as Catalog

  it('nombra lo que falta en palabras, no con códigos internos', () => {
    const entry = pendingForModel(
      { ref: 'V2' },
      {
        unitNet: 0,
        pending: [
          { code: 'price_missing', ref: 'REF' },
          { code: 'price_missing', ref: 'P70 (Nogal)' },
          { code: 'price_missing', ref: 'H1' },
          { code: 'hardware_missing', ref: 'herraje' },
          { code: 'joint_missing', ref: 'unión A-B' },
        ],
      },
      catalog,
    )!
    expect(entry.scope).toContain('whole window')
    expect(entry.missing).toEqual([
      { code: 'price_missing', what: 'steel reinforcement', why: 'the line has no reinforcement steel assigned in the catalogue' },
      { code: 'price_missing', what: 'Marco 70 (P70) (Nogal)', why: 'this material has no price in the catalogue' },
      { code: 'price_missing', what: 'Bisagra (H1)', why: 'this material has no price in the catalogue' },
      { code: 'hardware_missing', what: 'herraje', why: 'there is no hardware for this opening or size' },
      { code: 'joint_missing', what: 'unión A-B', why: 'the line has no coupling profile or post for this joint' },
    ])
  })

  it('en un conjunto distingue la parte que quedó fuera y su unidad', () => {
    const entry = pendingForModel({ ref: 'V1' }, { unitNet: 500_000, pending: [{ code: 'price_missing', ref: 'H1', unitId: 'B' }] }, catalog)!
    expect(entry.scope).toContain('part of this assembly')
    expect(entry.missing[0]).toMatchObject({ unit: 'B' })
  })

  it('sin faltantes no dice nada', () => {
    expect(pendingForModel({ ref: 'V1' }, { unitNet: 100 }, catalog)).toBeUndefined()
  })

  it('sin perfil o precio dice qué falta, de qué ventana, y que el total no lo incluye', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    // Una guillotina depende de perfiles que la línea de prueba no tiene: queda pendiente.
    const first = withMockAi([{ toolCalls: [{ name: 'add_window', arguments: { quoteId: quote.id, typology: 'vertical_sliding', width: 900, height: 1500 } }] }, { content: 'ok' }])
    await sendTurn(agent, 'agrega', { mode: 'full' })
    const result = sentMessages(first, 1).at(-1).content as string
    expect(result).toContain('"pending"')
    expect(result).toContain('"ref":"V1"')
    expect(result).toMatch(/"what":"[^"]+","why":"[^"]+"/)
    expect(result).toContain('out of the total')

    const read = withMockAi([{ toolCalls: [{ name: 'explain_price', arguments: { quoteId: quote.id, ref: 'V1' } }] }, { content: 'ok' }])
    await sendTurn(agent, 'cuánto sale la V1', { mode: 'chat' })
    expect(sentMessages(read, 1).at(-1).content).toContain('"pending"')
  })
})
