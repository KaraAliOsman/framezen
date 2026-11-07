import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { SaveIndicator, type SaveStatus } from '../../../ui'

/** Cabecera de cada sección de Ajustes: título, contexto breve y el indicador «Guardado». */
export function SectionHeader({
  title,
  description,
  status = 'idle',
  savedAt,
  aside,
}: {
  title: ReactNode
  description?: ReactNode
  status?: SaveStatus
  savedAt?: Date | null
  aside?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 flex-1 basis-80">
        <h2 id="settings-title" className="font-display text-h2 font-medium text-fg-strong">
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-xl text-fg-muted">{description}</p> : null}
      </div>
      <div className="flex min-h-8 items-center gap-3">
        {aside}
        <SaveIndicator status={status} savedAt={savedAt} />
      </div>
    </div>
  )
}

/**
 * Grupo de ajustes sobre la hoja: título, contexto breve, contenido y nota opcional. Sin caja: los
 * grupos se separan con aire (una pila con `gap-10`).
 */
export function FieldGroup({
  title,
  description,
  aside,
  footer,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: ReactNode
  description?: ReactNode
  /** Dato o acción a la derecha del título. */
  aside?: ReactNode
  /** Nota al pie. */
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section id={id} aria-labelledby={headingId} className={cn('min-w-0', className)}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <h3 id={headingId} className="text-h4 font-medium text-fg-strong">
            {title}
          </h3>
          {description ? <p className="mt-0.5 max-w-xl text-table text-fg-muted">{description}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
      </header>
      <div className={bodyClassName}>{children}</div>
      {footer ? <p className="mt-3 max-w-xl text-table text-fg-muted">{footer}</p> : null}
    </section>
  )
}

/** Formulario a la izquierda y lo que cambia a la derecha; si no cabe, lo que cambia va debajo. */
export function WithPreview({ children, preview, label }: { children: ReactNode; preview: ReactNode; label: string }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-10 @3xl:grid-cols-[minmax(0,1fr)_300px] @3xl:gap-12">
        <div className="flex min-w-0 flex-col gap-10">{children}</div>
        <aside aria-label={label} className="min-w-0">
          <div className="@3xl:sticky @3xl:top-6">{preview}</div>
        </aside>
      </div>
    </div>
  )
}

/** Mensaje en línea de un guardado rechazado (4xx): qué pasó, sin bloquear. */
export function SaveError({ message, className }: { message: string | null | undefined; className?: string }) {
  if (!message) return null
  return (
    <p role="alert" className={cn('mb-6 rounded-sm bg-danger-bg px-3 py-2 text-table text-danger', className)}>
      {message}
    </p>
  )
}
