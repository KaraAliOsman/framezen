/**
 * Cobros de Framezen: prueba de 14 días, planes mensuales/anuales, cambio de plan con
 * prorrateo simple, cancelación a fin de período y modo lectura al vencer.
 *
 * Proveedores:
 * - 'dev' (sin FLOW_API_KEY/FLOW_SECRET_KEY): activa al instante y simula la renovación.
 * - 'flow': Flow.cl API v3. Suscripción = cliente + tarjeta registrada + suscripción a un
 *   plan de Flow (Flow cobra cada período). La diferencia de un cambio de plan se paga con
 *   payment/create. Nunca se confía en lo que llega al callback: siempre se consulta el
 *   estado firmado en Flow, y cada intento se aplica una sola vez (idempotente).
 */
import { and, eq, inArray, lte } from 'drizzle-orm'
import { formatCLP } from '@framezen/engine'
import { formatDateLong } from '@framezen/documents'
import {
  PLANS,
  type BillingActionResult,
  type BillingStateDetail,
  type CheckoutResult as SharedCheckoutResult,
  type PlanChangeSummary,
} from '@framezen/shared'
import type { AppDeps } from '../../context'
import { subscriptions } from '../../db/schema'
import { newId } from '../../lib/crypto'
import { HttpError } from '../../lib/errors'
import { firstName, logActivity } from '../activity'
import { getBillingState, trialSubscription } from '../billing'
import { FLOW_INTERVAL, FLOW_PAYMENT, FLOW_SUBSCRIPTION, FlowError, flowDay, parseFlowDate, type FlowClient, type FlowPaymentStatus, type FlowSubscription } from './flow'
import {
  accessOf,
  creditWindowEnd,
  creditWindowStart,
  periodEndFrom,
  planGross,
  planLabel,
  prorate,
  type SubscriptionRow,
} from './plans'
import {
  billingAccounts,
  billingCheckouts,
  type BillingAccountRow,
  type BillingPeriod,
  type CheckoutKind,
  type CheckoutMethod,
  type CheckoutRow,
  type CheckoutStatus,
  type PaidPlan,
} from './tables'

export type BillingGateway = { kind: 'dev' } | { kind: 'flow'; client: FlowClient }

// Estado del plan, cambio de plan y resultados: tipos del contrato (@framezen/shared).
export type { BillingActionResult, BillingStateDetail, PlanChangeSummary }

/** Respuesta de checkout del servidor: el contrato, con `billing` y `message` siempre presentes. */
export type CheckoutResult = SharedCheckoutResult & { billing: BillingStateDetail; message: string }

export type ReturnResult = 'ok' | 'pending' | 'rejected' | 'unknown'

interface Actor {
  org: { id: string; name: string }
  user: { id: string; name: string; email: string }
}

const DAY = 86_400_000
const SYNC_EVERY_MS = 10 * 60_000
const PROVIDER_DOWN = 'No pudimos conectar con Flow para el pago. Intenta de nuevo en unos minutos; tu cuenta sigue funcionando igual.'

const day = (d: Date | null | undefined) => (d ? formatDateLong(d.toISOString().slice(0, 10)) : '')

export class BillingService {
  private readonly flowPlans = new Set<string>()

  constructor(
    private readonly deps: AppDeps,
    readonly gateway: BillingGateway,
  ) {}

  get provider(): 'flow' | 'dev' {
    return this.gateway.kind
  }

  private get flow(): FlowClient {
    if (this.gateway.kind !== 'flow') throw new HttpError(404, 'not_found', 'Los pagos con Flow no están configurados en este servidor.')
    return this.gateway.client
  }

  private url(path: 'confirm' | 'return', checkoutId?: string): string {
    const base = `${this.deps.config.appUrl}/api/billing/flow/${path}`
    return checkoutId ? `${base}?checkout=${encodeURIComponent(checkoutId)}` : base
  }

  // ── Lectura ────────────────────────────────────────────────────────────────

  private async loadSub(orgId: string): Promise<SubscriptionRow> {
    const [row] = await this.deps.db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
    if (row) return row
    // Organización antigua sin suscripción: se le abre una prueba para no bloquear.
    await this.deps.db.insert(subscriptions).values(trialSubscription(orgId, this.deps.now(), this.provider)).onConflictDoNothing()
    const [created] = await this.deps.db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
    return created!
  }

  private async loadAccount(orgId: string): Promise<BillingAccountRow | undefined> {
    const [row] = await this.deps.db.select().from(billingAccounts).where(eq(billingAccounts.orgId, orgId)).limit(1)
    return row
  }

  private async saveAccount(orgId: string, patch: Partial<Omit<BillingAccountRow, 'orgId'>>): Promise<void> {
    const values = { ...patch, updatedAt: this.deps.now() }
    await this.deps.db
      .insert(billingAccounts)
      .values({ orgId, ...values })
      .onConflictDoUpdate({ target: billingAccounts.orgId, set: values })
  }

  private async updateSub(orgId: string, patch: Partial<typeof subscriptions.$inferInsert>): Promise<void> {
    await this.deps.db
      .update(subscriptions)
      .set({ ...patch, updatedAt: this.deps.now() })
      .where(eq(subscriptions.orgId, orgId))
  }

  /**
   * Pone al día la suscripción: renovación (simulada en 'dev', consultada en Flow),
   * cambio programado al fin del período y ventana mensual de créditos IA.
   */
  async refresh(orgId: string, options: { force?: boolean } = {}): Promise<{ sub: SubscriptionRow; account?: BillingAccountRow }> {
    const now = this.deps.now()
    const sub = await this.loadSub(orgId)
    let account = await this.loadAccount(orgId)
    const patch: Partial<SubscriptionRow> = {}
    const due = sub.plan !== 'trial' && sub.period && sub.currentPeriodEnd && sub.currentPeriodEnd <= now
    if (due && (sub.status === 'active' || sub.status === 'past_due')) {
      const hadPending = Boolean(account?.pendingPlan || account?.pendingSubscriptionId)
      if (this.gateway.kind === 'dev') {
        Object.assign(patch, this.devRenewal(sub, account, now))
        if (hadPending) await this.saveAccount(orgId, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null })
      } else {
        Object.assign(patch, await this.syncFlow(sub, account, now, options.force ?? false))
      }
      if (account && hadPending && patch.plan) account = { ...account, pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null }
    }
    const merged: SubscriptionRow = { ...sub, ...patch }
    const windowStart = creditWindowStart(merged, now)
    if (windowStart && merged.currentPeriodStart?.getTime() !== windowStart.getTime()) patch.currentPeriodStart = windowStart
    if (Object.keys(patch).length) {
      await this.updateSub(orgId, patch)
      Object.assign(merged, patch)
    }
    return { sub: merged, account }
  }

  /** Proveedor dev: el cobro «se hace» solo al vencer el período (útil para demos). */
  private devRenewal(sub: SubscriptionRow, account: BillingAccountRow | undefined, now: Date): Partial<SubscriptionRow> {
    let plan = sub.plan as PaidPlan
    let period = sub.period!
    if (account?.pendingPlan) {
      plan = account.pendingPlan
      period = account.pendingPeriod ?? period
    }
    const anchor = sub.currentPeriodEnd!
    let n = 1
    let end = periodEndFrom(anchor, period, n)
    while (end <= now) end = periodEndFrom(anchor, period, ++n)
    return { plan, period, status: 'active', currentPeriodEnd: end }
  }

  /** Consulta la suscripción en Flow (como máximo cada 10 minutos por cuenta, salvo `force`). */
  private async syncFlow(sub: SubscriptionRow, account: BillingAccountRow | undefined, now: Date, force: boolean): Promise<Partial<SubscriptionRow>> {
    if (!force && account?.syncedAt && now.getTime() - account.syncedAt.getTime() < SYNC_EVERY_MS) return {}
    const patch: Partial<SubscriptionRow> = {}
    const accountPatch: Partial<BillingAccountRow> = { syncedAt: now }
    let subscriptionId = sub.providerSubscriptionId
    // Terminó el período y había una suscripción esperando (cambio programado o reactivación).
    if (account?.pendingSubscriptionId) {
      subscriptionId = account.pendingSubscriptionId
      patch.providerSubscriptionId = subscriptionId
      patch.plan = account.pendingPlan ?? sub.plan
      patch.period = account.pendingPeriod ?? sub.period
      Object.assign(accountPatch, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null })
    }
    if (subscriptionId) {
      try {
        const remote = await this.flow.getSubscription(subscriptionId)
        Object.assign(patch, this.periodFromFlow(remote, sub.currentPeriodEnd))
      } catch (error) {
        this.deps.logger.warn('No pude consultar la suscripción en Flow; reintento más tarde.', error instanceof Error ? error.message : error)
      }
    }
    await this.saveAccount(sub.orgId, accountPatch)
    return patch
  }

  /** Período vigente según Flow (sólo avanza si está al día). */
  private periodFromFlow(remote: FlowSubscription, currentEnd: Date | null): Partial<SubscriptionRow> {
    const status = Number(remote.status)
    if (status === FLOW_SUBSCRIPTION.canceled) return { status: 'canceled' }
    const end = parseFlowDate(remote.period_end)
    const morose = Number(remote.morose ?? 0)
    if ((status === FLOW_SUBSCRIPTION.active || status === FLOW_SUBSCRIPTION.trial) && end && morose !== 1 && (!currentEnd || end > currentEnd)) {
      return { status: 'active', currentPeriodEnd: end }
    }
    return {}
  }

  async state(orgId: string): Promise<BillingStateDetail> {
    const now = this.deps.now()
    const { sub, account } = await this.refresh(orgId)
    const base = await getBillingState(this.deps.db, orgId, this.provider, now)
    const access = accessOf(sub, now)
    const resetsAt = creditWindowEnd(sub, now)
    return {
      ...base,
      status: access.status,
      readOnly: access.readOnly,
      ...(access.reason ? { readOnlyReason: access.reason, readOnlyMessage: access.message } : {}),
      cancelAtPeriodEnd: sub.status === 'canceled' && !access.readOnly,
      ...(account?.pendingPlan && sub.currentPeriodEnd
        ? { pendingChange: { plan: account.pendingPlan, period: account.pendingPeriod ?? sub.period ?? 'monthly', at: sub.currentPeriodEnd.toISOString() } }
        : {}),
      creditBalance: account?.creditBalance ?? 0,
      ...(account?.cardLast4 ? { card: { ...(account.cardBrand ? { brand: account.cardBrand } : {}), last4: account.cardLast4 } } : {}),
      aiCredits: { ...base.aiCredits, ...(resetsAt ? { resetsAt: resetsAt.toISOString() } : {}) },
    }
  }

  /** Historial de intentos de pago (los últimos 20). */
  async history(orgId: string) {
    const rows = await this.deps.db
      .select()
      .from(billingCheckouts)
      .where(eq(billingCheckouts.orgId, orgId))
      .orderBy(billingCheckouts.createdAt)
    return rows
      .slice(-20)
      .reverse()
      .map((r) => {
        // Cambio programado para el fin del período (sin cobro ahora): la web lo muestra como tal.
        const meta = r.meta as { scheduled?: unknown; at?: unknown } | null
        return {
          id: r.id,
          kind: r.kind,
          plan: r.plan,
          period: r.period,
          amount: r.amount,
          credit: r.credit,
          status: r.status,
          provider: r.provider,
          createdAt: r.createdAt.toISOString(),
          ...(r.appliedAt ? { appliedAt: r.appliedAt.toISOString() } : {}),
          ...(meta?.scheduled === true ? { meta: { scheduled: true, ...(typeof meta.at === 'string' ? { at: meta.at } : {}) } } : {}),
        }
      })
  }

  // ── Elegir o cambiar de plan ───────────────────────────────────────────────

  async checkout(actor: Actor, plan: PaidPlan, period: BillingPeriod): Promise<CheckoutResult> {
    const now = this.deps.now()
    const { sub, account } = await this.refresh(actor.org.id)
    const paidActive =
      sub.plan !== 'trial' && Boolean(sub.period) && Boolean(sub.currentPeriodEnd && sub.currentPeriodEnd > now) && ['active', 'past_due', 'canceled'].includes(sub.status)

    if (paidActive && sub.plan === plan && sub.period === period) {
      if (sub.status === 'canceled') return { url: null, ...(await this.resume(actor)) }
      if (account?.pendingPlan) {
        await this.dropPending(actor.org.id, account)
        return { url: null, billing: await this.state(actor.org.id), message: `Listo: te quedas con ${planLabel(plan, period)}. No cambia nada.` }
      }
      return { url: null, billing: await this.state(actor.org.id), message: `Ya tienes el plan ${planLabel(plan, period)}.` }
    }
    if (paidActive) return this.changePlan(actor, sub, account, plan, period)
    return this.subscribe(actor, sub, account, plan, period)
  }

  private async insertCheckout(values: {
    orgId: string
    userId: string
    kind: CheckoutKind
    method: CheckoutMethod
    plan: PaidPlan
    period: BillingPeriod
    amount: number
    credit?: number
    status: CheckoutStatus
    meta?: Record<string, unknown>
  }): Promise<string> {
    const id = newId()
    const now = this.deps.now()
    await this.deps.db.insert(billingCheckouts).values({
      id,
      ...values,
      credit: values.credit ?? 0,
      provider: this.provider,
      createdAt: now,
      updatedAt: now,
      ...(values.status === 'applied' ? { appliedAt: now } : {}),
    })
    return id
  }

  private async setCheckout(id: string, patch: Partial<CheckoutRow>): Promise<void> {
    await this.deps.db
      .update(billingCheckouts)
      .set({ ...patch, updatedAt: this.deps.now() })
      .where(eq(billingCheckouts.id, id))
  }

  /** Activa un plan desde `start` (fin calculado o el que informe Flow). */
  private async activate(orgId: string, o: { plan: PaidPlan; period: BillingPeriod; start: Date; end?: Date; subscriptionId?: string | null }): Promise<void> {
    await this.updateSub(orgId, {
      plan: o.plan,
      period: o.period,
      status: 'active',
      currentPeriodStart: o.start,
      currentPeriodEnd: o.end && o.end > o.start ? o.end : periodEndFrom(o.start, o.period),
      provider: this.provider,
      ...(o.subscriptionId !== undefined ? { providerSubscriptionId: o.subscriptionId } : {}),
    })
  }

  private async log(actor: Actor | { orgId: string; userId?: string; name?: string }, kind: string, text: string, meta?: Record<string, unknown>) {
    const orgId = 'org' in actor ? actor.org.id : actor.orgId
    const who = 'user' in actor ? { userId: actor.user.id, name: actor.user.name } : { userId: actor.userId, name: actor.name }
    await logActivity(this.deps.db, { orgId, actor: who, kind, text, link: '/ajustes/plan', ...(meta ? { meta } : {}) })
  }

  private providerError(error: unknown): HttpError {
    this.deps.logger.error('Flow falló durante un cobro', error instanceof FlowError ? `${error.status} ${String(error.code ?? '')} ${error.message}` : error)
    return new HttpError(502, 'payment_provider', PROVIDER_DOWN)
  }

  /** Plan de Flow para (plan, período, monto): se crea solo la primera vez. */
  private async ensureFlowPlan(plan: PaidPlan, period: BillingPeriod): Promise<string> {
    const amount = planGross(plan, period)
    const planId = `framezen-${plan}-${period}-${amount}`
    if (this.flowPlans.has(planId)) return planId
    try {
      await this.flow.getPlan(planId)
    } catch (error) {
      if (!(error instanceof FlowError) || error.status < 400 || error.status >= 500) throw error
      await this.flow.createPlan({
        planId,
        name: `Framezen ${planLabel(plan, period)}`,
        amount,
        interval: period === 'yearly' ? FLOW_INTERVAL.yearly : FLOW_INTERVAL.monthly,
        urlCallback: this.url('confirm'),
        days_until_due: 3,
      })
    }
    this.flowPlans.add(planId)
    return planId
  }

  private async ensureFlowCustomer(actor: Actor, sub: SubscriptionRow): Promise<string> {
    if (sub.providerCustomerId) return sub.providerCustomerId
    const customer = await this.flow.createCustomer({ name: actor.org.name, email: actor.user.email, externalId: actor.org.id })
    await this.updateSub(actor.org.id, { providerCustomerId: customer.customerId })
    return customer.customerId
  }

  /** Cancela de inmediato las suscripciones de Flow que queden de antes (vencida, morosa o programada). */
  private async retireFlowSubscriptions(orgId: string): Promise<void> {
    const sub = await this.loadSub(orgId)
    const account = await this.loadAccount(orgId)
    for (const id of [sub.providerSubscriptionId, account?.pendingSubscriptionId]) {
      if (id) await this.flow.cancelSubscription(id, false).catch(() => undefined)
    }
  }

  private async flowSubscribe(plan: PaidPlan, period: BillingPeriod, customerId: string, start?: Date): Promise<FlowSubscription> {
    const planId = await this.ensureFlowPlan(plan, period)
    return this.flow.createSubscription({ planId, customerId, ...(start ? { subscription_start: flowDay(start) } : {}) })
  }

  /** Primera suscripción (desde la prueba o tras vencer). */
  private async subscribe(actor: Actor, sub: SubscriptionRow, account: BillingAccountRow | undefined, plan: PaidPlan, period: BillingPeriod): Promise<CheckoutResult> {
    const now = this.deps.now()
    const amount = planGross(plan, period)
    const name = PLANS[plan].name
    const base = { orgId: actor.org.id, userId: actor.user.id, kind: 'subscribe' as const, plan, period, amount }

    if (this.gateway.kind === 'dev') {
      const checkoutId = await this.insertCheckout({ ...base, method: 'direct', status: 'applied' })
      await this.activate(actor.org.id, { plan, period, start: now, subscriptionId: null })
      await this.saveAccount(actor.org.id, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null })
      await this.log(actor, 'billing.activated', `${firstName(actor.user.name)} activó el plan ${planLabel(plan, period)}`, { plan, period, amount })
      const billing = await this.state(actor.org.id)
      const renews = billing.currentPeriodEnd ? ` Se renueva el ${day(new Date(billing.currentPeriodEnd))}.` : ''
      return { url: null, billing, checkoutId, message: `Listo: ya tienes el plan ${name}.${renews}` }
    }

    try {
      const customerId = await this.ensureFlowCustomer(actor, sub)
      if (account?.cardLast4) {
        // Tarjeta ya registrada: se suscribe directo, sin salir de Framezen.
        await this.retireFlowSubscriptions(actor.org.id)
        const remote = await this.flowSubscribe(plan, period, customerId)
        const checkoutId = await this.insertCheckout({ ...base, method: 'direct', status: 'applied', meta: { subscriptionId: remote.subscriptionId } })
        await this.activate(actor.org.id, {
          plan,
          period,
          start: parseFlowDate(remote.period_start) ?? now,
          end: parseFlowDate(remote.period_end),
          subscriptionId: remote.subscriptionId,
        })
        await this.saveAccount(actor.org.id, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null })
        await this.log(actor, 'billing.activated', `${firstName(actor.user.name)} activó el plan ${planLabel(plan, period)}`, { plan, period, amount })
        return {
          url: null,
          billing: await this.state(actor.org.id),
          checkoutId,
          message: `Listo: ya tienes el plan ${name}. Cobramos ${formatCLP(amount)} a tu tarjeta terminada en ${account.cardLast4}.`,
        }
      }
      const checkoutId = await this.insertCheckout({ ...base, method: 'register', status: 'pending', meta: { customerId } })
      const registration = await this.flow.registerCard({ customerId, url_return: this.url('return', checkoutId) })
      await this.setCheckout(checkoutId, { token: registration.token })
      return {
        url: `${registration.url}?token=${encodeURIComponent(registration.token)}`,
        billing: await this.state(actor.org.id),
        checkoutId,
        message: 'Te llevamos a Flow para registrar tu tarjeta. Al volver, tu plan queda activo.',
      }
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw this.providerError(error)
    }
  }

  /** Cambio entre planes pagados: sube ahora (con prorrateo) o baja al fin del período. */
  private async changePlan(actor: Actor, sub: SubscriptionRow, account: BillingAccountRow | undefined, plan: PaidPlan, period: BillingPeriod): Promise<CheckoutResult> {
    const now = this.deps.now()
    const current = { plan: sub.plan as PaidPlan, period: sub.period!, periodEnd: sub.currentPeriodEnd! }
    const p = prorate(current, { plan, period }, now, account?.creditBalance ?? 0)
    const base = { orgId: actor.org.id, userId: actor.user.id, kind: 'change' as const, plan, period }

    if (!p.immediate) {
      // Baja: sin cobro hoy; rige al terminar el período pagado.
      let pendingSubscriptionId: string | null = null
      if (this.gateway.kind === 'flow' && sub.providerCustomerId && account?.cardLast4) {
        try {
          if (account.pendingSubscriptionId) await this.flow.cancelSubscription(account.pendingSubscriptionId, false).catch(() => undefined)
          if (sub.providerSubscriptionId && sub.status !== 'canceled') await this.flow.cancelSubscription(sub.providerSubscriptionId, true)
          pendingSubscriptionId = (await this.flowSubscribe(plan, period, sub.providerCustomerId, current.periodEnd)).subscriptionId
        } catch (error) {
          throw this.providerError(error)
        }
      }
      await this.saveAccount(actor.org.id, { pendingPlan: plan, pendingPeriod: period, pendingSubscriptionId })
      if (sub.status === 'canceled') await this.updateSub(actor.org.id, { status: 'active' })
      const checkoutId = await this.insertCheckout({ ...base, method: 'direct', amount: 0, status: 'applied', meta: { scheduled: true, at: current.periodEnd.toISOString(), from: current.plan, fromPeriod: current.period } })
      await this.log(actor, 'billing.change_scheduled', `${firstName(actor.user.name)} programó el cambio a ${planLabel(plan, period)} desde el ${day(current.periodEnd)}`, { plan, period })
      return {
        url: null,
        billing: await this.state(actor.org.id),
        checkoutId,
        message: `Listo: desde el ${day(current.periodEnd)} pasas a ${planLabel(plan, period)}. Hasta entonces sigues con ${PLANS[current.plan].name}.`,
        change: { immediate: false, chargeNow: 0, credit: 0, newBalance: p.newBalance, effectiveAt: current.periodEnd.toISOString() },
      }
    }

    const credit = p.unusedCredit + p.balanceUsed
    const meta = { from: current.plan, fromPeriod: current.period, unusedCredit: p.unusedCredit, balanceUsed: p.balanceUsed, newBalance: p.newBalance, newAmount: p.newAmount }
    const change: PlanChangeSummary = { immediate: true, chargeNow: p.chargeNow, credit, newBalance: p.newBalance, effectiveAt: now.toISOString() }

    if (this.gateway.kind === 'flow' && p.chargeNow > 0) {
      // Se paga la diferencia con Flow; el plan cambia cuando Flow confirme el pago.
      try {
        const checkoutId = await this.insertCheckout({ ...base, method: 'payment', amount: p.chargeNow, credit, status: 'pending', meta })
        const payment = await this.flow.createPayment({
          commerceOrder: checkoutId,
          subject: `Framezen · cambio a ${planLabel(plan, period)}`,
          amount: p.chargeNow,
          email: actor.user.email,
          urlConfirmation: this.url('confirm'),
          urlReturn: this.url('return', checkoutId),
        })
        await this.setCheckout(checkoutId, { token: payment.token, flowOrder: String(payment.flowOrder) })
        return {
          url: `${payment.url}?token=${encodeURIComponent(payment.token)}`,
          billing: await this.state(actor.org.id),
          checkoutId,
          change,
          message: `Te llevamos a Flow para pagar ${formatCLP(p.chargeNow)}${credit ? ` (ya descontamos ${formatCLP(credit)} por los días que no usaste)` : ''}.`,
        }
      } catch (error) {
        throw this.providerError(error)
      }
    }

    // Sin cobro pendiente (dev, o el saldo a favor cubre todo): rige ahora mismo.
    const checkoutId = await this.insertCheckout({ ...base, method: 'direct', amount: p.chargeNow, credit, status: 'processing', meta })
    try {
      await this.applyChange(actor.org.id, plan, period, p.newBalance)
      await this.setCheckout(checkoutId, { status: 'applied', appliedAt: this.deps.now() })
    } catch (error) {
      await this.setCheckout(checkoutId, { status: 'failed', meta: { ...meta, error: error instanceof Error ? error.message : String(error) } })
      if (error instanceof HttpError) throw error
      throw this.providerError(error)
    }
    await this.log(actor, 'billing.changed', `${firstName(actor.user.name)} cambió al plan ${planLabel(plan, period)}`, { plan, period, chargeNow: p.chargeNow, credit })
    return {
      url: null,
      billing: await this.state(actor.org.id),
      checkoutId,
      change,
      message: `Listo: ya tienes ${planLabel(plan, period)}.${credit ? ` Descontamos ${formatCLP(credit)} por los días que no usaste de ${PLANS[current.plan].name}` : ''}${p.chargeNow ? `; el cobro de hoy es ${formatCLP(p.chargeNow)}.` : credit ? '.' : ''}`,
    }
  }

  /**
   * Aplica un cambio inmediato: el plan nuevo parte hoy (créditos IA del mes incluidos). En
   * Flow, la suscripción anterior se cancela y la nueva parte en el próximo período (el de
   * hoy ya quedó pagado con la diferencia).
   */
  private async applyChange(orgId: string, plan: PaidPlan, period: BillingPeriod, newBalance: number): Promise<void> {
    const now = this.deps.now()
    let subscriptionId: string | null | undefined
    if (this.gateway.kind === 'flow') {
      const sub = await this.loadSub(orgId)
      const account = await this.loadAccount(orgId)
      if (sub.providerSubscriptionId) await this.flow.cancelSubscription(sub.providerSubscriptionId, false).catch(() => undefined)
      if (account?.pendingSubscriptionId) await this.flow.cancelSubscription(account.pendingSubscriptionId, false).catch(() => undefined)
      subscriptionId = null
      if (sub.providerCustomerId && account?.cardLast4) {
        subscriptionId = (await this.flowSubscribe(plan, period, sub.providerCustomerId, periodEndFrom(now, period))).subscriptionId
      }
    }
    await this.activate(orgId, { plan, period, start: now, ...(subscriptionId !== undefined ? { subscriptionId } : {}) })
    await this.saveAccount(orgId, { creditBalance: Math.max(0, Math.round(newBalance)), pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null })
  }

  private async dropPending(orgId: string, account: BillingAccountRow): Promise<void> {
    if (this.gateway.kind === 'flow' && account.pendingSubscriptionId) {
      await this.flow.cancelSubscription(account.pendingSubscriptionId, false).catch(() => undefined)
      // La suscripción vigente se había programado para terminar: se reactiva con una nueva desde el fin del período.
      const sub = await this.loadSub(orgId)
      if (sub.providerCustomerId && sub.currentPeriodEnd && sub.period) {
        try {
          const next = await this.flowSubscribe(sub.plan as PaidPlan, sub.period, sub.providerCustomerId, sub.currentPeriodEnd)
          await this.saveAccount(orgId, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: next.subscriptionId })
          return
        } catch (error) {
          throw this.providerError(error)
        }
      }
    }
    await this.saveAccount(orgId, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null })
  }

  // ── Cancelar y deshacer ────────────────────────────────────────────────────

  /** Cancela al fin del período: no hay más cobros y todo sigue disponible hasta esa fecha. */
  async cancel(actor: Actor): Promise<BillingActionResult> {
    const now = this.deps.now()
    const { sub, account } = await this.refresh(actor.org.id)
    if (sub.plan === 'trial') {
      return {
        billing: await this.state(actor.org.id),
        message: `Estás en la prueba gratis: no hay cobros que cancelar. Termina el ${day(sub.trialEndsAt)} y después la cuenta queda en modo lectura, con todo disponible.`,
      }
    }
    if (!sub.currentPeriodEnd || sub.currentPeriodEnd <= now || sub.status === 'expired') {
      return { billing: await this.state(actor.org.id), message: 'Tu plan ya no está activo, así que no hay cobros pendientes.' }
    }
    if (sub.status === 'canceled') {
      return { billing: await this.state(actor.org.id), message: `Tu plan ya estaba cancelado. Sigue activo hasta el ${day(sub.currentPeriodEnd)}.` }
    }
    if (this.gateway.kind === 'flow') {
      try {
        if (sub.providerSubscriptionId) await this.flow.cancelSubscription(sub.providerSubscriptionId, true)
        if (account?.pendingSubscriptionId) await this.flow.cancelSubscription(account.pendingSubscriptionId, false)
      } catch (error) {
        throw this.providerError(error)
      }
    }
    await this.updateSub(actor.org.id, { status: 'canceled' })
    await this.saveAccount(actor.org.id, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null })
    await this.log(actor, 'billing.canceled', `${firstName(actor.user.name)} canceló el plan ${PLANS[sub.plan as PaidPlan].name}; sigue activo hasta el ${day(sub.currentPeriodEnd)}`)
    return {
      billing: await this.state(actor.org.id),
      message: `Listo: no habrá más cobros. Tu plan sigue activo hasta el ${day(sub.currentPeriodEnd)}; después la cuenta queda en modo lectura, con todo disponible para descargar.`,
    }
  }

  /** Deshace la cancelación mientras el período siga vigente. */
  async resume(actor: Actor): Promise<BillingActionResult> {
    const now = this.deps.now()
    const { sub } = await this.refresh(actor.org.id)
    if (sub.status !== 'canceled') return { billing: await this.state(actor.org.id), message: 'Tu plan está activo; no hay nada que deshacer.' }
    if (!sub.currentPeriodEnd || sub.currentPeriodEnd <= now || sub.plan === 'trial' || !sub.period) {
      return { billing: await this.state(actor.org.id), message: 'Tu plan ya terminó. Elige un plan para volver a cotizar; todo sigue aquí.' }
    }
    if (this.gateway.kind === 'flow' && sub.providerCustomerId) {
      try {
        const next = await this.flowSubscribe(sub.plan as PaidPlan, sub.period, sub.providerCustomerId, sub.currentPeriodEnd)
        await this.saveAccount(actor.org.id, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: next.subscriptionId })
      } catch (error) {
        throw this.providerError(error)
      }
    }
    await this.updateSub(actor.org.id, { status: 'active' })
    await this.log(actor, 'billing.resumed', `${firstName(actor.user.name)} reactivó el plan ${PLANS[sub.plan as PaidPlan].name}`)
    return { billing: await this.state(actor.org.id), message: `Listo: tu plan sigue activo y se renueva el ${day(sub.currentPeriodEnd)}.` }
  }

  // ── Flow: confirmación (servidor a servidor) y retorno (navegador) ─────────

  /** POST /api/billing/flow/confirm: Flow avisa un pago; se verifica consultando el estado firmado. */
  async confirmFlowPayment(token: string): Promise<{ ok: boolean; result: ReturnResult }> {
    const flow = this.flow
    let status: FlowPaymentStatus
    try {
      status = await flow.getPaymentStatus(token)
    } catch (error) {
      throw this.providerError(error)
    }
    const checkout = await this.findCheckout(String(status.commerceOrder ?? ''))
    if (!checkout) {
      // Cobro de una suscripción (no viene de un checkout): se ponen al día las que vencieron.
      await this.syncDue()
      return { ok: true, result: 'unknown' }
    }
    return { ok: true, result: await this.settlePayment(checkout, status, token) }
  }

  /** GET/POST /api/billing/flow/return: vuelve el navegador desde Flow. */
  async flowReturn(input: { checkoutId?: string; token?: string }): Promise<ReturnResult> {
    const flow = this.flow
    let checkout = input.checkoutId ? await this.findCheckout(input.checkoutId) : undefined
    if (!checkout && input.token) {
      const [row] = await this.deps.db.select().from(billingCheckouts).where(eq(billingCheckouts.token, input.token)).limit(1)
      checkout = row
    }
    if (!checkout) return 'unknown'
    if (checkout.status === 'applied') return 'ok'
    const token = input.token || checkout.token
    if (!token) return 'pending'
    try {
      if (checkout.method === 'register') return await this.settleRegistration(checkout, token)
      const status = await flow.getPaymentStatus(token)
      if (String(status.commerceOrder) !== checkout.id) return 'unknown'
      return await this.settlePayment(checkout, status, token)
    } catch (error) {
      this.deps.logger.error('No pude verificar el retorno de Flow', error instanceof Error ? error.message : error)
      return 'pending'
    }
  }

  private async findCheckout(id: string): Promise<CheckoutRow | undefined> {
    if (!id || id.length > 100) return undefined
    const [row] = await this.deps.db.select().from(billingCheckouts).where(eq(billingCheckouts.id, id)).limit(1)
    return row
  }

  /** Toma el checkout para aplicarlo una sola vez (pending/paid → processing). */
  private async claim(id: string, patch: Partial<CheckoutRow> = {}): Promise<CheckoutRow | undefined> {
    const [row] = await this.deps.db
      .update(billingCheckouts)
      .set({ ...patch, status: 'processing', updatedAt: this.deps.now() })
      .where(and(eq(billingCheckouts.id, id), inArray(billingCheckouts.status, ['pending', 'paid'])))
      .returning()
    return row
  }

  private async settlePayment(checkout: CheckoutRow, status: FlowPaymentStatus, token: string): Promise<ReturnResult> {
    const code = Number(status.status)
    if (code === FLOW_PAYMENT.paid) {
      if (Math.round(Number(status.amount)) !== checkout.amount || (status.currency && status.currency !== 'CLP')) {
        this.deps.logger.error(`Pago de Flow con monto distinto (checkout ${checkout.id}: esperado ${checkout.amount}, Flow ${String(status.amount)} ${status.currency ?? ''})`)
        await this.setCheckout(checkout.id, { status: 'failed', meta: { ...(checkout.meta ?? {}), mismatch: { amount: status.amount, currency: status.currency } } })
        return 'rejected'
      }
      const claimed = await this.claim(checkout.id, { token: checkout.token ?? token, flowOrder: String(status.flowOrder ?? checkout.flowOrder ?? '') })
      if (!claimed) {
        const current = await this.findCheckout(checkout.id)
        return current?.status === 'applied' ? 'ok' : current?.status === 'failed' || current?.status === 'rejected' ? 'rejected' : 'pending'
      }
      try {
        const meta = (claimed.meta ?? {}) as { newBalance?: number }
        await this.applyChange(claimed.orgId, claimed.plan, claimed.period, meta.newBalance ?? 0)
        await this.setCheckout(claimed.id, { status: 'applied', appliedAt: this.deps.now() })
        await this.log({ orgId: claimed.orgId, userId: claimed.userId ?? undefined, name: 'Flow' }, 'billing.changed', `Pago confirmado: plan ${planLabel(claimed.plan, claimed.period)} activo`, {
          plan: claimed.plan,
          period: claimed.period,
          amount: claimed.amount,
        })
        return 'ok'
      } catch (error) {
        // Queda como pagado para reintentar en el próximo aviso o retorno.
        this.deps.logger.error(`No pude aplicar el pago ${claimed.id}; queda para reintento.`, error instanceof Error ? error.message : error)
        await this.setCheckout(claimed.id, { status: 'paid' })
        return 'pending'
      }
    }
    if (code === FLOW_PAYMENT.rejected || code === FLOW_PAYMENT.canceled) {
      await this.deps.db
        .update(billingCheckouts)
        .set({ status: code === FLOW_PAYMENT.rejected ? 'rejected' : 'canceled', updatedAt: this.deps.now() })
        .where(and(eq(billingCheckouts.id, checkout.id), eq(billingCheckouts.status, 'pending')))
      return 'rejected'
    }
    return 'pending'
  }

  private async settleRegistration(checkout: CheckoutRow, token: string): Promise<ReturnResult> {
    const registration = await this.flow.getRegisterStatus(token)
    if (String(registration.status) !== '1') {
      await this.deps.db
        .update(billingCheckouts)
        .set({ status: 'rejected', updatedAt: this.deps.now() })
        .where(and(eq(billingCheckouts.id, checkout.id), eq(billingCheckouts.status, 'pending')))
      return 'rejected'
    }
    const claimed = await this.claim(checkout.id, { token })
    if (!claimed) {
      const current = await this.findCheckout(checkout.id)
      return current?.status === 'applied' ? 'ok' : 'pending'
    }
    try {
      const sub = await this.loadSub(claimed.orgId)
      const customerId = registration.customerId || sub.providerCustomerId
      if (!customerId) throw new Error('Flow no informó el cliente de la tarjeta')
      if (customerId !== sub.providerCustomerId) await this.updateSub(claimed.orgId, { providerCustomerId: customerId })
      await this.saveAccount(claimed.orgId, {
        cardBrand: registration.creditCardType ?? null,
        cardLast4: registration.last4CardDigits ?? null,
      })
      await this.retireFlowSubscriptions(claimed.orgId)
      const remote = await this.flowSubscribe(claimed.plan, claimed.period, customerId)
      const now = this.deps.now()
      await this.activate(claimed.orgId, {
        plan: claimed.plan,
        period: claimed.period,
        start: parseFlowDate(remote.period_start) ?? now,
        end: parseFlowDate(remote.period_end),
        subscriptionId: remote.subscriptionId,
      })
      await this.saveAccount(claimed.orgId, { pendingPlan: null, pendingPeriod: null, pendingSubscriptionId: null })
      await this.setCheckout(claimed.id, { status: 'applied', appliedAt: now, meta: { ...(claimed.meta ?? {}), subscriptionId: remote.subscriptionId } })
      await this.log({ orgId: claimed.orgId, userId: claimed.userId ?? undefined, name: 'Flow' }, 'billing.activated', `Tarjeta registrada: plan ${planLabel(claimed.plan, claimed.period)} activo`, {
        plan: claimed.plan,
        period: claimed.period,
      })
      return 'ok'
    } catch (error) {
      this.deps.logger.error(`No pude activar la suscripción del checkout ${claimed.id}; queda para reintento.`, error instanceof Error ? error.message : error)
      await this.setCheckout(claimed.id, { status: 'paid' })
      return 'pending'
    }
  }

  /** Pone al día (con Flow) las suscripciones vencidas; se usa cuando llega un cobro sin checkout. */
  async syncDue(limit = 20): Promise<number> {
    if (this.gateway.kind !== 'flow') return 0
    const now = this.deps.now()
    const due = await this.deps.db
      .select({ orgId: subscriptions.orgId })
      .from(subscriptions)
      .where(and(eq(subscriptions.provider, 'flow'), inArray(subscriptions.status, ['active', 'past_due']), lte(subscriptions.currentPeriodEnd, new Date(now.getTime() + DAY))))
      .limit(limit)
    for (const { orgId } of due) await this.refresh(orgId, { force: true }).catch(() => undefined)
    return due.length
  }
}
