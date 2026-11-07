import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Browser } from 'playwright-core'
import { sampleWorkshopData, WORKSHOP_FIT_SCRIPT } from '@dekopen/documents'
import type { Quote } from '@dekopen/shared'
import { quoteRevisions } from '../src/db/schema'
import { API_CSP, DOCUMENT_HTML_CSP, DOCUMENT_SCRIPT_HASH, inlineScripts, scriptHashes, spaCsp } from '../src/middleware/security'
import { ChromiumPdfRenderer, PdfUnavailableError } from '../src/services/pdf/browser'
import { renderWorkshopDocument } from '../src/services/pdf/render'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`
const SCRATCH = join(process.cwd(), '.scratch', 'server-agent', `webdist-${process.pid}-${Date.now()}`)

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server.close()
  rmSync(SCRATCH, { recursive: true, force: true })
})

describe('cabeceras de seguridad', () => {
  it('API JSON: CSP sin nada, nosniff, Referrer-Policy, Permissions-Policy, sin marcos; sin HSTS en desarrollo', async () => {
    const res = await server.agent().get('/api/health')
    expect(res.headers.get('content-security-policy')).toBe(API_CSP)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('permissions-policy')).toMatch(/camera=\(\)/)
    expect(res.headers.get('permissions-policy')).toMatch(/microphone=\(self\)/)
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(res.headers.get('strict-transport-security')).toBeNull()
    // Errores también.
    const missing = await server.agent().get('/api/nada')
    expect(missing.headers.get('content-security-policy')).toBe(API_CSP)
  })

  it('HSTS solo en producción con https', async () => {
    const prod = await startServer({ config: { production: true, appUrl: 'https://app.dekopen.test' } })
    try {
      expect((await prod.agent().get('/api/health')).headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    } finally {
      await prod.close()
    }
  })

  it('SPA: CSP con hashes de los scripts en línea del index.html servido, recalculados si cambia', async () => {
    mkdirSync(join(SCRATCH, 'assets'), { recursive: true })
    const theme = "\n;(function(){document.documentElement.dataset.theme='light'})()\n"
    const html = (inline: string) =>
      `<!doctype html><html><head><script>${inline}</script><script type="module" crossorigin src="/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>`
    const file = join(SCRATCH, 'index.html')
    writeFileSync(file, html(theme))
    writeFileSync(join(SCRATCH, 'assets', 'index-abc.js'), 'console.log(1)')
    const web = await startServer({ config: { webDist: SCRATCH } })
    try {
      const page = await web.agent().get('/cotizaciones/123')
      expect(page.status).toBe(200)
      const csp = page.headers.get('content-security-policy')!
      expect(csp).toContain(`script-src 'self' ${sha(theme)}`)
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).not.toMatch(/unsafe-eval|'unsafe-inline' 'self'.*script/)
      // Los archivos estáticos no llevan la CSP de la SPA.
      const asset = await web.agent().get('/assets/index-abc.js')
      expect(asset.headers.get('content-security-policy')).toBeNull()
      expect(asset.headers.get('x-content-type-options')).toBe('nosniff')

      // I18N (u otro build) cambia el script: el hash nuevo entra sin reiniciar.
      const changed = "document.documentElement.lang='en'"
      writeFileSync(file, html(changed))
      const future = new Date(Date.now() + 5000)
      utimesSync(file, future, future)
      const again = await web.agent().get('/')
      expect(again.headers.get('content-security-policy')).toContain(sha(changed))
      expect(again.headers.get('content-security-policy')).not.toContain(sha(theme))
    } finally {
      await web.close()
    }
  })

  it('utilidades: scripts en línea sin src ni JSON; CSP de la SPA', () => {
    const html = '<script>a()</script><script src="/x.js"></script><script type="application/ld+json">{}</script><SCRIPT type="module">b()</SCRIPT>'
    expect(inlineScripts(html)).toEqual(['a()', 'b()'])
    expect(scriptHashes(html)).toHaveLength(2)
    expect(spaCsp({ scriptHashes: [], production: true })).toContain('upgrade-insecure-requests')
  })
})

describe('documentos HTML (?format=html) con CSP sandbox', () => {
  it('la cotización en HTML sale aislada (sandbox, sin red, sin scripts ajenos)', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent)
    const quote = await agent.post<Quote>('/api/quotes', { title: 'Casa <script>alert(1)</script>', items: [item(design)] })
    const res = await agent.get(`/api/quotes/${quote.body.id}/pdf?format=html`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    const csp = res.headers.get('content-security-policy')!
    expect(csp).toBe(DOCUMENT_HTML_CSP)
    expect(csp).toMatch(/sandbox allow-scripts/)
    expect(csp).not.toMatch(/allow-same-origin/)
    expect(csp).toMatch(/default-src 'none'/)
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(String(res.body)).not.toContain('<script>alert(1)</script>')
  })

  it('el único script permitido es el ajuste de hojas de taller, por su hash exacto', () => {
    const html = renderWorkshopDocument(sampleWorkshopData(), { kind: 'work-order' }).html
    const scripts = inlineScripts(html)
    expect(scripts).toHaveLength(1)
    expect(sha(scripts[0]!)).toBe(DOCUMENT_SCRIPT_HASH)
    expect(WORKSHOP_FIT_SCRIPT.length).toBeGreaterThan(100)
  })
})

describe('portal público: preferencias del documento saneadas', () => {
  it('no reenvía claves ajenas ni tipos raros guardados en la foto enviada', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent)
    const quote = await agent.post<Quote>('/api/quotes', { title: 'Casa Portal', items: [item(design)] })
    const sent = await agent.post(`/api/quotes/${quote.body.id}/send`, { channel: 'link' })
    const token: string = sent.body.quote.shareToken
    // Una foto antigua (o manipulada) con claves que no son preferencias del documento.
    const [rev] = await server.deps.db.select().from(quoteRevisions).where(eq(quoteRevisions.quoteId, quote.body.id))
    const snapshot = { ...rev!.snapshot, documentOverrides: { intro: 'Hola', __proto__x: 1, apiKey: 'sk-secreto', quoteTemplate: '<img onerror>', showArea: 'sí', validityDays: '20 días' } }
    await server.deps.db.update(quoteRevisions).set({ snapshot: snapshot as never }).where(eq(quoteRevisions.id, rev!.id))
    const view = await server.agent().get(`/api/public/quotes/${token}`)
    expect(view.status).toBe(200)
    const docs = view.body.documents as Record<string, unknown>
    expect(docs.intro).toBe('Hola')
    expect(docs.validityDays).toBe(20)
    expect(docs.apiKey).toBeUndefined()
    expect(docs.__proto__x).toBeUndefined()
    expect(docs.quoteTemplate).not.toBe('<img onerror>')
    expect(typeof docs.showArea).toBe('boolean')
  })
})

describe('Chromium sin JavaScript del documento', () => {
  it('abre cada documento con javaScriptEnabled: false y aplica el ajuste de taller como código propio', async () => {
    const contexts: Record<string, unknown>[] = []
    const evaluated: unknown[] = []
    const page = {
      setContent: async () => undefined,
      evaluate: async (fn: unknown) => void evaluated.push(fn),
      pdf: async () => Buffer.from('%PDF-1.7'),
    }
    const browser = {
      newContext: async (options: Record<string, unknown>) => {
        contexts.push(options)
        return { newPage: async () => page, close: async () => undefined }
      },
      on: () => undefined,
      close: async () => undefined,
    } as unknown as Browser
    const renderer = new ChromiumPdfRenderer({ launch: async () => browser, idleMs: 0 })
    await renderer.render('<html><body><div class="fzw-doc" data-fit>x</div></body></html>')
    await renderer.render('<html><body>cotización</body></html>')
    expect(contexts).toHaveLength(2)
    for (const options of contexts) expect(options).toMatchObject({ javaScriptEnabled: false, offline: true, acceptDownloads: false })
    const trusted = evaluated.filter((e) => typeof e === 'string')
    expect(trusted).toHaveLength(1)
    expect(String(trusted[0])).toContain('fzw-doc[data-fit]')
    await renderer.close()
  })

  it('con Chromium real: los <script> del documento no corren; QR (SVG) e imágenes en línea sí salen', async () => {
    const renderer = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 45_000 })
    const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    // Si el script corriera, agregaría 30 páginas.
    const hostile = `<!doctype html><html><head><style>@page{size:A4;margin:0}.p{break-after:page;height:10mm}</style></head><body><p>Una página</p><img src="data:image/png;base64,${png}" style="width:20mm;height:20mm"><script>for(let i=0;i<30;i++){const d=document.createElement('div');d.className='p';d.textContent='HACK '+i;document.body.appendChild(d)}</script></body></html>`
    try {
      let pdf: Buffer
      try {
        pdf = await renderer.render(hostile)
      } catch (error) {
        if (error instanceof PdfUnavailableError && error.reason === 'launch') {
          console.warn('Chromium no disponible en esta máquina; se omite la prueba real.')
          return
        }
        throw error
      }
      expect(pageCount(pdf)).toBe(1)
      expect(pdf.toString('latin1')).toMatch(/\/Subtype\s*\/Image/)

      // Etiquetas de taller: QR en SVG y ajuste de hojas (código propio del servidor).
      const labels = renderWorkshopDocument(sampleWorkshopData(), { kind: 'labels' }).html
      expect(labels).toMatch(/<svg[^>]*>.*<path/s)
      const labelsPdf = await renderer.render(labels)
      expect(labelsPdf.subarray(0, 5).toString()).toBe('%PDF-')
      expect(pageCount(labelsPdf)).toBeGreaterThanOrEqual(1)
      const workOrder = await renderer.render(renderWorkshopDocument(sampleWorkshopData(), { kind: 'work-order' }).html)
      expect(workOrder.subarray(0, 5).toString()).toBe('%PDF-')
    } finally {
      await renderer.close()
    }
  }, 120_000)
})
