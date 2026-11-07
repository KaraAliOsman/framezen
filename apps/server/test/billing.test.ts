import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Me, Quote } from '@dekopen/shared'
import { aiUsage, subscriptions } from '../src/db/schema'
import { newId } from '../src/lib/crypto'
import { setPdfRenderer } from '../src/services/pdf'
import { accessOf, addMonths, creditWindowStart, planGross, prorate } from '../src/services/billing/plans'
import type { BillingStateDetail, CheckoutResult } from '../src/services/billing/service'
import { signup, startServer, type TestServer } from './helpers'

const DAY = 86_400_000
let server: TestServer
let offsetMs = 0
const now = () => new Date(Date.now() + offsetMs)

beforeAll(async () => {
  server = await startServer({ now })
  setPdfRenderer(server.deps, { render: async () => Buffer.from('%PDF-1.7'), close: async () => {} })
})
afterAll(async () => {
  await server?.close()
})

/** Avanza el reloj en tramos de 20 días, usando la sesión en cada tramo (dura 30 días y se renueva con el uso). */
async function travel(agent: { get: (path: string) => Promise<unknown> }, toOffsetMs: number) {
  while (offsetMs < toOffsetMs) {
    offsetMs = Math.min(toOffsetMs, offsetMs + 20 * DAY)
    await agent.get('/api/me')
  }
}

describe('cifras de cobro', () => {
  it('montos con IVA y meses que no existen', () => {
    expect(planGross('pro', 'monthly')).toBe(Math.round(69990 * 1.19))
    expect(planGross('taller', 'yearly')).toBe(Math.round(35990 * 12 * 1.19))
    expect(addMonths(new Date('2026-01-31T12:00:00Z'), 1).toISOString()).toBe('2026-02-28T12:00:00.000Z')
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2028-02-29')
    expect(addMonths(new Date('2026-03-31T00:00:00Z'), -1).toISOString().slice(0, 10)).toBe('2026-02-28')
  })

  it('prorrateo simple: sube ahora descontando lo no usado; baja al fin del período', () => {
    const start = new Date('2026-11-01T00:00:00Z')
    const end = addMonths(start, 1)
    const half = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2)
    const up = prorate({ plan: 'pro', period: 'monthly', periodEnd: end }, { plan: 'empresa', period: 'monthly' }, half)
    expect(up.immediate).toBe(true)
    expect(up.remaining).toBeCloseTo(0.5, 5)
    expect(up.unusedCredit).toBe(Math.round(planGross('pro', 'monthly') / 2))
    expect(up.chargeNow).toBe(planGross('empresa', 'monthly') - up.unusedCredit)
    expect(up.newBalance).toBe(0)

    // Con saldo previo: primero lo no usado, después el saldo; lo que sobra queda.
    const rich = prorate({ plan: 'pro', period: 'monthly', periodEnd: end }, { plan: 'empresa', period: 'monthly' }, half, 500_000)
    expect(rich.chargeNow).toBe(0)
    expect(rich.balanceUsed).toBe(planGross('empresa', 'monthly') - rich.unusedCredit)
    expect(rich.newBalance).toBe(rich.unusedCredit + 500_000 - planGross('empresa', 'monthly'))

    const down = prorate({ plan: 'empresa', period: 'monthly', periodEnd: end }, { plan: 'taller', period: 'monthly' }, half, 1000)
    expect(down).toMatchObject({ immediate: false, chargeNow: 0, unusedCredit: 0, newBalance: 1000 })
    // Mismo plan, de mensual a anual: compromete más, rige ahora.
    expect(prorate({ plan: 'pro', period: 'monthly', periodEnd: end }, { plan: 'pro', period: 'yearly' }, half).immediate).toBe(true)
    expect(prorate({ plan: 'pro', period: 'yearly', periodEnd: addMonths(start, 12) }, { plan: 'pro', period: 'monthly' }, half).immediate).toBe(false)
  })

  it('créditos IA mensuales aun en plan anual', () => {
    const end = new Date('2027-11-10T00:00:00Z')
    const sub = { plan: 'pro' as const, period: 'yearly' as const, currentPeriodEnd: end }
    expect(creditWindowStart(sub, new Date('2026-11-12T00:00:00Z'))?.toISOString().slice(0, 10)).toBe('2026-11-10')
    expect(creditWindowStart(sub, new Date('2027-02-09T23:00:00Z'))?.toISOString().slice(0, 10)).toBe('2027-01-10')
    expect(creditWindowStart(sub, new Date('2027-02-10T00:00:00Z'))?.toISOString().slice(0, 10)).toBe('2027-02-10')
    expect(creditWindowStart({ ...sub, period: 'monthly' as const, currentPeriodEnd: new Date('2026-12-10T00:00:00Z') }, new Date('2026-11-20T00:00:00Z'))?.toISOString().slice(0, 10)).toBe('2026-11-10')
  })

  it('modo lectura: prueba vencida, plan terminado y pago atrasado (con gracia)', () => {
    const t = new Date('2026-11-20T00:00:00Z')
    expect(accessOf({ plan: 'trial', status: 'trialing', trialEndsAt: new Date('2026-11-21'), currentPeriodEnd: null }, t).readOnly).toBe(false)
    expect(accessOf({ plan: 'trial', status: 'trialing', trialEndsAt: new Date('2026-11-19'), currentPeriodEnd: null }, t)).toMatchObject({ readOnly: true, reason: 'trial_ended', status: 'expired' })
    expect(accessOf({ plan: 'pro', status: 'canceled', trialEndsAt: null, currentPeriodEnd: new Date('2026-11-25') }, t)).toMatchObject({ readOnly: false, status: 'canceled' })
    expect(accessOf({ plan: 'pro', status: 'canceled', trialEndsAt: null, currentPeriodEnd: new Date('2026-11-19') }, t)).toMatchObject({ readOnly: true, reason: 'plan_ended' })
    expect(accessOf({ plan: 'pro', status: 'active', trialEndsAt: null, currentPeriodEnd: new Date('2026-11-15') }, t)).toMatchObject({ readOnly: false, status: 'past_due' })
    expect(accessOf({ plan: 'pro', status: 'active', trialEndsAt: null, currentPeriodEnd: new Date('2026-11-05') }, t)).toMatchObject({ readOnly: true, reason: 'payment_overdue' })
  })
})

describe('proveedor dev', () => {
  it('prueba → Pro al instante, consistente con /api/me', async () => {
    offsetMs = 0
    const { agent } = await signup(server)
    const trial = await agent.get<BillingStateDetail>('/api/billing')
    expect(trial.body).toMatchObject({ plan: 'trial', status: 'trialing', provider: 'dev', readOnly: false, cancelAtPeriodEnd: false, creditBalance: 0 })
    expect(trial.body.aiCredits.included).toBe(500)
    expect(trial.body.aiCredits.resetsAt).toBe(trial.body.trialEndsAt)

    const res = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'pro', period: 'monthly' })
    expect(res.status).toBe(200)
    expect(res.body.url).toBeNull()
    expect(res.body.message).toMatch(/Listo: ya tienes el plan Pro/)
    expect(res.body.billing).toMatchObject({ plan: 'pro', status: 'active', period: 'monthly', readOnly: false })
    const end = new Date(res.body.billing.currentPeriodEnd!)
    expect(end.toISOString().slice(0, 10)).toBe(addMonths(now(), 1).toISOString().slice(0, 10))
    expect(res.body.billing.aiCredits.included).toBe(2000)
    const me = await agent.get<Me>('/api/me')
    expect(me.body.billing.plan).toBe('pro')
    expect(me.body.billing.status).toBe('active')

    // Elegir lo mismo otra vez no cobra ni cambia nada.
    const again = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'pro', period: 'monthly' })
    expect(again.body.message).toMatch(/Ya tienes/)
    const history = await agent.get('/api/billing/history')
    expect(history.body.items).toHaveLength(1)
    expect(history.body.items[0]).toMatchObject({ kind: 'subscribe', plan: 'pro', status: 'applied', amount: planGross('pro', 'monthly') })
  })

  it('subir de plan a mitad de período descuenta lo no usado; bajar queda programado', async () => {
    offsetMs = 0
    const { agent } = await signup(server)
    await agent.post('/api/billing/checkout', { plan: 'pro', period: 'monthly' })
    offsetMs = 14 * DAY
    try {
      const preview = await agent.get('/api/billing/preview?plan=empresa&period=monthly')
      expect(preview.body.immediate).toBe(true)
      expect(preview.body.credit).toBeGreaterThan(0)
      const up = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'empresa', period: 'monthly' })
      expect(up.body.url).toBeNull()
      expect(up.body.billing.plan).toBe('empresa')
      expect(up.body.change?.immediate).toBe(true)
      expect(up.body.change!.credit).toBe(preview.body.credit)
      expect(up.body.change!.chargeNow).toBe(planGross('empresa', 'monthly') - up.body.change!.credit)
      expect(up.body.message).toMatch(/Descontamos \$[\d.]+ por los días que no usaste de Pro/)
      // El período nuevo parte hoy.
      expect(up.body.billing.currentPeriodEnd!.slice(0, 10)).toBe(addMonths(now(), 1).toISOString().slice(0, 10))

      const down = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'taller', period: 'monthly' })
      expect(down.body.change?.immediate).toBe(false)
      expect(down.body.billing.plan).toBe('empresa')
      expect(down.body.billing.pendingChange).toMatchObject({ plan: 'taller', period: 'monthly' })
      expect(down.body.message).toMatch(/pasas a Taller \(mensual\)/)

      // Al terminar el período, la renovación aplica el cambio programado.
      await travel(agent, 14 * DAY + 32 * DAY)
      const later = await agent.get<BillingStateDetail>('/api/billing')
      expect(later.body).toMatchObject({ plan: 'taller', status: 'active', readOnly: false })
      expect(later.body.pendingChange).toBeUndefined()
      expect(new Date(later.body.currentPeriodEnd!).getTime()).toBeGreaterThan(now().getTime())
    } finally {
      offsetMs = 0
    }
  })

  it('cancelar a fin de período, deshacer, y modo lectura al terminar (sin esconder nada)', async () => {
    offsetMs = 0
    const { agent } = await signup(server)
    const quote = await agent.post<Quote>('/api/quotes', { title: 'Obra antes de cancelar' })
    await agent.post('/api/billing/checkout', { plan: 'taller', period: 'monthly' })

    const canceled = await agent.post('/api/billing/cancel')
    expect(canceled.status).toBe(200)
    expect(canceled.body.billing).toMatchObject({ status: 'canceled', cancelAtPeriodEnd: true, readOnly: false })
    expect(canceled.body.message).toMatch(/no habrá más cobros/)
    // Idempotente.
    expect((await agent.post('/api/billing/cancel')).body.message).toMatch(/ya estaba cancelado/)

    const resumed = await agent.post('/api/billing/resume')
    expect(resumed.body.billing).toMatchObject({ status: 'active', cancelAtPeriodEnd: false })
    await agent.post('/api/billing/cancel')

    await travel(agent, 40 * DAY)
    try {
      const state = await agent.get<BillingStateDetail>('/api/billing')
      expect(state.body).toMatchObject({ status: 'expired', readOnly: true, readOnlyReason: 'plan_ended' })
      // Escrituras: 402 amable. Lecturas y descargas: siempre.
      const blocked = await agent.post('/api/quotes', {})
      expect(blocked.status).toBe(402)
      expect(blocked.body.error.code).toBe('read_only')
      expect(blocked.body.error.message).toMatch(/Tu plan terminó/)
      expect(blocked.body.upgrade).toBe('/ajustes/plan')
      expect((await agent.patch('/api/settings', { pricing: { marginPct: 30 } })).status).toBe(402)
      expect((await agent.get(`/api/quotes/${quote.body.id}`)).status).toBe(200)
      expect((await agent.request('GET', `/api/quotes/${quote.body.id}/pdf`)).status).toBe(200)
      expect((await agent.get('/api/quotes')).body.total).toBe(1)
      // Sesión y facturación siguen funcionando.
      expect((await agent.patch('/api/me', { name: 'Ana Nueva' })).status).toBe(200)
      const back = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'pro', period: 'yearly' })
      expect(back.body.billing).toMatchObject({ plan: 'pro', period: 'yearly', status: 'active', readOnly: false })
      expect((await agent.post('/api/quotes', {})).status).toBe(201)
    } finally {
      offsetMs = 0
    }
  })

  it('prueba vencida: modo lectura con mensaje de la prueba; elegir plan la reactiva', async () => {
    offsetMs = 0
    const { agent, me } = await signup(server)
    await server.deps.db.update(subscriptions).set({ trialEndsAt: new Date(now().getTime() - DAY) }).where(eq(subscriptions.orgId, me.org.id))
    const blocked = await agent.post('/api/clients', { name: 'Cliente nuevo' })
    expect(blocked.status).toBe(402)
    expect(blocked.body.error.message).toMatch(/prueba de 14 días terminó/)
    expect(blocked.body.reason).toBe('trial_ended')
    expect((await agent.get<BillingStateDetail>('/api/billing')).body.readOnlyMessage).toMatch(/prueba/)
    expect((await agent.post('/api/billing/checkout', { plan: 'taller' })).status).toBe(200)
    expect((await agent.post('/api/clients', { name: 'Cliente nuevo' })).status).toBe(201)
    // La salida de sesión nunca se bloquea.
    expect((await agent.post('/api/auth/logout')).status).toBe(200)
  })

  it('créditos IA: se renuevan cada mes, también en el plan anual', async () => {
    offsetMs = 0
    const { agent, me } = await signup(server)
    await agent.post('/api/billing/checkout', { plan: 'pro', period: 'yearly' })
    await server.deps.db.insert(aiUsage).values({ id: newId(), orgId: me.org.id, userId: me.user.id, credits: 300, mode: 'ai', createdAt: new Date(now().getTime() + 1000) })
    const first = await agent.get<BillingStateDetail>('/api/billing')
    expect(first.body.aiCredits).toMatchObject({ included: 2000, used: 300 })
    await travel(agent, 35 * DAY)
    try {
      const next = await agent.get<BillingStateDetail>('/api/billing')
      expect(next.body.aiCredits.used).toBe(0)
      expect(next.body.period).toBe('yearly')
      expect(new Date(next.body.aiCredits.resetsAt!).getTime()).toBeGreaterThan(now().getTime())
      // /api/me usa la misma ventana.
      expect((await agent.get<Me>('/api/me')).body.billing.aiCredits.used).toBe(0)
    } finally {
      offsetMs = 0
    }
  })

  it('valida el plan y sólo el dueño cambia la facturación', async () => {
    offsetMs = 0
    const owner = await signup(server)
    const bad = await owner.agent.post('/api/billing/checkout', { plan: 'gratis', period: 'monthly' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.message).toMatch(/Elige un plan/)

    const invite = await owner.agent.post('/api/team/invite', { role: 'estimator' })
    expect(invite.status).toBe(201)
    const token = String(invite.body.link).split('/').pop()
    const member = server.agent()
    const joined = await member.post(`/api/invitations/${token}/accept`, { name: 'Bruno Cotizador', email: `bruno.${Date.now()}@taller.cl`, password: 'clave-segura-123' })
    expect(joined.status).toBe(200)
    expect((await member.get('/api/billing')).status).toBe(200)
    expect((await member.post('/api/billing/checkout', { plan: 'pro', period: 'monthly' })).status).toBe(403)
    expect((await member.post('/api/billing/cancel')).status).toBe(403)
  })
})
