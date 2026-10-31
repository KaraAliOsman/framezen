import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Cambia para reintentar (p. ej. nuevas medidas). */
  resetKey: string
  fallback: ReactNode
  children: ReactNode
}

interface State {
  failedKey: string | null
}

/**
 * Si el dibujo de ejemplo falla, la landing sigue funcionando: se muestra un
 * respaldo y se reintenta en cuanto cambian las medidas o la tipología.
 */
export class DrawingBoundary extends Component<Props, State> {
  override state: State = { failedKey: null }

  static getDerivedStateFromError(): Partial<State> {
    return { failedKey: '__pending__' }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.setState({ failedKey: this.props.resetKey })
    if (import.meta.env.DEV) console.warn('[landing] No se pudo dibujar el ejemplo', error, info.componentStack)
  }

  override render() {
    const { failedKey } = this.state
    if (failedKey !== null && (failedKey === '__pending__' || failedKey === this.props.resetKey)) {
      return this.props.fallback
    }
    return this.props.children
  }
}
