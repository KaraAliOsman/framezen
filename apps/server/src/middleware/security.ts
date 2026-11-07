/**
 * Cabeceras de seguridad de toda la app.
 *
 * - SPA (index.html de apps/web/dist): CSP estricta. Los scripts en línea (p. ej. el que aplica el
 *   tema antes de pintar) se permiten por HASH calculado al arrancar desde el index.html que se
 *   sirve (se recalcula si el archivo cambia): nunca hashes escritos a mano.
 * - API JSON: `default-src 'none'`, sin marcos.
 * - HTML de documentos de la API (`?format=html`): CSP con `sandbox` (origen opaco: sin cookies ni
 *   acceso a la sesión), sin red, imágenes y fuentes solo en línea, y como único script el ajuste de
 *   hojas de taller por hash. Así ningún texto de plantilla, de la IA o de un cliente ejecuta código
 *   en el origen de la app.
 * - Siempre: nosniff, Referrer-Policy, Permissions-Policy, COOP; HSTS en producción con https.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createMiddleware } from 'hono/factory'
import { TEMPLATE_FLOW_SCRIPT, WORKSHOP_FIT_SCRIPT } from '@dekopen/documents'
import type { AppDeps, AppEnv } from '../context'

const sha256b64 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64')

/** Contenido de los <script> en línea (sin src) de un HTML. */
export function inlineScripts(html: string): string[] {
  const out: string[] = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const attrs = m[1] ?? ''
    if (/\bsrc\s*=/i.test(attrs)) continue
    if (/\btype\s*=\s*["']?(application\/(ld\+)?json|text\/template)/i.test(attrs)) continue
    out.push(m[2] ?? '')
  }
  return out
}

/** Fuentes CSP ('sha256-…') de los scripts en línea de un HTML. */
export function scriptHashes(html: string): string[] {
  return [...new Set(inlineScripts(html).map((s) => `'sha256-${sha256b64(s)}'`))]
}

/** Hashes del index.html servido, recalculados solo si cambia el archivo (mtime + tamaño). */
export class IndexHtmlHashes {
  private cached: { key: string; hashes: string[] } | undefined

  constructor(private readonly file: string | null) {}

  get(): string[] {
    if (!this.file || !existsSync(this.file)) return []
    try {
      const stat = statSync(this.file)
      const key = `${stat.mtimeMs}:${stat.size}`
      if (this.cached?.key !== key) this.cached = { key, hashes: scriptHashes(readFileSync(this.file, 'utf8')) }
      return this.cached.hashes
    } catch {
      return this.cached?.hashes ?? []
    }
  }
}

/** CSP de la SPA. */
export function spaCsp(options: { scriptHashes: readonly string[]; production: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self'${options.scriptHashes.length ? ` ${options.scriptHashes.join(' ')}` : ''}`,
    // Estilos en línea: React usa atributos style y los documentos/impresión usan <style>.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.production ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

/** Hash del script de las cotizaciones con plantilla (repagina con los altos reales al imprimir). */
export const TEMPLATE_SCRIPT_HASH = `'sha256-${sha256b64(TEMPLATE_FLOW_SCRIPT.replace(/<\/script/gi, '<\\/script'))}'`

/** Hash del script de los documentos de taller (el ajuste de hojas). */
export const DOCUMENT_SCRIPT_HASH = `'sha256-${sha256b64(WORKSHOP_FIT_SCRIPT.replace(/<\/script/gi, '<\\/script'))}'`

/**
 * CSP del HTML de documentos (?format=html). `sandbox` sin allow-same-origin: el documento corre en
 * un origen opaco (no ve cookies ni la API aunque algo se colara). Sin red: todo va en línea.
 */
export const DOCUMENT_HTML_CSP = [
  "default-src 'none'",
  `script-src ${DOCUMENT_SCRIPT_HASH} ${TEMPLATE_SCRIPT_HASH}`,
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  'sandbox allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox',
].join('; ')

/** CSP de respuestas JSON y binarias de la API. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  // Dictado por voz del asistente (Web Speech API).
  'microphone=(self)',
  'midi=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'bluetooth=()',
  'fullscreen=(self)',
  'browsing-topics=()',
].join(', ')

export const HSTS = 'max-age=31536000; includeSubDomains'

export interface SecurityHeaderOptions {
  production: boolean
  /** Con https se envía HSTS (solo en producción). */
  appUrl: string
  /** Carpeta de la web compilada (para los hashes de index.html). */
  webDist: string | null
}

export function securityOptionsFrom(deps: Pick<AppDeps, 'config'>): SecurityHeaderOptions {
  return { production: deps.config.production, appUrl: deps.config.appUrl, webDist: deps.config.webDist }
}

export const securityHeaders = (options: SecurityHeaderOptions) => {
  const index = new IndexHtmlHashes(options.webDist ? join(options.webDist, 'index.html') : null)
  const hsts = options.production && options.appUrl.startsWith('https://')
  return createMiddleware<AppEnv>(async (c, next) => {
    await next()
    const headers = c.res.headers
    const setIfMissing = (name: string, value: string) => {
      if (!headers.has(name)) headers.set(name, value)
    }
    setIfMissing('X-Content-Type-Options', 'nosniff')
    setIfMissing('Referrer-Policy', 'strict-origin-when-cross-origin')
    setIfMissing('Permissions-Policy', PERMISSIONS_POLICY)
    setIfMissing('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
    setIfMissing('X-Frame-Options', 'DENY')
    if (hsts) setIfMissing('Strict-Transport-Security', HSTS)

    const isApi = c.req.path === '/api' || c.req.path.startsWith('/api/')
    const type = (headers.get('Content-Type') ?? '').toLowerCase()
    const isHtml = type.startsWith('text/html')
    if (isApi) {
      setIfMissing('Cross-Origin-Resource-Policy', 'same-origin')
      if (isHtml) {
        // Documentos imprimibles: siempre la CSP con sandbox (reemplaza cualquier otra).
        headers.set('Content-Security-Policy', DOCUMENT_HTML_CSP)
        headers.set('X-Frame-Options', 'SAMEORIGIN')
      } else setIfMissing('Content-Security-Policy', API_CSP)
      return
    }
    if (isHtml) headers.set('Content-Security-Policy', spaCsp({ scriptHashes: index.get(), production: options.production }))
  })
}
