/**
 * Lo que le falta a una ventana para tener precio, con su salida directa: ir a la pieza en el catálogo
 * o poner un precio manual aquí mismo. Nada se bloquea: la ventana sigue en la cotización, fuera del total.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowUpRight, TriangleAlert } from 'lucide-react'
import type { PendingPrice, Warning } from '@dekopen/engine'
import { useGlossary, useT } from '../../../lib/i18n'
import { Button } from '../../../ui/Button'
import { MoneyField } from '../../../ui/MoneyField'
import es from '../i18n/es'
import { catalogHref, pendingRows } from '../model/pending'

export interface PendingPricePanelProps {
  pending: readonly PendingPrice[]
  warnings: readonly Warning[]
  /** Ya tiene parte del precio: es un conjunto con unidades cotizadas. */
  partial: boolean
  tax: string
  onManualPrice: (price: number) => void
}

/** Una línea sin lista puede faltar en una docena de piezas: se muestran dos y el resto a pedido. */
const VISIBLE = 2

export function PendingPricePanel({ pending, warnings, partial, tax, onManualPrice }: PendingPricePanelProps) {
  const t = useT(es)
  const g = useGlossary()
  const [draft, setDraft] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const rows = useMemo(() => pendingRows(pending, warnings, (w) => g.warning(w)), [pending, warnings, g])
  if (!rows.length) return null
  return (
    <section data-pending-panel="" aria-label={t('pendingPrice.title')} className="mx-4 mt-3 rounded-sm bg-warning-bg p-3">
      <h3 className="flex items-center gap-1.5 text-table font-semibold text-fg-strong">
        <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-warning" />
        {t(partial ? 'pendingPrice.titlePartial' : 'pendingPrice.title')}
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {(expanded ? rows : rows.slice(0, VISIBLE)).map((row) => {
          const href = catalogHref(row)
          return (
            <li key={row.key} className="flex items-start justify-between gap-2 text-table text-fg-strong" data-pending-kind={row.kind}>
              <span className="min-w-0">
                {row.unitIds.length ? <span className="font-medium">{t('pendingPrice.unit', { unit: row.unitIds.join(', ') })} </span> : null}
                {t(`pendingPrice.kind.${row.kind}`, { ref: row.ref })}
              </span>
              {href ? (
                <Link to={href} className="inline-flex shrink-0 items-center gap-0.5 rounded-xs font-medium text-accent-ink underline-offset-2 hover:underline">
                  {t('pendingPrice.catalog')}
                  <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-3.5" />
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
      {!expanded && rows.length > VISIBLE ? (
        <button type="button" onClick={() => setExpanded(true)} className="mt-1.5 text-table font-medium text-accent-ink underline-offset-2 hover:underline">
          {t('pendingPrice.more', { count: rows.length - VISIBLE })}
        </button>
      ) : null}
      <div className="mt-3 flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-meta text-fg-muted">{t('pendingPrice.manual')}</span>
          <MoneyField className="w-full" value={draft} onChange={(v) => setDraft(v ?? null)} suffix={tax} aria-label={t('pendingPrice.manual')} />
        </label>
        <Button size="sm" variant="secondary" disabled={!draft} onClick={() => draft && onManualPrice(draft)}>
          {t('pendingPrice.apply')}
        </Button>
      </div>
    </section>
  )
}
