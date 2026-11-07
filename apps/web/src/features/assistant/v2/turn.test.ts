import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTurnResponse, Message, ToolRun, TurnEvent } from '@dekopen/shared'
import { useAssistantPanel } from '../store'
import { createTurnRunner } from './turn'

const message = (id: string, text: string, extra: Partial<Message> = {}): Message =>
  ({ id, conversationId: 'c1', seq: 1, role: 'assistant', source: 'ai', parts: text ? [{ type: 'text', text }] : [], createdAt: '2026-11-01T12:00:00Z', ...extra }) as unknown as Message

const run = (id: string, status: ToolRun['status'], extra: Partial<ToolRun> = {}): ToolRun =>
  ({ id, toolCallId: `call-${id}`, tool: 'add_window', risk: 'write', status, args: {}, argsHash: 'h', undoable: true, createdAt: '2026-11-01T12:00:00Z', ...extra }) as unknown as ToolRun

function setup(events: TurnEvent[] = []) {
  const onUi = vi.fn()
  const onAffected = vi.fn()
  const api = {
    turn: vi.fn(async (_req: unknown, onEvent: (e: TurnEvent) => void) => events.forEach(onEvent)),
    approve: vi.fn(async (_id: string, _body: unknown, onEvent: (e: TurnEvent) => void) => events.forEach(onEvent)),
    reject: vi.fn(async (_id: string, _body: unknown, onEvent: (e: TurnEvent) => void) => events.forEach(onEvent)),
    localTurn: vi.fn(async (): Promise<LocalTurnResponse> => ({ conversation: { id: 'c1' }, messages: [], toolRuns: [], events: [] }) as unknown as LocalTurnResponse),
  }
  const runner = createTurnRunner({ store: useAssistantPanel, api, onUi, onAffected, flush: async () => undefined })
  return { api, runner, onUi, onAffected }
}

beforeEach(() => {
  useAssistantPanel.getState().clearSession()
  useAssistantPanel.getState().bindSession('u1:o1')
})
afterEach(() => useAssistantPanel.getState().clearSession())

describe('turno con IA', () => {
  it('el texto llega en trozos, la propuesta queda pendiente y el turno cierra esperando aprobación', async () => {
    const proposed = run('r1', 'proposed')
    const { runner } = setup([
      { type: 'turn.started', conversation: { id: 'c1' }, userMessage: message('u-srv', 'agrega', { role: 'user' }), assistantMessageId: 'm1' } as unknown as TurnEvent,
      { type: 'message.delta', messageId: 'm1', text: 'Agrego ' },
      { type: 'message.delta', messageId: 'm1', text: 'la ventana.' },
      { type: 'tool.proposed', toolRun: proposed },
      { type: 'message.done', message: message('m1', 'Agrego la ventana.') },
      { type: 'done', reason: 'approval_required', conversationId: 'c1', creditsUsed: 2 },
    ])
    const outcome = await runner.run({ text: 'agrega', mode: 'supervised', ui: { route: '/', locale: 'es' } })
    expect(outcome.reason).toBe('approval_required')
    const state = useAssistantPanel.getState()
    const entry = state.entries.find((e) => e.role === 'assistant')!
    expect(entry).toMatchObject({ id: 'm1', text: 'Agrego la ventana.', approvals: ['r1'] })
    expect(state.toolRuns.r1.status).toBe('proposed')
    expect(state.face).toBe('approval')
  })

  it('al aprobar, el mensaje original que reenvía el servidor no duplica su texto', async () => {
    // Estado previo: la propuesta ya está en la conversación, con su texto.
    const store = useAssistantPanel.getState()
    store.addEntry({ id: 'm1', role: 'assistant', text: 'Agrego la ventana.', at: 1, status: 'done', source: 'ai', approvals: ['r1'] })
    store.upsertToolRun(run('r1', 'proposed'))
    const executed = run('r1', 'executed')
    const { runner, onAffected } = setup([
      { type: 'tool.executed', toolRun: executed, summary: 'Agregué V1' } as unknown as TurnEvent,
      { type: 'affected', entities: [{ type: 'quote', id: 'q1' }] } as unknown as TurnEvent,
      { type: 'message.done', message: message('m1', 'Agrego la ventana.') },
      { type: 'message.delta', messageId: 'm2', text: 'Listo, ya quedó.' },
      { type: 'message.done', message: message('m2', 'Listo, ya quedó.') },
      { type: 'done', reason: 'completed', conversationId: 'c1', creditsUsed: 2 },
    ])
    await runner.approve(run('r1', 'proposed'))
    const entry = useAssistantPanel.getState().entries.find((e) => e.id === 'm1')!
    expect(entry.text).toBe('Agrego la ventana.\n\nListo, ya quedó.')
    expect(onAffected).toHaveBeenCalledWith([{ type: 'quote', id: 'q1' }])
  })

  it('un corte de red deja lo recibido y ofrece reintentar, sin lanzar', async () => {
    const { api, runner } = setup()
    api.turn.mockImplementationOnce(async (_req: unknown, onEvent: (e: TurnEvent) => void) => {
      onEvent({ type: 'message.delta', messageId: 'm1', text: 'Estoy revisando…' })
      throw new Error('network')
    })
    const outcome = await runner.run({ text: 'hola', mode: 'chat', ui: { route: '/', locale: 'es' } })
    expect(outcome.reason).toBe('error')
    const entry = useAssistantPanel.getState().entries.find((e) => e.role === 'assistant')!
    expect(entry.text).toBe('Estoy revisando…')
    expect(entry.retryText).toBe('hola')
    expect(entry.notices?.length).toBe(1)
  })
})

describe('registro de un comando local', () => {
  it('lo que hizo el servidor se ve en la actividad: no queda el aviso de espera', async () => {
    const { api, runner } = setup()
    const store = useAssistantPanel.getState()
    store.addEntry({ id: 'lu', role: 'user', text: 'crea el cliente Soto', at: 1, source: 'local' })
    store.addEntry({ id: 'la', role: 'assistant', text: 'Eso lo hago en el servidor; te aviso cuando esté.', at: 1, status: 'pending', source: 'local' })
    api.localTurn.mockResolvedValueOnce({
      conversation: { id: 'c1' },
      messages: [message('u-srv', 'crea el cliente Soto', { role: 'user', source: 'local' }), message('a-srv', '', { source: 'local', parts: [{ type: 'tool_call', toolRunId: 'r9', tool: 'create_client', status: 'executed' }] as never })],
      toolRuns: [run('r9', 'executed', { tool: 'create_client' })],
      events: [],
    } as unknown as LocalTurnResponse)
    await runner.logLocal(
      { text: 'crea el cliente Soto', mode: 'full', ui: { route: '/', locale: 'es' }, plan: { interpretation: 'Nuevo cliente', calls: [{ id: 'x', tool: 'create_client', args: { name: 'Soto' } }], confidence: 1 } },
      { user: 'lu', assistant: 'la' },
    )
    const entry = useAssistantPanel.getState().entries.find((e) => e.id === 'a-srv')!
    expect(entry.text).toBe('')
    expect(entry.status).toBe('done')
    expect(entry.activity?.[0]).toMatchObject({ tool: 'create_client', status: 'executed' })
  })
})
