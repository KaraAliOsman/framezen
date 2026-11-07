import type { Bom, ItemPrice, QuoteExtra, QuoteTotals } from '../types'
import { roundHalfUp } from './format'

export interface QuoteTotalsLine {
  price: ItemPrice & { area?: number }
  /** BOM de la ventana (se usa su `area` para los m² totales si el precio no la trae). */
  bom?: Pick<Bom, 'area'>
  /** m² por unidad (tiene prioridad sobre bom y precio). */
  area?: number
}

export interface QuoteTotalsOptions {
  discountPct: number
  extras: readonly QuoteExtra[]
  ivaPct: number
}

const finite = (n: unknown, fallback = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : fallback)

/**
 * Totales de la cotización (SPEC §3): Σ unitario × cantidad − descuento + extras; IVA sobre
 * el neto total, todo HALF_UP a $1. Los extras no se descuentan y pagan IVA (aunque estén
 * ocultos en el documento). El margen real se mide sobre las ventanas tras el descuento,
 * sin los extras (su costo no se conoce). Lo que está pendiente de precio (`ItemPrice.pending`) no
 * suma: `pendingItems` cuenta esos ítems para decirlo en pantalla y en el documento.
 */
export function quoteTotals(lines: readonly QuoteTotalsLine[], options: QuoteTotalsOptions): QuoteTotals {
  let subtotal = 0
  let cost = 0
  let area = 0
  let units = 0
  let pendingItems = 0
  for (const line of lines ?? []) {
    const price = line?.price
    if (!price) continue
    const qty = Math.max(0, finite(price.qty, 1))
    subtotal += roundHalfUp(finite(price.totalNet))
    if (price.pending?.length) pendingItems += 1
    // Lo que quedó fuera del total tampoco cuenta en el margen: su costo está incompleto.
    if (!price.pending?.length || finite(price.totalNet) > 0) cost += finite(price.cost) * qty
    units += qty
    const perUnit = finite(line.area, NaN)
    const unitArea = Number.isFinite(perUnit) ? perUnit : finite(line.bom?.area, NaN)
    area += (Number.isFinite(unitArea) ? unitArea : finite(price.area)) * qty
  }
  const discountPct = Math.min(100, Math.max(0, finite(options?.discountPct)))
  const discount = roundHalfUp((subtotal * discountPct) / 100)
  const extras = (options?.extras ?? []).reduce((sum, extra) => sum + roundHalfUp(finite(extra?.amount)), 0)
  const net = subtotal - discount + extras
  const ivaPct = Math.max(0, finite(options?.ivaPct, 19))
  const iva = roundHalfUp((net * ivaPct) / 100)
  const totalCost = roundHalfUp(cost)
  const sold = subtotal - discount
  return {
    subtotal,
    discountPct,
    discount,
    extras,
    net,
    iva,
    total: net + iva,
    area: roundHalfUp(area, 4),
    units: roundHalfUp(units, 4),
    cost: totalCost,
    marginPct: sold > 0 ? roundHalfUp(((sold - totalCost) / sold) * 100, 1) : 0,
    ...(pendingItems > 0 ? { pendingItems } : {}),
  }
}
