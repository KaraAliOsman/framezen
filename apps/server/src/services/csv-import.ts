/**
 * Importación de una lista «MisPrecios» (CSV) como precios propios del taller. El parseo
 * y el cruce con el catálogo los hace @dekopen/catalog; aquí sólo se resume el resultado.
 */
import { matchMisPrecios, parseMisPreciosCsv } from '@dekopen/catalog'
import type { Catalog, Id } from '@dekopen/engine'
import type { PriceOverride } from '@dekopen/shared'

export interface CsvImportResult {
  overrides: PriceOverride[]
  rows: number
  /** Filas que actualizaron al menos un precio. */
  matched: number
  /** Filas con precio que no calzan con nada del catálogo. */
  unmatched: number
  /** Filas sin precio, con precio de relleno o marcadas «NO USAR». */
  skipped: number
  /** Algunas filas sin calce, para mostrarlas al usuario. */
  unmatchedSample: { code: string; description: string; brand: string }[]
  brands: string[]
}

export function importMisPrecios(text: string, catalog: Catalog, options: { brandId?: Id } = {}): CsvImportResult {
  let rows = parseMisPreciosCsv(text)
  // Si el usuario eligió la marca en la interfaz, manda sobre la columna Marca del archivo.
  const forced = options.brandId ? catalog.brands.find((b) => b.id === options.brandId) : undefined
  if (forced) rows = rows.map((row) => ({ ...row, brand: forced.name }))
  const match = matchMisPrecios(catalog, rows)
  return {
    overrides: match.overrides.map((o) => ({ ...o, price: Math.round(o.price) })),
    rows: rows.length,
    matched: match.matched,
    unmatched: match.unmatched.length,
    skipped: match.skipped,
    unmatchedSample: match.unmatched.slice(0, 20).map((r) => ({ code: r.code, description: r.description, brand: r.brand })),
    brands: [...new Set(rows.map((r) => r.brand).filter(Boolean))],
  }
}
