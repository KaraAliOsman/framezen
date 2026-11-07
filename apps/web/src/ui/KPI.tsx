import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '../lib/cn'
import { useFormat, useT } from '../lib/i18n'
import es from './i18n/es'
import { AnimatedNumber, Flash } from './AnimatedNumber'

export interface KPIProps {
  label: ReactNode
  /** Número (se anima) o contenido ya formateado. */
  value: number | ReactNode
  format?: (n: number) => string
  /** Variación en % respecto del período anterior (solo con datos reales del período anterior). */
  delta?: number
  /** Texto bajo la etiqueta («12 cotizaciones», «este mes»). */
  hint?: ReactNode
  /** Contenido extra a la derecha (mini gráfico). */
  aside?: ReactNode
  /** plain = cifra suelta sobre la hoja (lo normal) · card = con borde, cuando se toca. */
  variant?: 'card' | 'plain'
  className?: string
}

/** Cifra clave: el número manda, la etiqueta va debajo y el contexto al final. Sin íconos de colores. */
export function KPI({ label, value, format, delta, hint, aside, variant = 'card', className }: KPIProps) {
  const up = delta !== undefined && delta >= 0
  const fmt = useFormat()
  const t = useT(es)
  return (
    <div className={cn('flex min-w-0 flex-col', variant === 'card' && 'rounded-md border border-divider bg-surface p-4', className)}>
      <div className="flex items-end justify-between gap-3">
        <Flash trigger={typeof value === 'number' || typeof value === 'string' ? value : null}>
          <span className="figure text-h2 font-medium text-fg-strong sm:text-h1">
            {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}
          </span>
        </Flash>
        {aside}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="truncate text-base text-fg">{label}</span>
        {delta !== undefined ? (
          <span
            title={t('kpi.vsPrevious')}
            className={cn('inline-flex items-center gap-0.5 text-table font-medium tabular', up ? 'text-success' : 'text-danger')}
          >
            {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
            {`${up ? '+' : '−'}${fmt.pct(Math.abs(delta), 1)}`}
          </span>
        ) : null}
      </div>
      {hint ? <span className="mt-0.5 text-table text-fg-muted">{hint}</span> : null}
    </div>
  )
}
