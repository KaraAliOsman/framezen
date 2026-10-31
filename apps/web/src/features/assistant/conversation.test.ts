import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesign } from '@framezen/engine'
import { SAMPLE_DEFAULTS } from '@framezen/catalog'
import { parseLocalCommand, type AssistantChatRequest, type AssistantChatResponse } from '@framezen/shared'
import { ApiRequestError } from '../../lib/api'
import { composeLocalReply, lastUndoable, runTurn, undoReceipt, type ConversationDeps } from './conversation'
import { useMarcoStore } from './store'
import { buildAssistantContext, buildLocalContext } from './summary'
import { fakeEditor, fakeWorld, type FakeWorld } from './testing'

function deps(world: FakeWorld, transport: ConversationDeps['transport']): ConversationDeps {
  return {
    transport,
    env: (approve) => ({ ...world.env, approve }),
    context: () => buildAssistantContext(world.path, world.editor?.bridge ?? null),
    localContext: () => buildLocalContext(world.path, world.editor?.bridge ?? null),
    store: useMarcoStore,
  }
}

/** Servidor en modo local: el mismo intérprete que usa el backend. */
const localServer = vi.fn(async (req: AssistantChatRequest): Promise<AssistantChatResponse> => {
  const last = req.messages[req.messages.length - 1]
  const parsed = parseLocalCommand(last.content, { quoteOpen: Boolean(req.context.quoteId) })
  const base = { creditsUsed: 0, creditsLeft: 500, mode: 'local' as const, reason: 'no_key' as const }
  return 'toolCalls' in parsed
    ? { ...base, message: { role: 'assistant', content: '', toolCalls: parsed.toolCalls }, ...(parsed.notes ? { notes: parsed.notes } : {}) }
    : { ...base, message: { role: 'assistant', content: parsed.reply } }
})

beforeEach(() => {
  useMarcoStore.getState().reset()
  localServer.mockClear()
})

describe('turno con Marco', () => {
  it('modo local: ejecuta, muestra recibos con deshacer y responde breve', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    await runTurn('dos oscilobatientes de 60x120', deps(world, localServer), new AbortController().signal)
    expect(localServer).toHaveBeenCalledTimes(1)
    const { entries, history, marco, busy, mode } = useMarcoStore.getState()
    expect(busy).toBe(false)
    expect(marco).toBe('done')
    expect(mode).toBe('local')
    const reply = entries.at(-1)!
    expect(reply).toMatchObject({ role: 'assistant', status: 'done', text: 'Listo.', mode: 'local' })
    expect(reply.receipts?.[0]).toMatchObject({ text: 'Agregué V1 · Oscilobatiente 600 × 1.200 mm · 2 u', undoable: true })
    expect(reply.notes?.[0]).toMatch(/centímetros/)
    // Historial: usuario, llamada, resultado y resumen local.
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    // «Deshacer» del recibo.
    const receipt = lastUndoable(entries)!
    expect(undoReceipt(useMarcoStore, receipt.id)).toBe(true)
    expect(editor.quote.items).toHaveLength(0)
    expect(useMarcoStore.getState().entries.at(-1)!.receipts?.[0]).toMatchObject({ undone: true })
  })

  it('con IA: bucle de herramientas hasta la respuesta final, con el contexto de la pantalla', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(createDesign('fixed', { ...SAMPLE_DEFAULTS, width: 1200, height: 1000 }))
    const world = fakeWorld({ editor })
    const requests: AssistantChatRequest[] = []
    const ai = vi.fn(async (req: AssistantChatRequest): Promise<AssistantChatResponse> => {
      requests.push(JSON.parse(JSON.stringify(req)))
      if (requests.length === 1) {
        return {
          mode: 'ai',
          creditsUsed: 2,
          creditsLeft: 498,
          message: { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'update_window', arguments: '{"ref":"V1","color":"nogal"}' }, { id: 'c2', name: 'explain_price', arguments: '{"ref":"V1"}' }] },
        }
      }
      return { mode: 'ai', creditsUsed: 1, creditsLeft: 497, message: { role: 'assistant', content: 'Listo, la V1 quedó en nogal.' } }
    })
    const onCredits = vi.fn()
    await runTurn('pasa la V1 a nogal y dime cuánto sale', { ...deps(world, ai), onCredits }, new AbortController().signal)
    expect(ai).toHaveBeenCalledTimes(2)
    expect(requests[0].context).toMatchObject({ route: '/cotizaciones/q1', quoteId: 'q1', refs: ['V1'] })
    expect(requests[0].context.summary).toMatch(/Cotización N° 7 «Casa Soto»/)
    expect(requests[0].context.summary).toMatch(/V1: Paño fijo/)
    const second = requests[1].messages
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool'])
    expect(JSON.parse(second[2].content)).toMatchObject({ ok: true, changed: ['V1'] })
    expect(JSON.parse(second[3].content)).toMatchObject({ ok: true, ref: 'V1', unitNet: expect.any(Number) })
    const reply = useMarcoStore.getState().entries.at(-1)!
    expect(reply.text).toBe('Listo, la V1 quedó en nogal.')
    expect(reply.receipts?.[0].text).toBe('Cambié V1: Nogal')
    expect(reply.cards?.[0].kind).toBe('price')
    expect(useMarcoStore.getState()).toMatchObject({ mode: 'ai', credits: 497 })
    expect(onCredits).toHaveBeenCalled()
  })

  it('sin conexión con el servidor: resuelve aquí mismo en modo local y lo avisa', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    const offline = vi.fn(async () => {
      throw new ApiRequestError(0, 'network', 'sin red')
    })
    await runTurn('agrega una corredera de 1500 x 1200', deps(world, offline), new AbortController().signal)
    expect(editor.quote.items).toHaveLength(1)
    const reply = useMarcoStore.getState().entries.at(-1)!
    expect(reply.notice).toMatch(/Sin conexión/)
    expect(reply.status).toBe('done')
    expect(useMarcoStore.getState().reason).toBe('offline')
  })

  it('errores que no son de red se muestran en lenguaje humano, sin perder nada', async () => {
    const world = fakeWorld({ editor: fakeEditor() })
    const limited = vi.fn(async () => {
      throw new ApiRequestError(429, 'too_many_requests', 'Vamos muy rápido. Espera 20 s y sigo contigo.')
    })
    await runTurn('descuento 5%', deps(world, limited), new AbortController().signal)
    const state = useMarcoStore.getState()
    expect(state.marco).toBe('error')
    expect(state.entries.at(-1)).toMatchObject({ status: 'error' })
    expect(state.entries.at(-1)!.text).toMatch(/Vamos muy rápido.*Tu cotización está a salvo/)
  })

  it('el envío espera tu visto bueno en una tarjeta', async () => {
    const editor = fakeEditor({ client: { id: 'c1', name: 'Juan Pérez', email: 'juan@correo.cl', createdAt: '', updatedAt: '' }, clientId: 'c1' })
    editor.bridge.addItem(createDesign('fixed', { ...SAMPLE_DEFAULTS, width: 1200, height: 1000 }))
    const world = fakeWorld({ editor })
    const turn = runTurn('envíasela por correo', deps(world, localServer), new AbortController().signal)
    await vi.waitFor(() => expect(useMarcoStore.getState().marco).toBe('approval'))
    const entry = useMarcoStore.getState().entries.at(-1)!
    expect(entry.approval).toMatchObject({ status: 'pending', title: '¿Envío la cotización N° 7 a Juan Pérez?', confirmLabel: 'Sí, enviar' })
    const { resolveApproval } = await import('./conversation')
    resolveApproval(entry.id, true)
    await turn
    expect(world.sent).toHaveLength(1)
    expect(useMarcoStore.getState().entries.at(-1)!.approval?.status).toBe('approved')
  })

  it('«Detener» corta el turno y deja lo hecho', async () => {
    const world = fakeWorld({ editor: fakeEditor() })
    const controller = new AbortController()
    const slow = vi.fn(
      (_req: AssistantChatRequest, signal: AbortSignal) =>
        new Promise<AssistantChatResponse>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const turn = runTurn('hola', deps(world, slow), controller.signal)
    controller.abort()
    await turn
    expect(useMarcoStore.getState().entries.at(-1)).toMatchObject({ status: 'stopped', text: 'Me detuve.' })
    expect(useMarcoStore.getState().busy).toBe(false)
  })

  it('compone la respuesta local sin repetir «Listo.»', () => {
    const o = (say: string, ok = true) => ({ callId: 'x', name: 'x', ok, result: {}, receipts: [], notes: [], step: '', say })
    expect(composeLocalReply([o('Listo.'), o('Listo.')])).toBe('Listo.')
    expect(composeLocalReply([o('Listo.'), o('Te llevé a Taller.')])).toBe('Listo. Te llevé a Taller.')
    expect(composeLocalReply([o('No encontré la V9 en esta cotización.', false)])).toBe('No encontré la V9 en esta cotización.')
  })
})
