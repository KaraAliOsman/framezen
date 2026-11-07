/**
 * Lo que el importador escribe para Proline en el catálogo base lo ven (y heredan) todos los
 * talleres, y este repositorio es público: ni descuentos del dueño ni referencias a órdenes de
 * trabajo de terceros.
 */
import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG, lineReadiness } from '../src/index'
import { PROLINE_LINES, prolineSettings } from '../src/proline'

describe('datos de Proline en el catálogo base', () => {
  it('no trae descuentos: cada taller carga los suyos en «Mis precios»', () => {
    const settings = prolineSettings('proline')
    expect(settings).toMatchObject({ brandId: 'proline', enabled: true, trim: 0, kerf: 4 })
    expect(settings.discounts).toEqual({ profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 })
  })

  it('la fuente que ve el taller no cita la OT de un tercero y sigue contando como verificada', () => {
    const sources = Object.values(PROLINE_LINES)
      .map((line) => line.source)
      .filter((source): source is string => Boolean(source))
    expect(sources.length).toBeGreaterThan(0)
    const serie60 = SAMPLE_CATALOG.lines.find((line) => line.id === 'serie-60')!
    for (const source of sources) {
      expect(source).not.toMatch(/\bOT\b|N° ?\d+/)
      expect(source).toMatch(/^Pauta de la distribuidora, verificada por DEKOPEN/)
      const catalog = { ...SAMPLE_CATALOG, lines: SAMPLE_CATALOG.lines.map((line) => (line.id === serie60.id ? { ...line, source } : line)) }
      expect(lineReadiness(catalog, catalog.lines.find((line) => line.id === serie60.id)!)).toMatchObject({ evidence: true, level: 'verified' })
    }
  })
})
