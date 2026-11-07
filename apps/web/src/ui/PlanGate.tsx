import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, X } from 'lucide-react'
import { FEATURE_COPY, PLANS, type Feature } from '@dekopen/shared'
import { cn } from '../lib/cn'
import { useFormat, useGlossary, useT } from '../lib/i18n'
import { usePlan } from '../lib/plan'
import es from './i18n/es'
import { Badge } from './Badge'
import { buttonClass } from './Button'

export const UPGRADE_PATH = '/ajustes/plan'

export interface PlanGateProps {
  feature: Feature
  children?: ReactNode
  /**
   * Fuerza el resultado (vitrina, pruebas o decisiones del servidor). Si se omite, se usa el
   * plan de la sesión.
   */
  allowed?: boolean
  /**
   * 'card' = explicación completa con la función visible debajo (solo lectura).
   * 'inline' = una línea discreta (para menús, pestañas o filas).
   */
  variant?: 'card' | 'inline'
  /** Mostrar la función debajo, atenuada y sin interacción (por defecto sí: se ve, se explica). */
  preview?: boolean
  /** Permite cerrar la explicación (la función sigue en solo lectura). */
  dismissible?: boolean
  className?: string
}

/**
 * Límite de plan suave (SPEC §1.10): la función se ve, se explica (glosario `feature`) y ofrece
 * mejorar. Nunca rompe el flujo ni esconde datos.
 */
export function PlanGate(props: PlanGateProps) {
  if (props.allowed !== undefined) return <PlanGateView {...props} permitted={props.allowed} />
  return <PlanGateFromSession {...props} />
}

function PlanGateFromSession(props: PlanGateProps) {
  const plan = usePlan()
  return <PlanGateView {...props} permitted={plan?.has(props.feature) ?? false} />
}

function PlanGateView({
  feature,
  children,
  permitted,
  variant = 'card',
  preview = true,
  dismissible = false,
  className,
}: PlanGateProps & { permitted: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  if (permitted) return <>{children}</>

  const targetCode = FEATURE_COPY[feature].plan
  const target = PLANS[targetCode]
  const copy = g.feature(feature)
  const planLabel = g.plan(targetCode)

  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-table text-fg-muted', className)}>
        <Badge tone="ink" size="sm">
          {planLabel}
        </Badge>
        <span className="min-w-0">{copy.why}</span>
        <Link to={UPGRADE_PATH} className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover">
          {t('plan.see', { plan: planLabel })}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {dismissed ? null : (
        <section
          aria-label={t('plan.available', { feature: copy.title, plan: planLabel })}
          className="relative flex flex-col gap-4 rounded-md bg-sunken p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-fg-strong">{copy.title}</h3>
              <Badge tone="ink" size="sm">
                {t('plan.badge', { plan: planLabel })}
              </Badge>
            </div>
            <p className="max-w-xl text-fg-muted">{copy.why}</p>
            <p className="text-table text-fg-muted">
              {t.rich('plan.price', {
                b: <span className="font-medium text-fg tabular" />,
                // Los precios de los planes están en pesos chilenos, sea cual sea la moneda de la empresa.
                price: fmt.money(target.yearlyMonthly, { currency: 'CLP' }),
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link to={UPGRADE_PATH} className={buttonClass('primary', 'md')}>
              {t('plan.upgrade', { plan: planLabel })}
            </Link>
          </div>
          {dismissible ? (
            <button
              type="button"
              aria-label={t('plan.dismiss')}
              onClick={() => setDismissed(true)}
              className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-sm text-fg-muted transition-colors duration-100 hover:bg-surface/70 hover:text-fg"
            >
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </section>
      )}
      {preview && children ? (
        <div inert className="pointer-events-none opacity-50 saturate-50 select-none" aria-hidden="true">
          {children}
        </div>
      ) : null}
    </div>
  )
}
