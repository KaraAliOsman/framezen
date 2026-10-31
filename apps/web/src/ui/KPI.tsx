import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatNumber } from '../lib/format'
import { AnimatedNumber, Flash } from './AnimatedNumber'

export interface KPIProps {
  label: ReactNode
  /** Número (se anima) o contenido ya formateado. */
  value: number | ReactNode
  format?: (n: number) => string
  /** Variación en % respecto del período anterior. */
  delta?: number
  /** Texto bajo la cifra («12 cotizaciones», «este mes»). */
  hint?: ReactNode
  /** Contenido extra a la derecha (mini gráfico). */
  aside?: ReactNode
  className?: string
}

/** Indicador clave: etiqueta, cifra grande tabular, variación y contexto. */
export function KPI({ label, value, format, delta, hint, aside, className }: KPIProps) {
  const up = delta !== undefined && delta >= 0
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-md border border-paper-200 bg-paper-0 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-paper-600">{label}</span>
        {delta !== undefined ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-meta font-medium tabular',
              up ? 'text-ok-600' : 'text-bad-600',
            )}
          >
            {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
            {`${up ? '+' : '−'}${formatNumber(Math.abs(delta), 1)} %`}
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <Flash trigger={typeof value === 'number' || typeof value === 'string' ? value : null}>
          <span className="text-h2 font-semibold tracking-[-0.01em] text-paper-900 tabular">
            {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}
          </span>
        </Flash>
        {aside}
      </div>
      {hint ? <span className="text-[13px] leading-[18px] text-paper-600">{hint}</span> : null}
    </div>
  )
}
