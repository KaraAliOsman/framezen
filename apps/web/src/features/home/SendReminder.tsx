import { useState } from 'react'
import { humanError } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { SegmentedControl, toast } from '../../ui'
import { useSetFollowUp } from './api'
import { reminderChoice, REMINDER_DAYS, type ReminderDays } from './homeModel'
import es from './i18n/es'

const DEFAULT_REMINDER: ReminderDays = '3'

/**
 * «Recordarme en 1, 3 o 7 días» del diálogo de envío. El servidor ya dejó 3 días al enviar: esto solo
 * lo cambia. Si no se envió nada nuevo no se conoce la fecha, y se muestra el plazo por defecto.
 */
export function SendReminder({ quoteId, followUpAt }: { quoteId: string; followUpAt?: string }) {
  const t = useT(es)
  const set = useSetFollowUp()
  const [days, setDays] = useState<ReminderDays | ''>(() => reminderChoice(followUpAt) || DEFAULT_REMINDER)
  const choose = (next: ReminderDays | '') => {
    if (!next) return
    const previous = days
    setDays(next)
    set.mutate(
      { quoteId, days: Number(next) },
      {
        onError: (error) => {
          setDays(previous)
          toast.error(humanError(error))
        },
      },
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <span className="text-table font-medium text-fg-strong">{t('reminder.label')}</span>
      <SegmentedControl<ReminderDays | ''>
        aria-label={t('reminder.label')}
        size="sm"
        value={days}
        onValueChange={choose}
        options={REMINDER_DAYS.map((value) => ({ value, label: t('reminder.days', { count: Number(value) }) }))}
      />
    </div>
  )
}
