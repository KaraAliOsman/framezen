/**
 * Campos editables de la OT con guardado automático: fecha comprometida (con deshacer) y
 * notas para el taller. Nunca hay botón «Guardar».
 */
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { ApiRequestError, humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { SaveIndicator, Textarea, toast, toastUndo, type SaveStatus } from '../../../ui'
import { useUpdateWorkOrder, type WorkOrderDetail } from '../data'
import es from '../i18n/es'
import { dueInfo } from '../model/orders'

/** Fecha razonable para comprometer (al escribir el año a mano pasan por 0002, 0020, 0202…). */
export function isPlausibleDueDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const year = Number(m[1])
  return year >= 2000 && year <= 2100
}

const DUE_DEBOUNCE_MS = 700

export function DueDateField({ order, now, readOnly }: { order: WorkOrderDetail; now: Date; readOnly?: boolean }) {
  const t = useT(es)
  const fmt = useFormat()
  const update = useUpdateWorkOrder()
  const saved = order.dueDate?.slice(0, 10) ?? ''
  // Borrador local: el calendario confirma al tiro; escribir a mano espera a que termines.
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const value = draft ?? saved
  const due = dueInfo(value || undefined, { now, done: order.status === 'done', locale: t.locale })

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const save = (next: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setDraft(null)
    if (next === saved) return
    if (next && !isPlausibleDueDate(next)) return
    const previous = saved
    const onError = (error: unknown) => toast.error(humanError(error))
    update.mutate({ id: order.id, patch: { dueDate: next || null } }, { onError })
    toastUndo(next ? t('fields.dueSet', { date: fmt.date(`${next}T12:00:00`) }) : t('fields.dueCleared'), () =>
      update.mutate({ id: order.id, patch: { dueDate: previous || null } }, { onError }),
    )
  }

  const change = (next: string) => {
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    if (next === '' || isPlausibleDueDate(next)) timer.current = setTimeout(() => save(next), DUE_DEBOUNCE_MS)
  }

  return (
    <div className="inline-flex items-center gap-2">
      <label
        className={cn(
          'relative inline-flex h-8 items-center gap-2 rounded-sm border pr-2 pl-2.5 text-table transition-colors duration-100 touch:h-10',
          'border-control bg-surface hover:border-control-hover focus-within:border-focus focus-within:ring-focus',
          due.tone === 'late' && 'border-danger-line bg-danger-bg',
          due.tone === 'soon' && 'border-warning-line bg-warning-bg',
        )}
      >
        <CalendarDays aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
        <span className="text-fg-muted">{t('fields.due')}</span>
        <span className="relative inline-flex items-center">
          <input
            type="date"
            value={value}
            disabled={readOnly}
            onChange={(e) => change(e.target.value)}
            onBlur={() => {
              if (draft !== null) save(draft)
            }}
            onClick={(e) => {
              // Un clic en cualquier parte abre el calendario (no solo en el icono).
              try {
                e.currentTarget.showPicker?.()
              } catch {
                // navegadores sin showPicker: el campo sigue editable a mano
              }
            }}
            aria-label={t('fields.dueLabel')}
            className={cn(
              'peer w-[8.6rem] bg-transparent font-medium tabular outline-none [color-scheme:light] dark:[color-scheme:dark]',
              value ? 'text-fg-strong' : 'text-transparent focus:text-fg-strong',
            )}
          />
          {value ? null : (
            <span aria-hidden className="pointer-events-none absolute left-0 font-medium text-accent peer-focus:hidden">
              {t('fields.addDate')}
            </span>
          )}
        </span>
      </label>
      {value && !readOnly ? (
        <button
          type="button"
          onClick={() => save('')}
          aria-label={t('fields.clearDate')}
          className="inline-flex size-7 items-center justify-center rounded-sm text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg touch:size-10"
        >
          <X aria-hidden strokeWidth={1.75} className="size-4" />
        </button>
      ) : null}
      {due.tone === 'late' || due.tone === 'soon' ? (
        <span className={cn('text-table font-medium', due.tone === 'late' ? 'text-danger' : 'text-warning')}>{due.label}</span>
      ) : null}
    </div>
  )
}

const DEBOUNCE_MS = 800

/** Notas generales de la OT (salen impresas en cada hoja de OT). */
export function NotesField({ order, readOnly }: { order: WorkOrderDetail; readOnly?: boolean }) {
  const t = useT(es)
  const update = useUpdateWorkOrder()
  const [draft, setDraft] = useState(order.notes ?? '')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingText = useRef<string | null>(null)
  const orderId = order.id
  const mutate = update.mutate

  // Si cambia desde fuera (otra pestaña) y no estás escribiendo, seguimos al servidor.
  useEffect(() => {
    if (pendingText.current === null) setDraft(order.notes ?? '')
  }, [order.notes])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const text = pendingText.current
    if (text === null) return
    pendingText.current = null
    setStatus('saving')
    mutate(
      { id: orderId, patch: { notes: text.trim() ? text : null } },
      {
        onSuccess: () => {
          setStatus('saved')
          setSavedAt(new Date())
        },
        // Sin conexión (status 0): los cambios quedan en pantalla y se reintenta al volver a escribir.
        onError: (error) => setStatus(error instanceof ApiRequestError && error.status === 0 ? 'offline' : 'error'),
      },
    )
  }

  // Al salir de la página, guarda lo pendiente.
  useEffect(() => () => flush(), [])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="ot-notes" className="text-table font-medium text-fg">
          {t('fields.notes')}
        </label>
        <SaveIndicator status={status} savedAt={savedAt} />
      </div>
      <Textarea
        id="ot-notes"
        value={draft}
        readOnly={readOnly}
        rows={3}
        placeholder={t('fields.notesPlaceholder')}
        onChange={(e) => {
          setDraft(e.target.value)
          pendingText.current = e.target.value
          setStatus('idle')
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(flush, DEBOUNCE_MS)
        }}
        onBlur={flush}
      />
      <p className="text-meta text-fg-muted">{t('fields.notesHint')}</p>
    </div>
  )
}
