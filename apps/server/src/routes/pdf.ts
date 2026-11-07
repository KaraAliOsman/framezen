/**
 * PDF de documentos (Chromium en el servidor, mismas plantillas que la web).
 *
 *   GET /api/quotes/:id/pdf?template=<QuoteTemplateId>          (sesión)
 *   GET /api/work-orders/:id/pdf?doc=<tipo>&labels=roll&brandId=&glass=0&prices=0&parts=sash,bead (sesión)
 *   GET /api/quotes/:id/cuts/pdf?doc=cuts|cut-order&parts=sash,bead  (sesión; calculado al vuelo, sin crear nada)
 *   GET /api/catalog/pdf?template=<CatalogTemplateId>&lines=a,b  (sesión)
 *   GET /api/public/quotes/:token/pdf?template=                  (portal, sin sesión)
 *
 * Comunes: ?format=html devuelve el HTML autónomo (para «Imprimir» del navegador) e
 * ?inline=1 muestra el PDF en el navegador en vez de descargarlo. Si Chromium no está
 * disponible: 503 { error: { code: 'pdf_unavailable', message }, fallback: { html } }.
 * El modo lectura nunca bloquea estas descargas (son GET).
 */
import { Hono, type Context } from 'hono'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { workshopDocumentAccess } from '@dekopen/documents'
import { FEATURE_COPY, PLANS, planFeatures, type Quote } from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { orgs, quoteRevisions, quotes, subscriptions, workOrders } from '../db/schema'
import { HttpError, notFound } from '../lib/errors'
import { RateLimiter } from '../lib/rate-limit'
import { requireAuth } from '../middleware/auth'
import { assetStore } from '../services/assets'
import {
  buildCatalogDoc,
  buildQuoteDoc,
  buildWorkshopDoc,
  contentDisposition,
  PdfUnavailableError,
  pickCatalogTemplate,
  renderCatalogDocumentAsync,
  renderPdf,
  renderQuoteDocumentAsync,
  renderWorkshopDocumentAsync,
  workshopInfo,
  workshopRenderOptionsFromQuery,
  type RenderedDocument,
} from '../services/pdf'
import type { ItemPrices } from '../services/pricing'
import { renderedQuote } from '../services/pdf/quote-file'
import { findClient, findQuote, publicClient, toClient, toQuote } from '../services/quotes'
import { clientIp, toOrg } from '../services/session'
import { getSettings } from '../services/settings'
import { notePortalPdf } from './public'
import { toWorkOrder } from './work-orders'
import { textureDataUrlsForColors } from '../services/textures'
import { loadQuoteTemplateForRender, templateAssetDataUrls } from '../services/templates'

type Snapshot = Quote & { itemPrices?: ItemPrices }

const truthy = (value: string | undefined) => value === '1' || value === 'true'

/**
 * En pantallas angostas la hoja (816 px) se reduce para caber entera (sin JS, por tramos de
 * 20 px). Sólo en pantalla: al imprimir se usa el tamaño real. Va únicamente en ?format=html.
 */
const SCREEN_FIT_CSS = (() => {
  const rules: string[] = ['@media print { .fzd-sheets, .fzw-doc { zoom: 1 !important; } }', '@media screen and (max-width: 860px) { body { padding: 12px 0 !important; overflow-x: hidden; } }']
  for (let w = 860; w >= 300; w -= 20) {
    const zoom = Math.max(0.3, (w - 20 - 24) / 816).toFixed(3)
    rules.push(`@media screen and (max-width: ${w}px) { .fzd-sheets, .fzw-doc { zoom: ${zoom}; } }`)
  }
  return `<style>${rules.join('\n')}</style>`
})()

function screenHtml(html: string): string {
  const at = html.indexOf('</head>')
  return at === -1 ? html : `${html.slice(0, at)}${SCREEN_FIT_CSS}${html.slice(at)}`
}

/** Responde el documento como PDF (o HTML con ?format=html), con nombre humano. */
async function respondDocument(c: Context, deps: AppDeps, rendered: RenderedDocument): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  if (c.req.query('format') === 'html') {
    return c.html(screenHtml(rendered.html), 200, headers)
  }
  try {
    const { pdf } = await renderPdf(deps, rendered.html)
    return c.body(new Uint8Array(pdf), 200, {
      ...headers,
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(rendered.fileName, truthy(c.req.query('inline')) ? 'inline' : 'attachment'),
      'Content-Length': String(pdf.length),
      'X-Content-Type-Options': 'nosniff',
    })
  } catch (error) {
    if (error instanceof PdfUnavailableError) {
      const url = new URL(c.req.url)
      url.searchParams.set('format', 'html')
      url.searchParams.delete('inline')
      return c.json(
        {
          error: { code: 'pdf_unavailable', message: error.message },
          fallback: { html: `${url.pathname}${url.search}`, fileName: rendered.fileName.unicode },
        },
        503,
        { 'Retry-After': '30', 'Cache-Control': 'no-store' },
      )
    }
    throw error
  }
}

async function planOf(deps: AppDeps, orgId: string) {
  const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
  return sub?.plan ?? 'trial'
}

/** Rutas con sesión: se montan en /api (cada una exige sesión por sí misma). */
export function pdfRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const auth = requireAuth(deps)

  app.get('/quotes/:id/pdf', auth, async (c) => {
    const { org } = c.get('auth')
    // También desde la papelera: nunca se esconden datos.
    const row = await findQuote(deps.db, org.id, c.req.param('id'), { includeDeleted: true })
    if (!row) throw notFound('No encontramos esa cotización.')
    return respondDocument(c, deps, await renderedQuote(deps, org, row, c.req.query('template')))
  })

  app.get('/work-orders/:id/pdf', auth, async (c) => {
    const { org, role } = c.get('auth')
    const [row] = await deps.db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, c.req.param('id')), eq(workOrders.orgId, org.id)))
      .limit(1)
    if (!row) throw notFound('No encontramos esa OT.')
    const quoteRow = await findQuote(deps.db, org.id, row.quoteId, { includeDeleted: true })
    if (!quoteRow) throw notFound('La cotización de esta OT ya no existe, así que no podemos armar sus documentos.')
    const info = workshopInfo(c.req.query('doc')) ?? workshopInfo('work-order')!
    // Mismas reglas que la web: plan (límite suave, se explica) y rol (costos internos).
    const viewer = { role, features: planFeatures(await planOf(deps, org.id)) }
    const access = workshopDocumentAccess(info.kind, viewer)
    if (!access.visible) throw new HttpError(403, 'forbidden', `${access.reason} Pídele al dueño que te lo comparta.`)
    if (access.locked) {
      const copy = FEATURE_COPY[access.locked]
      throw new HttpError(402, 'plan_required', `${copy.title} viene en el plan ${PLANS[copy.plan].name}. ${copy.why}`, undefined, {
        feature: access.locked,
        plan: copy.plan,
        upgrade: '/ajustes/plan',
      })
    }
    const client = await findClient(deps.db, org.id, quoteRow.clientId)
    const clientData = client ? toClient(client) : null
    const settings = await getSettings(deps.db, org.id)
    const { catalog } = await deps.catalogs.effective(org.id, { onlyEnabled: false, kerf: settings.cut.kerf })
    const paperQuery = c.req.query('paper')
    const input = buildWorkshopDoc({
      workOrder: toWorkOrder(row),
      quote: toQuote(quoteRow, clientData),
      org: toOrg(org),
      catalog,
      settings,
      client: clientData,
      viewer,
      now: deps.now(),
      ...(paperQuery === 'a4' || paperQuery === 'letter' ? { paper: paperQuery } : {}),
    })
    return respondDocument(
      c,
      deps,
      await renderWorkshopDocumentAsync(input.data, {
        kind: info.kind,
        paper: input.paper,
        // ?labels=|format=sheet|roll, ?glass=0, ?brandId=, ?prices=0 (igual que la vista previa). El IVA ya viene en data.ivaPct (settings.pricing.ivaPct).
        ...workshopRenderOptionsFromQuery((name) => c.req.query(name)),
      }),
    )
  })

  // Los cortes de una cotización sin OT: se calculan al vuelo y no se guarda nada.
  app.get('/quotes/:id/cuts/pdf', auth, async (c) => {
    const { org, role } = c.get('auth')
    const quoteRow = await findQuote(deps.db, org.id, c.req.param('id'), { includeDeleted: true })
    if (!quoteRow) throw notFound('No encontramos esa cotización.')
    const kind = c.req.query('doc') === 'cut-order' ? 'cut-order' : 'cuts'
    const viewer = { role, features: planFeatures(await planOf(deps, org.id)) }
    const access = workshopDocumentAccess(kind, viewer)
    if (!access.visible) throw new HttpError(403, 'forbidden', `${access.reason} Pídele al dueño que te lo comparta.`)
    const client = await findClient(deps.db, org.id, quoteRow.clientId)
    const clientData = client ? toClient(client) : null
    const settings = await getSettings(deps.db, org.id)
    const { catalog } = await deps.catalogs.effective(org.id, { onlyEnabled: false, kerf: settings.cut.kerf })
    const paperQuery = c.req.query('paper')
    const quote = toQuote(quoteRow, clientData)
    const input = buildWorkshopDoc({
      workOrder: { number: quote.number, fromQuote: true, ...(clientData?.name ? { clientName: clientData.name } : {}) },
      quote,
      org: toOrg(org),
      catalog,
      settings,
      client: clientData,
      viewer,
      now: deps.now(),
      ...(paperQuery === 'a4' || paperQuery === 'letter' ? { paper: paperQuery } : {}),
    })
    const { parts } = workshopRenderOptionsFromQuery((name) => c.req.query(name))
    return respondDocument(c, deps, await renderWorkshopDocumentAsync(input.data, { kind, paper: input.paper, ...(parts ? { parts } : {}) }))
  })

  app.get('/catalog/pdf', auth, async (c) => {
    const { org } = c.get('auth')
    const settings = await getSettings(deps.db, org.id)
    const { catalog } = await deps.catalogs.effective(org.id, { onlyEnabled: true, kerf: settings.cut.kerf })
    const only = (c.req.query('lines') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const lines = only.length ? catalog.lines.filter((l) => only.includes(l.id)) : catalog.lines
    const title = c.req.query('title')?.trim().slice(0, 120) || undefined
    // Sin ?lines= (folleto por defecto) quedan fuera las líneas con datos parciales; con la lista que elige la web se respetan todas.
    const data = buildCatalogDoc({
      org: toOrg(org),
      catalog: { ...catalog, lines },
      settings,
      title,
      date: deps.now().toISOString().slice(0, 10),
      includePartial: only.length > 0,
    })
    const template = pickCatalogTemplate(c.req.query('template'), settings.documents.catalogTemplate)
    return respondDocument(c, deps, await renderCatalogDocumentAsync(data, template))
  })

  return app
}

const MISSING = 'Este enlace de cotización no existe o fue reemplazado. Pide a quien te la envió un enlace nuevo.'

/** Portal del cliente: se monta en /api/public. Muestra la última versión enviada, con sus cifras. */
export function publicPdfRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  // Generar un PDF cuesta: límite generoso por IP para que nadie lo use para tumbar el servidor.
  const limiter = new RateLimiter(40, 10 * 60_000, () => deps.now().getTime())

  app.get('/quotes/:token/pdf', async (c) => {
    const token = c.req.param('token')
    if (!token || token.length > 100) throw notFound(MISSING)
    const wait = limiter.hit(clientIp(c, deps.config.trustProxyHops))
    if (wait) throw new HttpError(429, 'too_many_attempts', 'Pediste muchos PDF seguidos. Espera un momento y vuelve a intentarlo.')
    const [row] = await deps.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.shareToken, token), isNull(quotes.deletedAt)))
      .limit(1)
    if (!row) throw notFound(MISSING)
    const [revision] = await deps.db
      .select()
      .from(quoteRevisions)
      .where(eq(quoteRevisions.quoteId, row.id))
      .orderBy(desc(quoteRevisions.revision))
      .limit(1)
    if (!revision) throw notFound(MISSING)
    const [orgRow] = await deps.db.select().from(orgs).where(eq(orgs.id, row.orgId)).limit(1)
    if (!orgRow) throw notFound(MISSING)
    const snapshot = revision.snapshot as Snapshot
    // Lo que ve el cliente: la foto enviada, sin notas internas, con el estado vigente.
    const { notes: _notes, itemPrices, ...rest } = snapshot
    void _notes
    const quote: Quote = {
      ...rest,
      status: row.status,
      ...(row.acceptedBy ? { acceptedBy: row.acceptedBy } : {}),
      ...(row.acceptedAt ? { acceptedAt: row.acceptedAt.toISOString() } : {}),
    }
    const settings = await getSettings(deps.db, row.orgId)
    const { catalog } = await deps.catalogs.effective(row.orgId, { onlyEnabled: false, kerf: settings.cut.kerf })
    const textures = await textureDataUrlsForColors(deps, row.orgId, catalog.colors)
    const loaded = await loadQuoteTemplateForRender(deps.db, row.orgId, { requested: c.req.query('template'), documents: settings.documents, overrides: quote.documentOverrides })
    const assets = await templateAssetDataUrls(assetStore(deps), row.orgId, loaded.template, settings.documents, quote.documentOverrides)
    const data = buildQuoteDoc(
      {
        quote,
        org: toOrg(orgRow),
        catalog,
        settings,
        textures,
        template: loaded.template,
        assets,
        client: snapshot.client ? publicClient(snapshot.client) : null,
        portalUrl: `${deps.config.appUrl}/c/${token}`,
        ...(itemPrices ? { itemPrices } : {}),
        ...(snapshot.totals ? { totals: snapshot.totals } : {}),
        date: revision.createdAt.toISOString().slice(0, 10),
      },
    )
    const response = await respondDocument(c, deps, await renderQuoteDocumentAsync(data, loaded.template))
    if (response.status === 200 && c.req.query('format') !== 'html') await notePortalPdf(c, deps, row, revision, snapshot.client?.name)
    return response
  })

  return app
}
