import { Hono } from 'hono'
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { PLANS, ROLE_COPY, planSeats, type InvitationInfo, type InviteResponse, type PendingInvitation, type Role, type TeamMember, type TeamResponse } from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import type { Db } from '../db/client'
import { invitations, memberships, orgs, sessions, subscriptions, users } from '../db/schema'
import { hashPassword, newId, randomToken, sha256 } from '../lib/crypto'
import { HttpError, badRequest, conflict, isUniqueViolation, notFound } from '../lib/errors'
import { readBody } from '../lib/http'
import { emailSchema, nameSchema, passwordSchema, roleSchema } from '../lib/schemas'
import { requireOwner, requireWritable } from '../middleware/auth'
import { firstName, logActivity } from '../services/activity'
import { mailQuotaError, takeMailQuota } from '../services/outbound'
import { buildMe, clientIp, createSession, resolveSession } from '../services/session'
import { invitationMail, mailLocale } from '../services/mail'
import { loadAuth } from './auth'

const INVITE_TTL_MS = 7 * 86_400_000

const emailTaken = () => conflict('email_taken', 'Ya tienes una cuenta con este correo. Entra con tu contraseña y vuelve a abrir el enlace de invitación.')

// Tipos del contrato (antes definidos aquí).
export type { PendingInvitation, TeamMember, TeamResponse }

async function ownersCount(deps: AppDeps, orgId: string): Promise<number> {
  const [{ n }] = await deps.db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner')))
  return Number(n)
}

export function teamRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  app.get('/', async (c) => {
    const { org, user } = c.get('auth')
    const members = await deps.db
      .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, org.id))
      .orderBy(asc(memberships.createdAt))
    const pending = await deps.db
      .select()
      .from(invitations)
      .where(and(eq(invitations.orgId, org.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, deps.now())))
      .orderBy(asc(invitations.createdAt))
    const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, org.id)).limit(1)
    const body: TeamResponse = {
      members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString(), isYou: m.userId === user.id })),
      invitations: pending.map((i) => ({
        id: i.id,
        ...(i.email ? { email: i.email } : {}),
        role: i.role,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      })),
      seats: planSeats(sub?.plan ?? 'trial'),
      seatsUsed: members.length,
    }
    return c.json(body)
  })

  /** Invitar: devuelve un enlace para compartir (y lo envía por correo si se indicó uno). */
  app.post('/invite', requireWritable(deps), requireOwner(), async (c) => {
    const body = await readBody(c, z.object({ email: emailSchema.optional().or(z.literal('').transform(() => undefined)), role: roleSchema.default('estimator') }))
    const { org, user } = c.get('auth')
    const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, org.id)).limit(1)
    const plan = sub?.plan ?? 'trial'
    const seats = planSeats(plan)
    if (seats !== null) {
      const [{ used }] = await deps.db.select({ used: count() }).from(memberships).where(eq(memberships.orgId, org.id))
      const [{ open }] = await deps.db
        .select({ open: count() })
        .from(invitations)
        .where(and(eq(invitations.orgId, org.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, deps.now())))
      if (Number(used) + Number(open) >= seats) {
        const planName = plan === 'trial' ? 'La prueba' : `Tu plan ${PLANS[plan].name}`
        throw new HttpError(
          402,
          'seat_limit',
          `${planName} incluye ${seats} ${seats === 1 ? 'persona' : 'personas'} y ya están todas ocupadas (contando invitaciones pendientes). Con Empresa puedes sumar a todo tu equipo.`,
        )
      }
    }
    if (body.email) {
      const [already] = await deps.db
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.orgId, org.id), eq(users.email, body.email)))
        .limit(1)
      if (already) throw conflict('already_member', `${body.email} ya es parte de tu equipo.`)
      // El correo sale desde nuestro dominio con el nombre de la empresa: tope diario por organización.
      if (!(await takeMailQuota(deps, org.id))) throw mailQuotaError()
    }
    const token = randomToken()
    const now = deps.now()
    const row = {
      id: newId(),
      orgId: org.id,
      email: body.email ?? null,
      role: body.role,
      tokenHash: sha256(token),
      invitedBy: user.id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    }
    await deps.db.insert(invitations).values(row)
    const link = `${deps.config.appUrl}/invitacion/${token}`
    if (body.email) {
      try {
        // Quien recibe aún no tiene cuenta: va en el idioma de la empresa (services/mail).
        await deps.mailer.send({ to: body.email, ...invitationMail(mailLocale(org.locale), { inviterName: user.name, orgName: org.name, role: body.role, link }) })
      } catch (error) {
        deps.logger.warn('No se pudo enviar el correo de invitación; el enlace igual sirve.', error)
      }
    }
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'team.invited',
      text: body.email ? `${firstName(user.name)} invitó a ${body.email} al equipo` : `${firstName(user.name)} creó un enlace de invitación al equipo`,
      link: '/ajustes/equipo',
      subject: { type: 'team', id: row.id },
    })
    const response: InviteResponse = {
      invitation: { id: row.id, ...(row.email ? { email: row.email } : {}), role: row.role, createdAt: now.toISOString(), expiresAt: row.expiresAt.toISOString() },
      link,
    }
    return c.json(response, 201)
  })

  app.delete('/invitations/:id', requireOwner(), async (c) => {
    const { org } = c.get('auth')
    const [row] = await deps.db
      .update(invitations)
      .set({ revokedAt: deps.now() })
      .where(and(eq(invitations.id, c.req.param('id')), eq(invitations.orgId, org.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id })
    if (!row) throw notFound('Esa invitación ya no existe o ya fue aceptada.')
    return c.json({ ok: true })
  })

  app.patch('/:userId', requireOwner(), async (c) => {
    const { role } = await readBody(c, z.object({ role: roleSchema }))
    const { org } = c.get('auth')
    const userId = c.req.param('userId')
    const [member] = await deps.db.select().from(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, userId))).limit(1)
    if (!member) throw notFound('Esa persona no está en tu equipo.')
    if (member.role === 'owner' && role !== 'owner' && (await ownersCount(deps, org.id)) <= 1)
      throw badRequest('Tu empresa necesita al menos un dueño. Nombra a otra persona como dueña antes de cambiar este rol.', 'role', 'last_owner')
    await deps.db.update(memberships).set({ role }).where(eq(memberships.id, member.id))
    return c.json({ ok: true, role })
  })

  app.delete('/:userId', requireOwner(), async (c) => {
    const { org, user } = c.get('auth')
    const userId = c.req.param('userId')
    const [member] = await deps.db
      .select({ id: memberships.id, role: memberships.role, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, userId)))
      .limit(1)
    if (!member) throw notFound('Esa persona no está en tu equipo.')
    if (member.role === 'owner' && (await ownersCount(deps, org.id)) <= 1)
      throw badRequest('No puedes quitar al único dueño de la empresa.', undefined, 'last_owner')
    await deps.db.delete(memberships).where(eq(memberships.id, member.id))
    await deps.db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.orgId, org.id)))
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'team.removed',
      text: `${firstName(user.name)} quitó a ${member.name} del equipo`,
      link: '/ajustes/equipo',
    })
    return c.json({ ok: true })
  })

  return app
}

/** /api/invitations/:token — público: ver la invitación y aceptarla (con o sin cuenta). */
export function invitationRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  async function findInvitation(token: string) {
    const [row] = await deps.db
      .select({ invitation: invitations, orgName: orgs.name, inviter: users.name })
      .from(invitations)
      .innerJoin(orgs, eq(orgs.id, invitations.orgId))
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .where(eq(invitations.tokenHash, sha256(token)))
      .limit(1)
    if (!row) throw notFound('Este enlace de invitación no existe. Pide uno nuevo a quien te invitó.')
    const inv = row.invitation
    if (inv.revokedAt) throw new HttpError(410, 'invitation_revoked', 'Esta invitación fue anulada. Pide una nueva a quien te invitó.')
    if (inv.acceptedAt) throw new HttpError(410, 'invitation_used', 'Esta invitación ya se usó. Si eres tú, entra con tu correo y contraseña.')
    if (inv.expiresAt < deps.now()) throw new HttpError(410, 'invitation_expired', 'Esta invitación venció (duran 7 días). Pide una nueva a quien te invitó.')
    return row
  }

  app.get('/:token', async (c) => {
    const { invitation, orgName, inviter } = await findInvitation(c.req.param('token'))
    const info: InvitationInfo = {
      orgName,
      role: invitation.role,
      roleName: ROLE_COPY[invitation.role].name,
      ...(invitation.email ? { email: invitation.email } : {}),
      ...(inviter ? { invitedBy: inviter } : {}),
      expiresAt: invitation.expiresAt.toISOString(),
    }
    return c.json(info)
  })

  /**
   * Aceptar. Con sesión abierta se suma la empresa a tu cuenta; sin sesión se crea la
   * cuenta con { name, email, password }. Deja la sesión en la empresa nueva.
   */
  app.post('/:token/accept', async (c) => {
    const token = c.req.param('token')
    const current = await resolveSession(c, deps)
    // Aceptar sin sesión crea una cuenta: mismo límite por IP que crear cuenta (también evita
    // usar el 409 «correo con cuenta» para enumerar correos).
    if (!current) {
      const wait = deps.limits.signup.hit(clientIp(c, deps.config.trustProxyHops))
      if (wait) throw new HttpError(429, 'too_many_attempts', 'Recibimos muchos intentos seguidos. Espera un momento y vuelve a intentarlo.')
    }
    const { invitation } = await findInvitation(token)
    const wrongEmail = () =>
      new HttpError(403, 'invitation_email_mismatch', `Esta invitación es para ${invitation.email}. Entra o crea tu cuenta con ese correo para aceptarla.`)
    let userId: string
    let userName: string
    let newUser: typeof users.$inferInsert | undefined
    if (current) {
      if (invitation.email && current.user.email !== invitation.email) throw wrongEmail()
      userId = current.user.id
      userName = current.user.name
    } else {
      const body = await readBody(c, z.object({ name: nameSchema, email: emailSchema, password: passwordSchema }))
      if (invitation.email && body.email !== invitation.email) throw wrongEmail()
      const [existing] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1)
      if (existing) throw emailTaken()
      userId = newId()
      userName = body.name
      newUser = { id: userId, name: body.name, email: body.email, passwordHash: await hashPassword(body.password) }
    }
    const now = deps.now()
    // Todo o nada, y la invitación se toma de forma atómica ANTES de sumar a nadie: de varios
    // «Aceptar» simultáneos con el mismo enlace, solo uno entra; los puestos se vuelven a contar
    // con la suscripción bloqueada, así que tampoco se pasa del plan aceptando varias a la vez.
    try {
      await deps.db.transaction(async (raw) => {
        const tx = raw as unknown as Db
        if (newUser) await tx.insert(users).values(newUser)
        const [claimed] = await tx
          .update(invitations)
          .set({ acceptedAt: now, acceptedBy: userId })
          .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, now)))
          .returning({ id: invitations.id })
        if (!claimed) throw new HttpError(410, 'invitation_used', 'Esta invitación ya se usó. Si eres tú, entra con tu correo y contraseña.')
        const [already] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.orgId, invitation.orgId), eq(memberships.userId, userId)))
          .limit(1)
        // Si ya era miembro, sólo se cambia a esa empresa (sin error: el enlace "funciona").
        if (already) return
        const [sub] = await tx.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, invitation.orgId)).for('update')
        const plan = sub?.plan ?? 'trial'
        const seats = planSeats(plan)
        if (seats !== null) {
          const [{ used }] = await tx.select({ used: count() }).from(memberships).where(eq(memberships.orgId, invitation.orgId))
          if (Number(used) >= seats) {
            throw new HttpError(402, 'seat_limit', `El equipo ya ocupa los ${seats} puestos de su plan. Pide a quien te invitó que libere un puesto o cambie a Empresa.`)
          }
        }
        await tx.insert(memberships).values({ id: newId(), orgId: invitation.orgId, userId, role: invitation.role, createdAt: now })
      })
    } catch (error) {
      if (newUser && isUniqueViolation(error)) throw emailTaken()
      throw error
    }
    if (current) await deps.db.update(sessions).set({ orgId: invitation.orgId }).where(eq(sessions.id, current.sessionId))
    else await createSession(c, deps, userId, invitation.orgId)
    await deps.db.update(users).set({ lastOrgId: invitation.orgId }).where(eq(users.id, userId))
    await logActivity(deps.db, {
      orgId: invitation.orgId,
      actor: { userId, name: userName },
      kind: 'team.joined',
      text: `${userName} se sumó al equipo como ${ROLE_COPY[invitation.role].name.toLowerCase()}`,
      link: '/ajustes/equipo',
    })
    return c.json(await buildMe(deps, await loadAuth(deps, userId, invitation.orgId)))
  })

  return app
}
