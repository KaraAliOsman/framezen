/**
 * /taller/:id: la OT. Cabecera con entrega editable (guardado automático) y
 * pestañas con conteos Resumen · Cortes · Vidrios · Materiales · Montaje · Etiquetas · Compras · CNC.
 * Todo se calcula al vuelo desde la cotización con el motor: siempre al día.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ArrowUpRight, ChevronDown, ChevronRight, Cpu, FileDown, FolderOpen, Layers, ListChecks, Printer, ShoppingCart, Tags } from 'lucide-react'
import type { CutSettings } from '@dekopen/engine'
import {
  buildWorkshopDocInput,
  canSeeWorkshopCosts,
  workshopDocumentAccess,
  workshopLabelCount,
  WorkOrderDocument,
  type WorkshopDocumentKind,
} from '@dekopen/documents'
import type { Station } from '@dekopen/shared'
import { ApiRequestError, humanError } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { useCatalog, useSettings } from '../../lib/hooks'
import { useFormat, useGlossary, useT } from '../../lib/i18n'
import { usePlan } from '../../lib/plan'
import { usePageTitle } from '../../lib/usePageTitle'
import {
  Badge,
  Button,
  buttonClass,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Select,
  Skeleton,
  StatusDot,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  toastUndo,
} from '../../ui'
import { IconCutBars, IconGlass } from '../../ui/icons'
import { useOrderLabel } from './components/bits'
import { useUpdateWorkOrder, useWorkOrderDetail, type WorkOrderDetail } from './data'
import { CutsTab } from './detail/CutsTab'
import type { WindowMeta } from './detail/CutBars'
import { AssemblyTab, CncTab, FolderTab, folderDocuments, GlassTab, LabelsTab, MaterialsTab, PurchaseTab } from './detail/DocumentTabs'
import { DueDateField } from './detail/OrderFields'
import { SummaryTab } from './detail/SummaryTab'
import { useCutSimulation } from './detail/useCutSimulation'
import { useDocumentActions } from './detail/useDocumentActions'
import es from './i18n/es'
import { ORDER_STATUS_TONE, STATION_IDS, STATIONS, stationOf } from './model/stations'

const TABS = ['resumen', 'cortes', 'vidrios', 'materiales', 'montaje', 'carpeta', 'etiquetas', 'compras', 'cnc'] as const
type Tab = (typeof TABS)[number]
type DocTab = Exclude<Tab, 'resumen'>

const TAB_ICON: Record<DocTab, typeof Layers> = {
  cortes: IconCutBars,
  vidrios: IconGlass,
  materiales: Layers,
  montaje: ListChecks,
  carpeta: FolderOpen,
  etiquetas: Tags,
  compras: ShoppingCart,
  cnc: Cpu,
}

export default function WorkOrderPage() {
  const t = useT(es)
  const orderLabel = useOrderLabel()
  const { id = '' } = useParams()
  const order = useWorkOrderDetail(id)
  usePageTitle(order.data ? orderLabel(order.data.number) : t('order.titleFallback'))

  if (order.isPending) return <LoadingOrder />
  if (order.isError || !order.data) {
    const missing = !order.error || (order.error instanceof ApiRequestError && order.error.status === 404)
    return (
      <Page width="wide">
        <PageHeader breadcrumbs={[{ label: t('order.crumb'), to: '/taller' }, { label: t('common.ot') }]} title={t('order.titleFallback')} />
        <EmptyState
          title={missing ? t('order.notFound') : t('page.error')}
          description={order.error ? humanError(order.error) : t('order.notFoundHint')}
          action={
            <Link to="/taller" className={buttonClass('secondary')}>
              {t('order.back')}
            </Link>
          }
        />
      </Page>
    )
  }
  return <OrderView order={order.data} />
}

function LoadingOrder() {
  return (
    <Page width="wide" aria-busy="true">
      <div className="flex flex-col gap-3 pb-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="mb-5 h-10 w-full" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </Page>
  )
}

function OrderView({ order }: { order: WorkOrderDetail }) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const orderLabel = useOrderLabel()
  const me = useSession()
  const plan = usePlan()
  const catalog = useCatalog()
  const settings = useSettings()
  const update = useUpdateWorkOrder()
  const [params, setParams] = useSearchParams()
  const now = useMemo(() => new Date(), [])

  const tabParam = params.get('pestana')
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'resumen'
  const onSummary = tab === 'resumen'
  const setTab = (next: string) => {
    const p = new URLSearchParams(params)
    if (next === 'resumen') p.delete('pestana')
    else p.set('pestana', next)
    setParams(p, { replace: true })
  }

  const features = plan?.features ?? me.billing.features ?? []
  const featureKey = features.join(',')
  const viewer = useMemo(() => ({ role: me.role, features: featureKey ? (featureKey.split(',') as typeof features) : [] }), [me.role, featureKey])
  const readOnly = plan?.readOnly ?? false
  const seeCosts = canSeeWorkshopCosts(viewer)

  // ── Simulación de corte (no se guarda salvo que lo pidas) ──────────────────
  const [sim, setSim] = useState<Partial<CutSettings>>({})
  const quote = order.quote
  const baseInput = useMemo(() => {
    if (!quote || !catalog.data || !settings.data) return null
    return buildWorkshopDocInput({
      quote,
      org: me.org,
      catalog: catalog.data,
      settings: settings.data,
      workOrder: { number: order.number, createdAt: order.createdAt, clientName: order.clientName },
      cut: sim,
      redactCosts: !seeCosts,
    })
  }, [quote, catalog.data, settings.data, me.org, order.number, order.createdAt, order.clientName, sim, seeCosts])

  // Entrega y notas cambian a menudo: se agregan sin recalcular el motor.
  const input = useMemo(() => {
    if (!baseInput) return null
    const workOrder = { ...baseInput.data.workOrder }
    if (order.dueDate) workOrder.dueDate = order.dueDate.slice(0, 10)
    else delete workOrder.dueDate
    if (order.notes?.trim()) workOrder.notes = order.notes.trim()
    else delete workOrder.notes
    return { ...baseInput, data: { ...baseInput.data, workOrder } }
  }, [baseInput, order.dueDate, order.notes])

  const simulation = useCutSimulation({ sim, setSim, settings: settings.data, input: baseInput, readOnly })

  const simulated = Object.keys(sim).length > 0
  const actions = useDocumentActions({ orderId: order.id, orderNumber: order.number, simulated })

  // ── Avance por estación (con deshacer) ─────────────────────────────────────
  const onError = useCallback((error: unknown) => toast.error(humanError(error)), [])
  const setStation = useCallback(
    (ref: string, station: Station) => {
      const previous = stationOf(order.progress, ref)
      if (previous === station) return
      update.mutate({ id: order.id, patch: { progress: { [ref]: station } } }, { onError })
      toastUndo(t('order.moved', { ref, station: g.station(station) }), () =>
        update.mutate({ id: order.id, patch: { progress: { [ref]: previous } } }, { onError }),
      )
    },
    [order.id, order.progress, update, onError, t, g],
  )
  const refs = input?.data.windows.map((w) => w.ref) ?? Object.keys(order.progress)
  const setAllStations = useCallback(
    (station: Station) => {
      const previous: Record<string, Station> = {}
      const next: Record<string, Station> = {}
      for (const ref of refs) {
        previous[ref] = stationOf(order.progress, ref)
        next[ref] = station
      }
      if (refs.every((ref) => previous[ref] === station)) return
      update.mutate({ id: order.id, patch: { progress: next } }, { onError })
      toastUndo(t('order.movedAll', { station: g.station(station) }), () => update.mutate({ id: order.id, patch: { progress: previous } }, { onError }))
    },
    [refs, order.id, order.progress, update, onError, t, g],
  )

  // ── Acceso por plan y rol ──────────────────────────────────────────────────
  const allowed = useMemo(() => {
    const set = new Set<WorkshopDocumentKind>()
    for (const kind of ['work-order', 'cuts', 'glass', 'materials', 'materials-costs', 'assembly', 'costs', 'labels', 'purchase'] as const) {
      if (workshopDocumentAccess(kind, viewer).visible) set.add(kind)
    }
    return set
  }, [viewer])
  const purchaseLocked = !features.includes('purchasing')
  const cncLocked = !features.includes('cnc')
  const locked = (tabId: Tab) => (tabId === 'compras' && purchaseLocked) || (tabId === 'cnc' && cncLocked)

  const windows = useMemo(() => {
    const map = new Map<string, WindowMeta>()
    input?.data.windows.forEach((w) => map.set(w.ref, { ref: w.ref, name: w.name || w.description.split(' · ')[0] }))
    return map
  }, [input])

  // Conteos de cada pestaña (lo que vas a encontrar adentro).
  const tabCounts = useMemo<Partial<Record<Tab, number>>>(() => {
    if (!input) return {}
    const data = input.data
    return {
      cortes: data.optimization.totalBars,
      vidrios: data.glass.reduce((s, gl) => s + gl.qty, 0),
      materiales: data.materials.length,
      montaje: data.windows.reduce((s, w) => s + Math.max(0, w.qty), 0),
      carpeta: folderDocuments(data).length,
      etiquetas: workshopLabelCount(data, { includeGlass: true }),
      compras: data.purchaseOrders.length,
      cnc: data.optimization.totalPieces,
    }
  }, [input])

  const statusTone = ({ neutral: 'neutral', warn: 'warning', ok: 'success' } as const)[ORDER_STATUS_TONE[order.status]]
  const paper = input?.paper ?? 'letter'
  const otElement = useMemo(() => (input ? <WorkOrderDocument {...input} /> : null), [input])
  const otRequest = otElement ? { kind: 'work-order' as const, element: otElement } : null
  const quoteLabel = t('common.quoteNumber', { number: fmt.docNumber(order.quoteNumber) })

  const header = (
    <PageHeader
      breadcrumbs={[{ label: t('order.crumb'), to: '/taller' }, { label: orderLabel(order.number) }]}
      title={orderLabel(order.number)}
      description={[order.title, order.clientName].filter(Boolean).join(' · ')}
      meta={
        <MetaRow
          items={[
            <StatusDot key="status" tone={statusTone}>
              {g.workOrderStatus(order.status)}
            </StatusDot>,
            <DueDateField key="due" order={order} now={now} readOnly={readOnly} />,
            <Link key="quote" to={`/cotizaciones/${order.quoteId}`} className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-accent hover:underline">
              {quoteLabel}
              <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-3.5" />
            </Link>,
            <span key="created" className="whitespace-nowrap tabular">
              {t('order.created', { date: fmt.date(order.createdAt) })}
            </span>,
          ]}
        />
      }
      actions={otRequest ? <div className="hidden items-center gap-2 sm:flex">{onSummary ? headerActions(otRequest) : wholeOrderMenu(otRequest)}</div> : null}
    />
  )
  // En el teléfono las acciones van bajo el título (así el título no se angosta). Solo en
  // Resumen: en las demás pestañas el documento de la pestaña trae las suyas.
  const mobileActions = otRequest && onSummary ? <div className="-mt-3 mb-5 grid grid-cols-2 gap-2 sm:hidden">{headerActions(otRequest)}</div> : null

  function headerActions(req: NonNullable<typeof otRequest>) {
    return (
      <>
        <Button icon={FileDown} onClick={() => void actions.download(req)} loading={actions.busy === 'work-order'}>
          {t('order.download')}
        </Button>
        <Button variant="primary" icon={Printer} onClick={() => actions.print(req)}>
          {t('order.print')}
        </Button>
      </>
    )
  }

  /** Fuera de Resumen, la OT completa queda a mano sin competir con el primario de la pestaña. */
  function wholeOrderMenu(req: NonNullable<typeof otRequest>) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button iconRight={ChevronDown} loading={actions.busy === 'work-order'}>
            {t('order.whole')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem icon={Printer} onSelect={() => actions.print(req)}>
            {t('order.print')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={FileDown} onSelect={() => void actions.download(req)}>
            {t('order.download')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (!quote) {
    return (
      <Page width="wide">
        {header}
        {mobileActions}
        <MissingQuote order={order} readOnly={readOnly} onStation={setStation} />
      </Page>
    )
  }

  const documentsNav = (
    <nav aria-label={t('order.documentsLabel')}>
      <h2 className="mb-1 text-h4 font-medium text-fg-strong">{t('order.documents')}</h2>
      <ul className="-mx-2.5">
        {(['cortes', 'vidrios', 'materiales', 'montaje', 'carpeta', 'etiquetas', 'compras', 'cnc'] as const).map((tabId) => {
          const Icon = TAB_ICON[tabId]
          const count = tabCounts[tabId]
          return (
            <li key={tabId}>
              <button
                type="button"
                onClick={() => setTab(tabId)}
                className="group flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-colors duration-100 hover:bg-hover"
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-fg-strong">{t(`order.tabs.${tabId}`)}</span>
                  <span className="block text-pretty text-meta text-fg-muted">{t(`order.tabHints.${tabId}`)}</span>
                </span>
                {locked(tabId) ? (
                  <Badge tone="accent" size="sm">
                    {g.plan('pro')}
                  </Badge>
                ) : count !== undefined ? (
                  <span className="text-meta text-fg-muted tabular">{fmt.number(count)}</span>
                ) : null}
                <ChevronRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-faint transition-transform duration-100 group-hover:translate-x-0.5" />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )

  return (
    <Page width="wide">
      {header}
      {mobileActions}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={t('order.sections')} className="-mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          {TABS.map((tabId) => (
            <TabsTrigger
              key={tabId}
              value={tabId}
              badge={locked(tabId) ? g.plan('pro') : tabId !== 'resumen' && tabCounts[tabId] !== undefined ? fmt.number(tabCounts[tabId]!) : undefined}
            >
              {t(`order.tabs.${tabId}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {!input ? (
          <div className="pt-5">
            {catalog.isError || settings.isError ? (
              <EmptyState
                size="compact"
                title={t('order.loadError')}
                description={t('order.loadErrorHint')}
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      void catalog.refetch()
                      void settings.refetch()
                    }}
                  >
                    {t('order.retryNow')}
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}
          </div>
        ) : (
          <>
            <TabsContent value="resumen">
              <SummaryTab
                order={order}
                data={input.data}
                paper={paper}
                catalog={catalog.data}
                readOnly={readOnly}
                onStation={setStation}
                onAllStations={setAllStations}
                actions={actions}
                documentsNav={documentsNav}
              />
            </TabsContent>
            <TabsContent value="cortes">
              {simulation ? (
                <CutsTab orderId={order.id} data={input.data} paper={paper} catalog={catalog.data} windows={windows} simulation={simulation} actions={actions} />
              ) : null}
            </TabsContent>
            <TabsContent value="vidrios">
              <GlassTab data={input.data} paper={paper} actions={actions} />
            </TabsContent>
            <TabsContent value="materiales">
              <MaterialsTab data={input.data} paper={paper} actions={actions} allowed={allowed} />
            </TabsContent>
            <TabsContent value="montaje">
              <AssemblyTab data={input.data} paper={paper} actions={actions} />
            </TabsContent>
            <TabsContent value="carpeta">
              <FolderTab data={input.data} paper={paper} actions={actions} />
            </TabsContent>
            <TabsContent value="etiquetas">
              <LabelsTab data={input.data} paper={paper} actions={actions} />
            </TabsContent>
            <TabsContent value="compras">
              {allowed.has('purchase') ? (
                <PurchaseTab
                  data={input.data}
                  paper={paper}
                  actions={actions}
                  showCosts={seeCosts}
                  ivaPct={settings.data?.pricing.ivaPct ?? 19}
                  locked={purchaseLocked}
                />
              ) : (
                <Notice tone="neutral">{t('order.purchaseRole')}</Notice>
              )}
            </TabsContent>
            <TabsContent value="cnc">
              <CncTab data={input.data} orderNumber={order.number} locked={cncLocked} simulated={simulated} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </Page>
  )
}

/**
 * Metadatos de la cabecera separados por «·». Cada separador va delante de su dato y el que
 * queda al inicio de una línea se recorta, así nunca cuelga un «·» al final ni al comienzo.
 */
function MetaRow({ items }: { items: ReactNode[] }) {
  return (
    <div className="-mx-1 -my-1 min-w-0 flex-1 overflow-hidden px-1 py-1">
      <div className="-ml-5 flex flex-wrap items-center gap-y-2">
        {items.map((item, i) => (
          <span key={i} className="relative inline-flex min-w-0 items-center pl-5">
            <span aria-hidden className="absolute top-1/2 left-0 w-5 -translate-y-1/2 text-center text-fg-faint">
              ·
            </span>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

/** La cotización de la OT ya no existe: el avance sigue editable, los documentos no. */
function MissingQuote({
  order,
  readOnly,
  onStation,
}: {
  order: WorkOrderDetail
  readOnly: boolean
  onStation: (ref: string, station: Station) => void
}): ReactNode {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const refs = Object.keys(order.progress)
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warning">{t('order.missingQuote', { number: fmt.docNumber(order.quoteNumber) })}</Notice>
      <ul className="divide-y divide-divider">
        {refs.map((ref) => (
          <li key={ref} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <span className="code-id font-medium text-fg-strong">{ref}</span>
            <Select<Station>
              size="sm"
              className="w-52"
              aria-label={t('order.stationOf', { ref })}
              value={stationOf(order.progress, ref)}
              disabled={readOnly}
              onValueChange={(s) => onStation(ref, s)}
              options={STATION_IDS.map((s) => {
                const Icon = STATIONS.find((x) => x.id === s)!.icon
                return { value: s, label: g.station(s), leading: <Icon aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" /> }
              })}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
