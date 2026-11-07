/**
 * createApp(deps): la API completa de DEKOPEN como app Hono, sin efectos de arranque
 * (sin puerto, sin migraciones). index.ts la levanta; las pruebas la usan con PGlite en memoria.
 */
import { join } from 'node:path'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { defaultConfig, type AppConfig } from './config'
import type { AppDeps, AppEnv } from './context'
import type { Db } from './db/client'
import { HttpError, fromZodError, notFound } from './lib/errors'
import { redactPath } from './lib/redact'
import { sameOriginGuard } from './middleware/csrf'
import { createLogger, type Logger } from './lib/logger'
import { createMailer, type Mailer } from './lib/mail'
import { BackoffLimiter, RateLimiter } from './lib/rate-limit'
import { KeyedRateLimiter } from './lib/keyed-limiter'
import { localeOf, localizeErrorMessage } from './lib/i18n'
import { requestLocale } from './middleware/locale'
import { securityHeaders, securityOptionsFrom } from './middleware/security'
import { TRIAL_MAILS_PER_DAY } from './services/outbound'
import { requireAuth } from './middleware/auth'
import { activityRoutes } from './routes/activity'
import { billingFlowRoutes, billingRoutes } from './routes/billing'
import { pdfRoutes, publicPdfRoutes } from './routes/pdf'
import { readOnlyGuard } from './services/billing/guard'
import { assistantRoutes } from './routes/assistant'
import { assistantV2Routes } from './routes/assistant-v2'
import { templateRoutes } from './routes/templates'
import { textureRoutes } from './routes/textures'
import { authRoutes } from './routes/auth'
import { catalogRoutes } from './routes/catalog'
import { clientRoutes } from './routes/clients'
import { meRoutes, orgRoutes } from './routes/org'
import { paymentSettingsRoutes } from './routes/payment-settings'
import { publicRoutes } from './routes/public'
import { quotePaymentRoutes } from './routes/quote-payments'
import { quoteRoutes } from './routes/quotes'
import { settingsRoutes } from './routes/settings'
import { invitationRoutes, teamRoutes } from './routes/team'
import { workOrderRoutes } from './routes/work-orders'
import { CatalogService } from './services/catalog'
import { compress } from 'hono/compress'
import { z } from 'zod'

export interface CreateAppOptions {
  db: Db
  config?: Partial<AppConfig>
  mailer?: Mailer
  logger?: Logger
  now?: () => Date
  catalogs?: CatalogService
}

export const SERVER_VERSION = '5.0.0'

export function buildDeps(options: CreateAppOptions): AppDeps {
  const config = defaultConfig(options.config)
  const logger = options.logger ?? createLogger(config.logRequests)
  const now = options.now ?? (() => new Date())
  const clock = () => now().getTime()
  return {
    db: options.db,
    config,
    logger,
    mailer: options.mailer ?? createMailer({ resendApiKey: config.resendApiKey, from: config.mailFrom, logger, production: config.production }),
    catalogs: options.catalogs ?? new CatalogService(options.db),
    limits: {
      login: new RateLimiter(8, 15 * 60_000, clock),
      loginIp: new RateLimiter(60, 15 * 60_000, clock),
      // 10 fallos libres por cuenta; luego 30 s, 1, 2, 4… minutos (máx. 30) aunque cambie la IP.
      loginAccount: new BackoffLimiter(10, 30_000, 30 * 60_000, 24 * 60 * 60_000, clock),
      forgot: new RateLimiter(5, 60 * 60_000, clock),
      signup: new RateLimiter(config.signupPerHour, 60 * 60_000, clock),
      publicActions: new RateLimiter(20, 60 * 60_000, clock),
      // El tope real depende del plan (ver services/outbound.ts); éste es el de la prueba.
      outboundMail: new RateLimiter(TRIAL_MAILS_PER_DAY, 24 * 60 * 60_000, clock),
      keyed: new KeyedRateLimiter(clock),
    },
    now,
  }
}

/** Monta un router que exige sesión. */
function authed(deps: AppDeps, router: Hono<AppEnv>): Hono<AppEnv> {
  const wrapper = new Hono<AppEnv>()
  wrapper.use('*', requireAuth(deps))
  wrapper.route('/', router)
  return wrapper
}

export function createApp(options: CreateAppOptions | AppDeps): Hono<AppEnv> {
  const deps = 'limits' in options ? options : buildDeps(options)
  const app = new Hono<AppEnv>()
  // Despacho interno de herramientas del asistente (services/dispatch.ts): la misma app, en proceso.
  deps.internalFetch = (request) => app.fetch(request)

  // El portal se abre desde el teléfono con datos móviles: su respuesta y los archivos van comprimidos.
  app.use('/assets/*', compress())
  app.use('/api/public/quotes/:token', compress())

  // Cabeceras de seguridad para todo (API, documentos y la SPA con CSP por hash).
  app.use('*', securityHeaders(securityOptionsFrom(deps)))

  if (deps.config.logRequests) {
    app.use('/api/*', async (c, next) => {
      const start = performance.now()
      await next()
      const ms = Math.round(performance.now() - start)
      const status = c.res.status
      const mark = status >= 500 ? '✖' : status >= 400 ? '!' : ' '
      deps.logger.info(`${mark} ${c.req.method.padEnd(6)} ${redactPath(c.req.path)} ${status} · ${ms} ms`)
    })
  }

  // Un carácter nulo en la ruta o la consulta (/api/quotes/%00) no es un id válido: Postgres lo
  // rechazaría con un 500. Se responde 404 antes de consultar.
  app.use('/api/*', async (c, next) => {
    if (/%00/i.test(c.req.url) || c.req.url.includes('\u0000')) throw notFound('No encontramos lo que buscas.')
    return next()
  })

  // Idioma de la petición (Accept-Language; con sesión, user.locale ?? navegador ?? empresa).
  app.use('/api/*', requestLocale())

  // CSRF: las escrituras deben venir de la propia app (Sec-Fetch-Site / Origin).
  app.use('/api/*', sameOriginGuard(deps))

  // Tamaño máximo del cuerpo: 20 MB para importar CSV, 15 MB para subir una textura (foto de hasta
  // 10 MiB en base64 dentro de JSON), 6 MB para el resto (logo ≤ 1 MB).
  const tooLarge = () => {
    throw new HttpError(413, 'too_large', 'Lo que intentas subir es demasiado grande.')
  }
  const TEXTURE_UPLOAD_PATH = '/api/textures'
  // Un turno del asistente puede traer archivos: su texto y hasta 12 imágenes reducidas.
  const ASSISTANT_TURN_PATH = '/api/assistant/v2/turns'
  app.use('/api/catalog/import-csv', bodyLimit({ maxSize: 20 * 1024 * 1024, onError: tooLarge }))
  app.use(TEXTURE_UPLOAD_PATH, bodyLimit({ maxSize: 15 * 1024 * 1024, onError: tooLarge }))
  app.use(ASSISTANT_TURN_PATH, bodyLimit({ maxSize: 22 * 1024 * 1024, onError: tooLarge }))
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/catalog/import-csv' || c.req.path === TEXTURE_UPLOAD_PATH || c.req.path === ASSISTANT_TURN_PATH) return next()
    return bodyLimit({ maxSize: 6 * 1024 * 1024, onError: tooLarge })(c, next)
  })

  // Errores: el código es estable; el mensaje sale en el idioma de la petición (lib/i18n).
  const respondError = (c: Context<AppEnv>, http: HttpError) => {
    const message = localizeErrorMessage({ code: http.code, message: http.message, field: http.field, extra: http.extra, status: http.status }, localeOf(c))
    const retryAfter = http.extra?.retryAfter
    if (http.status === 429 && typeof retryAfter === 'number' && retryAfter > 0) c.header('Retry-After', String(Math.ceil(retryAfter)))
    return c.json(http.toJSON(message), http.status)
  }
  app.onError((error, c) => {
    if (error instanceof HttpError) return respondError(c, error)
    if (error instanceof z.ZodError) return respondError(c, fromZodError(error))
    deps.logger.error(`${c.req.method} ${redactPath(c.req.path)}`, error)
    return respondError(c, new HttpError(500, 'internal', 'Algo falló de nuestro lado. Ya quedó registrado; intenta de nuevo en un momento.'))
  })

  // ── Públicas ───────────────────────────────────────────────────────────────
  app.get('/api/health', (c) => c.json({ ok: true, version: SERVER_VERSION, time: deps.now().toISOString() }))
  app.route('/api/auth', authRoutes(deps))
  app.route('/api/invitations', invitationRoutes(deps))
  app.route('/api/public', publicRoutes(deps))
  app.route('/api/public', publicPdfRoutes(deps)) // GET /api/public/quotes/:token/pdf (portal)
  // Flow llama sin sesión: confirmación (servidor a servidor) y retorno del navegador. Antes de las privadas.
  app.route('/api/billing/flow', billingFlowRoutes(deps))

  // ── Modo lectura: 402 amable a escrituras (salvo facturación y sesión) si venció la prueba o el plan ──
  app.use('/api/*', readOnlyGuard(deps))

  // ── Privadas (sesión obligatoria, todo filtrado por la organización de la sesión) ──
  // PDF: GET /api/quotes/:id/pdf, /api/work-orders/:id/pdf y /api/catalog/pdf (cada una exige sesión).
  app.route('/api', pdfRoutes(deps))
  app.route('/api/me', authed(deps, meRoutes(deps)))
  app.route('/api/org', authed(deps, orgRoutes(deps)))
  app.route('/api/settings/payments', authed(deps, paymentSettingsRoutes(deps)))
  app.route('/api/settings', authed(deps, settingsRoutes(deps)))
  app.route('/api/team', authed(deps, teamRoutes(deps)))
  app.route('/api/clients', authed(deps, clientRoutes(deps)))
  app.route('/api/quotes', authed(deps, quoteRoutes(deps)))
  app.route('/api/quotes', authed(deps, quotePaymentRoutes(deps)))
  app.route('/api/catalog', authed(deps, catalogRoutes(deps)))
  app.route('/api/work-orders', authed(deps, workOrderRoutes(deps)))
  app.route('/api/activity', authed(deps, activityRoutes(deps)))
  app.route('/api/billing', authed(deps, billingRoutes(deps))) // plan, checkout (Flow o 'dev'), cancelar y deshacer
  // v5: asistente v2 (AGENT), texturas propias (TEXUP) y plantillas propias (TPL-EDITOR).
  app.route('/api/assistant/v2', authed(deps, assistantV2Routes(deps)))
  app.route('/api/assistant', authed(deps, assistantRoutes(deps))) // POST /api/assistant/chat → Marco (IA o modo local); registra ai_usage
  app.route('/api/textures', authed(deps, textureRoutes(deps)))
  app.route('/api/templates', authed(deps, templateRoutes(deps)))

  app.all('/api/*', (c) => respondError(c, new HttpError(404, 'not_found', 'Esa dirección de la API no existe.')))

  // ── Producción: estáticos de apps/web/dist con fallback SPA ────────────────
  if (deps.config.webDist) {
    const root = deps.config.webDist
    app.use(
      '*',
      serveStatic({
        root,
        onFound: (path, c) => {
          c.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache')
        },
      }),
    )
    app.get(
      '*',
      serveStatic({
        path: join(root, 'index.html'),
        onFound: (_p, c) => {
          c.header('Cache-Control', 'no-cache')
          // El enlace de una cotización es privado: que ningún buscador lo guarde.
          if (c.req.path.startsWith('/c/')) c.header('X-Robots-Tag', 'noindex, nofollow')
        },
      }),
    )
  }

  return app
}
