import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../lib/cn'

export interface InspectorProps extends ComponentProps<'aside'> {
  /** Nombre accesible del panel («Ventana V1», «Cliente»). */
  'aria-label': string
}

/**
 * Inspector: columna de propiedades del objeto seleccionado (ventana, cliente, plantilla). Superficie
 * opaca, secciones separadas por aire, plegables. Ancho recomendado 320–336 px; scroll propio.
 */
export function Inspector({ className, children, ...props }: InspectorProps) {
  return (
    <aside className={cn('flex min-h-0 flex-col bg-surface text-fg', className)} {...props}>
      {children}
    </aside>
  )
}

export interface InspectorHeaderProps {
  /** Identificador corto (V1, N° 412). */
  eyebrow?: ReactNode
  title: ReactNode
  /** Una línea de contexto («Corredera 2 hojas · 1.200 × 1.000 mm»). */
  description?: ReactNode
  /** Miniatura o avatar a la izquierda. */
  media?: ReactNode
  actions?: ReactNode
  className?: string
}

export function InspectorHeader({ eyebrow, title, description, media, actions, className }: InspectorHeaderProps) {
  return (
    <header className={cn('flex shrink-0 items-start gap-3 px-4 pt-4 pb-2', className)}>
      {media ? <div className="shrink-0">{media}</div> : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? <div className="code-id mb-0.5 text-meta text-fg-muted">{eyebrow}</div> : null}
        <h2 className="truncate text-h3 font-medium text-fg-strong">{title}</h2>
        {description ? <p className="mt-0.5 truncate text-table text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="-mr-1 flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  )
}

export interface InspectorSectionProps {
  title?: ReactNode
  /** Acción a la derecha del título (IconButton, enlace). */
  actions?: ReactNode
  /** Plegable; empieza abierta salvo `defaultOpen={false}`. */
  collapsible?: boolean
  defaultOpen?: boolean
  children?: ReactNode
  className?: string
  bodyClassName?: string
}

/** Grupo de propiedades con título pequeño. Separado del siguiente por aire. */
export function InspectorSection({
  title,
  actions,
  collapsible = false,
  defaultOpen = true,
  children,
  className,
  bodyClassName,
}: InspectorSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const shown = !collapsible || open
  return (
    <section className={className}>
      {title || actions ? (
        <div className="flex h-9 items-center justify-between gap-2 px-4">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((o) => !o)}
              className="-ml-1 inline-flex min-w-0 items-center gap-1 rounded-xs px-1 py-0.5 text-table font-medium text-fg-strong transition-colors duration-100"
            >
              <ChevronRight
                aria-hidden
                strokeWidth={2}
                className={cn('size-3.5 shrink-0 text-fg-muted transition-transform duration-140 ease-out', open && 'rotate-90')}
              />
              <span className="truncate">{title}</span>
            </button>
          ) : (
            <h3 className="truncate text-table font-medium text-fg-strong">{title}</h3>
          )}
          {actions ? <div className="-mr-1 flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      {shown ? (
        <div id={bodyId} className={cn('flex flex-col gap-3 px-4 pb-4', !title && !actions && 'pt-4', bodyClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

export interface InspectorRowProps {
  label: ReactNode
  /** Valor ya formateado (o un control compacto). */
  children?: ReactNode
  /** Texto de ayuda bajo la fila. */
  hint?: ReactNode
  /** mono = medidas e ids; num = montos tabulares a la derecha (ambas con cifras tabulares). */
  kind?: 'text' | 'mono' | 'num'
  /** Etiqueta encima del valor (para controles anchos: Select, NumberField). */
  stacked?: boolean
  htmlFor?: string
  className?: string
}

/** Fila etiqueta / valor del inspector (y de cualquier lista de propiedades). */
export function InspectorRow({ label, children, hint, kind = 'text', stacked = false, htmlFor, className }: InspectorRowProps) {
  const Label = htmlFor ? 'label' : 'span'
  const valueClass = kind === 'mono' ? 'dim' : kind === 'num' ? 'tabular' : ''
  if (stacked) {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <Label htmlFor={htmlFor} className="text-table font-medium text-fg-muted">
          {label}
        </Label>
        <div className={valueClass}>{children}</div>
        {hint ? <p className="text-meta text-fg-muted">{hint}</p> : null}
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <Label htmlFor={htmlFor} className="shrink-0 text-table text-fg-muted">
          {label}
        </Label>
        <div className={cn('min-w-0 truncate text-right text-base text-fg', valueClass)}>{children}</div>
      </div>
      {hint ? <p className="text-meta text-fg-muted">{hint}</p> : null}
    </div>
  )
}

export interface InspectorFooterProps {
  children: ReactNode
  className?: string
}

/** Pie fijo del inspector (resumen comercial, total en vivo, acción principal). */
export function InspectorFooter({ children, className }: InspectorFooterProps) {
  return <footer className={cn('mt-auto shrink-0 bg-sunken px-4 py-3', className)}>{children}</footer>
}
