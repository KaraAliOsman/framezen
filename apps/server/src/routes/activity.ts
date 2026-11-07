import { Hono } from 'hono'
import { and, count, desc, eq, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { ActivityEvent, Paged } from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { activity } from '../db/schema'
import { notFound } from '../lib/errors'
import { pageParams, readBody } from '../lib/http'
import { toActivityEvent } from '../services/activity'

export function activityRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  /** ?subjectId=<cotización|cliente|OT>&pending=1&kind=quote.accepted */
  app.get('/', async (c) => {
    const orgId = c.get('auth').org.id
    const { limit, offset } = pageParams(c, { limit: 30 })
    const conditions: SQL[] = [eq(activity.orgId, orgId)]
    const subjectId = c.req.query('subjectId')
    if (subjectId) conditions.push(eq(activity.subjectId, subjectId))
    if (c.req.query('pending') === '1' || c.req.query('pending') === 'true') conditions.push(eq(activity.pending, true))
    const kind = c.req.query('kind')
    if (kind) conditions.push(eq(activity.kind, kind))
    const where = and(...conditions)
    const rows = await deps.db.select().from(activity).where(where).orderBy(desc(activity.createdAt)).limit(limit).offset(offset)
    const [{ total }] = await deps.db.select({ total: count() }).from(activity).where(where)
    const body: Paged<ActivityEvent> = { items: rows.map(toActivityEvent), total: Number(total) }
    return c.json(body)
  })

  /** Marcar un aviso como atendido (p. ej. «pidió cambios» ya respondido). */
  app.patch('/:id', async (c) => {
    const { pending } = await readBody(c, z.object({ pending: z.boolean() }))
    const [row] = await deps.db
      .update(activity)
      .set({ pending })
      .where(and(eq(activity.id, c.req.param('id')), eq(activity.orgId, c.get('auth').org.id)))
      .returning()
    if (!row) throw notFound('No encontramos ese aviso.')
    return c.json(toActivityEvent(row))
  })

  return app
}
