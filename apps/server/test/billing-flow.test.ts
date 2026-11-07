import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FlowClient, flowSign, flowSigningString, flowVerify, parseFlowDate } from '../src/services/billing/flow'
import { addMonths, planGross } from '../src/services/billing/plans'
import { setBillingGateway } from '../src/services/billing/registry'
import type { BillingStateDetail, CheckoutResult } from '../src/services/billing/service'
import { signup, startServer, type Agent, type TestServer } from './helpers'

const DAY = 86_400_000
const API_KEY = 'flow-api-key-de-prueba'
const SECRET = 'flow-secret-de-prueba'
const FORM = { 'content-type': 'application/x-www-form-urlencoded' }

let offsetMs = 0
const now = () => new Date(Date.now() + offsetMs)
const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

interface FakeSub {
  subscriptionId: string
  planId: string
  customerId: string
  subscription_start: string
  period_start: string
  period_end: string
  status: number
  morose: number
  cancel_at_period_end: number
}

/** Flow simulado: verifica la firma de cada llamada (calculada aquí, sin usar flowSign) y guarda el estado. */
class FakeFlow {
  calls: { method: string; path: string; params: Record<string, string> }[] = []
  badSignatures = 0
  plans = new Map<string, { planId: string; amount: number; interval: number; urlCallback?: string }>()
  subs = new Map<string, FakeSub>()
  registrations = new Map<string, { customerId: string; status: number }>()
  payments = new Map<string, { flowOrder: number; commerceOrder: string; amount: number; status: number; currency: string }>()
  private seq = 0

  count(path: string) {
    return this.calls.filter((c) => c.path === path).length
  }
  lastCall(path: string) {
    return [...this.calls].reverse().find((c) => c.path === path)
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const raw = method === 'GET' ? url.searchParams : new URLSearchParams(String(init?.body ?? ''))
    const params = Object.fromEntries(raw.entries())
    const { s, ...rest } = params
    const expected = createHmac('sha256', SECRET)
      .update(
        Object.keys(rest)
          .sort()
          .map((k) => `${k}${rest[k]}`)
          .join(''),
      )
      .digest('hex')
    if (s !== expected || rest.apiKey !== API_KEY) {
      this.badSignatures++
      return Response.json({ code: 108, message: 'Invalid signature' }, { status: 401 })
    }
    const path = url.pathname.replace(/^\/api\//, '')
    if (method === 'POST' && init?.headers && (init.headers as Record<string, string>)['content-type'] !== 'application/x-www-form-urlencoded') {
      return Response.json({ code: 1, message: 'Bad content type' }, { status: 400 })
    }
    this.calls.push({ method, path, params: rest })
    return this.handle(`${method} ${path}`, rest)
  }

  private handle(route: string, p: Record<string, string>): Response {
    const t = now()
    switch (route) {
      case 'POST customer/create':
        return Response.json({ customerId: `cus_${++this.seq}`, name: p.name, email: p.email, externalId: p.externalId, status: 1 })
      case 'POST customer/register': {
        const token = `reg_${++this.seq}`
        this.registrations.set(token, { customerId: p.customerId, status: 1 })
        return Response.json({ url: 'https://sandbox.flow.test/app/customer/register', token })
      }
      case 'GET customer/getRegisterStatus': {
        const reg = this.registrations.get(p.token)
        if (!reg) return Response.json({ code: 105, message: 'Token not found' }, { status: 400 })
        return Response.json({ status: String(reg.status), customerId: reg.customerId, creditCardType: 'Visa', last4CardDigits: '4242' })
      }
      case 'GET plans/get': {
        const plan = this.plans.get(p.planId)
        return plan ? Response.json(plan) : Response.json({ code: 1101, message: 'Plan not found' }, { status: 400 })
      }
      case 'POST plans/create': {
        const plan = { planId: p.planId, amount: Number(p.amount), interval: Number(p.interval), urlCallback: p.urlCallback }
        this.plans.set(p.planId, plan)
        return Response.json({ ...plan, status: 1 })
      }
      case 'POST subscription/create': {
        const plan = this.plans.get(p.planId)
        if (!plan) return Response.json({ code: 1101, message: 'Plan not found' }, { status: 400 })
        const start = p.subscription_start ? new Date(`${p.subscription_start}T${t.toISOString().slice(11, 19)}Z`) : t
        const sub: FakeSub = {
          subscriptionId: `sus_${++this.seq}`,
          planId: p.planId,
          customerId: p.customerId,
          subscription_start: fmt(start),
          period_start: fmt(start),
          period_end: fmt(addMonths(start, plan.interval === 4 ? 12 : 1)),
          status: start > t ? 0 : 1,
          morose: 0,
          cancel_at_period_end: 0,
        }
        this.subs.set(sub.subscriptionId, sub)
        return Response.json(sub)
      }
      case 'GET subscription/get': {
        const sub = this.subs.get(p.subscriptionId)
        return sub ? Response.json(sub) : Response.json({ code: 1201, message: 'Subscription not found' }, { status: 400 })
      }
      case 'POST subscription/cancel': {
        const sub = this.subs.get(p.subscriptionId)
        if (!sub) return Response.json({ code: 1201, message: 'Subscription not found' }, { status: 400 })
        if (p.at_period_end === '1') sub.cancel_at_period_end = 1
        else sub.status = 4
        return Response.json(sub)
      }
      case 'POST payment/create': {
        const token = `pay_${++this.seq}`
        const flowOrder = 9000 + this.seq
        this.payments.set(token, { flowOrder, commerceOrder: p.commerceOrder, amount: Number(p.amount), status: 1, currency: p.currency ?? 'CLP' })
        return Response.json({ url: 'https://sandbox.flow.test/app/web/pay.php', token, flowOrder })
      }
      case 'GET payment/getStatus': {
        const pay = this.payments.get(p.token)
        if (!pay) return Response.json({ code: 105, message: 'Token not found' }, { status: 400 })
        return Response.json({ ...pay, subject: 'DEKOPEN', payer: 'pagador@correo.cl', paymentData: { media: 'Webpay' } })
      }
      default:
        return Response.json({ code: 404, message: `No existe ${route}` }, { status: 404 })
    }
  }
}

let server: TestServer
let flow: FakeFlow

beforeAll(async () => {
  server = await startServer({ now })
  flow = new FakeFlow()
  setBillingGateway(server.deps, {
    kind: 'flow',
    client: new FlowClient({ apiKey: API_KEY, secretKey: SECRET, apiUrl: 'https://sandbox.flow.test/api', fetch: flow.fetch }),
  })
})
afterAll(async () => {
  await server?.close()
})

async function travel(agent: Agent, toOffsetMs: number) {
  while (offsetMs < toOffsetMs) {
    offsetMs = Math.min(toOffsetMs, offsetMs + 20 * DAY)
    await agent.get('/api/me')
  }
}

/** Cuenta nueva suscrita a Pro mensual con tarjeta registrada en Flow. */
async function subscribed() {
  const ctx = await signup(server)
  const checkout = await ctx.agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'pro', period: 'monthly' })
  const token = new URL(checkout.body.url!).searchParams.get('token')!
  const back = await server.agent().post(`/api/billing/flow/return?checkout=${checkout.body.checkoutId}`, `token=${token}`, FORM)
  expect(back.headers.get('location')).toBe('http://app.test/ajustes/plan?pago=ok')
  return { ...ctx, checkoutId: checkout.body.checkoutId! }
}

describe('firma de Flow (parámetro s)', () => {
  it('ordena por nombre, concatena nombre+valor y firma con HMAC-SHA256', () => {
    const params = { subject: 'Plan Pro', amount: 83288, apiKey: 'k', commerceOrder: 'abc', s: 'se-ignora', vacio: undefined }
    expect(flowSigningString(params)).toBe('amount83288apiKeykcommerceOrderabcsubjectPlan Pro')
    const expected = createHmac('sha256', 'secreto').update('amount83288apiKeykcommerceOrderabcsubjectPlan Pro').digest('hex')
    expect(flowSign(params, 'secreto')).toBe(expected)
    expect(flowVerify({ ...params, s: expected }, 'secreto')).toBe(true)
    expect(flowVerify({ ...params, amount: 1, s: expected }, 'secreto')).toBe(false)
    expect(flowVerify({ ...params, s: expected }, 'otro')).toBe(false)
    expect(parseFlowDate('2026-11-30 13:45:00')?.toISOString()).toBe('2026-11-30T13:45:00.000Z')
    expect(parseFlowDate('2026-11-30')?.toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(parseFlowDate(null)).toBeUndefined()
  })
})

describe('Flow: suscripción, cambio de plan, cancelación', () => {
  it('registrar tarjeta → suscripción activa; el retorno es idempotente', async () => {
    offsetMs = 0
    const { agent, me } = await signup(server, { company: 'Ventanas Flow' })
    const checkout = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'pro', period: 'monthly' })
    expect(checkout.status).toBe(200)
    expect(checkout.body.url).toMatch(/^https:\/\/sandbox\.flow\.test\/app\/customer\/register\?token=reg_/)
    expect(checkout.body.billing.plan).toBe('trial')
    expect(checkout.body.billing.provider).toBe('flow')
    expect(flow.lastCall('customer/create')?.params).toMatchObject({ externalId: me.org.id, email: me.user.email, name: 'Ventanas Flow' })
    expect(flow.lastCall('customer/register')?.params.url_return).toBe(`http://app.test/api/billing/flow/return?checkout=${checkout.body.checkoutId}`)

    // Flow devuelve al navegador con POST token=… → se verifica en Flow y se activa.
    const token = new URL(checkout.body.url!).searchParams.get('token')!
    const back = await server.agent().post(`/api/billing/flow/return?checkout=${checkout.body.checkoutId}`, `token=${token}`, FORM)
    expect(back.status).toBe(303)
    expect(back.headers.get('location')).toBe('http://app.test/ajustes/plan?pago=ok')
    const plan = flow.lastCall('plans/create')!.params
    expect(plan).toMatchObject({ amount: String(planGross('pro', 'monthly')), interval: '3', currency: 'CLP', urlCallback: 'http://app.test/api/billing/flow/confirm' })
    const state = await agent.get<BillingStateDetail>('/api/billing')
    expect(state.body).toMatchObject({ plan: 'pro', status: 'active', period: 'monthly', provider: 'flow', card: { brand: 'Visa', last4: '4242' } })

    const creates = flow.count('subscription/create')
    const again = await server.agent().post(`/api/billing/flow/return?checkout=${checkout.body.checkoutId}`, `token=${token}`, FORM)
    expect(again.headers.get('location')).toBe('http://app.test/ajustes/plan?pago=ok')
    expect(flow.count('subscription/create')).toBe(creates)
    // El plan de Flow se crea una sola vez.
    await subscribed()
    expect(flow.count('plans/create')).toBe(1)
  })

  it('subir de plan: paga la diferencia con payment/create; la confirmación firmada lo activa una sola vez', async () => {
    offsetMs = 0
    const { agent } = await subscribed()
    const before = await agent.get<BillingStateDetail>('/api/billing')
    const oldSub = flow.lastCall('subscription/create')!
    const oldId = [...flow.subs.values()].find((s) => s.customerId === oldSub.params.customerId)!.subscriptionId
    await travel(agent, 10 * DAY)

    const up = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'empresa', period: 'monthly' })
    expect(up.body.url).toMatch(/^https:\/\/sandbox\.flow\.test\/app\/web\/pay\.php\?token=pay_/)
    expect(up.body.change?.immediate).toBe(true)
    expect(up.body.change!.credit).toBeGreaterThan(0)
    expect(up.body.billing.plan).toBe('pro') // todavía no pagó
    const payment = flow.lastCall('payment/create')!.params
    expect(payment).toMatchObject({ commerceOrder: up.body.checkoutId, amount: String(up.body.change!.chargeNow), currency: 'CLP', urlConfirmation: 'http://app.test/api/billing/flow/confirm' })
    expect(payment.urlReturn).toBe(`http://app.test/api/billing/flow/return?checkout=${up.body.checkoutId}`)

    // Flow cobra y avisa (servidor a servidor).
    const token = new URL(up.body.url!).searchParams.get('token')!
    flow.payments.get(token)!.status = 2
    const confirm = await server.agent().post('/api/billing/flow/confirm', `token=${token}`, FORM)
    expect(confirm.status).toBe(200)
    expect(confirm.body).toEqual({ ok: true, result: 'ok' })
    const after = await agent.get<BillingStateDetail>('/api/billing')
    expect(after.body).toMatchObject({ plan: 'empresa', period: 'monthly', status: 'active' })
    expect(new Date(after.body.currentPeriodEnd!).getTime()).toBeGreaterThan(new Date(before.body.currentPeriodEnd!).getTime())
    // La suscripción anterior se cancela y la nueva parte el próximo período (hoy ya quedó pagado).
    expect(flow.subs.get(oldId)!.status).toBe(4)
    const newSub = flow.lastCall('subscription/create')!.params
    expect(newSub.planId).toBe(`dekopen-empresa-monthly-${planGross('empresa', 'monthly')}`)
    expect(newSub.subscription_start).toBe(addMonths(now(), 1).toISOString().slice(0, 10))

    // Avisos repetidos o el retorno del navegador no vuelven a aplicar nada.
    const creates = flow.count('subscription/create')
    expect((await server.agent().post('/api/billing/flow/confirm', `token=${token}`, FORM)).body.result).toBe('ok')
    const back = await server.agent().request('GET', `/api/billing/flow/return?checkout=${up.body.checkoutId}&token=${token}`)
    expect(back.headers.get('location')).toBe('http://app.test/ajustes/plan?pago=ok')
    expect(flow.count('subscription/create')).toBe(creates)
    const history = await agent.get('/api/billing/history')
    expect(history.body.items.filter((i: { status: string }) => i.status === 'applied')).toHaveLength(2)
    offsetMs = 0
  })

  it('pago rechazado o con monto adulterado: el plan no cambia', async () => {
    offsetMs = 0
    const { agent } = await subscribed()
    const up = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'empresa2x', period: 'monthly' })
    const token = new URL(up.body.url!).searchParams.get('token')!
    flow.payments.get(token)!.status = 3
    const back = await server.agent().request('GET', `/api/billing/flow/return?checkout=${up.body.checkoutId}&token=${token}`)
    expect(back.headers.get('location')).toBe('http://app.test/ajustes/plan?pago=rechazado')
    expect((await agent.get<BillingStateDetail>('/api/billing')).body.plan).toBe('pro')

    const retry = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'empresa2x', period: 'monthly' })
    const token2 = new URL(retry.body.url!).searchParams.get('token')!
    const pay = flow.payments.get(token2)!
    pay.status = 2
    pay.amount = pay.amount - 1000
    const confirm = await server.agent().post('/api/billing/flow/confirm', `token=${token2}`, FORM)
    expect(confirm.body.result).toBe('rejected')
    expect((await agent.get<BillingStateDetail>('/api/billing')).body.plan).toBe('pro')
    const history = await agent.get('/api/billing/history')
    expect(history.body.items[0]).toMatchObject({ status: 'failed', plan: 'empresa2x' })
    expect(history.body.items[1]).toMatchObject({ status: 'rejected' })
  })

  it('bajar de plan queda programado en Flow; cancelar y deshacer', async () => {
    offsetMs = 0
    const { agent } = await subscribed()
    const current = await agent.get<BillingStateDetail>('/api/billing')
    const down = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'taller', period: 'monthly' })
    expect(down.body.url).toBeNull()
    expect(down.body.change?.immediate).toBe(false)
    expect(down.body.billing.pendingChange?.plan).toBe('taller')
    expect(flow.lastCall('subscription/cancel')!.params.at_period_end).toBe('1')
    expect(flow.lastCall('subscription/create')!.params.subscription_start).toBe(current.body.currentPeriodEnd!.slice(0, 10))
    // El historial lo marca como programado (sin cobro ahora) y dice cuándo se aplica.
    const scheduled = (await agent.get('/api/billing/history')).body.items[0]
    expect(scheduled).toMatchObject({ kind: 'change', plan: 'taller', meta: { scheduled: true } })
    expect(String(scheduled.meta.at).slice(0, 10)).toBe(current.body.currentPeriodEnd!.slice(0, 10))

    // Volver al plan actual deshace el cambio programado.
    const keep = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'pro', period: 'monthly' })
    expect(keep.body.message).toMatch(/te quedas con Pro/)
    expect(keep.body.billing.pendingChange).toBeUndefined()

    const canceled = await agent.post('/api/billing/cancel')
    expect(canceled.body.billing).toMatchObject({ status: 'canceled', cancelAtPeriodEnd: true })
    const resumed = await agent.post('/api/billing/resume')
    expect(resumed.body.billing.status).toBe('active')
    expect(flow.lastCall('subscription/create')!.params.subscription_start).toBe(current.body.currentPeriodEnd!.slice(0, 10))
  })

  it('renovación: se consulta Flow al vencer; sin pago, modo lectura tras la gracia; con tarjeta se reactiva sin salir', async () => {
    offsetMs = 0
    const { agent, me } = await subscribed()
    const first = await agent.get<BillingStateDetail>('/api/billing')
    const sub = [...flow.subs.values()].reverse().find((s) => s.status === 1)!
    // Flow cobró el mes siguiente.
    const nextEnd = addMonths(new Date(`${sub.period_end.replace(' ', 'T')}Z`), 1)
    sub.period_start = sub.period_end
    sub.period_end = fmt(nextEnd)
    await travel(agent, 32 * DAY)
    const renewed = await agent.get<BillingStateDetail>('/api/billing')
    expect(renewed.body.status).toBe('active')
    expect(new Date(renewed.body.currentPeriodEnd!).getTime()).toBeGreaterThan(new Date(first.body.currentPeriodEnd!).getTime())

    // El cobro siguiente falla (morosa) y pasa la gracia: modo lectura, descargas intactas.
    sub.morose = 1
    await travel(agent, 32 * DAY + 45 * DAY)
    const blocked = await agent.post('/api/quotes', {})
    expect(blocked.status).toBe(402)
    expect(blocked.body.reason).toBe('payment_overdue')
    expect(blocked.body.error.message).toMatch(/No pudimos cobrar tu plan/)
    expect((await agent.get('/api/quotes')).status).toBe(200)

    // Tarjeta ya registrada: elegir plan se resuelve sin redirigir.
    const again = await agent.post<CheckoutResult>('/api/billing/checkout', { plan: 'taller', period: 'yearly' })
    expect(again.body.url).toBeNull()
    expect(again.body.message).toMatch(/terminada en 4242/)
    expect(again.body.billing).toMatchObject({ plan: 'taller', period: 'yearly', status: 'active', readOnly: false })
    // La suscripción morosa anterior se retira en Flow para no cobrar dos veces.
    expect(flow.subs.get(sub.subscriptionId)!.status).toBe(4)
    expect((await agent.post('/api/quotes', {})).status).toBe(201)
    void me
    offsetMs = 0
  })

  it('callbacks: sin token 400; token desconocido 502; cobro de suscripción sin checkout → ok', async () => {
    const anon = server.agent()
    expect((await anon.post('/api/billing/flow/confirm', '', FORM)).status).toBe(400)
    const unknown = await anon.post('/api/billing/flow/confirm', 'token=nope', FORM)
    expect(unknown.status).toBe(502)
    expect(unknown.body.error.code).toBe('payment_provider')
    flow.payments.set('inv_1', { flowOrder: 1, commerceOrder: 'factura-suscripcion-77', amount: 1000, status: 2, currency: 'CLP' })
    expect((await anon.post('/api/billing/flow/confirm', 'token=inv_1', FORM)).body).toEqual({ ok: true, result: 'unknown' })
    // Retorno sin datos: nunca un error en pantalla.
    expect((await anon.request('GET', '/api/billing/flow/return')).headers.get('location')).toBe('http://app.test/ajustes/plan?pago=desconocido')
  })

  it('todas las llamadas a Flow iban firmadas correctamente', () => {
    expect(flow.calls.length).toBeGreaterThan(20)
    expect(flow.badSignatures).toBe(0)
  })
})
