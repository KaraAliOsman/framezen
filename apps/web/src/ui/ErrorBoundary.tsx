import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '../lib/cn'
import { useT } from '../lib/i18n'
import es from './i18n/es'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

export interface ErrorBoundaryFallbackProps {
  error: unknown
  /** Vuelve a intentar dibujar la zona. */
  reset: () => void
}

export interface ErrorBoundaryProps {
  children: ReactNode
  /** Qué mostrar en lugar de la zona que falló: un nodo o una función con el error y `reset`. */
  fallback: ReactNode | ((props: ErrorBoundaryFallbackProps) => ReactNode)
  /**
   * Si cambia cualquiera de estos valores (ítem, ruta, vista…), la zona se vuelve a intentar dibujar.
   * Se comparan uno a uno con `Object.is`.
   */
  resetKeys?: readonly unknown[]
  /** Nombre de la zona para la consola de desarrollo. */
  label?: string
  onError?: (error: unknown, info: ErrorInfo) => void
}

interface State {
  failed: boolean
  error: unknown
  keys: readonly unknown[]
}

const NO_KEYS: readonly unknown[] = []

function keysChanged(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]))
}

/**
 * Límite de errores de una zona: si algo dentro falla al dibujarse, se pierde solo esa zona (con un
 * aviso y acciones) y el resto de la app sigue funcionando. Se reinicia solo al cambiar `resetKeys`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { failed: false, error: null, keys: this.props.resetKeys ?? NO_KEYS }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, error }
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: State): Partial<State> | null {
    const keys = props.resetKeys ?? NO_KEYS
    if (!keysChanged(keys, state.keys)) return null
    // Otro ítem, otra ruta u otra vista: se intenta de nuevo (si vuelve a fallar, vuelve el aviso).
    return { keys, failed: false, error: null }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    if (import.meta.env.DEV) console.warn(`[${this.props.label ?? 'zona'}] No se pudo dibujar.`, error, info.componentStack)
    this.props.onError?.(error, info)
  }

  reset = () => {
    this.setState({ failed: false, error: null })
  }

  override render() {
    if (!this.state.failed) return this.props.children
    const { fallback } = this.props
    return typeof fallback === 'function' ? fallback({ error: this.state.error, reset: this.reset }) : fallback
  }
}

export interface ZoneErrorProps {
  title?: ReactNode
  description?: ReactNode
  /** Muestra «Reintentar». */
  onRetry?: () => void
  /** Acciones que siguen funcionando aunque la zona haya fallado (p. ej. eliminar la ventana). */
  actions?: ReactNode
  size?: 'compact' | 'default'
  className?: string
}

/** Aviso estándar de una zona que no se pudo dibujar: explica, tranquiliza y ofrece salidas. */
export function ZoneError({ title, description, onRetry, actions, size = 'compact', className }: ZoneErrorProps) {
  const t = useT(es)
  return (
    <div role="alert" className={cn('grid h-full place-items-center', className)}>
      <EmptyState
        size={size}
        title={title ?? t('error.title')}
        description={description ?? t('error.description')}
        action={
          onRetry ? (
            <Button variant="secondary" size={size === 'compact' ? 'sm' : 'md'} icon={RotateCcw} onClick={onRetry}>
              {t('common.retry')}
            </Button>
          ) : null
        }
        secondary={actions}
      />
    </div>
  )
}
