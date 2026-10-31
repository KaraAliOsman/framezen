import type { ReactNode } from 'react'
import { SaveIndicator, type SaveStatus } from '../../../ui'

/** Cabecera de cada sección de Ajustes con el indicador «Guardado». */
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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 id="settings-title" className="text-h3 font-semibold tracking-[-0.01em] text-paper-900">
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-2xl text-paper-600">{description}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        {aside}
        <SaveIndicator status={status} savedAt={savedAt} />
      </div>
    </div>
  )
}

/** Grupo de campos con título pequeño y regla fina (más liviano que una tarjeta). */
export function FieldGroup({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-4 border-b border-paper-200 pb-2">
        <h3 className="text-[13px] font-semibold tracking-[0.01em] text-paper-900">{title}</h3>
        {description ? <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}
