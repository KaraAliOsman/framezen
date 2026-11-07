import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { planFeatures } from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { subscriptions } from '../db/schema'
import { forbidden, unauthorized } from '../lib/errors'
import { resolveLocale } from '../lib/i18n'
import { assertWritable } from '../services/billing/guard'
import { resolveSession } from '../services/session'

/**
 * Exige sesión válida y deja `auth` (usuario, organización, rol) en el contexto, y el idioma de la
 * petición ya con la sesión (user.locale ?? Accept-Language ?? org.locale ?? 'es'). Si otra capa ya
 * resolvió la sesión en esta petición, no la vuelve a consultar.
 */
export const requireAuth = (deps: AppDeps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get('auth')) {
      const auth = await resolveSession(c, deps)
      if (!auth) throw unauthorized()
      c.set('auth', auth)
      c.set('locale', resolveLocale({ user: auth.user.locale, header: c.req.header('accept-language'), org: auth.org.locale }))
    }
    await next()
  })

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Modo lectura al vencer la prueba o el plan, o con el pago muy atrasado (accessOf): se puede
 * ver y exportar todo, pero no crear ni modificar. Límite suave: el mensaje explica y ofrece
 * elegir un plan. (El middleware global readOnlyGuard aplica la misma regla a toda la API.)
 */
export const requireWritable = (deps: AppDeps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (MUTATING.has(c.req.method)) {
      const orgId = c.get('auth').org.id
      const [sub] = await deps.db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
      if (sub) await assertWritable(deps, sub)
    }
    await next()
  })

export const requireOwner = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('auth').role !== 'owner') throw forbidden()
    await next()
  })

/**
 * Ajustes, catálogo y datos de la empresa: el dueño; o cualquiera si el plan no tiene
 * roles (en Pro todos ven todo, salvo equipo y facturación).
 */
export const requireManager = (deps: AppDeps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const { role, org } = c.get('auth')
    if (role !== 'owner') {
      const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, org.id)).limit(1)
      if (!sub || planFeatures(sub.plan).includes('roles'))
        throw forbidden('Esta configuración la cambia el dueño de la cuenta. Pídele que lo haga o que te dé permiso.')
    }
    await next()
  })
