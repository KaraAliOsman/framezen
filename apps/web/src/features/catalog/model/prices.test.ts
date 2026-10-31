import { describe, expect, it } from 'vitest'
import type { Catalog } from '@framezen/engine'
import type { PriceOverride } from '@framezen/shared'
import {
  activeFilterCount,
  applyOverridesToCatalog,
  buildPriceRows,
  bulkAdjust,
  editChange,
  EMPTY_FILTERS,
  filterRows,
  friendlyRound,
  itemUnitLabel,
  missingByFamily,
  overrideKey,
  resetChange,
  sortRows,
  undoFor,
} from './prices'

const catalog: Catalog = {
  colors: [
    { id: 'blanco', name: 'Blanco', hex: '#F6F5F1' },
    { id: 'nogal', name: 'Nogal', hex: '#5B3A22' },
  ],
  brands: [
    { id: 'andes', name: 'Perfiles Andes', kind: 'profiles' },
    { id: 'vid', name: 'Vidrios Sur', kind: 'glass' },
  ],
  lines: [
    {
      id: 'andes.s60',
      brandId: 'andes',
      name: 'Serie 60',
      kind: 'casement',
      material: 'pvc',
      pauta: { weld: 3, frameDeduction: 44, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, glassGap: 5, mullionDeduction: 20 },
      profiles: {},
      colorIds: ['blanco', 'nogal'],
      typologyIds: ['fixed'],
      hardwareRules: [],
      accessoryRules: [],
    },
  ],
  profiles: [
    { id: 'andes.s60.marco', lineId: 'andes.s60', code: 'S60-01', name: 'Marco 60', role: 'frame', barLength: 5800, priceByColor: { blanco: 17100, nogal: 25000 } },
    { id: 'andes.s60.hoja', lineId: 'andes.s60', code: 'S60-02', name: 'Hoja 60', role: 'sash', barLength: 5800, priceByColor: { blanco: 0 } },
    { id: 'andes.s60.r1', lineId: 'andes.s60', code: 'R1', name: 'Refuerzo marco', role: 'reinforcement', barLength: 6000, priceByColor: { blanco: 9800, nogal: 9800 } },
  ],
  items: [
    { id: 'andes.cremona', brandId: 'andes', kind: 'hardware', code: 'CR-600', name: 'Cremona 600', unit: 'u', price: 6100 },
    { id: 'andes.tornillo', brandId: 'andes', kind: 'consumable', code: 'T-39', name: 'Tornillo 3,9 × 19', unit: 'caja', packSize: 1000, price: 12000 },
    { id: 'andes.burlete', brandId: 'andes', kind: 'accessory', code: 'B-1', name: 'Burlete', unit: 'm', packSize: 300, price: 0 },
  ],
  glass: [{ id: 'vid.dvh', brandId: 'vid', name: 'DVH 4+12+4', kind: 'dvh', thickness: 20, pricePerM2: 38000 }],
  brandSettings: [],
}

describe('filas de precios', () => {
  it('arma una fila por perfil y color, una por refuerzo y una por artículo', () => {
    const rows = buildPriceRows(catalog)
    expect(rows.filter((r) => r.family === 'profile').map((r) => r.key)).toEqual([
      'profile:andes.s60.marco:blanco',
      'profile:andes.s60.marco:nogal',
      'profile:andes.s60.hoja:blanco',
    ])
    const steel = rows.find((r) => r.family === 'reinforcement')!
    expect(steel).toMatchObject({ key: 'profile:andes.s60.r1:', price: 9800 })
    expect(steel.colorId).toBeUndefined()
    expect(rows.find((r) => r.id === 'andes.tornillo')).toMatchObject({ family: 'accessory', unit: 'caja de 1.000' })
    expect(rows.find((r) => r.id === 'vid.dvh')).toMatchObject({ family: 'glass', unit: 'm²', brandName: 'Vidrios Sur' })
  })

  it('marca como propios los precios cargados por el taller (también los generales de un perfil)', () => {
    const overrides: PriceOverride[] = [
      { kind: 'profile', id: 'andes.s60.marco', colorId: 'nogal', price: 26000 },
      { kind: 'item', id: 'andes.cremona', price: 6500 },
    ]
    const rows = buildPriceRows(catalog, overrides)
    expect(rows.filter((r) => r.own).map((r) => r.key)).toEqual(['profile:andes.s60.marco:nogal', 'item:andes.cremona:'])
    const general = buildPriceRows(catalog, [{ kind: 'profile', id: 'andes.s60.marco', price: 1 }])
    expect(general.filter((r) => r.own).map((r) => r.colorId)).toEqual(['blanco', 'nogal'])
  })

  it('cuenta los que están en $0 por familia', () => {
    expect(missingByFamily(buildPriceRows(catalog))).toEqual({ profile: 1, reinforcement: 0, hardware: 0, accessory: 1, glass: 0 })
  })

  it('nombra las unidades de compra en lenguaje de taller', () => {
    expect(itemUnitLabel({ unit: 'm', packSize: 300 })).toBe('rollo de 300 m')
    expect(itemUnitLabel({ unit: 'u' })).toBe('unidad')
    expect(itemUnitLabel({ unit: 'kit' })).toBe('kit')
  })

  it('ordena perfiles primero y luego por marca, línea y código', () => {
    const sorted = sortRows(buildPriceRows(catalog).filter((r) => r.family !== 'glass'))
    expect(sorted.map((r) => r.family)).toEqual(['profile', 'profile', 'profile', 'reinforcement', 'hardware', 'accessory', 'accessory'])
  })
})

describe('filtros', () => {
  const rows = buildPriceRows(catalog, [{ kind: 'item', id: 'andes.cremona', price: 6100 }])
  const colorNames = new Map([
    ['blanco', 'Blanco'],
    ['nogal', 'Nogal'],
  ])

  it('busca sin tildes por código, nombre, línea o color', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, q: 'serie 60 nogal' }, colorNames).map((r) => r.key)).toEqual(['profile:andes.s60.marco:nogal'])
    expect(filterRows(rows, { ...EMPTY_FILTERS, q: 'CR-600' }).map((r) => r.id)).toEqual(['andes.cremona'])
    expect(filterRows(rows, { ...EMPTY_FILTERS, q: 'tornillo 3,9' }).map((r) => r.id)).toEqual(['andes.tornillo'])
  })

  it('filtra por familia, marca y línea', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, family: 'hardware' }).map((r) => r.id)).toEqual(['andes.cremona'])
    expect(filterRows(rows, { ...EMPTY_FILTERS, brandId: 'vid' }).map((r) => r.id)).toEqual(['vid.dvh'])
    expect(filterRows(rows, { ...EMPTY_FILTERS, lineId: 'andes.s60' })).toHaveLength(4)
  })

  it('el color deja solo perfiles de ese color (un ajuste al nogal nunca toca herrajes)', () => {
    const nogal = filterRows(rows, { ...EMPTY_FILTERS, colorId: 'nogal' })
    expect(nogal.map((r) => r.key)).toEqual(['profile:andes.s60.marco:nogal'])
  })

  it('muestra solo los sin precio o solo los propios', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, missing: true }).map((r) => r.id)).toEqual(['andes.s60.hoja', 'andes.burlete'])
    expect(filterRows(rows, { ...EMPTY_FILTERS, own: true }).map((r) => r.id)).toEqual(['andes.cremona'])
  })

  it('cuenta los filtros activos', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: ' ', family: 'profile', missing: true })).toBe(2)
  })
})

describe('ajuste masivo', () => {
  const rows = buildPriceRows(catalog, [{ kind: 'profile', id: 'andes.s60.marco', colorId: 'nogal', price: 25000 }]).filter((r) => r.family !== 'glass')

  it('sube un porcentaje con redondeo amable y omite los que están en $0', () => {
    const result = bulkAdjust(rows, 5)
    expect(result.skipped).toBe(2)
    expect(result.changed).toBe(5)
    const byKey = new Map(result.change.overrides.map((o) => [overrideKey(o), o.price]))
    expect(byKey.get('profile:andes.s60.marco:blanco')).toBe(17960) // 17.100 × 1,05 = 17.955 → $10
    expect(byKey.get('item:andes.cremona:')).toBe(6410) // 6.405 → $10
    expect(byKey.get('profile:andes.s60.r1:')).toBe(10290)
    expect(result.after).toBeGreaterThan(result.before)
  })

  it('redondeo exacto al peso cuando se pide', () => {
    const result = bulkAdjust(rows, 5, { round: 'exact' })
    expect(result.change.overrides.find((o) => o.id === 'andes.s60.marco' && o.colorId === 'blanco')?.price).toBe(17955)
  })

  it('el deshacer repone los precios propios y quita los nuevos (vuelven al de lista)', () => {
    const result = bulkAdjust(rows, -10)
    expect(result.undo.overrides).toEqual([{ kind: 'profile', id: 'andes.s60.marco', colorId: 'nogal', price: 25000 }])
    expect(result.undo.remove).toContainEqual({ kind: 'profile', id: 'andes.s60.marco', colorId: 'blanco' })
    expect(result.undo.remove).toContainEqual({ kind: 'item', id: 'andes.cremona' })
    expect(result.undo.remove).toHaveLength(4)
  })

  it('0 % no cambia nada y nunca deja precios negativos', () => {
    expect(bulkAdjust(rows, 0).changed).toBe(0)
    expect(bulkAdjust(rows, -150).change.overrides.every((o) => o.price === 0)).toBe(true)
  })

  it('redondeo amable por tramos', () => {
    expect(friendlyRound(512.4)).toBe(512)
    expect(friendlyRound(17955)).toBe(17960)
    expect(friendlyRound(186_449)).toBe(186_400)
  })
})

describe('edición y vuelta a lista', () => {
  const overrides: PriceOverride[] = [
    { kind: 'profile', id: 'andes.s60.r1', colorId: 'blanco', price: 9000 },
    { kind: 'profile', id: 'andes.s60.r1', colorId: 'nogal', price: 9100 },
  ]
  const rows = buildPriceRows(catalog, overrides)
  const steel = rows.find((r) => r.family === 'reinforcement')!

  it('al editar un refuerzo quita sus precios por color para que mande el nuevo', () => {
    const change = editChange(steel, 10000, overrides)
    expect(change.overrides).toEqual([{ kind: 'profile', id: 'andes.s60.r1', price: 10000 }])
    expect(change.remove).toEqual([
      { kind: 'profile', id: 'andes.s60.r1', colorId: 'blanco' },
      { kind: 'profile', id: 'andes.s60.r1', colorId: 'nogal' },
    ])
  })

  it('volver a lista quita todos los precios propios de la fila', () => {
    expect(resetChange(steel, overrides).remove).toHaveLength(2)
    const marco = rows.find((r) => r.key === 'profile:andes.s60.marco:blanco')!
    expect(resetChange(marco, []).remove).toEqual([{ kind: 'profile', id: 'andes.s60.marco', colorId: 'blanco' }])
  })

  it('undoFor separa lo propio de lo de lista', () => {
    const marco = rows.find((r) => r.key === 'profile:andes.s60.marco:blanco')!
    expect(undoFor([marco, steel])).toEqual({
      overrides: [{ kind: 'profile', id: 'andes.s60.r1', price: steel.price }],
      remove: [{ kind: 'profile', id: 'andes.s60.marco', colorId: 'blanco' }],
    })
  })
})

describe('aplicar precios propios al catálogo (respuesta optimista)', () => {
  it('aplica generales primero y luego por color, igual que el servidor', () => {
    const next = applyOverridesToCatalog(catalog, [
      { kind: 'profile', id: 'andes.s60.marco', colorId: 'nogal', price: 30000 },
      { kind: 'profile', id: 'andes.s60.marco', price: 20000 },
      { kind: 'item', id: 'andes.cremona', price: 7000 },
      { kind: 'glass', id: 'vid.dvh', price: 41000 },
    ])
    expect(next.profiles[0].priceByColor).toEqual({ blanco: 20000, nogal: 30000 })
    expect(next.items[0].price).toBe(7000)
    expect(next.glass[0].pricePerM2).toBe(41000)
    expect(catalog.profiles[0].priceByColor.blanco).toBe(17100) // no muta el original
  })

  it('sin cambios devuelve el mismo catálogo', () => {
    expect(applyOverridesToCatalog(catalog, [])).toBe(catalog)
  })
})
