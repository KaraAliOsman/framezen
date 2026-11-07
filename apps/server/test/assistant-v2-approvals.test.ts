import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { ToolRun } from '@dekopen/shared'
import { activity, messages, quotes, toolRuns } from '../src/db/schema'
import { signup, startServer, type Agent, type TestServer } from './helpers'
import { P, approve, createQuote, lastDone, ofType, reject, sendTurn, sentMessages, withMockAi, withoutAi } from './assistant-v2-support'

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

const quoteRow = async (id: string) => (await server.deps.db.select().from(quotes).where(eq(quotes.id, id)))[0]!

/** Propuesta en Supervisado: el modelo pide cambiar el título de la cotización en pantalla. */
async function proposeTitle(agent: Agent, quoteId: string, title: string, after: Parameters<typeof withMockAi>[0] = []) {
  const mock = withMockAi([{ content: 'Te dejo el cambio para aprobar.', reasoning: 'Cambio el título.', toolCalls: [{ name: 'update_quote', arguments: { title } }] }, ...after])
  const res = await sendTurn(agent, `ponle ${title}`, { mode: 'supervised', ui: { route: `/cotizaciones/${quoteId}`, quoteId, locale: 'es' } })
  const run = ofType(res.events, 'tool.proposed')[0]!.toolRun
  return { mock, run, conversationId: lastDone(res.events)!.conversationId }
}

/** Ejecución directa en Acceso total (para deshacer). */
async function executeTitle(agent: Agent, quoteId: string, title: string): Promise<ToolRun> {
  withMockAi([{ toolCalls: [{ name: 'update_quote', arguments: { title } }] }, { content: 'Listo.' }])
  const res = await sendTurn(agent, `ponle ${title}`, { mode: 'full', ui: { route: '/', quoteId, locale: 'es' } })
  return ofType(res.events, 'tool.executed')[0]!.toolRun
}

describe('asistente v2 — aprobaciones', () => {
  it('ganancia 120 en una cotización: va como recargo solo en esa cotización', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const other = await createQuote(agent)
    withMockAi([{ toolCalls: [{ name: 'update_quote', arguments: { margin_pct: 120 } }] }, { content: 'Listo, 120 % de recargo sobre el costo.' }])
    const res = await sendTurn(agent, 'ganancia 120', { mode: 'full', ui: { route: `/cotizaciones/${quote.id}`, quoteId: quote.id, locale: 'es' } })
    expect(ofType(res.events, 'tool.executed')).toHaveLength(1)
    expect((await quoteRow(quote.id)).data.pricing).toMatchObject({ marginPct: 120, marginMode: 'markup' })
    expect((await quoteRow(other.id)).data.pricing?.marginPct).toBeUndefined()
    const settings = await agent.get('/api/settings')
    expect(settings.body.pricing.marginPct).not.toBe(120)
  })

  it('aprobar ejecuta exactamente lo propuesto con la sesión de la persona y el modelo continúa', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const { mock, run } = await proposeTitle(agent, quote.id, 'Casa Lagos II', [{ reasoning: 'R-cont', content: 'Listo, ya quedó como Casa Lagos II.' }])
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos')

    const res = await approve(agent, run.id, run.argsHash)
    expect(res.status).toBe(200)
    const types = res.events.map((e) => e.type)
    expect(types[0]).toBe('tool.executed')
    expect(types).toContain('affected')
    expect(types).toContain('message.delta')
    expect(types.at(-1)).toBe('done')
    expect(ofType(res.events, 'tool.executed')[0]!.toolRun).toMatchObject({ id: run.id, status: 'executed', undoable: true })
    // La tarjeta original queda aprobada (message.done del mensaje que la contenía).
    const card = ofType(res.events, 'message.done')[0]!.message
    expect(card.parts.find((p) => p.type === 'approval')).toMatchObject({ toolRunId: run.id, status: 'approved' })
    expect(lastDone(res.events)).toMatchObject({ reason: 'completed' })
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos II')

    // El modelo recibió el resultado real de la herramienta (mismo id de llamada) y su razonamiento previo.
    const sent = sentMessages(mock, 1)
    const tool = sent.find((m) => m.role === 'tool')
    expect(tool.content).toContain('"status":"executed"')
    expect(sent.find((m) => m.role === 'assistant').tool_calls[0].id).toBe(tool.tool_call_id)

    // Repetir la misma aprobación no vuelve a ejecutar nada.
    const replay = await approve(agent, run.id, run.argsHash)
    expect(replay.status).toBe(409)
    expect(replay.body).toMatchObject({ error: { code: 'approval_expired' }, status: 'executed' })
  })

  it('argumentos alterados (otra huella) → 409 approval_mismatch y no se ejecuta', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const { run } = await proposeTitle(agent, quote.id, 'Casa Alterada')
    const res = await approve(agent, run.id, 'f'.repeat(40))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('approval_mismatch')
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos')
    // Manipular los argumentos en la base tampoco sirve: la huella ya no calza.
    await server.deps.db.update(toolRuns).set({ args: { title: 'Otra cosa', quoteId: quote.id } }).where(eq(toolRuns.id, run.id))
    const tampered = await approve(agent, run.id, run.argsHash)
    expect(tampered.status).toBe(409)
    expect(tampered.body.error.code).toBe('approval_mismatch')
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos')
  })

  it('una lista de ventanas se aprueba de corrido: la primera no invalida a las demás', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    withMockAi([
      {
        content: 'Te dejo las ventanas.',
        toolCalls: [
          { name: 'add_window', arguments: { typology: 'fixed', width: 800, height: 600 } },
          { name: 'add_window', arguments: { typology: 'fixed', width: 900, height: 700 } },
        ],
      },
      { content: 'Listo.' },
    ])
    const res = await sendTurn(agent, 'agrega las ventanas del plano', { mode: 'supervised', ui: { route: `/cotizaciones/${quote.id}`, quoteId: quote.id, locale: 'es' } })
    const runs = ofType(res.events, 'tool.proposed').map((e) => e.toolRun)
    expect(runs).toHaveLength(2)
    for (const run of runs) expect((await approve(agent, run.id, run.argsHash)).status).toBe(200)
    const saved = (await agent.get(`/api/quotes/${quote.id}`)).body
    expect(saved.items.map((i: { ref: string }) => i.ref)).toEqual(['V1', 'V2'])
  })

  it('propuesta vencida → 409 approval_expired y queda marcada como vencida', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const { run, conversationId } = await proposeTitle(agent, quote.id, 'Casa Vieja')
    await server.deps.db.update(toolRuns).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(toolRuns.id, run.id))
    const res = await approve(agent, run.id, run.argsHash)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('approval_expired')
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos')
    const list = await agent.get(`${P.toolRuns}?conversationId=${conversationId}&status=expired`)
    expect(list.body.items.map((r: ToolRun) => r.id)).toEqual([run.id])
    const detail = await agent.get(P.conversation(conversationId))
    const card = detail.body.messages.flatMap((m: any) => m.parts).find((p: any) => p.type === 'approval')
    expect(card.status).toBe('expired')
  })

  it('si la cotización cambió desde la propuesta, se actualiza la tarjeta y se pide revisar de nuevo', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const { run } = await proposeTitle(agent, quote.id, 'Casa Nueva')
    const current = (await agent.get(`/api/quotes/${quote.id}`)).body
    expect((await agent.put(`/api/quotes/${quote.id}`, { title: 'Editada a mano', version: current.version })).status).toBe(200)
    const res = await approve(agent, run.id, run.argsHash)
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: { code: 'approval_mismatch' }, refreshed: true })
    expect(res.body.toolRun.preview.changes[0]).toMatchObject({ before: 'Editada a mano', after: 'Casa Nueva' })
    expect((await quoteRow(quote.id)).title).toBe('Editada a mano')
    // Con la vista previa ya revisada (misma huella: los argumentos no cambian) sí se aprueba.
    withMockAi([{ content: 'Listo.' }])
    const ok = await approve(agent, run.id, res.body.toolRun.argsHash)
    expect(ok.status).toBe(200)
    expect((await quoteRow(quote.id)).title).toBe('Casa Nueva')
  })

  it('rechazar no ejecuta nada, responde sin gastar créditos y el modelo lo sabe en el turno siguiente', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const { mock, run, conversationId } = await proposeTitle(agent, quote.id, 'Casa Rechazada')
    const res = await reject(agent, run.id, 'prefiero el título actual')
    expect(res.status).toBe(200)
    expect(mock.requests).toHaveLength(1)
    const reply = ofType(res.events, 'message.done').at(-1)!.message
    expect(reply.parts[0]).toMatchObject({ type: 'text', text: 'Entendido, no lo hice. Motivo: prefiero el título actual' })
    expect(lastDone(res.events)).toMatchObject({ reason: 'completed', creditsUsed: 0 })
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos')
    expect((await approve(agent, run.id, run.argsHash)).status).toBe(409)

    const next = withMockAi([{ content: 'Ok.' }])
    await sendTurn(agent, '¿y ahora?', { conversationId, mode: 'supervised' })
    const tool = sentMessages(next, 0).find((m) => m.role === 'tool')
    expect(tool.content).toContain('"status":"rejected"')
    expect(tool.content).toContain('prefiero el título actual')
  })

  it('rechazar cuando el mismo mensaje también leyó datos: tampoco gasta una vuelta del modelo', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const mock = withMockAi([{ toolCalls: [{ name: 'get_quote', arguments: {} }, { name: 'update_quote', arguments: { discount: 10 } }] }])
    const res = await sendTurn(agent, 'mírala y ponle 10%', { mode: 'supervised', ui: { route: '/', quoteId: quote.id, locale: 'es' } })
    const run = ofType(res.events, 'tool.proposed')[0]!.toolRun
    expect(run.preview?.changes?.[0]).toMatchObject({ field: 'discount' })
    const rejected = await reject(agent, run.id)
    expect(mock.requests).toHaveLength(1)
    expect(ofType(rejected.events, 'message.done').at(-1)!.message.parts[0]).toMatchObject({ type: 'text', text: 'Entendido, no lo hice.' })
  })

  it('bajar a Chat invalida las propuestas pendientes', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const { run, conversationId } = await proposeTitle(agent, quote.id, 'Casa Chat')
    const patched = await agent.patch(P.conversation(conversationId), { mode: 'chat' })
    expect(patched.body.mode).toBe('chat')
    const res = await approve(agent, run.id, run.argsHash)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('approval_expired')
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos')
  })

  it('aprobar sin IA disponible: ejecuta y responde con el resumen, sin modelo', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const { run } = await proposeTitle(agent, quote.id, 'Casa Sin IA')
    withoutAi()
    const res = await approve(agent, run.id, run.argsHash)
    expect(res.status).toBe(200)
    const reply = ofType(res.events, 'message.done').at(-1)!.message
    expect(reply.source).toBe('system')
    expect(reply.parts[0]).toMatchObject({ type: 'text' })
    expect((reply.parts[0] as { text: string }).text).toMatch(/Casa Sin IA/)
    expect(lastDone(res.events)).toMatchObject({ reason: 'completed', creditsUsed: 0 })
  })

  it('con varias propuestas del mismo mensaje, se espera a decidirlas todas antes de continuar', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const mock = withMockAi([
      { toolCalls: [{ name: 'update_quote', arguments: { title: 'Doble' } }, { name: 'update_quote', arguments: { discount: 5 } }] },
      { content: 'Hice ambos cambios.' },
    ])
    const res = await sendTurn(agent, 'título Doble y 5% de descuento', { mode: 'supervised', ui: { route: '/', quoteId: quote.id, locale: 'es' } })
    const [first, second] = ofType(res.events, 'tool.proposed').map((e) => e.toolRun)
    const a = await approve(agent, first!.id, first!.argsHash)
    expect(lastDone(a.events)?.reason).toBe('approval_required')
    expect(mock.requests).toHaveLength(1)
    const b = await approve(agent, second!.id, second!.argsHash)
    expect(lastDone(b.events)?.reason).toBe('completed')
    expect(mock.requests).toHaveLength(2)
    const row = await quoteRow(quote.id)
    expect(row.title).toBe('Doble')
  })
})

describe('asistente v2 — auditoría', () => {
  it('cada acción queda en tool_runs y en la actividad marcada como del asistente (deshacer incluido)', async () => {
    const { agent, me } = await signup(server)
    withMockAi([{ toolCalls: [{ name: 'create_client', arguments: { name: 'Inmobiliaria Sur' } }] }, { content: 'Creado.' }])
    const res = await sendTurn(agent, 'crea el cliente Inmobiliaria Sur', { mode: 'full' })
    const run = ofType(res.events, 'tool.executed')[0]!.toolRun
    expect(run).toMatchObject({ tool: 'create_client', status: 'executed', undoable: true })
    const log = await server.deps.db.select().from(activity).where(eq(activity.orgId, me.org.id))
    const created = log.find((a) => a.kind === 'client.created')!
    expect(created.meta).toMatchObject({ via: 'assistant', toolRunId: run.id, tool: 'create_client', conversationId: lastDone(res.events)!.conversationId })
    const undo = await agent.post(P.toolRunUndo(run.id))
    expect(undo.status).toBe(200)
    expect(undo.body.affected).toEqual([{ type: 'client', id: created.subjectId }])
    expect((await agent.get(`/api/clients/${created.subjectId}`)).status).toBe(404)
  })
})

describe('asistente v2 — deshacer', () => {
  it('deshace con la ruta fija guardada, deja una nota en la conversación y no se puede repetir', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const run = await executeTitle(agent, quote.id, 'Casa Deshacer')
    expect((await quoteRow(quote.id)).title).toBe('Casa Deshacer')
    const res = await agent.post(P.toolRunUndo(run.id))
    expect(res.status).toBe(200)
    expect(res.body.toolRun).toMatchObject({ id: run.id, status: 'undone', undoable: false })
    expect(res.body.affected).toEqual([{ type: 'quote', id: quote.id }])
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos')
    const again = await agent.post(P.toolRunUndo(run.id))
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('undo_unavailable')
    const notes = await server.deps.db.select().from(messages).where(eq(messages.role, 'system_note'))
    expect(notes.some((n) => n.text.startsWith('Deshiciste: '))).toBe(true)
  })

  it('si alguien cambió la cotización después, 409 undo_conflict y no se pisa su trabajo', async () => {
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const run = await executeTitle(agent, quote.id, 'Casa Bot')
    const current = (await agent.get(`/api/quotes/${quote.id}`)).body
    expect((await agent.put(`/api/quotes/${quote.id}`, { title: 'Trabajo humano', version: current.version })).status).toBe(200)
    const res = await agent.post(P.toolRunUndo(run.id))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('undo_conflict')
    expect((await quoteRow(quote.id)).title).toBe('Trabajo humano')
    // La acción sigue registrada como ejecutada (se puede revisar a mano).
    const [row] = await server.deps.db.select().from(toolRuns).where(eq(toolRuns.id, run.id))
    expect(row!.status).toBe('executed')
  })

  it('una lectura no se puede deshacer', async () => {
    withMockAi([{ toolCalls: [{ name: 'get_quote', arguments: {} }] }, { content: 'ok' }])
    const { agent } = await signup(server)
    const quote = await createQuote(agent)
    const res = await sendTurn(agent, 'mira', { mode: 'full', ui: { route: '/', quoteId: quote.id, locale: 'es' } })
    const run = ofType(res.events, 'tool.executed')[0]!.toolRun
    expect(run.undoable).toBe(false)
    expect((await agent.post(P.toolRunUndo(run.id))).status).toBe(409)
  })
})

describe('asistente v2 — aislamiento entre organizaciones', () => {
  it('nadie aprueba, rechaza, deshace ni lista acciones de otra organización', async () => {
    const a = await signup(server)
    const b = await signup(server)
    const quote = await createQuote(a.agent)
    const { run, conversationId } = await proposeTitle(a.agent, quote.id, 'Casa Ajena')
    expect((await approve(b.agent, run.id, run.argsHash)).status).toBe(404)
    expect((await reject(b.agent, run.id)).status).toBe(404)
    expect((await b.agent.post(P.toolRunUndo(run.id))).status).toBe(404)
    expect((await b.agent.get(`${P.toolRuns}?conversationId=${conversationId}`)).body.items).toEqual([])
    expect((await b.agent.get(P.conversation(conversationId))).status).toBe(404)
    expect((await b.agent.get(P.messages(conversationId))).status).toBe(404)
    expect((await quoteRow(quote.id)).title).toBe('Casa Lagos')
    // El dueño sí la ve.
    expect((await a.agent.get(`${P.toolRuns}?status=proposed`)).body.items.map((r: ToolRun) => r.id)).toEqual([run.id])
  })
})
