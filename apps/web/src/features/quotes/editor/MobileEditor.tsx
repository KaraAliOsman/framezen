/**
 * Editor en el teléfono: obra y lista de ventanas; cada ventana se abre en una hoja inferior con
 * el dibujo y lo esencial; los totales viven en una barra fija que se despliega.
 */
import { Link } from 'react-router'
import { ChevronLeft, ChevronUp, Copy, Download, Factory, FileText, Plus, Send, Trash2 } from 'lucide-react'
import { designName, formatArea, formatCLP, formatPct, formatSize } from '@framezen/engine'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { useAssistantPanelState } from '../../assistant/dock'
import { formatNumber, revisionLetter } from '../../../lib/format'
import { AnimatedNumber, Button, Flash, IconButton, Sheet, SheetContent, StatusPill } from '../../../ui'
import { DesignCanvas, WindowSettings } from '../../designer'
import { QUOTE_LIMITS } from '../model/doc'
import { itemWarnings } from '../model/evaluate'
import { useEditor, useEditorShallow, useEditorUi, useSelectedItem } from './context'
import { MatchOthers } from './ApplyToAll'
import { ExtrasEditor } from './ExtrasEditor'
import { ClientField, QtyStepper, TitleField } from './fields'
import { ROOMS, WarningList } from './Inspector'
import { ItemsList } from './ItemsList'
import { QuoteMenu } from './QuoteMenu'
import { DocumentPreview, TemplatePicker } from './DocumentPreview'
import { DiscountInput } from './TotalsFooter'
import { EditorSaveIndicator, HistoryButtons } from './CenterStage'
import { removeWithUndo } from './useEditorWiring'
import { useQuoteActions } from './useQuoteActions'
import { IN_WORKSHOP, useQuoteWorkOrder } from './useQuoteStage'
import { PriceDriftNotice } from './PriceDriftNotice'
import { WorkOrderLink } from './ItemsColumn'
import { CanvasBoundary, DocumentBoundary } from './ZoneBoundary'

export function MobileEditor() {
  const { number, status, revision, count, totals } = useEditorShallow((s) => ({
    number: s.meta.number,
    status: s.meta.status,
    revision: s.meta.revision,
    count: s.doc.items.length,
    totals: s.evaluation.totals,
  }))
  const sheet = useEditorUi((s) => s.mobileSheet)
  const setUi = useEditorUi((s) => s.set)
  const letter = revisionLetter(revision)
  const marcoMinimized = useAssistantPanelState() === 'minimized'
  const { order } = useQuoteWorkOrder()

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper-50">
      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
        <header className="border-b border-paper-200 bg-paper-0 px-4 pt-2 pb-4">
          <div className="flex h-10 items-center justify-between gap-2">
            <Link to="/cotizaciones" className="-ml-2 inline-flex h-9 items-center gap-0.5 rounded-sm pr-2 pl-1 text-base text-paper-600">
              <ChevronLeft aria-hidden strokeWidth={1.75} className="size-5" />
              Cotizaciones
            </Link>
            <div className="flex items-center gap-1">
              <HistoryButtons size="md" />
              <QuoteMenu />
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-medium whitespace-nowrap tabular text-paper-600">N° {number}</span>
            <StatusPill status={status} suffix={letter ? `versión ${letter}` : undefined} />
            {order ? <WorkOrderLink order={order} /> : null}
            <EditorSaveIndicator className="ml-auto" />
          </div>
          <TitleField size="lg" className="mt-2" />
          <ClientField className="mt-3" />
          <PriceDriftNotice variant="card" className="mt-3" />
        </header>

        {/* Con Marco minimizado (su cara flota sobre la barra de totales) la lista deja espacio abajo. */}
        <div className={cn('px-3 pt-4', marcoMinimized ? 'pb-24' : 'pb-6')}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold text-paper-900">Ventanas</h2>
            {count ? (
              <span className="text-meta tabular text-paper-600">
                {formatNumber(totals.units)} {totals.units === 1 ? 'unidad' : 'unidades'} · {formatArea(totals.area)}
              </span>
            ) : null}
          </div>
          {count ? (
            <ItemsList variant="cards" onOpenItem={() => setUi({ mobileSheet: 'item' })} />
          ) : (
            <div className="rounded-lg border border-dashed border-paper-350/70 bg-paper-0 px-6 py-8 text-center">
              <p className="text-base font-medium text-paper-900">Agrega la primera ventana</p>
              <p className="mt-1 text-[13px] text-paper-600">Tipología, ancho × alto y listo: el precio sale al instante.</p>
            </div>
          )}
          <Button variant={count ? 'secondary' : 'primary'} size="lg" icon={Plus} className="mt-3 w-full" onClick={() => setUi({ pickerOpen: true })}>
            Agregar ventana
          </Button>
          {count ? (
            <Button variant="ghost" size="lg" icon={FileText} className="mt-1 w-full" onClick={() => setUi({ mobileSheet: 'document' })}>
              Ver el documento para el cliente
            </Button>
          ) : null}
        </div>
      </div>

      <MobileTotalsBar onOpen={() => setUi({ mobileSheet: 'totals' })} />

      <Sheet open={sheet === 'item'} onOpenChange={(o) => setUi({ mobileSheet: o ? 'item' : null })}>
        <ItemSheet />
      </Sheet>
      <Sheet open={sheet === 'totals'} onOpenChange={(o) => setUi({ mobileSheet: o ? 'totals' : null })}>
        <TotalsSheet />
      </Sheet>
      <Sheet open={sheet === 'document'} onOpenChange={(o) => setUi({ mobileSheet: o ? 'document' : null })}>
        <DocumentSheet />
      </Sheet>
    </div>
  )
}

function MobileTotalsBar({ onOpen }: { onOpen: () => void }) {
  const total = useEditorShallow((s) => ({ t: s.evaluation.totals.total })).t
  const actions = useQuoteActions()
  const { order, status } = useQuoteWorkOrder()
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-paper-200 bg-paper-0 px-4 py-2.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start text-left" aria-label="Ver totales">
        <span className="inline-flex items-center gap-1 text-meta text-paper-600">
          Total con IVA <ChevronUp aria-hidden strokeWidth={2} className="size-3" />
        </span>
        <Flash trigger={total} className="-mx-1 px-1">
          <span className="text-h3 leading-7 font-semibold tracking-[-0.01em] tabular text-paper-900">
            <AnimatedNumber value={total} format={formatCLP} />
          </span>
        </Flash>
      </button>
      {order ? (
        <Button variant="primary" size="lg" icon={Factory} onClick={() => actions.openWorkOrder(order)}>
          OT N° {order.number}
        </Button>
      ) : status === 'accepted' || IN_WORKSHOP.includes(status) ? (
        <Button variant="primary" size="lg" icon={Factory} onClick={() => void actions.toWorkshop()} loading={actions.busy === 'workshop'}>
          A taller
        </Button>
      ) : (
        <Button variant="primary" size="lg" icon={Send} onClick={actions.openSend}>
          Enviar
        </Button>
      )}
    </div>
  )
}

function ItemSheet() {
  const editor = useEditor()
  const setUi = useEditorUi((s) => s.set)
  const { item, evaluated } = useSelectedItem()
  const { catalog, selectedNodeId } = useEditorShallow((s) => ({ catalog: s.catalog, selectedNodeId: s.selectedNodeId }))
  if (!item) return <SheetContent side="bottom" title="Ventana">{null}</SheetContent>
  const price = evaluated?.price
  const warnings = itemWarnings(evaluated?.bom, price?.warnings)
  const label = (l?: string) => (l ? `${l} (${item.ref})` : undefined)
  return (
    <SheetContent
      side="bottom"
      title={
        <span className="flex items-baseline gap-2">
          <span className="tabular">{item.ref}</span>
          <span className="font-normal text-paper-600">{item.name?.trim() || designName(item.design)}</span>
        </span>
      }
      description={formatSize(item.design.width, item.design.height)}
      footer={
        <div className="flex w-full items-center gap-2">
          <IconButton icon={Copy} variant="secondary" label="Duplicar ventana" onClick={() => editor.duplicateItem(item.id)} />
          <IconButton
            icon={Trash2}
            variant="secondary"
            label="Eliminar ventana"
            onClick={() => {
              setUi({ mobileSheet: null })
              removeWithUndo(editor, item.id)
            }}
          />
          <div className="ml-auto text-right">
            <div className="text-meta text-paper-600">{item.qty > 1 ? `${item.qty} × ${formatCLP(price?.unitNet ?? 0)}` : 'Precio neto'}</div>
            <div className="text-base font-semibold tabular">{formatCLP(price?.totalNet ?? 0)}</div>
          </div>
        </div>
      }
    >
      <div className="relative -mx-5 -mt-5 mb-4 h-[320px] overflow-hidden border-b border-paper-200 bg-paper-50" data-quote-canvas>
        <div className="absolute inset-0">
          <CanvasBoundary>
            <DesignCanvas
              key={item.id}
              design={item.design}
              catalog={catalog}
              onChange={(next, l) => editor.updateDesign(item.id, () => next, label(l))}
              selectedNodeId={selectedNodeId}
              onSelect={(id) => editor.selectNode(id)}
              className="h-full w-full"
            />
          </CanvasBoundary>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-[auto_1fr] items-end gap-3">
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Cantidad</div>
          <QtyStepper value={item.qty} onChange={(qty) => editor.setQty(item.id, qty)} label={`Cantidad de ${item.ref}`} size="md" />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Ambiente</span>
          <input
            list="fz-rooms-m"
            value={item.location ?? ''}
            maxLength={QUOTE_LIMITS.itemLocation}
            placeholder="Living, cocina…"
            onChange={(e) => editor.updateItem(item.id, { location: e.target.value }, `Ambiente de ${item.ref}`)}
            className="h-11 w-full rounded-sm border border-paper-350 bg-paper-0 px-3 text-lead outline-none focus:border-ink-500 [&::-webkit-calendar-picker-indicator]:hidden"
          />
          <datalist id="fz-rooms-m">
            {ROOMS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
      </div>
      <WindowSettings design={item.design} catalog={catalog} onChange={(next, l) => editor.updateDesign(item.id, () => next, label(l))} />
      <MatchOthers className="mt-4" />
      {warnings.length ? (
        <div className="mt-4">
          <WarningList warnings={warnings} itemId={item.id} itemRef={item.ref} />
        </div>
      ) : null}
    </SheetContent>
  )
}

/** El documento que verá el cliente, con su plantilla y textos editables (también en el teléfono). */
function DocumentSheet() {
  const actions = useQuoteActions()
  const setUi = useEditorUi((s) => s.set)
  return (
    <SheetContent
      side="bottom"
      title="Documento para el cliente"
      className="h-[85dvh]"
      footer={
        <div className="flex w-full items-center gap-2">
          <TemplatePicker className="mr-auto" />
          <IconButton icon={Download} variant="secondary" label="Descargar PDF" onClick={() => void actions.downloadPdf()} />
          <Button
            variant="primary"
            icon={Send}
            onClick={() => {
              setUi({ mobileSheet: null })
              actions.openSend()
            }}
          >
            Enviar
          </Button>
        </div>
      }
    >
      <div className="relative -m-5 h-[calc(100%+2.5rem)] overflow-hidden">
        <DocumentBoundary>
          <DocumentPreview />
        </DocumentBoundary>
      </div>
    </SheetContent>
  )
}

function TotalsSheet() {
  const session = useSession()
  const { totals, pricing } = useEditorShallow((s) => ({ totals: s.evaluation.totals, pricing: s.evaluation.pricing }))
  const actions = useQuoteActions()
  const { order } = useQuoteWorkOrder()
  const row = 'flex items-center justify-between gap-3 py-2 text-base'
  return (
    <SheetContent side="bottom" title="Totales">
      <dl className="divide-y divide-paper-200">
        <div className={row}>
          <dt className="text-paper-600">Neto ventanas</dt>
          <dd className="tabular">{formatCLP(totals.subtotal)}</dd>
        </div>
        <div className={row}>
          <dt className="flex items-center gap-2 text-paper-600">
            Descuento <DiscountInput className="w-24" />
          </dt>
          <dd className="tabular">{totals.discount ? `−${formatCLP(totals.discount)}` : formatCLP(0)}</dd>
        </div>
        <div className="py-2">
          <div className="mb-2 flex items-center justify-between text-base">
            <span className="text-paper-600">Extras</span>
            <span className="tabular">{formatCLP(totals.extras)}</span>
          </div>
          <ExtrasEditor />
        </div>
        <div className={row}>
          <dt className="text-paper-600">IVA {formatPct(pricing.ivaPct)}</dt>
          <dd className="tabular">{formatCLP(totals.iva)}</dd>
        </div>
        <div className={`${row} font-semibold`}>
          <dt>Total con IVA</dt>
          <dd className="text-h3 tabular">{formatCLP(totals.total)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-meta tabular text-paper-600">
        {formatNumber(totals.units)} {totals.units === 1 ? 'unidad' : 'unidades'} · {formatArea(totals.area)}
        {session.role === 'owner' && totals.subtotal > 0 ? ` · margen real ${formatPct(totals.marginPct)}` : ''}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button size="lg" icon={Download} onClick={() => void actions.downloadPdf()} loading={actions.busy === 'pdf'}>
          PDF
        </Button>
        {order ? (
          <Button size="lg" icon={Factory} onClick={() => actions.openWorkOrder(order)}>
            Ver OT N° {order.number}
          </Button>
        ) : (
          <Button size="lg" icon={Factory} onClick={() => void actions.toWorkshop()} loading={actions.busy === 'workshop'}>
            A taller
          </Button>
        )}
        <Button variant="primary" size="lg" icon={Send} className="col-span-2" onClick={actions.openSend}>
          Enviar al cliente
        </Button>
      </div>
    </SheetContent>
  )
}
