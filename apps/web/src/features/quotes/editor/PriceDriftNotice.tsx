/**
 * Aviso en línea (nunca bloquea): tus precios cambiaron desde que enviaste la cotización y el
 * cliente sigue viendo otro total. Ofrece mandarle la versión nueva en un clic.
 */
import { RefreshCw, Send, X } from 'lucide-react'
import { formatCLP } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { Button, IconButton } from '../../../ui'
import { useEditorUi } from './context'
import { usePriceDrift } from './useQuoteStage'
import { useQuoteActions } from './useQuoteActions'

/** Texto del aviso: exacto si nada se guardó después del envío (lo que ve el cliente es eso). */
export function priceDriftText(drift: { sent: number; now: number; exact: boolean; status: string; letter: string }): string {
  if (drift.exact) {
    const verb = drift.status === 'accepted' ? 'aceptó' : 've'
    return `Tus precios cambiaron desde que la enviaste: el cliente ${verb} ${formatCLP(drift.sent)}, ahora suma ${formatCLP(drift.now)}.`
  }
  return `Tus precios cambiaron: esta cotización sumaba ${formatCLP(drift.sent)} y ahora suma ${formatCLP(drift.now)}. Tu cliente sigue viendo la versión ${drift.letter || 'A'}.`
}

export function PriceDriftNotice({ variant = 'bar', className }: { variant?: 'bar' | 'card'; className?: string }) {
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
      Enviar versión nueva{drift.next ? ` (${drift.next})` : ''}
    </Button>
  )
  const close = <IconButton icon={X} size="sm" label="Ocultar este aviso" tooltip={false} onClick={() => setUi({ driftDismissed: key })} />

  if (variant === 'card') {
    return (
      <div role="status" className={cn('rounded-md border border-warn-600/25 bg-warn-50 p-3 text-[13px] leading-[18px] text-paper-900', className)}>
        <div className="flex items-start gap-2">
          <RefreshCw aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-warn-600" />
          <p className="min-w-0 flex-1">{text}</p>
          <span className="-mt-1 -mr-1">{close}</span>
        </div>
        <div className="mt-2.5 pl-6">{send}</div>
      </div>
    )
  }
  return (
    <div role="status" className={cn('flex min-h-10 shrink-0 items-center gap-3 border-b border-warn-600/20 bg-warn-50 px-4 py-1.5 text-[13px] text-paper-900', className)}>
      <RefreshCw aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-warn-600" />
      <p className="min-w-0 flex-1 tabular">{text}</p>
      {send}
      {close}
    </div>
  )
}
