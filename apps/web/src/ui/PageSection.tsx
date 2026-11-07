import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface PageSectionProps {
  title?: ReactNode
  description?: ReactNode
  /** Acciones a la derecha del título. */
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

/**
 * Sección sobre la hoja: título, contexto y contenido, separados por aire. Reemplaza a `Panel` y a las
 * tarjetas que solo agrupaban. Si el contenedor no se toca, no necesita borde.
 */
export function PageSection({ title, description, actions, children, className }: PageSectionProps) {
  return (
    <section className={cn('mt-10 first:mt-0', className)}>
      {title || actions ? (
        <header className="mb-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title ? <h2 className="text-h3 font-medium text-fg-strong">{title}</h2> : null}
            {description ? <p className="mt-0.5 max-w-2xl text-fg-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

/** Tira de cifras sueltas sobre la hoja, sin cajas ni divisores: pon `KPI variant="plain"` adentro. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap gap-x-14 gap-y-5', className)}>{children}</div>
}

export interface RowTitleProps {
  /** Miniatura o avatar a la izquierda. */
  media?: ReactNode
  title: ReactNode
  /** Segunda línea, atenuada («Marcela Fuentes · Ñuñoa»). */
  subtitle?: ReactNode
  className?: string
}

/** Identidad de una fila en dos líneas (úsala con `DataTable density="comfortable"` y en listas). */
export function RowTitle({ media, title, subtitle, className }: RowTitleProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {media ? <div className="shrink-0">{media}</div> : null}
      <div className="min-w-0">
        <div className="truncate font-medium text-fg-strong">{title}</div>
        {subtitle ? <div className="truncate text-table text-fg-muted">{subtitle}</div> : null}
      </div>
    </div>
  )
}
