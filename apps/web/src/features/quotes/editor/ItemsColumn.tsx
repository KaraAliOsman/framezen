import { Link } from 'react-router'
import { ArrowUpRight, ChevronLeft, Plus } from 'lucide-react'
import { formatNumber } from '../../../lib/format'
import { cn } from '../../../lib/cn'
import { Button, StatusPill, WindowSketch } from '../../../ui'
import { revisionLetter } from '../../../lib/format'
import { useEditorShallow, useEditorUi } from './context'
import { ClientField, TitleField } from './fields'
import { ItemsList } from './ItemsList'
import { QuoteMenu } from './QuoteMenu'
import { EditorSaveIndicator } from './CenterStage'
import { useQuoteWorkOrder } from './useQuoteStage'

/** Columna izquierda: obra, cliente y ventanas. */
export function ItemsColumn({ className }: { className?: string }) {
  const openPicker = useEditorUi((s) => s.set)
  const { number, status, revision, count, units } = useEditorShallow((s) => ({
    number: s.meta.number,
    status: s.meta.status,
    revision: s.meta.revision,
    count: s.doc.items.length,
    units: s.evaluation.totals.units,
  }))
  const letter = revisionLetter(revision)
  const { order } = useQuoteWorkOrder()

  return (
    <aside aria-label="Obra y ventanas" data-assistant-anchor="items" className={cn('flex min-h-0 flex-col border-r border-paper-200 bg-paper-0', className)}>
      <div className="shrink-0 border-b border-paper-200 px-4 pt-2.5 pb-4">
        <div className="flex h-8 items-center justify-between gap-2">
          <Link
            to="/cotizaciones"
            className="-ml-1.5 inline-flex h-7 items-center gap-0.5 rounded-sm pr-2 pl-1 text-[13px] text-paper-600 transition-colors duration-120 hover:bg-paper-100 hover:text-paper-900"
          >
            <ChevronLeft aria-hidden strokeWidth={1.75} className="size-4" />
            Cotizaciones
          </Link>
          <div className="flex min-w-0 items-center gap-1">
            <EditorSaveIndicator className="truncate" />
            <QuoteMenu />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium whitespace-nowrap tabular text-paper-600">N° {number}</span>
          <StatusPill status={status} suffix={letter ? `versión ${letter}` : undefined} />
          {order ? <WorkOrderLink order={order} /> : null}
        </div>
        <TitleField className="mt-1.5" />
        <ClientField className="mt-2" />
      </div>

      <div className="flex h-10 shrink-0 items-center justify-between px-4">
        <h2 className="text-meta font-medium text-paper-600">Ventanas</h2>
        {count > 0 ? (
          <span className="text-meta whitespace-nowrap tabular text-paper-600">
            {formatNumber(count)} {count === 1 ? 'ventana' : 'ventanas'} · {formatNumber(units)} {units === 1 ? 'unidad' : 'unidades'}
          </span>
        ) : null}
      </div>

      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {count > 0 ? (
          <ItemsList />
        ) : (
          <div className="flex flex-col items-center px-4 pt-6 text-center">
            <WindowSketch kind="casement" size={72} />
            <p className="mt-3 text-base font-medium text-paper-900">Agrega la primera ventana</p>
            <p className="mt-1 text-[13px] text-paper-600">Elige el tipo, escribe ancho × alto y listo. El precio sale al instante.</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-paper-200 p-3">
        <Button variant="primary" size="lg" icon={Plus} shortcut="a" className="w-full" onClick={() => openPicker({ pickerOpen: true })}>
          Agregar ventana
        </Button>
      </div>
    </aside>
  )
}

/** Enlace a la OT de esta cotización («OT N° 38 ↗»). */
export function WorkOrderLink({ order, className }: { order: { id: string; number: number }; className?: string }) {
  return (
    <Link
      to={`/taller/${order.id}`}
      className={cn(
        '-mx-1 inline-flex h-6 items-center gap-0.5 rounded-xs px-1 text-[13px] font-medium whitespace-nowrap tabular text-ink-600 transition-colors duration-120 hover:bg-ink-50 hover:text-ink-700',
        className,
      )}
    >
      OT N° {order.number}
      <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-3.5" />
    </Link>
  )
}
