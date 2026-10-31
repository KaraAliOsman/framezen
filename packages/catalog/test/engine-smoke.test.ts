/**
 * Prueba de humo con el motor: cada tipología de cada línea del catálogo de ejemplo
 * se puede dibujar, despiezar y cotizar con precio, herrajes y sin errores.
 */
import { computeBom, createDesign, priceItem } from '@framezen/engine'
import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '../src/index'

const cases = SAMPLE_CATALOG.lines.flatMap((line) => line.typologyIds.map((typologyId) => [line.name, line.id, typologyId] as const))

describe('catálogo de ejemplo con el motor', () => {
  it.each(cases)('%s · %s', (_name, lineId, typologyId) => {
    const design = createDesign(typologyId, { lineId, colorId: 'nogal', glassId: SAMPLE_DEFAULTS.glassId })
    const bom = computeBom(design, SAMPLE_CATALOG)
    const price = priceItem(bom, design, SAMPLE_CATALOG, {})
    const problems = [...bom.warnings, ...price.warnings].filter(
      (warning) => warning.level === 'error' || /missing|kind_mismatch|sin_precio|no_price|unpriced|price_zero/i.test(warning.code),
    )
    expect(problems.map((warning) => `${warning.code}: ${warning.message}`)).toEqual([])
    expect(bom.cuts.length).toBeGreaterThan(0)
    expect(bom.glass.length).toBeGreaterThan(0)
    expect(price.unitNet).toBeGreaterThan(0)
    expect(price.materials.profiles).toBeGreaterThan(0)
    expect(price.materials.glass).toBeGreaterThan(0)
  })

  it('las ventanas que abren llevan herrajes', () => {
    const casement = createDesign('casement', { lineId: 'serie-60', width: 700, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const sliding = createDesign('sliding_2', { lineId: 'serie-70-corredera', width: 1500, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const door = createDesign('door', { lineId: 'serie-puerta-70', width: 900, height: 2100, colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const itemIds = (design: ReturnType<typeof createDesign>) => computeBom(design, SAMPLE_CATALOG).items.map((line) => line.itemId)
    expect(itemIds(casement)).toEqual(expect.arrayContaining(['fz.manilla-ventana', 'fz.bisagra-ventana', 'fz.tornillo-refuerzo']))
    expect(itemIds(casement).some((id) => id.startsWith('fz.cremona-'))).toBe(true)
    expect(itemIds(sliding)).toEqual(expect.arrayContaining(['fz.kit-corredera', 'fz.felpa']))
    expect(itemIds(door)).toEqual(expect.arrayContaining(['fz.bisagra-puerta', 'fz.cerradura-puerta', 'fz.cilindro']))
  })
})
