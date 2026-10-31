/**
 * Ficha del cliente (SPEC §4): datos editables en el lugar con guardado automático (RUT con aviso
 * suave de módulo 11), sus cotizaciones, lo aceptado y «Nueva cotización para este cliente».
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Ellipsis, FilePlus2, Mail, MessageCircle, Phone, Trash2, type LucideIcon } from 'lucide-react'
import type { Client } from '@framezen/shared'
import { api, ApiRequestError, humanError } from '../../lib/api'
import { formatCLP, formatLongDate, formatNumber, formatRelative } from '../../lib/format'
import { useCatalog, useClient, useCreateQuote, useQuotes } from '../../lib/hooks'
import { usePageTitle } from '../../lib/usePageTitle'
import {
  Avatar,
  Button,
  buttonClass,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Page,
  SaveIndicator,
  Skeleton,
  StatusPill,
  toast,
  toastUndo,
} from '../../ui'
import { callName, whatsappUrl } from '../home/homeModel'
import { QuoteThumb } from '../home/QuoteThumb'
import { useAutosave } from '../settings/lib/useAutosave'
import { useUpdateClient } from './api'
import { InlineField } from './InlineField'
import { formatRut, rutHint } from './rut'

type Editable = Pick<Client, 'name' | 'phone' | 'email' | 'rut' | 'address' | 'city' | 'notes'>
const FIELDS: (keyof Editable)[] = ['name', 'phone', 'email', 'rut', 'address', 'city', 'notes']

function toDraft(client: Client): Record<keyof Editable, string> {
  return Object.fromEntries(FIELDS.map((k) => [k, client[k] ?? ''])) as Record<keyof Editable, string>
}

export default function ClientDetailPage() {
  const { id = '' } = useParams()
  const client = useClient(id)
  usePageTitle(client.data?.name ?? 'Cliente')

  if (client.isPending) return <DetailSkeleton />
  if (client.isError || !client.data) {
    const missing = client.error instanceof ApiRequestError && client.error.status === 404
    return (
      <Page width="wide">
        <div className="rounded-lg border border-paper-200 bg-paper-0">
          <EmptyState
            sketch="door"
            title={missing ? 'No encontramos este cliente' : 'No pudimos abrir la ficha'}
            description={missing ? 'Puede que lo hayan eliminado. Si fue sin querer, búscalo en la papelera desde la lista.' : humanError(client.error)}
            action={
              <Link to="/clientes" className={buttonClass('secondary')}>
                Volver a clientes
              </Link>
            }
          />
        </div>
      </Page>
    )
  }
  return <ClientDetail client={client.data} />
}

function ClientDetail({ client }: { client: Client }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const update = useUpdateClient(client.id)
  const autosave = useAutosave<Partial<Editable>>((patch) => update.mutateAsync(patch), { delay: 300, key: `client:${client.id}` })
  // Si saliste con un cambio sin guardar (sin conexión), lo sigues viendo al volver.
  const [draft, setDraft] = useState(() => toDraft({ ...client, ...autosave.unsaved() }))
  const quotes = useQuotes({ clientId: client.id })
  const catalog = useCatalog()
  const createQuote = useCreateQuote()

  // Si la ficha cambia desde otra pestaña y no hay nada pendiente, la seguimos.
  const { dirty } = autosave
  useEffect(() => {
    if (!dirty()) setDraft(toDraft(client))
  }, [client, dirty])

  const commit = (key: keyof Editable) => (value: string) => {
    if (key === 'name' && !value.trim()) {
      toast('El cliente necesita un nombre: dejamos el anterior.')
      return
    }
    setDraft((d) => ({ ...d, [key]: value }))
    autosave.queue({ [key]: value || null } as Partial<Editable>)
  }

  const list = quotes.data ?? []
  const accepted = client.totalAccepted ?? 0
  const inPlay = useMemo(() => list.filter((q) => q.status === 'sent' || q.status === 'draft').reduce((a, q) => a + q.total, 0), [list])
  const last = list[0]

  const newQuote = () =>
    createQuote.mutate(
      { clientId: client.id, title: `Obra ${draft.name}` },
      {
        onSuccess: (quote) => navigate(`/cotizaciones/${quote.id}`),
        onError: (error) => toast.error(humanError(error)),
      },
    )

  const remove = () => {
    api.clients
      .remove(client.id)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['clients'] })
        navigate('/clientes')
        toastUndo(`Eliminaste a ${client.name}`, () => {
          api.clients
            .restore(client.id)
            .then(() => {
              void queryClient.invalidateQueries({ queryKey: ['clients'] })
              navigate(`/clientes/${client.id}`)
            })
            .catch((error) => toast.error(humanError(error)))
        })
      })
      .catch((error) => toast.error(humanError(error)))
  }

  const hello = callName(draft.name)
  const wa = whatsappUrl(draft.phone, hello ? `Hola ${hello}, ` : 'Hola, ')

  return (
    <Page width="wide">
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-[13px] text-paper-600">
        <Link to="/clientes" className="rounded-xs hover:text-paper-900">
          Clientes
        </Link>
        <span aria-hidden className="text-paper-350">/</span>
        <span aria-current="page" className="truncate text-paper-900">
          {draft.name}
        </span>
      </nav>

      {/* El nombre manda: completo, en hasta tres líneas; las acciones van debajo hasta xl. */}
      <header className="flex flex-col gap-4 pb-6 xl:flex-row xl:items-start xl:justify-between xl:gap-x-8">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar name={draft.name} size="lg" className="size-12 shrink-0 text-[16px]" />
          <div className="min-w-0 flex-1">
            <EditableTitle value={draft.name} onCommit={commit('name')} />
            <p className="mt-0.5 text-[13px] text-paper-600">
              {[draft.city, `Cliente desde ${formatLongDate(client.createdAt).replace(/^\d+ de /, '')}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:pt-1">
          <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} className="max-sm:hidden" />
          {draft.phone ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" className={buttonClass('secondary', 'md', 'max-sm:px-3')}>
              <MessageCircle aria-hidden strokeWidth={1.75} />
              <span className="max-sm:hidden">WhatsApp</span>
            </a>
          ) : null}
          <Button variant="primary" icon={FilePlus2} onClick={newQuote} loading={createQuote.isPending} className="max-sm:flex-1">
            <span className="sm:hidden">Nueva cotización</span>
            <span className="max-sm:hidden">Nueva cotización para este cliente</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={Ellipsis} label="Más acciones" variant="secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={Trash2} danger onSelect={remove}>
                Eliminar cliente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {autosave.error ? (
        <p role="alert" className="mb-5 rounded-md border border-bad-600/20 bg-bad-50 px-3 py-2 text-[13px] text-bad-800">
          {autosave.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section aria-labelledby="client-data" className="self-start rounded-lg border border-paper-200 bg-paper-0 max-lg:order-2">
          <header className="border-b border-paper-200 px-4 py-3">
            <h2 id="client-data" className="font-semibold text-paper-900">
              Datos
            </h2>
            <p className="text-meta text-paper-600">Haz clic en un dato para cambiarlo. Se guarda solo.</p>
          </header>
          <div className="divide-y divide-paper-200 px-4">
            <InlineField
              label="Teléfono"
              type="tel"
              value={draft.phone}
              placeholder="Agregar teléfono"
              onCommit={commit('phone')}
              action={
                <>
                  <ActionLink href={`tel:${draft.phone.replace(/[^\d+]/g, '')}`} label="Llamar" icon={Phone} />
                  <ActionLink href={wa} label="Escribir por WhatsApp" icon={MessageCircle} external />
                </>
              }
            />
            <InlineField
              label="Correo"
              type="email"
              value={draft.email}
              placeholder="Agregar correo"
              onCommit={commit('email')}
              action={
                <ActionLink href={`mailto:${draft.email}`} label="Escribir un correo" icon={Mail} />
              }
            />
            <InlineField label="RUT" value={draft.rut} placeholder="Agregar RUT" normalize={(v) => formatRut(v)} hint={rutHint(draft.rut)} onCommit={commit('rut')} />
            <InlineField label="Dirección" value={draft.address} placeholder="Agregar dirección" onCommit={commit('address')} />
            <InlineField label="Ciudad" value={draft.city} placeholder="Agregar ciudad" onCommit={commit('city')} />
            <InlineField label="Notas" value={draft.notes} placeholder="Cómo llegó, qué le interesa, horario para llamar…" multiline onCommit={commit('notes')} />
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-5 max-lg:order-1">
          {/* Tres columnas solo si caben las cifras completas (contenedor ≥ 560 px); si no, filas. */}
          <div className="@container">
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-paper-200 bg-paper-200 @[560px]:grid-cols-3">
              <Stat label="Aceptado" value={formatCLP(accepted)} hint="ventas cerradas, con IVA" />
              <Stat label="En curso" value={formatCLP(inPlay)} hint="borradores y enviadas, con IVA" />
              <Stat label="Cotizaciones" value={formatNumber(client.quotesCount ?? list.length)} hint={last ? `última ${formatRelative(last.updatedAt)}` : 'ninguna todavía'} />
            </dl>
          </div>

          <section aria-labelledby="client-quotes" className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
            <header className="flex items-center justify-between gap-3 border-b border-paper-200 px-5 py-3.5">
              <h2 id="client-quotes" className="font-semibold text-paper-900">
                Cotizaciones
              </h2>
              {list.length ? (
                <button type="button" onClick={newQuote} className="text-[13px] font-medium text-ink-600 hover:text-ink-700">
                  Nueva
                </button>
              ) : null}
            </header>
            {quotes.isPending ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                size="compact"
                sketch="sliding"
                title="Aún no hay cotizaciones para este cliente"
                description="Crea la primera y queda asociada a esta ficha."
                action={
                  <Button variant="secondary" icon={FilePlus2} onClick={newQuote} loading={createQuote.isPending}>
                    Nueva cotización
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-paper-200">
                {list.map((q) => (
                  <li key={q.id}>
                    <Link to={`/cotizaciones/${q.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors duration-120 hover:bg-paper-50 max-sm:gap-3 max-sm:px-4">
                      <QuoteThumb item={q.firstItem} catalog={catalog.data} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-words">
                          <span className="mr-2 text-[13px] text-paper-600 tabular">N° {q.number}</span>
                          <span className="font-medium text-paper-900">{q.title || 'Sin título'}</span>
                        </p>
                        <p className="text-[13px] text-paper-600">
                          {q.units ? `${formatNumber(q.units)} ${q.units === 1 ? 'ventana' : 'ventanas'} · ` : ''}
                          {formatRelative(q.updatedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-medium whitespace-nowrap text-paper-900 tabular">{formatCLP(q.total)}</span>
                        <StatusPill status={q.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Page>
  )
}

function ActionLink({ href, label, icon: Icon, external }: { href: string; label: string; icon: LucideIcon; external?: boolean }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="inline-flex size-8 items-center justify-center rounded-sm text-paper-600 transition-colors duration-120 hover:bg-paper-100 hover:text-paper-900 touch:size-10"
    >
      <Icon aria-hidden strokeWidth={1.75} className="size-4" />
    </a>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 bg-paper-0 px-4 py-3 @[560px]:block @[560px]:px-5 @[560px]:py-3.5">
      <dt className="text-[13px] text-paper-600">{label}</dt>
      <dd className="row-span-2 text-h3 font-semibold whitespace-nowrap text-paper-900 tabular @[560px]:mt-0.5 @[560px]:text-h2">{value}</dd>
      <dd className="text-meta text-pretty text-paper-600">{hint}</dd>
    </div>
  )
}

/** Nombre del cliente editable en el lugar (título de la página). */
function EditableTitle({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  const finish = (commit: boolean) => {
    if (commit && draft.trim() !== value) onCommit(draft.trim())
    setEditing(false)
  }
  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Nombre del cliente"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true)
          if (e.key === 'Escape') finish(false)
        }}
        className="-mx-1.5 w-full max-w-[720px] rounded-sm border border-ink-500 bg-paper-0 px-1.5 text-h2 font-semibold tracking-[-0.01em] text-paper-900 outline-none sm:text-h1"
      />
    )
  }
  return (
    <h1>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Cambiar nombre"
        className="-mx-1.5 max-w-full rounded-sm px-1.5 text-left text-h2 font-semibold tracking-[-0.01em] text-balance text-paper-900 transition-colors duration-120 hover:bg-paper-100 sm:text-h1"
      >
        <span className="line-clamp-3 break-words">{value}</span>
      </button>
    </h1>
  )
}

function DetailSkeleton() {
  return (
    <Page width="wide">
      <Skeleton className="mb-6 h-4 w-40" />
      <div className="mb-8 flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </Page>
  )
}
