import type { MaterialCost } from '@dekopen/engine'
import { DocHeader, DocRoot, Meter, Sheet } from './common'
import { otLabel, quoteTitle, uniqueFooter, windowTitle } from './helpers'
import { resolveWorkshopLocale, workshopI18n, type WorkshopI18n } from './locale'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

/** Familias de costo (rótulos en español; en otro idioma, `costFamilyLabel`). */
export const WORKSHOP_COST_FAMILIES: { id: keyof MaterialCost; label: string }[] = [
  { id: 'profiles', label: 'Perfiles' },
  { id: 'reinforcement', label: 'Refuerzos' },
  { id: 'hardware', label: 'Herrajes' },
  { id: 'glass', label: 'Vidrios' },
  { id: 'accessories', label: 'Accesorios e insumos' },
]

/** Rótulo de una familia de costo en el idioma del documento. */
export function costFamilyLabel(id: keyof MaterialCost, w: WorkshopI18n = workshopI18n()): string {
  return w.t(`costs.${id}`)
}

/** Margen sobre venta en %, o null si no hay venta. */
function marginPct(cost: number, price: number): number | null {
  return price > 0 ? ((price - cost) / price) * 100 : null
}

export interface CostDocumentProps extends WorkshopDocumentProps {
  /** Margen bajo el cual una ventana se marca para revisar (por defecto 20 %). */
  lowMarginPct?: number
}

/**
 * Cifras de Costos internos, con una sola definición por rótulo:
 * - «Venta neta»: ventanas tras el descuento de la cotización, sin IVA ni extras (como el editor).
 * - «Costo directo»: el del precio (materiales prorrateados por largo + merma + mano de obra).
 * - «Compra real»: barras completas y envases enteros (lista de materiales).
 * Sin `data.sale` (datos antiguos o de muestra) se estima con `costs.perWindow`, sin descuento.
 */
export function workshopCostSummary(data: WorkshopDocumentData) {
  const { costs, sale } = data
  const rows = costs.perWindow.map((row) => {
    const window = data.windows.find((w) => w.ref === row.ref)
    const totalCost = row.unitCost * row.qty
    const totalPrice = row.unitPrice * row.qty
    return { ...row, window, totalCost, totalPrice, margin: marginPct(row.unitCost, row.unitPrice) }
  })
  const listSales = sale?.subtotal ?? rows.reduce((s, r) => s + r.totalPrice, 0)
  const discount = sale?.discount ?? 0
  const sold = listSales - discount
  const directCost = sale?.cost ?? Math.round(rows.reduce((s, r) => s + r.totalCost, 0))
  const margin = sale && sold > 0 ? sale.marginPct : marginPct(directCost, sold)
  const listMargin = marginPct(directCost, listSales)

  const families = WORKSHOP_COST_FAMILIES.map((f) => ({
    ...f,
    purchase: costs.materials[f.id] ?? 0,
    priced: sale ? (sale.materials[f.id] ?? 0) : null,
  }))
  const purchase = families.reduce((s, f) => s + f.purchase, 0)
  const pricedMaterials = sale ? families.reduce((s, f) => s + (f.priced ?? 0), 0) + sale.waste : null
  const purchaseDelta = pricedMaterials === null ? null : purchase - pricedMaterials
  const realCost = sale ? purchase + sale.labor + sale.install : null
  const realMargin = realCost === null ? null : marginPct(realCost, sold)
  return {
    rows,
    listSales,
    discount,
    discountPct: sale?.discountPct ?? 0,
    extras: sale?.extras ?? 0,
    sold,
    directCost,
    margin,
    listMargin,
    families,
    purchase,
    pricedMaterials,
    purchaseDelta,
    realCost,
    realMargin,
  }
}

/** Costos internos de la OT: venta, costo directo y margen (como el editor) y la compra real de materiales. */
export function CostDocument({ data, paper, lowMarginPct = 20, locale, currency, taxLabel }: CostDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const f = w.f
  const money = f.money
  /** Diferencia con signo: «+$89.571» / «−$12.000». */
  const delta = (value: number) => {
    const r = Math.round(value)
    return r > 0 ? `+${money(r)}` : money(r)
  }
  const footer = uniqueFooter(t('costs.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const { sale } = data
  const sum = workshopCostSummary(data)
  const { rows, sold, directCost, margin, families, purchase } = sum
  const hasDiscount = sum.discount > 0
  const diff = sum.purchaseDelta === null ? 0 : Math.round(sum.purchaseDelta)
  const pctOrDash = (v: number | null) => (v === null ? '—' : f.pct(v))

  const zeroPrice = data.windows.flatMap((x) =>
    x.bom.warnings.filter((y) => /price|precio/i.test(y.code) || /sin precio|no tiene precio/i.test(y.message)).map((y) => ({ ref: x.ref, message: w.warning(y) })),
  )

  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="costs" w={w}>
      <Sheet footer={footer} footRight={t('costs.internal')}>
        <DocHeader data={data} kicker={t('costs.kicker')} meta={<strong>{t('costs.dontShare')}</strong>} w={w} />

        <div className="fzw-kpis">
          <div className="fzw-kpi">
            <span>{t('costs.netSales')}</span>
            <strong>{money(sold)}</strong>
            <em>{hasDiscount ? t('costs.netSalesDiscount', { pct: f.pct(sum.discountPct), tax: w.tax }) : t('costs.netSalesPlain', { tax: w.tax })}</em>
          </div>
          <div className="fzw-kpi">
            <span>{t('costs.directCost')}</span>
            <strong>{money(directCost)}</strong>
            <em>{sale && sale.install > 0 ? t('costs.directCostInstall') : t('costs.directCostPlain')}</em>
          </div>
          <div className="fzw-kpi">
            <span>{t('costs.margin')}</span>
            <strong>{pctOrDash(margin)}</strong>
            <em>{sold > 0 ? t('costs.grossProfit', { money: money(sold - directCost) }) : t('costs.noSales')}</em>
          </div>
          {sum.realCost !== null ? (
            <div className="fzw-kpi">
              <span>{t('costs.realMargin')}</span>
              <strong>{pctOrDash(sum.realMargin)}</strong>
              <em>{diff === 0 ? t('costs.purchaseMatches') : t('costs.purchaseDelta', { delta: delta(diff) })}</em>
            </div>
          ) : (
            <div className="fzw-kpi">
              <span>{t('costs.purchase')}</span>
              <strong>{money(purchase)}</strong>
              <em>{t('costs.purchaseHint')}</em>
            </div>
          )}
        </div>

        {zeroPrice.length > 0 ? (
          <div className="fzw-callout" role="note">
            <div className="fzw-callout-title">{t('costs.zeroTitle')}</div>
            <ul>
              {zeroPrice.map((z, i) => (
                <li key={i}>
                  <strong>{z.ref}</strong> · {z.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <h2 className="fzw-h">
          {t('costs.purchase')} <small>{sale ? t('costs.purchaseSectionHintSale') : t('costs.purchaseSectionHint')}</small>
        </h2>
        <table className="fzw-table">
          <thead>
            <tr>
              <th>{t('costs.family')}</th>
              <th style={{ width: sale ? '30%' : '45%' }}>{t('costs.share')}</th>
              <th className="num">{t('costs.pct')}</th>
              {sale ? <th className="num">{t('costs.inPrice')}</th> : null}
              <th className="num">{t('costs.realPurchase')}</th>
            </tr>
          </thead>
          <tbody>
            {families.map((fam) => {
              const pct = purchase > 0 ? (fam.purchase / purchase) * 100 : 0
              const label = w.locale === 'es' ? fam.label : costFamilyLabel(fam.id, w)
              return (
                <tr key={fam.id}>
                  <td>{label}</td>
                  <td>
                    <Meter pct={pct} label={`${label}: ${f.pct(pct, 0)}`} />
                  </td>
                  <td className="num">{f.pct(pct, 0)}</td>
                  {sale ? <td className="num">{money(fam.priced ?? 0)}</td> : null}
                  <td className="num">{money(fam.purchase)}</td>
                </tr>
              )
            })}
            {sale && sale.waste > 0.5 ? (
              <tr>
                <td>{t('costs.waste')}</td>
                <td className="fzw-small fzw-muted" colSpan={2}>
                  {t('costs.wasteHint')}
                </td>
                <td className="num">{money(sale.waste)}</td>
                <td className="num fzw-small fzw-muted">{t('costs.wasteIncluded')}</td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t('costs.totalMaterials')}</td>
              {sale ? <td className="num">{money(sum.pricedMaterials ?? 0)}</td> : null}
              <td className="num">
                <span className="fzw-mid">{money(purchase)}</span>
              </td>
            </tr>
          </tfoot>
        </table>

        {sale ? (
          <p className="fzw-small" style={{ marginTop: '2.5mm' }}>
            {w.rich('costs.directFormula', {
              materials: money(sum.pricedMaterials ?? 0),
              labor: money(sale.labor),
              install: sale.install > 0 ? t('costs.installPart', { install: money(sale.install) }) : '',
              total: money(directCost),
            })}
            {sum.realCost !== null && diff !== 0 ? w.rich('costs.realFormula', { delta: delta(diff), cost: money(sum.realCost), margin: pctOrDash(sum.realMargin) }) : null}
          </p>
        ) : null}

        <h2 className="fzw-h" style={{ marginTop: '6mm' }}>
          {t('costs.perWindow')} <small>{t('costs.perWindowHint')}</small>
        </h2>
        <table className="fzw-table">
          <thead>
            <tr>
              <th>{t('costs.window')}</th>
              <th className="num">{t('costs.qty')}</th>
              <th className="num">{t('costs.unitCost')}</th>
              <th className="num">{t('costs.unitPrice')}</th>
              <th className="num">{t('costs.margin')}</th>
              <th className="num">{t('costs.totalCost')}</th>
              <th className="num">{t('costs.totalSales')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const low = r.margin !== null && r.margin < lowMarginPct
              return (
                <tr key={r.ref}>
                  <td style={{ maxWidth: '72mm' }}>
                    <div className="fzw-cell-title">
                      {r.ref}
                      {r.window ? ` · ${windowTitle(r.window, w).title}` : ''}
                    </div>
                    {r.window ? <div className="fzw-cell-sub fzw-ellipsis">{r.window.description}</div> : null}
                  </td>
                  <td className="num">{f.int(r.qty)}</td>
                  <td className="num">{money(r.unitCost)}</td>
                  <td className="num">{money(r.unitPrice)}</td>
                  <td className="num">{r.margin === null ? '—' : low ? <span className="fzw-tag">{f.pct(r.margin)}</span> : f.pct(r.margin)}</td>
                  <td className="num">{money(r.totalCost)}</td>
                  <td className="num">{money(r.totalPrice)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>{hasDiscount ? t('costs.listTotal') : t('costs.total')}</td>
              <td className="num">{f.int(rows.reduce((s, r) => s + r.qty, 0))}</td>
              <td />
              <td />
              <td className="num">{hasDiscount ? pctOrDash(sum.listMargin) : pctOrDash(margin)}</td>
              <td className="num">{money(directCost)}</td>
              <td className="num">{hasDiscount ? money(sum.listSales) : <span className="fzw-mid">{money(sold)}</span>}</td>
            </tr>
            {hasDiscount ? (
              <tr>
                <td colSpan={6} style={{ fontWeight: 400, borderTop: 0 }}>
                  {t('costs.discount', { pct: f.pct(sum.discountPct) })}
                </td>
                <td className="num" style={{ fontWeight: 400, borderTop: 0 }}>
                  {money(-sum.discount)}
                </td>
              </tr>
            ) : null}
            {hasDiscount ? (
              <tr>
                <td colSpan={4}>{t('costs.netSales')}</td>
                <td className="num">{pctOrDash(margin)}</td>
                <td className="num">{money(directCost)}</td>
                <td className="num">
                  <span className="fzw-mid">{money(sold)}</span>
                </td>
              </tr>
            ) : null}
          </tfoot>
        </table>
        <p className="fzw-small fzw-muted" style={{ marginTop: '3mm' }}>
          {t('costs.footnote', { low: f.pct(lowMarginPct, 0), tax: w.tax, extras: sum.extras > 0 ? t('costs.extrasPart', { money: money(sum.extras) }) : '' })}
        </p>
      </Sheet>
    </DocRoot>
  )
}
