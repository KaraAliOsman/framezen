import { PLAN_ORDER, PLANS, type Plan } from '@dekopen/shared'
import { translate } from '../../../lib/i18n'
import es from '../i18n/es'

export type BillingPeriod = 'monthly' | 'yearly'

export interface PlanQuote {
  plan: Plan
  /** Precio mensual neto que se muestra según el periodo elegido. */
  perMonth: number
  /** Lo que se paga de una vez al año (solo anual). */
  yearlyTotal: number
  /** Ahorro anual frente a pagar mes a mes. */
  yearlySavings: number
  /** Ahorro anual en % (entero). */
  savingsPct: number
}

export function quotePlan(plan: Plan, period: BillingPeriod): PlanQuote {
  const yearlySavings = (plan.monthly - plan.yearlyMonthly) * 12
  return {
    plan,
    perMonth: period === 'yearly' ? plan.yearlyMonthly : plan.monthly,
    yearlyTotal: plan.yearlyMonthly * 12,
    yearlySavings,
    savingsPct: plan.monthly > 0 ? Math.round((1 - plan.yearlyMonthly / plan.monthly) * 100) : 0,
  }
}

/** Los 4 planes en el orden de venta. */
export function landingPlans(period: BillingPeriod): PlanQuote[] {
  return PLAN_ORDER.map((code) => quotePlan(PLANS[code], period))
}

/** Mayor ahorro anual entre los planes (para «Ahorra hasta 23 %»). */
export function maxSavingsPct(): number {
  return Math.max(...PLAN_ORDER.map((code) => quotePlan(PLANS[code], 'yearly').savingsPct))
}

/** «1 persona», «Hasta 3 personas», «Personas ilimitadas» (en el idioma de la página). */
export function seatsLabel(seats: number | null): string {
  if (seats === null) return translate(es, 'plans.seats.unlimited')
  if (seats === 1) return translate(es, 'plans.seats.one')
  return translate(es, 'plans.seats.upTo', { count: seats })
}
