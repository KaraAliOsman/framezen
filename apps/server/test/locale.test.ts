import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Me, OrgSettings, Quote } from '@dekopen/shared'
import { orgs, users } from '../src/db/schema'
import { ERROR_MESSAGES, LOCALES, headerLocale, localizeErrorMessage, matchLocale, resolveLocale } from '../src/lib/i18n'
import { invitationMail, passwordResetMail, quoteAcceptedMail, quoteSentMail } from '../src/services/mail'
import { signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server.close()
})

describe('idioma de la petición', () => {
  it('user.locale ?? Accept-Language ?? org.locale ?? es', () => {
    expect(resolveLocale({ user: 'de', header: 'fr-FR', org: 'it' })).toBe('de')
    expect(resolveLocale({ user: null, header: 'pt-BR,pt;q=0.9', org: 'it' })).toBe('pt')
    expect(resolveLocale({ user: 'xx', header: 'ja-JP', org: 'it' })).toBe('it')
    expect(resolveLocale({})).toBe('es')
    expect(matchLocale('ja;q=1, tr;q=0.4, en;q=0.8')).toBe('en')
    expect(matchLocale('en;q=0, de')).toBe('de')
    expect(headerLocale('zh-CN')).toBeNull()
    expect(LOCALES).toEqual(['es', 'en', 'pt', 'fr', 'de', 'it', 'tr'])
  })

  it('PATCH /api/me guarda el idioma (null vuelve al automático) y /api/me lo informa', async () => {
    const { agent } = await signup(server)
    const auto = await agent.request<Me>('GET', '/api/me', undefined, { 'accept-language': 'fr-FR,fr;q=0.9' })
    expect(auto.body.locale).toBe('fr')
    expect(auto.body.user.locale).toBeUndefined()
    expect(auto.body.org).toMatchObject({ locale: 'es', currency: 'CLP' })
    expect(auto.headers.get('content-language')).toBe('fr')

    const set = await agent.patch<Me>('/api/me', { locale: 'tr' })
    expect(set.status).toBe(200)
    expect(set.body).toMatchObject({ locale: 'tr', user: { locale: 'tr' } })
    const later = await agent.request<Me>('GET', '/api/me', undefined, { 'accept-language': 'en' })
    expect(later.body.locale).toBe('tr')
    expect(later.headers.get('content-language')).toBe('tr')

    const invalid = await agent.patch('/api/me', { locale: 'klingon' })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toMatchObject({ code: 'invalid', field: 'locale' })
    // Error en el idioma de la persona (turco).
    expect(invalid.body.error.message).toBe('Lütfen dil alanını kontrol edin.')

    const reset = await agent.patch<Me>('/api/me', { locale: null, name: 'Ana Nueva' })
    expect(reset.body.user).toMatchObject({ name: 'Ana Nueva' })
    expect(reset.body.user.locale).toBeUndefined()
    expect((await agent.patch('/api/me', {})).status).toBe(400)
  })

  it('ajustes: idioma de documentos, moneda e impuesto de la empresa', async () => {
    const { agent, me } = await signup(server)
    const initial = await agent.get<OrgSettings>('/api/settings')
    expect(initial.body).toMatchObject({ locale: 'es', currency: 'CLP', taxLabel: 'IVA' })
    expect(initial.body.pricing.ivaPct).toBe(19)
    const patched = await agent.patch<OrgSettings>('/api/settings', { locale: 'pt', currency: 'brl', taxLabel: 'ICMS' })
    expect(patched.status).toBe(200)
    expect(patched.body).toMatchObject({ locale: 'pt', currency: 'BRL', taxLabel: 'ICMS' })
    const [org] = await server.deps.db.select().from(orgs).where(eq(orgs.id, me.org.id))
    expect(org).toMatchObject({ locale: 'pt', currency: 'BRL' })
    expect((await agent.patch('/api/settings', { currency: 'XYZ1' })).status).toBe(400)
    expect((await agent.patch('/api/settings', { currency: 'ZZZ' })).status).toBe(400)
    expect((await agent.patch('/api/settings', { locale: 'ru' })).status).toBe(400)
    // Sin idioma propio, la empresa decide el idioma de la interfaz si el navegador no pide uno soportado.
    const viaOrg = await agent.request('GET', '/api/quotes/no-existe', undefined, { 'accept-language': 'ja' })
    expect(viaOrg.body.error.message).toBe('Não encontramos o que você procura.')
  })
})

describe('errores traducidos (códigos sin cambios)', () => {
  it('diccionario completo: cada código con los 7 idiomas, sin vacíos y traducido', () => {
    for (const [code, messages] of Object.entries(ERROR_MESSAGES)) {
      expect(Object.keys(messages).sort(), code).toEqual([...LOCALES].sort())
      for (const locale of LOCALES) expect((messages as Record<string, string>)[locale].trim().length, `${code}.${locale}`).toBeGreaterThan(3)
      expect(messages.en, code).not.toBe(messages.es)
    }
  })

  it('cubre todos los códigos que lanza el servidor', () => {
    for (const code of [
      'invalid', 'invalid_characters', 'unsupported_media_type', 'too_large', 'unauthorized', 'forbidden', 'not_found', 'cross_site',
      'too_many_requests', 'too_many_attempts', 'email_taken', 'invalid_credentials', 'no_org', 'invalid_token', 'empty_csv', 'plan_required',
      'revision_changed', 'invalid_client', 'version_conflict', 'already_member', 'last_owner', 'invitation_revoked', 'invitation_used',
      'invitation_expired', 'invitation_email_mismatch', 'seat_limit', 'read_only', 'payment_provider', 'mail_quota', 'pdf_unavailable', 'internal',
      'plan_limit', 'daily_limit', 'credits_exhausted', 'ai_unavailable', 'approval_expired', 'approval_mismatch', 'undo_conflict', 'undo_unavailable',
      'asset_unsupported', 'asset_too_large', 'asset_quota', 'dispatch_denied', 'conversation_busy',
    ]) {
      expect(ERROR_MESSAGES, code).toHaveProperty(code)
    }
  })

  it('español conserva el mensaje específico; otros idiomas usan el del código y el plan', () => {
    const e = { code: 'plan_required', message: 'Órdenes de compra viene en el plan Pro.', extra: { plan: 'empresa' }, status: 402 }
    expect(localizeErrorMessage(e, 'es')).toBe('Órdenes de compra viene en el plan Pro.')
    expect(localizeErrorMessage(e, 'en')).toBe('This feature is included in the Empresa plan. You can upgrade whenever you like.')
    expect(localizeErrorMessage({ code: 'invalid', message: 'x', field: 'items.0.qty' }, 'de')).toBe('Bitte überprüfen Sie die Menge.')
    expect(localizeErrorMessage({ code: 'rarísimo', message: 'x', status: 503 }, 'it')).toBe(ERROR_MESSAGES.internal.it)
  })

  it('en la API: sin sesión, 404 y validación salen en el idioma pedido', async () => {
    const anon = await server.agent().request('GET', '/api/me', undefined, { 'accept-language': 'en-US,en;q=0.9' })
    expect(anon.status).toBe(401)
    expect(anon.body.error).toEqual({ code: 'unauthorized', message: 'Your session has ended. Please sign in again to continue.' })
    const missing = await server.agent().request('GET', '/api/no-existe', undefined, { 'accept-language': 'de' })
    expect(missing.body.error).toEqual({ code: 'not_found', message: 'Das Gesuchte wurde nicht gefunden.' })
    const es = await server.agent().get('/api/me')
    expect(es.body.error.message).toBe('Tu sesión terminó. Vuelve a entrar para continuar.')
    const signupBad = await server.agent().request('POST', '/api/auth/signup', { name: 'A', email: 'no-es-correo', password: 'clave-segura-123', company: 'X' }, { 'accept-language': 'fr' })
    expect(signupBad.status).toBe(400)
    expect(signupBad.body.error).toMatchObject({ code: 'invalid', field: 'email', message: 'Vérifiez l’e-mail.' })
  })
})

describe('correos en el idioma de quien los recibe', () => {
  it('plantillas en 7 idiomas con enlace y HTML escapado', () => {
    for (const locale of LOCALES) {
      const mail = passwordResetMail(locale, { firstName: '<Ana>', url: 'https://app.test/restablecer/t' })
      expect(mail.text).toContain('https://app.test/restablecer/t')
      expect(mail.html).toContain('https://app.test/restablecer/t')
      expect(mail.html).not.toContain('<Ana>')
      expect(mail.subject).toContain('DEKOPEN')
    }
    expect(invitationMail('de', { inviterName: 'Ana', orgName: 'Fenster AG', role: 'estimator', link: 'https://x/i' }).text).toContain('als Kalkulator')
    expect(quoteSentMail('en', { number: 12, orgName: 'Acme', url: 'https://x/c/t', clientFirstName: 'Bob', title: 'Casa' }).subject).toBe('Quote No. 12 · Acme')
    expect(quoteAcceptedMail('fr', { who: 'Luc', number: 3, url: 'https://x' }).subject).toBe('Luc a accepté le devis n° 3 !')
  })

  it('recuperar contraseña usa el idioma de la persona; la invitación, el de la empresa', async () => {
    const { agent, me, credentials } = await signup(server)
    await server.deps.db.update(users).set({ locale: 'it' }).where(eq(users.id, me.user.id))
    const before = server.mails.length
    await server.agent().request('POST', '/api/auth/forgot', { email: credentials.email }, { 'accept-language': 'en' })
    await expect.poll(() => server.mails.length).toBeGreaterThan(before)
    const reset = server.mails.slice(before).find((m) => m.to === credentials.email)!
    expect(reset.subject).toBe('Crea una nuova password per DEKOPEN')

    await agent.patch('/api/settings', { locale: 'en' })
    const mark = server.mails.length
    const invite = await agent.post('/api/team/invite', { email: `colega.${Date.now()}@taller.cl`, role: 'estimator' })
    expect(invite.status).toBe(201)
    const mail = server.mails.slice(mark)[0]!
    expect(mail.subject).toMatch(/invited you to/)
    expect(mail.text).toContain('as estimator')
  })

  it('la cotización viaja en el idioma del documento (cotización › empresa)', async () => {
    const { agent } = await signup(server)
    await agent.patch('/api/settings', { locale: 'de' })
    const quote = await agent.post<Quote>('/api/quotes', { title: 'Haus Müller' })
    const before = server.mails.length
    expect((await agent.post(`/api/quotes/${quote.body.id}/send`, { channel: 'email', to: 'kunde@test.de' })).status).toBe(200)
    const mail = server.mails.slice(before).find((m) => m.to === 'kunde@test.de')!
    expect(mail.subject).toMatch(/^Angebot Nr\. \d+ · /)
    expect(mail.text).toContain('(Haus Müller)')
  })
})
