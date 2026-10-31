import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import type { QuoteItem, WorkOrder } from '@framezen/shared'
import { cn } from '../../../lib/cn'
import { dueInfo, windowsLabel } from '../model/orders'
import { orderProgress, progressText, ORDER_STATUS_COPY } from '../model/stations'
import { DueText, OrderTicket, percent, ProgressBar } from './bits'
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
 * - menos de 672 px: tarjeta (como en el teléfono);
 * - 672 a 1024 px: fila sin la columna «Ventanas» (el avance ya dice «x de N listas»);
 * - desde 1024 px: fila completa con miniatura.
 * La obra y el cliente nunca bajan de ~200 px (~250 px en una pantalla de 1024 con la barra lateral abierta).
 */
const GRID =
  '@2xl:grid @2xl:grid-cols-[auto_minmax(0,1fr)_minmax(140px,170px)_140px_16px] @2xl:items-center @2xl:gap-4 ' +
  '@5xl:grid-cols-[auto_minmax(0,1fr)_170px_minmax(170px,220px)_170px_16px] @5xl:gap-5'

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
  return (
    <div className="@container overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
      <div className={cn('hidden border-b border-paper-200 bg-paper-50 px-4 py-2 text-meta whitespace-nowrap text-paper-600', GRID)} aria-hidden>
        <span className="w-14">OT</span>
        <span>Obra y cliente</span>
        <span className="hidden @5xl:block">Ventanas</span>
        <span>Avance</span>
        <span>Entrega</span>
        <span />
      </div>
      <ul className="divide-y divide-paper-200">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} preview={previews.get(order.quoteId)} catalog={catalog} now={now} />
        ))}
      </ul>
    </div>
  )
}

function OrderRow({ order, preview, catalog, now }: { order: WorkOrder; preview?: OrderPreview; catalog?: Catalog; now: Date }) {
  const progress = orderProgress(order.progress)
  const due = dueInfo(order.dueDate, { now, done: order.status === 'done' })
  const status = ORDER_STATUS_COPY[order.status]
  const units = preview?.units
  return (
    <li>
      <Link
        to={`/taller/${order.id}`}
        className={cn(
          'group flex flex-col gap-3 px-4 py-3.5 transition-colors duration-120 ease-out hover:bg-paper-50 focus-visible:bg-paper-50 focus-visible:outline-offset-[-2px]',
          GRID,
        )}
      >
        <div className="flex min-w-0 items-center gap-3 @2xl:contents">
          <OrderTicket number={order.number} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-paper-900">{order.title || `Cotización N° ${order.quoteNumber}`}</div>
            <div className="mt-0.5 truncate text-[13px] text-paper-600">
              {[order.clientName, `Cotización N° ${order.quoteNumber}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <ChevronRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-paper-350 @2xl:hidden" />
        </div>

        <div className="hidden min-w-0 items-center gap-2.5 @5xl:flex">
          {preview?.item ? (
            <DesignThumb design={preview.item.design} catalog={catalog} size={36} className="rounded-xs bg-paper-50" />
          ) : null}
          <div className="min-w-0 text-[13px] leading-[18px]">
            <div className="text-paper-900 tabular">{windowsLabel(progress.total)}</div>
            {units && units !== progress.total ? <div className="text-paper-600 tabular">{units} unidades</div> : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-paper-600">
              {order.status === 'in_progress' ? progressText(progress) : status.label}
            </span>
            <span className="shrink-0 font-medium text-paper-900 tabular">{percent(progress.ratio)}</span>
          </div>
          <ProgressBar ratio={progress.ratio} label={`Avance de la OT N° ${order.number}: ${percent(progress.ratio)}`} />
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 text-[13px] @2xl:block">
          {/* Tarjeta: el conteo a la izquierda y la entrega a la derecha (ella ya dice «Entrega…»). */}
          <span className="text-paper-600 tabular @2xl:hidden">
            {windowsLabel(progress.total)}
            {units && units !== progress.total ? ` · ${units} unidades` : null}
          </span>
          <span className="flex min-w-0 flex-col items-end @2xl:items-start">
            <span className="flex max-w-full min-w-0 @2xl:hidden">
              <DueText due={due} compact sentence />
            </span>
            <span className="hidden max-w-full min-w-0 @2xl:flex">
              <DueText due={due} compact />
            </span>
            {due.date && due.tone !== 'done' ? <span className="hidden text-meta text-paper-600 tabular @2xl:block">{due.date}</span> : null}
          </span>
        </div>

        <ChevronRight
          aria-hidden
          strokeWidth={1.75}
          className="hidden size-4 text-paper-350 transition-transform duration-160 ease-out group-hover:translate-x-0.5 group-hover:text-paper-600 @2xl:block"
        />
      </Link>
    </li>
  )
}
