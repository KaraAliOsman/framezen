import { useLocation } from 'react-router'
import { RotateCcw } from 'lucide-react'
import { MarcoRoot } from '../../features/assistant/MarcoRoot'
import { useT } from '../../lib/i18n'
import { ErrorBoundary } from '../../ui/ErrorBoundary'
import { IconButton } from '../../ui/IconButton'
import es from '../i18n/es'

/**
 * Lugar del asistente en la barra superior: su avatar animado (abre el panel, ⌘J) y el panel no
 * modal. Todo vive en features/assistant (BOT-UI).
 *
 * Si el asistente falla al dibujarse, se pierde solo esa parte: la barra superior y la pantalla
 * siguen en pie, queda un botón para reintentar y se vuelve a intentar al cambiar de pantalla.
 */
export function AssistantSlot({ className }: { className?: string }) {
  const t = useT(es)
  const { pathname } = useLocation()
  return (
    <ErrorBoundary
      label="assistant"
      resetKeys={[pathname]}
      fallback={({ reset }) => <IconButton icon={RotateCcw} label={t('shell.assistantRetry')} onClick={reset} className={className} />}
    >
      <MarcoRoot className={className} />
    </ErrorBoundary>
  )
}
