import { Component, createElement, lazy, Suspense, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { TypologyId } from '@dekopen/engine'
import { cn } from '../lib/cn'

const SampleWindow = lazy(() => import('./SampleWindow'))

export type EmptyWindowKind = 'fixed' | 'casement' | 'sliding' | 'double'

const SPECS: Record<EmptyWindowKind, { typology: TypologyId; width: number; height: number }> = {
  fixed: { typology: 'fixed', width: 1200, height: 1100 },
  casement: { typology: 'tilt_turn', width: 1000, height: 1200 },
  sliding: { typology: 'sliding_2', width: 1800, height: 1200 },
  double: { typology: 'casement_double', width: 1400, height: 1200 },
}

/** Si el dibujo no carga (sin red, versión nueva) el aviso sigue en pie: solo se pierde la ventana. */
class DrawingGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? null : this.props.children
  }
}

export interface EmptyStateProps {
  /**
   * Ventana real del motor, solo donde hay algo por crear. Errores y búsquedas sin resultado no
   * llevan dibujo: el mensaje basta.
   */
  sketch?: EmptyWindowKind
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  /** Acción principal (botón con atajo). */
  action?: ReactNode
  /** Acción secundaria o enlace de ayuda. */
  secondary?: ReactNode
  /** compact = dentro de tarjetas y tablas. */
  size?: 'compact' | 'default'
  /** h1 cuando es lo único de la página (404, errores de ruta). */
  headingLevel?: 'h1' | 'h2'
  className?: string
  children?: ReactNode
}

/** Vacío que explica qué va aquí y ofrece el siguiente paso. Nunca un «Sin datos» seco. */
export function EmptyState({ sketch, icon: Icon, title, description, action, secondary, size = 'default', headingLevel = 'h2', className, children }: EmptyStateProps) {
  const compact = size === 'compact'
  const drawingHeight = compact ? 72 : 120
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'gap-3 px-4 py-8' : 'gap-5 px-6 py-16', className)}>
      {Icon ? (
        <Icon aria-hidden strokeWidth={1.5} className={cn('text-fg-faint', compact ? 'size-6' : 'size-8')} />
      ) : sketch ? (
        <div aria-hidden style={{ height: drawingHeight }}>
          <DrawingGuard>
            <Suspense fallback={null}>
              <SampleWindow spec={SPECS[sketch]} height={drawingHeight} />
            </Suspense>
          </DrawingGuard>
        </div>
      ) : null}
      <div className={cn('flex max-w-md flex-col', compact ? 'gap-1' : 'gap-1.5')}>
        {createElement(headingLevel, { className: cn('font-medium text-fg-strong', compact ? 'text-h4' : 'text-h3') }, title)}
        {description ? <p className={cn('text-pretty text-fg-muted', compact ? 'text-table' : 'text-base')}>{description}</p> : null}
      </div>
      {children}
      {action || secondary ? (
        <div className={cn('flex flex-wrap items-center justify-center gap-2', !compact && 'pt-1')}>
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  )
}
