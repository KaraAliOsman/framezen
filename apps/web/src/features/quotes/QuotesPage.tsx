/**
 * /cotizaciones — todas las cotizaciones con su estado, cliente y total. Filtros por estado con
 * conteos, búsqueda tolerante a tildes y acciones por fila (abrir, duplicar, enviar, papelera
 * con deshacer). «Nueva cotización» crea y abre al instante.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, MoreHorizontal, Plus, Search, Send, Trash2 } from 'lucide-react'
import { formatCLP, type Catalog } from '@framezen/engine'
import type { Paged, QuoteSummary } from '@framezen/shared'
import { api, humanError, request } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDate, formatNumber, formatRelative, revisionLetter } from '../../lib/format'
import { useCatalog, useCreateQuote, useDuplicateQuote } from '../../lib/hooks'
import { qk } from '../../lib/queryClient'
import { useShortcut } from '../../lib/useShortcut'
import { usePageTitle } from '../../lib/usePageTitle'
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Page,
  PageHeader,
  SkeletonRows,
  StatusPill,
  toast,
  toastUndo,
  type DataTableColumn,
} from '../../ui'
import { DesignThumbnail } from '../designer'
import { useMediaQuery } from './editor/context'
import { FILTERS, filterFromParam, type QuoteFilter as Filter } from './lib/filters'

const LIST_LIMIT = 200
const listKey = qk.quotes({ limit: LIST_LIMIT })

/** Vacío de un filtro por estado (sin búsqueda): qué no hay, en vez de «con estos filtros». */
const EMPTY_FILTER_TITLE: Record<Exclude<Filter, 'all'>, string> = {
  draft: 'No tienes borradores.',
  sent: 'No tienes cotizaciones enviadas.',
  accepted: 'No tienes cotizaciones aceptadas.',
  workshop: 'No tienes cotizaciones en taller.',
  rejected: 'No tienes cotizaciones rechazadas.',
}

export default function QuotesPage() {
  usePageTitle('Cotizaciones')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const desktop = useMediaQuery('(min-width: 768px)')
  const catalog = useCatalog()
  const createQuote = useCreateQuote()
  const duplicate = useDuplicateQuote()
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
  const duplicateRow = (row: QuoteSummary) =>
    duplicate.mutate(row.id, {
      onSuccess: (copy) => {
        toast.success(`Duplicaste la N° ${row.number}: ahora es la N° ${copy.number}.`)
        navigate(`/cotizaciones/${copy.id}`)
      },
      onError: (e) => toast.error(humanError(e)),
    })
  const sendRow = (row: QuoteSummary) => navigate(`/cotizaciones/${row.id}?enviar=1`)
  const trashRow = async (row: QuoteSummary) => {
    const previous = queryClient.getQueryData<Paged<QuoteSummary>>(listKey)
    queryClient.setQueryData<Paged<QuoteSummary>>(listKey, (data) =>
      data ? { items: data.items.filter((q) => q.id !== row.id), total: Math.max(0, data.total - 1) } : data,
    )
    try {
      await api.quotes.remove(row.id)
      toastUndo(`Moviste la N° ${row.number} a la papelera.`, () => {
        api.quotes.restore(row.id).then(
          () => void queryClient.invalidateQueries({ queryKey: ['quotes'] }),
          (e) => toast.error(humanError(e)),
        )
        if (previous) queryClient.setQueryData(listKey, previous)
      })
      void queryClient.invalidateQueries({ queryKey: ['quotes'], refetchType: 'none' })
    } catch (error) {
      if (previous) queryClient.setQueryData(listKey, previous)
      toast.error(humanError(error))
    }
  }

  const statuses = FILTERS.find((f) => f.value === filter)?.statuses
  const filterFn = statuses ? (row: QuoteSummary) => statuses.includes(row.status) : undefined
  const clearFilters = () => {
    setFilter('all')
    setQuery('')
  }

  const actionsFor = (row: QuoteSummary) => (
    <RowActions row={row} onOpen={() => open(row)} onDuplicate={() => duplicateRow(row)} onSend={() => sendRow(row)} onTrash={() => void trashRow(row)} />
  )

  // Sin datos por un error de la API: se muestra el error con «Reintentar», nunca el vacío de cuenta
  // nueva (el usuario creería que perdió sus cotizaciones). El vacío es solo con una respuesta real.
  const failed = list.isError && !list.data
  const empty = list.isSuccess && rows.length === 0
  const newButton = (
    <Button variant="primary" icon={Plus} shortcut="c" onClick={newQuote} loading={createQuote.isPending}>
      Nueva cotización
    </Button>
  )

  return (
    <Page width="wide">
      <PageHeader title="Cotizaciones" description="Todo lo que has cotizado, con su estado y su total." actions={newButton} />

      {failed ? (
        <div role="alert" className="rounded-lg border border-paper-200 bg-paper-0 px-4 py-10 text-center text-paper-600">
          <p className="text-paper-900">No pudimos cargar tus cotizaciones.</p>
          <p className="mt-1">{humanError(list.error)}</p>
          <Button className="mt-4" onClick={() => void list.refetch()} loading={list.isFetching}>
            Reintentar
          </Button>
        </div>
      ) : empty ? (
        <div className="rounded-lg border border-paper-200 bg-paper-0">
          <EmptyState
            sketch="casement"
            title="Tu primera cotización en menos de 3 minutos"
            description="Elige la tipología, escribe ancho × alto y el precio sale al instante. Se guarda sola mientras la armas; después la envías por WhatsApp o la pasas a taller."
            action={newButton}
          />
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <FilterTabs value={filter} onChange={setFilter} counts={counts} />
            <Input
              icon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por obra, cliente o N°"
              aria-label="Buscar cotizaciones"
              type="search"
              wrapperClassName="w-full md:w-72"
            />
          </div>
          {list.isError ? (
            // Falló una actualización pero hay datos de antes: se siguen mostrando, con el aviso.
            <p role="status" className="mb-3 text-[13px] text-paper-600">
              No pudimos actualizar la lista: {humanError(list.error)}{' '}
              <button type="button" className="font-medium text-ink-600" onClick={() => void list.refetch()}>
                Reintentar
              </button>
            </p>
          ) : null}
          {desktop ? (
            <DataTable<QuoteSummary>
              caption="Cotizaciones"
              rows={rows}
              loading={list.isPending}
              getRowId={(r) => r.id}
              columns={columns(catalog.data, actionsFor)}
              query={query}
              searchText={(r) => `${r.number} n° ${r.number} ${r.title} ${r.clientName ?? ''}`}
              filter={filterFn}
              onClearFilters={clearFilters}
              emptyFiltered={
                query.trim() || filter === 'all' ? undefined : (
                  <EmptyState
                    size="compact"
                    sketch="fixed"
                    title={EMPTY_FILTER_TITLE[filter]}
                    action={
                      <Button size="sm" onClick={clearFilters}>
                        Ver todas
                      </Button>
                    }
                  />
                )
              }
              onRowClick={open}
              noun={['cotización', 'cotizaciones']}
            />
          ) : (
            <MobileList rows={rows} loading={list.isPending} catalog={catalog.data} query={query} filter={filterFn} onOpen={open} actionsFor={actionsFor} onClear={clearFilters} />
          )}
          {list.data && list.data.total > rows.length ? (
            <p className="mt-3 text-center text-meta text-paper-600">
              Mostramos las {formatNumber(rows.length)} más recientes de {formatNumber(list.data.total)}.
            </p>
          ) : null}
        </>
      )}
    </Page>
  )
}

function FilterTabs({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number> }) {
  return (
    <div role="tablist" aria-label="Filtrar por estado" className="scrollbar-quiet -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
      {FILTERS.map((f) => {
        const active = f.value === value
        const n = counts[f.value]
        return (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(f.value)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-120',
              active ? 'border-ink-100 bg-ink-100 text-ink-700' : 'border-paper-200 bg-paper-0 text-paper-600 hover:border-paper-350/60 hover:text-paper-900',
            )}
          >
            {f.label}
            <span className={cn('tabular', active ? 'text-ink-700' : 'text-paper-600')}>{formatNumber(n)}</span>
          </button>
        )
      })}
    </div>
  )
}

function Thumb({ row, catalog, size = 36 }: { row: QuoteSummary; catalog?: Catalog; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xs border border-paper-200 bg-paper-50" style={{ width: size, height: size }}>
      {row.firstItem && catalog ? <DesignThumbnail design={row.firstItem.design} catalog={catalog} size={size - 6} /> : null}
    </span>
  )
}

/**
 * Columnas de la lista. La obra es la única sin ancho fijo (se queda con el resto), nunca baja de
 * 220 px y, si aun así no cabe, pasa a dos líneas antes que cortarse (igual el cliente). Estado y
 * total tienen su ancho como mínimo: nunca se cortan. Unidades y Actualizada son secundarias: se
 * esconden bajo 1.280 px o si no caben (la lista ya viene ordenada por la más reciente).
 */
function columns(catalog: Catalog | undefined, actionsFor: (row: QuoteSummary) => ReactNode): DataTableColumn<QuoteSummary>[] {
  return [
    {
      id: 'number',
      header: 'N°',
      value: (r) => r.number,
      cell: (r) => <span className="font-medium whitespace-nowrap tabular text-paper-600">{r.number}</span>,
      width: 56,
    },
    {
      id: 'title',
      header: 'Obra',
      value: (r) => r.title,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5" title={r.title || undefined}>
          <Thumb row={r} catalog={catalog} size={30} />
          <span className="line-clamp-2 leading-[18px] font-medium whitespace-normal text-paper-900">{r.title || 'Sin nombre'}</span>
        </span>
      ),
      minWidth: 220,
      className: 'py-1',
    },
    {
      id: 'client',
      header: 'Cliente',
      value: (r) => r.clientName ?? '',
      cell: (r) =>
        r.clientName ? (
          <span className="line-clamp-2 leading-[18px] whitespace-normal" title={r.clientName}>
            {r.clientName}
          </span>
        ) : (
          <span className="text-paper-600 italic">Sin cliente</span>
        ),
      hideBelow: 'lg',
      width: '18%',
      className: 'py-1',
    },
    {
      id: 'status',
      header: 'Estado',
      value: (r) => r.status,
      cell: (r) => <StatusPill status={r.status} suffix={r.revision > 1 ? revisionLetter(r.revision) : undefined} />,
      width: 124,
    },
    {
      id: 'units',
      header: 'Unidades',
      value: (r) => r.units,
      align: 'right',
      format: (n) => formatNumber(n),
      hideBelow: 'xl',
      width: 96,
    },
    {
      id: 'total',
      header: 'Total',
      value: (r) => r.total,
      align: 'right',
      format: (n) => <span className="font-medium whitespace-nowrap">{formatCLP(n)}</span>,
      footer: 'sum',
      width: 136,
    },
    {
      id: 'updated',
      header: 'Actualizada',
      value: (r) => r.updatedAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-paper-600" title={formatDate(r.updatedAt)}>
          {formatRelative(r.updatedAt)}
        </span>
      ),
      align: 'right',
      hideBelow: 'xl',
      width: 112,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Acciones</span>,
      cell: actionsFor,
      width: 52,
      sortable: false,
      align: 'right',
      className: 'overflow-visible',
    },
  ]
}

function RowActions({ row, onOpen, onDuplicate, onSend, onTrash }: { row: QuoteSummary; onOpen: () => void; onDuplicate: () => void; onSend: () => void; onTrash: () => void }) {
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton icon={MoreHorizontal} size="sm" label={`Acciones de la N° ${row.number}`} tooltip={false} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem icon={ExternalLink} onSelect={onOpen}>
            Abrir
          </DropdownMenuItem>
          <DropdownMenuItem icon={Send} onSelect={onSend}>
            Enviar al cliente
          </DropdownMenuItem>
          <DropdownMenuItem icon={Copy} onSelect={onDuplicate}>
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={Trash2} danger onSelect={onTrash}>
            Mover a la papelera
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
  if (loading) return <SkeletonRows rows={5} columns={2} />
  const terms = query
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const visible = rows.filter((r) => {
    if (filter && !filter(r)) return false
    if (!terms.length) return true
    const text = `${r.number} ${r.title} ${r.clientName ?? ''}`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    return terms.every((t) => text.includes(t))
  })
  if (!visible.length) {
    return (
      <div className="rounded-md border border-paper-200 bg-paper-0 px-4 py-10 text-center text-paper-600">
        {query.trim() ? <>Sin resultados para «{query.trim()}».</> : 'Ninguna cotización con ese estado.'}{' '}
        <button type="button" onClick={onClear} className="font-medium text-ink-600">
          Quitar filtros
        </button>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {visible.map((row) => (
        <li key={row.id}>
          <div className="relative flex items-center gap-3 rounded-md border border-paper-200 bg-paper-0 p-3 active:bg-paper-50">
            <button
              type="button"
              onClick={() => onOpen(row)}
              aria-label={`N° ${row.number}, ${row.title || 'Sin nombre'}, ${formatCLP(row.total)}`}
              className="absolute inset-0 rounded-md focus-visible:outline-offset-[-2px]"
            />
            <span aria-hidden className="pointer-events-none">
              <Thumb row={row} catalog={catalog} size={48} />
            </span>
            <div aria-hidden className="pointer-events-none min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-base font-medium text-paper-900">{row.title || 'Sin nombre'}</span>
                <span className="shrink-0 text-base font-medium tabular">{formatCLP(row.total)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-meta text-paper-600">
                <span className="shrink-0 whitespace-nowrap tabular">N°&nbsp;{row.number}</span>
                <StatusPill status={row.status} className="h-5" />
                <span className="truncate">{row.clientName ?? ''}</span>
              </div>
            </div>
            <div className="relative z-10">{actionsFor(row)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
