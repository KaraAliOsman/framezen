import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, X } from 'lucide-react'
import { FEATURE_COPY, PLANS, type Feature } from '@framezen/shared'
import { cn } from '../lib/cn'
import { formatCLP } from '../lib/format'
import { usePlan } from '../lib/plan'
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
 * Límite de plan suave (SPEC §1.10): la función se ve, se explica con FEATURE_COPY y ofrece
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
  if (permitted) return <>{children}</>

  const copy = FEATURE_COPY[feature]
  const target = PLANS[copy.plan]

  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-paper-600', className)}>
        <Badge tone="ink" size="sm">
          {target.name}
        </Badge>
        <span className="min-w-0">{copy.why}</span>
        <Link to={UPGRADE_PATH} className="inline-flex items-center gap-1 font-medium text-ink-600 hover:text-ink-700">
          Ver plan {target.name}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {dismissed ? null : (
        <section
          aria-label={`${copy.title}: disponible en ${target.name}`}
          className="relative flex flex-col gap-4 rounded-md border border-ink-100 bg-ink-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-paper-900">{copy.title}</h3>
              <Badge tone="ink" size="sm">
                Plan {target.name}
              </Badge>
            </div>
            <p className="max-w-xl text-paper-600">{copy.why}</p>
            <p className="text-[13px] text-paper-600">
              Desde <span className="font-medium text-paper-900 tabular">{formatCLP(target.yearlyMonthly)}</span> + IVA al mes
              pagando anual. Todo lo que ya tienes sigue igual.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link to={UPGRADE_PATH} className={buttonClass('primary', 'md')}>
              Mejorar a {target.name}
            </Link>
          </div>
          {dismissible ? (
            <button
              type="button"
              aria-label="Ocultar explicación"
              onClick={() => setDismissed(true)}
              className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-sm text-paper-600 hover:bg-paper-0/70"
            >
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </section>
      )}
      {preview && children ? (
        <div inert className="pointer-events-none opacity-55 select-none" aria-hidden="true">
          {children}
        </div>
      ) : null}
    </div>
  )
}
