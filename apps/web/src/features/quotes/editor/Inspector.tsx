/**
 * Inspector derecho: la ventana seleccionada (línea, color, vidrio, paño, cantidad, ambiente,
 * notas, precio manual, desglose y avisos) y la cotización (descuento, extras, margen, notas).
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, CircleAlert, Copy, Info, Lock, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { explainPrice, formatCLP, formatPct, type PricingSettings, type Warning } from '@framezen/engine'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { Field, IconButton, Input, MoneyField, SegmentedControl, Switch, Textarea } from '../../../ui'
import { MeasureField } from '../../designer/parts/MeasureField'
import { toastUndo } from './toasts'
import { NodeInspector, WindowSettings } from '../../designer'
import { QUOTE_LIMITS } from '../model/doc'
import { itemWarnings } from '../model/evaluate'
import { useEditor, useEditorShallow, useEditorState, useSelectedItem } from './context'
import { AllWindowsSection, MatchOthers } from './ApplyToAll'
import { ExtrasEditor } from './ExtrasEditor'
import { QtyStepper } from './fields'

export const ROOMS = ['Living', 'Comedor', 'Cocina', 'Dormitorio principal', 'Dormitorio', 'Baño', 'Logia', 'Pasillo', 'Escritorio', 'Terraza', 'Acceso', 'Escalera', 'Bodega']

export function Inspector({ className }: { className?: string }) {
  const [tab, setTab] = useState<'item' | 'quote'>('item')
  const hasItem = useEditorState((s) => !!s.selectedItemId)
  const active = hasItem ? tab : 'quote'
  return (
    <aside aria-label="Inspector" className={cn('flex min-h-0 flex-col border-l border-paper-200 bg-paper-0', className)}>
      <div className="flex h-12 shrink-0 items-center border-b border-paper-200 px-3">
        <SegmentedControl
          block
          size="sm"
          aria-label="Qué editar"
          value={active}
          onValueChange={setTab}
          options={[
            { value: 'item', label: 'Ventana', disabled: !hasItem },
            { value: 'quote', label: 'Cotización' },
          ]}
        />
      </div>
      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">{active === 'item' ? <ItemInspector /> : <QuoteInspector />}</div>
    </aside>
  )
}

function Section({ title, children, aside, className }: { title?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-paper-200 px-4 py-4 last:border-b-0', className)}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-paper-900">{title}</h3>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function ItemInspector({ compact = false }: { compact?: boolean }) {
  const editor = useEditor()
  const { item, evaluated } = useSelectedItem()
  const { catalog, selectedNodeId } = useEditorShallow((s) => ({ catalog: s.catalog, selectedNodeId: s.selectedNodeId }))
  if (!item) return null
  const price = evaluated?.price
  const warnings = itemWarnings(evaluated?.bom, price?.warnings)
  const manual = item.manualUnitPrice !== undefined

  const remove = () => {
    const removed = editor.removeItem(item.id)
    if (removed) toastUndo(`Eliminaste la ${removed.ref}.`, () => editor.undo())
  }

  return (
    <div>
      <Section className="pb-3">
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-[64px_1fr] gap-2">
            <RefInput key={item.id} value={item.ref} onCommit={(ref) => editor.updateItem(item.id, { ref }, `Referencia ${item.ref} → ${ref}`)} />
            <Input
              aria-label="Nombre de la ventana (opcional)"
              placeholder="Nombre"
              title="Nombre de la ventana (opcional)"
              maxLength={QUOTE_LIMITS.itemName}
              value={item.name ?? ''}
              onChange={(e) => editor.updateItem(item.id, { name: e.target.value }, `Nombre de ${item.ref}`)}
            />
          </div>
          {!compact ? (
            <div className="flex shrink-0 items-center">
              <IconButton icon={Copy} size="md" label="Duplicar ventana" shortcut="d" onClick={() => editor.duplicateItem(item.id)} />
              <IconButton icon={Trash2} size="md" label="Eliminar ventana" shortcut="delete" onClick={remove} />
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Ventana">
        <WindowSettings design={item.design} catalog={catalog} onChange={(next, label) => editor.updateDesign(item.id, () => next, label ? `${label} (${item.ref})` : undefined)} />
        <MatchOthers className="mt-4" />
      </Section>

      {selectedNodeId ? (
        <Section title="Paño seleccionado" aside={<button type="button" onClick={() => editor.selectNode(null)} className="text-[13px] text-paper-600 hover:text-paper-900">Listo</button>}>
          <NodeInspector
            design={item.design}
            catalog={catalog}
            nodeId={selectedNodeId}
            onChange={(next, label) => editor.updateDesign(item.id, () => next, label ? `${label} (${item.ref})` : undefined)}
          />
        </Section>
      ) : !compact ? (
        <p className="border-b border-paper-200 px-4 py-3 text-[13px] text-paper-600">Toca un paño en el dibujo para cambiar su apertura, dividirlo o darle otro vidrio.</p>
      ) : null}

      <Section title="En la cotización">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <Field label="Cantidad">
            <QtyStepper value={item.qty} onChange={(qty) => editor.setQty(item.id, qty)} label={`Cantidad de ${item.ref}`} size="md" />
          </Field>
          <Field label="Ambiente">
            <Input
              list="fz-rooms"
              className="[&::-webkit-calendar-picker-indicator]:hidden"
              placeholder="Living, cocina…"
              maxLength={QUOTE_LIMITS.itemLocation}
              value={item.location ?? ''}
              onChange={(e) => editor.updateItem(item.id, { location: e.target.value }, `Ambiente de ${item.ref}`)}
            />
          </Field>
        </div>
        <datalist id="fz-rooms">
          {ROOMS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <Field label="Nota para el cliente" hint="Sale en el documento, bajo esta ventana." optional className="mt-3">
          <Textarea
            rows={2}
            placeholder="Ej.: cerradura con llave por ambos lados"
            maxLength={QUOTE_LIMITS.itemNotes}
            value={item.notes ?? ''}
            onChange={(e) => editor.updateItem(item.id, { notes: e.target.value }, `Nota de ${item.ref}`)}
            className="min-h-16"
          />
        </Field>
      </Section>

      <Section title="Precio">
        <PriceCard
          unitNet={price?.unitNet ?? 0}
          totalNet={price?.totalNet ?? 0}
          qty={item.qty}
          manual={manual}
          calculated={price?.calculatedUnitNet ?? price?.unitNet ?? 0}
        />
        <div className="mt-3 rounded-md border border-paper-200 bg-paper-50 px-3 py-2.5">
          <Switch
            label="Fijar precio a mano"
            description={manual ? `El motor calcula ${formatCLP(price?.calculatedUnitNet ?? 0)} por unidad.` : 'Reemplaza el precio calculado de esta ventana.'}
            checked={manual}
            onCheckedChange={(on) =>
              editor.updateItem(
                item.id,
                { manualUnitPrice: on ? (price?.unitNet ?? 0) : undefined },
                on ? `Fijar precio de ${item.ref}` : `Volver al precio calculado (${item.ref})`,
              )
            }
          />
          {manual ? (
            <MoneyField
              className="mt-2.5 w-full"
              value={item.manualUnitPrice ?? 0}
              onChange={(v) => editor.updateItem(item.id, { manualUnitPrice: v ?? 0 }, `Precio de ${item.ref}`)}
              suffix="c/u + IVA"
              aria-label={`Precio por unidad de ${item.ref}`}
            />
          ) : null}
        </div>
        {price ? <PriceExplanation price={price} /> : null}
      </Section>

      {warnings.length ? (
        <Section title={warnings.length === 1 ? 'Un aviso' : `${warnings.length} avisos`}>
          <WarningList warnings={warnings} itemId={item.id} itemRef={item.ref} />
        </Section>
      ) : null}
    </div>
  )
}

function RefInput({ value, onCommit }: { value: string; onCommit: (ref: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const next = (draft ?? '').trim().slice(0, 20)
    if (draft !== null && next && next !== value) onCommit(next)
    setDraft(null)
  }
  return (
    <Input
      aria-label="Referencia"
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
      className="text-center font-semibold tabular"
    />
  )
}

function PriceCard({ unitNet, totalNet, qty, manual, calculated }: { unitNet: number; totalNet: number; qty: number; manual: boolean; calculated: number }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="text-meta text-paper-600">{manual ? 'Precio fijado a mano' : 'Precio por unidad'}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-h3 font-semibold tracking-[-0.01em] tabular text-paper-900">
          {formatCLP(unitNet)}
          {manual ? <Lock aria-label="Precio manual" strokeWidth={1.75} className="size-4 text-paper-600" /> : null}
        </div>
        {manual && calculated !== unitNet ? <div className="text-meta tabular text-paper-600 line-through decoration-paper-350">{formatCLP(calculated)}</div> : null}
      </div>
      {qty !== 1 ? (
        <div className="text-right">
          <div className="text-meta text-paper-600">
            {qty} {qty === 1 ? 'unidad' : 'unidades'}
          </div>
          <div className="mt-0.5 text-base font-medium tabular text-paper-900">{formatCLP(totalNet)}</div>
        </div>
      ) : null}
    </div>
  )
}

function PriceExplanation({ price }: { price: Parameters<typeof explainPrice>[0] }) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const canSeeCosts = session.role === 'owner'
  const lines = explainPrice(price)
  const visible = canSeeCosts ? lines : lines.filter((l) => l.kind === 'total')
  if (!visible.length) return null
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-mx-1 inline-flex items-center gap-1 rounded-xs px-1 py-0.5 text-[13px] font-medium text-ink-600 hover:text-ink-700"
      >
        ¿De dónde sale el precio?
        <ChevronDown aria-hidden strokeWidth={2} className={cn('size-3.5 transition-transform duration-160', open && 'rotate-180')} />
      </button>
      {open ? (
        <dl className="mt-2 space-y-1 rounded-md border border-paper-200 px-3 py-2.5 text-[13px]">
          {visible.map((line, i) => (
            <div
              key={i}
              className={cn(
                'flex items-baseline justify-between gap-3',
                line.kind === 'subtotal' && 'mt-1 border-t border-paper-200 pt-1.5 font-medium text-paper-900',
                line.kind === 'total' && 'mt-1 border-t border-paper-900/80 pt-1.5 font-semibold text-paper-900',
                line.kind === 'part' && 'text-paper-600',
              )}
            >
              <dt className="min-w-0">{line.label}</dt>
              <dd className="shrink-0 tabular">{formatCLP(line.amount)}</dd>
            </div>
          ))}
          {canSeeCosts && price.marginPct !== undefined ? (
            <p className="pt-1.5 text-meta text-paper-600">Margen real de esta ventana: {formatPct(price.marginPct)}</p>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}

export function WarningList({ warnings, itemId, itemRef }: { warnings: Warning[]; itemId: string; itemRef: string }) {
  const editor = useEditor()
  return (
    <ul className="space-y-2">
      {warnings.map((w, i) => {
        const Icon = w.level === 'error' ? CircleAlert : w.level === 'warn' ? TriangleAlert : Info
        const fix = w.fix
        return (
          <li
            key={`${w.code}-${i}`}
            className={cn(
              'rounded-md border px-3 py-2.5 text-[13px] leading-[18px]',
              w.level === 'error' ? 'border-bad-600/20 bg-bad-50' : w.level === 'warn' ? 'border-warn-600/25 bg-warn-50' : 'border-paper-200 bg-paper-50',
            )}
          >
            <div className="flex gap-2">
              <Icon aria-hidden strokeWidth={2} className={cn('mt-px size-4 shrink-0', w.level === 'error' ? 'text-bad-600' : w.level === 'warn' ? 'text-warn-600' : 'text-paper-600')} />
              <div className="min-w-0 flex-1">
                {w.nodeId ? (
                  <button type="button" onClick={() => editor.selectNode(w.nodeId ?? null)} className="text-left text-paper-900 hover:underline">
                    {w.message}
                  </button>
                ) : (
                  <p className="text-paper-900">{w.message}</p>
                )}
                {fix ? (
                  <button
                    type="button"
                    onClick={() => editor.updateDesign(itemId, (d) => ({ ...d, ...fix.patch }), `${fix.label} (${itemRef})`)}
                    className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-sm border border-paper-200 bg-paper-0 px-2.5 font-medium text-paper-900 transition-colors duration-120 hover:bg-paper-100"
                  >
                    <Wand2 aria-hidden strokeWidth={1.75} className="size-3.5 text-ink-600" />
                    {fix.label}
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function QuoteInspector() {
  const editor = useEditor()
  const session = useSession()
  const { discountPct, notes, pricing, settings, validity } = useEditorShallow((s) => ({
    discountPct: s.doc.discountPct,
    notes: s.doc.notes,
    pricing: s.doc.pricing,
    settings: s.settings,
    validity: (s.doc.documentOverrides?.validityDays as number | undefined) ?? undefined,
  }))
  const orgMargin = settings.pricing?.marginPct ?? 40
  const orgMode = settings.pricing?.marginMode ?? 'margin'
  // El motor aplica el valor según la forma de calcular la ganancia (margen sobre la venta o
  // recargo sobre el costo): el campo dice cuál es y la guarda junto al valor de esta cotización.
  const marginMode = pricing?.marginMode ?? orgMode
  const isMarkup = marginMode === 'markup'
  const sameAsOrg = (v: number) => v === orgMargin && marginMode === orgMode
  const canSeeCosts = session.role === 'owner'
  return (
    <div>
      <AllWindowsSection />
      <Section title="Descuento">
        <MeasureField
          value={discountPct}
          onChange={(v) => editor.setDiscount(v ?? 0)}
          unit="%"
          min={0}
          max={100}
          step={1}
          bigStep={5}
          decimals={1}
          aria-label="Descuento en porcentaje"
          className="w-32"
        />
        <p className="mt-1.5 text-meta text-paper-600">Se aplica sobre las ventanas, antes de extras e IVA.</p>
      </Section>
      <Section title="Extras de la obra">
        <ExtrasEditor />
      </Section>
      {canSeeCosts ? (
        <Section title={isMarkup ? 'Recargo de esta cotización' : 'Margen de esta cotización'}>
          <div className="flex items-center gap-3">
            <MeasureField
              value={pricing?.marginPct ?? orgMargin}
              onChange={(v) =>
                editor.setPricing(
                  v === null || sameAsOrg(v) ? omitMargin(pricing) : { ...pricing, marginPct: v, marginMode },
                  isMarkup ? 'Recargo de la cotización' : 'Margen de la cotización',
                )
              }
              unit="%"
              min={0}
              max={isMarkup ? QUOTE_LIMITS.marginPct : 90}
              step={1}
              bigStep={5}
              decimals={1}
              aria-label={isMarkup ? 'Recargo sobre el costo' : 'Margen sobre venta'}
              className="w-32"
            />
            {pricing?.marginPct !== undefined ? (
              <button
                type="button"
                className="text-[13px] font-medium text-ink-600 hover:text-ink-700"
                onClick={() => editor.setPricing(omitMargin(pricing), isMarkup ? 'Recargo de la cotización' : 'Margen de la cotización')}
              >
                Usar el general ({orgMode === 'markup' ? 'recargo' : 'margen'} {formatPct(orgMargin)})
              </button>
            ) : (
              <span className="text-meta text-paper-600">El de tus ajustes</span>
            )}
          </div>
          <p className="mt-1.5 text-meta text-paper-600">
            {isMarkup ? 'Lo que le sumas al costo para llegar al precio.' : 'Lo que te queda de cada venta después de pagar materiales y mano de obra.'}
          </p>
        </Section>
      ) : null}
      <Section title="Validez">
        <div className="flex items-center gap-2">
          <MeasureField
            value={validity ?? settings.documents?.validityDays ?? 15}
            onChange={(v) => editor.setDocumentOverride({ validityDays: v === null || v === settings.documents?.validityDays ? undefined : Math.round(v) }, 'Validez de la cotización')}
            unit="días"
            min={1}
            max={365}
            step={1}
            bigStep={5}
            decimals={0}
            aria-label="Días de validez"
            className="w-32"
          />
        </div>
      </Section>
      <Section title="Notas internas">
        <Textarea
          rows={3}
          placeholder="Solo para tu equipo: nunca salen en el documento."
          maxLength={QUOTE_LIMITS.notes}
          value={notes ?? ''}
          onChange={(e) => editor.setNotes(e.target.value)}
        />
      </Section>
    </div>
  )
}

/** Quita el margen propio de la cotización (valor y forma de calcularlo): vuelve el de tus ajustes. */
function omitMargin(pricing: Partial<PricingSettings> | undefined): Partial<PricingSettings> | undefined {
  if (!pricing) return undefined
  const { marginPct: _pct, marginMode: _mode, ...rest } = pricing
  return Object.keys(rest).length ? rest : undefined
}
