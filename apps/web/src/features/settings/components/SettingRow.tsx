import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

/**
 * Fila de ajuste: qué es y por qué importa a la izquierda, el valor a la derecha, alineado con los
 * demás. Si no cabe, el valor pasa debajo. Va dentro de un contenedor `@container`.
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
    <div className={cn('grid gap-x-10 gap-y-2 py-3 first:pt-0 last:pb-0', wide ? '@xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)]' : '@xl:grid-cols-[minmax(0,1fr)_minmax(0,220px)]', className)}>
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-fg-strong">
            {title}
          </label>
        ) : (
          <p className="text-fg-strong">{title}</p>
        )}
        {description ? <div className="mt-0.5 text-table text-fg-muted">{description}</div> : null}
      </div>
      <div className="max-w-110 min-w-0 has-[>[role=switch]]:flex has-[>[role=switch]]:justify-end @xl:max-w-none">{children}</div>
    </div>
  )
}
