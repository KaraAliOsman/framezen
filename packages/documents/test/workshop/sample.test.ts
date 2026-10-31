import { describe, expect, it } from 'vitest'
import { sampleWorkshopCatalog } from '../../src/workshop'

/**
 * El catálogo de ejemplo se publica con el paquete: sus precios deben ser cifras redondas escritas
 * a mano. Un precio como 16.867 delata un neto real copiado de una lista de proveedor (×0,65).
 */
const isRound = (price: number) => price === 0 || (price < 200 ? price % 5 === 0 : price % 50 === 0)

describe('catálogo de ejemplo del taller', () => {
  const catalog = sampleWorkshopCatalog()

  it('usa solo precios redondos inventados (nada copiado de una lista real)', () => {
    const prices: [string, number][] = [
      ...catalog.profiles.flatMap((p) => Object.entries(p.priceByColor).map(([color, price]) => [`${p.code} ${color}`, price] as [string, number])),
      ...catalog.items.map((i) => [i.code, i.price] as [string, number]),
      ...catalog.glass.map((g) => [g.name, g.pricePerM2] as [string, number]),
    ]
    expect(prices.length).toBeGreaterThan(40)
    expect(prices.filter(([, price]) => !isRound(price))).toEqual([])
  })

  it('las marcas se presentan como ejemplo', () => {
    for (const brand of catalog.brands) expect(brand.name).toMatch(/\(ejemplo\)$/)
  })
})
