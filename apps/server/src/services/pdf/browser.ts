/**
 * Chromium compartido para generar PDF (playwright-core).
 *
 * - Un solo navegador por proceso, abierto al primer PDF y cerrado tras un rato sin uso.
 * - Cola con concurrencia limitada: muchos «Descargar PDF» a la vez no tumban el servidor.
 * - Cada documento en su propio contexto. Si un documento pasa su plazo con el navegador sano, se
 *   cierra solo ese contexto: los demás PDF en curso siguen (antes se reiniciaba el navegador entero).
 * - El plazo crece con el tamaño del HTML (una OT de miles de etiquetas no corre con el de una cotización).
 * - Si el navegador se cae o queda trabado se reinicia (solo esa instancia: nunca la que ya relanzó
 *   otro documento) y se reintenta una vez.
 * - Sin red: el documento trae todo (fuentes y logo como data URL) y no puede pedir nada afuera.
 * - Si Chromium no está disponible, lanza PdfUnavailableError y la ruta responde 503 con
 *   un mensaje amable para que la web use «Imprimir» del navegador.
 */
import type { Browser, BrowserContext } from 'playwright-core'
import type { Logger } from '../../lib/logger'

export type PdfUnavailableReason = 'launch' | 'busy' | 'timeout' | 'crash'

export class PdfUnavailableError extends Error {
  constructor(
    readonly reason: PdfUnavailableReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'PdfUnavailableError'
  }
}

export interface RenderPdfOptions {
  /** Tiempo máximo para este documento (ms). Por defecto, el del renderizador según el tamaño del HTML (`pdfTimeoutFor`). */
  timeoutMs?: number
}

/** Lo mínimo que necesita una ruta para producir un PDF (las pruebas inyectan uno falso). */
export interface PdfRenderer {
  render(html: string, options?: RenderPdfOptions): Promise<Buffer>
  close(): Promise<void>
}

export interface ChromiumRendererOptions {
  /** Ruta de un Chromium/Chrome propio (CHROMIUM_PATH). Sin ella, el de Playwright ya instalado. */
  executablePath?: string
  /** Tiempo máximo base por documento (ms); crece con el tamaño del HTML (`pdfTimeoutFor`). */
  timeoutMs?: number
  /** Plazo para cerrar el contexto de un documento fallido; si no cierra, el navegador quedó trabado (ms). */
  contextCloseMs?: number
  /** Documentos en paralelo. */
  concurrency?: number
  /** Documentos esperando turno antes de responder «ocupado». */
  maxQueue?: number
  /** Se cierra el navegador tras este tiempo sin uso (ms). */
  idleMs?: number
  /** Espera tras un arranque fallido antes de volver a intentarlo (ms). */
  retryLaunchAfterMs?: number
  /** Arranque inyectable (pruebas). */
  launch?: (executablePath?: string) => Promise<Browser>
  logger?: Logger
}

const DEFAULTS = { timeoutMs: 30_000, contextCloseMs: 5_000, concurrency: 2, maxQueue: 24, idleMs: 5 * 60_000, retryLaunchAfterMs: 30_000 }

/**
 * Plazo de un documento según su tamaño: el base más 2 s por MB de HTML sobre el primero, con tope
 * de 4 veces el base. Una cotización usa el base (30 s); las etiquetas de una OT de 10 MB, ~48 s.
 */
export function pdfTimeoutFor(htmlLength: number, baseMs: number = DEFAULTS.timeoutMs): number {
  const extraMb = Math.max(0, (Number.isFinite(htmlLength) ? htmlLength : 0) / 1_000_000 - 1)
  return Math.round(Math.min(baseMs * 4, baseMs + extraMb * 2_000))
}

const UNAVAILABLE =
  'No pudimos generar el PDF en este momento. Usa «Imprimir» del navegador y elige «Guardar como PDF»: queda igual.'

async function launchChromium(executablePath?: string): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--disable-extensions'],
  })
}

/** Errores que indican que el navegador murió o quedó inutilizable. */
function isBrowserGone(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Target (page, context or browser )?(has been )?closed|Browser (has been )?closed|browser has disconnected|Protocol error|crash/i.test(message)
}

class TimeoutError extends Error {}

/** Resultado de un intento: el PDF, o el error con el navegador usado y si quedó sano. */
type Attempt = { ok: true; pdf: Buffer } | { ok: false; error: unknown; handle?: Promise<Browser>; healthy: boolean }

/** Navegador conectado (los navegadores simulados de las pruebas no siempre lo informan). */
function isConnected(browser: Browser): boolean {
  return typeof browser.isConnected === 'function' ? browser.isConnected() : true
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(`El PDF tardó más de ${Math.round(ms / 1000)} s`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

export class ChromiumPdfRenderer implements PdfRenderer {
  private browser: Promise<Browser> | undefined
  private active = 0
  private readonly waiting: (() => void)[] = []
  private idleTimer: NodeJS.Timeout | undefined
  private launchFailedAt = 0
  private launchError: unknown
  private readonly options: Required<Omit<ChromiumRendererOptions, 'executablePath' | 'launch' | 'logger'>> &
    Pick<ChromiumRendererOptions, 'executablePath' | 'launch' | 'logger'>

  /** Cuántos navegadores se han abierto (diagnóstico y pruebas). */
  launches = 0

  constructor(options: ChromiumRendererOptions = {}) {
    this.options = { ...DEFAULTS, ...options }
  }

  async render(html: string, options: RenderPdfOptions = {}): Promise<Buffer> {
    const timeoutMs = options.timeoutMs ?? pdfTimeoutFor(html.length, this.options.timeoutMs)
    await this.acquire()
    try {
      const first = await this.attempt(html, timeoutMs)
      if (first.ok) return first.pdf
      if (first.error instanceof PdfUnavailableError) throw first.error
      const timedOut = first.error instanceof TimeoutError
      if (!timedOut && !isBrowserGone(first.error)) throw first.error
      if (timedOut && first.healthy) {
        // Documento demasiado pesado con el navegador sano: ya se cerró solo su contexto. Reiniciar
        // cortaría los otros PDF en curso y reintentar con el mismo plazo solo duplicaría la espera.
        this.options.logger?.warn(`Un PDF pasó su plazo (${Math.round(timeoutMs / 1000)} s, ${(html.length / 1_000_000).toFixed(1)} MB de HTML); la web usará «Imprimir».`)
        throw new PdfUnavailableError('timeout', UNAVAILABLE, first.error)
      }
      // Navegador caído o trabado: se reinicia (si nadie lo hizo ya) y se intenta una vez más.
      this.options.logger?.warn('Chromium falló al generar un PDF; lo reinicio y reintento.', first.error)
      if (!first.healthy) await this.resetIf(first.handle)
      const second = await this.attempt(html, timeoutMs)
      if (second.ok) return second.pdf
      if (second.error instanceof PdfUnavailableError) throw second.error
      if (!second.healthy) await this.resetIf(second.handle)
      throw new PdfUnavailableError(second.error instanceof TimeoutError ? 'timeout' : 'crash', UNAVAILABLE, second.error)
    } finally {
      this.release()
    }
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = undefined
    await this.reset()
  }

  /** Estado para diagnóstico (GET /api/pdf/status). */
  status(): { running: boolean; active: number; waiting: number; lastLaunchError?: string } {
    return {
      running: Boolean(this.browser),
      active: this.active,
      waiting: this.waiting.length,
      ...(this.launchError ? { lastLaunchError: this.launchError instanceof Error ? this.launchError.message.split('\n')[0] : String(this.launchError) } : {}),
    }
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  /** Un intento en un contexto propio, que se cierra siempre; dice si el navegador quedó sano. */
  private async attempt(html: string, timeoutMs: number): Promise<Attempt> {
    const handle = this.browserHandle()
    let browser: Browser
    try {
      browser = await handle
    } catch (error) {
      return { ok: false, error, handle, healthy: false }
    }
    let context: BrowserContext | undefined
    let outcome: Attempt
    try {
      // Sin red (offline) y sin descargas: todo viene embebido en el HTML.
      context = await browser.newContext({ offline: true, acceptDownloads: false, viewport: { width: 1024, height: 1320 } })
      const ctx = context
      const pdf = await withTimeout(
        (async () => {
          const page = await ctx.newPage()
          await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs })
          await page.evaluate(() => document.fonts.ready.then(() => undefined))
          const pdf = await page.pdf({
            preferCSSPageSize: true,
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
          })
          return Buffer.from(pdf)
        })(),
        timeoutMs,
      )
      outcome = { ok: true, pdf }
    } catch (error) {
      outcome = { ok: false, error, handle, healthy: false }
    }
    // Se cierra solo este contexto (corta lo que quedó colgado en él). Si ni eso responde, o el
    // navegador se desconectó, está trabado o caído.
    const closed = context ? await withTimeout(context.close(), this.options.contextCloseMs).then(() => true, () => false) : false
    if (!outcome.ok) outcome.healthy = closed && isConnected(browser)
    return outcome
  }

  /** El navegador en uso (o uno nuevo). Su promesa identifica la instancia para `resetIf`. */
  private browserHandle(): Promise<Browser> {
    if (this.browser) return this.browser
    if (this.launchError && Date.now() - this.launchFailedAt < this.options.retryLaunchAfterMs) {
      return Promise.reject(new PdfUnavailableError('launch', UNAVAILABLE, this.launchError))
    }
    const launch = this.options.launch ?? launchChromium
    this.launches++
    const launching = launch(this.options.executablePath).then(
      (browser) => {
        this.launchError = undefined
        browser.on('disconnected', () => {
          if (this.browser === launching) this.browser = undefined
        })
        return browser
      },
      (error: unknown) => {
        if (this.browser === launching) this.browser = undefined
        this.launchFailedAt = Date.now()
        this.launchError = error
        this.options.logger?.warn(
          `No pude abrir Chromium para los PDF${this.options.executablePath ? ` (CHROMIUM_PATH=${this.options.executablePath})` : ''}. La web usará «Imprimir» del navegador.`,
          error instanceof Error ? error.message.split('\n')[0] : error,
        )
        throw new PdfUnavailableError('launch', UNAVAILABLE, error)
      },
    )
    this.browser = launching
    return launching
  }

  /**
   * Reinicia el navegador solo si sigue siendo la instancia que falló. Si otro documento ya lo
   * reinició, el actual es nuevo y sano: cerrarlo mataría su reintento y los PDF que corren en él.
   */
  private async resetIf(handle: Promise<Browser> | undefined): Promise<void> {
    if (!handle || this.browser !== handle) return
    await this.reset()
  }

  private async reset(): Promise<void> {
    const current = this.browser
    this.browser = undefined
    if (!current) return
    try {
      const browser = await current
      await browser.close()
    } catch {
      // ya estaba cerrado o nunca abrió
    }
  }

  private acquire(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = undefined
    }
    if (this.active < this.options.concurrency) {
      this.active++
      return Promise.resolve()
    }
    if (this.waiting.length >= this.options.maxQueue) {
      return Promise.reject(new PdfUnavailableError('busy', 'Estamos generando muchos PDF a la vez. Intenta de nuevo en unos segundos o usa «Imprimir» del navegador.'))
    }
    return new Promise((resolve) => this.waiting.push(resolve))
  }

  private release(): void {
    const next = this.waiting.shift()
    if (next) {
      next() // el turno pasa directo, `active` no cambia
      return
    }
    this.active--
    if (this.active === 0 && this.options.idleMs > 0) {
      this.idleTimer = setTimeout(() => {
        this.idleTimer = undefined
        if (this.active === 0) void this.reset()
      }, this.options.idleMs)
      this.idleTimer.unref?.()
    }
  }
}

let shared: ChromiumPdfRenderer | undefined

/** Navegador compartido del proceso, configurado por entorno (CHROMIUM_PATH, PDF_TIMEOUT_MS). */
export function sharedPdfRenderer(logger?: Logger): ChromiumPdfRenderer {
  shared ??= new ChromiumPdfRenderer({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    timeoutMs: Number(process.env.PDF_TIMEOUT_MS) || DEFAULTS.timeoutMs,
    logger,
  })
  return shared
}

export const PDF_UNAVAILABLE_MESSAGE = UNAVAILABLE
