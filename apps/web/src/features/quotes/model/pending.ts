/**
 * Qué le falta a un ítem para tener precio, en filas que el editor puede mostrar y resolver: cada una
 * dice qué falta y a qué parte del catálogo ir. Los herrajes salen de los avisos del despiece, que
 * nombran la hoja y la medida; el resto, de `ItemPrice.pending`.
 */
import type { PendingPrice, Warning } from '@dekopen/engine'

export type PendingKind = 'price' | 'piece' | 'hardware' | 'extra' | 'joint' | 'line' | 'materials'

export interface PendingRow {
  key: string
  kind: PendingKind
  /** Unidades del conjunto a las que les falta: la misma pieza es una sola fila. */
  unitIds: string[]
  /** Qué falta: nombre o código del catálogo, o el aviso ya escrito para los herrajes. */
  ref: string
  /** Enlace al catálogo; sin esto no hay dónde resolverlo. */
  catalog?: { tab: 'precios' | 'herrajes' | 'lineas'; search?: string }
}

const HARDWARE_WARNINGS = new Set(['hardware_missing', 'hardware_out_of_range'])

/** Código o nombre sin el color que se le agrega al faltante («PRO05 (Blanco)» → «PRO05»). */
export function catalogSearch(ref: string): string {
  return ref.replace(/\s*\([^()]*\)\s*$/, '').trim()
}

export function pendingRows(pending: readonly PendingPrice[] | undefined, warnings: readonly Warning[], messageOf: (w: Warning) => string): PendingRow[] {
  const rows: PendingRow[] = []
  const add = (row: Omit<PendingRow, 'key' | 'unitIds'>, unitId: string | undefined) => {
    const key = `${row.kind}|${row.ref}`
    const same = rows.find((r) => r.key === key)
    if (!same) rows.push({ ...row, key, unitIds: unitId ? [unitId] : [] })
    else if (unitId && !same.unitIds.includes(unitId)) same.unitIds.push(unitId)
  }
  for (const p of pending ?? []) {
    const unitId = p.unitId
    switch (p.code) {
      case 'hardware_missing': {
        const found = warnings.filter((w) => HARDWARE_WARNINGS.has(w.code) && (w.unitId ?? undefined) === unitId)
        for (const w of found) add({ kind: 'hardware', ref: messageOf(w), catalog: { tab: 'herrajes' } }, unitId)
        if (!found.length) add({ kind: 'hardware', ref: p.ref, catalog: { tab: 'herrajes' } }, unitId)
        break
      }
      case 'price_missing':
        add({ kind: 'price', ref: p.ref, catalog: { tab: 'precios', search: catalogSearch(p.ref) } }, unitId)
        break
      case 'profile_missing':
        add({ kind: 'piece', ref: p.ref, catalog: { tab: 'lineas' } }, unitId)
        break
      case 'extra_missing':
        add({ kind: 'extra', ref: p.ref, catalog: { tab: 'herrajes' } }, unitId)
        break
      case 'joint_missing':
        add({ kind: 'joint', ref: p.ref, catalog: { tab: 'lineas' } }, unitId)
        break
      case 'line_missing':
        add({ kind: 'line', ref: p.ref, catalog: { tab: 'lineas' } }, unitId)
        break
      default:
        add({ kind: 'materials', ref: p.ref }, unitId)
    }
  }
  return rows
}

/** Dirección del catálogo para resolver una fila. */
export function catalogHref(row: PendingRow): string | null {
  if (!row.catalog) return null
  const params = new URLSearchParams({ tab: row.catalog.tab })
  if (row.catalog.search) params.set('buscar', row.catalog.search)
  return `/catalogo?${params.toString()}`
}
