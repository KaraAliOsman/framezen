import { Hono } from 'hono'
import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { AppDeps, AppEnv } from '../context'
import { memberships, orgs, passwordResets, sessions, users } from '../db/schema'
import { dummyPasswordHash, hashPassword, newId, randomToken, sha256, verifyPassword } from '../lib/crypto'
import { HttpError, badRequest, conflict, isUniqueViolation, unauthorized } from '../lib/errors'
import { readBody } from '../lib/http'
import { sendInBackground } from '../lib/mail'
import { headerLocale } from '../lib/i18n/locale'
import { mailLocale, passwordResetMail } from '../services/mail'
import { emailSchema, nameSchema, passwordSchema } from '../lib/schemas'
import { logActivity } from '../services/activity'
import { createOrgWithOwner } from '../services/orgs'
import { buildMe, clientIp, createSession, destroySession } from '../services/session'

const RESET_TTL_MS = 60 * 60_000

const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  company: z.string({ error: 'Falta el nombre de tu empresa.' }).trim().min(1, 'Escribe el nombre de tu empresa o taller.').max(120, 'El nombre de la empresa es demasiado largo.'),
})

const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Falta la contraseña.' }).min(1, 'Escribe tu contraseña.').max(200),
})

function tooMany(seconds: number): HttpError {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return new HttpError(429, 'too_many_attempts', `Demasiados intentos. Espera ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} y vuelve a intentarlo.`)
}

export function authRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  app.post('/signup', async (c) => {
    // Antes de mirar si el correo existe: sin límite, el signup sirve para enumerar cuentas y
    // para crear cuentas en serie (spam desde nuestro dominio, créditos de IA).
    const waitSignup = deps.limits.signup.hit(clientIp(c, deps.config.trustProxyHops))
    if (waitSignup) throw tooMany(waitSignup)
    const body = await readBody(c, signupSchema)
    const [existing] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1)
    if (existing) throw conflict('email_taken', 'Ya existe una cuenta con este correo. Entra con tu contraseña o recupérala si no la recuerdas.')
    const userId = newId()
    try {
      const { orgId } = await createOrgWithOwner(deps, {
        user: { id: userId, name: body.name, email: body.email, passwordHash: await hashPassword(body.password) },
        company: body.company,
      })
      await createSession(c, deps, userId, orgId)
      await logActivity(deps.db, {
        orgId,
        actor: { userId, name: body.name },
        kind: 'org.created',
        text: `${body.name} creó la cuenta de ${body.company}. ¡Bienvenido a DEKOPEN!`,
        subject: { type: 'org', id: orgId },
      })
      const auth = await loadAuth(deps, userId, orgId)
      return c.json(await buildMe(deps, auth), 201)
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('email_taken', 'Ya existe una cuenta con este correo. Entra con tu contraseña o recupérala si no la recuerdas.')
      throw error
    }
  })

  app.post('/login', async (c) => {
    const body = await readBody(c, loginSchema)
    const ip = clientIp(c, deps.config.trustProxyHops)
    const key = `${body.email}|${ip}`
    const waitIp = deps.limits.loginIp.hit(ip)
    if (waitIp) throw tooMany(waitIp)
    const blocked = Math.max(deps.limits.login.blocked(key), deps.limits.loginAccount.blocked(body.email))
    if (blocked) throw tooMany(blocked)

    const [user] = await deps.db.select().from(users).where(eq(users.email, body.email)).limit(1)
    const ok = await verifyPassword(body.password, user?.passwordHash ?? (await dummyPasswordHash()))
    if (!user || !ok) {
      // Por cuenta (sin IP) con espera creciente: cambiar X-Forwarded-For o de IP no da más intentos.
      const wait = Math.max(deps.limits.login.hit(key), deps.limits.loginAccount.fail(body.email))
      if (wait) throw tooMany(wait)
      throw new HttpError(401, 'invalid_credentials', 'El correo o la contraseña no coinciden. Revisa e intenta de nuevo.')
    }
    deps.limits.login.reset(key)
    deps.limits.loginAccount.reset(body.email)
    const orgId = await pickOrg(deps, user.id, user.lastOrgId)
    if (!orgId) throw new HttpError(403, 'no_org', 'Tu usuario ya no pertenece a ninguna empresa en DEKOPEN. Pide una invitación nueva al dueño de la cuenta.')
    await createSession(c, deps, user.id, orgId)
    return c.json(await buildMe(deps, await loadAuth(deps, user.id, orgId)))
  })

  app.post('/logout', async (c) => {
    await destroySession(c, deps)
    return c.json({ ok: true })
  })

  app.post('/forgot', async (c) => {
    const { email } = await readBody(c, z.object({ email: emailSchema }))
    const wait = deps.limits.forgot.hit(email)
    // Respuesta idéntica exista o no el correo (no revelamos quién tiene cuenta).
    const response = { ok: true, message: 'Si el correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.' }
    if (wait) return c.json(response)
    const [user] = await deps.db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) return c.json(response)
    const token = randomToken()
    const now = deps.now()
    await deps.db.insert(passwordResets).values({ id: newId(), userId: user.id, tokenHash: sha256(token), createdAt: now, expiresAt: new Date(now.getTime() + RESET_TTL_MS) })
    // La web abre «Contraseña nueva» en /restablecer/:token (/recuperar es la pantalla que pide el correo).
    const url = `${deps.config.appUrl}/restablecer/${encodeURIComponent(token)}`
    // En el idioma de la persona (o el que pide su navegador): services/mail.
    const locale = mailLocale(user.locale, headerLocale(c.req.header('accept-language')))
    const mail = passwordResetMail(locale, { firstName: user.name.split(' ')[0] || user.name, url })
    // Sin esperar al proveedor: si la respuesta tardara solo cuando la cuenta existe, el tiempo
    // delataría qué correos tienen cuenta.
    sendInBackground(deps.mailer, deps.logger, { to: user.email, ...mail }, 'el correo de recuperación')
    return c.json(response)
  })

  app.post('/reset', async (c) => {
    const body = await readBody(c, z.object({ token: z.string({ error: 'Falta el enlace de recuperación.' }).min(10, 'El enlace de recuperación no es válido.'), password: passwordSchema }))
    const now = deps.now()
    const invalid = () => badRequest('Este enlace ya se usó o venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?».', 'token', 'invalid_token')
    const tokenHash = sha256(body.token)
    const [pending] = await deps.db
      .select({ id: passwordResets.id })
      .from(passwordResets)
      .where(and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
      .limit(1)
    if (!pending) throw invalid()
    const passwordHash = await hashPassword(body.password)
    // Canje atómico: de dos envíos simultáneos con el mismo enlace, solo uno toma el token.
    const [reset] = await deps.db
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
      .returning({ id: passwordResets.id, userId: passwordResets.userId })
    if (!reset) throw invalid()
    // Los demás enlaces pendientes de esa persona dejan de servir (un correo viejo reenviado o
    // visto por otro ya no puede volver a cambiar la contraseña).
    await deps.db
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.userId, reset.userId), isNull(passwordResets.usedAt)))
    await deps.db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, reset.userId))
    // Cierra las demás sesiones: si alguien más tenía acceso, lo pierde.
    await deps.db.delete(sessions).where(eq(sessions.userId, reset.userId))
    const [user] = await deps.db.select().from(users).where(eq(users.id, reset.userId)).limit(1)
    // Con la contraseña nueva, el bloqueo por intentos fallidos de esa cuenta ya no corre.
    if (user) deps.limits.loginAccount.reset(user.email)
    const orgId = await pickOrg(deps, reset.userId, user?.lastOrgId ?? null)
    if (!user || !orgId) throw unauthorized('Tu contraseña quedó cambiada, pero no encontramos tu empresa. Entra de nuevo.')
    await createSession(c, deps, user.id, orgId)
    return c.json(await buildMe(deps, await loadAuth(deps, user.id, orgId)))
  })

  return app
}

/** La última empresa usada si sigue siendo miembro; si no, la más antigua. */
export async function pickOrg(deps: AppDeps, userId: string, preferred: string | null): Promise<string | undefined> {
  const rows = await deps.db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt))
  if (preferred && rows.some((r) => r.orgId === preferred)) return preferred
  return rows[0]?.orgId
}

export async function loadAuth(deps: AppDeps, userId: string, orgId: string) {
  const [row] = await deps.db
    .select({ user: users, org: orgs, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(orgs, eq(orgs.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1)
  if (!row) throw unauthorized()
  return row
}
