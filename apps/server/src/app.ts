/**
 * createApp(deps): la API completa de Framezen como app Hono, sin efectos de arranque
 * (sin puerto, sin migraciones). index.ts la levanta; las pruebas la usan con PGlite en memoria.
 */
import { join } from 'node:path'
import { Hono } from 'hono'
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
import { TRIAL_MAILS_PER_DAY } from './services/outbound'
import { requireAuth } from './middleware/auth'
import { activityRoutes } from './routes/activity'
import { billingFlowRoutes, billingRoutes } from './routes/billing'
import { pdfRoutes, publicPdfRoutes } from './routes/pdf'
import { readOnlyGuard } from './services/billing/guard'
import { assistantRoutes } from './routes/assistant'
import { authRoutes } from './routes/auth'
import { catalogRoutes } from './routes/catalog'
import { clientRoutes } from './routes/clients'
import { meRoutes, orgRoutes } from './routes/org'
import { publicRoutes } from './routes/public'
import { quoteRoutes } from './routes/quotes'
import { settingsRoutes } from './routes/settings'
import { invitationRoutes, teamRoutes } from './routes/team'
import { workOrderRoutes } from './routes/work-orders'
import { CatalogService } from './services/catalog'
import { z } from 'zod'

export interface CreateAppOptions {
  db: Db
  config?: Partial<AppConfig>
  mailer?: Mailer
  logger?: Logger
  now?: () => Date
  catalogs?: CatalogService
}

export const SERVER_VERSION = '4.0.0'

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

  // CSRF: las escrituras deben venir de la propia app (Sec-Fetch-Site / Origin).
  app.use('/api/*', sameOriginGuard(deps))

  // Tamaño máximo del cuerpo: 20 MB para importar CSV, 6 MB para el resto (logo ≤ 1 MB).
  const tooLarge = () => {
    throw new HttpError(413, 'too_large', 'Lo que intentas subir es demasiado grande.')
  }
  app.use('/api/catalog/import-csv', bodyLimit({ maxSize: 20 * 1024 * 1024, onError: tooLarge }))
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/catalog/import-csv') return next()
    return bodyLimit({ maxSize: 6 * 1024 * 1024, onError: tooLarge })(c, next)
  })

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json(error.toJSON(), error.status)
    if (error instanceof z.ZodError) {
      const http = fromZodError(error)
      return c.json(http.toJSON(), http.status)
    }
    deps.logger.error(`${c.req.method} ${redactPath(c.req.path)}`, error)
    return c.json({ error: { code: 'internal', message: 'Algo falló de nuestro lado. Ya quedó registrado; intenta de nuevo en un momento.' } }, 500)
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
  app.route('/api/settings', authed(deps, settingsRoutes(deps)))
  app.route('/api/team', authed(deps, teamRoutes(deps)))
  app.route('/api/clients', authed(deps, clientRoutes(deps)))
  app.route('/api/quotes', authed(deps, quoteRoutes(deps)))
  app.route('/api/catalog', authed(deps, catalogRoutes(deps)))
  app.route('/api/work-orders', authed(deps, workOrderRoutes(deps)))
  app.route('/api/activity', authed(deps, activityRoutes(deps)))
  app.route('/api/billing', authed(deps, billingRoutes(deps))) // plan, checkout (Flow o 'dev'), cancelar y deshacer
  app.route('/api/assistant', authed(deps, assistantRoutes(deps))) // POST /api/assistant/chat → Marco (IA o modo local); registra ai_usage

  app.all('/api/*', (c) => c.json({ error: { code: 'not_found', message: 'Esa dirección de la API no existe.' } }, 404))

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
    app.get('*', serveStatic({ path: join(root, 'index.html'), onFound: (_p, c) => c.header('Cache-Control', 'no-cache') }))
  }

  return app
}
