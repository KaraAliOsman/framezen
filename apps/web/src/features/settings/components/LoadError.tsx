import { humanError } from '../../../lib/api'
import { Button, EmptyState } from '../../../ui'

/** No llegaron los ajustes (sin conexión o servidor caído): lo decimos y ofrecemos reintentar. */
export function LoadError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-paper-200 bg-paper-0">
      <EmptyState sketch="fixed" size="compact" title={title} description={humanError(error)} action={<Button onClick={onRetry}>Reintentar</Button>} />
    </div>
  )
}
