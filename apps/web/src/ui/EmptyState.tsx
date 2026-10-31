import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { WindowSketch, type SketchKind } from './WindowSketch'

export interface EmptyStateProps {
  /** Dibujo de ventana en trazo fino (por defecto) o un icono sobrio. */
  sketch?: SketchKind
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  /** Acción principal (botón con atajo). */
  action?: ReactNode
  /** Acción secundaria o enlace de ayuda. */
  secondary?: ReactNode
  /** compact = dentro de tarjetas y tablas. */
  size?: 'compact' | 'default'
  className?: string
  children?: ReactNode
}

/** Vacío que explica qué va aquí y ofrece el siguiente paso. Nunca un «Sin datos» seco. */
export function EmptyState({
  sketch = 'casement',
  icon: Icon,
  title,
  description,
  action,
  secondary,
  size = 'default',
  className,
  children,
}: EmptyStateProps) {
  const compact = size === 'compact'
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-3 px-4 py-8' : 'gap-5 px-6 py-16',
        className,
      )}
    >
      {Icon ? (
        <span className="inline-flex size-10 items-center justify-center rounded-md bg-paper-100 text-paper-600">
          <Icon aria-hidden strokeWidth={1.75} className="size-5" />
        </span>
      ) : (
        <WindowSketch kind={sketch} size={compact ? 64 : 104} />
      )}
      <div className={cn('flex max-w-md flex-col', compact ? 'gap-1' : 'gap-1.5')}>
        <h2 className={cn('font-semibold tracking-[-0.01em] text-paper-900', compact ? 'text-base' : 'text-h3')}>{title}</h2>
        {description ? (
          <p className={cn('text-paper-600', compact ? 'text-[13px] leading-[18px]' : 'text-base')}>{description}</p>
        ) : null}
      </div>
      {children}
      {action || secondary ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  )
}
