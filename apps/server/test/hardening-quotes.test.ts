/**
 * Endurecimiento de cotizaciones, portal, equipo y taller: roles aplicados en el servidor, notas
 * internas fuera del portal, invitaciones de un solo uso, topes de correo, carreras al enviar y al
 * pasar a taller, avance de OT contra las ventanas actuales, aceptación de la revisión vista,
 * vendido del mes con lo aceptado, catálogo del editor igual al del servidor y validez propia.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import type { Catalog, Glass } from '@framezen/engine'
import type { Me, OrgSettings, Quote, QuoteStats, WorkOrder } from '@framezen/shared'
import { quoteRevisions, subscriptions } from '../src/db/schema'
import { billingAccounts } from '../src/services/billing/tables'
import { evaluate } from '../src/services/pricing'
import { type Agent, item, sampleDesign, signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server?.close()
})

const DAY = 86_400_000

/** Bloquea la PRIMERA llamada al catálogo efectivo (dentro del cálculo de precio) hasta soltarla. */
function holdFirstPricing(target: TestServer) {
  const catalogs = target.deps.catalogs
  const original = catalogs.effective.bind(catalogs)
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let reached!: () => void
  const blocked = new Promise<void>((resolve) => (reached = resolve))
  let first = true
  catalogs.effective = (async (...args: Parameters<typeof original>) => {
    if (first) {
      first = false
      reached()
      await released
    }
    return original(...args)
  }) as typeof catalogs.effective
  return { blocked, release, restore: () => void (catalogs.effective = original) }
}

async function quoteFor(agent: Agent, extra: Record<string, unknown> = {}) {
  const design = await sampleDesign(agent)
  const res = await agent.post<Quote>('/api/quotes', { title: 'Obra', items: [item(design, { ref: 'V1' }), item(design, { ref: 'V2', qty: 2 })], ...extra })
  expect(res.status).toBe(201)
  return { quote: res.body, design }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('roles aplicados en el servidor (plan Empresa)', () => {
  let owner: Awaited<ReturnType<typeof signup>>
  const members: Record<'estimator' | 'operator' | 'installer' | 'workshop', Agent> = {} as never
  let quote: Quote
  let workOrder: WorkOrder

  beforeAll(async () => {
    owner = await signup(server, { company: 'Taller con Roles' })
    expect((await owner.agent.post('/api/billing/checkout', { plan: 'empresa', period: 'yearly' })).status).toBe(200)
    for (const role of ['estimator', 'operator', 'installer', 'workshop'] as const) {
      const email = `${role}.${Date.now()}@taller.cl`
      const invite = await owner.agent.post('/api/team/invite', { email, role })
      expect(invite.status).toBe(201)
      const agent = server.agent()
      const accepted = await agent.post<Me>(`/api/invitations/${invite.body.link.split('/invitacion/')[1]}/accept`, { name: role, email, password: 'clave-segura-123' })
      expect(accepted.status).toBe(200)
      expect(accepted.body.role).toBe(role)
      members[role] = agent
    }
    const client = await owner.agent.post('/api/clients', { name: 'Cliente Roles' })
    quote = (await quoteFor(owner.agent, { clientId: client.body.id, pricing: { marginPct: 35 } })).quote
    expect(quote.totals!.cost).toBeGreaterThan(0)
    workOrder = (await owner.agent.post<WorkOrder>('/api/work-orders', { quoteId: quote.id })).body
    await server.deps.db
      .insert(billingAccounts)
      .values({ orgId: owner.me.org.id, cardBrand: 'Visa', cardLast4: '4242', creditBalance: 15_000 })
      .onConflictDoUpdate({ target: billingAccounts.orgId, set: { cardBrand: 'Visa', cardLast4: '4242', creditBalance: 15_000 } })
  })

  it('operario e instalador no reciben costos, márgenes ni precios de compra', async () => {
    for (const role of ['operator', 'installer'] as const) {
      const agent = members[role]
      const q = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
      expect(q.totals!.total).toBe(quote.totals!.total) // el precio de venta sí
      expect(q.totals!.cost).toBe(0)
      expect(q.totals!.marginPct).toBe(0)
      expect(q.pricing).toBeUndefined()
      const wo = (await agent.get(`/api/work-orders/${workOrder.id}`)).body
      expect(wo.quote.totals.cost).toBe(0)
      expect(wo.quote.totals.marginPct).toBe(0)
      const settings = (await agent.get<OrgSettings>('/api/settings')).body
      expect(settings.pricing.marginPct).toBe(0)
      expect(settings.pricing.laborPerM2).toBe(0)
      expect(settings.pricing.ivaPct).toBe(19)
      const catalog = (await agent.get<Catalog>('/api/catalog')).body
      expect(catalog.profiles.every((p) => Object.keys(p.priceByColor).length === 0)).toBe(true)
      expect(catalog.items.every((i) => i.price === 0)).toBe(true)
      expect(catalog.glass.every((g) => g.pricePerM2 === 0)).toBe(true)
      expect((await agent.get('/api/catalog/prices')).body.overrides).toEqual([])
    }
  })

  it('el cotizador no ve costo ni margen real, pero sí lo que necesita para calcular el precio en vivo', async () => {
    const agent = members.estimator
    const q = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
    expect(q.totals!.cost).toBe(0)
    expect(q.totals!.marginPct).toBe(0)
    expect(q.pricing).toEqual({ marginPct: 35 })
    expect((await agent.get<OrgSettings>('/api/settings')).body.pricing.marginPct).toBe(40)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    expect(catalog.profiles.some((p) => Object.values(p.priceByColor).some((v) => v > 0))).toBe(true)
    // No puede cambiar el margen propio de la cotización (se ignora), pero sí editar y enviar.
    const saved = await agent.put<Quote>(`/api/quotes/${quote.id}`, { version: q.version, title: 'Obra editada por el cotizador', pricing: { marginPct: 5 } })
    expect(saved.status).toBe(200)
    expect(saved.body.title).toBe('Obra editada por el cotizador')
    expect((await owner.agent.get<Quote>(`/api/quotes/${quote.id}`)).body.pricing).toEqual({ marginPct: 35 })
    expect((await agent.post(`/api/quotes/${quote.id}/send`)).status).toBe(200)
    expect((await agent.post('/api/quotes', {})).status).toBe(201)
  })

  it('el jefe de taller ve precios de compra (materiales) pero no el margen', async () => {
    const agent = members.workshop
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    expect(catalog.profiles.some((p) => Object.values(p.priceByColor).some((v) => v > 0))).toBe(true)
    const q = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
    expect(q.totals!.marginPct).toBe(0)
    expect((await agent.patch(`/api/work-orders/${workOrder.id}`, { progress: { V1: 'weld' } })).status).toBe(200)
  })

  it('operario e instalador no pueden enviar, cambiar estado ni borrar cotizaciones o clientes', async () => {
    for (const role of ['operator', 'installer'] as const) {
      const agent = members[role]
      expect((await agent.post(`/api/quotes/${quote.id}/status`, { status: 'rejected' })).status, role).toBe(403)
      expect((await agent.post(`/api/quotes/${quote.id}/send`, { channel: 'email', to: 'atacante@example.com', message: 'hola' })).status, role).toBe(403)
      expect((await agent.delete(`/api/quotes/${quote.id}`)).status, role).toBe(403)
      expect((await agent.post('/api/quotes', {})).status, role).toBe(403)
      expect((await agent.post('/api/clients', { name: 'X' })).status, role).toBe(403)
      // Sí marcan avance en el taller.
      expect((await agent.patch(`/api/work-orders/${workOrder.id}`, { progress: { V2: 'weld' } })).status, role).toBe(200)
    }
    expect((await owner.agent.get<Quote>(`/api/quotes/${quote.id}`)).body.status).not.toBe('rejected')
    expect((await members.estimator.patch(`/api/work-orders/${workOrder.id}`, { progress: { V1: 'cut' } })).status).toBe(403)
  })

  it('la tarjeta, el saldo y el historial de pagos son solo del dueño', async () => {
    const ownerBilling = (await owner.agent.get('/api/billing')).body
    expect(ownerBilling.card).toEqual({ brand: 'Visa', last4: '4242' })
    for (const role of ['estimator', 'operator'] as const) {
      const agent = members[role]
      const billing = (await agent.get('/api/billing')).body
      expect(billing.plan).toBe('empresa')
      expect(billing.card).toBeUndefined()
      expect(billing.creditBalance).toBe(0)
      expect((await agent.get<Me>('/api/me')).body.billing.card).toBeUndefined()
      expect((await agent.get('/api/billing/history')).status).toBe(403)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('portal: nunca las notas internas del cliente', () => {
  it('ni en la foto enviada ni en la vista pública (tampoco en fotos antiguas)', async () => {
    const { agent } = await signup(server)
    const client = await agent.post('/api/clients', { name: 'Cliente Prueba', email: 'cli@correo.cl', notes: 'NOTA INTERNA: moroso, cobrar 100% adelantado' })
    const { quote } = await quoteFor(agent, { clientId: client.body.id })
    const sent = await agent.post(`/api/quotes/${quote.id}/send`)
    const token = sent.body.quote.shareToken as string
    const view = await server.agent().get(`/api/public/quotes/${token}`)
    expect(view.status).toBe(200)
    expect(view.body.quote.client.name).toBe('Cliente Prueba')
    expect(view.body.quote.client.email).toBe('cli@correo.cl')
    expect(JSON.stringify(view.body)).not.toContain('NOTA INTERNA')
    const [stored] = await server.deps.db.select().from(quoteRevisions).where(eq(quoteRevisions.quoteId, quote.id))
    expect(JSON.stringify(stored!.snapshot)).not.toContain('NOTA INTERNA')

    // Una foto guardada antes del arreglo (con las notas) tampoco las muestra.
    const legacy = { ...stored!.snapshot, client: { ...stored!.snapshot.client!, notes: 'NOTA INTERNA antigua' } }
    await server.deps.db.update(quoteRevisions).set({ snapshot: legacy }).where(eq(quoteRevisions.id, stored!.id))
    const again = await server.agent().get(`/api/public/quotes/${token}`)
    expect(JSON.stringify(again.body)).not.toContain('NOTA INTERNA')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('invitaciones de un solo uso', () => {
  it('varios «Aceptar» simultáneos con el mismo enlace: entra una sola persona', async () => {
    const owner = await signup(server)
    const invite = await owner.agent.post('/api/team/invite', { role: 'estimator' })
    const token = invite.body.link.split('/invitacion/')[1]
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        server.agent().post(`/api/invitations/${token}/accept`, { name: `Otro ${i}`, email: `otro-${i}.${Date.now()}@example.com`, password: 'clave-segura-123' }),
      ),
    )
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([200, 410, 410, 410, 410, 410])
    const team = await owner.agent.get('/api/team')
    expect(team.body.seatsUsed).toBe(2)
    expect(team.body.seatsUsed).toBeLessThanOrEqual(team.body.seats)
  })

  it('vuelve a contar los puestos al aceptar y exige el correo invitado', async () => {
    const owner = await signup(server)
    const linkA = (await owner.agent.post('/api/team/invite', { role: 'estimator' })).body.link.split('/invitacion/')[1]
    const forLuis = (await owner.agent.post('/api/team/invite', { email: 'luis.invitado@taller.cl', role: 'estimator' })).body.link.split('/invitacion/')[1]
    // Otro correo no puede usar una invitación dirigida.
    const wrong = await server.agent().post(`/api/invitations/${forLuis}/accept`, { name: 'Intruso', email: `intruso.${Date.now()}@example.com`, password: 'clave-segura-123' })
    expect(wrong.status).toBe(403)
    expect(wrong.body.error.code).toBe('invitation_email_mismatch')
    // El plan baja a uno de 1 persona: aceptar ya no puede pasarse del límite.
    await server.deps.db.update(subscriptions).set({ plan: 'taller', status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * DAY) }).where(eq(subscriptions.orgId, owner.me.org.id))
    const over = await server.agent().post(`/api/invitations/${linkA}/accept`, { name: 'Sin puesto', email: `sinpuesto.${Date.now()}@example.com`, password: 'clave-segura-123' })
    expect(over.status).toBe(402)
    expect(over.body.error.code).toBe('seat_limit')
    expect((await owner.agent.get('/api/team')).body.members).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('topes de correo saliente', () => {
  it('enviar por correo tiene tope diario por organización (el enlace sigue sirviendo)', async () => {
    const { agent } = await signup(server)
    const { quote } = await quoteFor(agent)
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) statuses.push((await agent.post(`/api/quotes/${quote.id}/send`, { channel: 'email', to: 'delivered@resend.dev', message: 'Su cuenta fue bloqueada' })).status)
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true)
    expect(statuses[30]).toBe(429)
    const link = await agent.post(`/api/quotes/${quote.id}/send`, { channel: 'link' })
    expect(link.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('carreras al enviar y al pasar a taller', () => {
  it('enviar no pisa un guardado que entró mientras calculaba (vuelve a leer y calcula)', async () => {
    const { agent } = await signup(server)
    const { quote, design } = await quoteFor(agent)
    const hold = holdFirstPricing(server)
    try {
      const sending = agent.post(`/api/quotes/${quote.id}/send`)
      await hold.blocked
      const saved = await agent.put<Quote>(`/api/quotes/${quote.id}`, { version: quote.version, items: [item(design, { ref: 'V1', qty: 5 }), item(design, { ref: 'V2', qty: 2 })] })
      expect(saved.status).toBe(200)
      hold.release()
      const sent = await sending
      expect(sent.status).toBe(200)
      const final = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
      expect(final.items[0]!.qty).toBe(5) // el cambio guardado no se perdió
      expect(final.totals!.total).toBe(saved.body.totals!.total)
      const portal = await server.agent().get(`/api/public/quotes/${sent.body.quote.shareToken}`)
      expect(portal.body.quote.items[0].qty).toBe(5) // y es lo que se envió
    } finally {
      hold.restore()
    }
  })

  it('dos envíos a la vez: revisiones A y B, ningún 500 ni enlace muerto', async () => {
    const { agent } = await signup(server)
    const { quote } = await quoteFor(agent)
    const hold = holdFirstPricing(server)
    let first
    try {
      const a = agent.post(`/api/quotes/${quote.id}/send`)
      await hold.blocked
      const b = await agent.post(`/api/quotes/${quote.id}/send`)
      hold.release()
      first = await a
      expect([first.status, b.status]).toEqual([200, 200])
      expect([first.body.revision, b.body.revision].sort()).toEqual([1, 2])
      expect(first.body.quote.shareToken).toBe(b.body.quote.shareToken)
    } finally {
      hold.restore()
    }
    expect((await server.agent().get(`/api/public/quotes/${first.body.quote.shareToken}`)).status).toBe(200)
    const revisions = await server.deps.db.select({ revision: quoteRevisions.revision }).from(quoteRevisions).where(eq(quoteRevisions.quoteId, quote.id))
    expect(revisions.map((r) => r.revision).sort()).toEqual([1, 2])
  })

  it('dos «Pasar a taller» simultáneos crean una sola OT', async () => {
    const { agent } = await signup(server)
    const { quote } = await quoteFor(agent)
    const [a, b] = await Promise.all([agent.post('/api/work-orders', { quoteId: quote.id }), agent.post('/api/work-orders', { quoteId: quote.id })])
    expect([a.status, b.status].sort()).toEqual([200, 201])
    expect(a.body.id).toBe(b.body.id)
    const list = await agent.get(`/api/work-orders?quoteId=${quote.id}`)
    expect(list.body.total).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('avance de la OT contra las ventanas actuales de la cotización', () => {
  it('una ventana agregada después de abrir la OT impide terminarla e instalar la cotización', async () => {
    const { agent } = await signup(server)
    const { quote, design } = await quoteFor(agent)
    const wo = (await agent.post<WorkOrder>('/api/work-orders', { quoteId: quote.id })).body
    const current = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
    const withV3 = await agent.put<Quote>(`/api/quotes/${quote.id}`, { version: current.version, items: [...current.items, item(design, { ref: 'V3' })] })
    expect(withV3.status).toBe(200)

    const ready = await agent.patch<WorkOrder>(`/api/work-orders/${wo.id}`, { progress: { V1: 'ready', V2: 'ready' } })
    expect(ready.body.status).toBe('in_progress')
    await agent.patch(`/api/work-orders/${wo.id}`, { progress: { V1: 'installed', V2: 'installed' } })
    expect((await agent.get<Quote>(`/api/quotes/${quote.id}`)).body.status).toBe('workshop')

    // Una ventana que la cotización ya no tiene no se puede marcar.
    const unknown = await agent.patch(`/api/work-orders/${wo.id}`, { progress: { V9: 'ready' } })
    expect(unknown.status).toBe(400)

    const all = await agent.patch<WorkOrder>(`/api/work-orders/${wo.id}`, { progress: { V3: 'installed' } })
    expect(all.body.status).toBe('done')
    expect((await agent.get<Quote>(`/api/quotes/${quote.id}`)).body.status).toBe('installed')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('aceptar en el portal', () => {
  it('se acepta la revisión que el cliente vio; si hay una más nueva, 409 y no queda aceptada', async () => {
    const { agent } = await signup(server)
    const { quote, design } = await quoteFor(agent)
    const sentA = await agent.post(`/api/quotes/${quote.id}/send`)
    const token = sentA.body.quote.shareToken as string
    const seen = (await server.agent().get(`/api/public/quotes/${token}`)).body.quote
    expect(seen.revision).toBe(1)
    // El taller sube la cantidad y reenvía (B) mientras el cliente tiene A abierta.
    const current = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
    await agent.put(`/api/quotes/${quote.id}`, { version: current.version, items: [item(design, { ref: 'V1', qty: 3 }), item(design, { ref: 'V2', qty: 2 })] })
    expect((await agent.post(`/api/quotes/${quote.id}/send`)).body.revision).toBe(2)

    const stale = await server.agent().post(`/api/public/quotes/${token}/accept`, { name: 'Carolina Soto', revision: seen.revision })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('revision_changed')
    expect((await agent.get<Quote>(`/api/quotes/${quote.id}`)).body.status).toBe('sent')

    const ok = await server.agent().post(`/api/public/quotes/${token}/accept`, { name: 'Carolina Soto', revision: 2 })
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('accepted')
  })

  it('aceptar una cotización ya pasada a taller registra quién aceptó sin hacerla retroceder', async () => {
    const { agent } = await signup(server)
    const { quote } = await quoteFor(agent)
    const sent = await agent.post(`/api/quotes/${quote.id}/send`)
    await agent.post('/api/work-orders', { quoteId: quote.id })
    const res = await server.agent().post(`/api/public/quotes/${sent.body.quote.shareToken}/accept`, { name: 'Cliente Final' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('workshop')
    const after = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
    expect(after.status).toBe('workshop')
    expect(after.acceptedBy?.name).toBe('Cliente Final')
    expect((await agent.get('/api/quotes?status=workshop')).body.total).toBe(1)
  })

  it('responde al cliente aunque el correo al taller se demore', async () => {
    const { agent } = await signup(server)
    const { quote } = await quoteFor(agent)
    const sent = await agent.post(`/api/quotes/${quote.id}/send`)
    const original = server.deps.mailer.send
    server.deps.mailer.send = () => new Promise(() => {}) // proveedor colgado
    try {
      const res = await Promise.race([
        server.agent().post(`/api/public/quotes/${sent.body.quote.shareToken}/accept`, { name: 'Cliente Apurado' }),
        new Promise<'colgado'>((resolve) => setTimeout(() => resolve('colgado'), 2000)),
      ])
      expect(res).not.toBe('colgado')
      expect((res as { status: number }).status).toBe(200)
    } finally {
      server.deps.mailer.send = original
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('vendido del mes con lo aceptado', () => {
  it('editar una aceptada o subir el margen después no cambia lo vendido ni el total del cliente', async () => {
    const { agent } = await signup(server)
    const client = await agent.post('/api/clients', { name: 'Clienta Feliz' })
    const { quote, design } = await quoteFor(agent, { clientId: client.body.id })
    const sent = await agent.post(`/api/quotes/${quote.id}/send`)
    const sold = sent.body.quote.totals.total as number
    await server.agent().post(`/api/public/quotes/${sent.body.quote.shareToken}/accept`, { name: 'Clienta Feliz' })
    const before = (await agent.get<QuoteStats>('/api/quotes/stats')).body
    expect(before.soldThisMonth.total).toBe(sold)

    const current = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
    const edited = await agent.put<Quote>(`/api/quotes/${quote.id}`, { version: current.version, items: [item(design, { ref: 'V1', qty: 4 }), item(design, { ref: 'V2', qty: 2 })] })
    expect(edited.body.totals!.total).toBeGreaterThan(sold)
    await agent.patch('/api/settings', { pricing: { marginPct: 60 } })

    const after = (await agent.get<QuoteStats>('/api/quotes/stats')).body
    expect(after.soldThisMonth.total).toBe(sold)
    expect(after.byStatus.accepted.total).toBe(sold)
    expect((await agent.get(`/api/clients/${client.body.id}`)).body.totalAccepted).toBe(sold)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('el editor calcula con el mismo catálogo que el servidor', () => {
  async function editorTotal(agent: Agent, quoteId: string): Promise<number> {
    const q = (await agent.get<Quote>(`/api/quotes/${quoteId}`)).body
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const settings = (await agent.get<OrgSettings>('/api/settings')).body
    return evaluate({ items: q.items, extras: q.extras, discountPct: q.discountPct, pricing: q.pricing }, catalog, settings.pricing, settings.cut).totals.total
  }

  it('desactivar la marca de la línea ya cotizada no cambia la cifra del editor', async () => {
    const { agent } = await signup(server)
    const { quote, design } = await quoteFor(agent)
    const serverTotal = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body.totals!.total
    expect(await editorTotal(agent, quote.id)).toBe(serverTotal)
    const brandId = (await agent.get<Catalog>('/api/catalog')).body.lines.find((l) => l.id === design.lineId)!.brandId
    expect((await agent.patch(`/api/catalog/brands/${brandId}`, { enabled: false })).status).toBe(200)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    expect(catalog.lines.some((l) => l.id === design.lineId)).toBe(true)
    expect(await editorTotal(agent, quote.id)).toBe(serverTotal)
  })

  it('cambiar de marca de vidrios no deja el vidrio cotizado en $0 en el editor', async () => {
    const extraGlass: Glass = { id: 'otra-dvh', brandId: 'vidrios-otra', name: 'DVH Otra Marca', kind: 'dvh', thickness: 20, pricePerM2: 41_900, minArea: 0.3 }
    const catalog: Catalog = {
      ...SAMPLE_CATALOG,
      brands: [...SAMPLE_CATALOG.brands, { id: 'vidrios-otra', name: 'Vidrios Otra', kind: 'glass', country: 'Chile', monogram: 'VO', accent: '#335577' } as Catalog['brands'][number]],
      glass: [...SAMPLE_CATALOG.glass, extraGlass],
      brandSettings: [...SAMPLE_CATALOG.brandSettings, { ...SAMPLE_CATALOG.brandSettings[0]!, brandId: 'vidrios-otra' }],
    }
    const own = await startServer({ catalog })
    try {
      const { agent } = await signup(own)
      await agent.patch('/api/catalog/brands/vidrios-otra', { enabled: true })
      const design = { ...(await sampleDesign(agent)), glassId: 'otra-dvh' }
      const created = await agent.post<Quote>('/api/quotes', { items: [item(design, { ref: 'V1' })] })
      const serverTotal = created.body.totals!.total
      expect(await editorTotal(agent, created.body.id)).toBe(serverTotal)
      // El taller desactiva esa marca de vidrios (y sigue con la otra).
      await agent.patch('/api/catalog/brands/vidrios-otra', { enabled: false })
      const after = (await agent.get<Catalog>('/api/catalog')).body
      expect(after.glass.find((g) => g.id === 'otra-dvh')?.pricePerM2).toBe(41_900)
      expect(await editorTotal(agent, created.body.id)).toBe(serverTotal)
    } finally {
      await own.close()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('validez al enviar', () => {
  it('usa la validez propia de la cotización (inspector) y no la de la empresa', async () => {
    const { agent } = await signup(server)
    const { quote } = await quoteFor(agent, { documentOverrides: { validityDays: 60 } })
    const sent = await agent.post(`/api/quotes/${quote.id}/send`)
    expect(sent.status).toBe(200)
    const expected = new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10)
    expect(sent.body.quote.validUntil).toBe(expected)
    const portal = await server.agent().get(`/api/public/quotes/${sent.body.quote.shareToken}`)
    expect(portal.body.quote.validUntil).toBe(expected)
  })
})

