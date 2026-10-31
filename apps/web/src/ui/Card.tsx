import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface CardProps extends ComponentProps<'div'> {
  /** Resalta al pasar el cursor (tarjetas clicables). */
  interactive?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }

/** Superficie de papel: borde antes que sombra. Radio 8. */
export function Card({ interactive, padding = 'md', className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-paper-200 bg-paper-0',
        interactive && 'transition-[border-color,box-shadow] duration-120 ease-out hover:border-paper-350/70 hover:shadow-[0_1px_2px_rgb(31_28_24/0.05)]',
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
        <h3 className="text-base font-semibold text-paper-900">{title}</h3>
        {description ? <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">{description}</p> : null}
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

/** Contenedor de sección (radio 12) con cabecera y pie opcionales. */
export function Panel({ title, description, actions, footer, className, bodyClassName, children, ...props }: PanelProps) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-paper-200 bg-paper-0', className)} {...props}>
      {title || actions ? (
        <header className="flex items-start justify-between gap-4 border-b border-paper-200 px-5 py-3.5">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-paper-900">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
      {footer ? <footer className="border-t border-paper-200 bg-paper-50 px-5 py-3">{footer}</footer> : null}
    </section>
  )
}
