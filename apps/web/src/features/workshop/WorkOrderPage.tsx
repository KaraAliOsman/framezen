/**
 * /taller/:id — la OT: cabecera editable (entrega y notas con guardado automático) y
 * pestañas Resumen · Cortes · Vidrios · Materiales · Montaje · Etiquetas · Compras · CNC.
 * Todo se calcula al vuelo desde la cotización con el motor: siempre al día.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ArrowUpRight, ChevronDown, FileDown, Layers, Printer, Scissors, SquareDashed, Tags, ListChecks, ShoppingCart, Cpu } from 'lucide-react'
import type { CutSettings } from '@framezen/engine'
import {
  buildWorkshopDocInput,
  canSeeWorkshopCosts,
  workshopDocumentAccess,
  workshopTint,
  WorkOrderDocument,
  type WorkshopDocumentKind,
} from '@framezen/documents'
import type { Station } from '@framezen/shared'
import { humanError } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { formatDate } from '../../lib/format'
import { useCatalog, useSettings, useUpdateSettings } from '../../lib/hooks'
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
  Page,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  toastUndo,
} from '../../ui'
import { useUpdateWorkOrder, useWorkOrderDetail, type WorkOrderDetail } from './data'
import { CutsTab, type CutField, type CutSimulation } from './detail/CutsTab'
import type { WindowMeta } from './detail/CutBars'
import { AssemblyTab, CncTab, GlassTab, LabelsTab, MaterialsTab, PurchaseTab } from './detail/DocumentTabs'
import { DueDateField } from './detail/OrderFields'
import { SummaryTab } from './detail/SummaryTab'
import { useDocumentActions } from './detail/useDocumentActions'
import { ORDER_STATUS_COPY, STATION_IDS, stationInfo, stationOf } from './model/stations'

const TABS = ['resumen', 'cortes', 'vidrios', 'materiales', 'montaje', 'etiquetas', 'compras', 'cnc'] as const
type Tab = (typeof TABS)[number]

const TAB_COPY: Record<Tab, { label: string; icon?: typeof Scissors; description: string }> = {
  resumen: { label: 'Resumen', description: '' },
  cortes: { label: 'Cortes', icon: Scissors, description: 'Barras optimizadas a escala, para la sierra.' },
  vidrios: { label: 'Vidrios', icon: SquareDashed, description: 'Pedido al proveedor, con casillas.' },
  materiales: { label: 'Materiales', icon: Layers, description: 'Barras, herrajes y accesorios para bodega.' },
  montaje: { label: 'Montaje', icon: ListChecks, description: 'Controles por ventana con firmas.' },
  etiquetas: { label: 'Etiquetas', icon: Tags, description: 'Una por pieza, con QR.' },
  compras: { label: 'Compras', icon: ShoppingCart, description: 'Una orden por proveedor.' },
  cnc: { label: 'CNC', icon: Cpu, description: 'Lista de cortes para tu sierra.' },
}

export default function WorkOrderPage() {
  const { id = '' } = useParams()
  const order = useWorkOrderDetail(id)
  const title = order.data ? `OT N° ${order.data.number}` : 'Orden de trabajo'
  usePageTitle(title)

  if (order.isPending) return <LoadingOrder />
  if (order.isError || !order.data) {
    return (
      <Page width="wide">
        <PageHeader breadcrumbs={[{ label: 'Taller', to: '/taller' }, { label: 'OT' }]} title="Orden de trabajo" />
        <div className="rounded-lg border border-paper-200 bg-paper-0">
          <EmptyState
            sketch="fixed"
            title="No encontramos esta OT"
            description={order.error ? humanError(order.error) : 'Puede que se haya borrado o que el enlace esté incompleto.'}
            action={
              <Link to="/taller" className={buttonClass('secondary')}>
                Volver al taller
              </Link>
            }
          />
        </div>
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
  const me = useSession()
  const plan = usePlan()
  const catalog = useCatalog()
  const settings = useSettings()
  const updateSettings = useUpdateSettings()
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

  // Largo de barra «natural» (el del catálogo, sin simular) para saber cuándo vuelves a él.
  const naturalBar = useRef(settings.data?.cut.barLength ?? 5800)
  if (sim.barLength === undefined && baseInput) naturalBar.current = dominantBarOf(baseInput)

  const baseCut: CutSettings | null = settings.data ? { ...settings.data.cut } : null
  const simulation: CutSimulation | null = baseCut
    ? {
        values: sim,
        effective: { ...baseCut, ...stripBar(sim), barLength: sim.barLength ?? naturalBar.current },
        set: (field: CutField, value: number | null) =>
          setSim((prev) => {
            const next = { ...prev }
            const original = field === 'barLength' ? naturalBar.current : baseCut[field]
            if (value === null || value === original) delete next[field]
            else next[field] = value
            return next
          }),
        reset: () => setSim({}),
        saveDefault: readOnly
          ? undefined
          : () => {
              if (!settings.data) return
              const previous = settings.data.cut
              const savable = { ...stripBar(sim) }
              const nextCut = { ...previous, ...savable }
              updateSettings.mutate(
                { cut: nextCut },
                {
                  onSuccess: () => {
                    setSim((s) => (s.barLength !== undefined ? { barLength: s.barLength } : {}))
                    toastUndo('Guardaste los ajustes de corte como predeterminados', () => updateSettings.mutate({ cut: previous }))
                  },
                  onError: (error) => toast.error(humanError(error)),
                },
              )
            },
        saving: updateSettings.isPending,
      }
    : null

  const simulated = Object.keys(sim).length > 0
  const actions = useDocumentActions({ orderId: order.id, orderNumber: order.number, simulated })

  // ── Avance por estación (con deshacer) ─────────────────────────────────────
  const onError = useCallback((error: unknown) => toast.error(humanError(error)), [])
  const setStation = useCallback(
    (ref: string, station: Station) => {
      const previous = stationOf(order.progress, ref)
      if (previous === station) return
      update.mutate({ id: order.id, patch: { progress: { [ref]: station } } }, { onError })
      toastUndo(`${ref} pasó a ${stationInfo(station).label}`, () =>
        update.mutate({ id: order.id, patch: { progress: { [ref]: previous } } }, { onError }),
      )
    },
    [order.id, order.progress, update, onError],
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
      toastUndo(`Todas las ventanas pasaron a ${stationInfo(station).label}`, () =>
        update.mutate({ id: order.id, patch: { progress: previous } }, { onError }),
      )
    },
    [refs, order.id, order.progress, update, onError],
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

  const windows = useMemo(() => {
    const map = new Map<string, WindowMeta>()
    input?.data.windows.forEach((w, i) => map.set(w.ref, { ref: w.ref, tint: workshopTint(i), name: w.name || w.description.split(' · ')[0] }))
    return map
  }, [input])

  const status = ORDER_STATUS_COPY[order.status]
  const paper = input?.paper ?? 'letter'
  const otElement = useMemo(() => (input ? <WorkOrderDocument {...input} /> : null), [input])
  const otRequest = otElement ? { kind: 'work-order' as const, element: otElement } : null

  const header = (
    <PageHeader
      breadcrumbs={[{ label: 'Taller', to: '/taller' }, { label: `OT N° ${order.number}` }]}
      title={
        <span className="inline-flex flex-wrap items-center gap-3">
          OT N° {order.number}
          <Badge tone={status.tone} dot className="translate-y-[-2px]">
            {status.label}
          </Badge>
        </span>
      }
      description={[order.title, order.clientName].filter(Boolean).join(' · ')}
      meta={
        <MetaRow
          items={[
            <DueDateField key="due" order={order} now={now} readOnly={readOnly} />,
            <Link
              key="quote"
              to={`/cotizaciones/${order.quoteId}`}
              className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-ink-600 hover:text-ink-700"
            >
              Cotización N° {order.quoteNumber}
              <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-3.5" />
            </Link>,
            <span key="created" className="whitespace-nowrap tabular">
              Creada el {formatDate(order.createdAt)}
            </span>,
          ]}
        />
      }
      actions={
        otRequest ? (
          <div className="hidden items-center gap-2 sm:flex">{onSummary ? headerActions(otRequest) : wholeOrderMenu(otRequest)}</div>
        ) : null
      }
    />
  )
  // En el teléfono las acciones van bajo el título (así el título no se angosta). Solo en
  // Resumen: en las demás pestañas el documento de la pestaña trae las suyas.
  const mobileActions =
    otRequest && onSummary ? <div className="-mt-3 mb-5 grid grid-cols-2 gap-2 sm:hidden">{headerActions(otRequest)}</div> : null

  function headerActions(req: NonNullable<typeof otRequest>) {
    return (
      <>
        <Button icon={Printer} onClick={() => actions.print(req)}>
          Imprimir OT
        </Button>
        <Button variant="primary" icon={FileDown} onClick={() => void actions.download(req)} loading={actions.busy === 'work-order'}>
          Descargar OT
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
            Toda la OT
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem icon={Printer} onSelect={() => actions.print(req)}>
            Imprimir OT
          </DropdownMenuItem>
          <DropdownMenuItem icon={FileDown} onSelect={() => void actions.download(req)}>
            Descargar OT
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
    <nav aria-label="Documentos de taller" className="rounded-lg border border-paper-200 bg-paper-0 p-1.5">
      <h2 className="px-2.5 pt-1.5 pb-1 text-[13px] font-medium text-paper-600">Documentos para el taller</h2>
      <ul>
        {(['cortes', 'vidrios', 'materiales', 'montaje', 'etiquetas', 'compras', 'cnc'] as const).map((t) => {
          const copy = TAB_COPY[t]
          const Icon = copy.icon ?? Scissors
          const locked = (t === 'compras' && purchaseLocked) || (t === 'cnc' && cncLocked)
          return (
            <li key={t}>
              <button
                type="button"
                onClick={() => setTab(t)}
                className="flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-colors duration-120 hover:bg-paper-100"
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-paper-600" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-paper-900">{copy.label}</span>
                  <span className="block truncate text-meta text-paper-600">{copy.description}</span>
                </span>
                {locked ? (
                  <Badge tone="ink" size="sm">
                    Pro
                  </Badge>
                ) : null}
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
        <TabsList aria-label="Secciones de la OT" className="-mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          {TABS.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              badge={(t === 'compras' && purchaseLocked) || (t === 'cnc' && cncLocked) ? 'Pro' : undefined}
            >
              {TAB_COPY[t].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {!input ? (
          <div className="pt-5">
            {catalog.isError || settings.isError ? (
              <div className="rounded-lg border border-paper-200 bg-paper-0">
                <EmptyState
                  sketch="fixed"
                  size="compact"
                  title="No pudimos cargar el catálogo o tus ajustes"
                  description="Sin ellos no podemos calcular los cortes. Reintentamos solos al volver a la pestaña."
                  action={
                    <Button
                      size="sm"
                      onClick={() => {
                        void catalog.refetch()
                        void settings.refetch()
                      }}
                    >
                      Reintentar ahora
                    </Button>
                  }
                />
              </div>
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
                <CutsTab
                  orderId={order.id}
                  data={input.data}
                  paper={paper}
                  catalog={catalog.data}
                  windows={windows}
                  simulation={simulation}
                  actions={actions}
                />
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
                <RoleNotice text="Las órdenes de compra las ven el dueño y el jefe de taller." />
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

function stripBar(sim: Partial<CutSettings>): Partial<CutSettings> {
  const { barLength: _bar, ...rest } = sim
  return rest
}

function dominantBarOf(input: { data: { optimization: { groups: { bars: { barLength: number; fromOffcut: boolean }[] }[] } } } | null): number {
  const counts = new Map<number, number>()
  for (const g of input?.data.optimization.groups ?? []) for (const b of g.bars) if (!b.fromOffcut) counts.set(b.barLength, (counts.get(b.barLength) ?? 0) + 1)
  let best = 5800
  let max = -1
  for (const [len, n] of counts) if (n > max) [best, max] = [len, n]
  return best
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
            <span aria-hidden className="absolute top-1/2 left-0 w-5 -translate-y-1/2 text-center text-paper-350">
              ·
            </span>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function RoleNotice({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-paper-200 bg-paper-0 px-6 py-10 text-center text-paper-600">
      <p>{text}</p>
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
  const refs = Object.keys(order.progress)
  return (
    <div className="flex flex-col gap-4">
      <div role="note" className="rounded-md border border-warn-600/25 bg-warn-50 px-4 py-3 text-[13px] text-warn-800">
        La cotización N° {order.quoteNumber} ya no está disponible, así que no podemos calcular los documentos. Si la borraste, la
        puedes recuperar desde la papelera de cotizaciones. El avance de las ventanas sigue a mano.
      </div>
      <ul className="divide-y divide-paper-200 rounded-lg border border-paper-200 bg-paper-0">
        {refs.map((ref) => (
          <li key={ref} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium text-paper-900">{ref}</span>
            <select
              aria-label={`Estación de la ${ref}`}
              className="h-8 rounded-sm border border-paper-350 bg-paper-0 px-2 text-[13px]"
              value={stationOf(order.progress, ref)}
              disabled={readOnly}
              onChange={(e) => onStation(ref, e.target.value as Station)}
            >
              {STATION_IDS.map((s) => (
                <option key={s} value={s}>
                  {stationInfo(s).label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}
