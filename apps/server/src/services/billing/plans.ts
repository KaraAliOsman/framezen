/**
 * Cifras y fechas de cobro: montos con IVA, períodos, ventana mensual de créditos IA,
 * prorrateo simple al cambiar de plan y acceso (modo lectura).
 */
import { PLANS, TRIAL_DAYS, type BillingState, type ReadOnlyReason } from '@dekopen/shared'
import type { subscriptions } from '../../db/schema'
import type { BillingPeriod, PaidPlan } from './tables'

export type SubscriptionRow = typeof subscriptions.$inferSelect

export const IVA_PCT = 19
/** Días después del fin del período sin pago antes de pasar a modo lectura. */
export const GRACE_DAYS = 10
const DAY = 86_400_000

export const PAID_PLANS = Object.keys(PLANS) as PaidPlan[]

export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === 'string' && (PAID_PLANS as string[]).includes(value)
}

/** Neto del período completo (mensual, o 12 meses al precio anual). */
export function planNet(plan: PaidPlan, period: BillingPeriod): number {
  return period === 'yearly' ? PLANS[plan].yearlyMonthly * 12 : PLANS[plan].monthly
}

/** Monto a cobrar por el período completo, con IVA. */
export function planGross(plan: PaidPlan, period: BillingPeriod): number {
  return Math.round(planNet(plan, period) * (1 + IVA_PCT / 100))
}

/** Precio mensual equivalente (para decidir si un cambio sube o baja). */
export function monthlyEquivalent(plan: PaidPlan, period: BillingPeriod): number {
  return period === 'yearly' ? PLANS[plan].yearlyMonthly : PLANS[plan].monthly
}

export function periodLabel(period: BillingPeriod): string {
  return period === 'yearly' ? 'anual' : 'mensual'
}

export function planLabel(plan: PaidPlan, period: BillingPeriod): string {
  return `${PLANS[plan].name} (${periodLabel(period)})`
}

// ── Fechas ───────────────────────────────────────────────────────────────────

/** Suma meses en UTC; si el día no existe en el mes de destino, usa el último (31 ene + 1 → 28/29 feb). */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + months
  const target = new Date(Date.UTC(y, m, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  return target
}

export const periodMonths = (period: BillingPeriod) => (period === 'yearly' ? 12 : 1)

/** Fin del período que parte en `start` (con `n` períodos completos). */
export function periodEndFrom(start: Date, period: BillingPeriod, n = 1): Date {
  return addMonths(start, periodMonths(period) * n)
}

/** Inicio del período vigente a partir de su fin. */
export function periodStartFrom(end: Date, period: BillingPeriod): Date {
  return addMonths(end, -periodMonths(period))
}

/**
 * Inicio de la ventana mensual de créditos IA vigente: los créditos se renuevan cada mes
 * contado desde el inicio del período pagado (también en planes anuales).
 */
export function creditWindowStart(sub: Pick<SubscriptionRow, 'plan' | 'period' | 'currentPeriodEnd'>, now: Date): Date | undefined {
  if (sub.plan === 'trial' || !sub.currentPeriodEnd || !sub.period) return undefined
  const end = sub.currentPeriodEnd
  const start = periodStartFrom(end, sub.period)
  if (now <= start) return start
  const limit = now < end ? now : new Date(end.getTime() - 1)
  let k = Math.max(0, (limit.getUTCFullYear() - start.getUTCFullYear()) * 12 + limit.getUTCMonth() - start.getUTCMonth())
  while (k > 0 && addMonths(start, k) > limit) k--
  while (addMonths(start, k + 1) <= limit) k++
  return addMonths(start, k)
}

/** Fin de la ventana de créditos (cuándo se renuevan). */
export function creditWindowEnd(sub: Pick<SubscriptionRow, 'plan' | 'period' | 'currentPeriodEnd' | 'trialEndsAt'>, now: Date): Date | undefined {
  if (sub.plan === 'trial') return sub.trialEndsAt ?? undefined
  const start = creditWindowStart(sub, now)
  if (!start || !sub.currentPeriodEnd) return undefined
  const next = addMonths(start, 1)
  return next < sub.currentPeriodEnd ? next : sub.currentPeriodEnd
}

// ── Prorrateo ────────────────────────────────────────────────────────────────

export interface Proration {
  /** Fracción del período actual que queda sin usar (0–1). */
  remaining: number
  /** Valor no usado del plan actual (saldo a favor), con IVA. */
  unusedCredit: number
  /** Saldo a favor previo que se aplica. */
  balanceUsed: number
  /** Precio del período completo del plan nuevo, con IVA. */
  newAmount: number
  /** Lo que se cobra ahora (nunca negativo). */
  chargeNow: number
  /** Saldo a favor que queda para después. */
  newBalance: number
  /** true = el cambio rige ahora (sube); false = al terminar el período (baja). */
  immediate: boolean
}

/** ¿El cambio sube (rige ahora) o baja (rige al terminar el período)? */
export function isUpgrade(from: { plan: PaidPlan; period: BillingPeriod }, to: { plan: PaidPlan; period: BillingPeriod }): boolean {
  // Plan con más funciones: rige ahora. Mismo plan: pasar a anual rige ahora; a mensual, al terminar el año.
  const a = PLANS[from.plan].monthly
  const b = PLANS[to.plan].monthly
  if (b !== a) return b > a
  return from.period === 'monthly' && to.period === 'yearly'
}

/**
 * Prorrateo simple: lo no usado del período actual queda como saldo a favor y se descuenta
 * del primer cobro del plan nuevo, que parte de cero ese mismo día (con sus créditos IA del mes).
 * Si el plan nuevo es más barato, el cambio se programa para el fin del período (sin cobro).
 */
export function prorate(
  current: { plan: PaidPlan; period: BillingPeriod; periodEnd: Date },
  target: { plan: PaidPlan; period: BillingPeriod },
  now: Date,
  balance = 0,
): Proration {
  const end = current.periodEnd
  const start = periodStartFrom(end, current.period)
  const total = Math.max(1, end.getTime() - start.getTime())
  const remaining = Math.min(1, Math.max(0, (end.getTime() - now.getTime()) / total))
  const newAmount = planGross(target.plan, target.period)
  const immediate = isUpgrade(current, target)
  if (!immediate) {
    return { remaining, unusedCredit: 0, balanceUsed: 0, newAmount, chargeNow: 0, newBalance: balance, immediate }
  }
  const unusedCredit = Math.round(planGross(current.plan, current.period) * remaining)
  const available = unusedCredit + Math.max(0, balance)
  const chargeNow = Math.max(0, newAmount - available)
  // El saldo se usa en orden: primero lo no usado del plan actual, después el saldo previo.
  const consumed = newAmount - chargeNow
  const balanceUsed = consumed - Math.min(unusedCredit, consumed)
  return { remaining, unusedCredit, balanceUsed, newAmount, chargeNow, newBalance: available - consumed, immediate }
}

// ── Acceso ───────────────────────────────────────────────────────────────────

export type { ReadOnlyReason }

export const READ_ONLY_COPY: Record<ReadOnlyReason, string> = {
  trial_ended: `Tu prueba de ${TRIAL_DAYS} días terminó. Todo sigue aquí y puedes verlo y descargarlo; para seguir cotizando, elige un plan.`,
  plan_ended: 'Tu plan terminó. Todo sigue aquí y puedes verlo y descargarlo; para seguir cotizando, vuelve a activarlo.',
  payment_overdue:
    'No pudimos cobrar tu plan. Todo sigue aquí y puedes verlo y descargarlo; para seguir cotizando, revisa tu tarjeta en Plan y facturación.',
}

export interface Access {
  status: BillingState['status']
  readOnly: boolean
  reason?: ReadOnlyReason
  message?: string
}

/** Estado vigente según fechas y si la cuenta queda en modo lectura. */
export function accessOf(sub: Pick<SubscriptionRow, 'plan' | 'status' | 'trialEndsAt' | 'currentPeriodEnd'>, now: Date): Access {
  const ro = (status: BillingState['status'], reason: ReadOnlyReason): Access => ({ status, readOnly: true, reason, message: READ_ONLY_COPY[reason] })
  if (sub.status === 'trialing') {
    return sub.trialEndsAt && sub.trialEndsAt < now ? ro('expired', 'trial_ended') : { status: 'trialing', readOnly: false }
  }
  if (sub.status === 'expired') return ro('expired', sub.plan === 'trial' ? 'trial_ended' : 'plan_ended')
  if (sub.status === 'canceled') {
    return !sub.currentPeriodEnd || sub.currentPeriodEnd < now ? ro('expired', 'plan_ended') : { status: 'canceled', readOnly: false }
  }
  // active / past_due
  if (!sub.currentPeriodEnd) return { status: sub.status, readOnly: false }
  const overdue = now.getTime() - sub.currentPeriodEnd.getTime()
  if (overdue > GRACE_DAYS * DAY) return ro('past_due', 'payment_overdue')
  if (overdue > 3 * DAY || sub.status === 'past_due') return { status: 'past_due', readOnly: false }
  return { status: 'active', readOnly: false }
}
