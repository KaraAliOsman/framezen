import { PLANS, TRIAL_DAYS, planFeatures, type BillingDetailFields, type BillingState, type Feature, type PlanCode, type ReadOnlyReason } from '@dekopen/shared'
import { useMe } from './hooks'

const DAY = 86_400_000

export interface PlanInfo {
  code: PlanCode
  /** «Prueba Pro», «Taller», «Pro»… */
  name: string
  status: BillingState['status']
  isTrial: boolean
  /** Días que quedan de prueba (null si no está en prueba). */
  trialDaysLeft: number | null
  /** 0–1: cuánto de la prueba ya pasó (para la barrita del menú). */
  trialProgress: number
  /** Prueba vencida, plan terminado o pago muy atrasado: se puede ver y exportar, no crear. */
  readOnly: boolean
  /** Motivo y mensaje del servidor (si los envía). */
  readOnlyReason?: ReadOnlyReason
  readOnlyMessage?: string
  /** Pago atrasado: todo sigue funcionando, mostramos un aviso. */
  pastDue: boolean
  features: Feature[]
  has: (feature: Feature) => boolean
  credits: { included: number; left: number }
}

export function planName(code: PlanCode): string {
  return code === 'trial' ? 'Prueba Pro' : PLANS[code].name
}

export function describePlan(billing: BillingState & Partial<BillingDetailFields>, now: Date = new Date()): PlanInfo {
  const isTrial = billing.status === 'trialing' || billing.plan === 'trial'
  const end = billing.trialEndsAt ? new Date(billing.trialEndsAt).getTime() : null
  const trialDaysLeft = isTrial && end !== null ? Math.max(0, Math.ceil((end - now.getTime()) / DAY)) : null
  const trialProgress = trialDaysLeft === null ? 0 : Math.min(1, Math.max(0, 1 - trialDaysLeft / TRIAL_DAYS))
  const periodOver =
    billing.status === 'canceled' && billing.currentPeriodEnd
      ? new Date(billing.currentPeriodEnd).getTime() < now.getTime()
      : false
  const features = billing.features?.length ? billing.features : planFeatures(billing.plan)
  const { included, used, extra } = billing.aiCredits
  return {
    code: billing.plan,
    name: planName(billing.plan),
    status: billing.status,
    isTrial,
    trialDaysLeft,
    trialProgress,
    // El servidor manda (reconoce también el pago muy atrasado); si no lo envía, se deduce por fechas.
    readOnly: billing.readOnly ?? (billing.status === 'expired' || periodOver || (isTrial && trialDaysLeft === 0)),
    ...(billing.readOnlyReason ? { readOnlyReason: billing.readOnlyReason } : {}),
    ...(billing.readOnlyMessage ? { readOnlyMessage: billing.readOnlyMessage } : {}),
    pastDue: billing.status === 'past_due',
    features,
    has: (feature) => features.includes(feature),
    credits: { included: included + extra, left: Math.max(0, included + extra - used) },
  }
}

/** Plan de la sesión actual (null mientras carga o sin sesión). */
export function usePlan(): PlanInfo | null {
  const { data } = useMe()
  return data ? describePlan(data.billing) : null
}
