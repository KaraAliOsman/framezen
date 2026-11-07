import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface CardProps extends ComponentProps<'div'> {
  /** Resalta al pasar el cursor (tarjetas clicables). */
  interactive?: boolean
  /** Seleccionada (opción elegida en una grilla de tarjetas). */
  selected?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }

/**
 * Superficie con borde, sin sombra en reposo. Solo cuando el contenedor se toca, se arrastra o se elige;
 * para agrupar basta el aire de la hoja.
 */
export function Card({ interactive, selected, padding = 'md', className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md border bg-surface',
        selected ? 'border-accent shadow-[inset_0_0_0_1px_var(--dk-accent)]' : 'border-divider',
        interactive &&
          'transition-[border-color,background-color,transform] duration-100 ease-out hover:border-divider-strong hover:bg-sunken ' +
            'has-[:focus-visible]:border-focus',
        paddings[padding],
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="text-h4 font-medium text-fg-strong">{title}</h3>
        {description ? <p className="mt-0.5 text-table text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export interface PanelProps extends Omit<ComponentProps<'section'>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Pie del panel (acciones secundarias, notas). */
  footer?: ReactNode
  bodyClassName?: string
}

/** Contenedor de sección con cabecera y pie opcionales, sin líneas internas. */
export function Panel({ title, description, actions, footer, className, bodyClassName, children, ...props }: PanelProps) {
  return (
    <section className={cn('overflow-hidden rounded-md border border-divider bg-surface', className)} {...props}>
      {title || actions ? (
        <header className="flex items-start justify-between gap-4 px-5 pt-4">
          <div className="min-w-0">
            {title ? <h2 className="text-h4 font-medium text-fg-strong">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-table text-fg-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
      {footer ? <footer className="px-5 pb-4 text-table text-fg-muted">{footer}</footer> : null}
    </section>
  )
}
