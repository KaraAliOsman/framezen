/**
 * Contratos e infraestructura: estado de facturación detallado en /api/me, modo lectura por
 * pago atrasado (requireWritable), seguimientos con teléfono y enlace, vendido del mes anterior,
 * área mínima de vidrio propia, vista previa de importación, valores por defecto al crear cuenta
 * y re-siembra del catálogo base sin tocar lo de cada taller.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import type { Catalog, Line } from '@dekopen/engine'
import type {
  CatalogBrandsResponse,
  CatalogResponse,
  GlassPatchResponse,
  ImportCsvResult,
  Me,
  OrgSettings,
  Quote,
  QuoteStats,
  SendQuoteResponse,
} from '@dekopen/shared'
import { bootstrap } from '../src/bootstrap'
import { loadConfig, runningFromBundle } from '../src/config'
import type { AppEnv } from '../src/context'
import { subscriptions } from '../src/db/schema'
import { silentLogger } from '../src/lib/logger'
import { createMailer } from '../src/lib/mail'
import { monthStartInZone } from '../src/lib/dates'
import { requireAuth, requireWritable } from '../src/middleware/auth'
import { importMessage } from '../src/routes/catalog'
import { FlowClient } from '../src/services/billing/flow'
import { setBillingGateway } from '../src/services/billing/registry'
import { seedCatalogBase } from '../src/services/catalog'
import { dvhComposition, initialBrandIds, isPlainDvh, pickDefaults } from '../src/services/orgs'
import { Agent, item, sampleDesign, signup, startServer, type TestServer } from './helpers'

const DAY = 86_400_000

describe('estado de facturación detallado y modo lectura', () => {
  let server: TestServer
  let clock = new Date('2026-10-15T15:00:00Z')
  const now = () => clock

  beforeAll(async () => {
    server = await startServer({ now })
  })
  afterAll(async () => {
    await server?.close()
  })

  it('/api/me trae readOnly, cancelación, saldo y renovación de créditos', async () => {
    clock = new Date('2026-10-15T15:00:00Z')
    const { agent } = await signup(server)
    const me = (await agent.get<Me>('/api/me')).body
    expect(me.billing.readOnly).toBe(false)
    expect(me.billing.cancelAtPeriodEnd).toBe(false)
    expect(me.billing.creditBalance).toBe(0)
    expect(me.billing.aiCredits.resetsAt).toBe(me.billing.trialEndsAt)
  })

  it('al vencer la prueba /api/me lo dice y las escrituras responden 402 con el motivo', async () => {
    clock = new Date('2026-10-15T15:00:00Z')
    const { agent } = await signup(server)
    clock = new Date(clock.getTime() + 15 * DAY)
    const me = (await agent.get<Me>('/api/me')).body
    expect(me.billing.readOnly).toBe(true)
    expect(me.billing.readOnlyReason).toBe('trial_ended')
    expect(me.billing.readOnlyMessage).toMatch(/prueba de 14 días terminó/)
    const write = await agent.post('/api/clients', { name: 'Pedro Soto' })
    expect(write.status).toBe(402)
    expect(write.body.reason).toBe('trial_ended')
    // Leer y exportar nunca se bloquea.
    expect((await agent.get('/api/clients')).status).toBe(200)
  })

  it('requireWritable reconoce el pago atrasado (accessOf), no sólo la prueba vencida', async () => {
    clock = new Date('2026-10-15T15:00:00Z')
    const { agent, me } = await signup(server)
    // Flow sin red: no se puede confirmar el cobro, así que el atraso se mantiene.
    setBillingGateway(server.deps, {
      kind: 'flow',
      client: new FlowClient({ apiKey: 'k', secretKey: 's', apiUrl: 'https://flow.invalid/api', fetch: async () => Promise.reject(new TypeError('sin red')) }),
    })
    try {
      await server.deps.db
        .update(subscriptions)
        .set({ plan: 'pro', status: 'active', period: 'monthly', trialEndsAt: null, currentPeriodEnd: new Date(clock.getTime() - 20 * DAY) })
        .where(eq(subscriptions.orgId, me.org.id))
      const billing = (await agent.get<Me>('/api/me')).body.billing
      expect(billing.readOnly).toBe(true)
      expect(billing.readOnlyReason).toBe('payment_overdue')

      // El middleware por sí solo (sin el guardia global) también bloquea con el mismo mensaje.
      const app = new Hono<AppEnv>()
      app.onError((error, c) => {
        const e = error as { status?: number; toJSON?: () => unknown }
        return c.json(e.toJSON?.() ?? { error: String(error) }, (e.status ?? 500) as 402)
      })
      app.use('*', requireAuth(server.deps))
      app.post('/x', requireWritable(server.deps), (c) => c.json({ ok: true }))
      app.get('/x', requireWritable(server.deps), (c) => c.json({ ok: true }))
      const res = await app.request('/x', { method: 'POST', headers: { cookie: `fz_session=${agent.cookie}` } })
      expect(res.status).toBe(402)
      const body = (await res.json()) as { error: { code: string; message: string }; reason: string }
      expect(body.error.code).toBe('read_only')
      expect(body.reason).toBe('payment_overdue')
      expect(body.error.message).toMatch(/No pudimos cobrar/)
      expect((await app.request('/x', { headers: { cookie: `fz_session=${agent.cookie}` } })).status).toBe(200)
    } finally {
      setBillingGateway(server.deps, { kind: 'dev' })
    }
  })
})

describe('GET /api/quotes/stats', () => {
  let server: TestServer
  let clock = new Date('2026-10-15T15:00:00Z')

  beforeAll(async () => {
    server = await startServer({ now: () => clock })
  })
  afterAll(async () => {
    await server?.close()
  })

  it('seguimientos con teléfono y enlace del portal, y vendido del mes anterior (hora de Chile)', async () => {
    const { agent } = await signup(server)
    const client = (await agent.post('/api/clients', { name: 'Pedro Soto', phone: '+56 9 8765 4321' })).body
    const design = await sampleDesign(agent)
    const pending = (await agent.post<Quote>('/api/quotes', { title: 'Casa Soto', clientId: client.id, items: [item(design)] })).body
    const sent = (await agent.post<SendQuoteResponse>(`/api/quotes/${pending.id}/send`, { channel: 'link' })).body
    expect(sent.revisionLabel).toBe('A')
    expect(sent.url).toContain(`/c/${sent.quote.shareToken}`)

    const won = (await agent.post<Quote>('/api/quotes', { title: 'Depto Rojas', items: [item(design)] })).body
    await agent.post(`/api/quotes/${won.id}/send`, { channel: 'link' })
    const accepted = (await agent.post<Quote>(`/api/quotes/${won.id}/status`, { status: 'accepted' })).body
    expect(accepted.status).toBe('accepted')

    let stats = (await agent.get<QuoteStats>('/api/quotes/stats')).body
    expect(stats.soldThisMonth.count).toBe(1)
    expect(stats.soldLastMonth).toEqual({ count: 0, total: 0 })
    expect(stats.followUps).toHaveLength(0) // recién enviada: todavía no toca llamar

    // 31 de octubre a las 23:30 en Chile (02:30 UTC del 1 de noviembre): sigue siendo octubre.
    clock = new Date('2026-11-01T02:30:00Z')
    stats = (await agent.get<QuoteStats>('/api/quotes/stats')).body
    expect(stats.soldThisMonth.count).toBe(1)

    clock = new Date('2026-11-10T15:00:00Z')
    stats = (await agent.get<QuoteStats>('/api/quotes/stats')).body
    expect(stats.soldThisMonth).toEqual({ count: 0, total: 0, inProduction: 0 })
    expect(stats.soldLastMonth.count).toBe(1)
    expect(stats.soldLastMonth.total).toBeGreaterThan(0)
    expect(stats.followUps).toHaveLength(1)
    expect(stats.followUps[0]).toMatchObject({ id: pending.id, clientName: 'Pedro Soto', clientPhone: '+56 9 8765 4321', shareToken: sent.quote.shareToken })
  })

  it('el inicio de mes se calcula en hora de Chile', () => {
    expect(monthStartInZone(new Date('2026-11-01T02:30:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(monthStartInZone(new Date('2026-11-01T03:30:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(monthStartInZone(new Date('2026-07-20T12:00:00Z'), -1).toISOString()).toBe('2026-06-01T04:00:00.000Z')
  })
})

describe('catálogo: área mínima de vidrio propia e importación con vista previa', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startServer()
  })
  afterAll(async () => {
    await server?.close()
  })

  it('PATCH /api/catalog/glass/:id guarda el área mínima de la organización y el motor la cobra', async () => {
    const { agent } = await signup(server)
    const other = await signup(server)
    const design = { ...(await sampleDesign(agent, { width: 400, height: 400 })) }
    const glassId = design.glassId
    const factory = (await agent.get<CatalogResponse>('/api/catalog')).body.glass.find((g) => g.id === glassId)!
    const quote = (await agent.post<Quote>('/api/quotes', { title: 'Baño', items: [item(design)] })).body
    const before = quote.totals!.total

    const res = await agent.patch<GlassPatchResponse>(`/api/catalog/glass/${glassId}`, { minArea: 2.5 })
    expect(res.status).toBe(200)
    expect(res.body.minArea).toBe(2.5)
    expect(res.body.glass.minArea).toBe(2.5)
    expect(res.body.factoryMinArea).toBe(factory.minArea ?? null)
    expect((await agent.get<CatalogResponse>('/api/catalog')).body.glass.find((g) => g.id === glassId)!.minArea).toBe(2.5)
    // Otra organización sigue con el de fábrica.
    expect((await other.agent.get<CatalogResponse>('/api/catalog')).body.glass.find((g) => g.id === glassId)?.minArea).toBe(factory.minArea)

    // Un vidrio de 0,16 m² ahora se cobra como 2,5 m².
    const saved = (await agent.put<Quote>(`/api/quotes/${quote.id}`, { items: quote.items, version: quote.version })).body
    expect(saved.totals!.total).toBeGreaterThan(before)

    // null = vuelve al de fábrica.
    const reset = await agent.patch<GlassPatchResponse>(`/api/catalog/glass/${glassId}`, { minArea: null })
    expect(reset.body.minArea).toBeNull()
    expect((await agent.get<CatalogResponse>('/api/catalog')).body.glass.find((g) => g.id === glassId)!.minArea).toBe(factory.minArea)

    expect((await agent.patch(`/api/catalog/glass/${glassId}`, { minArea: -1 })).status).toBe(400)
    expect((await agent.patch('/api/catalog/glass/no-existe', { minArea: 1 })).status).toBe(404)
  })

  it('POST /api/catalog/import-csv?dryRun=1 muestra lo que pasaría sin guardar', async () => {
    const { agent } = await signup(server)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const profile = catalog.profiles.find((p) => Object.values(p.priceByColor).some((v) => v > 0))!
    const colorId = Object.keys(profile.priceByColor).find((c) => profile.priceByColor[c] > 0)!
    const line = catalog.lines.find((l) => l.id === profile.lineId)!
    const brand = catalog.brands.find((b) => b.id === line.brandId)!
    const color = catalog.colors.find((c) => c.id === colorId)!
    const csv =
      'ID;Marca;Tipo;Código;Descripción;Linea;Color;;;Precio\r\n' +
      `1;${brand.name};Perfil · Marco;${profile.code};${profile.name};${line.name};${color.name};$;CLP;45678,50\r\n` +
      `2;${brand.name};Herraje · Otro;ZZ-NO-EXISTE-999;Pieza que no está;;;$;CLP;999,00\r\n`

    const preview = await agent.post<ImportCsvResult>('/api/catalog/import-csv?dryRun=1', csv, { 'content-type': 'text/csv' })
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({ dryRun: true, matched: 1, unmatched: 1, overridesTotal: 1 })
    expect(preview.body.message).toBe('Vista previa: se actualizaría 1 precio. 1 fila no calzó con tu catálogo. Aún no guardamos nada.')
    expect((await agent.get('/api/catalog/prices')).body.overrides).toHaveLength(0)

    // También por JSON { dryRun: true }.
    const jsonPreview = await agent.post<ImportCsvResult>('/api/catalog/import-csv', { csv, dryRun: true })
    expect(jsonPreview.body.dryRun).toBe(true)
    expect((await agent.get('/api/catalog/prices')).body.overrides).toHaveLength(0)

    const real = await agent.post<ImportCsvResult>('/api/catalog/import-csv', csv, { 'content-type': 'text/csv' })
    expect(real.body.dryRun).toBe(false)
    expect(real.body.message).toBe('Listo: actualizamos 1 precio. 1 fila no calzó con tu catálogo.')
    expect((await agent.get('/api/catalog/prices')).body.overrides).toHaveLength(1)
  })

  it('mensajes de importación con plurales correctos', () => {
    expect(importMessage(2, 3, false)).toBe('Listo: actualizamos 2 precios. 3 filas no calzaron con tu catálogo.')
    expect(importMessage(1_234, 0, false)).toBe('Listo: actualizamos 1.234 precios.')
    expect(importMessage(3, 1, true)).toBe('Vista previa: se actualizarían 3 precios. 1 fila no calzó con tu catálogo. Aún no guardamos nada.')
    expect(importMessage(0, 4, false)).toMatch(/No encontramos coincidencias/)
  })
})

describe('valores por defecto al crear la cuenta', () => {
  it('practicable más completa (no la de puertas), Blanco y DVH 4+12+4 con el catálogo de ejemplo', async () => {
    const server = await startServer()
    try {
      const { agent } = await signup(server)
      const settings = (await agent.get<OrgSettings>('/api/settings')).body
      expect(settings.defaults).toEqual({ lineId: 'serie-60', colorId: 'blanco', glassId: 'dvh-4-12-4' })
    } finally {
      await server.close()
    }
  })

  it('PRO6004 de Proline si existe (y su marca queda activa)', () => {
    const s60 = SAMPLE_CATALOG.lines.find((l) => l.id === 'serie-60')!
    const pro: Line = { ...s60, id: 'proline.pro6004', brandId: 'proline', name: 'PRO6004', completeness: 'partial' }
    const catalog: Catalog = {
      ...SAMPLE_CATALOG,
      brands: [...SAMPLE_CATALOG.brands, { ...SAMPLE_CATALOG.brands[0], id: 'proline', name: 'Proline' }],
      lines: [...SAMPLE_CATALOG.lines, pro],
    }
    const brandIds = initialBrandIds(catalog)
    expect(brandIds).toContain('proline')
    expect(pickDefaults(catalog, brandIds)).toMatchObject({ lineId: 'proline.pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' })
  })

  it('sin DVH 4+12+4 incoloro usa el DVH incoloro más común', () => {
    const base = SAMPLE_CATALOG.glass.find((g) => g.id === 'dvh-5-12-5')!
    const glass = [
      ...SAMPLE_CATALOG.glass.filter((g) => !g.id.startsWith('dvh-4-12-4')),
      { ...base, id: 'dvh-6-12-6', name: 'DVH 6+12+6', composition: undefined },
      { ...base, id: 'dvh-6-12-6-bronce', name: 'DVH 6+12+6 Bronce', composition: undefined },
      { ...base, id: 'dvh-6-12-6-low-e', name: 'DVH 6+12+6 Low-e', composition: undefined },
      { ...base, id: 'dvh-4-12-4-12-4', name: 'DVH 4+12br+4+12br+4', composition: '4 + 12 cámara + 4 + 12 cámara + 4' },
    ]
    const catalog: Catalog = { ...SAMPLE_CATALOG, glass }
    expect(pickDefaults(catalog, initialBrandIds(catalog)).glassId).toBe('dvh-6-12-6')
    expect(dvhComposition({ name: 'DVH 4+12br+4+12br+4' })).toBeUndefined()
    expect(dvhComposition({ name: 'Termopanel', composition: '4 incoloro + 12 cámara + 4 incoloro' })).toBe('4+12+4')
    expect(isPlainDvh({ name: 'DVH 4+12+4 Low-e' })).toBe(false)
    expect(isPlainDvh({ name: 'DVH 4+12+4', composition: '4 incoloro + 12 cámara + 4 incoloro' })).toBe(true)
  })
})

describe('configuración de arranque', () => {
  const root = mkdtempSync(join(tmpdir(), 'fz-root-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('`npm start` (bundle) sirve la web compilada aunque falte NODE_ENV; tsx en desarrollo no', () => {
    mkdirSync(join(root, 'apps/web/dist'), { recursive: true })
    writeFileSync(join(root, 'apps/web/dist/index.html'), '<!doctype html>')
    expect(runningFromBundle('file:///app/apps/server/dist/index.js')).toBe(true)
    expect(runningFromBundle('file:///app/apps/server/src/config.ts')).toBe(false)

    // Demo local de producción: cada atajo inseguro se pide de forma explícita.
    const demo = { ALLOW_HTTP_APP_URL: '1', ALLOW_DEV_BILLING: '1', MAIL_TO_CONSOLE: '1' }
    const bundled = loadConfig({ PORT: '8080', ...demo }, root, true)
    expect(bundled.production).toBe(true)
    expect(bundled.webDist).toBe(join(root, 'apps/web/dist'))
    expect(bundled.appUrl).toBe('http://localhost:8080')

    const dev = loadConfig({}, root, false)
    expect(dev.production).toBe(false)
    expect(dev.webDist).toBeNull()
    expect(loadConfig({ NODE_ENV: 'development' }, root, true).webDist).toBeNull()
    expect(loadConfig({ NODE_ENV: 'production', APP_URL: 'https://app.dekopen.cl/', ALLOW_DEV_BILLING: '1', MAIL_TO_CONSOLE: '1' }, root, false)).toMatchObject({
      appUrl: 'https://app.dekopen.cl',
      secureCookies: true,
      webDist: join(root, 'apps/web/dist'),
    })
  })

  it('en producción no arranca en modo inseguro por falta de configuración', () => {
    // Sin nada: cobro 'dev' (planes gratis), cookie sin Secure y enlaces secretos al log → no arranca.
    expect(() => loadConfig({ NODE_ENV: 'production' }, root, false)).toThrow(/APP_URL[\s\S]*FLOW_API_KEY[\s\S]*RESEND_API_KEY/)
    expect(() => loadConfig({ NODE_ENV: 'production', APP_URL: 'http://app.dekopen.cl', FLOW_API_KEY: 'k', FLOW_SECRET_KEY: 's', RESEND_API_KEY: 're' }, root, false)).toThrow(
      /https/,
    )
    expect(() => loadConfig({ PORT: '8080' }, root, true)).toThrow(/producción/)
    const full = loadConfig({ NODE_ENV: 'production', APP_URL: 'https://app.dekopen.cl', FLOW_API_KEY: 'k', FLOW_SECRET_KEY: 's', RESEND_API_KEY: 're' }, root, false)
    expect(full).toMatchObject({ billingProvider: 'flow', secureCookies: true, resendApiKey: 're', trustProxyHops: 1, signupPerHour: 10 })
    // Desarrollo: nada es obligatorio y X-Forwarded-For no se cree (no hay proxy).
    expect(loadConfig({}, root, false)).toMatchObject({ trustProxyHops: 0 })
    expect(loadConfig({ TRUST_PROXY_HOPS: '2' }, root, false).trustProxyHops).toBe(2)
  })

  it('el correo de consola en producción no escribe el contenido (enlaces secretos)', async () => {
    const lines: string[] = []
    const logger = { info: (m: string) => void lines.push(m), warn: (m: string) => void lines.push(m), error: (m: string) => void lines.push(m) }
    const message = { to: 'victima@example.com', subject: 'Restablece tu contraseña', text: 'Abre http://app.test/restablecer/TOKEN_SECRETO_ABC' }
    await createMailer({ from: 'x', logger, production: true }).send(message)
    expect(lines.join('\n')).not.toContain('TOKEN_SECRETO_ABC')
    expect(lines.join('\n')).not.toContain('victima@example.com')
    await createMailer({ from: 'x', logger }).send(message)
    expect(lines.join('\n')).toContain('TOKEN_SECRETO_ABC') // en desarrollo sí, para copiar el enlace
  })

  it('las claves de Flow viven en la configuración (sandbox con FLOW_API_URL)', () => {
    const config = loadConfig({ FLOW_API_KEY: 'k', FLOW_SECRET_KEY: 's', FLOW_API_URL: 'https://sandbox.flow.cl/api' }, root, false)
    expect(config).toMatchObject({ billingProvider: 'flow', flowApiKey: 'k', flowSecretKey: 's', flowApiUrl: 'https://sandbox.flow.cl/api' })
    expect(loadConfig({}, root, false).billingProvider).toBe('dev')
  })
})

describe('re-siembra del catálogo base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fz-catalog-'))
  const file = join(dir, 'base.json')
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('si base.json cambia con el servidor andando, se carga la versión nueva sin tocar lo de cada taller', async () => {
    writeFileSync(file, JSON.stringify({ version: 'v1', catalog: SAMPLE_CATALOG }))
    const boot = await bootstrap({
      database: { memory: true },
      logger: silentLogger,
      mailer: { send: async () => {} },
      catalogSource: file,
      config: { appUrl: 'http://app.test' },
    })
    const server: TestServer = { ...boot, mails: [], agent: () => new Agent(boot.app), close: () => boot.database.close() }
    try {
      const { agent } = await signup(server)
      expect((await agent.get<CatalogBrandsResponse>('/api/catalog/brands')).body.baseVersion).toBe('v1')
      const catalog = (await agent.get<CatalogResponse>('/api/catalog')).body
      const item0 = catalog.items.find((i) => i.price > 0)!
      const glassId = catalog.glass[0].id
      await agent.put('/api/catalog/prices', { overrides: [{ kind: 'item', id: item0.id, price: 77_777 }] })
      await agent.patch(`/api/catalog/glass/${glassId}`, { minArea: 1.75 })
      await agent.patch('/api/catalog/lines/serie-60', { pauta: { weld: 4 } })

      // El importador escribe un catálogo nuevo: un color más y otro precio de lista.
      const next: Catalog = {
        ...SAMPLE_CATALOG,
        colors: [...SAMPLE_CATALOG.colors, { id: 'verde-ingles', name: 'Verde inglés', hex: '#1F4D3A' } as Catalog['colors'][number]],
        items: SAMPLE_CATALOG.items.map((i) => (i.id === item0.id ? { ...i, price: i.price + 1 } : i)),
      }
      writeFileSync(file, JSON.stringify({ version: 'v2', catalog: next }))
      const later = new Date(Date.now() + 60_000)
      utimesSync(file, later, later)
      server.deps.catalogs.invalidate() // sin esperar los 5 s de caché

      expect((await agent.get<CatalogBrandsResponse>('/api/catalog/brands')).body.baseVersion).toBe('v2')
      const after = (await agent.get<CatalogResponse>('/api/catalog')).body
      expect(after.colors.some((c) => c.id === 'verde-ingles')).toBe(true)
      expect(after.items.find((i) => i.id === item0.id)!.price).toBe(77_777) // el precio propio manda
      expect(after.glass.find((g) => g.id === glassId)!.minArea).toBe(1.75)
      expect(after.lines.find((l) => l.id === 'serie-60')!.pauta.weld).toBe(4)
      expect((await agent.get('/api/catalog/prices')).body.overrides).toHaveLength(1)

      // Sin cambios en el archivo no se crea otra versión.
      server.deps.catalogs.invalidate()
      expect((await agent.get<CatalogBrandsResponse>('/api/catalog/brands')).body.baseVersion).toBe('v2')
    } finally {
      await server.close()
    }
  })

  it('una versión nueva del catálogo base deja al día los totales de los borradores (lista e Inicio)', async () => {
    const reprice = join(dir, 'reprice.json')
    writeFileSync(reprice, JSON.stringify({ version: 'v1', catalog: SAMPLE_CATALOG }))
    const boot = await bootstrap({ database: { memory: true }, logger: silentLogger, mailer: { send: async () => {} }, catalogSource: reprice, config: { appUrl: 'http://app.test' } })
    const server: TestServer = { ...boot, mails: [], agent: () => new Agent(boot.app), close: () => boot.database.close() }
    try {
      const { agent } = await signup(server)
      const design = await sampleDesign(agent)
      const draft = await agent.post<Quote>('/api/quotes', { items: [item(design)] })
      const before = draft.body.totals!.total
      const listed = async () => (await agent.get('/api/quotes')).body.items.find((q: { id: string }) => q.id === draft.body.id).total as number
      expect(await listed()).toBe(before)

      // catalog:import escribe precios ×3: la lista e Inicio no pueden quedar con los viejos.
      const tripled: Catalog = {
        ...SAMPLE_CATALOG,
        profiles: SAMPLE_CATALOG.profiles.map((p) => ({ ...p, priceByColor: Object.fromEntries(Object.entries(p.priceByColor).map(([k, v]) => [k, v * 3])) })),
        items: SAMPLE_CATALOG.items.map((i) => ({ ...i, price: i.price * 3 })),
        glass: SAMPLE_CATALOG.glass.map((g) => ({ ...g, pricePerM2: g.pricePerM2 * 3 })),
      }
      writeFileSync(reprice, JSON.stringify({ version: 'v2-precios-x3', catalog: tripled }))
      const later = new Date(Date.now() + 60_000)
      utimesSync(reprice, later, later)
      server.deps.catalogs.invalidate()
      expect((await agent.get<CatalogBrandsResponse>('/api/catalog/brands')).body.baseVersion).toBe('v2-precios-x3')

      // Lo que diría el editor (y el servidor al guardar) con los precios nuevos.
      const fresh = (await agent.post<Quote>(`/api/quotes/${draft.body.id}/duplicate`)).body.totals!.total
      expect(fresh).toBeGreaterThan(before)
      let total = await listed()
      for (let i = 0; i < 40 && total !== fresh; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        total = await listed()
      }
      expect(total).toBe(fresh)
      const stats = (await agent.get<QuoteStats>('/api/quotes/stats')).body
      expect(stats.byStatus.draft.total).toBe(fresh * 2) // el borrador y su copia
    } finally {
      await server.close()
    }
  })

  it('sin base.json, un catálogo de ejemplo distinto reemplaza al anterior', async () => {
    const boot = await bootstrap({ database: { memory: true }, logger: silentLogger, mailer: { send: async () => {} } })
    try {
      const first = await seedCatalogBase(boot.deps.db, { fallback: () => SAMPLE_CATALOG })
      expect(first.source).toBe('sample')
      const same = await seedCatalogBase(boot.deps.db, { fallback: () => SAMPLE_CATALOG })
      expect(same.id).toBe(first.id)
      const changed = await seedCatalogBase(boot.deps.db, { fallback: () => ({ ...SAMPLE_CATALOG, colors: SAMPLE_CATALOG.colors.slice(1) }) })
      expect(changed.id).not.toBe(first.id)
      expect(changed.data.colors).toHaveLength(SAMPLE_CATALOG.colors.length - 1)
    } finally {
      await boot.database.close()
    }
  })
})
