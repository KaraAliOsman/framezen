import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Paged, Quote, QuoteSummary } from '@dekopen/shared'
import { queueDraftRepricing, repriceDrafts } from '../src/services/quotes'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server?.close()
})

describe('cotizaciones', () => {
  it('guarda opcionales, alternativas, descuento de línea, partidas y dirección de obra; solo cuenta lo elegido', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent)
    const body = {
      siteAddress: 'Camino Real 123',
      items: [
        { ...item(design), ref: 'V1', discountPct: 10, floor: 'Piso 1', rough: { width: 1020, height: 1020 } },
        { ...item(design), ref: 'V2', role: 'optional' },
        { ...item(design), ref: 'V3', role: 'alternative', altGroup: 'Sala', included: true },
        { ...item(design), ref: 'V4', role: 'alternative', altGroup: 'Sala' },
      ],
      extras: [{ label: 'Andamio', amount: 100000, line: true, description: 'Armado y retiro' }],
    }
    const { body: q } = await agent.post<Quote>('/api/quotes', body)
    expect(q.siteAddress).toBe('Camino Real 123')
    expect(q.items.map((i) => [i.role, i.altGroup, i.included, i.discountPct, i.floor])).toEqual([
      [undefined, undefined, undefined, 10, 'Piso 1'],
      ['optional', undefined, undefined, undefined, undefined],
      ['alternative', 'Sala', true, undefined, undefined],
      ['alternative', 'Sala', undefined, undefined, undefined],
    ])
    expect(q.extras[0]).toMatchObject({ line: true, description: 'Armado y retiro' })
    expect(q.totals?.units).toBe(2)
    // Un PUT que no toca la dirección no la borra.
    const saved = await agent.put<Quote>(`/api/quotes/${q.id}`, { version: q.version, discountPct: 5 })
    expect(saved.body.siteAddress).toBe('Camino Real 123')
  })

  it('una cuenta nueva no trae compromisos y la vigencia sin definir no vence nada', async () => {
    const { agent } = await signup(server)
    const settings = await agent.get<{ documents: Record<string, unknown> }>('/api/settings')
    expect(settings.body.documents).toMatchObject({ intro: '', conditions: '', paymentTerms: '', warranty: '', leadTimeText: '', validityDays: 0 })
    const { body: q } = await agent.post<Quote>('/api/quotes', { items: [item(await sampleDesign(agent))] })
    expect((await agent.post(`/api/quotes/${q.id}/send`, { channel: 'link' })).status).toBe(200)
    const after = await agent.get<Quote>(`/api/quotes/${q.id}`)
    expect(after.body.revision).toBe(1)
    expect(after.body.validUntil).toBeUndefined()
  })

  it('logos de marca y ajustes del taller: se guardan por capas y `null` los quita', async () => {
    const { agent } = await signup(server)
    const id = '0123456789abcdef0123456789abcdef'
    const on = await agent.patch<{ documents: Record<string, unknown> }>('/api/settings', { documents: { brandLogos: { marca: id }, settings: { brandHardware: false, lineDetail: 'full' } } })
    expect(on.status).toBe(200)
    expect(on.body.documents).toMatchObject({ brandLogos: { marca: id }, settings: { brandHardware: false, lineDetail: 'full' } })
    const off = await agent.patch<{ documents: { brandLogos?: object; settings?: object } }>('/api/settings', { documents: { brandLogos: { marca: null }, settings: { lineDetail: null } } })
    expect(off.body.documents.brandLogos).toEqual({})
    expect(off.body.documents.settings).toEqual({ brandHardware: false })
    expect((await agent.patch('/api/settings', { documents: { settings: { termsPlacement: 'arriba' } } })).status).toBe(400)
  })

  it('crea borradores numerados correlativamente con título por defecto', async () => {
    const { agent } = await signup(server)
    const first = await agent.post<Quote>('/api/quotes', {})
    const second = await agent.post<Quote>('/api/quotes', {})
    expect(first.status).toBe(201)
    expect(first.body.number).toBe(1)
    expect(second.body.number).toBe(2)
    // Sin nombre de obra el título queda vacío: el cliente ve «Cotización N° 1», nunca «Nueva obra».
    expect(first.body.title).toBe('')
    expect(first.body.status).toBe('draft')
    expect(first.body.revision).toBe(0)
    expect(first.body.version).toBe(1)
    expect(first.body.items).toEqual([])

    const client = await agent.post('/api/clients', { name: 'Familia Muñoz' })
    const withClient = await agent.post<Quote>('/api/quotes', { clientId: client.body.id })
    expect(withClient.body.title).toBe('Obra Familia Muñoz')
  })

  it('la numeración es atómica aunque lleguen varias a la vez y respeta el contador de Ajustes', async () => {
    const { agent } = await signup(server)
    const created = await Promise.all(Array.from({ length: 6 }, () => agent.post<Quote>('/api/quotes', {})))
    const numbers = created.map((r) => r.body.number).sort((x, y) => x - y)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6])

    await agent.patch('/api/settings', { nextQuoteNumber: 412 })
    expect((await agent.post<Quote>('/api/quotes', {})).body.number).toBe(412)
    expect((await agent.post<Quote>('/api/quotes', {})).body.number).toBe(413)
    // Bajar el contador no repite números ya usados.
    await agent.patch('/api/settings', { nextQuoteNumber: 3 })
    expect((await agent.post<Quote>('/api/quotes', {})).body.number).toBe(414)
  })

  it('autoguardado con control de versión: 409 con la versión actual si está desactualizado', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent)
    const created = await agent.post<Quote>('/api/quotes', {})
    const id = created.body.id

    const saved = await agent.put<Quote>(`/api/quotes/${id}`, { version: 1, title: 'Casa Pérez · Concepción', items: [item(design), item(design, { qty: 2 })], discountPct: 5 })
    expect(saved.status).toBe(200)
    expect(saved.body.version).toBe(2)
    expect(saved.body.title).toBe('Casa Pérez · Concepción')
    expect(saved.body.items.map((i) => i.ref)).toEqual(['V1', 'V2'])
    expect(saved.body.items[0].id).toBeTruthy()
    expect(saved.body.discountPct).toBe(5)
    // Totales calculados por el servidor con el motor.
    expect(saved.body.totals).toBeDefined()
    expect(saved.body.totals!.units).toBe(3)
    expect(saved.body.totals!.total).toBeGreaterThan(0)
    expect(saved.body.totals!.iva).toBeGreaterThan(0)
    expect(saved.body.totals!.discountPct).toBe(5)

    // Otra pestaña con la versión vieja: conflicto con la versión vigente.
    const stale = await agent.put(`/api/quotes/${id}`, { version: 1, title: 'Pisando cambios' })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('version_conflict')
    expect(stale.body.error.message).toMatch(/versión más reciente/)
    expect(stale.body.version).toBe(2)
    expect(stale.body.quote.title).toBe('Casa Pérez · Concepción')

    // Guardado parcial: sólo el título, los ítems se conservan.
    const partial = await agent.put<Quote>(`/api/quotes/${id}`, { version: 2, title: 'Casa Pérez' })
    expect(partial.status).toBe(200)
    expect(partial.body.items).toHaveLength(2)
    expect(partial.body.version).toBe(3)

    const list = await agent.get<Paged<QuoteSummary>>('/api/quotes')
    const row = list.body.items.find((q) => q.id === id)!
    expect(row.units).toBe(3)
    expect(row.total).toBe(saved.body.totals!.total)
    expect(row.firstItem?.ref).toBe('V1')
  })

  it('lista con filtros por estado, búsqueda y número', async () => {
    const { agent } = await signup(server)
    const client = await agent.post('/api/clients', { name: 'Constructora Andes' })
    const a = await agent.post<Quote>('/api/quotes', { title: 'Edificio Bío Bío', clientId: client.body.id })
    const b = await agent.post<Quote>('/api/quotes', { title: 'Casa Lota' })
    await agent.post(`/api/quotes/${b.body.id}/status`, { status: 'rejected' })

    expect((await agent.get('/api/quotes?status=draft')).body.items.map((q: QuoteSummary) => q.id)).toEqual([a.body.id])
    expect((await agent.get('/api/quotes?status=draft,rejected')).body.total).toBe(2)
    expect((await agent.get('/api/quotes?q=bio')).body.items[0].id).toBe(a.body.id) // sin tildes también calza
    expect((await agent.get('/api/quotes?q=Bío')).body.items[0].id).toBe(a.body.id)
    expect((await agent.get('/api/quotes?q=andes')).body.items[0].clientName).toBe('Constructora Andes')
    expect((await agent.get(`/api/quotes?q=N° ${b.body.number}`)).body.items[0].id).toBe(b.body.id)
    expect((await agent.get(`/api/quotes?clientId=${client.body.id}`)).body.total).toBe(1)
  })

  it('duplica para otro cliente con el título que digas y nunca para un cliente ajeno', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent)
    const client = await agent.post<{ id: string }>('/api/clients', { name: 'Carolina Reyes' })
    const other = await signup(server)
    const foreign = await other.agent.post<{ id: string }>('/api/clients', { name: 'De otra empresa' })
    const original = await agent.post<Quote>('/api/quotes', { title: 'Casa tipo (copia)', items: [item(design)] })

    const copy = await agent.post<Quote>(`/api/quotes/${original.body.id}/duplicate`, { clientId: client.body.id, title: 'Casa tipo' })
    expect(copy.status).toBe(201)
    expect(copy.body.title).toBe('Casa tipo')
    expect(copy.body.clientId).toBe(client.body.id)
    expect(copy.body.status).toBe('draft')

    const without = await agent.post<Quote>(`/api/quotes/${copy.body.id}/duplicate`, { clientId: null, title: '' })
    expect(without.body.clientId ?? null).toBeNull()
    expect(without.body.title).toBe('')

    expect((await agent.post(`/api/quotes/${original.body.id}/duplicate`, { clientId: foreign.body.id })).status).toBe(400)
  })

  it('duplica con número nuevo y la elimina a la papelera (recuperable)', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent)
    const original = await agent.post<Quote>('/api/quotes', { title: 'Casa Ríos', items: [item(design, { ref: 'V1', name: 'Living' })] })
    await agent.post(`/api/quotes/${original.body.id}/send`)

    const copy = await agent.post<Quote>(`/api/quotes/${original.body.id}/duplicate`)
    expect(copy.status).toBe(201)
    expect(copy.body.number).toBe(original.body.number + 1)
    expect(copy.body.title).toBe('Casa Ríos (copia)')
    expect(copy.body.status).toBe('draft')
    expect(copy.body.revision).toBe(0)
    expect(copy.body.shareToken).toBeUndefined()
    expect(copy.body.items[0].name).toBe('Living')
    expect(copy.body.items[0].id).not.toBe(original.body.items[0].id)

    expect((await agent.delete(`/api/quotes/${copy.body.id}`)).status).toBe(200)
    expect((await agent.get('/api/quotes')).body.items.some((q: QuoteSummary) => q.id === copy.body.id)).toBe(false)
    const trash = await agent.get('/api/quotes?deleted=1')
    expect(trash.body.items.map((q: QuoteSummary) => q.id)).toEqual([copy.body.id])
    expect((await agent.put(`/api/quotes/${copy.body.id}`, { version: 99, title: 'x' })).status).toBe(404)
    const restored = await agent.post<Quote>(`/api/quotes/${copy.body.id}/restore`)
    expect(restored.status).toBe(200)
    expect((await agent.get('/api/quotes')).body.items.some((q: QuoteSummary) => q.id === copy.body.id)).toBe(true)
  })

  it('estadísticas para Inicio', async () => {
    const { agent } = await signup(server)
    await agent.post('/api/quotes', {})
    const sent = await agent.post<Quote>('/api/quotes', {})
    await agent.post(`/api/quotes/${sent.body.id}/send`)
    const stats = await agent.get('/api/quotes/stats')
    expect(stats.status).toBe(200)
    expect(stats.body.byStatus.draft.count).toBe(1)
    expect(stats.body.byStatus.sent.count).toBe(1)
    expect(stats.body.soldThisMonth.count).toBe(0)
  })

  it('sin nombre de obra: se puede vaciar, se duplica sin «(copia)» y el correo no muestra paréntesis vacíos', async () => {
    const { agent } = await signup(server)
    const named = await agent.post<Quote>('/api/quotes', { title: 'Casa Ríos' })
    const cleared = await agent.put<Quote>(`/api/quotes/${named.body.id}`, { version: named.body.version, title: '' })
    expect(cleared.status).toBe(200)
    expect(cleared.body.title).toBe('')
    expect((await agent.get<Quote>(`/api/quotes/${named.body.id}`)).body.title).toBe('')
    // Un guardado que no manda el título no lo toca.
    const renamed = await agent.put<Quote>(`/api/quotes/${named.body.id}`, { version: cleared.body.version, title: 'Casa Lota' })
    expect((await agent.put<Quote>(`/api/quotes/${named.body.id}`, { version: renamed.body.version, discountPct: 3 })).body.title).toBe('Casa Lota')

    const untitled = await agent.post<Quote>('/api/quotes', {})
    const copy = await agent.post<Quote>(`/api/quotes/${untitled.body.id}/duplicate`)
    expect(copy.body.title).toBe('')

    const before = server.mails.length
    const sent = await agent.post(`/api/quotes/${untitled.body.id}/send`, { channel: 'email', to: 'cliente@correo.cl' })
    expect(sent.status).toBe(200)
    const mail = server.mails.slice(before).find((m) => m.to === 'cliente@correo.cl')!
    expect(mail.text).toContain(`te enviamos la cotización N° ${untitled.body.number}. Puedes`)
    expect(mail.text).not.toMatch(/Nueva obra|\(\)/)
  })

  it('los borradores guardados siguen a Ajustes › Precios; las enviadas conservan lo que vio el cliente', async () => {
    const { agent, me } = await signup(server)
    const design = await sampleDesign(agent, { width: 1500, height: 1200 })
    const draft = await agent.post<Quote>('/api/quotes', { title: 'Obra ajustes', items: [item(design)] })
    const twin = await agent.post<Quote>('/api/quotes', { title: 'Gemela', items: [item(design)] })
    const sentQuote = await agent.post<Quote>('/api/quotes', { title: 'Enviada', items: [item(design)] })
    await agent.post(`/api/quotes/${sentQuote.body.id}/send`)
    const before = draft.body.totals!.total
    expect(twin.body.totals!.total).toBe(before)

    const patched = await agent.patch('/api/settings', { pricing: { marginPct: 30, laborPerM2: 8000 } })
    expect(patched.status).toBe(200)

    // Lo que calcula el motor con los ajustes nuevos (el mismo número que muestra el editor).
    const resaved = await agent.put<Quote>(`/api/quotes/${twin.body.id}`, { version: twin.body.version, title: 'Gemela' })
    const expected = resaved.body.totals!.total
    expect(expected).not.toBe(before)

    const fresh = await agent.get<Quote>(`/api/quotes/${draft.body.id}`)
    expect(fresh.body.totals!.total).toBe(expected)
    // Sin versión nueva ni fecha nueva: el autoguardado de un editor abierto sigue funcionando.
    expect(fresh.body.version).toBe(draft.body.version)
    expect(fresh.body.updatedAt).toBe(draft.body.updatedAt)

    const list = (await agent.get<Paged<QuoteSummary>>('/api/quotes')).body.items
    expect(list.find((q) => q.id === draft.body.id)!.total).toBe(expected)
    expect(list.find((q) => q.id === sentQuote.body.id)!.total).toBe(before)
    const stats = (await agent.get('/api/quotes/stats')).body
    expect(stats.byStatus.draft.total).toBe(expected * 2)
    expect(stats.byStatus.sent.total).toBe(before)

    const autosave = await agent.put<Quote>(`/api/quotes/${draft.body.id}`, { version: draft.body.version, discountPct: 0 })
    expect(autosave.status).toBe(200)
    expect(autosave.body.totals!.total).toBe(expected)

    // Ya al día: una pasada más no reescribe nada. Varias pedidas a la vez se juntan sin error.
    expect(await repriceDrafts(server.deps, me.org.id)).toBe(0)
    await Promise.all([queueDraftRepricing(server.deps, me.org.id), queueDraftRepricing(server.deps, me.org.id)])
    expect((await agent.get<Quote>(`/api/quotes/${draft.body.id}`)).body.totals!.total).toBe(expected)
  })

  it('valida el documento con mensajes claros', async () => {
    const { agent } = await signup(server)
    const created = await agent.post<Quote>('/api/quotes', {})
    const res = await agent.put(`/api/quotes/${created.body.id}`, { version: 1, discountPct: 150 })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/descuento/i)
    const noVersion = await agent.put(`/api/quotes/${created.body.id}`, { title: 'x' })
    expect(noVersion.status).toBe(400)
    expect(noVersion.body.error.field).toBe('version')
  })
})
