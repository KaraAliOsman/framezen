import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BillingState, Client, Quote } from '@framezen/shared'
import { signup, startServer, type TestServer } from './helpers'

let server: TestServer
let offsetMs = 0
const DAY = 86_400_000

beforeAll(async () => {
  server = await startServer({ now: () => new Date(Date.now() + offsetMs) })
})
afterAll(async () => {
  await server?.close()
})

describe('plan y modo lectura', () => {
  it('la prueba dura 14 días; al vencer se puede ver todo pero no crear', async () => {
    offsetMs = 0
    const { agent } = await signup(server)
    const quote = await agent.post<Quote>('/api/quotes', { title: 'Antes de vencer' })
    expect(quote.status).toBe(201)
    const billing = await agent.get<BillingState>('/api/billing')
    expect(billing.body.status).toBe('trialing')
    expect(billing.body.seats).toBe(3)
    expect(billing.body.seatsUsed).toBe(1)
    expect(billing.body.provider).toBe('dev')

    offsetMs = 15 * DAY
    try {
      expect((await agent.get<BillingState>('/api/billing')).body.status).toBe('expired')
      expect((await agent.get('/api/quotes')).body.total).toBe(1)
      expect((await agent.get(`/api/quotes/${quote.body.id}`)).status).toBe(200)
      const blocked = await agent.post('/api/quotes', {})
      expect(blocked.status).toBe(402)
      expect(blocked.body.error.code).toBe('read_only')
      expect(blocked.body.error.message).toMatch(/prueba/)
      expect((await agent.put(`/api/quotes/${quote.body.id}`, { version: quote.body.version, title: 'x' })).status).toBe(402)
    } finally {
      offsetMs = 0
    }
  })
})

describe('clientes', () => {
  it('CRUD, búsqueda sin tildes, por RUT y agregados', async () => {
    const { agent } = await signup(server)
    const created = await agent.post<Client & { warnings?: string[] }>('/api/clients', { name: 'José Ñancupil', rut: '76086428-5', city: 'Concepción', phone: '+56 9 5555 1234' })
    expect(created.status).toBe(201)
    expect(created.body.rut).toBe('76.086.428-5')
    expect(created.body.warnings).toBeUndefined()
    expect(created.body.quotesCount).toBe(0)

    const badRut = await agent.post<Client & { warnings?: string[] }>('/api/clients', { name: 'Otra Persona', rut: '11.111.111-2' })
    expect(badRut.status).toBe(201)
    expect(badRut.body.warnings?.[0]).toMatch(/RUT/)

    expect((await agent.get('/api/clients?q=concepcion')).body.items[0].id).toBe(created.body.id)
    expect((await agent.get('/api/clients?q=nancupil')).body.items[0].id).toBe(created.body.id)
    expect((await agent.get('/api/clients?q=76086')).body.items[0].id).toBe(created.body.id)
    expect((await agent.get('/api/clients')).body.total).toBe(2)

    const quote = await agent.post<Quote>('/api/quotes', { clientId: created.body.id })
    await agent.post(`/api/quotes/${quote.body.id}/status`, { status: 'accepted' })
    const detail = await agent.get<Client>(`/api/clients/${created.body.id}`)
    expect(detail.body.quotesCount).toBe(1)
    expect(typeof detail.body.totalAccepted).toBe('number')

    const patched = await agent.patch<Client>(`/api/clients/${created.body.id}`, { email: 'jose@correo.cl', city: '' })
    expect(patched.body.email).toBe('jose@correo.cl')
    expect(patched.body.city).toBeUndefined()
    expect(patched.body.name).toBe('José Ñancupil')

    expect((await agent.delete(`/api/clients/${created.body.id}`)).status).toBe(200)
    expect((await agent.get(`/api/clients/${created.body.id}`)).status).toBe(404)
    // La cotización conserva el nombre del cliente.
    const list = await agent.get('/api/quotes')
    expect(list.body.items[0].clientName).toBe('José Ñancupil')
    expect((await agent.post(`/api/clients/${created.body.id}/restore`)).status).toBe(200)
  })

  it('exige el nombre del cliente', async () => {
    const { agent } = await signup(server)
    const res = await agent.post('/api/clients', { name: '  ' })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/nombre del cliente/)
  })
})
