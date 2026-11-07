import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '../lib/cn'
import { useT } from '../lib/i18n'
import es from './i18n/es'

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
  const t = useT(es)
  return (
    <header className={cn('flex flex-col gap-3 pb-6', className)}>
      {breadcrumbs?.length ? (
        <nav aria-label={t('common.breadcrumbs')} className="flex min-w-0 items-center gap-1 text-table text-fg-muted">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 ? <ChevronRight aria-hidden className="size-3.5 text-fg-faint" /> : null}
              {crumb.to ? (
                <Link to={crumb.to} className="rounded-xs transition-colors duration-100 hover:text-fg">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="truncate text-fg">
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
          <h1 className="text-h2 font-medium text-fg-strong sm:text-h1">{title}</h1>
          {description ? <p className="mt-0.5 max-w-2xl text-fg-muted">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2 text-table text-fg-muted">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
      </div>
    </header>
  )
}

/**
 * Contenedor estándar de página dentro del shell. Listas y fichas comparten una sola medida para que
 * el título no salte al cambiar de sección; solo `narrow` (lectura) y `full` (lienzos) se apartan.
 */
export function Page({
  width = 'default',
  className,
  ...props
}: ComponentProps<'div'> & { width?: 'narrow' | 'default' | 'wide' | 'full' }) {
  const max = { narrow: 'max-w-3xl', default: 'max-w-[1280px]', wide: 'max-w-[1280px]', full: 'max-w-none' }[width]
  return <div className={cn('mx-auto w-full px-4 pt-4 pb-16 sm:px-6 lg:px-10', max, className)} {...props} />
}
