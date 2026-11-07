import { PLAN_ORDER, PLANS, TRIAL_DAYS, type Feature, type Plan } from '@dekopen/shared'
import { clsx } from 'clsx'
import { Check, Minus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useT } from '../../../lib/i18n'
import { SegmentedControl } from '../../../ui'
import { ButtonLink, Container, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import es from '../i18n/es'
import { formatClp, formatInt, formatPct } from '../lib/format'
import { landingPlans, maxSavingsPct, seatsLabel, type BillingPeriod, type PlanQuote } from '../lib/plans'

type RowKey = 'quotes' | 'brands' | 'portal' | 'workshop' | 'client3d' | 'purchasing' | 'templates' | 'roles' | 'stations'

/** Filas de la tabla: lo que todos traen y lo que cambia de plan en plan, leído de `PLANS`. */
const ROWS: { key: RowKey; has: (plan: Plan) => boolean }[] = [
  { key: 'quotes', has: () => true },
  { key: 'brands', has: () => true },
  { key: 'portal', has: () => true },
  { key: 'workshop', has: () => true },
  { key: 'client3d', has: (plan) => includes(plan, 'client3d') },
  { key: 'purchasing', has: (plan) => includes(plan, 'purchasing') },
  { key: 'templates', has: (plan) => includes(plan, 'custom_templates') },
  { key: 'roles', has: (plan) => includes(plan, 'roles') },
  { key: 'stations', has: (plan) => includes(plan, 'stations') },
]

function includes(plan: Plan, feature: Feature) {
  return plan.features.includes(feature)
}

function Yes({ value, label }: { value: boolean; label: string }) {
  const t = useT(es)
  const Icon = value ? Check : Minus
  return (
    <>
      <Icon aria-hidden strokeWidth={value ? 2 : 1.5} className={clsx('size-4', value ? 'text-fg-strong' : 'text-fg-faint')} />
      <span className="sr-only">{`${label}: ${value ? t('plans.yes') : t('plans.no')}`}</span>
    </>
  )
}

function Price({ quote, period }: { quote: PlanQuote; period: BillingPeriod }) {
  const t = useT(es)
  return (
    <>
      <p className="tabular font-display text-h1 font-medium text-fg-strong">{formatClp(quote.perMonth)}</p>
      <p className="text-table text-fg-muted">{t('plans.perMonth')}</p>
      {period === 'yearly' ? <p className="tabular mt-1 text-table text-fg-muted">{t('plans.yearlyTotal', { total: formatClp(quote.yearlyTotal) })}</p> : null}
    </>
  )
}

/** Planes en tabla (una columna por plan). En el teléfono, un plan a la vez. */
export function Plans() {
  const t = useT(es)
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [phonePlan, setPhonePlan] = useState<Plan['code']>('pro')
  const plans = landingPlans(period)
  const savings = formatPct(maxSavingsPct(), 0)
  const assistant = (plan: Plan): ReactNode => (plan.aiCredits > 0 ? t('plans.credits', { credits: formatInt(plan.aiCredits) }) : t('plans.localCommands'))
  const current = plans.find((quote) => quote.plan.code === phonePlan) ?? plans[0]!

  return (
    <Section id="planes" labelledBy="plans-title">
      <Container>
        <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <SectionTitle id="plans-title">{t('plans.title')}</SectionTitle>
            <Lead className="mt-5">{t('plans.lead', { days: TRIAL_DAYS })}</Lead>
          </div>
          <div className="lg:col-span-5 lg:justify-self-end">
            <SegmentedControl
              aria-label={t('plans.period')}
              value={period}
              onValueChange={setPeriod}
              options={[
                { value: 'monthly', label: t('plans.monthly') },
                { value: 'yearly', label: t('plans.yearly', { pct: savings }) },
              ]}
            />
          </div>
        </Reveal>

        {/* Teléfono: elegir plan y leer sus filas. */}
        <div className="mt-10 md:hidden">
          <SegmentedControl
            aria-label={t('plans.choose')}
            value={phonePlan}
            onValueChange={setPhonePlan}
            block
            options={plans.map(({ plan }) => ({ value: plan.code, label: plan.name }))}
          />
          <div className="mt-6">
            <Price quote={current} period={period} />
            <ButtonLink to={`/crear-cuenta?plan=${current.plan.code}`} variant="ink" size="lg" className="mt-4 w-full">
              {t('plans.cta')}
            </ButtonLink>
          </div>
          <dl className="mt-6 border-t border-divider text-base">
            <div className="flex items-center justify-between gap-4 border-b border-divider py-2.5">
              <dt className="text-fg-muted">{t('plans.rows.seats')}</dt>
              <dd className="text-right text-fg">{seatsLabel(current.plan.seats)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-divider py-2.5">
              <dt className="text-fg-muted">{t('plans.rows.assistant')}</dt>
              <dd className="text-right text-fg">{assistant(current.plan)}</dd>
            </div>
            {ROWS.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-4 border-b border-divider py-2.5">
                <dt className="text-fg-muted">{t(`plans.rows.${row.key}`)}</dt>
                <dd>
                  <Yes value={row.has(current.plan)} label={t(`plans.rows.${row.key}`)} />
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Pantalla ancha: la tabla comparativa. */}
        <div className="mt-14 hidden md:block">
          <table className="w-full table-fixed border-collapse text-base">
            <caption className="sr-only">{t('plans.caption')}</caption>
            <thead>
              <tr className="align-bottom">
                <td className="w-1/4" />
                {plans.map((quote) => (
                  <th key={quote.plan.code} scope="col" className="pr-4 pb-6 text-left font-normal">
                    <p className="text-lead font-medium text-fg-strong">
                      {quote.plan.name}
                      {quote.plan.recommended ? <span className="ml-2 text-table font-normal text-fg-muted">{t('plans.recommended')}</span> : null}
                    </p>
                    <div className="mt-3">
                      <Price quote={quote} period={period} />
                    </div>
                    <ButtonLink to={`/crear-cuenta?plan=${quote.plan.code}`} variant={quote.plan.recommended ? 'ink' : 'secondary'} className="mt-4">
                      {t('plans.cta')}
                    </ButtonLink>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <PlanRow label={t('plans.rows.seats')}>{(plan) => seatsLabel(plan.seats)}</PlanRow>
              <PlanRow label={t('plans.rows.assistant')}>{assistant}</PlanRow>
              {ROWS.map((row) => (
                <PlanRow key={row.key} label={t(`plans.rows.${row.key}`)}>
                  {(plan) => <Yes value={row.has(plan)} label={t(`plans.rows.${row.key}`)} />}
                </PlanRow>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 max-w-[80ch] text-table text-fg-muted">{t('plans.taxNote')}</p>
        <p className="mt-2 max-w-[80ch] text-table text-fg-muted">{t('plans.creditsNote')}</p>
      </Container>
    </Section>
  )
}

function PlanRow({ label, children }: { label: string; children: (plan: Plan) => ReactNode }) {
  return (
    <tr className="border-t border-divider">
      <th scope="row" className="py-2.5 pr-4 text-left font-normal text-fg-muted">
        {label}
      </th>
      {PLAN_ORDER.map((code) => (
        <td key={code} className="py-2.5 pr-4 text-fg">
          {children(PLANS[code])}
        </td>
      ))}
    </tr>
  )
}
