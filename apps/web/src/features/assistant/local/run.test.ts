import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeLocalReply, lastUndoable, undoReceipt } from '../conversation'
import type { ToolOutcome } from '../executor'
import { useAssistantPanel } from '../store'
import { fakeEditor, fakeWorld, type FakeWorld } from '../testing'
import type { LocalToolEnv } from './route'
import { runLocalPlan, type LocalRunDeps } from './run'

function toolsFor(world: FakeWorld, extra: Partial<LocalToolEnv> = {}): LocalToolEnv {
  return {
    navigate: vi.fn(),
    getEditor: () => world.env.getEditor(),
    waitForEditor: world.env.waitForEditor,
    setLocale: vi.fn(),
    setTheme: vi.fn(),
    setZoom: vi.fn(),
    downloadCuts: vi.fn(async () => undefined),
    openAssistantEditor: vi.fn(),
    openMemory: vi.fn(),
    panel: { switchAssistant: vi.fn(), setMode: vi.fn(), newConversation: vi.fn() },
    downloadQuotePdf: vi.fn(async () => true),
    printQuotePdf: vi.fn(),
    setQuoteMargin: vi.fn(async () => ({ ok: true })),
    ...extra,
  }
}

function deps(world: FakeWorld, extra: Partial<LocalRunDeps> = {}): LocalRunDeps {
  return {
    store: useAssistantPanel,
    env: (approve) => ({ ...world.env, approve }),
    remember: vi.fn(async () => undefined),
    undoLastServerRun: vi.fn(async () => null),
    tools: toolsFor(world),
    ...extra,
  }
}

const call = (tool: string, args: Record<string, unknown> = {}) => ({ id: `c-${tool}`, tool, args })

beforeEach(() => {
  useAssistantPanel.getState().clearSession()
  useAssistantPanel.getState().bindSession('u1:o1')
})

afterEach(() => {
  useAssistantPanel.getState().clearSession()
})

describe('comando local en el navegador', () => {
  it('ejecuta en el editor, deja recibo con deshacer, «Entendí» y la respuesta (0 créditos)', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    const result = await runLocalPlan(
      'dos oscilobatientes de 60x120',
      { calls: [call('add_window', { typology: 'tilt_turn', width: 600, height: 1200, qty: 2 })], interpretation: '2 × Oscilobatiente · 600 × 1.200 mm' },
      deps(world),
    )
    expect(result.reply).toBe('Listo.')
    expect(result.serverCalls).toEqual([])
    const { entries, busy, face } = useAssistantPanel.getState()
    expect(busy).toBe(false)
    expect(face).toBe('done')
    expect(entries.map((e) => e.role)).toEqual(['user', 'assistant'])
    const reply = entries[1]
    expect(reply).toMatchObject({ status: 'done', text: 'Listo.', source: 'local', credits: 0, interpretation: '2 × Oscilobatiente · 600 × 1.200 mm' })
    expect(reply.receipts?.[0]).toMatchObject({ text: 'Agregué V1 · Oscilobatiente 600 × 1.200 mm · 2 u', undoable: true })
    // «Deshacer» del recibo.
    const receipt = lastUndoable(entries)!
    expect(undoReceipt(useAssistantPanel, receipt.id)).toBe(true)
    expect(editor.quote.items).toHaveLength(0)
    expect(useAssistantPanel.getState().entries[1].receipts?.[0]).toMatchObject({ undone: true })
  })

  it('«deshacer» deshace el último recibo local; si no hay, prueba con la última acción del servidor', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    const d = deps(world)
    await runLocalPlan('agrega una corredera', { calls: [call('add_window', { typology: 'sliding_2', width: 1500, height: 1200 })], interpretation: 'x' }, d)
    expect(editor.quote.items).toHaveLength(1)
    const undo = await runLocalPlan('deshacer', { calls: [call('undo')], interpretation: 'deshacer lo último' }, d)
    expect(editor.quote.items).toHaveLength(0)
    expect(undo.reply).toMatch(/^Deshice: agregué V1/)

    const again = await runLocalPlan('deshacer', { calls: [call('undo')], interpretation: 'deshacer lo último' }, d)
    expect(d.undoLastServerRun).toHaveBeenCalled()
    expect(again.reply).toBe('No tengo nada reciente que deshacer. En el editor también funciona Ctrl+Z.')
  })

  it('«recuerda que…» va a la memoria del servidor', async () => {
    const world = fakeWorld()
    const d = deps(world)
    const result = await runLocalPlan('recuerda que usamos termopanel', { calls: [call('remember', { content: 'usamos termopanel' })], interpretation: 'recordar' }, d)
    expect(d.remember).toHaveBeenCalledWith('usamos termopanel')
    expect(result.reply).toBe('Lo voy a recordar: «usamos termopanel».')
  })

  it('una herramienta que solo sabe hacer el servidor queda pendiente para él', async () => {
    const world = fakeWorld()
    const result = await runLocalPlan('crea el cliente Soto', { calls: [call('create_client', { name: 'Soto' })], interpretation: 'cliente Soto' }, deps(world))
    expect(result.reply).toBeUndefined()
    expect(result.serverCalls).toEqual([call('create_client', { name: 'Soto' })])
    expect(useAssistantPanel.getState().entries[1]).toMatchObject({ status: 'pending' })
  })

  it('navegar, cambiar de modo y tema se resuelven en el navegador (sin servidor)', async () => {
    const world = fakeWorld()
    const tools = toolsFor(world)
    const result = await runLocalPlan(
      've a ajustes de idioma, tema oscuro y modo chat',
      { calls: [call('navigate', { to: 'settings', section: 'idioma' }), call('set_theme', { theme: 'dark' }), call('set_assistant_mode', { mode: 'chat' })], interpretation: 'x' },
      deps(world, { tools }),
    )
    expect(tools.navigate).toHaveBeenCalledWith('/ajustes/idioma')
    expect(tools.setTheme).toHaveBeenCalledWith('dark')
    expect(tools.panel.setMode).toHaveBeenCalledWith('chat')
    expect(result.serverCalls).toEqual([])
    expect(result.reply).toBe('Te llevé a idioma y región. Listo. Cambié al modo Chat.')
  })

  it('cambiar de asistente o empezar otra conversación se hace al final, tras la respuesta', async () => {
    const world = fakeWorld()
    const tools = toolsFor(world)
    await runLocalPlan('habla con Sofía', { calls: [call('switch_assistant', { assistantId: 'a2' })], interpretation: 'x' }, deps(world, { tools }))
    expect(tools.panel.switchAssistant).toHaveBeenCalledWith('a2')
  })

  it('el margen de una cotización se guarda en sus ajustes de precio', async () => {
    const world = fakeWorld()
    const tools = toolsFor(world)
    const result = await runLocalPlan('margen 30', { calls: [call('set_margin', { percent: 30, mode: 'margin' })], interpretation: 'x' }, deps(world, { tools }))
    expect(tools.setQuoteMargin).toHaveBeenCalledWith({}, { percent: 30, mode: 'margin' })
    expect(result.reply).toMatch(/margen de 30\s?%/)
  })

  it('una herramienta del editor que apunta a OTRA cotización va al servidor', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    const result = await runLocalPlan('descuento 10 a la cotización 99', { calls: [call('set_discount', { percent: 10, number: 99 })], interpretation: 'x' }, deps(world))
    expect(result.serverCalls).toEqual([call('set_discount', { percent: 10, number: 99 })])
    expect(editor.quote.discountPct).toBe(0)
  })

  it('moneda e idioma de documentos juntos se piden al servidor como dos llamadas', async () => {
    const world = fakeWorld()
    const result = await runLocalPlan('x', { calls: [call('update_settings', { document_locale: 'en', currency: 'USD' })], interpretation: 'x' }, deps(world))
    expect(result.serverCalls.map((c) => c.args)).toEqual([{ document_locale: 'en' }, { currency: 'USD' }])
  })

  it('una respuesta sin herramientas (ayuda) se muestra tal cual', async () => {
    const world = fakeWorld()
    const result = await runLocalPlan('ayuda', { calls: [], interpretation: 'ayuda', reply: 'Puedo armar…' }, deps(world))
    expect(result.reply).toBe('Puedo armar…')
    expect(useAssistantPanel.getState().entries[1]).toMatchObject({ text: 'Puedo armar…', status: 'done' })
  })

  it('el envío pide confirmación en la conversación y no envía si dices que no', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    await runLocalPlan('agrega una corredera', { calls: [call('add_window', { typology: 'sliding_2', width: 1500, height: 1200 })], interpretation: 'x' }, deps(world))
    const pending = runLocalPlan('envíala por link', { calls: [call('send_quote', { channel: 'link' })], interpretation: 'enviar' }, deps(world))
    await vi.waitFor(() => expect(useAssistantPanel.getState().entries.at(-1)?.approval?.status).toBe('pending'))
    const { resolveApproval } = await import('../conversation')
    resolveApproval(useAssistantPanel.getState().entries.at(-1)!.id, false)
    const result = await pending
    expect(world.sent).toEqual([])
    expect(result.reply).toBe('Listo, no la envié.')
  })
})

describe('composeLocalReply', () => {
  const out = (say?: string): ToolOutcome => ({ callId: 'c', name: 'x', ok: true, result: {}, receipts: [], notes: [], step: '', say })
  it('un solo «Listo.» al comienzo y sin repetir frases', () => {
    expect(composeLocalReply([out('Listo.'), out('Listo.')])).toBe('Listo.')
    expect(composeLocalReply([out('Listo.'), out('Te dejé la vista del documento.')])).toBe('Listo. Te dejé la vista del documento.')
    expect(composeLocalReply([out('Listo, se puede deshacer.'), out('Listo.')])).toBe('Listo, se puede deshacer.')
    expect(composeLocalReply([])).toBe('No hice cambios.')
  })
})
