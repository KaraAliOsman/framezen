import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { formatClp } from '@dekopen/documents'
import { QUOTE_PRESET_IDS, type Quote, type WorkOrder } from '@dekopen/shared'
import { subscriptions } from '../src/db/schema'
import { catalogFileName, contentDisposition, fileSlug, quoteFileName, workshopFileName } from '../src/services/pdf/filename'
import { PdfUnavailableError, setPdfRenderer, type PdfRenderer } from '../src/services/pdf'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

/** Generador falso: guarda el HTML y devuelve un PDF mínimo. */
class FakeRenderer implements PdfRenderer {
  htmls: string[] = []
  fail: Error | undefined
  async render(html: string): Promise<Buffer> {
    if (this.fail) throw this.fail
    this.htmls.push(html)
    return Buffer.from('%PDF-1.7\n% DEKOPEN prueba\n%%EOF\n')
  }
  async close() {}
  get last(): string {
    return this.htmls[this.htmls.length - 1] ?? ''
  }
}

/** Sólo el <body> (las fuentes en base64 pueden contener cualquier secuencia de letras). */
const bodyOf = (html: string) => html.slice(html.indexOf('<body>'))

let server: TestServer
let renderer: FakeRenderer
let offsetMs = 0
const DAY = 86_400_000

beforeAll(async () => {
  server = await startServer({ now: () => new Date(Date.now() + offsetMs) })
  renderer = new FakeRenderer()
  setPdfRenderer(server.deps, renderer)
})
afterAll(async () => {
  await server?.close()
})

async function quoteWithClient(company = 'Ventanas Pérez') {
  const ctx = await signup(server, { company })
  const client = await ctx.agent.post('/api/clients', { name: 'Pedro Pérez', email: 'pedro@correo.cl', city: 'Concepción' })
  const design = await sampleDesign(ctx.agent)
  const quote = await ctx.agent.post<Quote>('/api/quotes', {
    clientId: client.body.id,
    title: 'Casa Pérez · Concepción',
    items: [item(design, { ref: 'V1', location: 'Living' }), item({ ...design, width: 800, height: 600 }, { ref: 'V2', qty: 2 })],
    notes: 'NOTA-INTERNA-SECRETA: margen bajo',
  })
  expect(quote.status).toBe(201)
  return { ...ctx, quote: quote.body, design }
}

describe('nombres de archivo humanos', () => {
  it('Cotizacion-412-Casa-Perez.pdf con tildes en filename*', () => {
    const name = quoteFileName({ number: 412, title: 'Casa Pérez', revision: 1 })
    expect(name.ascii).toBe('Cotizacion-412-Casa-Perez.pdf')
    expect(name.unicode).toBe('Cotización-412-Casa-Pérez.pdf')
    expect(quoteFileName({ number: 412, title: 'Casa Pérez', revision: 2 }).ascii).toBe('Cotizacion-412B-Casa-Perez.pdf')
    expect(quoteFileName({ number: 7, title: '' }).ascii).toBe('Cotizacion-7.pdf')
    const header = contentDisposition(name)
    expect(header).toContain('attachment; filename="Cotizacion-412-Casa-Perez.pdf"')
    expect(header).toContain("filename*=UTF-8''Cotizaci%C3%B3n-412-Casa-P%C3%A9rez.pdf")
    expect(contentDisposition(name, 'inline').startsWith('inline;')).toBe(true)
  })

  it('OT, documentos de taller y catálogo', () => {
    expect(workshopFileName('OT', { number: 38, title: 'Casa Muñoz · Puerto Varas' }).ascii).toBe('OT-38-Casa-Munoz-Puerto-Varas.pdf')
    expect(workshopFileName('Cortes', { number: 38, title: 'Obra' }).ascii).toBe('OT-38-Cortes-Obra.pdf')
    expect(workshopFileName('Materiales-costos', { number: 38, title: 'Casa Pérez' }).unicode).toBe('OT-38-Materiales-costos-Casa-Pérez.pdf')
    expect(catalogFileName('Ventanas del Ñuble').ascii).toBe('Catalogo-Ventanas-del-Nuble.pdf')
    expect(fileSlug('a'.repeat(80)).length).toBeLessThanOrEqual(48)
    expect(fileSlug('Obra "rara" / 2º piso: ¿sí?')).toBe('Obra-rara-2-piso-si')
  })
})

describe('GET /api/quotes/:id/pdf', () => {
  it('genera el PDF con la plantilla pedida, nombre humano y sin notas internas', async () => {
    const { agent, quote } = await quoteWithClient()
    const res = await agent.request('GET', `/api/quotes/${quote.id}/pdf?template=plano`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain(`filename="Cotizacion-${quote.number}-Casa-Perez-Concepcion.pdf"`)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(String(res.body).startsWith('%PDF')).toBe(true)
    const html = renderer.last
    expect(html).toContain('data-preset="memoria"')
    expect(html).toContain('data-dk-flow')
    expect(html).toContain('Pedro Pérez')
    expect(html).toContain('Casa Pérez')
    expect(html).toContain('@font-face')
    expect(html).toContain('data:font/woff2;base64,')
    expect(html).not.toContain('NOTA-INTERNA-SECRETA')
    expect(bodyOf(html)).not.toContain('NaN')
    // Fuentes del diseño en latin y latin-ext (turco, alemán, francés), sin pedir nada a la red.
    expect(html).toContain('unicode-range: U+0100-02BA')
    expect(bodyOf(html)).not.toMatch(/(?:src|href)=["']https?:/)
    // Total del motor en el documento.
    expect(quote.totals?.total).toBeGreaterThan(0)
    expect(html).toContain(formatClp(quote.totals!.total))
  })

  it('plantilla desconocida → la preferida del taller; ?inline=1 y caché', async () => {
    const { agent, quote } = await quoteWithClient()
    const before = renderer.htmls.length
    const res = await agent.request('GET', `/api/quotes/${quote.id}/pdf?template=nope&inline=1`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('inline;')).toBe(true)
    // Id desconocido: el diseño preferido del taller (el «esencial» de v4 se muestra como «Luz»).
    expect(renderer.last).toContain('data-preset="hogar"')
    // Mismo documento otra vez: sale de la caché sin abrir Chromium.
    expect((await agent.request('GET', `/api/quotes/${quote.id}/pdf?template=nope`)).status).toBe(200)
    expect(renderer.htmls.length).toBe(before + 1)
  })

  it('los ids de la versión 4 se muestran con su diseño equivalente', async () => {
    const { agent, quote } = await quoteWithClient()
    const expected: Record<string, string> = { esencial: 'hogar', galeria: 'hogar', compacta: 'obra', editorial: 'atelier' }
    for (const [legacy, preset] of Object.entries(expected)) {
      const res = await agent.request('GET', `/api/quotes/${quote.id}/pdf?format=html&template=${legacy}`)
      expect(res.status, legacy).toBe(200)
      expect(String(res.body), legacy).toContain(`data-preset="${preset}"`)
    }
  })

  it('?format=html entrega el documento para imprimir desde el navegador', async () => {
    const { agent, quote } = await quoteWithClient()
    const res = await agent.request('GET', `/api/quotes/${quote.id}/pdf?format=html&template=taller-directo`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(String(res.body)).toContain('<!doctype html>')
    expect(String(res.body)).toContain('data-preset="obra"')
    // Sin Chromium el propio HTML se reparte en hojas con los altos reales (script con hash permitido).
    expect(String(res.body)).toMatch(/<script>\(function\(\)\{var flow=/)
  })

  it('cada uno de los 10 diseños genera su documento con el total del motor y sin desbordes marcados', async () => {
    const { agent, quote } = await quoteWithClient()
    for (const id of QUOTE_PRESET_IDS) {
      const res = await agent.request('GET', `/api/quotes/${quote.id}/pdf?format=html&template=${id}`)
      expect(res.status, id).toBe(200)
      const body = String(res.body)
      expect(body, id).toContain(`data-preset="${id}"`)
      expect(body, id).toContain(formatClp(quote.totals!.total))
      const markup = body.slice(body.indexOf('<body>'), body.indexOf('<script>'))
      expect(markup, id).not.toMatch(/class="[^"]*dkd-block--overflow/)
      expect(markup, id).not.toMatch(/NaN|undefined/)
    }
  })

  it('sin Chromium responde 503 amable con respaldo para imprimir', async () => {
    const { agent, quote } = await quoteWithClient()
    renderer.fail = new PdfUnavailableError('launch', 'No pudimos generar el PDF en este momento. Usa «Imprimir» del navegador.')
    try {
      const res = await agent.request('GET', `/api/quotes/${quote.id}/pdf?template=umbral-atelier&inline=1`)
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('pdf_unavailable')
      expect(res.body.error.message).toMatch(/Imprimir/)
      expect(res.body.fallback.html).toBe(`/api/quotes/${quote.id}/pdf?template=umbral-atelier&format=html`)
      expect(res.body.fallback.fileName).toMatch(/^Cotización-\d+-Casa-Pérez/)
    } finally {
      renderer.fail = undefined
    }
  })

  it('aislamiento: otra empresa no puede descargar la cotización; sin sesión 401', async () => {
    const { quote } = await quoteWithClient()
    const other = await signup(server)
    expect((await other.agent.request('GET', `/api/quotes/${quote.id}/pdf`)).status).toBe(404)
    expect((await server.agent().request('GET', `/api/quotes/${quote.id}/pdf`)).status).toBe(401)
  })

  it('el modo lectura nunca bloquea las descargas', async () => {
    const { agent, quote, me } = await quoteWithClient()
    await server.deps.db.update(subscriptions).set({ trialEndsAt: new Date(Date.now() - DAY) }).where(eq(subscriptions.orgId, me.org.id))
    expect((await agent.post('/api/quotes', {})).status).toBe(402)
    const res = await agent.request('GET', `/api/quotes/${quote.id}/pdf`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
  })
})

describe('GET /api/public/quotes/:token/pdf (portal)', () => {
  it('muestra la versión enviada con sus cifras aunque cambien los precios', async () => {
    const { agent, quote, design } = await quoteWithClient()
    const sent = await agent.post(`/api/quotes/${quote.id}/send`)
    expect(sent.status).toBe(200)
    const token: string = sent.body.quote.shareToken
    const anon = server.agent()
    const view = await anon.get(`/api/public/quotes/${token}`)
    const firstId = view.body.quote.items[0].id as string
    const pinned = view.body.prices[firstId].unitNet as number
    expect(pinned).toBeGreaterThan(0)

    // El taller sube el precio del vidrio después de enviar.
    const prices = await agent.put('/api/catalog/prices', { overrides: [{ kind: 'glass', id: design.glassId, price: 9_000_000 }] })
    expect(prices.status).toBe(200)

    const res = await anon.request('GET', `/api/public/quotes/${token}/pdf`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('Cotizacion-')
    const portalHtml = renderer.last
    expect(portalHtml).toContain(formatClp(pinned))
    expect(portalHtml).toContain(formatClp(sent.body.quote.totals.total))
    expect(portalHtml).not.toContain('NOTA-INTERNA-SECRETA')
    expect(portalHtml).toContain(`/c/${token}`)

    // El PDF interno de la cotización enviada SIN cambios dice lo mismo que el portal (mismo N°,
    // revisión y fecha → mismas cifras), aunque los precios del catálogo hayan subido.
    await agent.request('GET', `/api/quotes/${quote.id}/pdf`)
    expect(bodyOf(renderer.last)).toContain(formatClp(pinned))
    expect(bodyOf(renderer.last)).toContain(formatClp(sent.body.quote.totals.total))

    // Editada después de enviar: es el borrador de la revisión siguiente, recalculado y sin la fecha del envío.
    const current = (await agent.get<Quote>(`/api/quotes/${quote.id}`)).body
    const edited = await agent.put<Quote>(`/api/quotes/${quote.id}`, { version: current.version, title: 'Casa Pérez · ampliación' })
    expect(edited.status).toBe(200)
    await agent.request('GET', `/api/quotes/${quote.id}/pdf`)
    const draft = bodyOf(renderer.last)
    expect(draft).not.toContain(formatClp(pinned))
    expect(draft).toContain('Rev. B')
  })

  it('enlace inexistente → 404 amable', async () => {
    const res = await server.agent().request('GET', '/api/public/quotes/no-existe/pdf')
    expect(res.status).toBe(404)
    expect(res.body.error.message).toMatch(/enlace/)
  })
})

describe('GET /api/work-orders/:id/pdf', () => {
  it('documentos de taller por tipo, con nombre humano y límites de plan suaves', async () => {
    const { agent, quote, me } = await quoteWithClient('Taller Biobío')
    const wo = await agent.post<WorkOrder>('/api/work-orders', { quoteId: quote.id, notes: 'Entregar antes del viernes' })
    expect(wo.status).toBe(201)

    const ot = await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf`)
    expect(ot.status).toBe(200)
    expect(ot.headers.get('content-disposition')).toContain(`filename="OT-${wo.body.number}-Casa-Perez-Concepcion.pdf"`)
    expect(renderer.last).toContain('data-document="work-order"')

    const cuts = await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=cuts`)
    expect(cuts.status).toBe(200)
    expect(cuts.headers.get('content-disposition')).toContain(`filename="OT-${wo.body.number}-Cortes-Casa-Perez-Concepcion.pdf"`)
    expect(renderer.last).toContain('data-document="cuts"')

    const labels = await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=labels&labels=roll`)
    expect(labels.status).toBe(200)
    expect(renderer.last).toContain('data-document="labels"')

    // Prueba (funciones de Pro): las órdenes de compra están incluidas.
    expect((await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=purchase`)).status).toBe(200)

    // Plan Taller: órdenes de compra se explican y ofrecen mejorar (402), el resto sigue igual.
    await server.deps.db.update(subscriptions).set({ plan: 'taller', status: 'active' }).where(eq(subscriptions.orgId, me.org.id))
    const purchase = await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=purchase`)
    expect(purchase.status).toBe(402)
    expect(purchase.body.error.code).toBe('plan_required')
    expect(purchase.body.error.message).toMatch(/Pro/)
    expect(purchase.body.plan).toBe('pro')
    expect((await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=glass`)).status).toBe(200)

    // Tipo desconocido: la OT (nunca un error por esto).
    expect((await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=otro&format=html`)).body).toContain('data-document="work-order"')
    expect((await agent.request('GET', `/api/work-orders/nope/pdf`)).status).toBe(404)
  })

  it('respeta las opciones de la vista previa: ?glass=0, ?prices=0 y el IVA del taller', async () => {
    const { agent, quote } = await quoteWithClient('Taller Opciones')
    const wo = await agent.post<WorkOrder>('/api/work-orders', { quoteId: quote.id })
    expect(wo.status).toBe(201)
    const html = async (query: string) => bodyOf(String((await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?${query}&format=html`)).body))
    const countLabels = (body: string) => (body.match(/class="fzw-label"/g) ?? []).length

    // Etiquetas sin vidrios: menos etiquetas que con vidrios.
    const withGlass = countLabels(await html('doc=labels'))
    const withoutGlass = countLabels(await html('doc=labels&glass=0'))
    expect(withGlass).toBeGreaterThan(0)
    expect(withoutGlass).toBeGreaterThan(0)
    expect(withoutGlass).toBeLessThan(withGlass)

    // Orden de compra sin precios: sin montos ni IVA.
    const priced = await html('doc=purchase')
    expect(priced).toMatch(/IVA 19/)
    const unpriced = await html('doc=purchase&prices=0')
    expect(unpriced).not.toMatch(/\$\s?\d{1,3}(\.\d{3})+/)
    expect(unpriced).not.toMatch(/IVA \d/)

    // El IVA de la orden es el del taller (settings.pricing.ivaPct), igual que en pantalla.
    expect((await agent.patch('/api/settings', { pricing: { ivaPct: 10 } })).status).toBe(200)
    expect(await html('doc=purchase')).toMatch(/IVA 10/)
  })
})

describe('permisos por rol en documentos de taller (plan con roles)', () => {
  it('el cotizador no descarga costos internos; materiales sin costos sí', async () => {
    const { agent, quote, me } = await quoteWithClient('Fábrica con roles')
    const wo = await agent.post<WorkOrder>('/api/work-orders', { quoteId: quote.id })
    await server.deps.db.update(subscriptions).set({ plan: 'empresa', status: 'active' }).where(eq(subscriptions.orgId, me.org.id))
    const invite = await agent.post('/api/team/invite', { role: 'estimator' })
    const member = server.agent()
    const token = String(invite.body.link).split('/').pop()
    expect((await member.post(`/api/invitations/${token}/accept`, { name: 'Bruno Cotizador', email: `bruno.${Date.now()}@taller.cl`, password: 'clave-segura-123' })).status).toBe(200)

    const costs = await member.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=costs`)
    expect(costs.status).toBe(403)
    expect(costs.body.error.message).toMatch(/dueño/)
    expect((await member.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=materials`)).status).toBe(200)
    // El dueño sí.
    expect((await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=costs`)).status).toBe(200)
    expect(renderer.last).toContain('data-document="costs"')
  })
})

describe('GET /api/catalog/pdf', () => {
  it('folleto con las líneas activas y «desde $X/m²» calculado con el motor', async () => {
    const { agent } = await signup(server, { company: 'Ventanas del Ñuble' })
    const catalog = (await agent.get('/api/catalog')).body
    expect(catalog.lines.length).toBeGreaterThan(0)
    const res = await agent.request('GET', '/api/catalog/pdf?template=sistema')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('filename="Catalogo-Ventanas-del-Nuble.pdf"')
    const html = renderer.last
    expect(html).toContain('data-template="sistema"')
    for (const line of catalog.lines) expect(html).toContain(line.name)
    expect(html).toMatch(/dkc-price__from">Desde<\/span>\s*<span class="dkc-price__value">\$[\d.]+<\/span>/)
    // El «ficha» de la versión 4 se muestra con «Sistema».
    expect(String((await agent.request('GET', '/api/catalog/pdf?template=ficha&format=html')).body)).toContain('data-template="sistema"')

    // Sólo algunas líneas, con plantilla por defecto del taller.
    const only = catalog.lines[0]
    const one = await agent.request('GET', `/api/catalog/pdf?lines=${encodeURIComponent(only.id)}&format=html`)
    expect(one.status).toBe(200)
    // Sin diseño pedido: el preferido del taller (el «vitrina» de la versión 4 es «Colección Modular»).
    expect(String(one.body)).toContain('data-template="coleccion-modular"')
  })
})
