import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Me, OrgSettings } from '@framezen/shared'
import { signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server?.close()
})

describe('salud y arranque', () => {
  it('responde /api/health y aplica las migraciones', async () => {
    const res = await server.agent().get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(server.migrations.length).toBeGreaterThan(0)
  })

  it('las rutas desconocidas responden 404 con error humano', async () => {
    const res = await server.agent().get('/api/no-existe')
    expect([401, 404]).toContain(res.status)
    expect(res.body.error.message).toMatch(/[a-záéíóú]/i)
  })
})

describe('crear cuenta, entrar y salir', () => {
  it('crea usuario, empresa, prueba de 14 días y sesión', async () => {
    const { agent, me } = await signup(server, { name: 'Marcela Rojas', company: 'Termopaneles Rojas' })
    expect(me.user.name).toBe('Marcela Rojas')
    expect(me.org.name).toBe('Termopaneles Rojas')
    expect(me.role).toBe('owner')
    expect(me.solo).toBe(true)
    expect(me.onboarded).toBe(false)
    expect(me.billing.plan).toBe('trial')
    expect(me.billing.status).toBe('trialing')
    expect(me.billing.aiCredits.included).toBe(500)
    expect(me.billing.features).toContain('assistant')
    const days = (new Date(me.billing.trialEndsAt!).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThan(14.1)
    expect(agent.cookie).toBeTruthy()

    const again = await agent.get<Me>('/api/me')
    expect(again.status).toBe(200)
    expect(again.body.user.email).toBe(me.user.email)
  })

  it('la cookie es httpOnly y SameSite=Lax', async () => {
    const res = await server.agent().post('/api/auth/signup', { name: 'Pedro', email: `pedro.${Date.now()}@taller.cl`, password: 'clave-segura-123', company: 'PVC Pedro' })
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/fz_session=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })

  it('deja ajustes por defecto y 3 marcas activas', async () => {
    const { agent } = await signup(server)
    const settings = (await agent.get<OrgSettings>('/api/settings')).body
    expect(settings.pricing.marginPct).toBe(40)
    expect(settings.pricing.ivaPct).toBe(19)
    expect(settings.cut.barLength).toBe(5800)
    expect(settings.nextQuoteNumber).toBe(1)
    expect(settings.documents.validityDays).toBe(15)
    expect(settings.documents.intro.length).toBeGreaterThan(40)
    const brands = (await agent.get('/api/catalog/brands')).body
    const enabled = brands.items.filter((b: { enabled: boolean }) => b.enabled)
    expect(enabled.length).toBe(Math.min(3, brands.total))
  })

  it('no permite dos cuentas con el mismo correo', async () => {
    const { credentials } = await signup(server)
    const res = await server.agent().post('/api/auth/signup', { ...credentials, email: credentials.email.toUpperCase() })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('email_taken')
  })

  it('valida con mensajes en español y el campo', async () => {
    const res = await server.agent().post('/api/auth/signup', { name: 'Ana', email: 'no-es-correo', password: '123', company: 'X' })
    expect(res.status).toBe(400)
    expect(res.body.error.field).toBe('email')
    expect(res.body.error.message).toMatch(/correo/i)
    const short = await server.agent().post('/api/auth/signup', { name: 'Ana', email: 'ana@taller.cl', password: '123', company: 'X' })
    expect(short.body.error.field).toBe('password')
    expect(short.body.error.message).toMatch(/8 caracteres/)
  })

  it('entra con la contraseña correcta y rechaza la incorrecta', async () => {
    const { credentials } = await signup(server)
    const bad = await server.agent().post('/api/auth/login', { email: credentials.email, password: 'otra-clave-999' })
    expect(bad.status).toBe(401)
    expect(bad.body.error.message).toMatch(/no coinciden/)
    const agent = server.agent()
    const ok = await agent.post<Me>('/api/auth/login', { email: ` ${credentials.email.toUpperCase()} `, password: credentials.password })
    expect(ok.status).toBe(200)
    expect(ok.body.user.email).toBe(credentials.email)
    expect((await agent.get('/api/me')).status).toBe(200)
  })

  it('cerrar sesión invalida la cookie', async () => {
    const { agent } = await signup(server)
    const stolen = agent.cookie
    expect((await agent.post('/api/auth/logout')).status).toBe(200)
    expect((await agent.get('/api/me')).status).toBe(401)
    const other = server.agent()
    other.cookie = stolen
    const res = await other.get('/api/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('limita los intentos fallidos de entrada', async () => {
    const { credentials } = await signup(server)
    const agent = server.agent()
    const statuses: number[] = []
    for (let i = 0; i < 10; i++) statuses.push((await agent.post('/api/auth/login', { email: credentials.email, password: 'mala-clave-000' })).status)
    expect(statuses).toContain(429)
    const blocked = await agent.post('/api/auth/login', credentials)
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.message).toMatch(/Espera/)
  })

  it('recupera la contraseña con el enlace del correo', async () => {
    const { credentials } = await signup(server)
    const before = server.mails.length
    const res = await server.agent().post('/api/auth/forgot', { email: credentials.email })
    expect(res.status).toBe(200)
    const unknown = await server.agent().post('/api/auth/forgot', { email: 'nadie@ninguna.cl' })
    expect(unknown.body).toEqual(res.body)
    const mail = server.mails.slice(before).find((m) => m.to === credentials.email)!
    expect(mail.subject).toMatch(/contraseña/)
    // El enlace abre la pantalla «Contraseña nueva» (/restablecer/:token), no la que vuelve a pedir el correo.
    const link = mail.text.match(/https?:\/\/\S+/)![0]
    expect(link).toMatch(/^http:\/\/app\.test\/restablecer\/[^/?\s]+$/)
    expect(mail.html).toContain(link)
    const token = decodeURIComponent(link.split('/restablecer/')[1])

    const agent = server.agent()
    const reset = await agent.post<Me>('/api/auth/reset', { token, password: 'nueva-clave-456' })
    expect(reset.status).toBe(200)
    expect(reset.body.user.email).toBe(credentials.email)
    const reused = await server.agent().post('/api/auth/reset', { token, password: 'otra-clave-789' })
    expect(reused.status).toBe(400)
    expect((await server.agent().post('/api/auth/login', credentials)).status).toBe(401)
    expect((await server.agent().post('/api/auth/login', { email: credentials.email, password: 'nueva-clave-456' })).status).toBe(200)
  })

  it('marca la puesta a punto y edita la empresa (logo ≤ 1 MB)', async () => {
    const { agent } = await signup(server)
    const logo = `data:image/png;base64,${Buffer.from('logo').toString('base64')}`
    const res = await agent.patch('/api/org', { onboarded: true, rut: '76086428-5', logo, accent: '#1F6FEB', city: 'Concepción' })
    expect(res.status).toBe(200)
    expect(res.body.rut).toBe('76.086.428-5')
    expect(res.body.logo).toBe(logo)
    expect((await agent.get<Me>('/api/me')).body.onboarded).toBe(true)
    const big = `data:image/png;base64,${'A'.repeat(1_500_000)}`
    const tooBig = await agent.patch('/api/org', { logo: big })
    expect(tooBig.status).toBe(400)
    expect(tooBig.body.error.message).toMatch(/1 MB/)
    const untouched = await agent.patch('/api/org', { phone: '+56 9 1234 5678' })
    expect(untouched.body.city).toBe('Concepción')
  })

  it('ajustes: PATCH parcial profundo sin perder lo demás', async () => {
    const { agent } = await signup(server)
    const res = await agent.patch<OrgSettings>('/api/settings', { pricing: { marginPct: 35 }, documents: { paymentTerms: 'Contado' }, nextQuoteNumber: 412 })
    expect(res.status).toBe(200)
    expect(res.body.pricing.marginPct).toBe(35)
    expect(res.body.pricing.ivaPct).toBe(19)
    expect(res.body.documents.paymentTerms).toBe('Contado')
    expect(res.body.documents.validityDays).toBe(15)
    expect(res.body.nextQuoteNumber).toBe(412)
    const bad = await agent.patch('/api/settings', { pricing: { marginPct: 120 } })
    expect(bad.status).toBe(400)
    expect(bad.body.error.message).toMatch(/margen/i)
  })
})

describe('equipo e invitaciones', () => {
  it('invita con enlace, acepta creando cuenta y deja de ser «solo»', async () => {
    const owner = await signup(server)
    const invite = await owner.agent.post('/api/team/invite', { email: 'cotizador@taller.cl', role: 'estimator' })
    expect(invite.status).toBe(201)
    const token = invite.body.link.split('/invitacion/')[1]
    expect((await owner.agent.get<Me>('/api/me')).body.solo).toBe(false)

    const info = await server.agent().get(`/api/invitations/${token}`)
    expect(info.body.orgName).toBe(owner.me.org.name)
    const invited = server.agent()
    const accepted = await invited.post<Me>(`/api/invitations/${token}/accept`, { name: 'Luis Soto', email: 'cotizador@taller.cl', password: 'clave-segura-123' })
    expect(accepted.status).toBe(200)
    expect(accepted.body.org.id).toBe(owner.me.org.id)
    expect(accepted.body.role).toBe('estimator')
    const reused = await server.agent().get(`/api/invitations/${token}`)
    expect(reused.status).toBe(410)

    const team = await owner.agent.get('/api/team')
    expect(team.body.members).toHaveLength(2)
    expect((await invited.post('/api/team/invite', { role: 'owner' })).status).toBe(403)
    const removeLastOwner = await owner.agent.delete(`/api/team/${owner.me.user.id}`)
    expect(removeLastOwner.status).toBe(400)
  })
})
