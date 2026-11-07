import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * money = montos y totales · count = cantidades y conteos · dimension = medidas y cotas ·
 * id = identificadores (N° 412, PRO-70, códigos de catálogo). Todas con cifras tabulares, sin monoespaciada.
 */
export type NumericKind = 'money' | 'count' | 'dimension' | 'id'

export interface NumericProps extends ComponentProps<'span'> {
  kind?: NumericKind
  /** total = cifra grande fija (32/38) para el total de una cotización. */
  size?: 'inherit' | 'sm' | 'base' | 'lg' | 'total'
  /** Texto atenuado (unidades, IVA, «c/u»). */
  muted?: boolean
}

const kinds: Record<NumericKind, string> = {
  money: 'tabular',
  count: 'tabular',
  dimension: 'dim',
  id: 'code-id',
}

const sizes = {
  inherit: '',
  sm: 'text-table',
  base: 'text-base',
  lg: 'figure text-h3 font-medium',
  total: 'figure text-figure font-medium text-fg-strong',
}

/** Centavos en voladita en las cifras grandes: $5.216.471,18. En monedas sin decimales no aparece. */
function withSmallDecimals(children: ReactNode): ReactNode {
  if (typeof children !== 'string') return children
  const match = children.match(/^(.*\d)([.,]\d{2})(\D*)$/)
  if (!match) return children
  const [, whole, decimals, tail] = match
  return (
    <>
      {whole}
      <span className="ml-px align-[0.42em] text-[0.56em] tracking-normal">{decimals}</span>
      {tail}
    </>
  )
}

/**
 * Cifra con el tratamiento tipográfico correcto. Recibe el texto ya formateado (useFormat / formatCLP):
 * este componente no formatea, solo garantiza alineación y familia. Nunca truncar un monto o una medida.
 */
export function Numeric({ kind = 'money', size = 'inherit', muted = false, className, children, ...props }: NumericProps) {
  return (
    <span className={cn('whitespace-nowrap', kinds[kind], sizes[size], muted && 'text-fg-muted', className)} {...props}>
      {kind === 'money' && size === 'total' ? withSmallDecimals(children) : children}
    </span>
  )
}
