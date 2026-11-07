import { describe, expect, it } from 'vitest'
import { DEFAULT_CUT, DEFAULT_PRICING, defaultBrandSettings } from '../../src/commerce/defaults'
import type { DesignCore, QuoteInput } from '../../src/commerce/evaluate'
import { priceItem } from '../../src/commerce/pricing'
import { buildWorkshopDataWith } from '../../src/commerce/workshop'
import type { Bom, WindowDesign } from '../../src/types'
import { bom, cut, design, fixedWindowBom, glassPiece, itemLine, makeCatalog } from './fixtures'

/** V1/V2: fijos 1000 × 1000; los Winchester llevan además kit, felpa y un vidrio chico. */
const fakeCore: DesignCore = {
  computeBom: (d: WindowDesign): Bom => {
    const base = fixedWindowBom(d.colorId)
    if (d.colorId !== 'winchester') return base
    return {
      ...base,
      glass: [...base.glass, glassPiece({ glassId: 'inc4', name: 'Incoloro 4 mm', width: 600, height: 300, label: 'Sobreluz' })],
      items: [...base.items, itemLine({ itemId: 'kit-ob', qty: 1, unit: 'kit' }), itemLine({ itemId: 'felpa', qty: 3.333, kind: 'accessory', unit: 'm' })],
    }
  },
  computeLayout: (d) => ({
    width: d.width,
    height: d.height,
    frame: { rect: { x: 0, y: 0, w: d.width, h: d.height }, face: 64 },
    mullions: [],
    sashes: [],
    panes: [],
    sliding: [],
    dimensions: [],
    cells: [],
  }),
  describeDesign: (d) => `Paño fijo · PRO6004 · ${d.colorId}`,
}

const quote: QuoteInput = {
  items: [
    { id: 'a', ref: 'V1', qty: 2, design: design(), name: 'Living', location: 'Primer piso' },
    { id: 'b', ref: 'V2', qty: 1, design: design({ colorId: 'winchester' }) },
  ],
  extras: [],
  discountPct: 0,
}

describe('buildWorkshopDataWith', () => {
  const catalog = makeCatalog()
  const data = buildWorkshopDataWith(fakeCore, quote, catalog, DEFAULT_PRICING, { ...DEFAULT_CUT, trimStart: 15, trimEnd: 15 })

  it('incluye cada ventana con diseño, dibujo, BOM y descripción', () => {
    expect(data.windows.map((w) => [w.ref, w.qty, w.description])).toEqual([
      ['V1', 2, 'Paño fijo · PRO6004 · blanco'],
      ['V2', 1, 'Paño fijo · PRO6004 · winchester'],
    ])
    expect(data.windows[0]).toMatchObject({ name: 'Living', location: 'Primer piso' })
    expect(data.windows[0].layout.frame.face).toBe(64)
    expect(data.windows[1].bom.items).toHaveLength(3)
    expect(data.cut).toMatchObject({ trimStart: 15, trimEnd: 15, kerf: 4 })
  })

  it('optimiza perfiles y refuerzos por perfil y color, multiplicando por cantidad', () => {
    const keys = data.optimization.groups.map((g) => g.key)
    expect(keys).toEqual(['pro01|blanco', 'pro05|blanco', 'r1|', 'pro01|winchester', 'pro05|winchester'])
    const frameWhite = data.optimization.groups[0]
    expect(frameWhite).toMatchObject({ code: 'PRO01', name: 'Marco 60/64', colorId: 'blanco', pieces: 8, barsNeeded: 2 })
    expect(frameWhite.bars[0].cuts[0]).toMatchObject({ length: 1006, ref: 'V1', offset: 15, angleStart: 45 })
    expect(frameWhite.bars[0].cuts[0].label).toMatch(/^V1 · /)
    // El refuerzo no tiene color: comparte barras entre ventanas de distinto color.
    const steel = data.optimization.groups[2]
    expect(steel.pieces).toBe(12)
    expect(steel.colorId).toBeUndefined()
    expect(data.optimization.totalPieces).toBe(8 + 8 + 12 + 4 + 4)
    expect(data.optimization.warnings).toEqual([])
  })

  it('agrupa vidrios de medidas idénticas con sus referencias', () => {
    expect(data.glass).toEqual([
      { glassId: 'dvh', name: 'DVH 4+12+4', width: 902, height: 902, qty: 3, area: 0.8136, refs: ['V1 · Paño', 'V2 · Paño'] },
      { glassId: 'inc4', name: 'Incoloro 4 mm', width: 600, height: 300, qty: 1, area: 0.18, refs: ['V2 · Sobreluz'] },
    ])
  })

  it('lista materiales: barras según optimización, envases redondeados y vidrio en m²', () => {
    const find = (code: string, colorId?: string) => data.materials.find((m) => m.code === code && m.colorId === colorId)!
    expect(data.materials.map((m) => m.group)).toEqual(['profile', 'profile', 'profile', 'profile', 'reinforcement', 'hardware', 'accessory', 'accessory', 'glass', 'glass'])
    expect(find('PRO01', 'blanco')).toMatchObject({ qty: 2, bars: 2, unit: 'barra', unitCost: 20000, total: 40000, colorName: 'Blanco', brandId: 'proline', brandName: 'Proline' })
    expect(find('PRO01', 'blanco').meters).toBe(8.05)
    expect(find('R1')).toMatchObject({ group: 'reinforcement', unit: 'barra' })
    // 36 tornillos (12 × 3 ventanas) → 1 caja de 1000.
    expect(find('T3919')).toMatchObject({ qty: 1, unit: 'caja', total: 27000, consumption: 36, consumptionUnit: 'u', brandName: 'Insumos Genéricos' })
    expect(find('KIT-OB')).toMatchObject({ group: 'hardware', qty: 1, total: 12000, brandName: 'Vorne' })
    expect(find('FELPA')).toMatchObject({ qty: 3.34, unit: 'm', total: Math.round(3.34 * 100) })
    // Vidrio: DVH 3 × 902 × 902 mm; incoloro chico cobra el mínimo de 0,35 m². Se muestra 2,44 m²,
    // pero el total sale de los m² exactos (2,440812 × $40.000 = $97.632, no 2,44 × 40.000 = $97.600).
    expect(find('dvh')).toMatchObject({ qty: 2.44, unit: 'm²', consumption: 2.4408, total: 97632, brandName: 'Cristales del Sur' })
    expect(find('inc4')).toMatchObject({ qty: 0.35, total: Math.round(0.35 * 10000), brandId: 'proline' })
  })

  it('arma órdenes de compra por marca y costos de la obra', () => {
    expect(data.purchaseOrders.map((o) => o.brandName)).toEqual(['Proline', 'Vorne', 'Insumos Genéricos', 'Cristales del Sur'])
    // El incoloro no tiene marca: se compra con la marca de la línea.
    expect(data.purchaseOrders[0].lines.map((l) => l.code)).toContain('inc4')
    for (const order of data.purchaseOrders) {
      expect(order.total).toBe(order.lines.reduce((s, l) => s + (l.total ?? 0), 0))
    }
    const sum = data.materials.reduce((s, m) => s + (m.total ?? 0), 0)
    expect(data.costs.total).toBe(sum)
    expect(data.costs.materials.profiles).toBe(
      data.materials.filter((m) => m.group === 'profile').reduce((s, m) => s + (m.total ?? 0), 0),
    )
    const v1 = priceItem(fixedWindowBom(), design(), catalog, DEFAULT_PRICING, { qty: 2 })
    expect(data.costs.perWindow[0]).toEqual({ ref: 'V1', qty: 2, unitCost: v1.cost, unitPrice: v1.unitNet })
  })

  it('usa el disco y despunte de la marca cuando son mayores que los del taller', () => {
    const withBrand = makeCatalog([{ ...defaultBrandSettings('proline'), kerf: 5, trim: 20 }])
    const result = buildWorkshopDataWith(fakeCore, quote, withBrand, DEFAULT_PRICING, DEFAULT_CUT)
    const bar = result.optimization.groups[0].bars[0]
    expect(bar.cuts[0].offset).toBe(20)
    // Piezas a 45°: el disco de 5 mm ocupa 7,1 mm en el eje de la barra.
    expect(bar.kerfLoss).toBeCloseTo(bar.cuts.length * 7.1, 5)
  })

  it('usa retazos de bodega y no los compra', () => {
    const result = buildWorkshopDataWith(fakeCore, quote, catalog, DEFAULT_PRICING, DEFAULT_CUT, {
      offcuts: [{ key: 'pro05|winchester', length: 4000 }],
    })
    const group = result.optimization.groups.find((g) => g.key === 'pro05|winchester')!
    expect(group.barsNeeded).toBe(0)
    const material = result.materials.find((m) => m.code === 'PRO05' && m.colorId === 'winchester')!
    expect(material).toMatchObject({ qty: 0, total: 0 })
    expect(result.purchaseOrders.flatMap((o) => o.lines).some((l) => l === material)).toBe(false)
  })

  it('una cotización vacía no rompe nada', () => {
    const empty = buildWorkshopDataWith(fakeCore, { items: [], extras: [], discountPct: 0 }, catalog, {}, {})
    expect(empty).toMatchObject({ windows: [], glass: [], materials: [], purchaseOrders: [], costs: { total: 0, perWindow: [] } })
    expect(empty.optimization.totalBars).toBe(0)
  })

  it('ventanas sin precio de perfil siguen produciendo (costo $0)', () => {
    const core: DesignCore = { ...fakeCore, computeBom: () => bom({ cuts: [cut({ profileId: 'pro03', code: 'PRO03', length: 900, colorId: 'antracita' })] }) }
    const result = buildWorkshopDataWith(core, { items: [{ id: 'z', ref: 'V9', qty: 1, design: design({ colorId: 'antracita' }) }], extras: [], discountPct: 0 }, catalog, DEFAULT_PRICING, DEFAULT_CUT)
    expect(result.materials[0]).toMatchObject({ code: 'PRO03', qty: 1, unitCost: 0, total: 0, colorName: 'Antracita' })
  })
})
