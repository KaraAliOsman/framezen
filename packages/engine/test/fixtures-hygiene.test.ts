/**
 * El repositorio es público: los fixtures del motor no pueden llevar listas de precios reales
 * ni SKU de distribuidores (README, «datos de marcas»; SPEC: «No se suben al repositorio»).
 * Una lista con descuento (p. ej. lista × 0,65) deja precios «raros» como 16.867; los SKU del
 * distribuidor son códigos numéricos de 9 dígitos. Aquí se exige precio redondo inventado y
 * código ficticio; la geometría (pautas, medidas) sí puede venir de los documentos.
 */
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../src/types'
import { makeCatalog } from './commerce/fixtures'
import { manufacturerCatalog, prolineCatalog } from './core/fixtures'

// El motor no carga tipos de Node (tsconfig types: []): el texto de los tests llega por Vite.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { query: '?raw'; import: 'default'; eager: true }): Record<string, string>
  }
}
const TEST_SOURCES = import.meta.glob('./**/*.ts', { query: '?raw', import: 'default', eager: true })
const SKU_LIKE = /^\d{6,}$/
const QUOTED_SKU = /['"`](\d{9})['"`]/g

function prices(catalog: Catalog): [string, number][] {
  const out: [string, number][] = []
  for (const p of catalog.profiles) for (const [color, v] of Object.entries(p.priceByColor)) out.push([`${p.code}/${color}`, v])
  for (const i of catalog.items) out.push([i.code, i.price])
  for (const g of catalog.glass) out.push([g.name, g.pricePerM2])
  return out
}

describe('fixtures del motor sin datos comerciales reales', () => {
  const catalogs: [string, Catalog][] = [
    ['core/prolineCatalog', prolineCatalog()],
    ['core/manufacturerCatalog', manufacturerCatalog()],
    ['commerce/makeCatalog', makeCatalog()],
  ]

  it.each(catalogs)('%s: precios redondos (múltiplos de 50 pesos) inventados', (_, catalog) => {
    const odd = prices(catalog).filter(([, v]) => v % 50 !== 0)
    expect(odd).toEqual([])
  })

  it.each(catalogs)('%s: ningún código ni id con forma de SKU de distribuidor', (_, catalog) => {
    const ids = [...catalog.items.flatMap((i) => [i.id, i.code]), ...catalog.profiles.flatMap((p) => [p.id, p.code])]
    expect(ids.filter((c) => SKU_LIKE.test(c))).toEqual([])
  })

  it('ningún test del motor escribe un SKU numérico de 9 dígitos', () => {
    const files = Object.entries(TEST_SOURCES)
    expect(files.length).toBeGreaterThan(10)
    const hits = files.flatMap(([file, src]) => [...src.matchAll(QUOTED_SKU)].map((m) => `${file}: ${m[1]}`))
    expect(hits).toEqual([])
  })
})
