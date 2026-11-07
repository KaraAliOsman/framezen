/**
 * Ficha del cliente: nombre grande, sus datos en línea editables en el sitio (guardado automático,
 * RUT con aviso suave de módulo 11), cifras sueltas y el historial en pestañas (cotizaciones,
 * actividad, notas). Sin tarjetas.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Ellipsis, FilePlus2, Mail, MessageCircle, Phone, Trash2 } from 'lucide-react'
import { DEFAULT_LOCALE, type Client } from '@dekopen/shared'
import { api, ApiRequestError, humanError } from '../../lib/api'
import { useOptionalSession } from '../../lib/auth'
import { useCatalog, useClient, useCreateQuote, useQuotes } from '../../lib/hooks'
import { loadLocale, translate, useFormat, useT } from '../../lib/i18n'
import { usePlan } from '../../lib/plan'
import { usePageTitle } from '../../lib/usePageTitle'
import {
  Button,
  buttonClass,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  KPI,
  Notice,
  Page,
  PageHeader,
  SaveIndicator,
  Skeleton,
  SkeletonRows,
  StatStrip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  toastUndo,
} from '../../ui'
import { callName, whatsappUrl } from '../home/homeModel'
import { useAutosave } from '../settings/lib/useAutosave'
import { useUpdateClient } from './api'
import { ClientActivity } from './components/ClientActivity'
import { ClientNotes } from './components/ClientNotes'
import { ClientQuotes } from './components/ClientQuotes'
import es from './i18n/es'
import { InlineField } from './InlineField'
import { inPlayTotal } from './model/timeline'
import { useTaxIdRules } from './taxId'

type Editable = Pick<Client, 'name' | 'phone' | 'email' | 'rut' | 'address' | 'city' | 'notes'>
type EditableKey = keyof Editable
const FIELDS: EditableKey[] = ['name', 'phone', 'email', 'rut', 'address', 'city', 'notes']
const TABS = ['cotizaciones', 'actividad', 'notas'] as const
type Tab = (typeof TABS)[number]
/** Cuánto se ve el ✓ de «guardado» junto al dato. */
const SAVED_FLASH_MS = 1600

function toDraft(client: Client): Record<EditableKey, string> {
  return Object.fromEntries(FIELDS.map((k) => [k, client[k] ?? ''])) as Record<EditableKey, string>
}

export default function ClientDetailPage() {
  const t = useT(es)
  const { id = '' } = useParams()
  const client = useClient(id)
  usePageTitle(client.data?.name ?? t('detail.titleFallback'))

  if (client.isPending) return <DetailSkeleton />
  if (client.isError || !client.data) {
    const missing = client.error instanceof ApiRequestError && client.error.status === 404
    return (
      <Page width="default">
        <EmptyState
          title={missing ? t('detail.missing.title') : t('detail.missing.errorTitle')}
          description={missing ? t('detail.missing.description') : humanError(client.error)}
          action={
            <Link to="/clientes" className={buttonClass('secondary')}>
              {t('detail.missing.back')}
            </Link>
          }
        />
      </Page>
    )
  }
  return <ClientDetail client={client.data} />
}

function ClientDetail({ client }: { client: Client }) {
  const t = useT(es)
  const fmt = useFormat()
  const tax = useTaxIdRules()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useOptionalSession()
  const readOnly = usePlan()?.readOnly ?? false
  const update = useUpdateClient(client.id)
  const autosave = useAutosave<Partial<Editable>>((patch) => update.mutateAsync(patch), { delay: 300, key: `client:${client.id}` })
  // Si saliste con un cambio sin guardar (sin conexión), lo sigues viendo al volver.
  const [draft, setDraft] = useState(() => toDraft({ ...client, ...autosave.unsaved() }))
  const quotes = useQuotes({ clientId: client.id })
  const catalog = useCatalog()
  const createQuote = useCreateQuote()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('pestana')
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'cotizaciones'
  const setTab = (next: string) => {
    const p = new URLSearchParams(params)
    if (next === 'cotizaciones') p.delete('pestana')
    else p.set('pestana', next)
    setParams(p, { replace: true })
  }

  // Si la ficha cambia desde otra pestaña y no hay nada pendiente, la seguimos.
  const { dirty } = autosave
  useEffect(() => {
    if (!dirty()) setDraft(toDraft(client))
  }, [client, dirty])

  // ✓ junto a cada dato recién guardado: los que se confirmaron con el último guardado.
  const pendingKeys = useRef(new Set<EditableKey>())
  const [savedKeys, setSavedKeys] = useState<ReadonlySet<EditableKey>>(new Set())
  useEffect(() => {
    if (autosave.status !== 'saved' || pendingKeys.current.size === 0) return
    setSavedKeys(new Set(pendingKeys.current))
    pendingKeys.current.clear()
    const timer = setTimeout(() => setSavedKeys(new Set()), SAVED_FLASH_MS)
    return () => clearTimeout(timer)
  }, [autosave.status, autosave.savedAt])

  const commit = (key: EditableKey) => (value: string) => {
    if (key === 'name' && !value.trim()) {
      toast(t('detail.nameRequired'))
      return
    }
    setDraft((d) => ({ ...d, [key]: value }))
    pendingKeys.current.add(key)
    autosave.queue({ [key]: value || null } as Partial<Editable>)
  }

  const list = quotes.data ?? []
  const accepted = client.totalAccepted ?? 0
  const inPlay = useMemo(() => inPlayTotal(list), [list])
  const last = list[0]

  // El saludo de WhatsApp va al cliente: en el idioma de los documentos de la empresa.
  const docLocale = session?.org.locale ?? DEFAULT_LOCALE
  useEffect(() => {
    void loadLocale(docLocale)
  }, [docLocale])
  const hello = callName(draft.name)
  const greeting = hello ? translate(es, 'detail.whatsappHello', { name: hello }, docLocale) : translate(es, 'detail.whatsappHelloAnon', undefined, docLocale)
  const wa = whatsappUrl(draft.phone, greeting)

  const newQuote = () =>
    createQuote.mutate(
      { clientId: client.id, title: t('detail.quoteTitle', { name: draft.name }) },
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
        toastUndo(t('detail.removed', { name: client.name }), () => {
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

  const copyContact = () => {
    const lines = [draft.name, draft.phone, draft.email, draft.rut ? `${tax.label} ${draft.rut}` : '', [draft.address, draft.city].filter(Boolean).join(', ')].filter(Boolean)
    navigator.clipboard
      ?.writeText(lines.join('\n'))
      .then(() => toast.success(t('detail.copied', { name: draft.name })))
      .catch(() => undefined)
  }

  const since = useMemo(() => {
    if (Number.isNaN(Date.parse(client.createdAt))) return null
    return t('detail.since', { date: fmt.date(client.createdAt, 'monthYear') })
  }, [client.createdAt, fmt, t])

  const phoneHref = `tel:${draft.phone.replace(/[^\d+]/g, '')}`

  const field = (key: EditableKey) => ({ value: draft[key], onCommit: commit(key), saved: savedKeys.has(key), readOnly })

  return (
    <Page width="default">
      <PageHeader
        breadcrumbs={[{ label: t('detail.crumb'), to: '/clientes' }, { label: draft.name }]}
        title={<EditableTitle value={draft.name} onCommit={commit('name')} readOnly={readOnly} />}
        meta={since ? <span>{since}</span> : undefined}
        actions={
          <>
            <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} className="max-sm:hidden" />
            <Button variant="primary" icon={FilePlus2} onClick={newQuote} loading={createQuote.isPending} disabled={readOnly} className="max-sm:flex-1">
              <span className="sm:hidden">{t('detail.newQuoteShort')}</span>
              <span className="max-sm:hidden">{t('detail.newQuote')}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={Ellipsis} label={t('detail.more')} variant="secondary" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem icon={Copy} onSelect={copyContact}>
                  {t('detail.copy')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={Trash2} danger disabled={readOnly} onSelect={remove}>
                  {t('detail.remove')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {autosave.error ? (
        <Notice tone="danger" className="mb-5">
          {autosave.error}
        </Notice>
      ) : null}

      {draft.phone || draft.email ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {draft.phone ? (
            <a href={phoneHref} aria-label={t('detail.call')} className={buttonClass('secondary', 'sm')}>
              <Phone aria-hidden strokeWidth={1.75} />
              {t('detail.call')}
            </a>
          ) : null}
          {draft.phone ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={t('detail.whatsappLabel')} className={buttonClass('secondary', 'sm')}>
              <MessageCircle aria-hidden strokeWidth={1.75} />
              {t('detail.whatsapp')}
            </a>
          ) : null}
          {draft.email ? (
            <a href={`mailto:${draft.email}`} aria-label={t('detail.email')} className={buttonClass('secondary', 'sm')}>
              <Mail aria-hidden strokeWidth={1.75} />
              {t('fields.email')}
            </a>
          ) : null}
        </div>
      ) : null}

      <section aria-label={t('detail.sections.contact')} className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        <InlineField label={t('fields.phone')} type="tel" placeholder={t('add.phone')} {...field('phone')} />
        <InlineField label={t('fields.email')} type="email" placeholder={t('add.email')} {...field('email')} />
        <InlineField label={tax.label} placeholder={tax.addLabel} normalize={tax.normalize} hint={tax.hint(draft.rut)} mono={tax.chile} {...field('rut')} />
        <InlineField label={t('fields.address')} placeholder={t('add.address')} {...field('address')} />
        <InlineField label={t('fields.city')} placeholder={t('add.city')} {...field('city')} />
      </section>

      <StatStrip className="mt-8">
        <KPI variant="plain" label={t('detail.stats.accepted')} value={fmt.money(accepted)} hint={t('detail.stats.acceptedHint')} />
        <KPI variant="plain" label={t('detail.stats.inPlay')} value={fmt.money(inPlay)} hint={t('detail.stats.inPlayHint')} />
        <KPI
          variant="plain"
          label={t('detail.stats.quotes')}
          value={fmt.number(client.quotesCount ?? list.length)}
          hint={last ? t('detail.stats.lastQuote', { when: fmt.relative(last.updatedAt) }) : t('detail.stats.none')}
        />
      </StatStrip>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList aria-label={t('detail.tabs.label')}>
          <TabsTrigger value="cotizaciones" badge={list.length > 0 ? fmt.number(list.length) : undefined}>
            {t('detail.tabs.quotes')}
          </TabsTrigger>
          <TabsTrigger value="actividad">{t('detail.tabs.activity')}</TabsTrigger>
          <TabsTrigger value="notas" badge={draft.notes.trim() ? '•' : undefined}>
            {t('detail.tabs.notes')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cotizaciones" className="pt-3">
          <ClientQuotes clientName={draft.name} quotes={list} loading={quotes.isPending} catalog={catalog.data} onNewQuote={newQuote} creating={createQuote.isPending} readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="actividad" className="pt-4">
          <ClientActivity client={client} clientName={draft.name} quotes={list} loading={quotes.isPending} />
        </TabsContent>
        <TabsContent value="notas" className="pt-4">
          <ClientNotes value={draft.notes} onChange={commit('notes')} status={autosave.status} savedAt={autosave.savedAt} readOnly={readOnly} />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

/** Nombre del cliente editable en el lugar: toma el tamaño del título de la página. */
function EditableTitle({ value, onCommit, readOnly }: { value: string; onCommit: (value: string) => void; readOnly?: boolean }) {
  const t = useT(es)
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
        aria-label={t('detail.nameLabel')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true)
          if (e.key === 'Escape') finish(false)
        }}
        className="ring-focus -mx-2 w-full rounded-sm bg-surface px-2 outline-none"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={readOnly}
      title={t('detail.rename')}
      className="-mx-2 max-w-full rounded-sm px-2 text-left text-balance transition-colors duration-100 hover:bg-hover disabled:pointer-events-none"
    >
      <span className="line-clamp-3 break-words">{value}</span>
    </button>
  )
}

function DetailSkeleton() {
  return (
    <Page width="default" aria-busy="true">
      <div className="flex flex-col gap-3 pb-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
      <div className="mt-8 flex gap-14">
        <Skeleton className="h-16 w-40" />
        <Skeleton className="h-16 w-40" />
      </div>
      <div className="mt-8">
        <SkeletonRows rows={3} columns={3} />
      </div>
    </Page>
  )
}
