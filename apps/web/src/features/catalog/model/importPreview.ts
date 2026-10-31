/**
 * Vista previa de una lista «MisPrecios» antes de aplicarla: qué precios cambian (actual → nuevo),
 * qué filas no calzan con el catálogo y cuáles se omiten. Usa el mismo lector y el mismo cruce
 * que el servidor (`@framezen/catalog`), así que lo que ves es lo que se guarda.
 */
import { matchMisPrecios, parseMisPreciosCsv, type MisPreciosRow } from '@framezen/catalog'
import type { Catalog, Id } from '@framezen/engine'
import type { PriceOverride } from '@framezen/shared'
import { buildPriceRows, overrideKey, type PriceFamily } from './prices'

export interface ImportChange {
  key: string
  kind: PriceOverride['kind']
  family: PriceFamily
  id: Id
  colorId?: Id
  code: string
  name: string
  brandName: string
  lineName?: string
  before: number
  after: number
  /** Cambio muy grande (más de ±60 %): conviene revisarlo antes de aplicar. */
  review: boolean
}

export interface ImportPreview {
  rows: number
  /** Filas del archivo que actualizan al menos un precio. */
  matched: number
  unmatched: MisPreciosRow[]
  /** Sin precio, con precio de relleno o marcadas «NO USAR». */
  skipped: number
  /** Precios que cambian (uno por perfil y color, herraje o vidrio). */
  changes: ImportChange[]
  /** Precios que calzan pero quedan igual. */
  unchanged: number
  overrides: PriceOverride[]
  /** Marcas que trae el archivo. */
  brands: string[]
  /** Subidas y bajadas (para el resumen). */
  up: number
  down: number
  /** Cambios grandes que conviene mirar. */
  review: number
}

/** Fuerza la marca de todas las filas (cuando el archivo no trae la columna Marca o viene mal). */
export function forceBrand(rows: MisPreciosRow[], brandName: string | undefined): MisPreciosRow[] {
  return brandName ? rows.map((row) => ({ ...row, brand: brandName })) : rows
}

export function previewImport(text: string, catalog: Catalog, options: { brandId?: Id } = {}): ImportPreview {
  const forced = options.brandId ? catalog.brands.find((b) => b.id === options.brandId)?.name : undefined
  const rows = forceBrand(parseMisPreciosCsv(text), forced)
  const match = matchMisPrecios(catalog, rows)
  const current = new Map(buildPriceRows(catalog).map((row) => [row.key, row]))
  const changes: ImportChange[] = []
  let unchanged = 0
  let up = 0
  let down = 0
  for (const o of match.overrides) {
    const price = Math.round(o.price)
    // Un refuerzo se guarda por color pero en la tabla es una sola fila.
    const row = current.get(overrideKey(o)) ?? current.get(overrideKey({ kind: o.kind, id: o.id }))
    const before = row?.price ?? 0
    if (row && Math.round(before) === price) {
      unchanged++
      continue
    }
    if (price > before) up++
    else down++
    changes.push({
      key: overrideKey(o),
      kind: o.kind,
      family: row?.family ?? (o.kind === 'glass' ? 'glass' : o.kind === 'profile' ? 'profile' : 'hardware'),
      id: o.id,
      colorId: o.colorId,
      code: row?.code ?? '',
      name: row?.name ?? o.id,
      brandName: row?.brandName ?? '',
      lineName: row?.lineName,
      before,
      after: price,
      review: isLargeChange(before, price),
    })
  }
  // Primero lo que conviene revisar, después los cambios más grandes.
  changes.sort((a, b) => Number(b.review) - Number(a.review) || Math.abs(b.after - b.before) / Math.max(b.before, 1) - Math.abs(a.after - a.before) / Math.max(a.before, 1))
  return {
    rows: rows.length,
    matched: match.matched,
    unmatched: match.unmatched,
    skipped: match.skipped,
    changes,
    unchanged,
    overrides: match.overrides.map((o) => ({ ...o, price: Math.round(o.price) })),
    brands: [...new Set(rows.map((r) => r.brand).filter(Boolean))],
    up,
    down,
    review: changes.filter((c) => c.review).length,
  }
}

/** Más de ±60 % respecto del precio actual (un precio nuevo sobre $0 no cuenta). */
export function isLargeChange(before: number, after: number): boolean {
  if (!(before > 0)) return false
  return Math.abs(after - before) / before > 0.6
}

/** Variación porcentual legible («+12 %», «−3 %», «nuevo»). */
export function changePct(before: number, after: number): number | null {
  if (!(before > 0)) return null
  return Math.round(((after - before) / before) * 1000) / 10
}
