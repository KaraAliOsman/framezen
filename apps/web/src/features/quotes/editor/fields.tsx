/**
 * Campos pequeños del editor: cantidad en línea, título de obra en el lugar y cliente con
 * «crear» al vuelo. Todos confirman solos (sin botón «Guardar»).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { Client } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useClients, useCreateClient } from '../../../lib/hooks'
import { useT } from '../../../lib/i18n'
import { Combobox } from '../../../ui'
import es from '../i18n/es'
import { QUOTE_LIMITS } from '../model/doc'
import { toast } from './toasts'
import { useEditor, useEditorShallow } from './context'

// ── Cantidad ──────────────────────────────────────────────────────────────────

export function QtyStepper({
  value,
  onChange,
  label,
  size = 'sm',
  quiet = false,
  className,
  tabIndex,
  stepButtonsInTabOrder = true,
}: {
  value: number
  onChange: (value: number) => void
  label: string
  size?: 'sm' | 'md'
  /** En filas: se lee como un número y −/+ aparecen al pasar por la fila (el ancho no cambia). */
  quiet?: boolean
  className?: string
  /** Tab del campo (en listas con foco itinerante solo la fila activa entra al orden de Tab). */
  tabIndex?: number
  /** −/+ con Tab propio. En listas se quitan: el campo ya acepta ↑/↓. */
  stepButtonsInTabOrder?: boolean
}) {
  const t = useT(es)
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number.parseInt(draft.replace(/\D/g, ''), 10)
    if (Number.isFinite(n) && n !== value) onChange(Math.max(0, Math.min(n, 9999)))
    setDraft(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      setDraft(null)
      e.currentTarget.blur()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(value + 1)
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.max(0, value - 1))
    }
  }
  const h = size === 'sm' ? 'h-6' : 'h-9 touch:h-11'
  const btn = cn(
    'inline-flex shrink-0 items-center justify-center text-fg-muted transition-[background-color,color,opacity] duration-100 hover:bg-hover hover:text-fg-strong disabled:opacity-40',
    size === 'sm' ? 'w-6' : 'w-9 touch:w-11',
    quiet && 'rounded-xs opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100',
  )
  const less = (
    <button
      type="button"
      className={btn}
      aria-label={t('qty.less')}
      tabIndex={stepButtonsInTabOrder ? undefined : -1}
      disabled={value <= 0}
      onClick={() => onChange(Math.max(0, value - 1))}
    >
      <Minus aria-hidden strokeWidth={2} className="size-3" />
    </button>
  )
  return (
    <div
      role="group"
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className={cn('inline-flex items-stretch overflow-hidden', !quiet && 'rounded-sm border border-divider-strong bg-surface', h, className)}
    >
      {quiet ? (
        <span aria-hidden className="flex items-center pr-0.5 text-table text-fg-muted">
          ×
        </span>
      ) : (
        less
      )}
      <input
        aria-label={label}
        tabIndex={tabIndex}
        inputMode="numeric"
        value={draft ?? String(value)}
        onFocus={(e) => {
          setDraft(String(value))
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={cn(
          // Foco siempre visible (anillo de 2 px por dentro: el grupo recorta lo que sobresale).
          'min-w-0 bg-transparent text-center font-medium tabular text-fg-strong outline-none focus:bg-accent-subtle',
          !quiet && 'border-x border-divider',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid',
          size === 'sm' ? 'w-8 text-table' : 'w-12 text-base touch:text-lead',
          quiet && 'w-6! text-left',
        )}
      />
      {quiet ? less : null}
      <button type="button" className={btn} aria-label={t('qty.more')} tabIndex={stepButtonsInTabOrder ? undefined : -1} onClick={() => onChange(value + 1)}>
        <Plus aria-hidden strokeWidth={2} className="size-3" />
      </button>
    </div>
  )
}

// ── Título de la obra ─────────────────────────────────────────────────────────

/**
 * Título editable en el lugar: se ve como texto y se escribe encima. En la cabecera (`md`) es una
 * sola línea que no crece; en el teléfono (`lg`) crece con el texto.
 */
export function TitleField({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const t = useT(es)
  const editor = useEditor()
  const { title } = useEditorShallow((s) => ({ title: s.doc.title }))
  const ref = useRef<HTMLTextAreaElement>(null)
  const grows = size === 'lg'

  useEffect(() => {
    const el = ref.current
    if (!el || !grows) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title, grows])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={title}
      spellCheck={false}
      aria-label={t('header.title')}
      placeholder={t('header.title')}
      title={title || undefined}
      maxLength={QUOTE_LIMITS.title}
      onChange={(e) => editor.setTitle(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      className={cn(
        'block resize-none rounded-sm border border-transparent bg-transparent px-1.5 font-display font-medium text-fg-strong',
        'transition-[border-color,background-color] duration-100 placeholder:text-fg-faint hover:border-divider focus:border-focus focus:bg-surface focus:shadow-[0_0_0_3px_var(--dk-focus-ring)] focus:outline-none',
        grows ? '-mx-1.5 w-[calc(100%+12px)] overflow-hidden py-0.5 text-h2' : 'h-9 overflow-hidden py-1 text-h3 whitespace-nowrap',
        className,
      )}
    />
  )
}

// ── Cliente ───────────────────────────────────────────────────────────────────

/**
 * Cliente de la cotización: buscar o crear al vuelo. `inline` = en la cabecera, sin borde hasta
 * pasar el puntero (se lee como texto, se usa como campo).
 */
export function ClientField({ className, variant = 'field' }: { className?: string; variant?: 'field' | 'inline' }) {
  const t = useT(es)
  const editor = useEditor()
  const { clientId, known } = useEditorShallow((s) => ({ clientId: s.doc.clientId, known: s.doc.clientId ? s.clients[s.doc.clientId] : undefined }))
  const clients = useClients('')
  const createClient = useCreateClient()

  const options = useMemo(() => {
    const list: Client[] = [...(clients.data ?? [])]
    if (known && !list.some((c) => c.id === known.id)) list.unshift(known)
    return list.map((c) => ({
      value: c.id,
      label: c.name,
      hint: c.city || c.rut || undefined,
      keywords: [c.rut ?? '', c.email ?? '', c.phone ?? ''],
    }))
  }, [clients.data, known])

  return (
    <Combobox
      value={clientId}
      onChange={(id) => {
        const client = id ? ((clients.data ?? []).find((c) => c.id === id) ?? known) : undefined
        editor.setClient(id ?? null, client)
      }}
      options={options}
      clearable
      clearLabel={t('client.clear')}
      placeholder={t('client.placeholder')}
      searchPlaceholder={t('client.search')}
      emptyText={t('client.empty')}
      createLabel={(name) => t.rich('client.create', { b: <span className="font-medium" />, name })}
      onCreate={async (name) => {
        try {
          const created = await createClient.mutateAsync({ name })
          editor.setClient(created.id, created)
          toast.success(t('client.created', { name: created.name }))
        } catch (error) {
          toast.error(humanError(error))
        }
      }}
      aria-label={t('client.label')}
      className={cn(
        variant === 'inline' ? 'h-9! w-auto justify-start! border-transparent! bg-transparent! text-fg-muted shadow-none! hover:border-divider! data-[state=open]:border-focus!' : 'w-full',
        className,
      )}
    />
  )
}
