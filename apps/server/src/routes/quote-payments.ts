/**
 * Abonos de una cotización (/api/quotes/:id/payments). DEKOPEN no puede saber si una transferencia
 * llegó: el taller la marca a mano. Equivocarse se deshace borrando el registro, sin confirmaciones.
 */
import { Hono } from 'hono'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { nextDue, PAYMENT_METHODS, paymentPlan, type QuotePaymentsResponse } from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { quotePayments, users } from '../db/schema'
import { newId } from '../lib/crypto'
import { notFound } from '../lib/errors'
import { readBody } from '../lib/http'
import { requireWritable } from '../middleware/auth'
import { QUOTE_WRITE_DENIED, canWriteQuotes, requirePermission } from '../services/access'
import { firstName, logActivity } from '../services/activity'
import { listQuotePayments, sumPayments } from '../services/payments'
import { acceptedTotalOf, findQuote, quoteLabel } from '../services/quotes'
import { getSettings } from '../services/settings'

const paymentSchema = z.object({
  amount: z.number({ error: 'Escribe el monto recibido.' }).int('El monto va en números enteros.').positive('El monto debe ser mayor que cero.').max(1_000_000_000_000),
  method: z.enum(PAYMENT_METHODS, { error: 'Elige cómo te pagaron.' }),
  reference: z.string().trim().max(120, 'La referencia admite hasta 120 caracteres.').optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
})

export function quotePaymentRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const writable = [requirePermission(deps, canWriteQuotes, QUOTE_WRITE_DENIED), requireWritable(deps)] as const

  async function respond(orgId: string, quote: NonNullable<Awaited<ReturnType<typeof findQuote>>>): Promise<QuotePaymentsResponse> {
    const settings = await getSettings(deps.db, orgId)
    const rows = await deps.db.select({ recordedBy: quotePayments.recordedBy }).from(quotePayments).where(and(eq(quotePayments.orgId, orgId), eq(quotePayments.quoteId, quote.id)))
    const ids = [...new Set(rows.flatMap((r) => (r.recordedBy ? [r.recordedBy] : [])))]
    const names = new Map(ids.length ? (await deps.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name]) : [])
    const payments = await listQuotePayments(deps, orgId, quote.id, (id) => names.get(id))
    const plan = paymentPlan(settings.payments?.deposit, quote.acceptedTotal ?? acceptedTotalOf(quote))
    const received = sumPayments(payments)
    return { payments, received, deposit: plan[0]?.amount ?? null, due: plan.length ? nextDue(plan, received) : null }
  }

  app.get('/:id/payments', async (c) => {
    const { org } = c.get('auth')
    const quote = await findQuote(deps.db, org.id, c.req.param('id'))
    if (!quote) throw notFound('No encontramos esa cotización.')
    return c.json(await respond(org.id, quote))
  })

  app.post('/:id/payments', ...writable, async (c) => {
    const body = await readBody(c, paymentSchema)
    const { org, user } = c.get('auth')
    const quote = await findQuote(deps.db, org.id, c.req.param('id'))
    if (!quote) throw notFound('No encontramos esa cotización.')
    const now = deps.now()
    await deps.db.insert(quotePayments).values({
      id: newId(),
      orgId: org.id,
      quoteId: quote.id,
      revision: quote.revision,
      amount: body.amount,
      method: body.method,
      status: 'received',
      ...(body.reference ? { reference: body.reference } : {}),
      paidAt: body.paidAt ? new Date(body.paidAt) : now,
      recordedBy: user.id,
      createdAt: now,
    })
    await logActivity(deps.db, {
      orgId: org.id,
      actor: { userId: user.id, name: user.name },
      kind: 'quote.deposit_received',
      text: `${firstName(user.name)} marcó un abono recibido en ${quoteLabel(quote.number)}`,
      link: `/cotizaciones/${quote.id}`,
      subject: { type: 'quote', id: quote.id },
      meta: { amount: body.amount, method: body.method },
    })
    return c.json(await respond(org.id, quote), 201)
  })

  // Deshacer un abono mal marcado. Lo que confirmó Flow no se borra desde aquí.
  app.delete('/:id/payments/:paymentId', ...writable, async (c) => {
    const { org } = c.get('auth')
    const quote = await findQuote(deps.db, org.id, c.req.param('id'))
    if (!quote) throw notFound('No encontramos esa cotización.')
    const [removed] = await deps.db
      .delete(quotePayments)
      .where(and(eq(quotePayments.id, c.req.param('paymentId')), eq(quotePayments.orgId, org.id), eq(quotePayments.quoteId, quote.id), inArray(quotePayments.method, ['transfer', 'link', 'cash', 'other'])))
      .returning({ id: quotePayments.id })
    if (!removed) throw notFound('Ese abono ya no está.')
    return c.json(await respond(org.id, quote))
  })

  return app
}
