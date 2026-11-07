/**
 * Editor en el teléfono: obra y lista de ventanas; cada ventana se abre en una hoja inferior con
 * el dibujo y lo esencial; los totales viven en una barra fija (con zona segura) que se despliega.
 */
import { Link } from 'react-router'
import { ChevronLeft, ChevronUp, Copy, Download, Factory, FileText, Plus, Send, Trash2 } from 'lucide-react'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { revisionLetter } from '../../../lib/format'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Button, Flash, IconButton, Input, Numeric, Sheet, SheetContent, StatusPill } from '../../../ui'
import { useAssistantPanelState } from '../../assistant/dock'
import { DesignCanvas, WindowSettings } from '../../designer'
import es from '../i18n/es'
import { QUOTE_LIMITS } from '../model/doc'
import { itemWarnings } from '../model/evaluate'
import { ql } from '../model/history'
import { MatchOthers } from './ApplyToAll'
import { EditorSaveIndicator, HistoryButtons } from './CenterStage'
import { useEditor, useEditorShallow, useEditorUi, useSelectedItem } from './context'
import { DocumentLanguagePicker, DocumentPreview } from './DocumentPreview'
import { TemplateGalleryButton } from './TemplateGallery'
import { WorkOrderLink } from './EditorHeader'
import { ExtrasEditor } from './ExtrasEditor'
import { ClientField, QtyStepper, TitleField } from './fields'
import { useRooms, WarningList } from './Inspector'
import { ItemsList } from './ItemsList'
import { countedUnits, designUndoLabel, useItemName, useTax, useTaxLabel } from './names'
import { PriceDriftNotice } from './PriceDriftNotice'
import { QuoteMenu } from './QuoteMenu'
import { DiscountInput } from './TotalsFooter'
import { removeWithUndo } from './useEditorWiring'
import { useQuoteActions } from './useQuoteActions'
import { IN_WORKSHOP, useQuoteWorkOrder } from './useQuoteStage'
import { ClientRequestNotice } from './ClientRequestNotice'
import { CanvasBoundary, DocumentBoundary } from './ZoneBoundary'

export function MobileEditor() {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const { number, status, revision, count, totals, units } = useEditorShallow((s) => ({
    units: countedUnits(s.doc.items, s.evaluation.items),
    number: s.meta.number,
    status: s.meta.status,
    revision: s.meta.revision,
    count: s.doc.items.length,
    totals: s.evaluation.totals,
  }))
  const sheet = useEditorUi((s) => s.mobileSheet)
  const setUi = useEditorUi((s) => s.set)
  const letter = revisionLetter(revision)
  const botMinimized = useAssistantPanelState() === 'minimized'
  const { order } = useQuoteWorkOrder()

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
        <header className="px-4 pt-2 pb-2">
          <div className="flex h-11 items-center justify-between gap-2">
            <Link to="/cotizaciones" className="-ml-2 inline-flex h-11 items-center gap-0.5 rounded-sm pr-2 pl-1 text-base text-fg-muted">
              <ChevronLeft aria-hidden strokeWidth={1.75} className="size-5" />
              {t('mobile.back')}
            </Link>
            <div className="flex items-center gap-1">
              <HistoryButtons size="md" />
              <QuoteMenu />
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="code-id text-table whitespace-nowrap text-fg-muted">{t('header.number', { number })}</span>
            <StatusPill status={status} suffix={letter ? t('header.version', { letter }) : undefined} />
            {order ? <WorkOrderLink order={order} /> : null}
            <EditorSaveIndicator className="ml-auto" />
          </div>
          <TitleField size="lg" className="mt-2" />
          <ClientField className="mt-3" />
          <ClientRequestNotice variant="card" className="mt-3" />
          <PriceDriftNotice variant="card" className="mt-3" />
        </header>

        {/* Con el asistente minimizado (su cara flota sobre la barra de totales) la lista deja espacio abajo. */}
        <div className={cn('px-3 pt-4', botMinimized ? 'pb-24' : 'pb-6')}>
          <div className="mb-1 flex items-baseline justify-between px-1">
            <h2 className="text-base font-medium text-fg-strong">{t('mobile.windows')}</h2>
            {count ? (
              <span className="text-meta tabular text-fg-muted">{t('totals.unitsArea', { units: g.count('pieces', units), area: fmt.area(totals.area) })}</span>
            ) : null}
          </div>
          {count ? (
            <ItemsList variant="cards" onOpenItem={() => setUi({ mobileSheet: 'item' })} />
          ) : (
            <div className="px-1 py-6">
              <p className="text-base font-medium text-fg-strong">{t('mobile.emptyTitle')}</p>
              <p className="mt-1 text-table text-fg-muted">{t('mobile.emptyBody')}</p>
            </div>
          )}
          <Button variant={count ? 'secondary' : 'primary'} size="lg" icon={Plus} className="mt-3 w-full" onClick={() => setUi({ pickerOpen: true })}>
            {t('items.add')}
          </Button>
          {count ? (
            <Button variant="ghost" size="lg" icon={FileText} className="mt-1 w-full" onClick={() => setUi({ mobileSheet: 'document' })}>
              {t('mobile.viewDocument')}
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
  const t = useT(es)
  const fmt = useFormat()
  const tax = useTaxLabel()
  const total = useEditorShallow((s) => ({ t: s.evaluation.totals.total })).t
  const actions = useQuoteActions()
  const { order, status } = useQuoteWorkOrder()
  const empty = useEditorShallow((s) => ({ e: s.doc.items.length === 0 })).e
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-divider bg-canvas px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start text-left" aria-label={t('mobile.seeTotals')}>
        <span className="inline-flex items-center gap-1 text-meta text-fg-muted">
          {t('mobile.total', { tax })} <ChevronUp aria-hidden strokeWidth={2} className="size-3" />
        </span>
        <Flash trigger={total} className="-mx-1 px-1">
          <Numeric kind="money" size="lg" className="text-fg-strong">
            {fmt.money(total)}
          </Numeric>
        </Flash>
      </button>
      {order ? (
        <Button variant="primary" size="lg" icon={Factory} onClick={() => actions.openWorkOrder(order)}>
          {t('mobile.order', { number: order.number })}
        </Button>
      ) : status === 'accepted' || IN_WORKSHOP.includes(status) ? (
        <Button variant="primary" size="lg" icon={Factory} onClick={() => void actions.toWorkshop()} loading={actions.busy === 'workshop'}>
          {t('mobile.toWorkshop')}
        </Button>
      ) : (
        <Button variant={empty ? 'secondary' : 'primary'} size="lg" icon={Send} onClick={actions.openSend}>
          {t('mobile.send')}
        </Button>
      )}
    </div>
  )
}

function ItemSheet() {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const rooms = useRooms()
  const itemName = useItemName()
  const editor = useEditor()
  const setUi = useEditorUi((s) => s.set)
  const { item, evaluated } = useSelectedItem()
  const { catalog, selectedNodeId } = useEditorShallow((s) => ({ catalog: s.catalog, selectedNodeId: s.selectedNodeId }))
  if (!item) return <SheetContent side="bottom" title={t('mobile.item')}>{null}</SheetContent>
  const price = evaluated?.price
  const warnings = itemWarnings(evaluated?.bom, price?.warnings)
  const onDesign = (next: typeof item.design, label: unknown, undo?: unknown) => editor.updateDesign(item.id, () => next, designUndoLabel(label, undo, item.ref))
  return (
    <SheetContent
      side="bottom"
      title={
        <span className="flex items-baseline gap-2">
          <span className="code-id">{item.ref}</span>
          <span className="font-normal text-fg-muted">{itemName(item)}</span>
        </span>
      }
      description={<span className="dim">{fmt.size(item.design.width, item.design.height)}</span>}
      footer={
        <div className="flex w-full items-center gap-2">
          <IconButton icon={Copy} variant="secondary" label={t('inspector.duplicate')} onClick={() => editor.duplicateItem(item.id)} />
          <IconButton
            icon={Trash2}
            variant="secondary"
            label={t('inspector.remove')}
            onClick={() => {
              setUi({ mobileSheet: null })
              removeWithUndo(editor, item.id)
            }}
          />
          <div className="ml-auto text-right">
            <div className="text-meta text-fg-muted">{item.qty > 1 ? t('mobile.each', { qty: g.count('pieces', item.qty), price: fmt.money(price?.unitNet ?? 0) }) : t('mobile.net')}</div>
            <div className="text-base font-medium tabular text-fg-strong">{fmt.money(price?.totalNet ?? 0)}</div>
          </div>
        </div>
      }
    >
      <div className="relative -mx-5 -mt-5 mb-4 h-[320px] overflow-hidden bg-sunken" data-quote-canvas>
        <div className="absolute inset-0">
          <CanvasBoundary>
            <DesignCanvas
              key={item.id}
              design={item.design}
              catalog={catalog}
              onChange={onDesign}
              selectedNodeId={selectedNodeId}
              onSelect={(id) => editor.selectNode(id)}
              className="h-full w-full bg-sunken!"
            />
          </CanvasBoundary>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-[auto_1fr] items-end gap-3">
        <div>
          <div className="mb-1.5 text-table font-medium text-fg">{t('inspector.qty')}</div>
          <QtyStepper value={item.qty} onChange={(qty) => editor.setQty(item.id, qty)} label={t('qty.label', { ref: item.ref })} size="md" />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-table font-medium text-fg">{t('inspector.room')}</span>
          <Input
            list="fz-rooms-m"
            value={item.location ?? ''}
            maxLength={QUOTE_LIMITS.itemLocation}
            placeholder={t('inspector.roomPlaceholder')}
            onChange={(e) => editor.updateItem(item.id, { location: e.target.value }, ql('history.room', { ref: item.ref }))}
            className="[&::-webkit-calendar-picker-indicator]:hidden"
          />
          <datalist id="fz-rooms-m">
            {rooms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
      </div>
      <WindowSettings design={item.design} catalog={catalog} onChange={onDesign} selectedNodeId={selectedNodeId} />
      <MatchOthers className="mt-4" />
      {warnings.length ? (
        <div className="mt-4">
          <WarningList warnings={warnings} itemId={item.id} itemRef={item.ref} />
        </div>
      ) : null}
    </SheetContent>
  )
}

/** El documento que verá el cliente, con su diseño, idioma y textos editables (también en el teléfono). */
function DocumentSheet() {
  const t = useT(es)
  const actions = useQuoteActions()
  const setUi = useEditorUi((s) => s.set)
  return (
    <SheetContent
      side="bottom"
      title={t('mobile.document')}
      className="h-[85dvh]"
      footer={
        <div className="flex w-full flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2">
            <TemplateGalleryButton block />
            <DocumentLanguagePicker block />
          </div>
          <div className="flex items-center gap-2">
            <IconButton icon={Download} variant="secondary" label={t('doc.pdf')} onClick={() => void actions.downloadPdf()} />
            <Button
              variant="primary"
              icon={Send}
              className="flex-1"
              onClick={() => {
                setUi({ mobileSheet: null })
                actions.openSend()
              }}
            >
              {t('mobile.send')}
            </Button>
          </div>
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
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const tax = useTax()
  const session = useSession()
  const { totals, pricing, units } = useEditorShallow((s) => ({ totals: s.evaluation.totals, pricing: s.evaluation.pricing, units: countedUnits(s.doc.items, s.evaluation.items) }))
  const actions = useQuoteActions()
  const { order } = useQuoteWorkOrder()
  const row = 'flex items-center justify-between gap-3 py-2.5 text-base'
  return (
    <SheetContent side="bottom" title={t('mobile.totals')}>
      <dl className="divide-y divide-divider">
        <div className={row}>
          <dt className="text-fg-muted">{t('totals.net')}</dt>
          <dd className="tabular text-fg">{fmt.money(totals.subtotal)}</dd>
        </div>
        <div className={row}>
          <dt className="flex items-center gap-2 text-fg-muted">
            {t('totals.discount')} <DiscountInput className="w-24" />
          </dt>
          <dd className="tabular text-fg">{fmt.money(totals.discount ? -totals.discount : 0)}</dd>
        </div>
        <div className="py-2.5">
          <div className="mb-2 flex items-center justify-between text-base">
            <span className="text-fg-muted">{t('totals.extras')}</span>
            <span className="tabular text-fg">{fmt.money(totals.extras)}</span>
          </div>
          <ExtrasEditor />
        </div>
        <div className={row}>
          <dt className="text-fg-muted">{t('totals.tax', { tax: tax.label, pct: fmt.pct(pricing.ivaPct, 1) })}</dt>
          <dd className="tabular text-fg">{fmt.money(totals.iva)}</dd>
        </div>
        <div className={cn(row, 'font-medium')}>
          <dt className="text-fg-strong">{t('totals.total', { tax: tax.inline })}</dt>
          <dd>
            <Numeric kind="money" size="lg" className="text-fg-strong">
              {fmt.money(totals.total)}
            </Numeric>
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-meta tabular text-fg-muted">
        {t('totals.unitsArea', { units: g.count('pieces', units), area: fmt.area(totals.area) })}
        {session.role === 'owner' && totals.subtotal > 0 ? ` · ${t('mobile.margin', { pct: fmt.pct(totals.marginPct, 1) })}` : ''}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button size="lg" icon={Download} onClick={() => void actions.downloadPdf()} loading={actions.busy === 'pdf'}>
          {t('mobile.pdf')}
        </Button>
        {order ? (
          <Button size="lg" icon={Factory} onClick={() => actions.openWorkOrder(order)}>
            {t('header.viewOrder', { number: order.number })}
          </Button>
        ) : (
          <Button size="lg" icon={Factory} onClick={() => void actions.toWorkshop()} loading={actions.busy === 'workshop'}>
            {t('mobile.toWorkshop')}
          </Button>
        )}
        <Button variant="primary" size="lg" icon={Send} className="col-span-2" onClick={actions.openSend}>
          {t('header.send')}
        </Button>
      </div>
    </SheetContent>
  )
}
