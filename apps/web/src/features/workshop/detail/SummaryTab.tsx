import { useMemo, type ReactNode } from 'react'
import { ChevronDown, Printer } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import { WorkOrderDocument, type WorkshopDocData, type WorkshopPaper } from '@dekopen/documents'
import type { Station } from '@dekopen/shared'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, IconButton, KPI, Notice, Select, StatStrip } from '../../../ui'
import { ProgressBar, RefChip, StageTrack, usePercent } from '../components/bits'
import { DesignThumb } from '../components/DesignThumb'
import type { WorkOrderDetail } from '../data'
import es from '../i18n/es'
import { orderProgress, progressText, STATIONS, stationOf } from '../model/stations'
import { workshopNotices, workshopTotals } from '../model/summary'
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
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const percent = usePercent()
  const totals = workshopTotals(data)
  const notices = workshopNotices(data)
  const refs = data.windows.map((w) => w.ref)
  // Mismo criterio que la lista del taller: avance por ventana.
  const progress = orderProgress(order.progress, refs)
  const element = useMemo(() => <WorkOrderDocument data={data} paper={paper} />, [data, paper])
  const stationOptions = useMemo(
    () =>
      STATIONS.map((s) => ({
        value: s.id,
        label: g.station(s.id),
        leading: <s.icon aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />,
      })),
    [g],
  )

  // El ancho real depende de la barra lateral (abierta o angosta): se decide por contenedor.
  // Bajo ~900 px, Notas y Documentos van debajo de las ventanas, en dos columnas.
  return (
    <div className="@container flex flex-col gap-6">
      <div className="grid gap-10 pt-5 @4xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="@container flex min-w-0 flex-col gap-8">
          <StatStrip className="gap-x-10">
            <KPI variant="plain" label={t('summary.units')} value={fmt.number(totals.units)} hint={t('summary.unitsHint', { windows: t('common.windows', { count: totals.windows }), area: fmt.area(totals.frameArea) })} />
            <KPI variant="plain" label={t('summary.bars')} value={fmt.number(totals.bars)} hint={t('summary.barsHint', { pct: fmt.pct(totals.yieldPct, 1) })} />
            <KPI variant="plain" label={t('summary.glass')} value={fmt.number(totals.glassPieces)} hint={fmt.area(totals.glassArea)} />
            <KPI variant="plain" label={t('summary.pieces')} value={fmt.number(totals.pieces)} hint={totals.offcuts ? t('summary.offcuts', { count: totals.offcuts }) : t('summary.noOffcuts')} />
          </StatStrip>

          <section aria-labelledby="ot-windows">
            <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 id="ot-windows" className="text-h3 font-medium text-fg-strong">
                  {t('summary.windowsTitle')}
                </h2>
                <p className="text-table text-fg-muted tabular">
                  {progressText(progress, t.locale)} · {percent(progress.ratio)}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" iconRight={ChevronDown} disabled={readOnly || refs.length === 0}>
                    {t('summary.moveAll')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuLabel>{t('summary.moveAllLabel')}</DropdownMenuLabel>
                  {STATIONS.map((s) => (
                    <DropdownMenuItem key={s.id} icon={s.icon} onSelect={() => onAllStations(s.id)}>
                      {g.station(s.id)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            <ProgressBar ratio={progress.ratio} label={t('summary.progressLabel', { pct: percent(progress.ratio) })} />
            <dl className="mt-3 grid grid-cols-4 gap-x-3 gap-y-2 sm:grid-cols-8" aria-label={t('summary.byStage')}>
              {STATIONS.map((s) => {
                const count = progress.byStation[s.id]
                return (
                  <div key={s.id} className="min-w-0">
                    <dt className="truncate text-meta text-fg-muted">{g.station(s.id)}</dt>
                    <dd className={count > 0 ? 'figure m-0 text-lead font-medium text-fg-strong' : 'figure m-0 text-lead text-fg-faint'}>{fmt.number(count)}</dd>
                  </div>
                )
              })}
            </dl>
            <ul className="-mx-3 mt-2 divide-y divide-divider rounded-panel bg-plate px-3 shadow-plate">
              {data.windows.map((w) => {
                const station = stationOf(order.progress, w.ref)
                const title = w.name || w.description.split(' · ')[0] || w.ref
                const location = w.location && w.location !== w.name ? w.location : undefined
                const detail = [location, w.name ? w.description : w.description.split(' · ').slice(1).join(' · ')].filter(Boolean).join(' · ')
                // Dibujo y texto crecen; el selector (~240 px) se queda al lado si cabe y, si no,
                // baja a su propia fila a todo el ancho. Sin cortes palabra por palabra.
                return (
                  <li key={w.ref} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
                    <div className="flex min-w-0 flex-[999_1_280px] items-center gap-3">
                      <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-sm bg-sunken">
                        <DesignThumb design={w.design} layout={w.layout} catalog={catalog} size={52} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <RefChip>{w.ref}</RefChip>
                          <span className="truncate font-medium text-fg-strong">{title}</span>
                        </div>
                        {detail ? <div className="mt-1 truncate text-table text-fg-muted">{detail}</div> : null}
                        <div className="mt-0.5 text-table whitespace-nowrap">
                          <span className="dim text-fg">{fmt.size(w.design.width, w.design.height)}</span>
                          <span className="text-fg-muted"> · {t('common.units', { count: w.qty })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Select<Station>
                          size="sm"
                          className="w-full"
                          aria-label={t('order.stationOf', { ref: w.ref })}
                          value={station}
                          disabled={readOnly}
                          onValueChange={(s) => onStation(w.ref, s)}
                          options={stationOptions}
                        />
                        <StageTrack station={station} windowRef={w.ref} disabled={readOnly} onChange={(s) => onStation(w.ref, s)} />
                      </div>
                      <IconButton
                        icon={Printer}
                        label={t('summary.printSheet', { ref: w.ref })}
                        onClick={() => actions.print({ kind: 'work-order', element: <WorkOrderDocument data={data} paper={paper} refs={[w.ref]} /> })}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <aside className="grid min-w-0 content-start items-start gap-8 @2xl:grid-cols-2 @4xl:grid-cols-1">
          {notices.length > 0 ? <Notices notices={notices} className="@2xl:col-span-2 @4xl:col-span-1" /> : null}
          <div className="min-w-0">
            <NotesField order={order} readOnly={readOnly} />
          </div>
          <div className="min-w-0">{documentsNav}</div>
        </aside>
      </div>

      <div>
        {/* El primario de esta vista es «Imprimir OT» de la cabecera: aquí, acciones discretas. */}
        <DocumentToolbar
          title={t('summary.sheetsTitle')}
          description={t('summary.sheetsHint')}
          onPrint={() => actions.print({ kind: 'work-order', element })}
          onDownload={() => void actions.download({ kind: 'work-order', element })}
          downloading={actions.busy === 'work-order'}
          quiet
        />
        <DocumentPreview element={element} paper={paper} label={t('summary.sheetsPreview')} />
      </div>
    </div>
  )
}

function Notices({ notices, className }: { notices: ReturnType<typeof workshopNotices>; className?: string }) {
  const t = useT(es)
  const g = useGlossary()
  const hasError = notices.some((n) => n.level === 'error')
  const shown = notices.slice(0, 6)
  return (
    <Notice tone={hasError ? 'danger' : 'warning'} title={t('summary.review')} className={className}>
      <ul className="mt-1 space-y-1">
        {shown.map((n, i) => (
          <li key={i}>
            {n.ref ? <strong className="code-id font-medium text-fg-strong">{n.ref}: </strong> : null}
            {g.warning(n.warning)}
          </li>
        ))}
      </ul>
      {notices.length > shown.length ? <p className="mt-1.5 text-meta">{t('summary.moreNotices', { count: notices.length - shown.length })}</p> : null}
    </Notice>
  )
}
