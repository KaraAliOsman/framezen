import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Quote, WorkOrder } from '@dekopen/shared'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server?.close()
})

describe('enviar, portal del cliente y aceptación', () => {
  it('flujo completo: enviar → ver → editar → reenviar (B) → aceptar → taller', async () => {
    const { agent, me } = await signup(server, { company: 'Aberturas Maule' })
    await agent.patch('/api/org', { phone: '+56 9 8765 4321', accent: '#0F766E' })
    const client = await agent.post('/api/clients', { name: 'Carolina Fuentes', email: 'carolina@correo.cl' })
    const design = await sampleDesign(agent)
    const created = await agent.post<Quote>('/api/quotes', { clientId: client.body.id, title: 'Casa Fuentes', items: [item(design), item(design, { qty: 3 })], notes: 'Cliente pide rebaja; margen bajo' })

    // Enviar: revisión 1, token y estado enviada.
    const sent = await agent.post(`/api/quotes/${created.body.id}/send`, { channel: 'email', to: 'carolina@correo.cl' })
    expect(sent.status).toBe(200)
    expect(sent.body.quote.revision).toBe(1)
    expect(sent.body.quote.status).toBe('sent')
    expect(sent.body.quote.sentAt).toBeTruthy()
    // Sin vigencia definida por el taller no se inventa una fecha.
    expect(sent.body.quote.validUntil).toBeUndefined()
    expect(sent.body.revisionLabel).toBe('A')
    const token: string = sent.body.quote.shareToken
    expect(token.length).toBeGreaterThan(16)
    expect(sent.body.url).toBe(`http://app.test/c/${token}`)
    expect(server.mails.some((m) => m.to === 'carolina@correo.cl' && m.text.includes(token))).toBe(true)

    // Portal público: sin sesión, sin notas internas ni costos.
    const anon = server.agent()
    const view = await anon.get(`/api/public/quotes/${token}`)
    expect(view.status).toBe(200)
    expect(view.body.quote.title).toBe('Casa Fuentes')
    expect(view.body.quote.notes).toBeUndefined()
    expect(view.body.quote.totals.cost).toBe(0)
    expect(view.body.quote.totals.marginPct).toBe(0)
    expect(view.body.org.name).toBe('Aberturas Maule')
    expect(view.body.org.accent).toBe('#0F766E')
    expect(view.body.documents.validityDays).toBe(0)
    expect(view.body.features).toContain('client3d')
    expect(view.body.catalog.items).toEqual([])
    for (const p of view.body.catalog.profiles) expect(p.priceByColor).toEqual({})
    expect(Object.keys(view.body.prices)).toHaveLength(2)

    // Editar después de enviar: el cliente sigue viendo la versión enviada.
    const edited = await agent.put<Quote>(`/api/quotes/${created.body.id}`, { version: sent.body.quote.version, title: 'Casa Fuentes · ampliación' })
    expect(edited.status).toBe(200)
    expect((await anon.get(`/api/public/quotes/${token}`)).body.quote.title).toBe('Casa Fuentes')

    // Reenviar: revisión B con el mismo enlace.
    const resent = await agent.post(`/api/quotes/${created.body.id}/send`)
    expect(resent.body.quote.revision).toBe(2)
    expect(resent.body.revisionLabel).toBe('B')
    expect(resent.body.quote.shareToken).toBe(token)
    const viewB = await anon.get(`/api/public/quotes/${token}`)
    expect(viewB.body.quote.title).toBe('Casa Fuentes · ampliación')
    expect(viewB.body.revisionLabel).toBe('B')

    // Pedir cambios queda como aviso pendiente.
    const changes = await anon.post(`/api/public/quotes/${token}/request-changes`, { message: '¿Pueden cotizar la V2 en nogal?' })
    expect(changes.status).toBe(200)
    const pending = await agent.get('/api/activity?pending=1')
    expect(pending.body.items.some((e: { kind: string; text: string }) => e.kind === 'quote.changes_requested' && e.text.includes('nogal'))).toBe(true)

    // Aceptar con RUT inválido: se acepta igual, con aviso suave.
    const accept = await anon.post(`/api/public/quotes/${token}/accept`, { name: 'Carolina Fuentes', rut: '12.345.678-9' })
    expect(accept.status).toBe(200)
    expect(accept.body.status).toBe('accepted')
    expect(accept.body.warnings[0]).toMatch(/RUT/)
    const again = await anon.post(`/api/public/quotes/${token}/accept`, { name: 'Carolina Fuentes' })
    expect(again.body.alreadyAccepted).toBe(true)

    const accepted = await agent.get<Quote>(`/api/quotes/${created.body.id}`)
    expect(accepted.body.status).toBe('accepted')
    expect(accepted.body.acceptedBy?.name).toBe('Carolina Fuentes')
    expect(accepted.body.acceptedAt).toBeTruthy()
    expect((await anon.get(`/api/public/quotes/${token}`)).body.quote.status).toBe('accepted')
    const activity = await agent.get('/api/activity')
    const kinds = activity.body.items.map((e: { kind: string }) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['quote.created', 'quote.sent', 'quote.viewed', 'quote.accepted']))
    expect(server.mails.some((m) => m.to === me.user.email && /aceptó/.test(m.subject))).toBe(true)

    // Pasar a taller: OT numerada, cotización en taller; repetir devuelve la misma OT.
    const wo = await agent.post<WorkOrder>('/api/work-orders', { quoteId: created.body.id, dueDate: '2026-11-20' })
    expect(wo.status).toBe(201)
    expect(wo.body.number).toBe(1)
    expect(wo.body.quoteNumber).toBe(created.body.number)
    expect(wo.body.clientName).toBe('Carolina Fuentes')
    expect(wo.body.progress).toEqual({ V1: 'cut', V2: 'cut' })
    expect((await agent.get<Quote>(`/api/quotes/${created.body.id}`)).body.status).toBe('workshop')
    const twice = await agent.post('/api/work-orders', { quoteId: created.body.id })
    expect(twice.status).toBe(200)
    expect(twice.body.id).toBe(wo.body.id)

    const moving = await agent.patch<WorkOrder>(`/api/work-orders/${wo.body.id}`, { progress: { V1: 'weld' } })
    expect(moving.body.status).toBe('in_progress')
    expect(moving.body.progress).toEqual({ V1: 'weld', V2: 'cut' })
    const done = await agent.patch<WorkOrder>(`/api/work-orders/${wo.body.id}`, { progress: { V1: 'installed', V2: 'installed' } })
    expect(done.body.status).toBe('done')
    expect((await agent.get<Quote>(`/api/quotes/${created.body.id}`)).body.status).toBe('installed')
    const detail = await agent.get(`/api/work-orders/${wo.body.id}`)
    expect(detail.body.quote.id).toBe(created.body.id)
  })

  it('un token inexistente responde 404 con mensaje humano', async () => {
    const res = await server.agent().get('/api/public/quotes/no-existe-este-token')
    expect(res.status).toBe(404)
    expect(res.body.error.message).toMatch(/enlace/)
  })

  it('aceptar exige un nombre', async () => {
    const { agent } = await signup(server)
    const created = await agent.post<Quote>('/api/quotes', {})
    const sent = await agent.post(`/api/quotes/${created.body.id}/send`)
    const res = await server.agent().post(`/api/public/quotes/${sent.body.quote.shareToken}/accept`, { name: ' ' })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/nombre/)
  })
})
