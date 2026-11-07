/**
 * Resumen comercial fijo a lo ancho de la hoja: neto de ventanas, descuento, extras, impuesto y el
 * **total abajo a la derecha, en una posición fija** que nunca se mueve al editar (solo destella).
 * Cifra arriba y etiqueta abajo; con unidades, m² y el margen real si tu rol ve costos. Si falta un
 * precio, lo dice aquí mismo con un enlace.
 */
import type { ReactNode } from 'react'
import { ChevronDown, TriangleAlert } from 'lucide-react'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Flash, Numeric, Popover, PopoverContent, PopoverTrigger } from '../../../ui'
import { MeasureField } from '../../designer/parts/MeasureField'
import es from '../i18n/es'
import { useEditor, useEditorShallow, useEditorUi } from './context'
import { ExtrasEditor } from './ExtrasEditor'
import { countedUnits, useTax } from './names'

function Figure({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center', className)}>
      <span className="text-base font-medium whitespace-nowrap tabular text-fg-strong">{children}</span>
      <span className="text-meta whitespace-nowrap text-fg-muted">{label}</span>
    </div>
  )
}

export function useTotals() {
  return useEditorShallow((s) => ({ totals: s.evaluation.totals, pricing: s.evaluation.pricing, discountPct: s.doc.discountPct, extrasCount: s.doc.extras.length }))
}

export function DiscountInput({ className }: { className?: string }) {
  const t = useT(es)
  const editor = useEditor()
  const discountPct = useEditorShallow((s) => ({ d: s.doc.discountPct })).d
  return (
    <MeasureField
      value={discountPct}
      onChange={(v) => editor.setDiscount(v ?? 0)}
      unit="%"
      min={0}
      max={100}
      step={1}
      bigStep={5}
      decimals={1}
      aria-label={t('quote.discountAria')}
      className={cn('w-[72px]', className)}
      inputClassName="h-6! touch:h-9! text-table pr-6"
    />
  )
}

/** Ventanas a las que les falta un precio del catálogo (el total no las incluye completas). */
function useMissingPrices() {
  return useEditorShallow((s) => {
    const ids: string[] = []
    s.evaluation.items.forEach((item, i) => {
      if (item.price.warnings.some((w) => w.code.startsWith('price_missing'))) ids.push(s.doc.items[i]?.id ?? '')
    })
    return { count: ids.length, first: ids[0] ?? null }
  })
}

export function TotalsFooter({ className }: { className?: string }) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const tax = useTax()
  const session = useSession()
  const editor = useEditor()
  const setUi = useEditorUi((s) => s.set)
  const { totals, pricing, extrasCount } = useTotals()
  const units = useEditorShallow((s) => ({ n: countedUnits(s.doc.items, s.evaluation.items) })).n
  const missing = useMissingPrices()
  const canSeeCosts = session.role === 'owner'

  return (
    <footer aria-label={t('totals.aria')} className={cn('@container flex h-16 shrink-0 items-center gap-6 bg-canvas pr-4 pl-5 xl:gap-8', className)}>
      <Figure label={t('totals.net')} className="shrink-0 @max-[800px]:hidden">
        {fmt.money(totals.subtotal)}
      </Figure>
      <div className="flex shrink-0 flex-col justify-center gap-0.5">
        <div className="flex items-center gap-2">
          <DiscountInput />
          {totals.discount > 0 ? <span className="text-table tabular text-fg-muted">{fmt.money(-totals.discount)}</span> : null}
        </div>
        <span className="text-meta text-fg-muted">{t('totals.discount')}</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="-mx-1.5 flex shrink-0 flex-col rounded-sm px-1.5 py-1 text-left transition-colors duration-100 hover:bg-hover">
            <span className="text-base font-medium tabular text-fg-strong">{totals.extras ? fmt.money(totals.extras) : t('totals.add')}</span>
            <span className="inline-flex items-center gap-1 text-meta text-fg-muted">
              {extrasCount ? t('totals.extrasCount', { count: extrasCount }) : t('totals.extras')}
              <ChevronDown aria-hidden strokeWidth={2} className="size-3" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px]" align="start">
          <h3 className="mb-1 text-table font-medium text-fg-strong">{t('totals.extrasTitle')}</h3>
          <p className="mb-3 text-meta text-fg-muted">{t('totals.extrasHint', { tax: tax.inline })}</p>
          <ExtrasEditor />
        </PopoverContent>
      </Popover>
      {/* Con poco ancho (otros idiomas, moneda con código, asistente abierto) se esconde primero lo secundario. */}
      <Figure label={t('totals.tax', { tax: tax.label, pct: fmt.pct(pricing.ivaPct, 1) })} className="shrink-0 @max-[820px]:hidden">
        {fmt.money(totals.iva)}
      </Figure>
      <div className="flex shrink-0 flex-col justify-center text-meta tabular text-fg-muted @max-[1120px]:hidden">
        <span className="whitespace-nowrap">{t('totals.unitsArea', { units: g.count('pieces', units), area: fmt.area(totals.area) })}</span>
        {canSeeCosts && totals.subtotal > 0 ? (
          <span className={cn('whitespace-nowrap', totals.marginPct < 15 ? 'text-warning' : '')} title={t('totals.marginTitle')}>
            {t('totals.margin', { pct: fmt.pct(totals.marginPct, 1) })}
          </span>
        ) : null}
      </div>
      {missing.count ? (
        <button
          type="button"
          onClick={() => {
            if (missing.first) editor.select(missing.first)
            setUi({ inspectorTab: 'item' })
          }}
          title={t('totals.missing', { count: missing.count })}
          className="group inline-flex min-w-0 items-center gap-1.5 rounded-sm py-1 text-left text-table text-fg"
        >
          <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-warning" />
          <span className="min-w-0 truncate @max-[800px]:sr-only">{t('totals.missing', { count: missing.count })}</span>
          <span className="shrink-0 font-medium text-warning group-hover:underline">{t('totals.missingAction')}</span>
        </button>
      ) : null}
      <div className="ml-auto flex shrink-0 items-baseline gap-3 pl-2">
        <span className="text-table whitespace-nowrap text-fg-muted @max-[700px]:sr-only">{t('totals.total', { tax: tax.inline })}</span>
        <Flash trigger={totals.total} className="-mx-1 px-1">
          <Numeric kind="money" size="total" aria-live="polite">
            {fmt.money(totals.total)}
          </Numeric>
        </Flash>
      </div>
    </footer>
  )
}
