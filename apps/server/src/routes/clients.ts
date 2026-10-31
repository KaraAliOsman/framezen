import { Hono } from 'hono'
import { and, asc, count, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { Client, Paged } from '@framezen/shared'
import type { AppDeps, AppEnv } from '../context'
import { clients, quotes } from '../db/schema'
import { newId } from '../lib/crypto'
import { notFound } from '../lib/errors'
import { folded, likePattern, pageParams, readBody } from '../lib/http'
import { optionalText } from '../lib/schemas'
import { formatRut, rutWarning } from '../lib/rut'
import { requireWritable } from '../middleware/auth'
import { firstName, logActivity } from '../services/activity'
import { QUOTE_WRITE_DENIED, canWriteQuotes, requirePermission } from '../services/access'
import { toClient, wonTotalSql } from '../services/quotes'

/** Estados que cuentan como venta cerrada. */
export const WON_STATUSES = ['accepted', 'workshop', 'installed', 'closed'] as const

const clientFields = {
  rut: optionalText(20),
  email: optionalText(254),
  phone: optionalText(40),
  address: optionalText(200),
  city: optionalText(80),
  notes: optionalText(4000),
}

const createSchema = z.object({
  name: z.string({ error: 'Falta el nombre del cliente.' }).trim().min(1, 'Escribe el nombre del cliente.').max(160, 'El nombre es demasiado largo.'),
  ...clientFields,
})

const patchSchema = z.object({
  name: z.string().trim().min(1, 'El nombre del cliente no puede quedar vacío.').max(160).optional(),
  ...clientFields,
})

const aggregates = {
  quotesCount: sql<number>`(count(${quotes.id}) filter (where ${quotes.deletedAt} is null))::int`,
  // Lo aceptado por el cliente (no el documento vivo, que cambia si se edita después de aceptar).
  totalAccepted: sql<number>`coalesce(sum(${wonTotalSql}) filter (where ${quotes.deletedAt} is null and ${quotes.status} in ('accepted', 'workshop', 'installed', 'closed')), 0)::bigint`,
}

export function clientRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  // Con roles activos, los clientes los crean, editan y borran el dueño y el cotizador.
  const writable = [requirePermission(deps, canWriteQuotes, QUOTE_WRITE_DENIED), requireWritable(deps)] as const

  async function loadClient(orgId: string, id: string): Promise<Client> {
    const [row] = await deps.db
      .select({ client: clients, ...aggregates })
      .from(clients)
      .leftJoin(quotes, and(eq(quotes.clientId, clients.id), eq(quotes.orgId, clients.orgId)))
      .where(and(eq(clients.id, id), eq(clients.orgId, orgId), isNull(clients.deletedAt)))
      .groupBy(clients.id)
      .limit(1)
    if (!row) throw notFound('No encontramos ese cliente. Puede que lo hayan eliminado.')
    return toClient(row.client, { quotesCount: Number(row.quotesCount), totalAccepted: Number(row.totalAccepted) })
  }

  app.get('/', async (c) => {
    const orgId = c.get('auth').org.id
    const { limit, offset } = pageParams(c)
    const q = c.req.query('q')?.trim()
    const conditions: SQL[] = [eq(clients.orgId, orgId), isNull(clients.deletedAt)]
    if (q) {
      const digits = q.replace(/[^0-9kK]/g, '')
      conditions.push(
        or(
          folded(clients.name, q),
          folded(clients.email, q),
          folded(clients.phone, q),
          folded(clients.city, q),
          folded(clients.rut, q),
          ...(digits.length >= 3 ? [sql`regexp_replace(coalesce(${clients.rut}, ''), '[^0-9kK]', '', 'g') ilike ${likePattern(digits)}`] : []),
        )!,
      )
    }
    const where = and(...conditions)
    const order = c.req.query('sort') === 'recent' ? [desc(clients.updatedAt)] : [asc(sql`lower(${clients.name})`)]
    const rows = await deps.db
      .select({ client: clients, ...aggregates })
      .from(clients)
      .leftJoin(quotes, and(eq(quotes.clientId, clients.id), eq(quotes.orgId, clients.orgId)))
      .where(where)
      .groupBy(clients.id)
      .orderBy(...order)
      .limit(limit)
      .offset(offset)
    const [{ total }] = await deps.db.select({ total: count() }).from(clients).where(where)
    const body: Paged<Client> = {
      items: rows.map((r) => toClient(r.client, { quotesCount: Number(r.quotesCount), totalAccepted: Number(r.totalAccepted) })),
      total: Number(total),
    }
    return c.json(body)
  })

  app.get('/:id', async (c) => c.json(await loadClient(c.get('auth').org.id, c.req.param('id'))))

  app.post('/', ...writable, async (c) => {
    const body = await readBody(c, createSchema)
    const { org, user } = c.get('auth')
    const now = deps.now()
    const id = newId()
    await deps.db.insert(clients).values({
      id,
      orgId: org.id,
      name: body.name,
      rut: body.rut ? formatRut(body.rut) : null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'client.created',
      text: `${firstName(user.name)} agregó a ${body.name} como cliente`,
      link: `/clientes/${id}`,
      subject: { type: 'client', id },
    })
    const warning = rutWarning(body.rut ?? undefined)
    return c.json({ ...(await loadClient(org.id, id)), ...(warning ? { warnings: [warning] } : {}) }, 201)
  })

  app.patch('/:id', ...writable, async (c) => {
    const body = await readBody(c, patchSchema)
    const orgId = c.get('auth').org.id
    const patch: Partial<typeof clients.$inferInsert> = { updatedAt: deps.now() }
    if (body.name) patch.name = body.name
    for (const key of ['email', 'phone', 'address', 'city', 'notes'] as const) if (body[key] !== undefined) patch[key] = body[key]
    if (body.rut !== undefined) patch.rut = body.rut ? formatRut(body.rut) : null
    const [row] = await deps.db
      .update(clients)
      .set(patch)
      .where(and(eq(clients.id, c.req.param('id')), eq(clients.orgId, orgId), isNull(clients.deletedAt)))
      .returning({ id: clients.id })
    if (!row) throw notFound('No encontramos ese cliente. Puede que lo hayan eliminado.')
    const warning = rutWarning(body.rut ?? undefined)
    return c.json({ ...(await loadClient(orgId, row.id)), ...(warning ? { warnings: [warning] } : {}) })
  })

  /** Eliminar es suave: las cotizaciones conservan el nombre del cliente. */
  app.delete('/:id', ...writable, async (c) => {
    const orgId = c.get('auth').org.id
    const [row] = await deps.db
      .update(clients)
      .set({ deletedAt: deps.now() })
      .where(and(eq(clients.id, c.req.param('id')), eq(clients.orgId, orgId), isNull(clients.deletedAt)))
      .returning({ id: clients.id })
    if (!row) throw notFound('No encontramos ese cliente.')
    return c.json({ ok: true })
  })

  app.post('/:id/restore', ...writable, async (c) => {
    const orgId = c.get('auth').org.id
    const [row] = await deps.db
      .update(clients)
      .set({ deletedAt: null })
      .where(and(eq(clients.id, c.req.param('id')), eq(clients.orgId, orgId)))
      .returning({ id: clients.id })
    if (!row) throw notFound('No encontramos ese cliente.')
    return c.json(await loadClient(orgId, row.id))
  })

  return app
}
