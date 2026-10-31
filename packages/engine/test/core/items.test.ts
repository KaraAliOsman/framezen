/**
 * Herrajes y accesorios del despiece: conectores por travesaño, variantes por color, unidades
 * de consumo y avisos de herrajes fuera de rango en lenguaje de taller (auditoría OT 385).
 */
import { describe, expect, it } from 'vitest'
import { computeBom, createDesign } from '../../src/core'
import { gapText, humanLimit, mergeRanges, rangesText } from '../../src/core/hardware'
import type { AccessoryRule, Bom, Catalog, DesignNode, HardwareRule, Item, Line, WindowDesign } from '../../src/types'
import { design, ITEMS, PRO6004, PROSLD70, prolineCatalog } from './fixtures'

const itemQty = (bom: Bom, itemId: string) => bom.items.filter((i) => i.itemId === itemId).reduce((a, i) => a + i.qty, 0)

const twoFixed: DesignNode = {
  id: 'n1',
  type: 'split',
  dir: 'vertical',
  sizes: [1192.5, 1192.5],
  children: [
    { id: 'f1', type: 'leaf', opening: { kind: 'fixed' } },
    { id: 'f2', type: 'leaf', opening: { kind: 'fixed' } },
  ],
}
const doorWithTransom: DesignNode = {
  id: 'n1',
  type: 'split',
  dir: 'horizontal',
  sizes: [400, 1840],
  children: [
    { id: 'top', type: 'leaf', opening: { kind: 'fixed' } },
    { id: 'door', type: 'leaf', opening: { kind: 'door', hinge: 'right', direction: 'in' } },
  ],
}
const casementAwning: DesignNode = {
  id: 'n1',
  type: 'split',
  dir: 'vertical',
  sizes: [596.5, 596.5],
  children: [
    { id: 'l', type: 'leaf', opening: { kind: 'casement', hinge: 'left', direction: 'out' } },
    { id: 'r', type: 'leaf', opening: { kind: 'awning', direction: 'out' } },
  ],
}

const V1 = design({ width: 856, height: 2240, colorId: 'winchester', root: doorWithTransom })
const V7 = design({ width: 1193, height: 1350, root: casementAwning })
const V9 = design({ width: 2385, height: 900, colorId: 'antracita', root: twoFixed })

describe('conectores metálicos: 2 por travesaño (per: «mullion»)', () => {
  const catalog = prolineCatalog()

  it('V9 dos fijos 2385 × 900: 1 travesaño → 2 conectores', () => {
    expect(itemQty(computeBom(V9, catalog), 'A-CT')).toBe(2)
  })

  it('V1 puerta con sobreluz y V7 abatir + proyectante: 2 cada una (OT 385)', () => {
    expect(itemQty(computeBom(V1, catalog), 'A-CT')).toBe(2)
    expect(itemQty(computeBom(V7, catalog), 'A-CT')).toBe(2)
  })

  it('tres paños fijos: 2 travesaños → 4 conectores', () => {
    const bom = computeBom(createDesign('fixed_3', { lineId: 'pro6004', width: 2400, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' }), catalog)
    expect(itemQty(bom, 'A-CT')).toBe(4)
  })

  it('sin travesaño fijo no lleva: paño fijo y unión francesa', () => {
    const fixed = computeBom(createDesign('fixed', { lineId: 'pro6004', width: 1000, height: 1000, colorId: 'blanco', glassId: 'dvh-4-12-4' }), catalog)
    expect(fixed.items.some((i) => i.itemId === 'A-CT')).toBe(false)
    const french = computeBom(createDesign('casement_double', { lineId: 'pro6004', width: 1200, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' }), catalog)
    expect(french.items.some((i) => i.itemId === 'A-CT')).toBe(false)
  })

  it('una regla que el motor no sabe contar avisa en vez de cotizar 0 en silencio', () => {
    const rule = { id: 'raro', itemId: 'A-CT', per: 'floor', qty: 2 } as unknown as AccessoryRule
    const cat = prolineCatalog({ lines: [{ ...PRO6004, accessoryRules: [rule] }, PROSLD70] })
    const bom = computeBom(V9, cat)
    expect(bom.items.some((i) => i.itemId === 'A-CT')).toBe(false)
    expect(bom.warnings.find((w) => w.code === 'accessory_rule_unknown')).toMatchObject({ level: 'info' })
  })
})

describe('variantes por color de herrajes y accesorios', () => {
  const extra: Item[] = [
    { id: 'H-B3B', brandId: 'proline', kind: 'hardware', code: 'H-B3B', name: 'Bisagra 3D blanca', unit: 'u', price: 9000 },
    { id: 'A-TDM', brandId: 'proline', kind: 'accessory', code: 'A-TDM', name: 'Tapa desagüe marrón', unit: 'u', price: 150 },
  ]
  const hardwareRules: HardwareRule[] = PRO6004.hardwareRules.map((r) =>
    r.id === 'bisagra-puerta' ? { ...r, itemId: 'H-B3B', byColor: { winchester: 'H-B3D' } } : r,
  )
  const accessoryRules: AccessoryRule[] = [
    ...PRO6004.accessoryRules,
    { id: 'desague', itemId: 'A-TDB', per: 'window', qty: 2, byColor: { winchester: 'A-TDM', antracita: 'A-TDN' } },
    { id: 'silicona', itemId: 'S-BL', per: 'perimeter_m', qty: 0.2, byColor: { winchester: 'S-TO', antracita: 'S-NE' } },
  ]
  const withVariants = (patch: Partial<Line> = {}): Catalog =>
    prolineCatalog({ lines: [{ ...PRO6004, hardwareRules, accessoryRules, ...patch }, PROSLD70], items: [...ITEMS, ...extra] })
  const catalog = withVariants()

  it('V1 Winchester: bisagra 3D marrón, tapa de desagüe marrón y silicona toffee (OT 385)', () => {
    const bom = computeBom(V1, catalog)
    expect(itemQty(bom, 'H-B3D')).toBe(3)
    expect(itemQty(bom, 'H-B3B')).toBe(0)
    expect(itemQty(bom, 'A-TDM')).toBe(2)
    expect(itemQty(bom, 'A-TDB')).toBe(0)
    expect(itemQty(bom, 'S-TO')).toBeGreaterThan(0)
    expect(itemQty(bom, 'S-BL')).toBe(0)
  })

  it('V9 Antracita: tapa de desagüe negra y silicona negra', () => {
    const bom = computeBom(V9, catalog)
    expect(itemQty(bom, 'A-TDN')).toBe(2)
    expect(itemQty(bom, 'S-NE')).toBeGreaterThan(0)
    expect(itemQty(bom, 'A-TDB') + itemQty(bom, 'S-BL')).toBe(0)
  })

  it('un color sin variante usa el ítem base (blanco)', () => {
    const bom = computeBom({ ...V1, colorId: 'blanco' }, catalog)
    expect(itemQty(bom, 'H-B3B')).toBe(3)
    expect(itemQty(bom, 'A-TDB')).toBe(2)
  })

  it('bicolor: los herrajes miran el interior y los accesorios el exterior', () => {
    const bicolor: WindowDesign = { ...V1, colorId: 'winchester', colorInId: 'blanco' }
    const bom = computeBom(bicolor, catalog)
    expect(itemQty(bom, 'H-B3B')).toBe(3) // bisagra del interior blanco
    expect(itemQty(bom, 'A-TDM')).toBe(2) // tapa del exterior Winchester
    const inside = computeBom({ ...V1, colorId: 'blanco', colorInId: 'winchester' }, catalog)
    expect(itemQty(inside, 'H-B3D')).toBe(3)
    expect(itemQty(inside, 'A-TDB')).toBe(2)
  })

  it('la regla puede fijar el lado que manda (colorSide)', () => {
    const rules = hardwareRules.map((r): HardwareRule => (r.id === 'bisagra-puerta' ? { ...r, colorSide: 'exterior' } : r))
    const bom = computeBom({ ...V1, colorId: 'winchester', colorInId: 'blanco' }, withVariants({ hardwareRules: rules }))
    expect(itemQty(bom, 'H-B3D')).toBe(3)
  })

  it('una variante que ya no está en el catálogo cae al ítem base, sin romper', () => {
    const rules = hardwareRules.map((r): HardwareRule => (r.id === 'bisagra-puerta' ? { ...r, byColor: { winchester: 'no-existe' } } : r))
    const bom = computeBom(V1, withVariants({ hardwareRules: rules }))
    expect(itemQty(bom, 'H-B3B')).toBe(3)
    expect(bom.warnings.some((w) => w.code === 'item_missing')).toBe(false)
  })
})

describe('unidades de consumo en el despiece', () => {
  it('los tornillos de una caja de 1.000 se cuentan en unidades, no en cajas', () => {
    const line = computeBom(V7, prolineCatalog()).items.find((i) => i.itemId === 'A-T19')!
    expect(line).toMatchObject({ qty: 54, unit: 'u' })
  })

  it('un rollo se cuenta en metros y un ítem sin envase conserva su unidad', () => {
    const items: Item[] = [
      ...ITEMS,
      { id: 'burlete', brandId: 'proline', kind: 'accessory', code: 'BUR', name: 'Burlete (rollo 100 m)', unit: 'm', packSize: 100, price: 26900 },
    ]
    const accessoryRules: AccessoryRule[] = [
      { id: 'burlete', itemId: 'burlete', per: 'glass_m', qty: 2 },
      { id: 'silicona', itemId: 'S-BL', per: 'perimeter_m', qty: 0.2 },
    ]
    const bom = computeBom(V9, prolineCatalog({ lines: [{ ...PRO6004, accessoryRules }, PROSLD70], items }))
    expect(bom.items.find((i) => i.itemId === 'burlete')?.unit).toBe('m')
    expect(bom.items.find((i) => i.itemId === 'S-BL')?.unit).toBe('cartucho')
  })
})

describe('herrajes fuera de rango: un aviso corto, con el hueco', () => {
  // Cremonas de corredera PROSLD70 tal como las arma el importador (sin cremona 1400–1600).
  const CREMONAS: [number, number][] = [
    [300, 600],
    [600.1, 800],
    [800.1, 1000],
    [1000.1, 1200],
    [1200.1, 1400],
    [1600, 1800],
    [1800.1, 2000],
    [2000.1, 2001],
  ]

  it('fusiona rangos contiguos y redondea los límites', () => {
    expect(mergeRanges(CREMONAS)).toEqual([
      [300, 1400],
      [1600, 2001],
    ])
    expect(rangesText(CREMONAS)).toBe('de 300 a 1.400 y de 1.600 a 2.000 mm')
    expect(rangesText([[undefined, 600], [600.1, undefined]])).toBe('cualquier medida')
    expect([humanLimit(600.1), humanLimit(2001), humanLimit(1399.9), humanLimit(455)]).toEqual([600, 2000, 1400, 455])
  })

  it('describe el hueco por sus bordes', () => {
    expect(gapText(CREMONAS, 1412)).toBe('cubre hasta 1.400 y desde 1.600')
    expect(gapText(CREMONAS, 250)).toBe('cubre desde 300')
    expect(gapText(CREMONAS, 2100)).toBe('cubre hasta 2.000')
  })

  it('corredera 2 hojas 2400 × 1500: un solo aviso para las dos hojas iguales', () => {
    const rules: HardwareRule[] = [
      { id: 'carros', openings: [], itemId: 'carro', qty: 2 },
      ...CREMONAS.map(([minHeight, maxHeight], i): HardwareRule => ({ id: `crem-${i}`, openings: [], itemId: 'cremona-corr', qty: 1, minHeight, maxHeight })),
    ]
    const cat = prolineCatalog({ lines: [PRO6004, { ...PROSLD70, hardwareRules: rules }] })
    const d = createDesign('sliding_2', { lineId: 'prosld70', width: 2400, height: 1500, colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const bom = computeBom(d, cat)
    const out = bom.warnings.filter((w) => w.code === 'hardware_out_of_range')
    expect(out).toHaveLength(1)
    expect(out[0].message).toBe('No hay herraje de PROSLD70 para hojas de 1.412 mm de alto (cubre hasta 1.400 y desde 1.600). Las 2 hojas se cotizan sin él.')
    expect(out[0].nodeId).toBeUndefined()
    // Lo que sí calza (carros) se cotiza igual.
    expect(itemQty(bom, 'carro')).toBe(4)
    expect(itemQty(bom, 'cremona-corr')).toBe(0)
  })
})
