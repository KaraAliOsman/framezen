/**
 * /taller — producción: OT en taller y recientes, filtros y tablero por estación (plan
 * Empresa; en los demás se ve con su explicación, nunca como muro).
 */
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Columns3, LayoutList, Search } from 'lucide-react'
import type { Station } from '@framezen/shared'
import { humanError } from '../../lib/api'
import { useCatalog, useQuotes } from '../../lib/hooks'
import { usePlan } from '../../lib/plan'
import { usePageTitle } from '../../lib/usePageTitle'
import { buttonClass, EmptyState, Input, Page, PageHeader, PlanGate, SegmentedControl, SkeletonRows, toast, toastUndo } from '../../ui'
import { AcceptedQuotes } from './components/AcceptedQuotes'
import { OrdersList, type OrderPreview } from './components/OrdersList'
import { StationBoard } from './components/StationBoard'
import { useUpdateWorkOrder, useWorkOrderDetails, useWorkshopOrders } from './data'
import { boardOrders, buildBoard, moveInProgress, type BoardCard, type BoardSource } from './model/board'
import { filterCounts, filterOrders, ORDER_FILTERS, workshopOverview, type OrderFilter } from './model/orders'
import { stationInfo } from './model/stations'

type View = 'lista' | 'tablero'
const MAX_BOARD_DETAILS = 40

export default function WorkshopPage() {
  usePageTitle('Taller')
  const [params, setParams] = useSearchParams()
  const view: View = params.get('vista') === 'tablero' ? 'tablero' : 'lista'
  const setView = (next: View) => {
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
      toastUndo(`${card.ref} de la OT N° ${order.number} pasó a ${stationInfo(station).label}`, () => {
        update.mutate({ id: order.id, patch: { progress: { [card.ref]: previous } } }, { onError })
      })
    },
    [list, update],
  )

  const readOnly = plan?.readOnly ?? false
  const hasStations = plan?.has('stations') ?? false
  const empty = orders.isSuccess && list.length === 0
  const acceptedQuotes = accepted.data ?? []

  const viewSwitch = (
    <SegmentedControl<View>
      aria-label="Vista del taller"
      value={view}
      onValueChange={setView}
      block
      options={[
        { value: 'lista', label: 'Lista', icon: LayoutList },
        { value: 'tablero', label: 'Tablero', icon: Columns3 },
      ]}
    />
  )

  return (
    <Page width="wide">
      <PageHeader
        title="Taller"
        description="Lo que se está fabricando, en qué estación va cada ventana y qué se entrega primero."
        actions={empty ? null : <div className="hidden sm:block">{viewSwitch}</div>}
      />

      {orders.isPending ? (
        <div className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0 p-4">
          <SkeletonRows rows={5} columns={4} />
        </div>
      ) : orders.isError ? (
        <div className="rounded-lg border border-paper-200 bg-paper-0">
          <EmptyState
            sketch="fixed"
            size="compact"
            title="No pudimos cargar el taller"
            description={humanError(orders.error)}
            action={
              <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void orders.refetch()}>
                Reintentar
              </button>
            }
          />
        </div>
      ) : empty ? (
        <div className="rounded-lg border border-paper-200 bg-paper-0">
          <EmptyState
            sketch="transom"
            title="Pasa una cotización a taller y aparecerá aquí"
            description="Cuando un cliente acepte, elige «Pasar a taller» en la cotización: la OT, los cortes optimizados, el pedido de vidrios y los materiales se arman solos."
            action={
              acceptedQuotes.length === 0 ? (
                <Link to="/cotizaciones" className={buttonClass('secondary')}>
                  Ver cotizaciones
                </Link>
              ) : undefined
            }
          >
            <AcceptedQuotes quotes={acceptedQuotes} catalog={catalog.data} variant="empty" readOnly={readOnly} />
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="-mt-2 sm:hidden">{viewSwitch}</div>
          <Overview overview={overview} />

          <AcceptedQuotes quotes={acceptedQuotes} catalog={catalog.data} readOnly={readOnly} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {view === 'lista' ? (
              <SegmentedControl<OrderFilter>
                aria-label="Filtrar órdenes de trabajo"
                value={filter}
                onValueChange={setFilter}
                options={ORDER_FILTERS.map((f) => ({
                  value: f.value,
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      {f.label}
                      <span className="text-meta text-paper-600 tabular">{counts[f.value]}</span>
                    </span>
                  ),
                }))}
              />
            ) : (
              <p className="text-[13px] text-paper-600">
                <span className="touch:hidden">Arrastra cada ventana a su estación, o usa la flecha para pasarla a la siguiente.</span>
                <span className="hidden touch:inline">Toca la flecha de una ventana para pasarla a la siguiente estación.</span>
              </p>
            )}
            <Input
              type="search"
              icon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por N°, obra o cliente"
              aria-label="Buscar órdenes de trabajo"
              wrapperClassName="sm:w-72"
            />
          </div>

          {view === 'lista' ? (
            visible.length > 0 ? (
              <OrdersList orders={visible} previews={previews} catalog={catalog.data} now={now} />
            ) : (
              <div className="rounded-lg border border-paper-200 bg-paper-0">
                <EmptyState
                  sketch="casement"
                  size="compact"
                  title={query ? 'Ninguna OT calza con tu búsqueda' : filter === 'done' ? 'Todavía no hay OT listas' : 'Nada en fabricación ahora'}
                  description={
                    query
                      ? 'Prueba con el número de la OT, el de la cotización, la obra o el cliente.'
                      : filter === 'done'
                        ? 'Cuando todas las ventanas de una OT lleguen a «Listo», aparecerá aquí.'
                        : 'Las OT listas siguen a mano en «Listas» y «Todas».'
                  }
                  action={
                    query || filter !== 'all' ? (
                      <button
                        type="button"
                        className={buttonClass('secondary', 'sm')}
                        onClick={() => {
                          setQuery('')
                          setFilter('all')
                        }}
                      >
                        Ver todas
                      </button>
                    ) : undefined
                  }
                />
              </div>
            )
          ) : (
            <PlanGate feature="stations" dismissible>
              <StationBoard columns={columns} catalog={catalog.data} now={now} onMove={hasStations && !readOnly ? move : () => undefined} />
            </PlanGate>
          )}
        </div>
      )}
    </Page>
  )
}

function Overview({ overview }: { overview: ReturnType<typeof workshopOverview> }) {
  const stats: { label: string; value: number; tone?: 'bad' | 'warn' }[] = [
    { label: 'OT en taller', value: overview.open },
    { label: 'Ventanas en proceso', value: overview.windowsInProcess },
    { label: 'Entregas esta semana', value: overview.dueThisWeek, tone: overview.dueThisWeek > 0 ? 'warn' : undefined },
    { label: 'Atrasadas', value: overview.late, tone: overview.late > 0 ? 'bad' : undefined },
  ]
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-paper-200 bg-paper-200 sm:grid-cols-4" style={{ gap: 1 }}>
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5 bg-paper-0 px-4 py-3">
          <dt className="text-[13px] text-paper-600">{s.label}</dt>
          <dd
            className={
              s.tone === 'bad'
                ? 'text-h3 font-semibold text-bad-600 tabular'
                : s.tone === 'warn'
                  ? 'text-h3 font-semibold text-warn-600 tabular'
                  : 'text-h3 font-semibold text-paper-900 tabular'
            }
          >
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
