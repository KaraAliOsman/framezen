import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AGENT_TOOL_NAMES, AGENT_TOOLS, type Quote, type WorkOrder } from '@dekopen/shared'
import { AGENT_ROUTES } from '../src/services/assistant/routes-map'
import { TOOL_HANDLERS } from '../src/services/assistant/tools'
import { buildAgentSystemPrompt } from '../src/services/assistant/prompt'
import { signup, startServer, type Agent, type TestServer } from './helpers'
import { P, ofType, sendTurn, withMockAi } from './assistant-v2-support'

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

const full = { mode: 'full' as const, ui: { route: '/', locale: 'es' as const } }

/** Crea una cotización con ventanas usando la misma herramienta del agente. */
async function quoteWith(agent: Agent, count: number, title = 'Obra'): Promise<Quote> {
  const items = Array.from({ length: count }, () => ({ typology: 'casement', width: 1000, height: 1200 }))
  withMockAi([{ toolCalls: [{ name: 'create_quote', arguments: { title, items, open: false } }] }, { content: 'Listo.' }])
  const res = await sendTurn(agent, 'arma la cotización', full)
  const run = ofType(res.events, 'tool.executed')[0]!.toolRun
  expect(run.status).toBe('executed')
  const list = (await agent.get<{ items: { id: string; title: string }[] }>('/api/quotes')).body.items
  return (await agent.get<Quote>(`/api/quotes/${list.find((q) => q.title === title)!.id}`)).body
}

async function orderOf(agent: Agent, quote: Quote): Promise<WorkOrder> {
  return (await agent.post<WorkOrder>('/api/work-orders', { quoteId: quote.id })).body
}

describe('Marco mueve ventanas entre estaciones', () => {
  it('«aksesuar takmadaki tüm camları kalite kontrole gönder» mueve solo esas, en todas las OT, y se deshace', async () => {
    const { agent } = await signup(server)
    const a = await quoteWith(agent, 3, 'Winchester')
    const b = await quoteWith(agent, 2, 'Lagos')
    const first = await orderOf(agent, a)
    const second = await orderOf(agent, b)
    const refs = a.items.map((i) => i.ref)
    await agent.patch(`/api/work-orders/${first.id}`, { progress: { [refs[0]!]: 'hardware', [refs[1]!]: 'hardware', [refs[2]!]: 'glazing' } })
    await agent.patch(`/api/work-orders/${second.id}`, { progress: { [b.items[0]!.ref]: 'hardware' } })

    const mock = withMockAi([{ toolCalls: [{ name: 'move_windows_to_station', arguments: { from_station: 'hardware', to_station: 'qc' } }] }, { content: 'Listo.' }])
    const res = await sendTurn(agent, 'aksesuar takmadaki tum camlari kalite kontrole gonder', full)
    const run = ofType(res.events, 'tool.executed')[0]!.toolRun
    expect(run).toMatchObject({ tool: 'move_windows_to_station', status: 'executed', undoable: true })

    const after = (await agent.get<WorkOrder>(`/api/work-orders/${first.id}`)).body
    expect(after.progress).toMatchObject({ [refs[0]!]: 'qc', [refs[1]!]: 'qc', [refs[2]!]: 'glazing' })
    expect((await agent.get<WorkOrder>(`/api/work-orders/${second.id}`)).body.progress[b.items[0]!.ref]).toBe('qc')
    expect(ofType(res.events, 'affected').flatMap((e) => e.entities).map((e) => e.type)).toContain('work_order')

    // El modelo recibe qué se movió, no solo «ok».
    const result = JSON.stringify(mock.requests.at(-1))
    expect(result).toContain(`\\"moved\\":3`)

    const undo = await agent.post(P.toolRunUndo(run.id))
    expect(undo.status).toBe(200)
    expect((await agent.get<WorkOrder>(`/api/work-orders/${first.id}`)).body.progress).toMatchObject({ [refs[0]!]: 'hardware', [refs[1]!]: 'hardware', [refs[2]!]: 'glazing' })
    expect((await agent.get<WorkOrder>(`/api/work-orders/${second.id}`)).body.progress[b.items[0]!.ref]).toBe('hardware')
  })

  it('sin nada que mover lo dice con lo que encontró, y una ventana que no existe no toca nada', async () => {
    const { agent } = await signup(server)
    const quote = await quoteWith(agent, 1, 'Sola')
    const order = await orderOf(agent, quote)
    withMockAi([{ toolCalls: [{ name: 'move_windows_to_station', arguments: { from_station: 'hardware', to_station: 'qc' } }] }, { toolCalls: [{ name: 'move_windows_to_station', arguments: { number: order.number, to_station: 'qc', refs: ['V99'] } }] }, { content: 'Listo.' }])
    const res = await sendTurn(agent, 'pasa a control lo de herrajes', full)
    expect(ofType(res.events, 'tool.executed')[0]!.toolRun.status).toBe('executed')
    expect(ofType(res.events, 'tool.failed')[0]!.error.code).toBe('not_found')
    expect((await agent.get<WorkOrder>(`/api/work-orders/${order.id}`)).body.progress[quote.items[0]!.ref]).toBe('cut')
  })

  it('leer una OT da cada ventana con su estación, control de calidad incluido', async () => {
    const { agent } = await signup(server)
    const quote = await quoteWith(agent, 2, 'Lectura')
    const order = await orderOf(agent, quote)
    await agent.patch(`/api/work-orders/${order.id}`, { progress: { [quote.items[0]!.ref]: 'qc' } })
    const mock = withMockAi([{ toolCalls: [{ name: 'get_work_order', arguments: { number: order.number } }, { name: 'list_work_orders', arguments: { station: 'qc' } }] }, { content: 'Listo.' }])
    await sendTurn(agent, '¿qué hay en control?', full)
    const sent = JSON.stringify(mock.requests.at(-1))
    expect(sent).toContain(`\\"station\\":\\"qc\\"`)
    expect(sent).toContain(`\\"windowsByStation\\":{\\"cut\\":1,\\"qc\\":1}`)
  })
})

describe('Marco opera la cotización', () => {
  it('extras, línea comercial, orden y dirección de obra quedan guardados y se deshacen', async () => {
    const { agent } = await signup(server)
    const quote = await quoteWith(agent, 3, 'Comercial')
    const [v1, v2, v3] = quote.items
    const ui = { route: `/cotizaciones/${quote.id}`, quoteId: quote.id, locale: 'es' as const }
    withMockAi([
      {
        toolCalls: [
          { name: 'set_quote_extras', arguments: { add: [{ label: 'Flete', amount: 45000 }] } },
          { name: 'update_window_line', arguments: { ref: v1!.ref, manual_unit_price: 123000, discount_pct: 5, floor: 'Piso 2', opening_width: 1020 } },
          { name: 'update_window_line', arguments: { ref: v2!.ref, role: 'optional' } },
          { name: 'reorder_windows', arguments: { order: [v3!.ref, v1!.ref] } },
          { name: 'update_quote', arguments: { site_address: 'Camino Real 123' } },
        ],
      },
      { content: 'Listo.' },
    ])
    const res = await sendTurn(agent, 'ajusta todo', { ...full, ui })
    expect(ofType(res.events, 'tool.failed')).toEqual([])
    const saved = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
    expect(saved.extras).toEqual([expect.objectContaining({ label: 'Flete', amount: 45000, line: true })])
    expect(saved.items.map((i) => i.ref)).toEqual([v3!.ref, v1!.ref, v2!.ref])
    expect(saved.items[1]).toMatchObject({ manualUnitPrice: 123000, discountPct: 5, floor: 'Piso 2', rough: { width: 1020 } })
    expect(saved.items[2]!.role).toBe('optional')
    expect(saved.siteAddress).toBe('Camino Real 123')

    const extraId = saved.extras[0]!.id
    withMockAi([{ toolCalls: [{ name: 'set_quote_extras', arguments: { change: [{ id: extraId, amount: 60000 }] } }] }, { toolCalls: [{ name: 'set_quote_extras', arguments: { remove: [extraId] } }] }, { content: 'Listo.' }])
    const second = await sendTurn(agent, 'sube el flete y después quítalo', { ...full, ui })
    expect(ofType(second.events, 'tool.failed')).toEqual([])
    const undo = await agent.post(P.toolRunUndo(ofType(second.events, 'tool.executed').at(-1)!.toolRun.id))
    expect(undo.status).toBe(200)
    expect((await agent.get<Quote>(`/api/quotes/${quote.id}`)).body.extras[0]).toMatchObject({ id: extraId, amount: 60000 })
  })

  it('registra un abono, lo lee y recupera una cotización de la papelera', async () => {
    const { agent } = await signup(server)
    const quote = await quoteWith(agent, 1, 'Abono')
    const ui = { route: `/cotizaciones/${quote.id}`, quoteId: quote.id, locale: 'es' as const }
    const mock = withMockAi([{ toolCalls: [{ name: 'record_quote_payment', arguments: { amount: 500000, method: 'transfer', reference: 'Transf 88' } }, { name: 'get_quote_payments', arguments: {} }] }, { content: 'Listo.' }])
    const res = await sendTurn(agent, 'me abonaron 500.000 por transferencia', { ...full, ui })
    expect(ofType(res.events, 'tool.failed')).toEqual([])
    expect((await agent.get<{ received: number }>(`/api/quotes/${quote.id}/payments`)).body.received).toBe(500000)
    expect(JSON.stringify(mock.requests.at(-1))).toContain('\\"received\\":500000')

    await agent.delete(`/api/quotes/${quote.id}`)
    withMockAi([{ toolCalls: [{ name: 'list_quotes', arguments: { deleted: true } }, { name: 'restore_quote', arguments: { quoteId: quote.id } }] }, { content: 'Listo.' }])
    const back = await sendTurn(agent, 'recupera la que borré', full)
    expect(ofType(back.events, 'tool.failed')).toEqual([])
    expect((await agent.get(`/api/quotes/${quote.id}`)).status).toBe(200)
  })
})

describe('nada queda fuera de Marco sin una razón', () => {
  /** Rutas que Marco no toca a propósito. Agregar una aquí exige decir por qué. */
  const OUT_OF_SCOPE: Record<string, string> = {
    'GET /api/settings/flow': 'llaves de pago',
    'PUT /api/settings/flow': 'llaves de pago',
    'DELETE /api/settings/flow': 'llaves de pago',
    'POST /api/org/org': 'crear empresas es de la cuenta',
    'GET /api/org/orgs': 'cambiar de empresa es de la sesión',
    'GET /api/quotes/stats': 'get_stats ya calcula estas cifras',
    'GET /api/quotes/:id/revisions/:revision': 'lectura interna',
    'POST /api/quotes/:id/shared': 'share_quote_link va por su propio servicio',
    'GET /api/catalog/brands/:id': 'lectura interna',
    'GET /api/templates/presets': 'list_templates ya las incluye',
    'GET /api/templates/images': 'imágenes: se suben desde el editor',
    'POST /api/templates/images': 'imágenes: se suben desde el editor',
    'GET /api/templates/images/:id': 'imágenes: se suben desde el editor',
    'DELETE /api/templates/images/:id': 'imágenes: se suben desde el editor',
    'POST /api/templates/images/:id/restore': 'imágenes: se suben desde el editor',
    'POST /api/templates/:id/duplicate': 'create_template duplica',
    'GET /api/textures/resolve': 'lectura interna de dibujo',
    'GET /api/textures/:id/image': 'archivo binario',
    'POST /api/textures': 'la foto se sube desde Catálogo',
    'POST /api/textures/drafts/:id': 'la foto se sube desde Catálogo',
    'POST /api/textures/drafts/:id/commit': 'la foto se sube desde Catálogo',
    'DELETE /api/textures/drafts/:id': 'la foto se sube desde Catálogo',
  }
  const FILES: [string, string][] = [
    ['quotes', '/api/quotes'],
    ['quote-payments', '/api/quotes'],
    ['clients', '/api/clients'],
    ['catalog', '/api/catalog'],
    ['work-orders', '/api/work-orders'],
    ['activity', '/api/activity'],
    ['templates', '/api/templates'],
    ['textures', '/api/textures'],
    ['settings', '/api/settings'],
    ['payment-settings', '/api/settings'],
    ['org', '/api/org'],
  ]

  it('toda ruta del negocio tiene herramienta o una razón escrita para no tenerla', () => {
    const covered = new Set(Object.values(AGENT_ROUTES).map((r) => `${r.method} ${r.template}`))
    const missing: string[] = []
    for (const [file, prefix] of FILES) {
      const source = readFileSync(new URL(`../src/routes/${file}.ts`, import.meta.url), 'utf8')
      for (const match of source.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*'(\/[^']*)'/g)) {
        const key = `${match[1]!.toUpperCase()} ${prefix}${match[2] === '/' ? '' : match[2]}`
        if (!covered.has(key) && !OUT_OF_SCOPE[key]) missing.push(key)
      }
    }
    expect(missing).toEqual([])
  })

  it('toda herramienta tiene manejador y Marco conoce las estaciones de verdad', () => {
    for (const name of AGENT_TOOL_NAMES) expect(TOOL_HANDLERS[name], name).toBeTypeOf('function')
    expect(AGENT_TOOLS.move_windows_to_station.risk).toBe('write')
    const prompt = buildAgentSystemPrompt('tr')
    expect(prompt).toContain('qc (quality control)')
    expect(prompt).toContain('move_windows_to_station')
  })
})
