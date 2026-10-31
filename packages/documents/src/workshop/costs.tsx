import type { MaterialCost } from '@framezen/engine'
import { DocHeader, DocRoot, Meter, Sheet } from './common'
import { fmtInt, fmtMoney, fmtPct } from './format'
import { otLabel, windowTitle } from './helpers'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

export const WORKSHOP_COST_FAMILIES: { id: keyof MaterialCost; label: string }[] = [
  { id: 'profiles', label: 'Perfiles' },
  { id: 'reinforcement', label: 'Refuerzos' },
  { id: 'hardware', label: 'Herrajes' },
  { id: 'glass', label: 'Vidrios' },
  { id: 'accessories', label: 'Accesorios e insumos' },
]

/** Margen sobre venta en %, o null si no hay venta. */
function marginPct(cost: number, price: number): number | null {
  return price > 0 ? ((price - cost) / price) * 100 : null
}

/** Diferencia con signo: «+$89.571» / «−$12.000». */
function fmtDelta(value: number): string {
  const r = Math.round(value)
  return r > 0 ? `+${fmtMoney(r)}` : fmtMoney(r)
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
export function CostDocument({ data, paper, lowMarginPct = 20 }: CostDocumentProps) {
  const footer = `${otLabel(data)} · Costos internos · ${data.quote.title}`
  const { sale } = data
  const sum = workshopCostSummary(data)
  const { rows, sold, directCost, margin, families, purchase } = sum
  const hasDiscount = sum.discount > 0
  const delta = sum.purchaseDelta === null ? 0 : Math.round(sum.purchaseDelta)

  const zeroPrice = data.windows.flatMap((w) =>
    w.bom.warnings.filter((x) => /price|precio/i.test(x.code) || /sin precio|no tiene precio/i.test(x.message)).map((x) => ({ ref: w.ref, message: x.message })),
  )

  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="costs">
      <Sheet footer={footer} footRight="Documento interno">
        <DocHeader data={data} kicker="Costos internos" meta={<strong>No compartir con el cliente</strong>} />

        <div className="fzw-kpis">
          <div className="fzw-kpi">
            <span>Venta neta</span>
            <strong>{fmtMoney(sold)}</strong>
            <em>{hasDiscount ? `tras ${fmtPct(sum.discountPct)} de descuento, sin IVA ni extras` : 'sin IVA ni extras'}</em>
          </div>
          <div className="fzw-kpi">
            <span>Costo directo</span>
            <strong>{fmtMoney(directCost)}</strong>
            <em>{sale && sale.install > 0 ? 'como en el precio, con mano de obra e instalación' : 'como en el precio, con merma y mano de obra'}</em>
          </div>
          <div className="fzw-kpi">
            <span>Margen</span>
            <strong>{margin === null ? '—' : fmtPct(margin)}</strong>
            <em>{sold > 0 ? `${fmtMoney(sold - directCost)} de utilidad bruta` : 'sin venta'}</em>
          </div>
          {sum.realCost !== null ? (
            <div className="fzw-kpi">
              <span>Margen con compra real</span>
              <strong>{sum.realMargin === null ? '—' : fmtPct(sum.realMargin)}</strong>
              <em>{delta === 0 ? 'la compra calza con el prorrateo' : `${fmtDelta(delta)} por barras completas y envases`}</em>
            </div>
          ) : (
            <div className="fzw-kpi">
              <span>Compra real de materiales</span>
              <strong>{fmtMoney(purchase)}</strong>
              <em>barras completas y envases</em>
            </div>
          )}
        </div>

        {zeroPrice.length > 0 ? (
          <div className="fzw-callout" role="note">
            <div className="fzw-callout-title">Hay artículos sin precio: el costo real es mayor</div>
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
          Compra real de materiales <small>barras completas y envases, neto de descuentos{sale ? ', frente a lo que considera el precio' : ''}</small>
        </h2>
        <table className="fzw-table">
          <thead>
            <tr>
              <th>Familia</th>
              <th style={{ width: sale ? '30%' : '45%' }}>Proporción de la compra</th>
              <th className="num">%</th>
              {sale ? <th className="num">En el precio</th> : null}
              <th className="num">Compra real</th>
            </tr>
          </thead>
          <tbody>
            {families.map((f) => {
              const pct = purchase > 0 ? (f.purchase / purchase) * 100 : 0
              return (
                <tr key={f.id}>
                  <td>{f.label}</td>
                  <td>
                    <Meter pct={pct} label={`${f.label}: ${Math.round(pct)} %`} />
                  </td>
                  <td className="num">{fmtPct(pct, 0)}</td>
                  {sale ? <td className="num">{fmtMoney(f.priced ?? 0)}</td> : null}
                  <td className="num">{fmtMoney(f.purchase)}</td>
                </tr>
              )
            })}
            {sale && sale.waste > 0.5 ? (
              <tr>
                <td>Merma</td>
                <td className="fzw-small fzw-muted" colSpan={2}>
                  la pérdida que el precio suma a los materiales
                </td>
                <td className="num">{fmtMoney(sale.waste)}</td>
                <td className="num fzw-small fzw-muted">incluida arriba</td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total materiales</td>
              {sale ? <td className="num">{fmtMoney(sum.pricedMaterials ?? 0)}</td> : null}
              <td className="num">
                <span className="fzw-mid">{fmtMoney(purchase)}</span>
              </td>
            </tr>
          </tfoot>
        </table>

        {sale ? (
          <p className="fzw-small" style={{ marginTop: '2.5mm' }}>
            Costo directo: materiales {fmtMoney(sum.pricedMaterials ?? 0)} + mano de obra {fmtMoney(sale.labor)}
            {sale.install > 0 ? ` + instalación ${fmtMoney(sale.install)}` : ''} = <strong>{fmtMoney(directCost)}</strong>.
            {sum.realCost !== null && delta !== 0 ? (
              <>
                {' '}
                Con la compra real ({fmtDelta(delta)} por barras completas y envases) el costo queda en{' '}
                <strong>{fmtMoney(sum.realCost)}</strong> y el margen en <strong>{sum.realMargin === null ? '—' : fmtPct(sum.realMargin)}</strong>.
              </>
            ) : null}
          </p>
        ) : null}

        <h2 className="fzw-h" style={{ marginTop: '6mm' }}>
          Por ventana <small>costo directo unitario y precio neto de lista</small>
        </h2>
        <table className="fzw-table">
          <thead>
            <tr>
              <th>Ventana</th>
              <th className="num">Cant.</th>
              <th className="num">Costo unit.</th>
              <th className="num">Precio unit.</th>
              <th className="num">Margen</th>
              <th className="num">Costo total</th>
              <th className="num">Venta total</th>
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
                      {r.window ? ` · ${windowTitle(r.window).title}` : ''}
                    </div>
                    {r.window ? <div className="fzw-cell-sub fzw-ellipsis">{r.window.description}</div> : null}
                  </td>
                  <td className="num">{fmtInt(r.qty)}</td>
                  <td className="num">{fmtMoney(r.unitCost)}</td>
                  <td className="num">{fmtMoney(r.unitPrice)}</td>
                  <td className="num">
                    {r.margin === null ? '—' : low ? <span className="fzw-tag">{fmtPct(r.margin)}</span> : fmtPct(r.margin)}
                  </td>
                  <td className="num">{fmtMoney(r.totalCost)}</td>
                  <td className="num">{fmtMoney(r.totalPrice)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>{hasDiscount ? 'Total de lista' : 'Total'}</td>
              <td className="num">{fmtInt(rows.reduce((s, r) => s + r.qty, 0))}</td>
              <td />
              <td />
              <td className="num">{hasDiscount ? (sum.listMargin === null ? '—' : fmtPct(sum.listMargin)) : margin === null ? '—' : fmtPct(margin)}</td>
              <td className="num">{fmtMoney(directCost)}</td>
              <td className="num">{hasDiscount ? fmtMoney(sum.listSales) : <span className="fzw-mid">{fmtMoney(sold)}</span>}</td>
            </tr>
            {hasDiscount ? (
              <tr>
                <td colSpan={6} style={{ fontWeight: 400, borderTop: 0 }}>
                  Descuento de la cotización ({fmtPct(sum.discountPct)})
                </td>
                <td className="num" style={{ fontWeight: 400, borderTop: 0 }}>
                  {fmtMoney(-sum.discount)}
                </td>
              </tr>
            ) : null}
            {hasDiscount ? (
              <tr>
                <td colSpan={4}>Venta neta</td>
                <td className="num">{margin === null ? '—' : fmtPct(margin)}</td>
                <td className="num">{fmtMoney(directCost)}</td>
                <td className="num">
                  <span className="fzw-mid">{fmtMoney(sold)}</span>
                </td>
              </tr>
            ) : null}
          </tfoot>
        </table>
        <p className="fzw-small fzw-muted" style={{ marginTop: '3mm' }}>
          Margen sobre venta: (precio − costo) ÷ precio. Por ventana se mide sobre el precio de lista y las que quedan bajo{' '}
          {fmtPct(lowMarginPct, 0)} se marcan para revisar. El margen total se mide sobre la venta tras el descuento, sin IVA ni
          extras{sum.extras > 0 ? ` (${fmtMoney(sum.extras)}: su costo no se conoce)` : ''}, igual que en el editor.
        </p>
      </Sheet>
    </DocRoot>
  )
}
