/**
 * El PDF de una cotización tal como lo baja el taller: la misma ruta sirve la descarga y el adjunto del
 * correo, para que nunca salgan dos documentos distintos. Enviada y sin cambios lleva las cifras y la
 * fecha de esa revisión (igual que el portal); editada después, es el borrador de la siguiente.
 */
import type { Quote } from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { assetStore } from '../assets'
import { findClient, sentQuoteDoc, toClient, toQuote, type QuoteRow } from '../quotes'
import { toOrg } from '../session'
import { getSettings } from '../settings'
import { loadQuoteTemplateForRender, templateAssetDataUrls } from '../templates'
import { textureDataUrlsForColors } from '../textures'
import { buildQuoteDoc } from './data'
import { renderPdf } from './index'
import { renderQuoteDocumentAsync, type RenderedDocument } from './render'

export async function renderedQuote(deps: AppDeps, org: AuthContext['org'], row: QuoteRow, requested?: string): Promise<RenderedDocument> {
  const client = await findClient(deps.db, org.id, row.clientId)
  const clientData = client ? toClient(client) : null
  const sent = await sentQuoteDoc(deps.db, row)
  const { sentAt: _sentAt, ...unsent } = toQuote(row, clientData)
  void _sentAt
  const quote: Quote = sent.kind === 'draft' ? { ...unsent, revision: sent.revision } : toQuote(row, clientData)
  const pinned = sent.kind === 'sent' ? { ...(sent.itemPrices ? { itemPrices: sent.itemPrices } : {}), ...(sent.totals ? { totals: sent.totals } : {}), date: sent.date } : {}
  const settings = await getSettings(deps.db, org.id)
  const { catalog } = await deps.catalogs.effective(org.id, { onlyEnabled: false, kerf: settings.cut.kerf })
  const portalUrl = row.shareToken && row.revision > 0 ? `${deps.config.appUrl}/c/${row.shareToken}` : undefined
  const textures = await textureDataUrlsForColors(deps, org.id, catalog.colors)
  // Diseño predefinido o plantilla propia de la empresa (con sus fotos en línea: Chromium no sale a la red).
  const loaded = await loadQuoteTemplateForRender(deps.db, org.id, { requested, documents: settings.documents, overrides: quote.documentOverrides })
  const assets = await templateAssetDataUrls(assetStore(deps), org.id, loaded.template, settings.documents, quote.documentOverrides)
  const data = buildQuoteDoc({ quote, org: toOrg(org), catalog, settings, client: clientData, portalUrl, textures, template: loaded.template, assets, ...pinned })
  return renderQuoteDocumentAsync(data, loaded.template)
}

/** El PDF listo para adjuntar. Lanza `PdfUnavailableError` si este servidor no puede generarlo. */
export async function quotePdfFile(deps: AppDeps, org: AuthContext['org'], row: QuoteRow): Promise<{ filename: string; content: Buffer }> {
  const rendered = await renderedQuote(deps, org, row)
  const { pdf } = await renderPdf(deps, rendered.html)
  return { filename: rendered.fileName.ascii, content: pdf }
}
