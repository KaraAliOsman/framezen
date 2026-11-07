import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Pencil } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../lib/i18n'
import { fieldClass } from '../../ui'
import es from './i18n/es'

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
  /** Recién guardado: muestra ✓ un momento. */
  saved?: boolean
  /** Cifras tabulares (documentos, códigos). */
  mono?: boolean
  readOnly?: boolean
  className?: string
}

/**
 * Dato editable en el lugar: etiqueta arriba y valor abajo. Clic (o Enter) para editar, Enter o salir para guardar, Esc para dejarlo como estaba.
 * Vacío muestra «Agregar…» en vez de un guion.
 */
export function InlineField({
  label,
  value,
  placeholder,
  onCommit,
  type = 'text',
  multiline,
  normalize,
  hint,
  action,
  saved,
  mono,
  readOnly,
  className,
}: InlineFieldProps) {
  const t = useT(es)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const viewRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const id = useId()
  const hintId = `${id}-hint`

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

  const showHint = Boolean(hint) && !editing

  return (
    <div className={cn('group/field min-w-0 py-1', className)}>
      <label htmlFor={id} className="block text-table text-fg-muted">
        {label}
      </label>
      <div className="min-w-0">
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
              className={cn(fieldClass, 'w-full px-2.5 py-1.5 text-base [field-sizing:content]')}
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
              className={cn(fieldClass, 'h-8 w-full px-2.5 text-base touch:h-11', mono && 'code-id')}
            />
          )
        ) : (
          <div className="flex min-w-0 items-start gap-1">
            <button
              ref={viewRef}
              id={id}
              type="button"
              disabled={readOnly}
              onClick={() => setEditing(true)}
              aria-label={t('inline.edit', { label, value: value || t('inline.empty') })}
              aria-describedby={showHint ? hintId : undefined}
              className={cn(
                '-ml-2 flex min-h-8 min-w-0 flex-1 items-start justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-base',
                'transition-colors duration-100 ease-out hover:bg-hover disabled:pointer-events-none touch:min-h-11',
              )}
            >
              <span
                className={cn(
                  'min-w-0 break-words',
                  value ? 'text-fg' : 'text-fg-faint',
                  multiline && 'whitespace-pre-line',
                  mono && value && 'code-id',
                )}
              >
                {value || placeholder}
              </span>
              {saved ? (
                <span className="mt-0.5 inline-flex shrink-0 items-center text-success motion-safe:animate-[fz-fade-in_140ms_cubic-bezier(0.2,0.8,0.2,1)_both]" role="status">
                  <Check aria-hidden strokeWidth={2.25} className="size-3.5" />
                  <span className="sr-only">{t('inline.saved')}</span>
                </span>
              ) : (
                <Pencil
                  aria-hidden
                  strokeWidth={1.75}
                  className="mt-1 size-3.5 shrink-0 text-fg-faint opacity-0 transition-opacity duration-100 group-hover/field:opacity-100"
                />
              )}
            </button>
            {action && value ? <div className="flex shrink-0 items-center">{action}</div> : null}
          </div>
        )}
        {showHint ? (
          <p id={hintId} className="mt-0.5 mb-1 text-table text-warning">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
