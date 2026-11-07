import { Hono } from 'hono'
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { includedLineIds } from '@dekopen/engine'
import type { Paged, QuoteItem, Station, WorkOrder } from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import type { Db } from '../db/client'
import { quotes, workOrders } from '../db/schema'
import { newId } from '../lib/crypto'
import { badRequest, notFound } from '../lib/errors'
import { pageParams, readBody } from '../lib/http'
import { stationSchema } from '../lib/schemas'
import { canCreateWorkOrders, canUpdateWorkOrders, redactQuote, requirePermission, viewerFor } from '../services/access'
import { firstName, logActivity } from '../services/activity'
import { acceptedTotalOf, findClient, findQuote, quoteLabel, toClient, toQuote, allocateWorkOrderNumber } from '../services/quotes'
import { requireWritable } from '../middleware/auth'

type WorkOrderRow = typeof workOrders.$inferSelect
type WorkOrderStatus = WorkOrder['status']

export function toWorkOrder(row: WorkOrderRow): WorkOrder {
  return {
    id: row.id,
    number: row.number,
    quoteId: row.quoteId,
    quoteNumber: row.quoteNumber,
    title: row.title,
    ...(row.clientName ? { clientName: row.clientName } : {}),
    status: row.status,
    progress: row.progress,
    ...(row.dueDate ? { dueDate: row.dueDate } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const DONE: Station[] = ['ready', 'installed']

type StationItem = Pick<QuoteItem, 'ref' | 'qty'> & Partial<Pick<QuoteItem, 'id' | 'role' | 'altGroup' | 'included'>>

/** Lo que va a producción: un opcional sin marcar o una alternativa descartada no se fabrica. */
export function fabricatedItems<T extends StationItem>(items: readonly T[]): T[] {
  const counted = includedLineIds(items.map((item) => ({ ...item, id: item.id ?? item.ref })))
  return items.filter((item) => counted.has(item.id ?? item.ref))
}

/**
 * Estación de cada ventana que hoy tiene la cotización (las de cantidad 0 no se fabrican). Una
 * ventana sin avance registrado (agregada o renombrada después de abrir la OT) cuenta como «corte»:
 * la OT no puede quedar terminada ni la cotización instalada con ventanas sin fabricar.
 */
export function stationsOf(progress: Record<string, Station>, items: StationItem[] | undefined): Station[] {
  const current = fabricatedItems(items ?? []).filter((item) => item.qty > 0)
  if (!current.length) return Object.values(progress)
  return current.map((item) => progress[item.ref] ?? 'cut')
}

/** Estado según el avance: todo listo = terminada; algo avanzado = en curso. */
export function statusFromProgress(progress: Record<string, Station>, items?: StationItem[]): WorkOrderStatus {
  const stations = items ? stationsOf(progress, items) : Object.values(progress)
  if (stations.length && stations.every((s) => DONE.includes(s))) return 'done'
  if (stations.some((s) => s !== 'cut')) return 'in_progress'
  return 'open'
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'La fecha debe tener el formato AAAA-MM-DD.')
  .nullish()

const createSchema = z.object({
  quoteId: z.string({ error: 'Falta la cotización que pasa a taller.' }).min(1),
  dueDate: dateSchema,
  notes: z.string().max(4000).nullish(),
})

const patchSchema = z.object({
  progress: z.record(z.string().max(40), stationSchema).optional(),
  status: z.enum(['open', 'in_progress', 'done'], { error: 'El estado de la OT debe ser abierta, en curso o terminada.' }).optional(),
  notes: z.string().max(4000).nullish(),
  dueDate: dateSchema,
})

export function workOrderRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const writable = requireWritable(deps)

  /** «Pasar a taller»: crea la OT desde la cotización (si ya existe, devuelve la misma). */
  app.post('/', requirePermission(deps, canCreateWorkOrders, 'Tu rol no permite pasar cotizaciones a taller. Pídeselo al dueño, a un cotizador o al jefe de taller.'), writable, async (c) => {
    const body = await readBody(c, createSchema)
    const { org, user } = c.get('auth')
    const found = await findQuote(deps.db, org.id, body.quoteId)
    if (!found) throw notFound('No encontramos esa cotización. Puede que la hayan eliminado.')
    const client = await findClient(deps.db, org.id, found.clientId)
    // Buscar la OT existente y crearla va en una transacción con la cotización bloqueada: dos
    // «Pasar a taller» a la vez (doble clic, dos pestañas, Marco y el botón) crean UNA sola OT.
    const result = await deps.db.transaction(async (raw) => {
      const tx = raw as unknown as Db
      const [quote] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, found.id), eq(quotes.orgId, org.id), isNull(quotes.deletedAt)))
        .for('update')
      if (!quote) throw notFound('No encontramos esa cotización. Puede que la hayan eliminado.')
      const [existing] = await tx
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.orgId, org.id), eq(workOrders.quoteId, quote.id)))
        .limit(1)
      if (existing) return { existing }
      const number = await allocateWorkOrderNumber(tx, org.id)
      const progress: Record<string, Station> = {}
      for (const item of fabricatedItems(quote.data.items)) progress[item.ref] = 'cut'
      const now = deps.now()
      const [row] = await tx
        .insert(workOrders)
        .values({
          id: newId(),
          orgId: org.id,
          number,
          quoteId: quote.id,
          quoteNumber: quote.number,
          title: quote.title,
          clientName: client?.name ?? null,
          status: 'open',
          progress,
          dueDate: body.dueDate ?? null,
          notes: body.notes ?? null,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      // Pasar a taller implica que la venta está cerrada (con lo enviado como total vendido).
      await tx
        .update(quotes)
        .set({
          status: 'workshop',
          ...(quote.acceptedAt ? {} : { acceptedAt: now }),
          ...(quote.acceptedTotal === null ? { acceptedTotal: acceptedTotalOf(quote) } : {}),
          version: sql`${quotes.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(quotes.id, quote.id), eq(quotes.orgId, org.id)))
      return { created: row!, quote }
    })
    if ('existing' in result && result.existing) return c.json({ ...toWorkOrder(result.existing), existing: true }, 200)
    const { created: row, quote } = result as { created: WorkOrderRow; quote: typeof found }
    const { id, number } = row
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'workorder.created',
      text: `${firstName(user.name)} pasó ${quoteLabel(quote.number)} a taller (OT N° ${number})`,
      link: `/taller/${id}`,
      subject: { type: 'work_order', id },
      meta: { quoteId: quote.id },
    })
    return c.json(toWorkOrder(row), 201)
  })

  app.get('/', async (c) => {
    const orgId = c.get('auth').org.id
    const { limit, offset } = pageParams(c)
    const conditions: SQL[] = [eq(workOrders.orgId, orgId)]
    const statuses = (c.req.query('status') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is WorkOrderStatus => s === 'open' || s === 'in_progress' || s === 'done')
    if (statuses.length) conditions.push(inArray(workOrders.status, statuses))
    const quoteId = c.req.query('quoteId')
    if (quoteId) conditions.push(eq(workOrders.quoteId, quoteId))
    const where = and(...conditions)
    const rows = await deps.db.select().from(workOrders).where(where).orderBy(desc(workOrders.number)).limit(limit).offset(offset)
    const [{ total }] = await deps.db.select({ total: count() }).from(workOrders).where(where)
    const body: Paged<WorkOrder> = { items: rows.map(toWorkOrder), total: Number(total) }
    return c.json(body)
  })

  /** La OT con su cotización (los documentos de taller se calculan al vuelo con el motor). */
  app.get('/:id', async (c) => {
    const orgId = c.get('auth').org.id
    const [row] = await deps.db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, c.req.param('id')), eq(workOrders.orgId, orgId)))
      .limit(1)
    if (!row) throw notFound('No encontramos esa OT.')
    const quote = await findQuote(deps.db, orgId, row.quoteId, { includeDeleted: true })
    const client = quote ? await findClient(deps.db, orgId, quote.clientId) : undefined
    const viewer = await viewerFor(c, deps)
    return c.json({ ...toWorkOrder(row), ...(quote ? { quote: redactQuote(toQuote(quote, client ? toClient(client) : null), viewer) } : {}) })
  })

  app.patch('/:id', requirePermission(deps, canUpdateWorkOrders, 'Tu rol no permite cambiar el avance de las OT. Pídeselo al dueño o al jefe de taller.'), writable, async (c) => {
    const body = await readBody(c, patchSchema)
    const { org, user } = c.get('auth')
    const [current] = await deps.db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, c.req.param('id')), eq(workOrders.orgId, org.id)))
      .limit(1)
    if (!current) throw notFound('No encontramos esa OT.')
    // El avance se cuenta contra las ventanas que la cotización tiene HOY (puede haber cambiado
    // después de abrir la OT): una ventana nueva o renombrada sin avance sigue en «corte».
    const quote = await findQuote(deps.db, org.id, current.quoteId, { includeDeleted: true })
    const items = quote?.data.items
    if (body.progress && items?.length) {
      const refs = new Set(items.map((item) => item.ref))
      const unknown = Object.keys(body.progress).filter((ref) => !refs.has(ref))
      if (unknown.length) {
        throw badRequest(`La cotización ya no tiene ${unknown.length === 1 ? `la ventana ${unknown[0]}` : `las ventanas ${unknown.slice(0, 5).join(', ')}`}. Recarga la OT para ver sus ventanas actuales.`, 'progress', 'unknown_item')
      }
    }
    const progress = body.progress ? { ...current.progress, ...body.progress } : current.progress
    const status = body.status ?? (body.progress ? statusFromProgress(progress, items) : current.status)
    const [row] = await deps.db
      .update(workOrders)
      .set({
        progress,
        status,
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate || null } : {}),
        updatedAt: deps.now(),
      })
      .where(eq(workOrders.id, current.id))
      .returning()
    // Todas las ventanas actuales instaladas: la cotización también queda instalada.
    const values = stationsOf(progress, items)
    if (values.length && values.every((s) => s === 'installed')) {
      await deps.db
        .update(quotes)
        .set({ status: 'installed', version: sql`${quotes.version} + 1`, updatedAt: deps.now() })
        .where(and(eq(quotes.id, current.quoteId), eq(quotes.orgId, org.id), eq(quotes.status, 'workshop')))
    }
    if (status !== current.status && status === 'done') {
      await logActivity(deps.db, {
        orgId: org.id,
        actor: { userId: user.id, name: user.name },
        kind: 'workorder.done',
        text: `La OT N° ${current.number} quedó lista${current.clientName ? ` (${current.clientName})` : ''}`,
        link: `/taller/${current.id}`,
        subject: { type: 'work_order', id: current.id },
      })
    }
    return c.json(toWorkOrder(row!))
  })

  return app
}
