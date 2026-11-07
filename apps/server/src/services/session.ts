import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { getConnInfo } from '@hono/node-server/conninfo'
import { and, count, eq, gt, isNull } from 'drizzle-orm'
import type { BillingStateDetail, Me, Org, Role, User } from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../context'
import { invitations, memberships, orgs, sessions, users } from '../db/schema'
import { newId, randomToken, sha256 } from '../lib/crypto'
import { isLocale } from '../lib/i18n/locale'
import { billingFor } from './billing/registry'

export const SESSION_COOKIE = 'fz_session'
const SESSION_DAYS = 30
const DAY = 86_400_000
/** Cada cuánto se renueva la sesión deslizante (evita escribir en cada request). */
const TOUCH_EVERY_MS = 10 * 60_000

function socketIp(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'local'
  } catch {
    return 'local'
  }
}

/**
 * IP del cliente para los límites de intentos. El primer valor de X-Forwarded-For lo escribe
 * quien hace la petición (se puede falsificar), así que nunca se usa: con `trustProxyHops` = N
 * se toma el valor que agregó el N-ésimo proxy de confianza contando desde el final; con 0 (o
 * si la cabecera trae menos valores que proxies) se usa la IP del socket.
 */
export function clientIp(c: Context, trustProxyHops = 0): string {
  if (trustProxyHops > 0) {
    const chain = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const trusted = chain[chain.length - trustProxyHops]
    if (trusted && trusted.length <= 64) return trusted
  }
  return socketIp(c)
}

function writeCookie(c: Context, deps: AppDeps, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: deps.config.secureCookies,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export async function createSession(c: Context, deps: AppDeps, userId: string, orgId: string): Promise<void> {
  const token = randomToken()
  const now = deps.now()
  await deps.db.insert(sessions).values({
    id: newId(),
    tokenHash: sha256(token),
    userId,
    orgId,
    userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
    ip: clientIp(c, deps.config.trustProxyHops),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY),
  })
  await deps.db.update(users).set({ lastOrgId: orgId, lastLoginAt: now }).where(eq(users.id, userId))
  writeCookie(c, deps, token)
}

/** Lee la cookie y resuelve la sesión (o undefined). Renueva la expiración deslizante. */
export async function resolveSession(c: Context, deps: AppDeps): Promise<AuthContext | undefined> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return undefined
  const now = deps.now()
  const [row] = await deps.db
    .select({ session: sessions, user: users, org: orgs, role: memberships.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(orgs, eq(orgs.id, sessions.orgId))
    .innerJoin(memberships, and(eq(memberships.orgId, sessions.orgId), eq(memberships.userId, sessions.userId)))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, now)))
    .limit(1)
  if (!row) return undefined
  if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await deps.db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY) })
      .where(eq(sessions.id, row.session.id))
    writeCookie(c, deps, token)
  }
  return { sessionId: row.session.id, user: row.user, org: row.org, role: row.role }
}

export async function destroySession(c: Context, deps: AppDeps): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await deps.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)))
  clearSessionCookie(c)
}

export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    // Idioma elegido por la persona (v5); sin elegir, la web usa el navegador o el de la empresa.
    ...(isLocale(row.locale) ? { locale: row.locale } : {}),
    createdAt: row.createdAt.toISOString(),
  }
}

export function toOrg(row: typeof orgs.$inferSelect): Org {
  const optional = {
    legalName: row.legalName,
    rut: row.rut,
    address: row.address,
    city: row.city,
    phone: row.phone,
    email: row.email,
    website: row.website,
    logo: row.logo,
    accent: row.accent,
  }
  const out: Org = { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() }
  for (const [key, value] of Object.entries(optional)) if (value) (out as unknown as Record<string, string>)[key] = value
  // Idioma de los documentos y moneda (v5).
  if (isLocale(row.locale)) out.locale = row.locale
  if (row.currency) out.currency = row.currency
  return out
}

/** La tarjeta (marca y últimos 4) y el saldo a favor son del dueño; el resto del equipo ve el plan. */
export function billingForRole(state: BillingStateDetail, role: Role): BillingStateDetail {
  if (role === 'owner') return state
  const { card: _card, ...rest } = state
  void _card
  return { ...rest, creditBalance: 0 }
}

export async function buildMe(deps: AppDeps, auth: Pick<AuthContext, 'user' | 'org' | 'role'>): Promise<Me> {
  const [{ members }] = await deps.db.select({ members: count() }).from(memberships).where(eq(memberships.orgId, auth.org.id))
  const [{ pending }] = await deps.db
    .select({ pending: count() })
    .from(invitations)
    .where(
      and(
        eq(invitations.orgId, auth.org.id),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, deps.now()),
      ),
    )
  return {
    user: toUser(auth.user),
    org: toOrg(auth.org),
    role: auth.role as Role,
    // Estado detallado: modo lectura (prueba, plan o pago atrasado), cancelación, saldo y créditos.
    billing: billingForRole(await billingFor(deps).state(auth.org.id), auth.role),
    solo: Number(members) <= 1 && Number(pending) === 0,
    onboarded: Boolean(auth.org.onboardedAt),
  }
}
