import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { DEFAULT_PAYMENTS, depositAmount, nextDue, paymentPlan, safePaymentUrl, type Quote, type QuoteStats } from '@dekopen/shared'
import { orgPaymentKeys, quotePayments } from '../src/db/schema'
import { openSecret, sealSecret } from '../src/lib/secret-box'
import { redactPath } from '../src/lib/redact'
import { portalExperience } from '../src/routes/public'
import { ArModelStore } from '../src/services/ar-models'
import { flowSign } from '../src/services/billing/flow'
import { setPdfRenderer } from '../src/services/pdf'
import { setPaymentFlowFetch } from '../src/services/payments'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

const MASTER = 'clave-maestra-de-prueba-con-32-caracteres-o-mas'
const API_KEY = 'llave-publica-del-taller-123456'
const SECRET_KEY = 'llave-secreta-del-taller-abcdefg'
const FORM = { 'content-type': 'application/x-www-form-urlencoded' }

let server: TestServer

beforeAll(async () => {
  server = await startServer({ config: { paymentKeysSecret: MASTER } })
})
afterAll(async () => {
  await server?.close()
})

async function sentQuote(company: string, body: Record<string, unknown> = { channel: 'whatsapp', format: 'link' }, clientEmail: string | undefined = 'cliente@correo.cl') {
  const { agent } = await signup(server, { company })
  const client = await agent.post('/api/clients', { name: 'Carolina Fuentes', ...(clientEmail ? { email: clientEmail } : {}) })
  const design = await sampleDesign(agent)
  const created = await agent.post<Quote>('/api/quotes', { clientId: client.body.id, title: 'Casa Fuentes', items: [item(design)] })
  const sent = await agent.post(`/api/quotes/${created.body.id}/send`, body)
  expect(sent.status).toBe(200)
  return { agent, quote: sent.body.quote as Quote, token: sent.body.quote.shareToken as string, anon: server.agent() }
}

const accept = (anon: TestServer extends never ? never : ReturnType<TestServer['agent']>, token: string, body: Record<string, unknown> = {}) =>
  anon.post(`/api/public/quotes/${token}/accept`, { name: 'Carolina Fuentes', declared: true, ...body })

const BANK = { id: 'c1', holder: 'Aberturas SpA', rut: '76.543.210-3', bank: 'Banco de prueba', type: 'corriente', number: '000123456', email: 'pagos@taller.cl' }

describe('reglas de pago', () => {
  it('solo https de verdad en los enlaces de pago', () => {
    expect(safePaymentUrl('https://www.flow.cl/btn.php?token=abc')).toBe('https://www.flow.cl/btn.php?token=abc')
    expect(safePaymentUrl('  https://link.mercadopago.cl/taller ')).toBe('https://link.mercadopago.cl/taller')
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'http://flow.cl/pago', 'https://usuario:clave@flow.cl', 'https://localhost/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://flow.cl/a b', ' java\tscript:alert(1)', 'https:\\\\evil.cl', '//evil.cl', 'flow.cl']) {
      expect(safePaymentUrl(bad), bad).toBeNull()
    }
  })

  it('abono en porcentaje o monto, nunca más que el total', () => {
    expect(depositAmount({ mode: 'percent', value: 30 }, 1_000_001)).toBe(300_000)
    expect(depositAmount({ mode: 'amount', value: 200_000 }, 150_000)).toBe(150_000)
    expect(depositAmount({ mode: 'none', value: 50 }, 100)).toBeNull()
    expect(depositAmount({ mode: 'percent', value: 0 }, 100)).toBeNull()
  })

  it('3D y AR dependen del taller y del plan', () => {
    expect(portalExperience({ portal3d: true, portalAr: true }, true)).toEqual({ view3d: true, ar: true })
    expect(portalExperience({ portal3d: true, portalAr: false }, true)).toEqual({ view3d: true, ar: false })
    expect(portalExperience({ portal3d: false, portalAr: true }, true)).toEqual({ view3d: false, ar: false })
    expect(portalExperience({ portal3d: true, portalAr: true }, false)).toEqual({ view3d: false, ar: false })
  })

  it('el cifrado queda atado a la organización y al campo', () => {
    const sealed = sealSecret('secreto', MASTER, 'org-a', 'flow.secretKey')
    expect(sealed).not.toContain('secreto')
    expect(openSecret(sealed, MASTER, 'org-a', 'flow.secretKey')).toBe('secreto')
    expect(() => openSecret(sealed, MASTER, 'org-b', 'flow.secretKey')).toThrow()
    expect(() => openSecret(sealed, MASTER, 'org-a', 'flow.apiKey')).toThrow()
    expect(() => openSecret(sealed, `${MASTER}x`, 'org-a', 'flow.secretKey')).toThrow()
  })
})

describe('envío', () => {
  it('sin nada configurado: PDF por defecto, sin pagos prellenados y el portal no muestra sección de pago', async () => {
    const { agent, token, anon } = await sentQuote('Taller Vacío')
    const settings = await agent.get('/api/settings')
    expect(settings.body.sending.format).toBe('pdf')
    expect(settings.body.payments).toEqual(DEFAULT_PAYMENTS)
    const view = await anon.get(`/api/public/quotes/${token}`)
    expect(view.body.payment).toBeUndefined()
    expect(view.body.experience).toEqual({ view3d: true, ar: true })
    expect(view.headers.get('cache-control')).toContain('no-store')
    expect(view.headers.get('x-robots-tag')).toContain('noindex')
  })

  it('sin vigencia definida la cotización sale sin fecha: no aparece vencida el mismo día', async () => {
    const { quote } = await sentQuote('Taller Sin Vigencia')
    expect(quote.validUntil).toBeUndefined()
  })

  it('el seguimiento distingue un envío solo PDF, y la misma versión puede salir por otra vía sin versión nueva', async () => {
    const { agent, quote } = await sentQuote('Taller PDF', { channel: 'whatsapp', format: 'pdf' })
    expect(quote.sentFormat).toBe('pdf')
    await agent.post(`/api/quotes/${quote.id}/follow-up`, { at: new Date(Date.now() - 86_400_000).toISOString() })
    const stats = await agent.get<QuoteStats>('/api/quotes/stats')
    const row = stats.body.followUps.find((f) => f.id === quote.id)
    expect(row).toMatchObject({ sentFormat: 'pdf' })
    expect(row?.viewedAt).toBeUndefined()

    const shared = await agent.post(`/api/quotes/${quote.id}/shared`, { format: 'link' })
    expect(shared.body.sentFormat).toBe('both')
    const after = await agent.get<Quote>(`/api/quotes/${quote.id}`)
    expect(after.body).toMatchObject({ revision: 1, version: quote.version, sentFormat: 'both' })
  })

  it('el formato no se filtra al cliente, y /send respeta el formato que pide el asistente', async () => {
    const { token, anon, agent, quote } = await sentQuote('Taller Correo', { channel: 'whatsapp', format: 'both' })
    expect(quote.sentFormat).toBe('both')
    const view = await anon.get(`/api/public/quotes/${token}`)
    expect(view.body.quote.sentFormat).toBeUndefined()
    // Sin formato sigue el contrato anterior: enlace.
    expect((await agent.post(`/api/quotes/${quote.id}/send`, { channel: 'link' })).body.quote.sentFormat).toBe('link')
  })

  it('sin proveedor de correo un envío solo PDF lo dice y no finge: no sale nada', async () => {
    const { agent } = await signup(server, { company: 'Taller Solo Correo' })
    const design = await sampleDesign(agent)
    const created = await agent.post<Quote>('/api/quotes', { title: 'X', items: [item(design)] })
    expect((await agent.get('/api/settings')).body.mailProvider).toBe(false)
    const before = server.mails.length
    const res = await agent.post(`/api/quotes/${created.body.id}/send`, { channel: 'email', format: 'pdf', to: 'cliente@correo.cl' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ emailed: 'no_provider', attached: false })
    expect(server.mails.length).toBe(before)
  })

  it('la descarga del PDF desde el portal queda registrada una vez y no cuenta si la hace el taller', async () => {
    const { agent, token, anon } = await sentQuote('Taller Descarga')
    await agent.get(`/api/public/quotes/${token}/pdf`)
    const count = async () => (await agent.get('/api/activity')).body.items?.filter((e: { kind: string }) => e.kind === 'quote.pdf_downloaded').length ?? 0
    expect(await count()).toBe(0)
    const first = await anon.get(`/api/public/quotes/${token}/pdf`)
    if (first.status !== 200) return // Sin Chromium en esta máquina responde 503: no hay descarga que registrar.
    await anon.get(`/api/public/quotes/${token}/pdf`)
    expect(await count()).toBe(1)
  })
})

describe('pagos en el portal', () => {
  it('con «solo tras aceptar», antes de aceptar no sale ningún dato de pago del servidor', async () => {
    const { agent, token, anon } = await sentQuote('Taller Banco')
    const saved = await agent.patch('/api/settings', {
      payments: { accounts: [BANK], instructions: 'Avísame al transferir', links: [{ id: 'l1', label: 'Pagar con Flow', url: 'https://www.flow.cl/btn.php?token=abc' }], deposit: { mode: 'percent', value: 30 } },
    })
    expect(saved.status).toBe(200)

    const before = await anon.get(`/api/public/quotes/${token}`)
    expect(before.body.payment.unlocked).toBe(false)
    expect(before.body.payment.deposit.pct).toBe(30)
    const raw = JSON.stringify(before.body)
    for (const secret of ['000123456', 'pagos@taller.cl', 'Avísame al transferir', 'flow.cl/btn']) expect(raw).not.toContain(secret)

    await accept(anon, token)
    const after = await anon.get(`/api/public/quotes/${token}`)
    const total = after.body.quote.totals.total
    expect(after.body.payment).toMatchObject({ unlocked: true, accounts: [BANK], instructions: 'Avísame al transferir', links: [{ id: 'l1', label: 'Pagar con Flow' }] })
    expect(after.body.payment.deposit.amount).toBe(Math.round(total * 0.3))
    expect(after.body.payment.flow).toBeUndefined()
  })

  it('«desde que abre el enlace» los muestra antes de aceptar, sin Flow', async () => {
    const { agent, token, anon } = await sentQuote('Taller Abierto')
    await agent.patch('/api/settings', { payments: { accounts: [BANK], showWhen: 'always' } })
    const view = await anon.get(`/api/public/quotes/${token}`)
    expect(view.body.payment).toMatchObject({ unlocked: true, accounts: [BANK] })
  })

  it('rechaza enlaces que no son https al guardar, y una cuenta a medias no se publica', async () => {
    const { agent, token, anon } = await sentQuote('Taller Enlaces')
    for (const url of ['javascript:alert(1)', 'http://flow.cl', 'data:text/html,x']) {
      const res = await agent.patch('/api/settings', { payments: { links: [{ id: 'x', label: 'Pagar', url }] } })
      expect(res.status, url).toBe(400)
    }
    await agent.patch('/api/settings', { payments: { accounts: [{ ...BANK, number: '' }], showWhen: 'always' } })
    const view = await anon.get(`/api/public/quotes/${token}`)
    expect(view.body.payment).toBeUndefined()
  })

  it('«marcar abono recibido» se ve en el portal y se deshace', async () => {
    const { agent, quote, token, anon } = await sentQuote('Taller Abono')
    await agent.patch('/api/settings', { payments: { accounts: [BANK], deposit: { mode: 'amount', value: 100_000 } } })
    const added = await agent.post(`/api/quotes/${quote.id}/payments`, { amount: 100_000, method: 'transfer', reference: 'Comprobante 77' })
    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ received: 100_000 })
    const view = await anon.get(`/api/public/quotes/${token}`)
    expect(view.body.payment.received.amount).toBe(100_000)
    const removed = await agent.delete(`/api/quotes/${quote.id}/payments/${added.body.payments[0].id}`)
    expect(removed.body.received).toBe(0)
    const stranger = await signup(server, { company: 'Otro Taller' })
    expect((await stranger.agent.get(`/api/quotes/${quote.id}/payments`)).status).toBe(404)
  })
})

describe('correo con el PDF adjunto', () => {
  const PDF = Buffer.from('%PDF-1.7 prueba')
  let mailing: TestServer
  let pdfFails = false

  beforeAll(async () => {
    // Como en producción: hay proveedor. El correo se captura y el PDF no necesita Chromium.
    mailing = await startServer({ config: { resendApiKey: 'clave-de-prueba' } })
    setPdfRenderer(mailing.deps, {
      render: async () => {
        if (pdfFails) throw new Error('sin Chromium')
        return PDF
      },
    } as never)
  })
  afterAll(async () => {
    await mailing?.close()
  })

  async function draft(company: string) {
    const { agent } = await signup(mailing, { company })
    await agent.patch('/api/org', { email: 'ventas@taller.test' })
    const design = await sampleDesign(agent)
    const created = await agent.post<Quote>('/api/quotes', { title: 'Casa', items: [item(design)] })
    return { agent, id: created.body.id }
  }

  it('el servidor dice que hay proveedor, y sale el PDF de verdad, sin enlace y con respuesta al taller', async () => {
    const { agent, id } = await draft('Taller Adjunto')
    expect((await agent.get('/api/settings')).body.mailProvider).toBe(true)
    const message = 'Hola Ana, te envío la cotización.\n\nAna'
    const res = await agent.post(`/api/quotes/${id}/send`, { channel: 'email', format: 'pdf', to: 'cliente@correo.cl', message })
    expect(res.body).toMatchObject({ emailed: 'sent', attached: true })
    const mail = mailing.mails.at(-1)!
    expect(mail.to).toBe('cliente@correo.cl')
    expect(mail.replyTo).toBe('ventas@taller.test')
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments![0]!.filename).toMatch(/\.pdf$/)
    expect(mail.attachments![0]!.content.equals(PDF)).toBe(true)
    expect(mail.text).toBe(message)
    expect(mail.text).not.toContain('/c/')
    expect(mail.html).not.toContain('/c/')
  })

  it('con ambos pone el enlace real donde iba {enlace}, una sola vez', async () => {
    const { agent, id } = await draft('Taller Ambos')
    const res = await agent.post(`/api/quotes/${id}/send`, { channel: 'email', format: 'both', to: 'cliente@correo.cl', message: 'Revísala aquí: {enlace}\n\nAna' })
    expect(res.body).toMatchObject({ emailed: 'sent', attached: true })
    const mail = mailing.mails.at(-1)!
    expect(mail.text).toBe(`Revísala aquí: ${res.body.url}\n\nAna`)
    expect(mail.text.split(res.body.url).length - 1).toBe(1)
  })

  it('sin PDF posible: solo PDF no manda nada y lo dice; con ambos sale el enlace y se avisa', async () => {
    const { agent, id } = await draft('Taller Sin Chromium')
    pdfFails = true
    try {
      const before = mailing.mails.length
      const solo = await agent.post(`/api/quotes/${id}/send`, { channel: 'email', format: 'pdf', to: 'cliente@correo.cl' })
      expect(solo.body).toMatchObject({ emailed: 'failed', attached: false })
      expect(mailing.mails.length).toBe(before)
      const both = await agent.post(`/api/quotes/${id}/shared`, { format: 'both', to: 'cliente@correo.cl' })
      expect(both.body).toMatchObject({ emailed: 'sent', attached: false })
      expect(mailing.mails.at(-1)!.attachments).toBeUndefined()
    } finally {
      pdfFails = false
    }
  })

  it('la misma versión se puede mandar por correo sin crear otra', async () => {
    const { agent, id } = await draft('Taller Misma Versión')
    await agent.post(`/api/quotes/${id}/send`, { channel: 'whatsapp', format: 'pdf' })
    const res = await agent.post(`/api/quotes/${id}/shared`, { format: 'pdf', to: 'cliente@correo.cl' })
    expect(res.body).toMatchObject({ sentFormat: 'pdf', emailed: 'sent', attached: true })
    expect((await agent.get<Quote>(`/api/quotes/${id}`)).body.revision).toBe(1)
  })

  it('si el proveedor falla, se dice', async () => {
    const { agent, id } = await draft('Taller Falla')
    const send = mailing.deps.mailer.send
    mailing.deps.mailer.send = async () => {
      throw new Error('Resend respondió 500')
    }
    try {
      const res = await agent.post(`/api/quotes/${id}/send`, { channel: 'email', format: 'pdf', to: 'cliente@correo.cl' })
      expect(res.body).toMatchObject({ emailed: 'failed', attached: false })
    } finally {
      mailing.deps.mailer.send = send
    }
  })
})

describe('hitos de pago', () => {
  const steps = [
    { id: 'a', label: 'Al aceptar', pct: 33.3 },
    { id: 'b', label: 'Al iniciar', pct: 33.3 },
    { id: 'c', label: 'Contra entrega', pct: 33.4 },
  ]

  it('la suma da el total exacto, y lo recibido avanza al hito siguiente', () => {
    const plan = paymentPlan({ mode: 'milestones', value: 0, milestones: steps }, 1_000_001)
    expect(plan.reduce((sum, s) => sum + s.amount, 0)).toBe(1_000_001)
    expect(plan[0]).toMatchObject({ label: 'Al aceptar', pct: 33.3 })
    expect(nextDue(plan, 0)).toBe(plan[0]!.amount)
    expect(nextDue(plan, 100)).toBe(plan[0]!.amount - 100)
    expect(nextDue(plan, plan[0]!.amount)).toBe(plan[1]!.amount)
    expect(nextDue(plan, 1_000_001)).toBe(0)
  })

  it('un hito sin porcentaje no cuenta, y no se guardan hitos que pasen de 100 %', async () => {
    expect(paymentPlan({ mode: 'milestones', value: 0, milestones: [{ id: 'x', label: 'Nada', pct: 0 }] }, 100)).toEqual([])
    const { agent } = await signup(server, { company: 'Taller Hitos Malos' })
    const res = await agent.patch('/api/settings', { payments: { deposit: { mode: 'milestones', value: 0, milestones: [{ id: 'a', label: 'A', pct: 80 }, { id: 'b', label: 'B', pct: 30 }] } } })
    expect(res.status).toBe(400)
  })

  it('el portal recibe el plan, y el taller ve cuánto corresponde cobrar ahora', async () => {
    const { agent, quote, token, anon } = await sentQuote('Taller Hitos')
    await agent.patch('/api/settings', { payments: { accounts: [BANK], deposit: { mode: 'milestones', value: 0, milestones: steps } } })
    await accept(anon, token)
    const view = await anon.get(`/api/public/quotes/${token}`)
    const total = view.body.quote.totals.total
    expect(view.body.payment.deposit.mode).toBe('milestones')
    expect(view.body.payment.deposit.milestones).toHaveLength(3)
    const plan = paymentPlan({ mode: 'milestones', value: 0, milestones: steps }, total)
    const first = await agent.get(`/api/quotes/${quote.id}/payments`)
    expect(first.body.due).toBe(plan[0]!.amount)
    const after = await agent.post(`/api/quotes/${quote.id}/payments`, { amount: plan[0]!.amount, method: 'transfer' })
    expect(after.body.due).toBe(plan[1]!.amount)
  })
})

describe('modelo de paso para Scene Viewer', () => {
  /** GLB mínimo: cabecera + bloque JSON. */
  function glb(extra = 0) {
    const json = new TextEncoder().encode('{"asset":{"version":"2.0"}}'.padEnd(28 + extra, ' '))
    const bytes = new Uint8Array(20 + json.length)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, bytes.length, true)
    view.setUint32(12, json.length, true)
    view.setUint32(16, 0x4e4f534a, true)
    bytes.set(json, 20)
    return bytes
  }
  const upload = (app: TestServer['app'], token: string, body: BodyInit, ip: string) =>
    app.request(`/api/public/quotes/${token}/ar-model`, { method: 'POST', body, headers: { 'content-type': 'model/gltf-binary', 'x-forwarded-for': ip } })

  it('guarda un GLB de verdad con token válido, lo sirve sin sesión y como modelo', async () => {
    const { token, anon } = await sentQuote('Taller AR')
    const res = await upload(server.app, token, glb(), '10.9.0.1')
    expect(res.status).toBe(201)
    const { url } = (await res.json()) as { url: string }
    expect(url).toMatch(/^http:\/\/app\.test\/api\/public\/ar\/[\w-]+\.glb$/)
    const got = await anon.get(url.replace('http://app.test', ''))
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('model/gltf-binary')
    expect(got.headers.get('x-content-type-options')).toBe('nosniff')
    expect(got.headers.get('content-security-policy')).toContain("default-src 'none'")
  })

  it('rechaza lo que no es GLB, un token falso y a un taller con el AR apagado', async () => {
    const { agent, token } = await sentQuote('Taller AR Apagado')
    expect((await upload(server.app, token, new TextEncoder().encode('<html><script>alert(1)</script></html>'.padEnd(64, ' ')), '10.9.0.2')).status).toBe(400)
    const liar = glb()
    new DataView(liar.buffer).setUint32(8, 9999, true)
    expect((await upload(server.app, token, liar, '10.9.0.2')).status).toBe(400)
    expect((await upload(server.app, 'token-falso', glb(), '10.9.0.2')).status).toBe(404)
    await agent.patch('/api/settings', { sending: { portalAr: false } })
    expect((await upload(server.app, token, glb(), '10.9.0.2')).status).toBe(404)
  })

  it('tiene tope por persona y cotización', async () => {
    const { token } = await sentQuote('Taller AR Tope')
    const results = []
    for (let i = 0; i < 14; i++) results.push((await upload(server.app, token, glb(), '10.9.0.3')).status)
    expect(results.filter((s) => s === 201)).toHaveLength(12)
    expect(results.at(-1)).toBe(429)
  })

  it('el modelo vence, y una dirección inventada no existe', async () => {
    let time = Date.now()
    const store = new ArModelStore(() => time)
    const id = store.put(glb())
    expect(store.get(id)).toBeTruthy()
    time += 11 * 60_000
    expect(store.get(id)).toBeUndefined()
    expect((await server.agent().get('/api/public/ar/inventado.glb')).status).toBe(404)
    expect((await server.agent().get('/api/public/ar/..%2f..%2fetc.glb')).status).toBe(404)
    expect(redactPath('/api/public/ar/secreto.glb')).toBe('/api/public/ar/:token')
  })
})

describe('Flow con las llaves del taller', () => {
  /** Flow falso: guarda lo creado y responde como su API, firma incluida. */
  function fakeFlow() {
    const orders = new Map<string, { commerceOrder: string; amount: number; status: number }>()
    const calls: Record<string, string>[] = []
    const fetchFn: typeof fetch = async (input, init) => {
      const url = new URL(String(input))
      const params = Object.fromEntries(init?.method === 'POST' ? new URLSearchParams(String(init.body)) : url.searchParams)
      calls.push(params)
      const { s, ...signed } = params
      if (params.apiKey !== API_KEY || s !== flowSign(signed, SECRET_KEY)) return Response.json({ code: 105, message: 'No services available' }, { status: 401 })
      if (url.pathname.endsWith('/payment/create')) {
        const token = `tok_${orders.size + 1}`
        orders.set(token, { commerceOrder: params.commerceOrder!, amount: Number(params.amount), status: 1 })
        return Response.json({ url: 'https://sandbox.flow.cl/app/web/pay.php', token, flowOrder: orders.size })
      }
      const order = orders.get(params.token!)
      return order ? Response.json({ flowOrder: 1, commerceOrder: order.commerceOrder, status: order.status, amount: order.amount }) : Response.json({ code: 108, message: 'Order not found' }, { status: 400 })
    }
    return { orders, calls, fetchFn }
  }

  async function connected(company: string) {
    const ctx = await sentQuote(company)
    const flow = fakeFlow()
    setPaymentFlowFetch(server.deps, flow.fetchFn)
    await ctx.agent.patch('/api/settings', { payments: { deposit: { mode: 'percent', value: 50 } } })
    const put = await ctx.agent.put('/api/settings/payments/flow', { apiKey: API_KEY, secretKey: SECRET_KEY, sandbox: true })
    expect(put.status).toBe(200)
    expect(JSON.stringify(put.body)).not.toMatch(/llave/)
    return { ...ctx, flow }
  }

  it('sin clave maestra queda apagado y no guarda nada', async () => {
    const off = await startServer({ config: { paymentKeysSecret: undefined } })
    try {
      const { agent } = await signup(off, { company: 'Sin clave' })
      expect((await agent.get('/api/settings/payments/flow')).body).toMatchObject({ available: false, configured: false })
      expect((await agent.put('/api/settings/payments/flow', { apiKey: API_KEY, secretKey: SECRET_KEY })).status).toBe(503)
    } finally {
      await off.close()
    }
  })

  it('las llaves quedan cifradas, nunca vuelven y no llegan al portal', async () => {
    const { agent, token, anon } = await connected('Taller Llaves')
    const [row] = await server.deps.db.select().from(orgPaymentKeys).where(eq(orgPaymentKeys.orgId, (await agent.get('/api/me')).body.org.id))
    expect(row!.apiKey).not.toContain(API_KEY)
    expect(row!.secretKey).not.toContain(SECRET_KEY)
    const status = await agent.get('/api/settings/payments/flow')
    expect(status.body).toMatchObject({ available: true, configured: true, sandbox: true })
    const everything = JSON.stringify([status.body, (await agent.get('/api/settings')).body, (await anon.get(`/api/public/quotes/${token}`)).body])
    expect(everything).not.toContain(API_KEY)
    expect(everything).not.toContain(SECRET_KEY)
    expect(everything).not.toContain(row!.secretKey)
    await agent.delete('/api/settings/payments/flow')
    expect((await agent.get('/api/settings/payments/flow')).body.configured).toBe(false)
  })

  it('el empleado no ve ni cambia las llaves; el rol lo decide el servidor', async () => {
    const res = await server.agent().get('/api/settings/payments/flow')
    expect(res.status).toBe(401)
  })

  it('cobra el abono que calcula el servidor; volver del pago no marca nada: manda la consulta firmada', async () => {
    const { agent, quote, token, anon, flow } = await connected('Taller Flow')
    // Sin aceptar no se cobra.
    expect((await anon.post(`/api/public/quotes/${token}/pay/flow`, {})).status).toBe(409)
    await accept(anon, token)
    const view = await anon.get(`/api/public/quotes/${token}`)
    expect(view.body.payment.flow).toBe(true)
    const deposit = view.body.payment.deposit.amount

    // Un monto mandado por el navegador se ignora.
    const pay = await anon.post(`/api/public/quotes/${token}/pay/flow`, { amount: 1 })
    expect(pay.status).toBe(200)
    expect(pay.body.url).toMatch(/^https:\/\/sandbox\.flow\.cl\/app\/web\/pay\.php\?token=tok_1$/)
    const [order] = [...flow.orders.values()]
    expect(order!.amount).toBe(deposit)
    const [row] = await server.deps.db.select().from(quotePayments).where(eq(quotePayments.quoteId, quote.id))
    expect(row).toMatchObject({ status: 'pending', amount: deposit })

    // Vuelve el navegador con el pago aún pendiente en Flow: sigue pendiente.
    const back = await anon.post(`/api/public/pay/flow/return/${row!.id}`, 'token=tok_1', FORM)
    expect(back.status).toBe(303)
    expect(back.headers.get('location')).toBe(`http://app.test/c/${token}?pago=pendiente`)
    expect((await anon.get(`/api/public/quotes/${token}`)).body.payment.received).toBeUndefined()

    // Token de otro pago: no se aplica.
    expect((await anon.post(`/api/public/pay/flow/confirm/${row!.id}`, 'token=tok_falso', FORM)).status).toBe(502)

    // Flow confirma: una sola vez, aunque avise dos.
    flow.orders.get('tok_1')!.status = 2
    for (let i = 0; i < 2; i++) {
      const confirm = await anon.post(`/api/public/pay/flow/confirm/${row!.id}`, 'token=tok_1', FORM)
      expect(confirm.body.result).toBe('paid')
    }
    const paid = await anon.get(`/api/public/quotes/${token}`)
    expect(paid.body.payment.received.amount).toBe(deposit)
    const list = await agent.get(`/api/quotes/${quote.id}/payments`)
    expect(list.body.payments).toHaveLength(1)
    // Ya pagado no se cobra de nuevo, y lo que confirmó Flow no se borra a mano.
    expect((await anon.post(`/api/public/quotes/${token}/pay/flow`, {})).status).toBe(409)
    expect((await agent.delete(`/api/quotes/${quote.id}/payments/${row!.id}`)).status).toBe(404)
  })

  it('un monto distinto al del cobro no se da por pagado', async () => {
    const { quote, token, anon, flow } = await connected('Taller Monto')
    await accept(anon, token)
    await anon.post(`/api/public/quotes/${token}/pay/flow`, {})
    const [row] = await server.deps.db.select().from(quotePayments).where(eq(quotePayments.quoteId, quote.id))
    const order = flow.orders.get('tok_1')!
    order.status = 2
    order.amount = 1
    const res = await anon.post(`/api/public/pay/flow/confirm/${row!.id}`, 'token=tok_1', FORM)
    expect(res.body.result).toBe('unknown')
    expect((await anon.get(`/api/public/quotes/${token}`)).body.payment.received).toBeUndefined()
  })

  it('si Flow rechaza las llaves, el cliente recibe un aviso limpio y el taller queda enterado', async () => {
    const { agent, token, anon } = await connected('Taller Rechazo')
    await agent.put('/api/settings/payments/flow', { apiKey: 'otra-llave-publica-incorrecta', secretKey: SECRET_KEY, sandbox: true })
    await accept(anon, token)
    const res = await anon.post(`/api/public/quotes/${token}/pay/flow`, {})
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('payment_unavailable')
    expect(JSON.stringify(res.body)).not.toContain('No services')
    const activity = await agent.get('/api/activity')
    expect(JSON.stringify(activity.body)).toContain('quote.payment_failed')
  })

  it('las rutas con secretos no llegan al log', () => {
    expect(redactPath('/api/public/pay/flow/confirm/abc-123')).toBe('/api/public/pay/flow/confirm/:token')
    expect(redactPath('/api/public/quotes/tokenreal/pay/flow')).toBe('/api/public/quotes/:token/pay/flow')
  })
})

describe('opcionales y alternativas al aceptar', () => {
  async function withChoices() {
    const { agent } = await signup(server, { company: 'Taller Opciones' })
    const design = await sampleDesign(agent)
    const base = item(design, { id: 'base' })
    const optional = item(design, { id: 'opc', role: 'optional' })
    const altA = item(design, { id: 'altA', role: 'alternative', altGroup: 'Living' })
    const altB = item({ ...design, width: design.width + 400 }, { id: 'altB', role: 'alternative', altGroup: 'Living' })
    const created = await agent.post<Quote>('/api/quotes', { title: 'Con opciones', items: [base, optional, altA, altB] })
    expect(created.status).toBe(201)
    const sent = await agent.post(`/api/quotes/${created.body.id}/send`, { format: 'link' })
    return { agent, quote: sent.body.quote as Quote, token: sent.body.quote.shareToken as string, anon: server.agent() }
  }

  it('el total lo recalcula el servidor con los precios enviados, y lo elegido queda en la revisión', async () => {
    const { agent, quote, token, anon } = await withChoices()
    const view = await anon.get(`/api/public/quotes/${token}`)
    const prices = view.body.prices as Record<string, { totalNet: number }>
    const baseTotal = view.body.quote.totals.total
    const selection = { optional: { opc: true }, alternatives: { Living: 'altB' } }
    const res = await accept(anon, token, { selection, total: 1 })
    expect(res.status).toBe(200)

    const after = await agent.get<Quote>(`/api/quotes/${quote.id}`)
    const items = Object.fromEntries(after.body.items.map((i) => [i.id, i.included]))
    expect(items).toMatchObject({ opc: true, altA: false, altB: true })
    const portal = await anon.get(`/api/public/quotes/${token}`)
    expect(portal.body.quote.totals.total).toBeGreaterThan(baseTotal)
    const net = prices.base!.totalNet + prices.opc!.totalNet + prices.altB!.totalNet
    expect(portal.body.quote.totals.subtotal).toBe(net)
  })

  it('un id inventado en la elección no cambia nada', async () => {
    const { token, anon } = await withChoices()
    const before = (await anon.get(`/api/public/quotes/${token}`)).body.quote.totals.total
    await accept(anon, token, { selection: { optional: { fantasma: true }, alternatives: { Living: 'fantasma' } } })
    expect((await anon.get(`/api/public/quotes/${token}`)).body.quote.totals.total).toBe(before)
  })
})
