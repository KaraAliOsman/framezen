import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { QuoteItem, WorkOrder } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import es from '../i18n/es'
import { dueInfo } from '../model/orders'
import { orderProgress, progressText } from '../model/stations'
import { DueText, ProgressBar, useOrderLabel, usePercent } from './bits'
import { DesignThumb } from './DesignThumb'

export interface OrderPreview {
  /** Primera ventana de la cotización, para la miniatura. */
  item?: QuoteItem
  /** Unidades totales de la cotización. */
  units?: number
}

/*
 * El ancho de la lista depende de la barra lateral (abierta, angosta o ausente), así que el
 * diseño se decide por el ancho del contenedor y no de la ventana:
 * - menos de 672 px: obra arriba, avance y entrega debajo (como en el teléfono);
 * - 672 a 1024 px: fila sin la columna «Ventanas» (el avance ya dice «x de N listas»);
 * - desde 1024 px: fila completa.
 * La obra y el cliente nunca bajan de ~200 px.
 */
const GRID =
  '@2xl:grid @2xl:grid-cols-[minmax(0,1fr)_minmax(150px,180px)_150px] @2xl:items-center @2xl:gap-5 ' +
  '@5xl:grid-cols-[minmax(0,1fr)_110px_minmax(180px,230px)_160px] @5xl:gap-6'

export function OrdersList({
  orders,
  previews,
  catalog,
  now,
}: {
  orders: WorkOrder[]
  previews: ReadonlyMap<string, OrderPreview>
  catalog?: Catalog
  now: Date
}) {
  const t = useT(es)
  return (
    <div className="@container -mx-3 rounded-panel bg-plate px-3 shadow-plate">
      <div className={cn('hidden h-9 border-b border-divider text-table whitespace-nowrap text-fg-muted', GRID)} aria-hidden>
        <span>{t('list.columns.job')}</span>
        <span className="hidden @5xl:block">{t('list.columns.windows')}</span>
        <span>{t('list.columns.progress')}</span>
        <span>{t('list.columns.due')}</span>
      </div>
      <ul aria-label={t('list.caption')} className="divide-y divide-divider">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} preview={previews.get(order.quoteId)} catalog={catalog} now={now} />
        ))}
      </ul>
    </div>
  )
}

function OrderRow({ order, preview, catalog, now }: { order: WorkOrder; preview?: OrderPreview; catalog?: Catalog; now: Date }) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const percent = usePercent()
  const orderLabel = useOrderLabel()
  const progress = orderProgress(order.progress)
  const due = dueInfo(order.dueDate, { now, done: order.status === 'done', locale: t.locale })
  const units = preview?.units
  const quoteLabel = t('common.quoteNumber', { number: fmt.docNumber(order.quoteNumber) })
  const windows = t('common.windows', { count: progress.total })
  const unitsText = units && units !== progress.total ? t('common.units', { count: units }) : null
  return (
    <li>
      <Link
        to={`/taller/${order.id}`}
        className={cn(
          '-mx-3 flex min-h-14 flex-col gap-3 rounded-sm px-3 py-2.5 transition-colors duration-100 ease-out hover:bg-hover focus-visible:bg-hover focus-visible:outline-offset-[-2px]',
          GRID,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-sunken">
            {preview?.item ? <DesignThumb design={preview.item.design} catalog={catalog} size={32} /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-table text-fg-muted tabular">{orderLabel(order.number)}</span>
              <span className="truncate font-medium text-fg-strong">{order.title || quoteLabel}</span>
            </div>
            <div className="truncate text-table text-fg-muted">{[order.clientName, quoteLabel].filter(Boolean).join(' · ')}</div>
          </div>
          <ChevronRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-faint @2xl:hidden" />
        </div>

        <div className="hidden min-w-0 text-table @5xl:block">
          <div className="text-fg tabular">{windows}</div>
          {unitsText ? <div className="text-fg-muted tabular">{unitsText}</div> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-table">
            <span className="truncate text-fg-muted">
              {order.status === 'in_progress' ? progressText(progress, t.locale) : g.workOrderStatus(order.status)}
            </span>
            <span className="shrink-0 font-medium text-fg tabular">{percent(progress.ratio)}</span>
          </div>
          <ProgressBar ratio={progress.ratio} label={t('list.progressLabel', { order: orderLabel(order.number), pct: percent(progress.ratio) })} />
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 text-table @2xl:block">
          {/* Tarjeta: el conteo a la izquierda y la entrega a la derecha (ella ya dice «Entrega…»). */}
          <span className="text-fg-muted tabular @2xl:hidden">
            {windows}
            {unitsText ? ` · ${unitsText}` : null}
          </span>
          <span className="flex min-w-0 flex-col items-end @2xl:items-start">
            <span className="flex max-w-full min-w-0 @2xl:hidden">
              <DueText due={due} compact sentence />
            </span>
            <span className="hidden max-w-full min-w-0 @2xl:flex">
              <DueText due={due} compact />
            </span>
            {due.date && due.tone !== 'done' ? <span className="hidden text-meta text-fg-muted tabular @2xl:block">{due.date}</span> : null}
          </span>
        </div>
      </Link>
    </li>
  )
}
