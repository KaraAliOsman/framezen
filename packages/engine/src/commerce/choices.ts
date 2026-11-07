/**
 * Opcionales y alternativas de una cotización. Cada línea (ventana o partida) es `base`, `optional` o
 * `alternative`; el total cuenta las base, los opcionales marcados y, en cada grupo de alternativas,
 * una sola. Lo que no cuenta se muestra aparte, nunca se suma, y no entra a producción.
 *
 * Es la única regla de qué cuenta: la usan el total del motor, el documento, el portal y el taller.
 */
import type { Id, QuoteExtra, QuoteLineRole, QuoteTotals } from '../types'
import { roundHalfUp } from './format'
import { quoteTotals, type QuoteTotalsLine } from './totals'

/** Lo mínimo que una línea necesita para decidir si cuenta. */
export interface QuoteChoiceLine {
  id: Id
  role?: QuoteLineRole
  /** Grupo de alternativas: de todas las líneas del grupo cuenta una. */
  altGroup?: string
  /** Opcional marcado, o alternativa elegida. */
  included?: boolean
}

/** Elección del cliente (o del taller) sobre lo guardado en las líneas. */
export interface QuoteSelection {
  /** Id de la línea opcional → incluida o no. */
  optional?: Readonly<Record<Id, boolean>>
  /** Grupo de alternativas → id de la línea elegida. */
  alternatives?: Readonly<Record<string, Id>>
}

export const lineRole = (line: Pick<QuoteChoiceLine, 'role'>): QuoteLineRole => line.role ?? 'base'

/** Clave del grupo de alternativas de una línea (sin nombre, la línea queda sola). */
export const altGroupOf = (line: Pick<QuoteChoiceLine, 'id' | 'altGroup'>): string => line.altGroup?.trim() || line.id

/**
 * Ids de las líneas que cuentan en el total. De cada grupo de alternativas cuenta exactamente una: la
 * elegida, o la primera si nadie eligió. Así una obra nunca pierde la ventana porque faltó marcar algo.
 */
export function includedLineIds(lines: readonly QuoteChoiceLine[], selection?: QuoteSelection | null): Set<Id> {
  const out = new Set<Id>()
  const groups = new Map<string, QuoteChoiceLine[]>()
  for (const line of lines ?? []) {
    if (!line) continue
    const role = lineRole(line)
    if (role === 'optional') {
      if (selection?.optional?.[line.id] ?? line.included === true) out.add(line.id)
    } else if (role === 'alternative') {
      const key = altGroupOf(line)
      const group = groups.get(key)
      if (group) group.push(line)
      else groups.set(key, [line])
    } else out.add(line.id)
  }
  for (const [key, group] of groups) {
    const wanted = selection?.alternatives?.[key]
    const chosen = group.find((l) => l.id === wanted) ?? group.find((l) => l.included === true) ?? group[0]
    out.add(chosen.id)
  }
  return out
}

/** Escribe en las líneas la elección (al aceptar): el resto del sistema solo mira `included`. */
export function applyQuoteSelection<T extends QuoteChoiceLine>(lines: readonly T[], selection?: QuoteSelection | null): T[] {
  const included = includedLineIds(lines, selection)
  return lines.map((line) => (lineRole(line) === 'base' ? line : { ...line, included: included.has(line.id) }))
}

/** Línea ya evaluada, tal como la ve el total. */
export interface SelectionLine extends QuoteChoiceLine {
  /** Neto de la línea (ya con su descuento). */
  totalNet: number
  qty: number
  /** m² por unidad. */
  area?: number
  /** Costo directo por unidad (solo donde el costo está a la vista). */
  cost?: number
  /** Le falta precio: `totalNet` trae solo lo que tiene precio y `pendingItems` lo cuenta. */
  pending?: boolean
}

export interface SelectionInput {
  lines: readonly SelectionLine[]
  extras: readonly QuoteExtra[]
  discountPct: number
  ivaPct: number
}

/**
 * Totales para una elección a partir de netos ya fijados: lo que usa el portal para recalcular con los
 * precios de la revisión enviada, sin volver a tocar el catálogo. Mismas reglas y redondeo del total.
 */
export function selectionTotals(input: SelectionInput, selection?: QuoteSelection | null): QuoteTotals {
  const included = includedLineIds([...input.lines, ...input.extras], selection)
  const lines = input.lines
    .filter((l) => included.has(l.id))
    .map((l): QuoteTotalsLine => ({
      price: { qty: l.qty, totalNet: l.totalNet, cost: l.cost ?? 0, ...(l.pending ? { pending: [{ code: 'price_missing', ref: l.id }] } : {}) } as QuoteTotalsLine['price'],
      area: l.area ?? 0,
    }))
  return quoteTotals(lines, { discountPct: input.discountPct, extras: input.extras.filter((e) => included.has(e.id)), ivaPct: input.ivaPct })
}

/** Valor de una línea con impuesto (precios por ítem con IVA incluido). */
export function withTax(net: number, ivaPct: number): number {
  return roundHalfUp((net * (100 + ivaPct)) / 100)
}

/** Descuento de una línea, acotado y redondeado como el de la cotización. */
export function lineDiscount(amount: number, pct: number | undefined): number {
  const p = typeof pct === 'number' && Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0
  return p > 0 ? roundHalfUp((amount * p) / 100) : 0
}
