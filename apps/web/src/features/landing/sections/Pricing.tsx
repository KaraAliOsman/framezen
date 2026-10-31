import { TRIAL_CREDITS, TRIAL_DAYS } from '@framezen/shared'
import { clsx } from 'clsx'
import { Check } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { RadioGroup } from 'radix-ui'
import { useState } from 'react'
import { ButtonLink, EASE_OUT, Kicker, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { AnimatedNumber } from '../designer/AnimatedNumber'
import { formatClp, formatInt } from '../lib/format'
import { landingPlans, maxSavingsPct, seatsLabel, type BillingPeriod, type PlanQuote } from '../lib/plans'

const INCLUDED = [
  'Cotizaciones y clientes ilimitados',
  'Todas las marcas de perfiles',
  'Portal del cliente con aceptación',
  'Documentos de taller',
  'Tus datos siempre exportables',
]

export function Pricing() {
  const reduce = useReducedMotion()
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const plans = landingPlans(period)
  const savings = maxSavingsPct()

  return (
    <Section id="planes" labelledBy="pricing-title" className="border-t border-paper-200">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Kicker index="06">Planes</Kicker>
          <SectionTitle id="pricing-title">Precios claros, sin cobrar por marca.</SectionTitle>
        </div>
        <div className="lg:col-span-5 lg:pt-10">
          <Lead className="mt-0">
            Prueba {TRIAL_DAYS} días con todo lo de Pro y {formatInt(TRIAL_CREDITS)} créditos para Marco, sin tarjeta. Al
            terminar eliges tu plan; si no, tu cuenta queda en modo lectura y puedes exportar todo.
          </Lead>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3">
        <RadioGroup.Root
          value={period}
          onValueChange={(value) => setPeriod(value as BillingPeriod)}
          aria-label="Forma de pago"
          orientation="horizontal"
          loop
          className="flex rounded-sm border border-paper-200 bg-paper-100 p-0.5"
        >
          {(
            [
              { id: 'monthly', label: 'Mensual' },
              { id: 'yearly', label: 'Anual' },
            ] as const
          ).map((item) => (
            <RadioGroup.Item
              key={item.id}
              value={item.id}
              className={clsx(
                'relative h-9 rounded-[5px] px-4 text-[14px] font-medium transition-colors duration-[120ms]',
                item.id === period ? 'text-paper-900' : 'text-paper-600 hover:text-paper-900',
              )}
            >
              {item.id === period ? (
                <motion.span
                  layoutId="pricing-period-indicator"
                  aria-hidden
                  className="absolute inset-0 rounded-[5px] border border-paper-200 bg-paper-0 shadow-[0_1px_2px_rgb(31_28_24/0.06)]"
                  transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
                />
              ) : null}
              <span className="relative">{item.label}</span>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
        <p className="text-[13px] text-paper-600">
          Pagando el año ahorras hasta <span className="tabular font-medium text-ok-600">{savings} %</span>
        </p>
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((quote, index) => (
          <Reveal as="li" key={quote.plan.code} delay={index * 0.04} className="flex">
            <PlanCard quote={quote} period={period} />
          </Reveal>
        ))}
      </ul>

      <div className="mt-10 flex flex-col gap-4 border-t border-paper-200 pt-6 lg:flex-row lg:items-start lg:justify-between">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-paper-900">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <Check aria-hidden strokeWidth={1.75} className="size-4 text-ok-600" />
              {item}
            </li>
          ))}
        </ul>
        <p className="max-w-[44ch] text-[13px] leading-5 text-paper-600 lg:text-right">
          Precios en pesos chilenos, netos: se suma IVA (19 %). Pagas con Flow, mes a mes o por año, sin contrato de
          permanencia.
        </p>
      </div>
    </Section>
  )
}

function PlanCard({ quote, period }: { quote: PlanQuote; period: BillingPeriod }) {
  const { plan } = quote
  const recommended = Boolean(plan.recommended)

  return (
    <div
      className={clsx(
        'relative flex w-full flex-col rounded-lg bg-paper-0 p-6',
        recommended ? 'border-2 border-ink-600 shadow-float' : 'border border-paper-200',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[20px] leading-7 font-semibold text-paper-900">{plan.name}</h3>
        {recommended ? (
          <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[12px] font-medium text-ink-700">Recomendado</span>
        ) : null}
      </div>
      <p className="mt-1 min-h-10 text-[14px] leading-5 text-paper-600">{plan.tagline}</p>

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="text-[36px] leading-10 font-semibold tracking-[-0.02em] text-paper-900">
          <AnimatedNumber value={quote.perMonth} format={formatClp} />
        </span>
      </div>
      <p className="mt-1 text-[13px] text-paper-600">+ IVA al mes</p>
      <p className="mt-2 min-h-10 text-[13px] leading-5 text-paper-600">
        {period === 'yearly' ? (
          <>
            <span className="tabular">{formatClp(quote.yearlyTotal)}</span> + IVA al año. Ahorras{' '}
            <span className="tabular font-medium text-ok-600">{formatClp(quote.yearlySavings)}</span>.
          </>
        ) : (
          <>
            O <span className="tabular">{formatClp(plan.yearlyMonthly)}</span> al mes pagando el año.
          </>
        )}
      </p>

      <ButtonLink
        to={`/crear-cuenta?plan=${plan.code}`}
        variant={recommended ? 'primary' : 'secondary'}
        className="mt-6 w-full"
        aria-label={`Probar gratis el plan ${plan.name}`}
      >
        Probar gratis
      </ButtonLink>
      <p className="mt-2 text-center text-[12px] text-paper-600">Sin tarjeta · {TRIAL_DAYS} días</p>

      <p className="mt-6 border-t border-paper-200 pt-5 text-[13px] font-medium text-paper-900">{seatsLabel(plan.seats)}</p>
      <ul className="mt-3 grid gap-2.5 text-[14px] leading-5 text-paper-900">
        {plan.highlights.map((highlight) => (
          <li key={highlight} className="flex gap-2">
            <Check aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ink-600" />
            <span className="tabular">{highlight}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
