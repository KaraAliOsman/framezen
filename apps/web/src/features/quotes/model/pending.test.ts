import { describe, expect, it } from 'vitest'
import type { PendingPrice, Warning } from '@dekopen/engine'
import { catalogHref, catalogSearch, pendingRows } from './pending'

const hardware: Warning = { level: 'warn', code: 'hardware_out_of_range', message: 'No hay herraje para hojas de 928 mm de alto.' }
const rows = (pending: PendingPrice[], warnings: Warning[] = []) => pendingRows(pending, warnings, (w) => w.message)

describe('qué le falta a un ítem', () => {
  it('un precio dice cuál y lleva a Precios buscando ese código', () => {
    const [row] = rows([{ code: 'price_missing', ref: 'PRO05 (Blanco)' }])
    expect(row).toMatchObject({ kind: 'price', ref: 'PRO05 (Blanco)' })
    expect(catalogHref(row)).toBe('/catalogo?tab=precios&buscar=PRO05')
  })

  it('un herraje usa el aviso del despiece, que nombra la hoja y la medida', () => {
    const [row] = rows([{ code: 'hardware_missing', ref: 'herraje' }], [hardware])
    expect(row).toMatchObject({ kind: 'hardware', ref: hardware.message })
    expect(catalogHref(row)).toBe('/catalogo?tab=herrajes')
  })

  it('en un conjunto cada fila dice de qué unidad es, y los herrajes no se cruzan', () => {
    const out = rows(
      [{ code: 'hardware_missing', ref: 'herraje', unitId: 'B' }, { code: 'joint_missing', ref: 'unión A–B' }],
      [{ ...hardware, unitId: 'B' }, { ...hardware, message: 'De otra unidad', unitId: 'C' }],
    )
    expect(out.map((r) => [r.kind, r.unitIds, r.ref])).toEqual([
      ['hardware', ['B'], hardware.message],
      ['joint', [], 'unión A–B'],
    ])
  })

  it('la misma pieza en varias unidades es una sola fila, con todas sus letras', () => {
    const out = rows([
      { code: 'price_missing', ref: 'S632-01 (Blanco)', unitId: 'A' },
      { code: 'price_missing', ref: 'S632-01 (Blanco)', unitId: 'B' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].unitIds).toEqual(['A', 'B'])
  })

  it('no repite lo mismo y lo que no se puede resolver en catálogo no enlaza', () => {
    const out = rows([{ code: 'price_missing', ref: 'X' }, { code: 'price_missing', ref: 'X' }, { code: 'no_materials', ref: 'materiales' }])
    expect(out).toHaveLength(2)
    expect(catalogHref(out[1])).toBeNull()
  })

  it('el color no entra en la búsqueda; un nombre sin color queda igual', () => {
    expect(catalogSearch('S632-01 (Blanco)')).toBe('S632-01')
    expect(catalogSearch('Tope estanco')).toBe('Tope estanco')
  })
})
