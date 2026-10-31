/**
 * Campos pequeños del editor: cantidad en línea, título de obra en el lugar y cliente con
 * «crear» al vuelo. Todos confirman solos (sin botón «Guardar»).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Minus, Plus, UserRound } from 'lucide-react'
import type { Client } from '@framezen/shared'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useClients, useCreateClient } from '../../../lib/hooks'
import { Combobox } from '../../../ui'
import { QUOTE_LIMITS } from '../model/doc'
import { toast } from './toasts'
import { useEditor, useEditorShallow } from './context'

// ── Cantidad ──────────────────────────────────────────────────────────────────

export function QtyStepper({
  value,
  onChange,
  label,
  size = 'sm',
  className,
  tabIndex,
  stepButtonsInTabOrder = true,
}: {
  value: number
  onChange: (value: number) => void
  label: string
  size?: 'sm' | 'md'
  className?: string
  /** Tab del campo (en listas con foco itinerante solo la fila activa entra al orden de Tab). */
  tabIndex?: number
  /** −/+ con Tab propio. En listas se quitan: el campo ya acepta ↑/↓. */
  stepButtonsInTabOrder?: boolean
}) {
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
    'inline-flex shrink-0 items-center justify-center text-paper-600 transition-colors duration-120 hover:bg-paper-100 hover:text-paper-900 disabled:opacity-40',
    size === 'sm' ? 'w-6' : 'w-9 touch:w-11',
  )
  return (
    <div
      role="group"
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className={cn('inline-flex items-stretch overflow-hidden rounded-sm border border-paper-200 bg-paper-0', h, className)}
    >
      <button
        type="button"
        className={btn}
        aria-label="Una menos"
        tabIndex={stepButtonsInTabOrder ? undefined : -1}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        <Minus aria-hidden strokeWidth={2} className="size-3" />
      </button>
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
          'min-w-0 border-x border-paper-200 bg-transparent text-center font-medium tabular text-paper-900 outline-none focus:bg-ink-50',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-500 focus-visible:outline-solid',
          size === 'sm' ? 'w-8 text-[13px]' : 'w-12 text-base touch:text-lead',
        )}
      />
      <button type="button" className={btn} aria-label="Una más" tabIndex={stepButtonsInTabOrder ? undefined : -1} onClick={() => onChange(value + 1)}>
        <Plus aria-hidden strokeWidth={2} className="size-3" />
      </button>
    </div>
  )
}

// ── Título de la obra ─────────────────────────────────────────────────────────

/** Título editable en el lugar: se ve como texto y se escribe encima. */
export function TitleField({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const editor = useEditor()
  const { title } = useEditorShallow((s) => ({ title: s.doc.title }))
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={title}
      spellCheck={false}
      aria-label="Nombre de la obra"
      placeholder="Nombre de la obra"
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
        '-mx-1.5 block w-[calc(100%+12px)] resize-none overflow-hidden rounded-sm border border-transparent bg-transparent px-1.5 py-0.5 font-semibold tracking-[-0.01em] text-paper-900',
        'transition-[border-color,background-color] duration-120 placeholder:text-paper-350 hover:border-paper-200 focus:border-ink-500 focus:bg-paper-0 focus:outline-none',
        size === 'lg' ? 'text-h2' : 'text-h3',
        className,
      )}
    />
  )
}

// ── Cliente ───────────────────────────────────────────────────────────────────

export function ClientField({ className }: { className?: string }) {
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
        const client = id ? (clients.data ?? []).find((c) => c.id === id) ?? known : undefined
        editor.setClient(id ?? null, client)
      }}
      options={options}
      clearable
      clearLabel="Sin cliente por ahora"
      placeholder="Agregar cliente (opcional)"
      searchPlaceholder="Busca o escribe un nombre…"
      emptyText="Aún no tienes clientes. Escribe un nombre para crearlo."
      createLabel={(q) => (
        <>
          Crear cliente <span className="font-medium">«{q}»</span>
        </>
      )}
      onCreate={async (name) => {
        try {
          const created = await createClient.mutateAsync({ name })
          editor.setClient(created.id, created)
          toast.success(`Creaste a ${created.name}. Completa sus datos cuando quieras en Clientes.`)
        } catch (error) {
          toast.error(humanError(error))
        }
      }}
      aria-label="Cliente"
      className={cn('w-full', className)}
    />
  )
}

export function ClientGlyph() {
  return <UserRound aria-hidden strokeWidth={1.75} className="size-4 text-paper-600" />
}
