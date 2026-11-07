import type { ComponentProps, ReactNode } from 'react'
import { Toolbar as RadixToolbar } from 'radix-ui'
import { cn } from '../lib/cn'

export interface ToolbarProps extends ComponentProps<typeof RadixToolbar.Root> {
  /** Nombre accesible («Herramientas del lienzo», «Filtros»). */
  'aria-label': string
  /** bar = franja de 48 px con separador inferior (cabeceras de lienzo y listas) · floating = cápsula flotante. */
  variant?: 'bar' | 'floating' | 'plain'
}

const variants = {
  bar: 'h-12 border-b border-divider bg-surface px-3',
  floating: 'h-11 rounded-md bg-raised px-1.5 shadow-float',
  plain: '',
}

/**
 * Barra de herramientas accesible (flechas entre controles, Radix Toolbar). Úsala sobre el lienzo,
 * encima de tablas (búsqueda + filtros + vista) y en la selección múltiple.
 */
export function Toolbar({ variant = 'bar', className, ...props }: ToolbarProps) {
  return <RadixToolbar.Root className={cn('flex min-w-0 items-center gap-1', variants[variant], className)} {...props} />
}

/** Grupo de controles relacionados. */
export function ToolbarGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div role="group" className={cn('flex items-center gap-0.5', className)} {...props} />
}

/** Separador vertical fino entre grupos. */
export function ToolbarSeparator({ className, ...props }: ComponentProps<typeof RadixToolbar.Separator>) {
  return <RadixToolbar.Separator className={cn('mx-1.5 h-5 w-px shrink-0 bg-divider', className)} {...props} />
}

/** Empuja lo que sigue al extremo derecho. */
export function ToolbarSpacer() {
  return <div aria-hidden className="min-w-2 flex-1" />
}

export interface ToolbarTitleProps {
  children: ReactNode
  /** Conteo o contexto a la derecha del título («24»). */
  count?: ReactNode
  className?: string
}

/** Título de la barra (nombre de la vista o del lienzo). */
export function ToolbarTitle({ children, count, className }: ToolbarTitleProps) {
  return (
    <div className={cn('flex min-w-0 items-baseline gap-2 px-1.5', className)}>
      <span className="truncate text-base font-medium text-fg-strong">{children}</span>
      {count !== undefined && count !== null ? <span className="text-table text-fg-muted tabular">{count}</span> : null}
    </div>
  )
}

/** Botón compatible con la navegación por flechas de la barra (envuelve Button/IconButton con asChild). */
export const ToolbarButton = RadixToolbar.Button
