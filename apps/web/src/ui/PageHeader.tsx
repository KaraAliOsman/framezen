import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '../lib/cn'

export interface Crumb {
  label: ReactNode
  to?: string
}

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Acciones a la derecha (botón primario al final). */
  actions?: ReactNode
  /** Migas: [{ label: 'Cotizaciones', to: '/cotizaciones' }, { label: 'N° 412' }]. */
  breadcrumbs?: Crumb[]
  /** Metadatos bajo el título (estado, fechas). */
  meta?: ReactNode
  className?: string
}

/** Cabecera de página: título claro, contexto breve, acciones. */
export function PageHeader({ title, description, actions, breadcrumbs, meta, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 pb-6', className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Ruta" className="flex items-center gap-1 text-[13px] text-paper-600">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 ? <ChevronRight aria-hidden className="size-3.5 text-paper-350" /> : null}
              {crumb.to ? (
                <Link to={crumb.to} className="rounded-xs hover:text-paper-900">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-paper-900">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      {/* En el teléfono las acciones van bajo el título (que nunca se estrangula); desde sm, a la derecha. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-6">
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-h2 font-semibold tracking-[-0.01em] text-paper-900 sm:text-h1">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-paper-600">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-paper-600">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
      </div>
    </header>
  )
}

/** Contenedor estándar de página dentro del shell (ancho máximo y márgenes). */
export function Page({
  width = 'default',
  className,
  ...props
}: ComponentProps<'div'> & { width?: 'narrow' | 'default' | 'wide' | 'full' }) {
  const max = { narrow: 'max-w-3xl', default: 'max-w-6xl', wide: 'max-w-[1440px]', full: 'max-w-none' }[width]
  return <div className={cn('mx-auto w-full px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8', max, className)} {...props} />
}
