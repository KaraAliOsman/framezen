import type { PurchaseOrderDraft } from '@framezen/engine'
import { DocHeader, DocRoot, Sheet, Signatures, WriteField } from './common'
import { fmtMoney, fmtNumber, fmtPct, fmtQty } from './format'
import { colorInfo, otLabel, materialCode } from './helpers'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

export interface PurchaseOrderDocumentProps extends WorkshopDocumentProps {
  /** Sólo la orden de este proveedor. Por defecto, una hoja por proveedor. */
  brandId?: string
  /** Mostrar precios y totales (por defecto sí). */
  showPrices?: boolean
  /** IVA en %. Por defecto el de la organización (`data.ivaPct`) o 19. */
  ivaPct?: number
  /** Número visible de cada orden. Por defecto «38-1», «38-2»… (OT-correlativo). */
  numberFor?: (order: PurchaseOrderDraft, index: number) => string
}

/** Orden de compra por proveedor, lista para enviar. */
export function PurchaseOrderDocument({ data, paper, brandId, showPrices = true, ivaPct: ivaProp, numberFor }: PurchaseOrderDocumentProps) {
  const ivaPct = validIva(ivaProp) ?? validIva(data.ivaPct) ?? 19
  const orders = brandId ? data.purchaseOrders.filter((o) => o.brandId === brandId) : data.purchaseOrders
  const footer = `${data.org.name} · Orden de compra · ${otLabel(data)}`
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="purchase">
      {orders.map((order) => {
        const index = data.purchaseOrders.indexOf(order)
        const number = numberFor ? numberFor(order, index) : `${data.workOrder.number}-${index + 1}`
        return (
          <OrderSheet key={order.brandId} data={data} order={order} number={number} showPrices={showPrices} ivaPct={ivaPct} footer={footer} />
        )
      })}
      {orders.length === 0 ? (
        <Sheet footer={footer}>
          <DocHeader data={data} kicker="Orden de compra" />
          <p className="fzw-muted">No hay materiales por comprar en esta OT.</p>
        </Sheet>
      ) : null}
    </DocRoot>
  )
}

function validIva(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined
}

function OrderSheet(props: {
  data: WorkshopDocumentData
  order: PurchaseOrderDraft
  number: string
  showPrices: boolean
  ivaPct: number
  footer: string
}) {
  const { data, order, showPrices } = props
  const lineTotal = order.lines.reduce((s, l) => s + (l.total ?? 0), 0)
  const net = order.total > 0 ? order.total : lineTotal
  const iva = Math.round((net * props.ivaPct) / 100)
  const unpriced = order.lines.filter((l) => !l.unitCost || l.unitCost <= 0)
  const cols = showPrices ? 8 : 6

  return (
    <Sheet footer={props.footer} footRight={order.brandName}>
      <DocHeader data={data} kicker="Orden de compra" title={`OC N° ${props.number}`} meta={<>Para {otLabel(data)}</>} audience="supplier" />

      <div className="fzw-grid-2" style={{ marginBottom: '5mm' }}>
        <div>
          <div className="fzw-small fzw-muted">Proveedor</div>
          <div className="fzw-win-name">{order.brandName}</div>
          <div style={{ display: 'grid', gap: '3mm', marginTop: '3mm' }}>
            <WriteField label="Contacto" />
            <WriteField label="Correo o teléfono" />
          </div>
        </div>
        <div>
          <div className="fzw-small fzw-muted">Compra</div>
          <div className="fzw-win-name">{data.org.name}</div>
          <div style={{ display: 'grid', gap: '3mm', marginTop: '3mm' }}>
            <WriteField label="Entregar en" />
            <WriteField label="Fecha de entrega" />
          </div>
        </div>
      </div>

      <table className="fzw-table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Color</th>
            <th className="num">Cantidad</th>
            <th>Unidad</th>
            {showPrices ? <th className="num">Precio unit.</th> : null}
            {showPrices ? <th className="num">Total</th> : null}
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line, i) => {
            const color = line.colorName ?? colorInfo(data.catalog, line.colorId)?.name
            const noPrice = !line.unitCost || line.unitCost <= 0
            return (
              <tr key={`${line.code}-${line.colorId ?? ''}-${i}`}>
                <td className="num fzw-muted">{i + 1}</td>
                <td className="fzw-mono fzw-nowrap">{materialCode(line)}</td>
                <td>{line.name}</td>
                <td>{color ?? <span className="fzw-muted">—</span>}</td>
                <td className="num">
                  <span className="fzw-mid">{line.unit === 'm²' ? fmtNumber(line.qty, 2) : fmtQty(line.qty)}</span>
                </td>
                <td>{line.unit}</td>
                {showPrices ? (
                  <td className="num">{noPrice ? <span className="fzw-tag fzw-tag-muted">Por confirmar</span> : fmtMoney(line.unitCost ?? 0)}</td>
                ) : null}
                {showPrices ? <td className="num">{noPrice ? '—' : fmtMoney(line.total ?? 0)}</td> : null}
              </tr>
            )
          })}
        </tbody>
        {showPrices ? (
          <tfoot>
            <tr>
              <td colSpan={cols - 1}>Neto</td>
              <td className="num">{fmtMoney(net)}</td>
            </tr>
            <tr>
              <td colSpan={cols - 1} style={{ fontWeight: 400, borderTop: 0 }}>
                IVA {fmtPct(props.ivaPct, 0)}
              </td>
              <td className="num" style={{ fontWeight: 400, borderTop: 0 }}>
                {fmtMoney(iva)}
              </td>
            </tr>
            <tr>
              <td colSpan={cols - 1}>Total</td>
              <td className="num">
                <span className="fzw-mid">{fmtMoney(net + iva)}</span>
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>

      {showPrices && unpriced.length > 0 ? (
        <p className="fzw-small" style={{ marginTop: '3mm' }}>
          {unpriced.length === 1 ? 'Un artículo no tiene precio' : `${unpriced.length} artículos no tienen precio`} en nuestro
          catálogo: indícalo en tu confirmación.
        </p>
      ) : null}

      <p className="fzw-small fzw-muted" style={{ marginTop: '4mm' }}>
        Por favor confirma disponibilidad, precio y fecha de entrega antes de despachar. Indica «OC N° {props.number}» en la guía
        y en la factura.
      </p>
      <Signatures labels={['Autorizado por', 'Recibido por']} />
    </Sheet>
  )
}
