/**
 * /cotizaciones — hoja sin cajas: tres cifras (por seguir, aceptado, total de lo que se ve), filtros
 * pequeños y la tabla a sangre, con la obra y el cliente en dos líneas. Selección múltiple (cambiar
 * estado, papelera con deshacer) y acciones por fila (abrir, enviar, duplicar para otro cliente,
 * papelera). «Nueva cotización» crea y abre al instante.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, CircleDot, Copy, ExternalLink, MoreHorizontal, Plus, Search, Send, Trash2 } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { Paged, Quote, QuoteStatus, QuoteSummary } from '@dekopen/shared'
import { api, humanError, request } from '../../lib/api'
import { revisionLetter } from '../../lib/format'
import { useCatalog, useCreateQuote, useSettings } from '../../lib/hooks'
import { useFormat, useGlossary, useT } from '../../lib/i18n'
import { qk } from '../../lib/queryClient'
import { useShortcut } from '../../lib/useShortcut'
import { usePageTitle } from '../../lib/usePageTitle'
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  KPI,
  Notice,
  Numeric,
  Page,
  PageHeader,
  QUOTE_STATUS_COPY,
  RowTitle,
  Skeleton,
  SkeletonRows,
  StatStrip,
  StatusPill,
  toast,
  toastUndo,
  type DataTableColumn,
} from '../../ui'
import { QuoteThumb } from '../home/QuoteThumb'
import { DuplicateDialog, type DuplicateBody, type DuplicateSource } from './DuplicateDialog'
import { useMediaQuery } from './editor/context'
import es from './i18n/es'
import { FILTERS, filterFromParam, type QuoteFilter as Filter } from './lib/filters'

const LIST_LIMIT = 200
const listKey = qk.quotes({ limit: LIST_LIMIT })
const BULK_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'workshop', 'installed', 'closed']
/** Lo que ya se vendió: aceptada y todo lo que viene después. */
const WON_STATUSES: QuoteStatus[] = ['accepted', 'workshop', 'installed', 'closed']

type Fmt = ReturnType<typeof useFormat>
type Tr = ReturnType<typeof useT<typeof es>>

/** Texto de búsqueda tolerante a tildes (y a la «ı» turca). */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').toLowerCase()
}

export default function QuotesPage() {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  usePageTitle(t('list.title'))
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const desktop = useMediaQuery('(min-width: 768px)')
  const catalog = useCatalog()
  const settings = useSettings()
  const createQuote = useCreateQuote()
  const [params, setParams] = useSearchParams()
  const filter = filterFromParam(params.get('estado'))
  // El filtro vive en la URL: el embudo de Inicio enlaza con ?estado= y «Atrás» lo respeta.
  const setFilter = (next: Filter) =>
    setParams(
      (current) => {
        const out = new URLSearchParams(current)
        if (next === 'all') out.delete('estado')
        else out.set('estado', next)
        return out
      },
      { replace: true },
    )
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [duplicating, setDuplicating] = useState<DuplicateSource | null>(null)
  const tax = settings.data?.taxLabel?.trim() || g.term('business.vat')

  const list = useQuery({
    queryKey: listKey,
    queryFn: () => request<Paged<QuoteSummary>>('/quotes', { query: { limit: LIST_LIMIT } }),
  })
  const rows = useMemo(() => list.data?.items ?? [], [list.data])

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: rows.length, draft: 0, sent: 0, accepted: 0, workshop: 0, rejected: 0 }
    for (const row of rows) for (const f of FILTERS) if (f.statuses?.includes(row.status)) out[f.value]++
    return out
  }, [rows])

  const statuses = FILTERS.find((f) => f.value === filter)?.statuses
  const filterFn = useMemo(() => (statuses ? (row: QuoteSummary) => statuses.includes(row.status) : undefined), [statuses])
  // Cifras de arriba: «Por seguir» y «Aceptado» dentro de lo buscado, el total según lo que se ve.
  const stats = useMemo(() => {
    const terms = fold(query).split(/\s+/).filter(Boolean)
    const found = terms.length ? rows.filter((r) => terms.every((term) => fold(`${r.number} ${r.title} ${r.clientName ?? ''}`).includes(term))) : rows
    const sum = (list: QuoteSummary[]) => ({ count: list.length, total: list.reduce((acc, r) => acc + r.total, 0) })
    const visible = filterFn ? found.filter(filterFn) : found
    return {
      followUp: sum(found.filter((r) => r.status === 'sent')),
      won: sum(found.filter((r) => WON_STATUSES.includes(r.status))),
      shown: { ...sum(visible), filtered: visible.length !== rows.length },
    }
  }, [rows, filterFn, query])

  const newQuote = () => {
    if (createQuote.isPending) return
    createQuote.mutate(
      {},
      {
        onSuccess: (quote) => navigate(`/cotizaciones/${quote.id}`, { state: { nueva: true } }),
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }
  useShortcut('c', newQuote)

  const open = (row: QuoteSummary) => navigate(`/cotizaciones/${row.id}`)
  const duplicateRow = async (row: QuoteSummary, body: DuplicateBody) => {
    const copy = await request<Quote>(`/quotes/${encodeURIComponent(row.id)}/duplicate`, { method: 'POST', body })
    queryClient.setQueryData(qk.quote(copy.id), copy)
    void queryClient.invalidateQueries({ queryKey: ['quotes'] })
    toast.success(t('list.toast.duplicated', { from: row.number, to: copy.number }))
    navigate(`/cotizaciones/${copy.id}`)
  }
  const sendRow = (row: QuoteSummary) => navigate(`/cotizaciones/${row.id}?enviar=1`)

  /** Papelera optimista con «Deshacer» (una o varias). */
  const trashRows = async (targets: QuoteSummary[]) => {
    if (!targets.length) return
    const previous = queryClient.getQueryData<Paged<QuoteSummary>>(listKey)
    const ids = new Set(targets.map((r) => r.id))
    queryClient.setQueryData<Paged<QuoteSummary>>(listKey, (data) =>
      data ? { items: data.items.filter((q) => !ids.has(q.id)), total: Math.max(0, data.total - ids.size) } : data,
    )
    const done: QuoteSummary[] = []
    try {
      for (const row of targets) {
        await api.quotes.remove(row.id)
        done.push(row)
      }
      const message = targets.length === 1 ? t('list.toast.trashed', { number: targets[0].number }) : t('list.bulk.trashDone', { count: targets.length })
      toastUndo(message, () => {
        Promise.all(done.map((row) => api.quotes.restore(row.id))).then(
          () => void queryClient.invalidateQueries({ queryKey: ['quotes'] }),
          (e) => toast.error(humanError(e)),
        )
        if (previous) queryClient.setQueryData(listKey, previous)
      })
      void queryClient.invalidateQueries({ queryKey: ['quotes'], refetchType: 'none' })
    } catch (error) {
      if (previous) queryClient.setQueryData(listKey, previous)
      void queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.error(humanError(error))
    }
  }

  /** Cambiar el estado de varias, con «Deshacer» que devuelve a cada una el suyo. */
  const setStatusRows = async (targets: QuoteSummary[], status: QuoteStatus) => {
    const changed = targets.filter((r) => r.status !== status)
    if (!changed.length) return
    try {
      for (const row of changed) await api.quotes.setStatus(row.id, status)
      void queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toastUndo(t('list.bulk.statusDone', { status: g.quoteStatus(status), count: changed.length }), () => {
        Promise.all(changed.map((row) => api.quotes.setStatus(row.id, row.status))).then(
          () => void queryClient.invalidateQueries({ queryKey: ['quotes'] }),
          (e) => toast.error(humanError(e)),
        )
      })
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.error(humanError(error))
    }
  }

  const clearFilters = () => {
    setFilter('all')
    setQuery('')
  }

  const actionsFor = (row: QuoteSummary) => (
    <RowActions
      row={row}
      onOpen={() => open(row)}
      onDuplicate={() => setDuplicating({ id: row.id, number: row.number, title: row.title, clientName: row.clientName })}
      onSend={() => sendRow(row)}
      onTrash={() => void trashRows([row])}
    />
  )

  // Sin datos por un error de la API: se muestra el error con «Reintentar», nunca el vacío de cuenta
  // nueva (el usuario creería que perdió sus cotizaciones). El vacío es solo con una respuesta real.
  const failed = list.isError && !list.data
  const empty = list.isSuccess && rows.length === 0
  const newButton = (
    <Button variant="primary" icon={Plus} shortcut="c" onClick={newQuote} loading={createQuote.isPending}>
      {t('list.newQuote')}
    </Button>
  )

  return (
    <Page width="wide">
      <PageHeader title={t('list.title')} actions={empty ? undefined : newButton} />

      {failed ? (
        <div role="alert">
          <EmptyState
            size="compact"
            title={t('list.loadError')}
            description={humanError(list.error)}
            action={
              <Button size="sm" onClick={() => void list.refetch()} loading={list.isFetching}>
                {t('list.retry')}
              </Button>
            }
          />
        </div>
      ) : empty ? (
        <EmptyState sketch="sliding" title={t('list.empty.title')} description={t('list.empty.description')} action={newButton} />
      ) : (
        <>
          <Stats loading={list.isPending} stats={stats} tax={tax} t={t} fmt={fmt} />
          <div className="mb-2 flex items-center gap-2">
            <StatusFilter value={filter} onChange={setFilter} counts={counts} t={t} fmt={fmt} />
            <Input
              icon={Search}
              size="sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('list.searchPlaceholder')}
              aria-label={t('list.searchLabel')}
              type="search"
              wrapperClassName="min-w-0 flex-1 sm:max-w-72"
            />
          </div>
          {list.isError ? (
            // Falló una actualización pero hay datos de antes: se siguen mostrando, con el aviso.
            <Notice
              tone="warning"
              size="compact"
              className="mb-3"
              action={
                <button type="button" className="text-table font-medium text-accent-ink hover:underline" onClick={() => void list.refetch()}>
                  {t('list.retry')}
                </button>
              }
            >
              {t('list.refreshError', { error: humanError(list.error) })}
            </Notice>
          ) : null}
          {desktop ? (
            <DataTable<QuoteSummary>
              caption={t('list.caption')}
              rows={rows}
              loading={list.isPending}
              getRowId={(r) => r.id}
              columns={columns(catalog.data, actionsFor, t, fmt)}
              density="comfortable"
              bleed
              query={query}
              searchText={(r) => `${r.number} n° ${r.number} ${r.title} ${r.clientName ?? ''}`}
              filter={filterFn}
              onClearFilters={clearFilters}
              selectable
              selected={selected}
              onSelectedChange={setSelected}
              bulkActions={(chosen, clear) => <BulkActions rows={chosen} t={t} onStatus={(s) => void setStatusRows(chosen, s).then(clear)} onTrash={() => void trashRows(chosen).then(clear)} />}
              emptyFiltered={
                query.trim() || filter === 'all' ? undefined : (
                  <EmptyState
                    size="compact"
                    title={t(`list.emptyFilter.${filter}`)}
                    action={
                      <Button size="sm" onClick={clearFilters}>
                        {t('list.seeAll')}
                      </Button>
                    }
                  />
                )
              }
              onRowClick={open}
              noun={[t('list.nounOne'), t('list.nounOther')]}
            />
          ) : (
            <MobileList rows={rows} loading={list.isPending} catalog={catalog.data} query={query} filter={filterFn} onOpen={open} actionsFor={actionsFor} onClear={clearFilters} />
          )}
          {list.data && list.data.total > rows.length ? (
            <p className="mt-3 text-center text-meta text-fg-muted">{t('list.truncated', { shown: fmt.number(rows.length), total: fmt.number(list.data.total) })}</p>
          ) : null}
        </>
      )}
      <DuplicateDialog
        source={duplicating}
        onClose={() => setDuplicating(null)}
        run={(body) => {
          const row = rows.find((r) => r.id === duplicating?.id)
          return row ? duplicateRow(row, body) : Promise.resolve()
        }}
      />
    </Page>
  )
}

/** Las tres cifras de la lista: sin cajas, la cifra arriba y lo que significa debajo. */
function Stats({
  loading,
  stats,
  tax,
  t,
  fmt,
}: {
  loading: boolean
  stats: { followUp: { count: number; total: number }; won: { count: number; total: number }; shown: { count: number; total: number; filtered: boolean } }
  tax: string
  t: Tr
  fmt: Fmt
}) {
  if (loading) {
    return (
      <StatStrip className="mb-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </StatStrip>
    )
  }
  const money = (n: number) => <Numeric kind="money">{fmt.money(n)}</Numeric>
  const quotes = (count: number) => t('list.stats.quotes', { count })
  return (
    <StatStrip className="mb-8">
      <KPI variant="plain" label={t('list.stats.followUp')} value={money(stats.followUp.total)} hint={quotes(stats.followUp.count)} />
      <KPI variant="plain" label={t('list.stats.won')} value={money(stats.won.total)} hint={quotes(stats.won.count)} />
      <KPI variant="plain" className="max-sm:hidden" label={stats.shown.filtered ? t('list.stats.filtered') : t('totals.total', { tax })} value={money(stats.shown.total)} hint={quotes(stats.shown.count)} />
    </StatStrip>
  )
}

/** Estado como filtro pequeño sobre la tabla, con el conteo de cada uno. */
function StatusFilter({ value, onChange, counts, t, fmt }: { value: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number>; t: Tr; fmt: Fmt }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" iconRight={ChevronDown} aria-label={`${t('list.filterLabel')}: ${t(`list.filters.${value}`)}`}>
          {t(`list.filters.${value}`)}
          <span className="tabular text-fg-muted">{fmt.number(counts[value])}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as Filter)}>
          {FILTERS.map((f) => (
            <DropdownMenuRadioItem key={f.value} value={f.value}>
              <span className="flex w-full items-center justify-between gap-3">
                {t(`list.filters.${f.value}`)}
                <span className="tabular text-fg-muted">{fmt.number(counts[f.value])}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Columnas de la lista. La obra es la única sin ancho fijo: dos líneas de 56 px, obra arriba y N° con
 * cliente abajo (el texto completo queda en el `title`). Estado y total tienen su ancho como mínimo y
 * nunca se cortan. La fecha es secundaria: se esconde si no cabe.
 */
function columns(catalog: Catalog | undefined, actionsFor: (row: QuoteSummary) => ReactNode, t: Tr, fmt: Fmt): DataTableColumn<QuoteSummary>[] {
  return [
    {
      id: 'title',
      header: t('list.columns.title'),
      value: (r) => r.title,
      cell: (r) => (
        <span title={[r.title, r.clientName].filter(Boolean).join(' · ') || undefined}>
          <RowTitle
            media={<QuoteThumb item={r.firstItem} catalog={catalog} size={40} />}
            title={r.title || t('list.untitled')}
            subtitle={
              <>
                <span className="tabular">{fmt.docNumber(r.number)}</span> · {r.clientName ?? t('list.noClient')}
              </>
            }
          />
        </span>
      ),
      minWidth: 260,
      className: 'py-1',
    },
    {
      id: 'status',
      header: t('list.columns.status'),
      value: (r) => r.status,
      cell: (r) => <StatusPill status={r.status} suffix={r.revision > 1 ? revisionLetter(r.revision) : undefined} />,
      width: 136,
    },
    {
      id: 'updated',
      header: t('list.columns.updated'),
      value: (r) => r.updatedAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-fg-muted" title={fmt.date(r.updatedAt)}>
          {fmt.relative(r.updatedAt)}
        </span>
      ),
      align: 'right',
      hideBelow: 'lg',
      width: 148,
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('list.columns.actions')}</span>,
      cell: actionsFor,
      width: 48,
      sortable: false,
      align: 'right',
      className: 'overflow-visible pr-2 pl-0',
    },
    {
      id: 'total',
      header: t('list.columns.total'),
      value: (r) => r.total,
      align: 'right',
      format: (n) => <span className="font-medium whitespace-nowrap text-fg-strong">{fmt.money(n)}</span>,
      footer: 'sum',
      width: 136,
    },
  ]
}

function RowActions({ row, onOpen, onDuplicate, onSend, onTrash }: { row: QuoteSummary; onOpen: () => void; onDuplicate: () => void; onSend: () => void; onTrash: () => void }) {
  const t = useT(es)
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            icon={MoreHorizontal}
            size="sm"
            label={t('list.row.actions', { number: row.number })}
            tooltip={false}
            className="data-[state=open]:opacity-100 focus-visible:opacity-100 touch:opacity-100 md:opacity-0 [tr:hover_&]:opacity-100"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem icon={ExternalLink} onSelect={onOpen}>
            {t('list.row.open')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={Send} onSelect={onSend}>
            {t('list.row.send')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={Copy} onSelect={onDuplicate}>
            {t('list.row.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={Trash2} danger onSelect={onTrash}>
            {t('list.row.trash')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Barra flotante de la selección múltiple: cambiar estado y mover a la papelera (con deshacer). */
function BulkActions({ rows, t, onStatus, onTrash }: { rows: QuoteSummary[]; t: Tr; onStatus: (status: QuoteStatus) => void; onTrash: () => void }) {
  const g = useGlossary()
  const common = rows.every((r) => r.status === rows[0]?.status) ? rows[0]?.status : undefined
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" icon={CircleDot}>
            {t('list.bulk.status')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-48">
          <DropdownMenuRadioGroup value={common ?? ''} onValueChange={(v) => onStatus(v as QuoteStatus)}>
            {BULK_STATUSES.map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className={`size-1.5 rounded-full ${QUOTE_STATUS_COPY[s].dot}`} />
                  {g.quoteStatus(s)}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" icon={Trash2} onClick={onTrash}>
        {t('list.bulk.trash')}
      </Button>
    </>
  )
}

function MobileList({
  rows,
  loading,
  catalog,
  query,
  filter,
  onOpen,
  actionsFor,
  onClear,
}: {
  rows: QuoteSummary[]
  loading: boolean
  catalog?: Catalog
  query: string
  filter?: (row: QuoteSummary) => boolean
  onOpen: (row: QuoteSummary) => void
  actionsFor: (row: QuoteSummary) => ReactNode
  onClear: () => void
}) {
  const t = useT(es)
  const fmt = useFormat()
  if (loading) return <SkeletonRows rows={5} columns={2} />
  const terms = fold(query).split(/\s+/).filter(Boolean)
  const visible = rows.filter((r) => {
    if (filter && !filter(r)) return false
    if (!terms.length) return true
    const text = fold(`${r.number} ${r.title} ${r.clientName ?? ''}`)
    return terms.every((term) => text.includes(term))
  })
  if (!visible.length) {
    return (
      <div className="px-4 py-10 text-center text-fg-muted">
        {query.trim() ? t('list.noResults', { query: query.trim() }) : t('list.noStatus')}{' '}
        <button type="button" onClick={onClear} className="font-medium text-accent-ink">
          {t('list.clearFilters')}
        </button>
      </div>
    )
  }
  return (
    <ul className="-mx-4 divide-y divide-divider border-t border-divider bg-plate">
      {visible.map((row) => (
        <li key={row.id}>
          <div className="relative flex min-h-[72px] items-center gap-3 px-4 py-2.5 active:bg-hover">
            <button
              type="button"
              onClick={() => onOpen(row)}
              aria-label={t('list.mobileRow', { number: row.number, title: row.title || t('list.untitled'), total: fmt.money(row.total) })}
              className="absolute inset-0 focus-visible:-outline-offset-2"
            />
            <span aria-hidden className="pointer-events-none">
              <QuoteThumb item={row.firstItem} catalog={catalog} size={40} />
            </span>
            <div aria-hidden className="pointer-events-none min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-base font-medium text-fg-strong">{row.title || t('list.untitled')}</span>
                <span className="shrink-0 text-base font-medium tabular text-fg-strong">{fmt.money(row.total)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-table text-fg-muted">
                <span className="min-w-0 truncate">
                  <span className="tabular">{fmt.docNumber(row.number)}</span>
                  {row.clientName ? ` · ${row.clientName}` : ''}
                </span>
                <StatusPill status={row.status} size="sm" />
              </div>
            </div>
            <div className="relative z-10 -mr-1">{actionsFor(row)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
