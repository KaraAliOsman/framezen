/**
 * /taller: cuatro cifras sueltas y tres vistas en pestañas: órdenes (con filtros y búsqueda),
 * cotizaciones aceptadas por pasar a taller y el tablero por estación (plan Empresa; en los demás se
 * ve con su explicación, nunca como muro).
 */
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import type { Station } from '@dekopen/shared'
import { humanError } from '../../lib/api'
import { useCatalog, useQuotes } from '../../lib/hooks'
import { useFormat, useGlossary, useT } from '../../lib/i18n'
import { usePlan } from '../../lib/plan'
import { usePageTitle } from '../../lib/usePageTitle'
import {
  Button,
  buttonClass,
  EmptyState,
  Input,
  KPI,
  Page,
  PageHeader,
  PlanGate,
  SegmentedControl,
  SkeletonRows,
  StatStrip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  toastUndo,
} from '../../ui'
import { AcceptedQuotes } from './components/AcceptedQuotes'
import { useOrderLabel } from './components/bits'
import { OrdersList, type OrderPreview } from './components/OrdersList'
import { StationBoard } from './components/StationBoard'
import { useUpdateWorkOrder, useWorkOrderDetails, useWorkshopOrders } from './data'
import es from './i18n/es'
import { boardOrders, buildBoard, moveInProgress, type BoardCard, type BoardSource } from './model/board'
import { filterCounts, filterOrders, ORDER_FILTERS, workshopOverview, type OrderFilter } from './model/orders'

type View = 'lista' | 'aceptadas' | 'tablero'
const VIEWS: readonly View[] = ['lista', 'aceptadas', 'tablero']
const MAX_BOARD_DETAILS = 40

export default function WorkshopPage() {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const orderLabel = useOrderLabel()
  usePageTitle(t('page.title'))
  const [params, setParams] = useSearchParams()
  const viewParam = params.get('vista') as View | null
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : 'lista'
  const setView = (next: string) => {
    const p = new URLSearchParams(params)
    if (next === 'lista') p.delete('vista')
    else p.set('vista', next)
    setParams(p, { replace: true })
  }
  const [filter, setFilter] = useState<OrderFilter>('open')
  const [query, setQuery] = useState('')
  const now = useMemo(() => new Date(), [])

  const plan = usePlan()
  const orders = useWorkshopOrders()
  const catalog = useCatalog()
  const accepted = useQuotes({ status: 'accepted' })
  const inWorkshop = useQuotes({ status: 'workshop' })
  const installed = useQuotes({ status: 'installed' })
  const update = useUpdateWorkOrder()

  const list = orders.data ?? []
  const counts = filterCounts(list)
  const overview = workshopOverview(list, now)
  const visible = useMemo(() => filterOrders(list, filter, query, now), [list, filter, query, now])

  // Miniatura y unidades de cada OT, desde las cotizaciones (una sola consulta por estado).
  const previews = useMemo(() => {
    const map = new Map<string, OrderPreview>()
    for (const q of [...(inWorkshop.data ?? []), ...(installed.data ?? [])]) map.set(q.id, { item: q.firstItem, units: q.units })
    return map
  }, [inWorkshop.data, installed.data])

  // Tablero: detalle (con la cotización) de las OT en curso.
  const onBoard = useMemo(() => boardOrders(list, now).slice(0, MAX_BOARD_DETAILS), [list, now])
  const details = useWorkOrderDetails(
    onBoard.map((o) => o.id),
    view === 'tablero',
  )
  const detailsKey = details.map((d) => d.dataUpdatedAt).join(',')
  const sources: BoardSource[] = useMemo(
    // La lista es la fuente más fresca del avance; el detalle aporta la cotización.
    () => onBoard.map((order, i) => ({ order, quote: details[i]?.data?.quote })),
    [onBoard, detailsKey],
  )
  const columns = useMemo(() => buildBoard(sources, query, now), [sources, query, now])

  const move = useCallback(
    (card: BoardCard, station: Station) => {
      const order = list.find((o) => o.id === card.orderId)
      if (!order) return
      const previous = order.progress[card.ref] ?? 'cut'
      if (moveInProgress(order.progress, card.ref, station) === order.progress) return
      const onError = (error: unknown) => toast.error(humanError(error))
      update.mutate({ id: order.id, patch: { progress: { [card.ref]: station } } }, { onError })
      toastUndo(t('page.moved', { ref: card.ref, order: orderLabel(order.number), station: g.station(station) }), () => {
        update.mutate({ id: order.id, patch: { progress: { [card.ref]: previous } } }, { onError })
      })
    },
    [list, update, t, g, orderLabel],
  )

  const readOnly = plan?.readOnly ?? false
  const hasStations = plan?.has('stations') ?? false
  const empty = orders.isSuccess && list.length === 0
  const acceptedQuotes = accepted.data ?? []

  const search = (
    <Input
      type="search"
      icon={Search}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={t('page.search')}
      aria-label={t('page.searchLabel')}
      size="sm"
      wrapperClassName="sm:w-72"
    />
  )

  return (
    <Page width="wide">
      <PageHeader title={t('page.title')} />

      {orders.isPending ? (
        <div aria-busy="true">
          <SkeletonRows rows={5} columns={4} />
        </div>
      ) : orders.isError ? (
        <EmptyState
          size="compact"
          title={t('page.error')}
          description={humanError(orders.error)}
          action={
            <Button size="sm" onClick={() => void orders.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : empty ? (
        <EmptyState
          sketch="casement"
          title={t('page.empty.title')}
          description={t('page.empty.description')}
          action={
            acceptedQuotes.length === 0 ? (
              <Link to="/cotizaciones" className={buttonClass('secondary')}>
                {t('page.empty.quotes')}
              </Link>
            ) : undefined
          }
        >
          <AcceptedQuotes quotes={acceptedQuotes} catalog={catalog.data} variant="empty" readOnly={readOnly} />
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          <Overview overview={overview} />

          <Tabs value={view} onValueChange={setView}>
            <TabsList aria-label={t('page.views')}>
              <TabsTrigger value="lista" badge={fmt.number(counts.open)}>
                {t('page.tabs.orders')}
              </TabsTrigger>
              <TabsTrigger value="aceptadas" badge={acceptedQuotes.length > 0 ? fmt.number(acceptedQuotes.length) : undefined}>
                {t('page.tabs.accepted')}
              </TabsTrigger>
              <TabsTrigger value="tablero" badge={hasStations ? undefined : g.plan('empresa')}>
                {t('page.tabs.board')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lista" className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SegmentedControl<OrderFilter>
                  aria-label={t('page.filter.label')}
                  value={filter}
                  onValueChange={setFilter}
                  options={ORDER_FILTERS.map((value) => ({
                    value,
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        {t(`page.filter.${value}`)}
                        <span className="text-meta text-fg-muted tabular">{fmt.number(counts[value])}</span>
                      </span>
                    ),
                  }))}
                />
                {search}
              </div>
              {visible.length > 0 ? (
                <OrdersList orders={visible} previews={previews} catalog={catalog.data} now={now} />
              ) : (
                <EmptyState
                  size="compact"
                  title={query ? t('page.none.search') : filter === 'done' ? t('page.none.done') : t('page.none.open')}
                  description={query ? t('page.none.searchHint') : filter === 'done' ? t('page.none.doneHint') : t('page.none.openHint')}
                  action={
                    query || filter !== 'all' ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setQuery('')
                          setFilter('all')
                        }}
                      >
                        {t('common.seeAll')}
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="aceptadas" className="pt-2">
              {acceptedQuotes.length > 0 ? (
                <AcceptedQuotes quotes={acceptedQuotes} catalog={catalog.data} readOnly={readOnly} />
              ) : (
                <EmptyState
                  size="compact"
                  title={t('page.acceptedEmpty.title')}
                  description={t('page.acceptedEmpty.description')}
                  action={
                    <Link to="/cotizaciones" className={buttonClass('secondary', 'sm')}>
                      {t('page.empty.quotes')}
                    </Link>
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="tablero" className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-table text-fg-muted">
                  <span className="touch:hidden">{t('page.boardHint')}</span>
                  <span className="hidden touch:inline">{t('page.boardHintTouch')}</span>
                </p>
                {search}
              </div>
              <PlanGate feature="stations" dismissible>
                <StationBoard columns={columns} catalog={catalog.data} now={now} onMove={move} readOnly={!hasStations || readOnly} />
              </PlanGate>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Page>
  )
}

/** Las cifras del taller, sueltas sobre la hoja. Lo atrasado se dice en rojo; el color nunca va solo: hay etiqueta. */
function Overview({ overview }: { overview: ReturnType<typeof workshopOverview> }) {
  const t = useT(es)
  const fmt = useFormat()
  return (
    <StatStrip>
      <KPI variant="plain" label={t('page.overview.open')} value={fmt.number(overview.open)} />
      <KPI variant="plain" label={t('page.overview.windows')} value={fmt.number(overview.windowsInProcess)} />
      <KPI variant="plain" label={t('page.overview.dueWeek')} value={fmt.number(overview.dueThisWeek)} />
      <KPI variant="plain" label={t('page.overview.late')} value={<span className={overview.late > 0 ? 'text-danger' : undefined}>{fmt.number(overview.late)}</span>} />
    </StatStrip>
  )
}
