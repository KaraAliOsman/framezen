import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '../../lib/cn'
import { fieldClass } from '../../ui'

export interface InlineFieldProps {
  label: string
  value: string
  placeholder: string
  onCommit: (value: string) => void
  type?: 'text' | 'tel' | 'email'
  multiline?: boolean
  /** Formato al confirmar (p. ej. RUT con puntos y guion). */
  normalize?: (value: string) => string
  /** Aviso suave bajo el valor (nunca impide guardar). */
  hint?: string | null
  /** Acción rápida a la derecha (llamar, WhatsApp, correo). */
  action?: ReactNode
  className?: string
}

/**
 * Dato editable en el lugar: clic (o Enter) para editar, Enter o salir para guardar, Esc para
 * dejarlo como estaba. Vacío muestra «Agregar…» en vez de un guion.
 */
export function InlineField({ label, value, placeholder, onCommit, type = 'text', multiline, normalize, hint, action, className }: InlineFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const viewRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const finish = (commit: boolean) => {
    if (commit) {
      const next = normalize ? normalize(draft) : draft.trim()
      if (next !== value) onCommit(next)
    } else {
      setDraft(value)
    }
    setEditing(false)
    requestAnimationFrame(() => viewRef.current?.focus())
  }

  const id = `inline-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className={cn('group/field flex min-h-11 items-start gap-3 py-2', className)}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-meta text-paper-600">
          {label}
        </label>
        {editing ? (
          multiline ? (
            <textarea
              id={id}
              ref={inputRef}
              value={draft}
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => finish(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  finish(false)
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish(true)
              }}
              className={cn(fieldClass, 'mt-1 w-full px-2.5 py-1.5 leading-[20px] [field-sizing:content]')}
            />
          ) : (
            <input
              id={id}
              ref={inputRef}
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => finish(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finish(true)
                if (e.key === 'Escape') {
                  e.preventDefault()
                  finish(false)
                }
              }}
              className={cn(fieldClass, 'mt-1 h-9 w-full px-2.5 touch:h-11')}
            />
          )
        ) : (
          <button
            ref={viewRef}
            id={id}
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`${label}: ${value || 'vacío'}. Editar`}
            className="-mx-2 mt-0.5 flex w-[calc(100%+16px)] items-start justify-between gap-2 rounded-sm px-2 py-1 text-left transition-colors duration-120 hover:bg-paper-100"
          >
            <span className={cn('min-w-0 break-words', value ? 'text-paper-900' : 'text-paper-600/70', multiline && 'whitespace-pre-line')}>
              {value || placeholder}
            </span>
            <Pencil aria-hidden strokeWidth={1.75} className="mt-0.5 size-3.5 shrink-0 text-paper-350 opacity-0 transition-opacity group-hover/field:opacity-100" />
          </button>
        )}
        {hint && !editing ? <p className="mt-1 text-[13px] leading-[18px] text-warn-800">{hint}</p> : null}
      </div>
      {action && !editing && value ? <div className="flex shrink-0 items-center gap-1 pt-4">{action}</div> : null}
    </div>
  )
}
