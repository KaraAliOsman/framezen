import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Quote } from '@framezen/shared'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server?.close()
})

describe('aislamiento entre organizaciones', () => {
  it('una empresa no ve ni toca cotizaciones, clientes ni OT de otra', async () => {
    const a = await signup(server, { company: 'Ventanas Norte' })
    const b = await signup(server, { company: 'Ventanas Sur' })

    const client = await a.agent.post('/api/clients', { name: 'Pedro Soto', rut: '12.345.678-5', city: 'Temuco' })
    expect(client.status).toBe(201)
    const design = await sampleDesign(a.agent)
    const quote = await a.agent.post<Quote>('/api/quotes', { clientId: client.body.id, items: [item(design)] })
    expect(quote.status).toBe(201)
    const id = quote.body.id

    // Listas vacías para B.
    expect((await b.agent.get('/api/quotes')).body).toEqual({ items: [], total: 0 })
    expect((await b.agent.get('/api/clients')).body).toEqual({ items: [], total: 0 })
    expect((await b.agent.get(`/api/quotes?clientId=${client.body.id}`)).body.total).toBe(0)
    expect((await b.agent.get('/api/clients?q=Pedro')).body.total).toBe(0)

    // Acceso directo por id: 404 (no revela que existe).
    expect((await b.agent.get(`/api/quotes/${id}`)).status).toBe(404)
    expect((await b.agent.get(`/api/clients/${client.body.id}`)).status).toBe(404)
    expect((await b.agent.put(`/api/quotes/${id}`, { version: quote.body.version, title: 'Hackeada' })).status).toBe(404)
    expect((await b.agent.post(`/api/quotes/${id}/duplicate`)).status).toBe(404)
    expect((await b.agent.post(`/api/quotes/${id}/send`)).status).toBe(404)
    expect((await b.agent.post(`/api/quotes/${id}/status`, { status: 'accepted' })).status).toBe(404)
    expect((await b.agent.delete(`/api/quotes/${id}`)).status).toBe(404)
    expect((await b.agent.patch(`/api/clients/${client.body.id}`, { name: 'Otro' })).status).toBe(404)
    expect((await b.agent.delete(`/api/clients/${client.body.id}`)).status).toBe(404)
    expect((await b.agent.post('/api/work-orders', { quoteId: id })).status).toBe(404)

    // No puede colgar su cotización de un cliente ajeno.
    const foreign = await b.agent.post('/api/quotes', { clientId: client.body.id })
    expect(foreign.status).toBe(400)
    expect(foreign.body.error.field).toBe('clientId')

    // A sigue intacto.
    const mine = await a.agent.get<Quote>(`/api/quotes/${id}`)
    expect(mine.status).toBe(200)
    expect(mine.body.title).not.toBe('Hackeada')
    expect(mine.body.client?.name).toBe('Pedro Soto')

    // OT y actividad tampoco se cruzan.
    const wo = await a.agent.post('/api/work-orders', { quoteId: id })
    expect(wo.status).toBe(201)
    expect((await b.agent.get(`/api/work-orders/${wo.body.id}`)).status).toBe(404)
    expect((await b.agent.patch(`/api/work-orders/${wo.body.id}`, { notes: 'x' })).status).toBe(404)
    expect((await b.agent.get('/api/work-orders')).body.total).toBe(0)
    const activityB = (await b.agent.get('/api/activity')).body
    expect(activityB.items.every((e: { text: string }) => !e.text.includes('Pedro Soto'))).toBe(true)

    // La numeración es por organización: ambas parten en 1.
    const bQuote = await b.agent.post<Quote>('/api/quotes', {})
    expect(quote.body.number).toBe(1)
    expect(bQuote.body.number).toBe(1)
  })

  it('las rutas privadas exigen sesión', async () => {
    const anon = server.agent()
    for (const path of ['/api/me', '/api/quotes', '/api/clients', '/api/catalog', '/api/settings', '/api/work-orders', '/api/billing', '/api/team', '/api/activity']) {
      const res = await anon.get(path)
      expect(res.status, path).toBe(401)
      expect(res.body.error.code).toBe('unauthorized')
    }
  })
})
