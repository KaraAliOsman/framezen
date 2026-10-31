import { Hono } from 'hono'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AppDeps, AppEnv } from '../context'
import { memberships, orgs, sessions, users } from '../db/schema'
import { badRequest, forbidden } from '../lib/errors'
import { readBody } from '../lib/http'
import { hexColor, optionalText } from '../lib/schemas'
import { formatRut } from '../lib/rut'
import { requireManager, requireWritable } from '../middleware/auth'
import { buildMe, toOrg } from '../services/session'
import { loadAuth } from './auth'

export const MAX_LOGO_BYTES = 1024 * 1024

/** Bytes reales de un data URL (base64 o texto). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const meta = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (meta.endsWith(';base64')) return Math.floor((payload.replace(/=+$/, '').length * 3) / 4)
  try {
    return Buffer.byteLength(decodeURIComponent(payload))
  } catch {
    return Buffer.byteLength(payload)
  }
}

const logoSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|svg\+xml|webp)(;[^,]*)?,/, 'El logo debe ser una imagen PNG, JPG, WEBP o SVG.')
  .refine((v) => dataUrlBytes(v) <= MAX_LOGO_BYTES, 'El logo pesa más de 1 MB. Prueba con una versión más liviana (PNG o SVG).')
  .nullish()
  .transform((v) => (v === undefined ? undefined : v))

const orgPatchSchema = z.object({
  name: z.string().trim().min(1, 'El nombre de la empresa no puede quedar vacío.').max(120).optional(),
  legalName: optionalText(160),
  rut: optionalText(20).transform((v) => (v ? formatRut(v) : v)),
  address: optionalText(200),
  city: optionalText(80),
  phone: optionalText(40),
  email: optionalText(254),
  website: optionalText(200),
  logo: logoSchema.optional(),
  accent: hexColor.nullish(),
  /** Marca la puesta a punto como terminada (o saltada). */
  onboarded: z.boolean().optional(),
})

export function orgRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  app.get('/', (c) => c.json(toOrg(c.get('auth').org)))

  app.patch('/', requireWritable(deps), requireManager(deps), async (c) => {
    const body = await readBody(c, orgPatchSchema)
    const { org } = c.get('auth')
    const patch: Partial<typeof orgs.$inferInsert> = { updatedAt: deps.now() }
    for (const key of ['name', 'legalName', 'rut', 'address', 'city', 'phone', 'email', 'website', 'logo', 'accent'] as const) {
      if (key in body && body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key]
    }
    if (body.onboarded !== undefined) patch.onboardedAt = body.onboarded ? (org.onboardedAt ?? deps.now()) : null
    const [row] = await deps.db.update(orgs).set(patch).where(eq(orgs.id, org.id)).returning()
    return c.json(toOrg(row!))
  })

  return app
}

/** /api/me: sesión actual y cambio de empresa para quien pertenece a varias. */
export function meRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  app.get('/', async (c) => c.json(await buildMe(deps, c.get('auth'))))

  app.get('/orgs', async (c) => {
    const { user, org } = c.get('auth')
    const rows = await deps.db
      .select({ id: orgs.id, name: orgs.name, logo: orgs.logo, role: memberships.role })
      .from(memberships)
      .innerJoin(orgs, eq(orgs.id, memberships.orgId))
      .where(eq(memberships.userId, user.id))
      .orderBy(asc(orgs.name))
    return c.json({ items: rows.map((r) => ({ ...r, logo: r.logo ?? undefined, current: r.id === org.id })), total: rows.length })
  })

  app.post('/org', async (c) => {
    const { orgId } = await readBody(c, z.object({ orgId: z.string().min(1, 'Elige una empresa.') }))
    const { user, sessionId } = c.get('auth')
    const [member] = await deps.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.orgId, orgId)))
      .limit(1)
    if (!member) throw forbidden('No perteneces a esa empresa.')
    await deps.db.update(sessions).set({ orgId }).where(eq(sessions.id, sessionId))
    await deps.db.update(users).set({ lastOrgId: orgId }).where(eq(users.id, user.id))
    return c.json(await buildMe(deps, await loadAuth(deps, user.id, orgId)))
  })

  app.patch('/', async (c) => {
    const body = await readBody(c, z.object({ name: z.string().trim().min(1, 'Tu nombre no puede quedar vacío.').max(120) }))
    const { user, org, role } = c.get('auth')
    if (!body.name) throw badRequest('Escribe tu nombre.', 'name')
    const [row] = await deps.db.update(users).set({ name: body.name, updatedAt: deps.now() }).where(eq(users.id, user.id)).returning()
    return c.json(await buildMe(deps, { user: row!, org, role }))
  })

  return app
}
