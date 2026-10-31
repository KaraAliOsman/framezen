import { useMemo, type ReactNode } from 'react'
import { ChevronDown, Printer, TriangleAlert } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import { WorkOrderDocument, type WorkshopDocData, type WorkshopPaper } from '@framezen/documents'
import type { Station } from '@framezen/shared'
import { cn } from '../../../lib/cn'
import { formatArea, formatNumber, formatSize } from '../../../lib/format'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  Select,
} from '../../../ui'
import { RefChip, StationMeter, percent, ProgressBar } from '../components/bits'
import { DesignThumb } from '../components/DesignThumb'
import { orderProgress, progressText, STATIONS, stationOf } from '../model/stations'
import { workshopNotices, workshopTotals } from '../model/summary'
import type { WorkOrderDetail } from '../data'
import { DocumentPreview, DocumentToolbar } from './DocumentPreview'
import { NotesField } from './OrderFields'
import type { useDocumentActions } from './useDocumentActions'

export function SummaryTab({
  order,
  data,
  paper,
  catalog,
  readOnly,
  onStation,
  onAllStations,
  actions,
  documentsNav,
}: {
  order: WorkOrderDetail
  data: WorkshopDocData
  paper: WorkshopPaper
  catalog?: Catalog
  readOnly?: boolean
  onStation: (ref: string, station: Station) => void
  onAllStations: (station: Station) => void
  actions: ReturnType<typeof useDocumentActions>
  documentsNav: ReactNode
}) {
  const totals = workshopTotals(data)
  const notices = workshopNotices(data)
  const refs = data.windows.map((w) => w.ref)
  // Mismo criterio que la lista del taller: avance por ventana.
  const progress = orderProgress(order.progress, refs)
  const element = useMemo(() => <WorkOrderDocument data={data} paper={paper} />, [data, paper])

  // El ancho real depende de la barra lateral (abierta o angosta): se decide por contenedor.
  // Bajo ~900 px, Notas y Documentos van debajo de las ventanas, en dos columnas.
  return (
    <div className="@container flex flex-col gap-6">
      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="@container flex min-w-0 flex-col gap-5">
          <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-paper-200 bg-paper-200 @xl:grid-cols-4" style={{ gap: 1 }}>
            <Tile label="Unidades" value={formatNumber(totals.units)} hint={`${totals.windows} ${totals.windows === 1 ? 'ventana' : 'ventanas'} · ${formatArea(totals.frameArea)}`} />
            <Tile label="Barras" value={formatNumber(totals.bars)} hint={`${formatNumber(totals.yieldPct, 1)} % de aprovechamiento`} />
            <Tile label="Vidrios" value={formatNumber(totals.glassPieces)} hint={formatArea(totals.glassArea)} />
            <Tile label="Piezas a cortar" value={formatNumber(totals.pieces)} hint={totals.offcuts ? `${totals.offcuts} retazos para guardar` : 'Sin retazos'} />
          </dl>

          <section className="rounded-lg border border-paper-200 bg-paper-0" aria-labelledby="ot-windows">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-200 px-4 py-3">
              <div className="min-w-0">
                <h2 id="ot-windows" className="font-semibold text-paper-900">
                  Ventanas y avance
                </h2>
                <p className="text-[13px] text-paper-600 tabular">
                  {progressText(progress)} · {percent(progress.ratio)}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" iconRight={ChevronDown} disabled={readOnly || refs.length === 0}>
                    Mover todas a…
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuLabel>Todas las ventanas a</DropdownMenuLabel>
                  {STATIONS.map((s) => (
                    <DropdownMenuItem key={s.id} icon={s.icon} onSelect={() => onAllStations(s.id)}>
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            <div className="px-4 pt-3">
              <ProgressBar ratio={progress.ratio} label={`Avance de la OT: ${percent(progress.ratio)}`} />
            </div>
            <ul className="divide-y divide-paper-200">
              {data.windows.map((w) => {
                const station = stationOf(order.progress, w.ref)
                const title = w.name || w.description.split(' · ')[0] || w.ref
                const location = w.location && w.location !== w.name ? w.location : undefined
                const detail = [location, w.name ? w.description : w.description.split(' · ').slice(1).join(' · ')].filter(Boolean).join(' · ')
                // Dibujo y texto crecen; el selector (~240 px) se queda al lado si cabe y, si no,
                // baja a su propia fila a todo el ancho. Sin cortes palabra por palabra.
                return (
                  <li key={w.ref} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
                    <div className="flex min-w-0 flex-[999_1_280px] items-center gap-3">
                      <DesignThumb design={w.design} layout={w.layout} catalog={catalog} size={60} className="rounded-sm bg-paper-50 p-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <RefChip>{w.ref}</RefChip>
                          <span className="truncate font-medium text-paper-900">{title}</span>
                        </div>
                        {detail ? <div className="mt-1 truncate text-[13px] text-paper-600">{detail}</div> : null}
                        <div className="mt-0.5 text-[13px] whitespace-nowrap text-paper-900 tabular">
                          {formatSize(w.design.width, w.design.height)}
                          <span className="text-paper-600"> · {w.qty === 1 ? '1 unidad' : `${w.qty} unidades`}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Select<Station>
                          size="sm"
                          className="w-full"
                          aria-label={`Estación de la ${w.ref}`}
                          value={station}
                          disabled={readOnly}
                          onValueChange={(s) => onStation(w.ref, s)}
                          options={STATIONS.map((s) => ({
                            value: s.id,
                            label: s.label,
                            leading: <s.icon aria-hidden strokeWidth={1.75} className="size-4 text-paper-600" />,
                          }))}
                        />
                        <StationMeter station={station} />
                      </div>
                      <IconButton
                        icon={Printer}
                        label={`Imprimir la hoja de la ${w.ref}`}
                        onClick={() => actions.print({ kind: 'work-order', element: <WorkOrderDocument data={data} paper={paper} refs={[w.ref]} /> })}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <aside className="grid min-w-0 content-start items-start gap-5 @2xl:grid-cols-2 @4xl:grid-cols-1">
          {notices.length > 0 ? <Notices notices={notices} className="@2xl:col-span-2 @4xl:col-span-1" /> : null}
          <div className="min-w-0 rounded-lg border border-paper-200 bg-paper-0 p-4">
            <NotesField order={order} readOnly={readOnly} />
          </div>
          <div className="min-w-0">{documentsNav}</div>
        </aside>
      </div>

      <div>
        {/* El primario de esta vista es «Descargar OT» de la cabecera: aquí, acciones discretas. */}
        <DocumentToolbar
          title="Hojas de OT"
          description="Una hoja por ventana: dibujo acotado, cortes, refuerzos, herrajes, vidrio y casillas por estación."
          onPrint={() => actions.print({ kind: 'work-order', element })}
          onDownload={() => void actions.download({ kind: 'work-order', element })}
          downloading={actions.busy === 'work-order'}
          quiet
        />
        <DocumentPreview element={element} paper={paper} label="Vista previa de las hojas de OT" />
      </div>
    </div>
  )
}

/** Cifra del resumen: el texto de apoyo se parte en dos líneas antes que cortarse con «…». */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-paper-0 px-4 py-3">
      <dt className="text-[13px] text-pretty text-paper-600">{label}</dt>
      <dd className="text-h3 font-semibold tracking-[-0.01em] text-paper-900 tabular">{value}</dd>
      {hint ? <dd className="text-meta text-pretty break-words text-paper-600 tabular">{hint}</dd> : null}
    </div>
  )
}

function Notices({ notices, className }: { notices: ReturnType<typeof workshopNotices>; className?: string }) {
  const hasError = notices.some((n) => n.level === 'error')
  const shown = notices.slice(0, 6)
  return (
    <section
      role="note"
      aria-label="Revisa antes de fabricar"
      className={cn(
        'min-w-0 rounded-lg border px-4 py-3',
        hasError ? 'border-bad-600/25 bg-bad-50 text-bad-800' : 'border-warn-600/25 bg-warn-50 text-warn-800',
        className,
      )}
    >
      <h2 className="flex items-center gap-2 text-[13px] font-semibold">
        <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
        Revisa antes de fabricar
      </h2>
      <ul className="mt-1.5 space-y-1 text-[13px] leading-[18px]">
        {shown.map((n, i) => (
          <li key={i}>
            {n.ref ? <strong className="font-semibold">{n.ref}: </strong> : null}
            {n.message}
          </li>
        ))}
      </ul>
      {notices.length > shown.length ? <p className="mt-1.5 text-meta">Y {notices.length - shown.length} avisos más en las hojas de OT.</p> : null}
    </section>
  )
}
