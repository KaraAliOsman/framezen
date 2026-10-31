import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

/**
 * Fila de ajuste: qué es y por qué importa (en lenguaje de taller) a la izquierda, el control a la
 * derecha. En el teléfono se apila.
 */
export function SettingRow({
  title,
  description,
  htmlFor,
  children,
  className,
  wide,
}: {
  title: ReactNode
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
  /** El control ocupa más ancho (opciones con texto). */
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        'grid gap-x-8 gap-y-3 border-b border-paper-200 py-5 first:pt-0 last:border-b-0 last:pb-0',
        wide ? '@2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]' : '@2xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)]',
        className,
      )}
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="font-medium text-paper-900">
            {title}
          </label>
        ) : (
          <p className="font-medium text-paper-900">{title}</p>
        )}
        {description ? <div className="mt-1 text-[13px] leading-[19px] text-paper-600">{description}</div> : null}
      </div>
      <div className="min-w-0 max-w-[440px] @2xl:max-w-none @2xl:pt-0.5">{children}</div>
    </div>
  )
}
