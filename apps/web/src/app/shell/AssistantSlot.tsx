import { useLocation } from 'react-router'
import { RotateCcw } from 'lucide-react'
import { MarcoRoot } from '../../features/assistant/MarcoRoot'
import { ErrorBoundary } from '../../ui/ErrorBoundary'
import { IconButton } from '../../ui/IconButton'

/**
 * Lugar de Marco en la barra superior: su cara animada (abre el panel, ⌘J) y el panel no modal
 * anclado abajo a la derecha. Todo vive en features/assistant.
 *
 * Si Marco falla al dibujarse, se pierde solo Marco: la barra superior y la pantalla siguen en pie,
 * queda un botón para reintentar y se vuelve a intentar al cambiar de pantalla.
 */
export function AssistantSlot({ className }: { className?: string }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary
      label="Marco"
      resetKeys={[pathname]}
      fallback={({ reset }) => (
        <IconButton icon={RotateCcw} label="Marco tuvo un problema. Reintentar" onClick={reset} className={className} />
      )}
    >
      <MarcoRoot className={className} />
    </ErrorBoundary>
  )
}
