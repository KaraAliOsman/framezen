import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { computeBom, DEFAULT_PRICING, priceItem } from '@dekopen/engine'
import { safeExample, type ExampleInput } from '../designer/designerModel'

/** Partes del precio (el rótulo se traduce: `designer.breakdown.*`). */
export type BreakdownKey = 'profiles' | 'glass' | 'hardware' | 'waste' | 'labor' | 'margin'

export interface BreakdownRow {
  key: BreakdownKey
  amount: number
}

export interface PriceBreakdown {
  rows: BreakdownRow[]
  /** Precio unitario neto (la suma exacta de las filas). */
  total: number
  /** Margen sobre la venta que dejó el motor, en %. */
  marginPct: number
}

/**
 * De dónde sale cada peso de una ventana de ejemplo, con el mismo motor de la app. La última fila
 * (margen y redondeo) es la diferencia con el precio, así las filas siempre suman el total.
 */
export function priceBreakdown(input: ExampleInput): PriceBreakdown | null {
  const example = safeExample(input)
  if (!example) return null
  try {
    const bom = computeBom(example.design, SAMPLE_CATALOG)
    const price = priceItem(bom, example.design, SAMPLE_CATALOG, DEFAULT_PRICING)
    const m = price.materials
    const rows: BreakdownRow[] = [
      { key: 'profiles', amount: m.profiles + m.reinforcement },
      { key: 'glass', amount: m.glass },
      { key: 'hardware', amount: m.hardware + m.accessories },
      { key: 'waste', amount: price.waste },
      { key: 'labor', amount: price.labor + price.install },
    ]
    const cost = rows.reduce((sum, row) => sum + row.amount, 0)
    if (!Number.isFinite(price.unitNet) || price.unitNet <= 0) return null
    rows.push({ key: 'margin', amount: price.unitNet - cost })
    return { rows, total: price.unitNet, marginPct: price.marginPct }
  } catch {
    return null
  }
}
