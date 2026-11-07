import { useId, useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import type { QuoteFollowUp } from '@dekopen/shared'
import { humanError } from '../../lib/api'
import { useT } from '../../lib/i18n'
import {
  Button,
  type ButtonSize,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
  toastUndo,
} from '../../ui'
import { useResolveNotices, useSetFollowUp, useSetQuoteStatus } from './api'
import { REMINDER_DAYS } from './homeModel'
import es from './i18n/es'

const MOTIVES = ['price', 'competitor', 'postponed', 'noAnswer'] as const
const MAX_REASON = 120
const showError = (error: unknown) => void toast.error(humanError(error))

/** Posponer: 1, 3 o 7 días. Con deshacer, sin confirmar. */
export function PostponeButton({ quote, size = 'sm' }: { quote: QuoteFollowUp; size?: ButtonSize }) {
  const t = useT(es)
  const set = useSetFollowUp()
  // Con mutateAsync: la fila sale de la cola al instante y un `onSuccess` de mutate ya no correría.
  const postpone = (days: number) =>
    set
      .mutateAsync({ quoteId: quote.id, days, leave: true })
      .then(({ previous }) => toastUndo(t('followUp.postponed', { count: days }), () => void set.mutateAsync({ quoteId: quote.id, at: previous }).catch(showError)))
      .catch(showError)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} iconRight={ChevronDown}>
          {t('followUp.postpone')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {REMINDER_DAYS.map((days) => (
          <DropdownMenuItem key={days} onSelect={() => postpone(Number(days))}>
            {t('followUp.postponeDays', { count: Number(days) })}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Perdida: motivo corto (uno de los frecuentes o escrito) y deshacer. Queda como «Rechazada» con su motivo. */
export function LostButton({ quote, size = 'sm' }: { quote: QuoteFollowUp; size?: ButtonSize }) {
  const t = useT(es)
  const status = useSetQuoteStatus()
  const notices = useResolveNotices()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const inputId = useId()

  const lose = (text: string) => {
    const lostReason = text.trim().slice(0, MAX_REASON)
    const ids = (quote.notices ?? []).map((n) => n.id)
    setOpen(false)
    setReason('')
    // Con mutateAsync: la fila sale de la cola al instante y un `onSuccess` de mutate ya no correría.
    status
      .mutateAsync({ quoteId: quote.id, status: 'rejected', lostReason })
      .then(() =>
        toastUndo(t('followUp.lost'), () => {
          status
            .mutateAsync({ quoteId: quote.id, status: quote.status })
            .then(() => (ids.length ? notices.mutateAsync({ quoteId: quote.id, ids, pending: true }) : undefined))
            .catch(showError)
        }),
      )
      .catch(showError)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    lose(reason)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size={size}>
          {t('followUp.markLost')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor={inputId} className="text-table font-medium text-fg-strong">
            {t('followUp.lostQuestion')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVES.map((motive) => (
              <Button key={motive} type="button" size="xs" variant="secondary" onClick={() => lose(t(`followUp.motives.${motive}`))}>
                {t(`followUp.motives.${motive}`)}
              </Button>
            ))}
          </div>
          <Input id={inputId} size="sm" value={reason} maxLength={MAX_REASON} onChange={(e) => setReason(e.target.value)} placeholder={t('followUp.lostPlaceholder')} />
          <Button type="submit" size="sm" variant="ink" className="self-end">
            {t('followUp.markLost')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
