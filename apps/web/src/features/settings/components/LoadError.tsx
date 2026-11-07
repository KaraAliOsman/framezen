import { humanError } from '../../../lib/api'
import { useT } from '../../../lib/i18n'
import { Button, EmptyState } from '../../../ui'
import es from '../i18n/es'

/** No llegaron los ajustes (sin conexión o servidor caído): lo decimos y ofrecemos reintentar. */
export function LoadError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  const t = useT(es)
  return <EmptyState size="compact" title={title} description={humanError(error)} action={<Button onClick={onRetry}>{t('common.retry')}</Button>} />
}
