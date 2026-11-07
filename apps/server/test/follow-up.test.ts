import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Quote, QuoteFollowUp, QuoteFollowUpResponse, QuoteStats, SendQuoteResponse, WorkOrder } from '@dekopen/shared'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

const DAY = 86_400_000
let server: TestServer
let clock = new Date('2026-11-05T15:00:00.000Z')
const ahead = (days: number) => {
  clock = new Date(clock.getTime() + days * DAY)
}

beforeAll(async () => {
  server = await startServer({ now: () => clock })
})
afterAll(async () => {
  await server?.close()
})

type Agent = Awaited<ReturnType<typeof signup>>['agent']

async function sentQuote(agent: Agent, title: string): Promise<{ id: string; token: string; response: SendQuoteResponse }> {
  const quote = await agent.post<Quote>('/api/quotes', { title })
  await agent.put(`/api/quotes/${quote.body.id}`, { version: quote.body.version, items: [item(await sampleDesign(agent))] })
  const response = (await agent.post<SendQuoteResponse>(`/api/quotes/${quote.body.id}/send`)).body
  return { id: quote.body.id, token: response.quote.shareToken!, response }
}

const queue = async (agent: Agent): Promise<QuoteFollowUp[]> => (await agent.get<QuoteStats>('/api/quotes/stats')).body.followUps
const titles = (rows: QuoteFollowUp[]) => rows.map((q) => q.title)

describe('vendido del mes frente a «aceptadas»', () => {
  it('una aceptada que pasó a taller sigue vendida, y la cifra dice dónde está', async () => {
    const { agent } = await signup(server)
    const { id, token } = await sentQuote(agent, 'Casa Taller')
    await server.agent().post(`/api/public/quotes/${token}/accept`, { name: 'Marcela Fuentes' })

    const before = (await agent.get<QuoteStats>('/api/quotes/stats')).body
    expect(before.soldThisMonth).toMatchObject({ count: 1, inProduction: 0 })
    expect(before.byStatus.accepted.count).toBe(1)

    await agent.post<WorkOrder>('/api/work-orders', { quoteId: id })
    const after = (await agent.get<QuoteStats>('/api/quotes/stats')).body
    // Esta era la contradicción: 1 vendida y 0 en estado «aceptada». Las dos cifras son ciertas si se distinguen.
    expect(after.soldThisMonth).toMatchObject({ count: 1, inProduction: 1 })
    expect(after.byStatus.accepted.count).toBe(0)
    expect(after.byStatus.workshop.count).toBe(1)
  })
})

describe('cola de seguimiento', () => {
  it('ordena: pidió cambios, aceptó, abrió sin responder, sin abrir', async () => {
    const { agent } = await signup(server)
    const unopened = await sentQuote(agent, 'Sin abrir')
    const opened = await sentQuote(agent, 'Abierta')
    const changes = await sentQuote(agent, 'Con cambios')
    const accepted = await sentQuote(agent, 'Aceptada')
    expect(unopened.response.followUpAt).toBeDefined()

    const portal = server.agent()
    await portal.get(`/api/public/quotes/${opened.token}`)
    const message = `${'Quiero la ventana del living más ancha y el baño con vidrio opaco. '.repeat(8)}Gracias.`
    expect(message.length).toBeGreaterThan(160)
    await portal.post(`/api/public/quotes/${changes.token}/request-changes`, { message, name: 'Marcela' })
    await portal.post(`/api/public/quotes/${accepted.token}/accept`, { name: 'Pedro Soto' })

    // Antes de los 3 días solo está lo que el cliente ya movió.
    expect(titles(await queue(agent)).sort()).toEqual(['Aceptada', 'Con cambios'])

    ahead(4)
    const rows = await queue(agent)
    expect(titles(rows.filter((q) => !q.notices))).toEqual(['Abierta', 'Sin abrir'])
    const withChanges = rows.find((q) => q.title === 'Con cambios')!
    // El mensaje llega entero, sin los 160 caracteres del texto de actividad.
    expect(withChanges.notices).toMatchObject([{ kind: 'changes', who: 'Marcela', message }])
    expect(rows.find((q) => q.title === 'Abierta')!.viewedAt).toBeDefined()
    expect(rows.find((q) => q.title === 'Sin abrir')!.viewedAt).toBeUndefined()
  })

  it('reenviar deja hecha la tarea de «pidió cambios» sin tocar nada más', async () => {
    const { agent } = await signup(server)
    const { id, token } = await sentQuote(agent, 'Reenvío')
    await server.agent().post(`/api/public/quotes/${token}/request-changes`, { message: 'Más ancha, por favor' })
    expect((await queue(agent))[0]!.notices?.[0]?.kind).toBe('changes')

    const quote = (await agent.get<Quote>(`/api/quotes/${id}`)).body
    await agent.put(`/api/quotes/${id}`, { version: quote.version, discountPct: 5 })
    await agent.post(`/api/quotes/${id}/send`)

    expect(await queue(agent)).toEqual([])
    expect((await agent.get('/api/activity?pending=1')).body.items).toEqual([])
  })

  it('aceptar cierra el «pidió cambios» anterior y la cola solo muestra que aceptó', async () => {
    const { agent } = await signup(server)
    const { token } = await sentQuote(agent, 'Cambió de idea')
    const portal = server.agent()
    await portal.post(`/api/public/quotes/${token}/request-changes`, { message: 'Más ancha, por favor' })
    expect((await queue(agent))[0]!.notices?.map((n) => n.kind)).toEqual(['changes'])

    await portal.post(`/api/public/quotes/${token}/accept`, { name: 'Pedro Soto' })

    expect((await queue(agent))[0]!.notices?.map((n) => n.kind)).toEqual(['accepted'])
  })

  it('posponer saca la cotización hasta la fecha y deshacer la devuelve, sin chocar con el autoguardado', async () => {
    const { agent } = await signup(server)
    const { id } = await sentQuote(agent, 'Pospuesta')
    ahead(4)
    expect(titles(await queue(agent))).toEqual(['Pospuesta'])
    const before = (await agent.get<Quote>(`/api/quotes/${id}`)).body

    const later = await agent.post<QuoteFollowUpResponse>(`/api/quotes/${id}/follow-up`, { days: 7 })
    expect(later.status).toBe(200)
    expect(await queue(agent)).toEqual([])
    expect((await agent.get<Quote>(`/api/quotes/${id}`)).body.version).toBe(before.version)

    await agent.post(`/api/quotes/${id}/follow-up`, { at: later.body.previous })
    expect(titles(await queue(agent))).toEqual(['Pospuesta'])

    await agent.post(`/api/quotes/${id}/follow-up`, { days: 1 })
    ahead(1.5)
    expect(titles(await queue(agent))).toEqual(['Pospuesta'])
    expect((await agent.post(`/api/quotes/${id}/follow-up`, { days: 0 })).status).toBe(400)
  })

  it('«Perdida» guarda el motivo, cierra los avisos y volver a enviada lo borra', async () => {
    const { agent } = await signup(server)
    const { id, token } = await sentQuote(agent, 'Perdida')
    await server.agent().post(`/api/public/quotes/${token}/request-changes`, { message: 'Muy cara' })

    const lost = await agent.post<Quote>(`/api/quotes/${id}/status`, { status: 'rejected', lostReason: 'Precio' })
    expect(lost.body.status).toBe('rejected')
    expect(await queue(agent)).toEqual([])
    const list = (await agent.get('/api/quotes')).body.items
    expect(list[0].lostReason).toBe('Precio')
    const feed = (await agent.get('/api/activity')).body.items
    expect(feed[0].text).toContain('perdida: «Precio»')

    await agent.post(`/api/quotes/${id}/status`, { status: 'sent' })
    expect((await agent.get('/api/quotes')).body.items[0].lostReason).toBeUndefined()
  })

  it('el motivo y la fecha de seguimiento nunca llegan al portal del cliente', async () => {
    const { agent } = await signup(server)
    const { id, token } = await sentQuote(agent, 'Portal')
    await agent.post(`/api/quotes/${id}/status`, { status: 'rejected', lostReason: 'Cliente difícil' })
    const quote = (await agent.get<Quote>(`/api/quotes/${id}`)).body
    await agent.put(`/api/quotes/${id}`, { version: quote.version, discountPct: 2 })
    await agent.post(`/api/quotes/${id}/send`)
    const view = await server.agent().get(`/api/public/quotes/${token}`)
    expect(JSON.stringify(view.body)).not.toContain('Cliente difícil')
    expect(JSON.stringify(view.body)).not.toContain('followUpAt')
    expect(JSON.stringify(view.body)).not.toContain('lostReason')
  })

  it('otra organización no toca el seguimiento ajeno', async () => {
    const owner = await signup(server)
    const stranger = await signup(server)
    const { id } = await sentQuote(owner.agent, 'Ajena')
    expect((await stranger.agent.post(`/api/quotes/${id}/follow-up`, { days: 3 })).status).toBe(404)
  })
})
