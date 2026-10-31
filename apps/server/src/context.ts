import type { Role } from '@framezen/shared'
import type { AppConfig } from './config'
import type { Db } from './db/client'
import type { orgs, users } from './db/schema'
import type { Logger } from './lib/logger'
import type { Mailer } from './lib/mail'
import type { BackoffLimiter, RateLimiter } from './lib/rate-limit'
import type { Viewer } from './services/access'
import type { CatalogService } from './services/catalog'

export interface AuthContext {
  sessionId: string
  user: typeof users.$inferSelect
  org: typeof orgs.$inferSelect
  role: Role
}

/** `viewer`: rol + funciones del plan, calculado una vez por petición (services/access.ts). */
export type AppEnv = { Variables: { auth: AuthContext; viewer?: Viewer } }

/** Dependencias resueltas que comparten todas las rutas. */
export interface AppDeps {
  db: Db
  config: AppConfig
  mailer: Mailer
  logger: Logger
  catalogs: CatalogService
  limits: {
    /** Intentos de entrada por correo + IP. */
    login: RateLimiter
    /** Intentos de entrada por IP (cualquier correo). */
    loginIp: RateLimiter
    /** Intentos fallidos por cuenta (sin IP), con espera creciente: rotar de IP no sirve. */
    loginAccount: BackoffLimiter
    forgot: RateLimiter
    /** Cuentas nuevas por IP (crear cuenta y aceptar invitaciones sin sesión). */
    signup: RateLimiter
    /** Acciones del portal público (aceptar, pedir cambios). */
    publicActions: RateLimiter
    /** Correos salientes por organización y día (enviar cotización, invitar, avisos del portal). */
    outboundMail: RateLimiter
  }
  now: () => Date
}
