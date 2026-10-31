/**
 * Plan y facturación.
 *
 * Con sesión (/api/billing):
 *   GET  /                    → BillingStateDetail (BillingState + modo lectura, cambio programado, saldo, tarjeta)
 *   GET  /preview?plan&period → qué pasaría al elegir ese plan (cobro de hoy, saldo a favor, desde cuándo rige)
 *   GET  /history             → últimos intentos de pago
 *   POST /checkout {plan, period} → { url | null, billing, message, change? }   (dueño)
 *   POST /cancel              → { billing, message } (cancela al fin del período)  (dueño)
 *   POST /resume              → { billing, message } (deshace la cancelación)      (dueño)
 *
 * Públicas (/api/billing/flow), llamadas por Flow:
 *   POST /confirm             → token → se consulta payment/getStatus firmado; idempotente
 *   GET|POST /return          → vuelve el navegador; verifica y redirige a /ajustes/plan?pago=…
 */
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { PLANS, type BillingHistoryRow, type BillingPreview, type Paged } from '@framezen/shared'
import type { AppDeps, AppEnv } from '../context'
import { badRequest } from '../lib/errors'
import { readBody, readQuery } from '../lib/http'
import { requireOwner } from '../middleware/auth'
import { planGross, prorate } from '../services/billing/plans'
import { billingFor } from '../services/billing/registry'
import type { ReturnResult } from '../services/billing/service'
import { billingForRole } from '../services/session'

const planSchema = z.enum(['taller', 'pro', 'empresa', 'empresa2x'], { error: 'Elige un plan: Taller, Pro, Empresa o Empresa 2×.' })
const periodSchema = z.enum(['monthly', 'yearly'], { error: 'Elige si pagas mes a mes o el año completo.' })

const checkoutSchema = z.object({ plan: planSchema, period: periodSchema.default('monthly') })

export function billingRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  // Cualquiera del equipo ve el plan (modo lectura, créditos); la tarjeta y el saldo, solo el dueño.
  app.get('/', async (c) => {
    const { org, role } = c.get('auth')
    return c.json(billingForRole(await billingFor(deps).state(org.id), role))
  })

  app.get('/history', requireOwner(), async (c) => {
    const items: BillingHistoryRow[] = await billingFor(deps).history(c.get('auth').org.id)
    const body: Paged<BillingHistoryRow> = { items, total: items.length }
    return c.json(body)
  })

  /** Vista previa del cambio (no cobra ni cambia nada). */
  app.get('/preview', requireOwner(), async (c) => {
    const { plan, period } = readQuery(c, checkoutSchema)
    const service = billingFor(deps)
    const { sub, account } = await service.refresh(c.get('auth').org.id)
    const now = deps.now()
    const amount = planGross(plan, period)
    const paidActive =
      sub.plan !== 'trial' && sub.period && sub.currentPeriodEnd && sub.currentPeriodEnd > now && ['active', 'past_due', 'canceled'].includes(sub.status)
    const label = `${PLANS[plan].name} ${period === 'yearly' ? 'anual' : 'mensual'}`
    if (!paidActive || (sub.plan === plan && sub.period === period)) {
      const same: BillingPreview = {
        plan,
        period,
        amount,
        immediate: true,
        chargeNow: sub.plan === plan && sub.period === period && paidActive ? 0 : amount,
        credit: 0,
        newBalance: account?.creditBalance ?? 0,
        effectiveAt: now.toISOString(),
        label,
      }
      return c.json(same)
    }
    const p = prorate({ plan: sub.plan as typeof plan, period: sub.period!, periodEnd: sub.currentPeriodEnd! }, { plan, period }, now, account?.creditBalance ?? 0)
    const preview: BillingPreview = {
      plan,
      period,
      amount,
      immediate: p.immediate,
      chargeNow: p.chargeNow,
      credit: p.unusedCredit + p.balanceUsed,
      newBalance: p.newBalance,
      effectiveAt: (p.immediate ? now : sub.currentPeriodEnd!).toISOString(),
      label,
    }
    return c.json(preview)
  })

  app.post('/checkout', requireOwner(), async (c) => {
    const { plan, period } = await readBody(c, checkoutSchema)
    const { org, user } = c.get('auth')
    return c.json(await billingFor(deps).checkout({ org, user }, plan, period))
  })

  app.post('/cancel', requireOwner(), async (c) => {
    const { org, user } = c.get('auth')
    return c.json(await billingFor(deps).cancel({ org, user }))
  })

  app.post('/resume', requireOwner(), async (c) => {
    const { org, user } = c.get('auth')
    return c.json(await billingFor(deps).resume({ org, user }))
  })

  return app
}

/** Lee `token` del formulario que envía Flow (o de la query / JSON). */
async function readToken(c: Context): Promise<string | undefined> {
  const fromQuery = c.req.query('token')
  if (c.req.method === 'GET') return fromQuery || undefined
  const type = c.req.header('content-type') ?? ''
  try {
    if (type.includes('application/json')) {
      const body = (await c.req.json()) as { token?: unknown }
      return typeof body.token === 'string' ? body.token : fromQuery
    }
    const body = await c.req.parseBody()
    return typeof body.token === 'string' ? body.token : fromQuery
  } catch {
    return fromQuery || undefined
  }
}

const RESULT_PARAM: Record<ReturnResult, string> = { ok: 'ok', pending: 'pendiente', rejected: 'rechazado', unknown: 'desconocido' }

/** Callbacks públicos de Flow (sin sesión): se montan en /api/billing/flow, antes de las rutas privadas. */
export function billingFlowRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  app.post('/confirm', async (c) => {
    const token = await readToken(c)
    if (!token || token.length > 200) throw badRequest('Falta el token de Flow.', 'token')
    const result = await billingFor(deps).confirmFlowPayment(token)
    return c.json(result)
  })

  const back = async (c: Context) => {
    const token = await readToken(c)
    const checkoutId = c.req.query('checkout') || undefined
    let result: ReturnResult = 'unknown'
    if (token || checkoutId) {
      try {
        result = await billingFor(deps).flowReturn({ token: token?.slice(0, 200), checkoutId: checkoutId?.slice(0, 100) })
      } catch (error) {
        // Nunca un error en pantalla al volver de pagar: la web consulta el estado igual.
        deps.logger.warn('Retorno de Flow sin poder verificar', error instanceof Error ? error.message : error)
      }
    }
    return c.redirect(`${deps.config.appUrl}/ajustes/plan?pago=${RESULT_PARAM[result]}`, 303)
  }
  app.get('/return', back)
  app.post('/return', back)

  return app
}
