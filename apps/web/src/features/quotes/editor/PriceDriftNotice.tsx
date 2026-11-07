/**
 * Aviso en línea (nunca bloquea): tus precios cambiaron desde que enviaste la cotización y el
 * cliente sigue viendo otro total. Ofrece mandarle la versión nueva en un clic.
 */
import { RefreshCw, Send, X } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { getFormatter, translate, useT } from '../../../lib/i18n'
import { Button, IconButton } from '../../../ui'
import es from '../i18n/es'
import { useEditorUi } from './context'
import { usePriceDrift } from './useQuoteStage'
import { useQuoteActions } from './useQuoteActions'

/** Texto del aviso: exacto si nada se guardó después del envío (lo que ve el cliente es eso). */
export function priceDriftText(drift: { sent: number; now: number; exact: boolean; status: string; letter: string }): string {
  const fmt = getFormatter()
  const sent = fmt.money(drift.sent)
  const now = fmt.money(drift.now)
  if (drift.exact) return translate(es, drift.status === 'accepted' ? 'drift.exactAccepted' : 'drift.exactSeen', { sent, now })
  return translate(es, 'drift.loose', { sent, now, letter: drift.letter || 'A' })
}

export function PriceDriftNotice({ variant = 'bar', className }: { variant?: 'bar' | 'card'; className?: string }) {
  const t = useT(es)
  const drift = usePriceDrift()
  const dismissed = useEditorUi((s) => s.driftDismissed)
  const setUi = useEditorUi((s) => s.set)
  const actions = useQuoteActions()
  // En taller o instalada no se ofrece reenviar: el aviso sería ruido.
  if (!drift || !['sent', 'accepted', 'rejected'].includes(drift.status)) return null
  const key = `${drift.sent}:${drift.now}`
  if (dismissed === key) return null
  const text = priceDriftText(drift)
  const send = (
    <Button size="sm" variant={variant === 'bar' ? 'secondary' : 'primary'} icon={Send} onClick={actions.openSend} className="shrink-0">
      {drift.next ? t('drift.sendLetter', { letter: drift.next }) : t('drift.send')}
    </Button>
  )
  const close = <IconButton icon={X} size="sm" label={t('drift.hide')} tooltip={false} onClick={() => setUi({ driftDismissed: key })} />

  if (variant === 'card') {
    return (
      <div role="status" className={cn('rounded-sm bg-warning-bg p-3 text-table text-fg', className)}>
        <div className="flex items-start gap-2">
          <RefreshCw aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 tabular">{text}</p>
          <span className="-mt-1 -mr-1">{close}</span>
        </div>
        <div className="mt-2.5 pl-6">{send}</div>
      </div>
    )
  }
  return (
    <div role="status" className={cn('flex min-h-10 shrink-0 items-center gap-3 bg-warning-bg px-4 py-1.5 text-table text-fg', className)}>
      <RefreshCw aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 tabular">{text}</p>
      {send}
      {close}
    </div>
  )
}
