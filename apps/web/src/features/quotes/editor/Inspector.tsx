/**
 * Inspector derecho. «Esta ventana»: cantidad, el paño elegido y lo esencial siempre a mano (medidas,
 * tipología, línea, color y vidrio); accesorios, forma, referencia y ubicación, nota y precio quedan
 * plegados al final con su estado a la vista. «Toda la cotización»: dirección, condiciones comerciales,
 * extras, documento y notas internas.
 */
import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, Copy, Lock, Trash2 } from 'lucide-react'
import { explainPrice, type PricingSettings, type Warning } from '@dekopen/engine'
import { MARGIN_LIMITS } from '@dekopen/shared'
import type { QuoteItem } from '@dekopen/shared'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import {
  Field,
  Flash,
  IconButton,
  Inspector as InspectorPanel,
  InspectorFooter,
  InspectorHeader,
  InspectorSection,
  Input,
  MoneyField,
  Notice,
  Numeric,
  SegmentedControl,
  Switch,
  Textarea,
} from '../../../ui'
import { nodeTitle, NodeInspector, WindowSettings } from '../../designer'
import { Fold } from '../../designer/parts/Fold'
import { MeasureField } from '../../designer/parts/MeasureField'
import es from '../i18n/es'
import { QUOTE_LIMITS } from '../model/doc'
import { itemWarnings } from '../model/evaluate'
import { ql } from '../model/history'
import { AllWindowsSection, MatchOthers } from './ApplyToAll'
import { useEditor, useEditorShallow, useEditorState, useEditorUi, useEditorUiApi, useSelectedItem } from './context'
import { DocumentLanguagePicker } from './DocumentPreview'
import { ExtrasEditor } from './ExtrasEditor'
import { PendingPricePanel } from './PendingPricePanel'
import { TemplateGalleryButton } from './TemplateGallery'
import { QtyStepper } from './fields'
import { designUndoLabel, useItemName, useTaxLabel } from './names'
import { toastUndo } from './toasts'
import { duplicateAndFocus } from './useEditorWiring'

/** Claves de los ambientes sugeridos (el texto sale del idioma de la interfaz). */
export const ROOM_KEYS = ['living', 'dining', 'kitchen', 'master', 'bedroom', 'bathroom', 'laundry', 'hall', 'study', 'terrace', 'entrance', 'stairs', 'storage'] as const

/** Ambientes sugeridos en el idioma actual (para el `<datalist>` del campo Ambiente). */
export function useRooms(): string[] {
  const t = useT(es)
  return ROOM_KEYS.map((key) => t(`rooms.${key}`))
}

export function Inspector({ className }: { className?: string }) {
  const t = useT(es)
  const tab = useEditorUi((s) => s.inspectorTab)
  const setUi = useEditorUi((s) => s.set)
  const hasItem = useEditorState((s) => !!s.selectedItemId)
  const active = hasItem ? tab : 'quote'
  return (
    <InspectorPanel aria-label={t('inspector.aria')} className={cn('min-h-0', className)}>
      <div className="flex h-12 shrink-0 items-center px-3">
        <SegmentedControl
          block
          size="sm"
          aria-label={t('inspector.tabs')}
          value={active}
          onValueChange={(v) => setUi({ inspectorTab: v })}
          options={[
            { value: 'item', label: t('inspector.tabItem'), disabled: !hasItem },
            { value: 'quote', label: t('inspector.tabQuote') },
          ]}
        />
      </div>
      {active === 'item' ? <ItemInspector withFooter /> : <QuoteInspector className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto" />}
    </InspectorPanel>
  )
}

export function ItemInspector({ compact = false, withFooter = false }: { compact?: boolean; withFooter?: boolean }) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const tax = useTaxLabel()
  const rooms = useRooms()
  const itemName = useItemName()
  const editor = useEditor()
  const ui = useEditorUiApi()
  const { item, evaluated } = useSelectedItem()
  const { catalog, selectedNodeId } = useEditorShallow((s) => ({ catalog: s.catalog, selectedNodeId: s.selectedNodeId }))
  if (!item) return null
  const price = evaluated?.price
  const warnings = itemWarnings(evaluated?.bom, price?.warnings)
  const manual = item.manualUnitPrice !== undefined
  const line = catalog.lines.find((l) => l.id === item.design.lineId)
  const typology = itemName({ design: item.design })
  const onDesign = (next: typeof item.design, label: unknown, undo?: unknown) => editor.updateDesign(item.id, () => next, designUndoLabel(label, undo, item.ref))

  const remove = () => {
    const removed = editor.removeItem(item.id)
    if (removed) toastUndo(t('inspector.removed', { ref: removed.ref }), () => editor.undo())
  }

  const body = (
    <>
      <InspectorHeader
        title={item.name?.trim() || typology}
        description={[item.name?.trim() ? typology : null, line?.name].filter(Boolean).join(' · ') || undefined}
        className="pt-1 pb-1"
        actions={
          compact ? undefined : (
            <>
              <IconButton size="sm" icon={Copy} shortcut="d" aria-keyshortcuts="D" label={t('inspector.duplicate')} onClick={() => duplicateAndFocus(editor, ui, item.id)} />
              <IconButton size="sm" icon={Trash2} shortcut="delete" aria-keyshortcuts="Delete" label={t('inspector.remove')} onClick={remove} />
            </>
          )
        }
      />
      <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-3">
        <span className="text-table text-fg">{t('inspector.qty')}</span>
        <QtyStepper value={item.qty} onChange={(qty) => editor.setQty(item.id, qty)} label={t('qty.label', { ref: item.ref })} />
      </div>

      {/* Lo que falta para tener precio va arriba: con esta ventana abierta es lo primero por resolver. */}
      {price?.pending?.length ? (
        <PendingPricePanel
          key={item.id}
          pending={price.pending}
          warnings={warnings}
          partial={price.unitNet > 0}
          tax={t('price.suffix', { tax })}
          onManualPrice={(manualUnitPrice) => editor.updateItem(item.id, { manualUnitPrice }, ql('history.manualPrice', { ref: item.ref }))}
        />
      ) : null}

      {/* El paño elegido en el dibujo manda: sus ajustes van arriba, sin tener que desplazarse hasta el final. */}
      {selectedNodeId ? (
        <InspectorSection
          title={nodeTitle(item.design, selectedNodeId)}
          className="border-b border-divider"
          bodyClassName="gap-0 pb-0"
          actions={
            <button type="button" onClick={() => editor.selectNode(null)} className="rounded-xs px-1.5 py-0.5 text-table font-medium text-accent-ink hover:bg-accent-subtle">
              {t('inspector.nodeDone')}
            </button>
          }
        >
          <NodeInspector design={item.design} catalog={catalog} nodeId={selectedNodeId} onChange={onDesign} />
        </InspectorSection>
      ) : null}

      <InspectorSection bodyClassName="gap-0 pt-3 pb-1">
        <WindowSettings
          design={item.design}
          catalog={catalog}
          onChange={onDesign}
          selectedNodeId={selectedNodeId}
          below={
            <>
              <MatchOthers className="mb-4" />
              {warnings.length ? (
                <div className="mb-4">
                  <h3 className="mb-2 text-table font-medium text-fg-strong">{t('inspector.warnings', { count: warnings.length })}</h3>
                  <WarningList warnings={warnings} itemId={item.id} itemRef={item.ref} />
                </div>
              ) : null}
            </>
          }
          folds={
            <>
              <Fold title={t('inspector.identity')} summary={[item.ref, item.name?.trim(), item.location?.trim(), item.floor?.trim()].filter(Boolean).join(' · ')}>
                <div className="grid grid-cols-[72px_1fr] gap-2">
                  <RefInput key={item.id} value={item.ref} onCommit={(ref) => editor.updateItem(item.id, { ref }, ql('history.ref', { from: item.ref, to: ref }))} />
                  <Input
                    aria-label={t('inspector.name')}
                    placeholder={t('inspector.namePlaceholder')}
                    title={t('inspector.name')}
                    maxLength={QUOTE_LIMITS.itemName}
                    value={item.name ?? ''}
                    onChange={(e) => editor.updateItem(item.id, { name: e.target.value }, ql('history.name', { ref: item.ref }))}
                  />
                </div>
                <Field label={t('inspector.room')}>
                  <Input
                    list="fz-rooms"
                    className="[&::-webkit-calendar-picker-indicator]:hidden"
                    placeholder={t('inspector.roomPlaceholder')}
                    maxLength={QUOTE_LIMITS.itemLocation}
                    value={item.location ?? ''}
                    onChange={(e) => editor.updateItem(item.id, { location: e.target.value }, ql('history.room', { ref: item.ref }))}
                  />
                </Field>
                <datalist id="fz-rooms">
                  {rooms.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                <Field label={t('inspector.floor')} optional>
                  <Input
                    placeholder={t('inspector.floorPlaceholder')}
                    maxLength={QUOTE_LIMITS.itemFloor}
                    value={item.floor ?? ''}
                    onChange={(e) => editor.updateItem(item.id, { floor: e.target.value }, ql('history.floor', { ref: item.ref }))}
                  />
                </Field>
                <Field label={t('inspector.rough')} hint={t('inspector.roughHint')} optional>
                  <div className="grid grid-cols-2 gap-2">
                    <MeasureField value={item.rough?.width ?? null} onChange={(v) => editor.updateItem(item.id, { rough: { ...item.rough, width: v ?? undefined } }, ql('history.rough', { ref: item.ref }))} unit="mm" min={0} max={100000} step={10} bigStep={100} decimals={0} aria-label={t('inspector.roughWidth')} />
                    <MeasureField value={item.rough?.height ?? null} onChange={(v) => editor.updateItem(item.id, { rough: { ...item.rough, height: v ?? undefined } }, ql('history.rough', { ref: item.ref }))} unit="mm" min={0} max={100000} step={10} bigStep={100} decimals={0} aria-label={t('inspector.roughHeight')} />
                  </div>
                </Field>
              </Fold>

              <Fold title={t('inspector.note')} summary={item.notes?.trim()}>
                <Textarea
                  rows={2}
                  aria-label={t('inspector.note')}
                  placeholder={t('inspector.notePlaceholder')}
                  maxLength={QUOTE_LIMITS.itemNotes}
                  value={item.notes ?? ''}
                  onChange={(e) => editor.updateItem(item.id, { notes: e.target.value }, ql('history.note', { ref: item.ref }))}
                  className="min-h-16"
                />
              </Fold>

              <Fold title={t('inspector.price')} summary={manual ? t('price.manual') : item.discountPct ? `−${fmt.pct(item.discountPct, 1)}` : undefined}>
                <PriceCard unitNet={price?.unitNet ?? 0} manual={manual} calculated={price?.calculatedUnitNet ?? price?.unitNet ?? 0} />
                <div>
                  <Switch
                    label={t('price.manualSwitch')}
                    description={manual ? t('price.manualOn', { price: fmt.money(price?.calculatedUnitNet ?? 0) }) : undefined}
                    checked={manual}
                    onCheckedChange={(on) =>
                      editor.updateItem(item.id, { manualUnitPrice: on ? (price?.unitNet ?? 0) : undefined }, on ? ql('history.manualOn', { ref: item.ref }) : ql('history.manualOff', { ref: item.ref }))
                    }
                  />
                  {manual ? (
                    <MoneyField
                      className="mt-2.5 w-full"
                      value={item.manualUnitPrice ?? 0}
                      onChange={(v) => editor.updateItem(item.id, { manualUnitPrice: v ?? 0 }, ql('history.manualPrice', { ref: item.ref }))}
                      suffix={t('price.suffix', { tax })}
                      aria-label={t('price.fieldAria', { ref: item.ref })}
                    />
                  ) : null}
                </div>
                <Field label={t('inspector.lineDiscount')} hint={item.discountPct ? t('inspector.lineDiscountHint', { price: fmt.money(price?.lineDiscount ?? 0) }) : undefined} optional>
                  <MeasureField value={item.discountPct ?? null} onChange={(v) => editor.updateItem(item.id, { discountPct: v ?? undefined }, ql('history.lineDiscount', { ref: item.ref }))} unit="%" min={0} max={100} step={1} bigStep={5} decimals={1} aria-label={t('inspector.lineDiscount')} className="w-32" />
                </Field>
                <LineChoice item={item} />
                {price ? <PriceExplanation price={price} /> : null}
              </Fold>
            </>
          }
        />
      </InspectorSection>
    </>
  )

  if (!withFooter) return <div>{body}</div>
  return (
    <>
      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">{body}</div>
      <InspectorFooter className="flex h-14 items-center justify-between gap-3 py-0">
        <span className="min-w-0 text-table text-fg-muted">
          {item.qty === 1 ? t('inspector.footerOne') : t('inspector.footerEach', { qty: g.count('pieces', item.qty), price: fmt.money(price?.unitNet ?? 0) })}
        </span>
        <Flash trigger={price?.totalNet ?? 0} className="-mx-1 px-1">
          <Numeric kind="money" size="lg" className="text-fg-strong" aria-label={t('inspector.footerLabel')}>
            {fmt.money(price?.totalNet ?? 0)}
          </Numeric>
        </Flash>
      </InspectorFooter>
    </>
  )
}

/** Si la ventana cuenta siempre, es opcional o es una alternativa de otra. Lo que no cuenta no suma ni se fabrica. */
function LineChoice({ item }: { item: QuoteItem }) {
  const t = useT(es)
  const editor = useEditor()
  const role = item.role ?? 'base'
  const items = useEditorState((s) => s.doc.items)
  const groups = [...new Set(items.map((i) => i.altGroup).filter((g): g is string => Boolean(g)))]
  const label = ql('history.lineRole', { ref: item.ref })
  return (
    <>
      <Field label={t('inspector.role')}>
        <SegmentedControl
          aria-label={t('inspector.role')}
          size="sm"
          block
          value={role}
          onValueChange={(next) => editor.updateItem(item.id, next === 'base' ? { role: undefined, altGroup: undefined, included: undefined } : { role: next }, label)}
          options={(['base', 'optional', 'alternative'] as const).map((v) => ({ value: v, label: t(`inspector.roles.${v}`) }))}
        />
      </Field>
      {role === 'optional' ? <Switch size="sm" label={t('inspector.includedOptional')} checked={Boolean(item.included)} onCheckedChange={(included) => editor.updateItem(item.id, { included: included || undefined }, label)} /> : null}
      {role === 'alternative' ? (
        <>
          <Field label={t('inspector.altGroup')} hint={t('inspector.altGroupHint')}>
            <Input list="fz-alt-groups" maxLength={QUOTE_LIMITS.altGroup} value={item.altGroup ?? ''} onChange={(e) => editor.updateItem(item.id, { altGroup: e.target.value }, label)} className="[&::-webkit-calendar-picker-indicator]:hidden" />
          </Field>
          <datalist id="fz-alt-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <Switch size="sm" label={t('inspector.includedAlternative')} checked={Boolean(item.included)} onCheckedChange={(included) => editor.updateItem(item.id, { included: included || undefined }, label)} />
        </>
      ) : null}
    </>
  )
}

function RefInput({ value, onCommit }: { value: string; onCommit: (ref: string) => void }) {
  const t = useT(es)
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const next = (draft ?? '').trim().slice(0, QUOTE_LIMITS.ref)
    if (draft !== null && next && next !== value) onCommit(next)
    setDraft(null)
  }
  return (
    <Input
      aria-label={t('inspector.ref')}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
      className="code-id text-center font-medium"
    />
  )
}

function PriceCard({ unitNet, manual, calculated }: { unitNet: number; manual: boolean; calculated: number }) {
  const t = useT(es)
  const fmt = useFormat()
  return (
    <div>
      <div className="text-meta text-fg-muted">{manual ? t('price.manual') : t('price.unit')}</div>
      <div className="figure mt-0.5 flex items-center gap-1.5 text-h3 font-medium text-fg-strong">
        {fmt.money(unitNet)}
        {manual ? <Lock aria-label={t('price.manualAria')} strokeWidth={1.75} className="size-4 text-fg-muted" /> : null}
      </div>
      {manual && calculated !== unitNet ? <div className="text-meta tabular text-fg-muted line-through decoration-fg-faint">{fmt.money(calculated)}</div> : null}
    </div>
  )
}

function PriceExplanation({ price }: { price: Parameters<typeof explainPrice>[0] }) {
  const t = useT(es)
  const fmt = useFormat()
  const session = useSession()
  const [open, setOpen] = useState(false)
  const canSeeCosts = session.role === 'owner'
  const lines = explainPrice(price)
  const visible = canSeeCosts ? lines : lines.filter((l) => l.kind === 'total')
  if (!visible.length) return null
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-mx-1 inline-flex items-center gap-1 rounded-xs px-1 py-0.5 text-table font-medium text-accent-ink hover:bg-accent-subtle"
      >
        {t('price.explain')}
        <ChevronDown aria-hidden strokeWidth={2} className={cn('size-3.5 transition-transform duration-140 ease-out', open && 'rotate-180')} />
      </button>
      {open ? (
        <dl className="fz-rise mt-2 space-y-1 text-table">
          {visible.map((line, i) => (
            <div
              key={i}
              className={cn(
                'flex items-baseline justify-between gap-3',
                line.kind === 'subtotal' && 'mt-1 border-t border-divider pt-1.5 font-medium text-fg-strong',
                line.kind === 'total' && 'mt-1 border-t border-divider-strong pt-1.5 font-medium text-fg-strong',
                line.kind === 'part' && 'text-fg-muted',
              )}
            >
              <dt className="min-w-0">{line.label}</dt>
              <dd className="shrink-0 tabular">{fmt.money(line.amount)}</dd>
            </div>
          ))}
          {canSeeCosts && price.marginPct !== undefined ? <p className="pt-1.5 text-meta text-fg-muted">{t('price.margin', { pct: fmt.pct(price.marginPct, 1) })}</p> : null}
        </dl>
      ) : null}
    </div>
  )
}

/** Avisos del motor en el idioma de la interfaz (por código), con su corrección en un clic. */
export function WarningList({ warnings, itemId, itemRef }: { warnings: Warning[]; itemId: string; itemRef: string }) {
  const g = useGlossary()
  const editor = useEditor()
  return (
    <ul className="space-y-2">
      {warnings.map((w, i) => {
        const fix = w.fix
        const fixLabel = fix ? (g.warningFix(w) ?? fix.label) : undefined
        const message = g.warning(w)
        return (
          <li key={`${w.code}-${i}`}>
            <Notice
              size="compact"
              tone={w.level === 'error' ? 'danger' : w.level === 'warn' ? 'warning' : 'neutral'}
              action={
                fix ? (
                  <button
                    type="button"
                    onClick={() => editor.updateDesign(itemId, (d) => ({ ...d, ...fix.patch }), ql('history.fix', { fix: fixLabel ?? fix.label, ref: itemRef }))}
                    className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-divider-strong bg-surface px-2.5 text-table font-medium text-fg-strong transition-colors duration-100 hover:bg-hover"
                  >
                    <Check aria-hidden strokeWidth={2} className="size-3.5 text-accent-ink" />
                    {fixLabel}
                  </button>
                ) : undefined
              }
            >
              {w.nodeId ? (
                <button type="button" onClick={() => editor.selectNode(w.nodeId ?? null)} className="text-left hover:underline">
                  {message}
                </button>
              ) : (
                message
              )}
            </Notice>
          </li>
        )
      })}
    </ul>
  )
}

function Section({ title, children, aside, className }: { title?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <InspectorSection title={title} actions={aside} className={className}>
      {children}
    </InspectorSection>
  )
}

export function QuoteInspector({ className }: { className?: string }) {
  const t = useT(es)
  const fmt = useFormat()
  const editor = useEditor()
  const session = useSession()
  const { discountPct, notes, pricing, settings, siteAddress, validity } = useEditorShallow((s) => ({
    discountPct: s.doc.discountPct,
    siteAddress: s.doc.siteAddress,
    notes: s.doc.notes,
    pricing: s.doc.pricing,
    settings: s.settings,
    validity: s.doc.documentOverrides?.validityDays,
  }))
  const orgMargin = settings.pricing?.marginPct ?? 40
  const orgMode = settings.pricing?.marginMode ?? 'margin'
  // El motor aplica el valor según la forma de calcular la ganancia (margen sobre la venta o
  // recargo sobre el costo): el campo dice cuál es y la guarda junto al valor de esta cotización.
  const marginMode = pricing?.marginMode ?? orgMode
  const isMarkup = marginMode === 'markup'
  const sameAsOrg = (v: number) => v === orgMargin && marginMode === orgMode
  const canSeeCosts = session.role === 'owner'
  const marginLabel = isMarkup ? ql('history.markup') : ql('history.margin')
  // 0 = el taller no definió vigencia: el campo queda vacío, no se supone ninguna.
  const orgValidity = settings.documents?.validityDays || null
  return (
    <div className={className}>
      <Section title={t('quote.site')}>
        <Input
          placeholder={t('quote.sitePlaceholder')}
          aria-label={t('quote.site')}
          maxLength={QUOTE_LIMITS.siteAddress}
          value={siteAddress ?? ''}
          onChange={(e) => editor.setSiteAddress(e.target.value)}
        />
      </Section>
      <Section title={t('quote.terms')}>
        <TermRow label={t('quote.discount')}>
          <MeasureField value={discountPct} onChange={(v) => editor.setDiscount(v ?? 0)} unit="%" min={0} max={100} step={1} bigStep={5} decimals={1} aria-label={t('quote.discountAria')} className="w-28" />
        </TermRow>
        {canSeeCosts ? (
          <TermRow
            label={isMarkup ? t('quote.markupTitle') : t('quote.marginTitle')}
            note={
              pricing?.marginPct !== undefined ? (
                <button type="button" className="text-left text-meta font-medium text-accent-ink hover:underline" onClick={() => editor.setPricing(omitMargin(pricing), marginLabel)}>
                  {orgMode === 'markup' ? t('quote.useMarkup', { pct: fmt.pct(orgMargin, 1) }) : t('quote.useMargin', { pct: fmt.pct(orgMargin, 1) })}
                </button>
              ) : (
                <span className="text-meta text-fg-muted">{t('quote.fromSettings')}</span>
              )
            }
          >
            <MeasureField
              value={pricing?.marginPct ?? orgMargin}
              // Más de 95 % de margen no existe: pasa a recargo sobre el costo, que es lo que se está pidiendo.
              onChange={(v) => editor.setPricing(v === null || sameAsOrg(v) ? omitMargin(pricing) : { ...pricing, marginPct: v, marginMode: v > MARGIN_LIMITS.margin ? 'markup' : marginMode }, marginLabel)}
              unit="%"
              min={0}
              max={QUOTE_LIMITS.marginPct}
              step={1}
              bigStep={5}
              decimals={1}
              aria-label={isMarkup ? t('quote.markupAria') : t('quote.marginAria')}
              className="w-28"
            />
          </TermRow>
        ) : null}
        <TermRow label={t('quote.validity')}>
          <MeasureField
            value={validity ?? orgValidity}
            onChange={(v) => editor.setDocumentOverride({ validityDays: v === null || v === orgValidity ? null : Math.round(v) }, ql('history.validity'))}
            unit={t('quote.validityUnit')}
            min={1}
            max={365}
            step={1}
            bigStep={5}
            decimals={0}
            aria-label={t('quote.validityAria')}
            className="w-28"
          />
        </TermRow>
      </Section>
      <Section title={t('quote.extras')}>
        <ExtrasEditor />
      </Section>
      <Section title={t('quote.document')}>
        <TemplateGalleryButton className="w-full" block />
        <DocumentLanguagePicker className="w-full" block />
        <button
          type="button"
          onClick={() => editor.setView('document')}
          className="-mx-1 inline-flex w-fit items-center gap-1 rounded-xs px-1 py-0.5 text-table font-medium text-accent-ink hover:bg-accent-subtle"
        >
          {t('quote.documentCustomize')}
        </button>
      </Section>
      <Section title={t('quote.notes')}>
        <Textarea rows={3} placeholder={t('quote.notesPlaceholder')} maxLength={QUOTE_LIMITS.notes} value={notes ?? ''} onChange={(e) => editor.setNotes(e.target.value)} />
      </Section>
      <AllWindowsSection />
    </div>
  )
}

/** Condición comercial: nombre a la izquierda, cifra a la derecha, todas alineadas. */
function TermRow({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
      <span className="text-table text-fg">{label}</span>
      {children}
      {note ? <div className="col-span-2">{note}</div> : null}
    </div>
  )
}

/** Quita el margen propio de la cotización (valor y forma de calcularlo): vuelve el de tus ajustes. */
function omitMargin(pricing: Partial<PricingSettings> | undefined): Partial<PricingSettings> | undefined {
  if (!pricing) return undefined
  const { marginPct: _pct, marginMode: _mode, ...rest } = pricing
  return Object.keys(rest).length ? rest : undefined
}
