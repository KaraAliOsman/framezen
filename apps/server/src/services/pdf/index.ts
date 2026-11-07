/**
 * Servicio de PDF: navegador compartido + caché corta de documentos ya generados
 * (descargar dos veces la misma cotización es instantáneo).
 */
import type { AppDeps } from '../../context'
import { sha256 } from '../../lib/crypto'
import { sharedPdfRenderer, type PdfRenderer } from './browser'

export * from './browser'
export * from './data'
export * from './filename'
export * from './fonts'
export * from './render'

const overrides = new WeakMap<AppDeps, PdfRenderer>()

/** Reemplaza el generador de PDF de una app (pruebas o un servicio externo). */
export function setPdfRenderer(deps: AppDeps, renderer: PdfRenderer): void {
  overrides.set(deps, renderer)
}

export function pdfRendererFor(deps: AppDeps): PdfRenderer {
  return overrides.get(deps) ?? sharedPdfRenderer(deps.logger)
}

interface CacheEntry {
  pdf: Buffer
  at: number
}

const CACHE_MAX = 24
const CACHE_TTL_MS = 10 * 60_000
const caches = new WeakMap<PdfRenderer, Map<string, CacheEntry>>()

/** Genera el PDF de un HTML (o lo toma de la caché si es idéntico y reciente). */
export async function renderPdf(deps: AppDeps, html: string): Promise<{ pdf: Buffer; cached: boolean }> {
  const renderer = pdfRendererFor(deps)
  let cache = caches.get(renderer)
  if (!cache) caches.set(renderer, (cache = new Map()))
  // Los ids de useId cambian con el reparto por tramos del render; no cuentan para saber si es el mismo documento.
  const key = sha256(html.replace(/f\d+zR[0-9a-z]+/g, 'fzR'))
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_TTL_MS) {
    // Al final de la fila (LRU).
    cache.delete(key)
    cache.set(key, hit)
    return { pdf: hit.pdf, cached: true }
  }
  const pdf = await renderer.render(html)
  cache.set(key, { pdf, at: now })
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return { pdf, cached: false }
}
