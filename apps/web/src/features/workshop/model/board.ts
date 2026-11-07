/**
 * Tablero por estación: una tarjeta por ventana de cada OT en curso.
 */
import { includedLineIds } from '@dekopen/engine'
import type { Quote, QuoteItem, Station, WorkOrder } from '@dekopen/shared'
import { daysUntil, matchesQuery } from './orders'
import { STATION_IDS, stationOf } from './stations'

export interface BoardCard {
  /** `${orderId}:${ref}` */
  id: string
  orderId: string
  orderNumber: number
  ref: string
  station: Station
  /** Obra (puede venir vacía: la tarjeta muestra «Cotización N° …»). */
  title: string
  quoteNumber: number
  clientName?: string
  dueDate?: string
  /** Ventana de la cotización (si ya se cargó): dibujo, unidades, nombre. */
  item?: QuoteItem
}

export interface BoardSource {
  order: WorkOrder
  quote?: Quote
}

const RECENT_DONE_DAYS = 14

/** OT que van al tablero: todas las que siguen en taller y las listas recientes o sin instalar. */
export function boardOrders(orders: readonly WorkOrder[], now: Date = new Date()): WorkOrder[] {
  return orders.filter((o) => {
    if (o.status !== 'done') return true
    const pending = Object.values(o.progress ?? {}).some((s) => s !== 'installed')
    if (pending) return true
    const age = (now.getTime() - new Date(o.updatedAt).getTime()) / 86_400_000
    return Number.isFinite(age) && age <= RECENT_DONE_DAYS
  })
}

/** Refs de la OT en el orden de la cotización (sin repetir), o las del avance si no hay cotización. */
export function orderRefs(order: WorkOrder, quote?: Quote): { ref: string; item?: QuoteItem }[] {
  if (quote?.items?.length) {
    const seen = new Set<string>()
    const out: { ref: string; item?: QuoteItem }[] = []
    const counted = includedLineIds(quote.items)
    for (const item of quote.items) {
      if (!item || !(item.qty > 0) || !counted.has(item.id)) continue
      const ref = item.ref?.trim() || ''
      if (!ref || seen.has(ref)) continue
      seen.add(ref)
      out.push({ ref, item })
    }
    if (out.length) return out
  }
  return Object.keys(order.progress ?? {}).map((ref) => ({ ref }))
}

const refCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

export type BoardColumns = Record<Station, BoardCard[]>

export function emptyColumns(): BoardColumns {
  return Object.fromEntries(STATION_IDS.map((s) => [s, [] as BoardCard[]])) as unknown as BoardColumns
}

/** Arma las columnas del tablero. `query` filtra por OT, obra o cliente. */
export function buildBoard(sources: readonly BoardSource[], query = '', now: Date = new Date()): BoardColumns {
  const columns = emptyColumns()
  for (const { order, quote } of sources) {
    if (!matchesQuery(order, query)) continue
    for (const { ref, item } of orderRefs(order, quote)) {
      const station = stationOf(order.progress, ref)
      const card: BoardCard = {
        id: `${order.id}:${ref}`,
        orderId: order.id,
        orderNumber: order.number,
        ref,
        station,
        title: order.title,
        quoteNumber: order.quoteNumber,
        ...(order.clientName ? { clientName: order.clientName } : {}),
        ...(order.dueDate ? { dueDate: order.dueDate } : {}),
        ...(item ? { item } : {}),
      }
      columns[station].push(card)
    }
  }
  for (const station of STATION_IDS) {
    columns[station].sort((a, b) => {
      const da = a.dueDate ? (daysUntil(a.dueDate, now) ?? Infinity) : Infinity
      const db = b.dueDate ? (daysUntil(b.dueDate, now) ?? Infinity) : Infinity
      return da - db || a.orderNumber - b.orderNumber || refCollator.compare(a.ref, b.ref)
    })
  }
  return columns
}

/** Nuevo avance tras mover una ventana (sin efecto → mismo objeto). */
export function moveInProgress(progress: WorkOrder['progress'], ref: string, station: Station): WorkOrder['progress'] {
  if (progress[ref] === station) return progress
  return { ...progress, [ref]: station }
}

export function parseCardId(id: string): { orderId: string; ref: string } | null {
  const i = id.indexOf(':')
  if (i <= 0) return null
  return { orderId: id.slice(0, i), ref: id.slice(i + 1) }
}
