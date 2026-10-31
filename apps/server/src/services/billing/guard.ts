/**
 * Modo lectura: cuando la prueba o el plan vencen, la cuenta sigue viéndose y
 * descargándose completa, pero no se puede crear ni modificar. Este middleware responde
 * 402 con un mensaje amable SOLO a escrituras (POST/PUT/PATCH/DELETE) que no sean de
 * facturación, sesión, invitaciones o del portal del cliente. Las lecturas y descargas
 * (GET, incluidos los PDF) nunca se bloquean.
 */
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { and, eq, gt } from 'drizzle-orm'
import type { AppDeps, AppEnv } from '../../context'
import { sessions, subscriptions } from '../../db/schema'
import { sha256 } from '../../lib/crypto'
import { HttpError } from '../../lib/errors'
import { SESSION_COOKIE } from '../session'
import { accessOf, type SubscriptionRow } from './plans'
import { billingFor } from './registry'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Prefijos que siempre se pueden usar: pagar, entrar/salir, cambiar de empresa, aceptar
 * invitaciones, el portal del cliente y conversar con Marco (el chat no modifica datos:
 * sus acciones pasan por las rutas normales, que sí quedan protegidas).
 */
export const READ_ONLY_EXEMPT = ['/api/billing', '/api/auth', '/api/me', '/api/invitations', '/api/public', '/api/health', '/api/assistant']

export function isExemptPath(path: string): boolean {
  return READ_ONLY_EXEMPT.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * Lanza el 402 amable si la cuenta está en modo lectura (prueba o plan vencidos, o pago con más
 * de GRACE_DAYS días de atraso). Antes de bloquear por pago atrasado consulta si el cobro ya
 * entró (Flow) o se renueva (dev), para no cerrarle la puerta a quien ya pagó.
 */
export async function assertWritable(deps: AppDeps, sub: SubscriptionRow): Promise<void> {
  const now = deps.now()
  let access = accessOf(sub, now)
  if (access.readOnly && access.reason === 'payment_overdue') {
    const refreshed = await billingFor(deps).refresh(sub.orgId)
    access = accessOf(refreshed.sub, now)
  }
  if (access.readOnly) {
    throw new HttpError(402, 'read_only', access.message ?? 'Tu cuenta está en modo lectura. Elige un plan para seguir cotizando.', undefined, {
      reason: access.reason,
      upgrade: '/ajustes/plan',
    })
  }
}

export const readOnlyGuard = (deps: AppDeps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!MUTATING.has(c.req.method) || isExemptPath(c.req.path)) return next()
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) return next() // sin sesión: la ruta responderá 401
    const now = deps.now()
    const [row] = await deps.db
      .select({ sub: subscriptions })
      .from(sessions)
      .innerJoin(subscriptions, eq(subscriptions.orgId, sessions.orgId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, now)))
      .limit(1)
    if (!row) return next()
    await assertWritable(deps, row.sub)
    await next()
  })
