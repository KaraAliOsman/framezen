import type { CSSProperties } from 'react'
import { cn } from '../lib/cn'
import { useT } from '../lib/i18n'
import es from './i18n/es'

/** Bloque de carga con la forma de lo que viene; un barrido lento dice que algo avanza. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn('fz-skeleton rounded-xs', className)} style={style} />
}

/** Líneas de texto de carga con anchos variados. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ['92%', '78%', '64%', '85%', '58%']
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  )
}

/** Filas de tabla de carga (44 px, igual que las filas reales: nada salta al llegar los datos). */
export function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  const t = useT(es)
  return (
    <div aria-busy="true" aria-label={t('common.loading')} className="divide-y divide-divider">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-11 items-center gap-6 px-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-3" style={{ width: c === 0 ? '28%' : `${12 + ((r + c) % 3) * 4}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}
