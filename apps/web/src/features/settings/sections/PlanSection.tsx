import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, CircleAlert, CreditCard, Receipt, UserPlus } from 'lucide-react'
import { PLAN_ORDER, PLANS, TRIAL_DAYS, type BillingDetailFields, type BillingState } from '@framezen/shared'
import { ApiRequestError, humanError } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { formatCLP, formatDate, formatLongDate, formatNumber } from '../../../lib/format'
import { describePlan } from '../../../lib/plan'
import { qk } from '../../../lib/queryClient'
import { Badge, Button, SegmentedControl, Skeleton, toast, toastUndo } from '../../../ui'
import { SectionHeader } from '../components/SectionHeader'
import {
  billingKey,
  useBilling,
  useBillingHistory,
  useCancelPlan,
  useCheckout,
  useResumePlan,
  withPendingChange,
  type PaidPlan,
  type Period,
} from '../lib/accountApi'

type Billing = BillingState & Partial<BillingDetailFields>

/** Ahorro anual en % frente a pagar mes a mes. */
export function yearlySavingPct(code: PaidPlan): number {
  const plan = PLANS[code]
  return Math.round((1 - plan.yearlyMonthly / plan.monthly) * 100)
}

const MAX_SAVING = Math.max(...PLAN_ORDER.map(yearlySavingPct))

const PERIOD_LABEL: Record<Period, string> = { monthly: 'mensual', yearly: 'anual' }

/** «30 de noviembre» (con el año solo si no es el actual). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const long = formatLongDate(iso)
  return new Date(iso).getFullYear() === now.getFullYear() ? long.replace(/ de \d{4}$/, '') : long
}

function isCanceled(billing: Billing): boolean {
  return Boolean(billing.cancelAtPeriodEnd) || billing.status === 'canceled'
}

function statusLine(billing: Billing, info: ReturnType<typeof describePlan>): { text: string; tone: 'ink' | 'ok' | 'warn' | 'bad' } {
  if (info.readOnly)
    return {
      text:
        info.readOnlyMessage ??
        (info.isTrial
          ? 'Tu prueba terminó: puedes ver y exportar todo; elige un plan para seguir cotizando.'
          : 'Tu plan terminó: puedes ver y exportar todo; elige un plan para seguir cotizando.'),
      tone: 'bad',
    }
  if (info.isTrial)
    return {
      text:
        info.trialDaysLeft === 1
          ? 'Te queda 1 día de prueba con todo lo de Pro.'
          : `Te quedan ${info.trialDaysLeft ?? TRIAL_DAYS} días de prueba con todo lo de Pro. Sin tarjeta.`,
      tone: 'ink',
    }
  if (info.pastDue) return { text: 'No pudimos cobrar el último pago. Todo sigue funcionando; actualiza tu medio de pago cuando puedas.', tone: 'warn' }
  if (isCanceled(billing) && billing.currentPeriodEnd) return { text: `Activo hasta el ${formatLongDate(billing.currentPeriodEnd)}.`, tone: 'warn' }
  if (billing.pendingChange && billing.currentPeriodEnd) return { text: `Activo hasta el ${formatLongDate(billing.currentPeriodEnd)}.`, tone: 'ok' }
  return {
    text: billing.currentPeriodEnd ? `Activo. Se renueva el ${formatLongDate(billing.currentPeriodEnd)}.` : 'Activo.',
    tone: 'ok',
  }
}

/** Lo que dice la pantalla al volver de Flow (/ajustes/plan?pago=…). */
const PAYMENT_RETURN: Record<string, { text: string; tone: 'ok' | 'info' | 'bad' }> = {
  ok: { text: 'Pago recibido: tu plan quedó activo.', tone: 'ok' },
  pendiente: { text: 'Flow está confirmando tu pago. Puedes seguir trabajando; el plan se activa solo apenas quede listo.', tone: 'info' },
  rechazado: { text: 'Flow no pudo hacer el cobro y no se cargó nada. Puedes intentarlo de nuevo cuando quieras.', tone: 'bad' },
  desconocido: { text: 'Aún no pudimos confirmar el pago. Si se cobró, tu plan se activa solo en unos minutos.', tone: 'info' },
}

/** Plan y facturación: plan actual, prueba, créditos de Marco, cambio de plan, cancelación e historial. */
export function PlanSection() {
  const me = useSession()
  const client = useQueryClient()
  const billingQuery = useBilling()
  const billing: Billing = billingQuery.data ?? me.billing
  const info = describePlan(billing)
  const checkout = useCheckout()
  const cancel = useCancelPlan()
  const resume = useResumePlan()
  const history = useBillingHistory(me.org.createdAt)
  const [period, setPeriod] = useState<Period>(billing.period ?? 'yearly')
  const [busy, setBusy] = useState<PaidPlan | 'keep' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const isOwner = me.role === 'owner'
  const status = statusLine(billing, info)
  const used = billing.aiCredits.used
  const included = billing.aiCredits.included + billing.aiCredits.extra
  const usedPct = included > 0 ? Math.min(100, (used / included) * 100) : 0
  const canInvite = me.solo && (billing.seats === null || billing.seats > 1)
  const pending = !info.readOnly ? billing.pendingChange : undefined
  const canceled = !info.readOnly && !info.isTrial && isCanceled(billing)
  const paidActive = !info.isTrial && !info.readOnly && billing.plan !== 'trial'
  const canCancel = isOwner && paidActive && !canceled
  const currentPlan = billing.plan !== 'trial' ? billing.plan : null
  const entries = useMemo(() => withPendingChange(history.data ?? [], pending), [history.data, pending])

  // Vuelta desde Flow: un aviso y el estado fresco. El id evita el aviso doble.
  const paymentResult = params.get('pago')
  useEffect(() => {
    if (!paymentResult) return
    const copy = PAYMENT_RETURN[paymentResult] ?? PAYMENT_RETURN.desconocido!
    const options = { id: 'billing-return' }
    if (copy.tone === 'ok') toast.success(copy.text, options)
    else if (copy.tone === 'bad') toast.error(copy.text, options)
    else toast(copy.text, options)
    void client.invalidateQueries({ queryKey: billingKey })
    void client.invalidateQueries({ queryKey: qk.me })
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('pago')
        return next
      },
      { replace: true },
    )
  }, [paymentResult, client, setParams])

  const choose = (code: PaidPlan, chosenPeriod: Period = period, key: PaidPlan | 'keep' = code) => {
    setNotice(null)
    setBusy(key)
    checkout.mutate(
      { plan: code, period: chosenPeriod },
      {
        onSuccess: (result) => {
          if (result?.url) {
            window.location.assign(result.url)
            return
          }
          setBusy(null)
          toast.success(result?.message ?? `Listo: ya estás en ${PLANS[code].name}`)
        },
        onError: (error) => {
          setBusy(null)
          if (error instanceof ApiRequestError && (error.status === 404 || error.status === 405)) {
            setNotice('Todavía no podemos cobrar en línea desde aquí. Tu cuenta sigue funcionando igual; vuelve a intentarlo en un rato.')
          } else {
            toast.error(humanError(error))
          }
        },
      },
    )
  }

  /** «Mantener Empresa»: elegir el plan vigente anula la baja programada. */
  const keepCurrent = () => {
    if (!currentPlan || !billing.period) return
    choose(currentPlan, billing.period, 'keep')
  }

  const reactivate = (after?: { plan: PaidPlan; period: Period }) =>
    resume.mutate(undefined, {
      onSuccess: (result) => {
        // Si había una baja programada antes de cancelar, la dejamos como estaba.
        if (after) checkout.mutate(after, { onSuccess: (r) => toast.success(r?.message ?? result.message), onError: (e) => toast.error(humanError(e)) })
        else toast.success(result.message)
      },
      onError: (error) => toast.error(humanError(error)),
    })

  const cancelPlan = () => {
    const before = pending ? { plan: pending.plan, period: pending.period } : undefined
    cancel.mutate(undefined, {
      onSuccess: (result) => toastUndo(result.message, () => reactivate(before)),
      onError: (error) => toast.error(humanError(error)),
    })
  }

  return (
    <div>
      <SectionHeader title="Plan y facturación" description="Precios en pesos chilenos más IVA. Cambias o cancelas cuando quieras." />

      <section aria-label="Tu plan" className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
        <div className="grid grid-cols-1 gap-px bg-paper-200 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="bg-paper-0 p-5">
            <p className="text-[13px] text-paper-600">Tu plan</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-h2 font-semibold tracking-[-0.01em] text-paper-900">{info.name}</span>
              {billing.period ? <Badge tone="neutral">{billing.period === 'yearly' ? 'Anual' : 'Mensual'}</Badge> : null}
              {canceled ? <Badge tone="warn">No se renueva</Badge> : pending ? <Badge tone="ink">Cambio programado</Badge> : null}
            </div>
            <p className={cn('mt-2 text-[13px] leading-[18px]', status.tone === 'bad' ? 'text-bad-800' : status.tone === 'warn' ? 'text-warn-800' : 'text-paper-600')}>
              {status.text}
            </p>
            {info.isTrial && info.trialDaysLeft !== null ? (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-paper-200" aria-hidden>
                <div className="h-full rounded-full bg-ink-600" style={{ width: `${Math.round(info.trialProgress * 100)}%` }} />
              </div>
            ) : null}
          </div>
          <div className="bg-paper-0 p-5">
            <p className="text-[13px] text-paper-600">Créditos de Marco</p>
            {included > 0 ? (
              <>
                <p className="mt-1 text-h3 font-semibold text-paper-900 tabular">
                  {formatNumber(used)} <span className="text-base font-normal text-paper-600">de {formatNumber(included)}</span>
                </p>
                <div
                  className="mt-3 h-1 overflow-hidden rounded-full bg-paper-200"
                  role="meter"
                  aria-label="Créditos de Marco usados"
                  aria-valuemin={0}
                  aria-valuemax={included}
                  aria-valuenow={used}
                >
                  <div className={cn('h-full rounded-full', usedPct > 85 ? 'bg-warn-600' : 'bg-ink-600')} style={{ width: `${usedPct}%` }} />
                </div>
                <p className="mt-2 text-meta text-paper-600">{info.isTrial ? 'Durante la prueba' : 'Se renuevan cada mes'}</p>
              </>
            ) : (
              <p className="mt-1 text-[13px] leading-[18px] text-paper-600">
                Tu plan usa Marco en modo local (sin IA): entiende frases como «agrega una corredera de 1500 x 1200».
              </p>
            )}
          </div>
          <div className="bg-paper-0 p-5">
            <p className="text-[13px] text-paper-600">Personas</p>
            <p className="mt-1 text-h3 font-semibold text-paper-900 tabular">
              {billing.seatsUsed} <span className="text-base font-normal text-paper-600">{billing.seats === null ? 'sin límite' : `de ${billing.seats}`}</span>
            </p>
            {canInvite && isOwner ? (
              <Link to="/ajustes/equipo" className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-700">
                <UserPlus aria-hidden className="size-3.5" strokeWidth={1.75} />
                Invitar a alguien
              </Link>
            ) : null}
          </div>
        </div>

        {pending && currentPlan ? (
          <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-ink-100 bg-ink-50 px-5 py-3">
            <CalendarClock aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-ink-700" />
            <p className="min-w-0 flex-1 basis-64 text-[13px] leading-[18px] text-paper-900">
              <span className="font-medium">
                Desde el {dayLabel(pending.at)} pasas a {PLANS[pending.plan].name} {PERIOD_LABEL[pending.period]}.
              </span>{' '}
              Hasta entonces sigues con {PLANS[currentPlan].name} y todo lo que incluye, sin cobros extra.
            </p>
            {isOwner ? (
              <Button size="sm" variant="secondary" onClick={keepCurrent} loading={busy === 'keep'} disabled={checkout.isPending && busy !== 'keep'}>
                Mantener {PLANS[currentPlan].name}
                {pending.plan === currentPlan && billing.period ? ` ${PERIOD_LABEL[billing.period]}` : ''}
              </Button>
            ) : null}
          </div>
        ) : null}

        {canceled && billing.currentPeriodEnd ? (
          <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-warn-600/25 bg-warn-50 px-5 py-3">
            <CircleAlert aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-warn-600" />
            <p className="min-w-0 flex-1 basis-64 text-[13px] leading-[18px] text-paper-900">
              <span className="font-medium">Cancelaste la renovación.</span> Tu plan sigue activo hasta el {dayLabel(billing.currentPeriodEnd)}; después la
              cuenta queda en modo lectura, con todo disponible para descargar.
            </p>
            {isOwner ? (
              <Button size="sm" variant="secondary" onClick={() => reactivate()} loading={resume.isPending}>
                Reactivar plan
              </Button>
            ) : null}
          </div>
        ) : null}

        {paidActive ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-paper-200 px-5 py-3 text-[13px] leading-[18px]">
            <dl className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <dt className="flex items-center gap-2 text-paper-600">
                  <CreditCard aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
                  Medio de pago
                </dt>
                <dd className="text-paper-900">
                  {billing.card
                    ? `${billing.card.brand ?? 'Tarjeta'} terminada en ${billing.card.last4}`
                    : billing.provider === 'dev'
                      ? 'Modo de prueba, sin cobros'
                      : 'Lo registras en Flow al pagar'}
                </dd>
              </div>
              {(billing.creditBalance ?? 0) > 0 ? (
                <div className="flex items-center gap-2">
                  <dt className="text-paper-600">Saldo a favor</dt>
                  <dd className="font-medium text-paper-900 tabular">{formatCLP(billing.creditBalance ?? 0)}</dd>
                  <dd className="text-paper-600 max-sm:hidden">se descuenta de tu próximo cambio</dd>
                </div>
              ) : null}
            </dl>
            {canCancel ? (
              <Button size="sm" variant="ghost" className="-mr-2 text-paper-600 hover:text-paper-900" onClick={cancelPlan} loading={cancel.isPending}>
                Cancelar suscripción
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h3 className="font-semibold text-paper-900">{info.isTrial || info.readOnly ? 'Elige tu plan' : 'Cambiar de plan'}</h3>
          <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">
            {info.isTrial || info.readOnly
              ? 'El plan parte hoy. Todo lo que hiciste hasta ahora sigue aquí.'
              : 'Si subes, rige hoy y descontamos los días que no usaste. Si bajas, rige desde tu próxima renovación. Nada de lo que tienes se pierde.'}
          </p>
        </div>
        <SegmentedControl
          aria-label="Forma de pago"
          value={period}
          onValueChange={setPeriod}
          options={[
            { value: 'monthly', label: 'Mensual' },
            { value: 'yearly', label: `Anual · ahorra hasta ${MAX_SAVING} %` },
          ]}
        />
      </div>

      {notice ? (
        <p role="status" className="mt-4 rounded-md border border-warn-600/25 bg-warn-50 px-3 py-2 text-[13px] text-warn-800">
          {notice}
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((code) => {
          const plan = PLANS[code]
          const current = billing.plan === code && !info.readOnly && (billing.period ?? period) === period
          const samePlan = billing.plan === code
          const scheduled = Boolean(pending && pending.plan === code && pending.period === period)
          const price = period === 'yearly' ? plan.yearlyMonthly : plan.monthly
          return (
            <article
              key={code}
              className={cn(
                'relative flex flex-col rounded-lg border bg-paper-0 p-5',
                samePlan ? 'border-ink-600 shadow-[inset_0_0_0_1px_var(--ink-600)]' : scheduled ? 'border-ink-100' : 'border-paper-200',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-paper-900">{plan.name}</h4>
                {scheduled ? (
                  <Badge tone="ink">Programado</Badge>
                ) : samePlan ? (
                  <Badge tone="ink">Tu plan</Badge>
                ) : info.isTrial && code === 'pro' ? (
                  <Badge tone="ink">Lo estás probando</Badge>
                ) : plan.recommended ? (
                  <Badge tone="outline">Recomendado</Badge>
                ) : null}
              </div>
              <p className="mt-1 min-h-9 text-[13px] leading-[18px] text-paper-600">{plan.tagline}</p>
              <p className="mt-4 text-h2 font-semibold tracking-[-0.01em] text-paper-900 tabular">{formatCLP(price)}</p>
              <p className="text-meta text-paper-600 tabular">
                al mes + IVA
                <span className="block">
                  {period === 'yearly' ? `${formatCLP(plan.yearlyMonthly * 12)} al año · ahorras ${yearlySavingPct(code)} %` : 'Mes a mes, sin permanencia'}
                </span>
              </p>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-[13px] leading-[18px] text-paper-900">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-ok-600" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {scheduled && pending ? (
                  <p className="flex min-h-9 items-center justify-center rounded-sm bg-ink-50 px-2 text-center text-[13px] font-medium text-ink-700">
                    Desde el {dayLabel(pending.at)}
                  </p>
                ) : current ? (
                  <p className="flex h-9 items-center justify-center rounded-sm bg-paper-100 text-[13px] font-medium text-paper-600">Tu plan actual</p>
                ) : (
                  <Button
                    variant={plan.recommended || samePlan ? 'primary' : 'secondary'}
                    className="w-full"
                    disabled={!isOwner || (checkout.isPending && busy !== code)}
                    loading={busy === code}
                    onClick={() => choose(code)}
                  >
                    {samePlan ? `Pasar a ${period === 'yearly' ? 'anual' : 'mensual'}` : info.isTrial || info.readOnly ? `Elegir ${plan.name}` : `Cambiar a ${plan.name}`}
                  </Button>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {!isOwner ? <p className="mt-3 text-[13px] text-paper-600">Solo el dueño de la cuenta puede cambiar o cancelar el plan.</p> : null}
      <p className="mt-3 text-meta text-paper-600">
        {billing.provider === 'flow' ? 'Pagas con tarjeta o transferencia a través de Flow.' : 'Modo de prueba: el cambio de plan se activa al instante, sin cobro.'}
      </p>

      <section aria-labelledby="billing-history" className="mt-10">
        <h3 id="billing-history" className="mb-2 font-semibold text-paper-900">
          Historial
        </h3>
        {history.isPending ? (
          <Skeleton className="h-24" />
        ) : entries.length ? (
          <ul className="divide-y divide-paper-200 overflow-hidden rounded-md border border-paper-200 bg-paper-0">
            {entries.map((entry) => {
              const Icon = entry.status === 'scheduled' ? CalendarClock : Receipt
              return (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                  <Icon
                    aria-hidden
                    strokeWidth={1.75}
                    className={cn(
                      'size-4 shrink-0',
                      entry.status === 'failed' ? 'text-bad-600' : entry.status === 'paid' ? 'text-ok-600' : entry.status === 'scheduled' ? 'text-ink-600' : 'text-paper-600',
                    )}
                  />
                  <span className="min-w-0 flex-1 text-paper-900">{entry.text}</span>
                  {typeof entry.amount === 'number' ? <span className="tabular text-paper-900">{formatCLP(entry.amount)}</span> : null}
                  <span className="shrink-0 text-paper-600 tabular">{formatDate(entry.at)}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-paper-200 bg-paper-0 px-4 py-5 text-[13px] text-paper-600">Aquí verás tus pagos y cambios de plan.</p>
        )}
      </section>
    </div>
  )
}
