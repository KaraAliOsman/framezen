import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, CircleAlert, UserPlus } from 'lucide-react'
import { PLAN_ORDER, PLANS, QUOTE_PRESET_IDS, TRIAL_DAYS, planLimits, type BillingDetailFields, type BillingState } from '@dekopen/shared'
import { ApiRequestError, humanError } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { formatLongDate } from '../../../lib/format'
import { getFormatter, useFormat, useGlossary, useT, type MessageKey, type MessageParams } from '../../../lib/i18n'
import { describePlan } from '../../../lib/plan'
import { qk } from '../../../lib/queryClient'
import { Button, Meter, SegmentedControl, Skeleton, toast, toastUndo } from '../../../ui'
import { SectionHeader } from '../components/SectionHeader'
import es from '../i18n/es'
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
import { useAssistantStatus } from '../lib/assistantsApi'

type Billing = BillingState & Partial<BillingDetailFields>
type Translate = (key: MessageKey<typeof es>, params?: MessageParams) => string

/** Ahorro anual en % frente a pagar mes a mes. */
export function yearlySavingPct(code: PaidPlan): number {
  const plan = PLANS[code]
  return Math.round((1 - plan.yearlyMonthly / plan.monthly) * 100)
}

const MAX_SAVING = Math.max(...PLAN_ORDER.map(yearlySavingPct))

/** «30 de noviembre» (con el año solo si no es el actual), en el idioma de la interfaz. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const fmt = getFormatter()
  return new Date(iso).getFullYear() === now.getFullYear() ? fmt.date(iso, 'dayMonth') : fmt.date(iso, 'long')
}

function isCanceled(billing: Billing): boolean {
  return Boolean(billing.cancelAtPeriodEnd) || billing.status === 'canceled'
}

/** Lo que incluye cada plan, armado con los datos de `PLANS` (cifras siempre al día). */
export function planHighlights(code: PaidPlan, t: Translate, planName: (code: string) => string, number: (n: number) => string): string[] {
  const plan = PLANS[code]
  const limits = planLimits(code)
  const seats = (n: number | null) => (n === null ? t('plan.features.seatsUnlimited') : t('plan.features.seats', { count: n }))
  const credits = t('plan.features.aiCredits', { credits: number(plan.aiCredits) })
  const assistants = t('plan.features.assistants', { count: limits.assistants })
  switch (code) {
    case 'taller':
      return [
        t('plan.features.quotesUnlimited'),
        t('plan.features.designer'),
        t('plan.features.documents', { count: QUOTE_PRESET_IDS.length }),
        t('plan.features.portal'),
        t('plan.features.workshop'),
        t('plan.features.localAssistant'),
      ]
    case 'pro':
      return [t('plan.features.everythingIn', { plan: planName('taller') }), seats(plan.seats), credits, assistants, t('plan.features.ownDesign'), t('plan.features.client3d'), t('plan.features.purchasing')]
    case 'empresa':
      return [t('plan.features.everythingIn', { plan: planName('pro') }), seats(plan.seats), credits, assistants, t('plan.features.stations')]
    case 'empresa2x':
      return [t('plan.features.everythingIn', { plan: planName('empresa') }), credits, assistants]
  }
}

/** Filas de la comparación: cifras donde hay cifra y un visto donde la función está incluida. */
export function compareRows(t: Translate, number: (n: number) => string): { id: string; label: string; value: (code: PaidPlan) => string | boolean }[] {
  const from = (min: PaidPlan) => (code: PaidPlan) => PLAN_ORDER.indexOf(code) >= PLAN_ORDER.indexOf(min)
  return [
    { id: 'seats', label: t('plan.people.title'), value: (code) => (PLANS[code].seats === null ? t('plan.table.unlimited') : number(PLANS[code].seats ?? 1)) },
    { id: 'credits', label: t('plan.credits.title'), value: (code) => (PLANS[code].aiCredits ? number(PLANS[code].aiCredits) : t('plan.table.dash')) },
    { id: 'assistants', label: t('plan.assistants.title'), value: (code) => number(planLimits(code).assistants) },
    { id: 'quotes', label: t('plan.features.quotesUnlimited'), value: from('taller') },
    { id: 'designer', label: t('plan.features.designer'), value: from('taller') },
    { id: 'documents', label: t('plan.features.documents', { count: QUOTE_PRESET_IDS.length }), value: from('taller') },
    { id: 'portal', label: t('plan.features.portal'), value: from('taller') },
    { id: 'workshop', label: t('plan.features.workshop'), value: from('taller') },
    { id: 'ownDesign', label: t('plan.features.ownDesign'), value: from('pro') },
    { id: 'client3d', label: t('plan.features.client3d'), value: from('pro') },
    { id: 'purchasing', label: t('plan.features.purchasing'), value: from('pro') },
    { id: 'stations', label: t('plan.features.stations'), value: from('empresa') },
  ]
}

function statusLine(billing: Billing, info: ReturnType<typeof describePlan>, t: Translate): { text: string; tone: 'ink' | 'ok' | 'warn' | 'bad' } {
  if (info.readOnly)
    return { text: info.readOnlyMessage ?? (info.isTrial ? t('plan.status.readOnlyTrial') : t('plan.status.readOnlyPlan')), tone: 'bad' }
  if (info.isTrial) return { text: t('plan.status.trial', { days: info.trialDaysLeft ?? TRIAL_DAYS }), tone: 'ink' }
  if (info.pastDue) return { text: t('plan.status.pastDue'), tone: 'warn' }
  if (isCanceled(billing) && billing.currentPeriodEnd) return { text: t('plan.status.activeUntil', { date: formatLongDate(billing.currentPeriodEnd) }), tone: 'warn' }
  if (billing.pendingChange && billing.currentPeriodEnd) return { text: t('plan.status.activeUntil', { date: formatLongDate(billing.currentPeriodEnd) }), tone: 'ok' }
  return { text: billing.currentPeriodEnd ? t('plan.status.renews', { date: formatLongDate(billing.currentPeriodEnd) }) : t('plan.status.active'), tone: 'ok' }
}

/** Lo que dice la pantalla al volver de Flow (/ajustes/plan?pago=…). */
const PAYMENT_RETURN: Record<string, 'ok' | 'info' | 'bad'> = { ok: 'ok', pendiente: 'info', rechazado: 'bad', desconocido: 'info' }

/** Plan y facturación: plan actual, prueba, créditos de IA, cambio de plan, cancelación e historial. */
export function PlanSection() {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  // Los planes se cobran en pesos chilenos, sea cual sea la moneda de tus cotizaciones.
  const clp = useFormat({ currency: 'CLP' })
  const me = useSession()
  const client = useQueryClient()
  const billingQuery = useBilling()
  const billing: Billing = billingQuery.data ?? me.billing
  const info = describePlan(billing)
  const checkout = useCheckout()
  const cancel = useCancelPlan()
  const resume = useResumePlan()
  const history = useBillingHistory(me.org.createdAt)
  const assistantStatus = useAssistantStatus()
  const [period, setPeriod] = useState<Period>(billing.period ?? 'yearly')
  const [busy, setBusy] = useState<PaidPlan | 'keep' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const isOwner = me.role === 'owner'
  const status = statusLine(billing, info, t)
  const used = billing.aiCredits.used
  const included = billing.aiCredits.included + billing.aiCredits.extra
  const canInvite = me.solo && (billing.seats === null || billing.seats > 1)
  const pending = !info.readOnly ? billing.pendingChange : undefined
  const canceled = !info.readOnly && !info.isTrial && isCanceled(billing)
  const paidActive = !info.isTrial && !info.readOnly && billing.plan !== 'trial'
  const canCancel = isOwner && paidActive && !canceled
  const currentPlan = billing.plan !== 'trial' ? billing.plan : null
  const entries = useMemo(() => withPendingChange(history.data ?? [], pending), [history.data, pending])
  const assistantLimit = assistantStatus.data?.assistants?.limit ?? planLimits(billing.plan).assistants
  const assistantsUsed = assistantStatus.data?.assistants?.used
  const periodWord = (p: Period) => t(`plan.periodWord.${p}`)

  // Vuelta desde Flow: un aviso y el estado fresco. El id evita el aviso doble.
  const paymentResult = params.get('pago')
  useEffect(() => {
    if (!paymentResult) return
    const kind = PAYMENT_RETURN[paymentResult] ? paymentResult : 'desconocido'
    const tone = PAYMENT_RETURN[kind]
    const text = t(`plan.paymentReturn.${kind as 'ok' | 'pendiente' | 'rechazado' | 'desconocido'}`)
    const options = { id: 'billing-return' }
    if (tone === 'ok') toast.success(text, options)
    else if (tone === 'bad') toast.error(text, options)
    else toast(text, options)
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
  }, [paymentResult, client, setParams, t])

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
          toast.success(result?.message ?? t('plan.done', { plan: g.plan(code) }))
        },
        onError: (error) => {
          setBusy(null)
          if (error instanceof ApiRequestError && (error.status === 404 || error.status === 405)) setNotice(t('plan.noOnlinePayment'))
          else toast.error(humanError(error))
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
      <SectionHeader title={t('plan.title')} description={t('plan.description')} />

      <section aria-label={t('plan.yourPlan')}>
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-3">
          <div className="min-w-0 sm:col-span-3">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="figure text-h3 font-medium text-fg-strong">{g.plan(billing.plan)}</span>
              {billing.period ? <span className="text-table text-fg-muted">{billing.period === 'yearly' ? t('plan.periodBadge.yearly') : t('plan.periodBadge.monthly')}</span> : null}
              {canceled ? <span className="text-table text-warning">{t('plan.notRenewing')}</span> : pending ? <span className="text-table text-fg">{t('plan.changeScheduled')}</span> : null}
            </p>
            <p className={cn('mt-1', status.tone === 'bad' ? 'text-danger' : status.tone === 'warn' ? 'text-warning' : 'text-fg-muted')}>{status.text}</p>
            {info.isTrial && info.trialDaysLeft !== null ? <Meter className="mt-3 max-w-60" value={Math.round(info.trialProgress * 100)} max={100} tone="auto" aria-label={t('plan.trialProgress')} /> : null}
          </div>
          <div className="min-w-0">
            {included > 0 ? (
              <>
                <p className="figure text-h3 font-medium text-fg-strong">
                  {t.rich('plan.credits.of', { used: fmt.number(used), included: fmt.number(included), muted: <span className="text-base font-normal text-fg-muted" /> })}
                </p>
                <p className="text-fg">{t('plan.credits.title')}</p>
                <Meter className="mt-2" value={used} max={included} tone="auto" aria-label={t('plan.credits.aria')} />
                <p className="mt-1.5 text-meta text-fg-muted">
                  {info.isTrial
                    ? t('plan.credits.duringTrial')
                    : billing.aiCredits.resetsAt
                      ? t('plan.credits.resets', { date: dayLabel(billing.aiCredits.resetsAt) })
                      : t('plan.credits.monthly')}
                </p>
              </>
            ) : (
              <>
                <p className="text-fg">{t('plan.credits.title')}</p>
                <p className="mt-1 text-table text-fg-muted">{t('plan.credits.localOnly')}</p>
              </>
            )}
          </div>
          <div className="min-w-0">
            <p className="figure text-h3 font-medium text-fg-strong">
              {fmt.number(billing.seatsUsed)}{' '}
              <span className="text-base font-normal text-fg-muted">{billing.seats === null ? t('plan.people.unlimited') : t('plan.people.of', { seats: fmt.number(billing.seats) })}</span>
            </p>
            <p className="text-fg">{t('plan.people.title')}</p>
            {billing.seats !== null ? <Meter className="mt-2" value={billing.seatsUsed} max={billing.seats} tone="auto" aria-label={t('plan.people.title')} /> : null}
            {canInvite && isOwner ? (
              <Link to="/ajustes/equipo" className="mt-1.5 inline-flex items-center gap-1.5 text-table font-medium text-accent-ink hover:underline">
                <UserPlus aria-hidden className="size-3.5" strokeWidth={1.75} />
                {t('plan.people.invite')}
              </Link>
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="figure text-h3 font-medium text-fg-strong">
              {assistantsUsed !== undefined ? (
                <>
                  {fmt.number(assistantsUsed)} <span className="text-base font-normal text-fg-muted">{t('plan.people.of', { seats: fmt.number(assistantLimit) })}</span>
                </>
              ) : (
                <span className="text-base font-normal text-fg-muted">{t('plan.assistants.upTo', { count: assistantLimit })}</span>
              )}
            </p>
            <p className="text-fg">{t('plan.assistants.title')}</p>
            {assistantsUsed !== undefined ? <Meter className="mt-2" value={assistantsUsed} max={Math.max(1, assistantLimit)} tone="auto" aria-label={t('plan.assistants.title')} /> : null}
            <Link to="/ajustes/asistentes" className="mt-1.5 inline-flex items-center gap-1.5 text-table font-medium text-accent-ink hover:underline">
              {t('plan.assistants.manage')}
            </Link>
          </div>
        </div>

        {pending && currentPlan ? (
          <div role="status" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-sm bg-sunken px-3.5 py-2.5">
            <CalendarClock aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
            <p className="min-w-0 flex-1 basis-64 text-table text-fg">
              {t.rich('plan.pendingBanner', {
                date: dayLabel(pending.at),
                plan: g.plan(pending.plan),
                period: periodWord(pending.period),
                current: g.plan(currentPlan),
                b: <span className="font-medium" />,
              })}
            </p>
            {isOwner ? (
              <Button size="sm" variant="secondary" onClick={keepCurrent} loading={busy === 'keep'} disabled={checkout.isPending && busy !== 'keep'}>
                {pending.plan === currentPlan && billing.period
                  ? t('plan.keepPeriod', { plan: g.plan(currentPlan), period: periodWord(billing.period) })
                  : t('plan.keep', { plan: g.plan(currentPlan) })}
              </Button>
            ) : null}
          </div>
        ) : null}

        {canceled && billing.currentPeriodEnd ? (
          <div role="status" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-sm bg-warning-bg px-3.5 py-2.5">
            <CircleAlert aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-warning" />
            <p className="min-w-0 flex-1 basis-64 text-table text-fg">{t.rich('plan.canceledBanner', { date: dayLabel(billing.currentPeriodEnd), b: <span className="font-medium" /> })}</p>
            {isOwner ? (
              <Button size="sm" variant="secondary" onClick={() => reactivate()} loading={resume.isPending}>
                {t('plan.reactivate')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {paidActive ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-table">
            <dl className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <dt className="text-fg-muted">{t('plan.payment.method')}</dt>
                <dd className="text-fg">
                  {billing.card
                    ? t('plan.payment.card', { brand: billing.card.brand ?? t('plan.payment.cardFallback'), last4: billing.card.last4 })
                    : billing.provider === 'dev'
                      ? t('plan.payment.dev')
                      : t('plan.payment.flow')}
                </dd>
              </div>
              {(billing.creditBalance ?? 0) > 0 ? (
                <div className="flex items-center gap-2">
                  <dt className="text-fg-muted">{t('plan.payment.balance')}</dt>
                  <dd className="font-medium text-fg-strong tabular">{clp.money(billing.creditBalance ?? 0)}</dd>
                  <dd className="text-fg-muted max-sm:hidden">{t('plan.payment.balanceHint')}</dd>
                </div>
              ) : null}
            </dl>
            {canCancel ? (
              <Button size="sm" variant="ghost" className="-mr-2 text-fg-muted hover:text-fg" onClick={cancelPlan} loading={cancel.isPending}>
                {t('plan.cancel')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="mt-12 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl min-w-0">
          <h3 className="text-h4 font-medium text-fg-strong">{info.isTrial || info.readOnly ? t('plan.chooseTitle') : t('plan.changeTitle')}</h3>
          <p className="mt-0.5 text-table text-fg-muted">{info.isTrial || info.readOnly ? t('plan.chooseHint') : t('plan.changeHint')}</p>
        </div>
        <SegmentedControl
          aria-label={t('plan.periodAria')}
          value={period}
          onValueChange={setPeriod}
          options={[
            { value: 'monthly', label: t('plan.periodBadge.monthly') },
            { value: 'yearly', label: t('plan.yearlySave', { pct: fmt.pct(MAX_SAVING) }) },
          ]}
        />
      </div>

      {notice ? (
        <p role="status" className="mt-4 rounded-sm bg-warning-bg px-3 py-2 text-table text-warning">
          {notice}
        </p>
      ) : null}

      <div className="scrollbar-quiet -mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-3xl border-collapse text-table">
          <caption className="sr-only">{t('plan.chooseTitle')}</caption>
          <thead>
            <tr className="align-top">
              <td className="sticky left-0 z-1 bg-canvas" />
              {PLAN_ORDER.map((code) => {
                const plan = PLANS[code]
                const name = g.plan(code)
                const current = billing.plan === code && !info.readOnly && (billing.period ?? period) === period
                const samePlan = billing.plan === code
                const scheduled = Boolean(pending && pending.plan === code && pending.period === period)
                const price = period === 'yearly' ? plan.yearlyMonthly : plan.monthly
                const recommended = plan.recommended && !samePlan
                return (
                  <th key={code} scope="col" data-plan={code} className="w-1/5 px-3 pb-4 text-left font-normal">
                    <div className="flex items-baseline gap-2">
                      <h4 className="text-h4 font-medium text-fg-strong">{name}</h4>
                      {scheduled ? (
                        <span className="text-meta text-fg-muted">{t('plan.card.scheduled')}</span>
                      ) : samePlan ? (
                        <span className="text-meta text-fg-muted">{t('plan.card.yours')}</span>
                      ) : info.isTrial && code === 'pro' ? (
                        <span className="text-meta text-fg-muted">{t('plan.card.trying')}</span>
                      ) : recommended ? (
                        <span className="text-meta text-fg-muted">{t('plan.card.recommended')}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 figure text-h3 font-medium text-fg-strong">{clp.money(price)}</p>
                    <p className="text-meta text-fg-muted tabular">
                      {t('plan.card.perMonth')}
                      <span className="block">
                        {period === 'yearly' ? t('plan.card.yearlyTotal', { total: clp.money(plan.yearlyMonthly * 12), pct: fmt.pct(yearlySavingPct(code)).replace(/\s/, '\u00a0') }) : t('plan.card.monthlyNoLock')}
                      </span>
                    </p>
                    <div className="mt-3">
                      {scheduled && pending ? (
                        <p className="flex min-h-9 items-center text-table text-fg-muted">{t('plan.card.from', { date: dayLabel(pending.at) })}</p>
                      ) : current ? (
                        <p className="flex min-h-9 items-center text-table text-fg-muted">{t('plan.card.current')}</p>
                      ) : (
                        <Button
                          variant={recommended ? 'primary' : 'secondary'}
                          className="w-full"
                          disabled={!isOwner || (checkout.isPending && busy !== code)}
                          loading={busy === code}
                          onClick={() => choose(code)}
                        >
                          {samePlan ? t('plan.card.toPeriod', { period: periodWord(period) }) : info.isTrial || info.readOnly ? t('plan.card.choose', { plan: name }) : t('plan.card.change', { plan: name })}
                        </Button>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {compareRows(t, (n) => fmt.number(n)).map((row) => (
              <tr key={row.id} className="border-t border-divider">
                <th scope="row" className="sticky left-0 z-1 bg-canvas py-2.5 pr-3 text-left font-normal text-fg">
                  {row.label}
                </th>
                {PLAN_ORDER.map((code) => {
                  const value = row.value(code)
                  return (
                    <td key={code} className="px-3 py-2.5 text-fg tabular">
                      {value === true ? <Check aria-label={t('plan.table.included')} strokeWidth={2} className="size-4 text-fg-strong" /> : value === false ? <span aria-label={t('plan.table.notIncluded')} className="text-fg-faint">{t('plan.table.dash')}</span> : value}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isOwner ? <p className="mt-3 text-table text-fg-muted">{t('plan.ownerOnly')}</p> : null}
      <p className="mt-3 text-meta text-fg-muted">{billing.provider === 'flow' ? t('plan.providerFlow') : t('plan.providerDev')}</p>

      <section aria-labelledby="billing-history" className="mt-12">
        <h3 id="billing-history" className="mb-2 text-h4 font-medium text-fg-strong">
          {t('plan.history.title')}
        </h3>
        {history.isPending ? (
          <Skeleton className="h-24" />
        ) : entries.length ? (
          <ul className="divide-y divide-divider">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2.5 text-table">
                <span className={cn('min-w-0 flex-1', entry.status === 'failed' ? 'text-danger' : 'text-fg')}>{entry.text}</span>
                {typeof entry.amount === 'number' ? <span className="text-fg-strong tabular">{clp.money(entry.amount)}</span> : null}
                <span className="shrink-0 text-fg-muted tabular">{fmt.date(entry.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-table text-fg-muted">{t('plan.history.empty')}</p>
        )}
      </section>
    </div>
  )
}
