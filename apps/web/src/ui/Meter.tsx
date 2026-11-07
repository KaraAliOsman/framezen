import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type MeterTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger' | 'auto'

export interface MeterProps {
  value: number
  max?: number
  /** Etiqueta visible a la izquierda («Créditos del mes»). */
  label?: ReactNode
  /** Valor visible a la derecha, ya formateado («1.240 de 2.000»). */
  valueLabel?: ReactNode
  /**
   * Color de la barra. 'auto' = tinta hasta 80 %, aviso hasta 95 %, peligro por encima (consumo de
   * cuotas: créditos, cupos, días de prueba).
   */
  tone?: MeterTone
  /** sm 4 px · md 6 px. */
  size?: 'sm' | 'md'
  /** Nombre accesible si no hay etiqueta visible. */
  'aria-label'?: string
  className?: string
}

const fills: Record<Exclude<MeterTone, 'auto'>, string> = {
  accent: 'bg-accent',
  neutral: 'bg-fg-muted',
  success: 'bg-ok-600',
  warning: 'bg-warning-solid',
  danger: 'bg-danger',
}

/** Medidor horizontal (uso de plan, créditos de IA, avance del catálogo). Sin animaciones decorativas. */
export function Meter({ value, max = 100, label, valueLabel, tone = 'accent', size = 'sm', className, ...aria }: MeterProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const resolved: Exclude<MeterTone, 'auto'> = tone === 'auto' ? (ratio > 0.95 ? 'danger' : ratio > 0.8 ? 'warning' : 'accent') : tone
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label || valueLabel ? (
        <div className="flex items-baseline justify-between gap-3 text-table">
          {label ? <span className="truncate text-fg-muted">{label}</span> : <span />}
          {valueLabel ? <span className="shrink-0 font-medium text-fg tabular">{valueLabel}</span> : null}
        </div>
      ) : null}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={aria['aria-label'] ?? (typeof label === 'string' ? label : undefined)}
        className={cn('relative w-full overflow-hidden rounded-full bg-fg/10', size === 'sm' ? 'h-1' : 'h-1.5')}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-180 ease-out', fills[resolved])}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}
