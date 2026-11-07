import { describe, expect, it } from 'vitest'
import { DEFAULT_CUT, DEFAULT_PRICING, defaultBrandSettings, resolvePricing } from '../../src/commerce/defaults'
import { explainPrice, priceItem } from '../../src/commerce/pricing'
import { quoteTotals } from '../../src/commerce/totals'
import type { BrandSettings, Catalog, PricingSettings } from '../../src/types'
import { PLAIN, bom, cut, design, fixedWindowBom, glassPiece, itemLine, makeCatalog } from './fixtures'

const plain = (over: Partial<PricingSettings> = {}): PricingSettings => ({ ...PLAIN, ...over })

describe('valores por defecto', () => {
  it('DEFAULT_PRICING, DEFAULT_CUT y defaultBrandSettings siguen la SPEC', () => {
    expect(DEFAULT_PRICING).toEqual({
      marginMode: 'margin',
      marginPct: 40,
      laborPerM2: 12000,
      installMode: 'none',
      installValue: 0,
      wastePct: 5,
      roundTo: 100,
      ivaPct: 19,
      chargeFullBars: false,
    })
    expect(DEFAULT_CUT).toEqual({ barLength: 5800, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 })
    expect(defaultBrandSettings('proline')).toEqual({
      brandId: 'proline',
      enabled: true,
      trim: 0,
      kerf: 4,
      discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 },
    })
  })

  it('resolvePricing aplica solo los campos definidos de la cotización y sanea el resto', () => {
    const p = resolvePricing({ ...DEFAULT_PRICING, wastePct: Number.NaN }, { marginPct: 30, laborPerM2: undefined })
    expect(p.marginPct).toBe(30)
    expect(p.laborPerM2).toBe(12000)
    expect(p.wastePct).toBe(5)
  })
})

describe('priceItem · casos dorados', () => {
  it('prueba unitaria del motor anterior: materiales 100, 2 m², MO 20/m², instalación 15, margen 20 % → 194', () => {
    const catalog: Catalog = { ...makeCatalog(), items: [{ id: 'cien', brandId: 'vorne', kind: 'hardware', code: 'C', name: 'Cien', unit: 'u', price: 100 }] }
    const b = bom({ area: 2, items: [itemLine({ itemId: 'cien', qty: 1 })] })
    const settings = plain({ marginPct: 20, laborPerM2: 20, installMode: 'per_unit', installValue: 15 })
    const price = priceItem(b, design(), catalog, settings, { qty: 3 })
    expect(price.materialsTotal).toBe(100)
    expect(price.cost).toBe(155)
    expect(price.exactUnitPrice).toBe(193.75)
    expect(price.unitNet).toBe(194)
    expect(price.totalNet).toBe(582)
    const totals = quoteTotals([{ price }], { discountPct: 0, extras: [], ivaPct: 19 })
    expect(totals).toMatchObject({ net: 582, iva: 111, total: 693 })

    // Con merma 10 % y sin instalación aparte → costo 150, neto 188.
    const withWaste = priceItem(b, design(), catalog, plain({ marginPct: 20, laborPerM2: 20, wastePct: 10 }))
    expect(withWaste.waste).toBe(10)
    expect(withWaste.cost).toBe(150)
    expect(withWaste.unitNet).toBe(188)
  })

  it('serie sintética PRO6004 fija 1200 × 1100 → $108.000 c/u, 3 u $324.000 + IVA = $385.560', () => {
    const base = makeCatalog()
    const catalog: Catalog = {
      ...base,
      profiles: [
        { id: 'sf', lineId: 'pro6004', code: 'PRO-F', name: 'Marco sintético', role: 'frame', barLength: 6500, priceByColor: { blanco: 12000 } },
        { id: 'sj', lineId: 'pro6004', code: 'PRO-J', name: 'Junquillo sintético', role: 'bead', barLength: 6500, priceByColor: { blanco: 5000 } },
        { id: 'sa', lineId: 'pro6004', code: 'AC', name: 'Acero', role: 'reinforcement', barLength: 6000, priceByColor: { '*': 8000 } },
      ],
      glass: [{ id: 'g24', name: 'Vidrio 24 mm', kind: 'dvh', thickness: 24, pricePerM2: 20000 }],
      items: [{ id: 'tor', brandId: 'generico', kind: 'consumable', code: 'TOR', name: 'Tornillo', unit: 'u', price: 20 }],
    }
    const frame = (length: number) => cut({ profileId: 'sf', code: 'PRO-F', length, qty: 2, barLength: 6500 })
    const bead = (length: number) => cut({ kind: 'bead', profileId: 'sj', code: 'PRO-J', role: 'bead', length, qty: 2, barLength: 6500 })
    const steel = (length: number) =>
      cut({ kind: 'reinforcement', profileId: 'sa', code: 'AC', role: 'reinforcement', length, qty: 2, barLength: 6000 })
    const b = bom({
      area: 1.32,
      cuts: [frame(1206), frame(1106), bead(1100), bead(1000), steel(1176), steel(1076)],
      glass: [glassPiece({ glassId: 'g24', width: 1100, height: 1000 })],
      items: [itemLine({ itemId: 'tor', qty: 20, kind: 'consumable' })],
    })
    const settings = plain({ marginPct: 35, laborPerM2: 15000, installMode: 'per_unit', installValue: 10000, roundTo: 1000 })
    const price = priceItem(b, design({ width: 1200, height: 1100, glassId: 'g24' }), catalog, settings, { qty: 3 })
    expect(price.materials).toEqual({ profiles: 8537 + 3231, reinforcement: 6005, hardware: 0, glass: 22000, accessories: 400 })
    expect(price.materialsTotal).toBe(40173)
    expect(price.labor).toBe(19800)
    expect(price.install).toBe(10000)
    expect(price.cost).toBe(69973)
    expect(price.unitNet).toBe(108000)
    expect(price.totalNet).toBe(324000)
    const totals = quoteTotals([{ price }], { discountPct: 0, extras: [], ivaPct: 19 })
    expect(totals).toMatchObject({ subtotal: 324000, net: 324000, iva: 61560, total: 385560, units: 3 })
    // Las líneas cuadran con las familias.
    const sum = price.lines.filter((l) => l.group !== 'labor' && l.group !== 'install').reduce((s, l) => s + l.total, 0)
    expect(sum).toBe(price.materialsTotal)
  })

  it('costos por unidad de compra: pieza 2.246 mm, DVH 902 × 902, tornillería por caja y felpa por metro', () => {
    const catalog = makeCatalog([{ ...defaultBrandSettings('generico'), discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 35 } }])
    const b = bom({
      cuts: [cut({ length: 2246, colorId: 'winchester' })],
      glass: [glassPiece({ width: 902, height: 902 })],
      items: [
        itemLine({ itemId: 'tornillo-ref', qty: 24, kind: 'consumable' }),
        itemLine({ itemId: 'tornillo-inst', qty: 8, kind: 'consumable' }),
        itemLine({ itemId: 'felpa', qty: 14.2, kind: 'accessory', unit: 'm' }),
      ],
    })
    const price = priceItem(b, design({ colorId: 'winchester' }), catalog, plain())
    const line = (code: string) => price.lines.find((l) => l.code === code)!
    // Marco Winchester $30.000 la barra de 5,8 m → 2,246 m = $11.617.
    expect(line('PRO01')).toMatchObject({ total: 11617, unit: 'm', qty: 2.246, name: 'Marco 60/64 · Winchester' })
    // DVH 0,813604 m² × $40.000 = $32.544.
    expect(price.lines.find((l) => l.group === 'glass')).toMatchObject({ total: 32544, unit: 'm²', unitCost: 40000 })
    // Tornillo 3,9×19: caja $27.000 / 1000 u, con el 35 % de la marca en accesorios.
    expect(line('T3919')).toMatchObject({ qty: 24, unit: 'u' })
    expect(line('T3919').total).toBe(Math.round(24 * (27000 * 0.65) / 1000))
    // Tornillo 7,5×92: lista $50.000 caja 200, dcto 35 % → 162,5 c/u → $1.300.
    expect(line('T7592')).toMatchObject({ unitCost: 162.5, total: 1300 })
    // Felpa: 14,2 m × $100 con 35 % de descuento.
    expect(line('FELPA').total).toBe(Math.round(14.2 * 100 * 0.65))
    expect(price.warnings).toEqual([])
  })

  it('sin descuentos: tornillería 24 u a caja $27.000/1000 → $648 y felpa 14,2 m → $1.420', () => {
    const b = bom({
      items: [itemLine({ itemId: 'tornillo-ref', qty: 24, kind: 'consumable' }), itemLine({ itemId: 'felpa', qty: 14.2, kind: 'accessory', unit: 'm' })],
    })
    const price = priceItem(b, design(), makeCatalog(), plain())
    expect(price.lines.map((l) => l.total)).toEqual([648, 1420])
    expect(price.materials.accessories).toBe(2068)
  })

  it('precio = costo × 2,0 (recargo 100 %): costo $190.000 → $380.000, margen 50 %', () => {
    const catalog: Catalog = { ...makeCatalog(), items: [{ id: 'v1', brandId: 'vorne', kind: 'hardware', code: 'V1', name: 'Costo V1', unit: 'u', price: 190000 }] }
    const price = priceItem(bom({ area: 1.917, items: [itemLine({ itemId: 'v1', qty: 1 })] }), design(), catalog, plain({ marginMode: 'markup', marginPct: 100 }))
    expect(price.cost).toBe(190000)
    expect(price.unitNet).toBe(380000)
    expect(price.marginPct).toBe(50)
  })
})

describe('priceItem · reglas', () => {
  it('aplica los descuentos de la marca de cada material y el reemplazo de «Mis precios»', () => {
    const settings: BrandSettings[] = [
      { ...defaultBrandSettings('proline'), discounts: { profiles: 35, reinforcement: 35, hardware: 0, glass: 0, accessories: 0 } },
      { ...defaultBrandSettings('cristales'), discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 20, accessories: 0 } },
    ]
    const b = fixedWindowBom()
    const price = priceItem(b, design(), makeCatalog(settings), plain())
    const pro01 = price.lines.find((l) => l.code === 'PRO01')!
    expect(pro01.total).toBe(Math.round((4024 / 5800) * 20000 * 0.65))
    expect(price.lines.find((l) => l.code === 'R1')!.total).toBe(Math.round((3568 / 5800) * 8000 * 0.65))
    expect(price.materials.glass).toBe(Math.round(0.813604 * 40000 * 0.8))
    // El tornillo es de otra marca (sin ajustes): sin descuento.
    expect(price.lines.find((l) => l.code === 'T3919')!.total).toBe(Math.round(12 * 27))

    const preview = priceItem(b, design(), makeCatalog(settings), plain(), {
      brandSettings: { ...defaultBrandSettings('proline'), discounts: { profiles: 50, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } },
    })
    expect(preview.lines.find((l) => l.code === 'PRO01')!.total).toBe(Math.round((4024 / 5800) * 20000 * 0.5))
    expect(preview.materials.glass).toBe(price.materials.glass)
  })

  it('cobra el área mínima del vidrio por pieza', () => {
    const b = bom({ glass: [glassPiece({ glassId: 'inc4', width: 600, height: 300, qty: 2 })] })
    const price = priceItem(b, design(), makeCatalog(), plain())
    const glass = price.lines.find((l) => l.group === 'glass')!
    expect(glass.qty).toBe(0.7)
    expect(glass.total).toBe(Math.round(0.7 * 10000))
  })

  it('precio $0 o faltante = aviso (nunca error), la línea se mantiene en $0 y el ítem queda fuera del total', () => {
    const b = bom({
      cuts: [cut({ profileId: 'pro03', code: 'PRO03', role: 'mullion', length: 900, colorId: 'winchester' })],
      items: [itemLine({ itemId: 'bisagra', qty: 3 })],
    })
    const price = priceItem(b, design({ colorId: 'winchester' }), makeCatalog(), plain())
    expect(price.warnings.map((w) => w.message)).toEqual([
      'El perfil PRO03 · Travesaño 80 no tiene precio en Winchester: queda fuera del total.',
      'El herraje Bisagra 3D no tiene precio: queda fuera del total.',
      'Esta ventana queda fuera del total hasta tener precio: falta PRO03 (Winchester) y 1 más.',
    ])
    expect(price.warnings.every((w) => w.level === 'warn')).toBe(true)
    expect(price.lines).toHaveLength(2)
    expect(price.materialsTotal).toBe(0)
    expect(price.unitNet).toBe(0)
    expect(price.totalNet).toBe(0)
    expect(price.pending?.map((p) => p.code)).toEqual(['price_missing', 'price_missing'])
  })

  it('con muchos faltantes resume en un solo aviso', () => {
    const b = bom({
      items: ['bisagra', 'cremona', 'compas', 'no-existe'].map((itemId) => itemLine({ itemId, qty: 1, name: 'Pieza rara' })),
      cuts: [cut({ profileId: 'pro03', code: 'PRO03', length: 900, colorId: 'winchester' })],
    })
    const price = priceItem(b, design({ colorId: 'winchester' }), makeCatalog(), plain())
    const missing = price.warnings.filter((w) => w.code === 'price_missing')
    expect(missing).toHaveLength(1)
    expect(missing[0].message).toMatch(/^Hay 5 materiales sin precio \(PRO03 en Winchester, Bisagra 3D y 3 más\)/)
  })

  it('margen sobre venta con ajuste de marca y redondeo hacia arriba', () => {
    const catalog = makeCatalog([{ ...defaultBrandSettings('proline'), marginAdjust: 5 }])
    const price = priceItem(fixedWindowBom(), design(), catalog, { ...DEFAULT_PRICING })
    expect(price.targetMarginPct).toBe(45)
    expect(price.unitNet % 100).toBe(0)
    expect(price.unitNet).toBeGreaterThanOrEqual(price.cost / 0.55)
    expect(price.unitNet - price.cost / 0.55).toBeLessThan(100)
    expect(price.waste).toBe(Math.round(price.materialsTotal * 0.05))
    expect(price.labor).toBe(12000)
  })

  it('margen imposible (≥ 100 %) se limita con aviso; nunca divide por cero', () => {
    const price = priceItem(fixedWindowBom(), design(), makeCatalog(), plain({ marginPct: 120 }))
    expect(price.targetMarginPct).toBe(95)
    expect(price.warnings.some((w) => w.code === 'margin_invalid')).toBe(true)
    expect(Number.isFinite(price.unitNet)).toBe(true)
  })

  it('instalación por m² y precio manual con avisos', () => {
    const settings = plain({ marginPct: 40, installMode: 'per_m2', installValue: 10000 })
    const auto = priceItem(fixedWindowBom(), design(), makeCatalog(), settings)
    expect(auto.install).toBe(10000)
    expect(auto.lines.find((l) => l.group === 'install')).toMatchObject({ unit: 'm²', qty: 1, unitCost: 10000 })

    const manual = priceItem(fixedWindowBom(), design(), makeCatalog(), settings, { manualUnitPrice: 150000.4, qty: 2 })
    expect(manual.unitNet).toBe(150000)
    expect(manual.totalNet).toBe(300000)
    expect(manual.manual).toBe(true)
    expect(manual.calculatedUnitNet).toBe(auto.unitNet)
    expect(manual.warnings.find((w) => w.code === 'manual_price')?.level).toBe('info')

    const low = priceItem(fixedWindowBom(), design(), makeCatalog(), settings, { manualUnitPrice: 1000 })
    expect(low.warnings.some((w) => w.code === 'below_cost')).toBe(true)
    expect(low.marginPct).toBeLessThan(0)
  })

  it('barras completas: cobra la barra entera y no aplica merma a perfiles', () => {
    const settings = plain({ chargeFullBars: true, wastePct: 10 })
    const price = priceItem(fixedWindowBom(), design(), makeCatalog(), settings)
    expect(price.lines.find((l) => l.code === 'PRO01')).toMatchObject({ unit: 'barra', qty: 1, unitCost: 20000, total: 20000 })
    expect(price.materials.profiles).toBe(20000 + 5000)
    expect(price.materials.reinforcement).toBe(8000)
    const nonProfile = price.materials.glass + price.materials.accessories
    expect(price.waste).toBe(Math.round(nonProfile * 0.1))

    // Dos unidades: 8 × 1006 caben en 2 barras → una barra por ventana.
    const two = priceItem(fixedWindowBom(), design(), makeCatalog(), settings, { qty: 2 })
    expect(two.lines.find((l) => l.code === 'PRO01')!.total).toBe(20000)
    expect(explainPrice(price).map((l) => l.label)).toContain('Merma de vidrios, herrajes y accesorios (10 %)')
  })

  it('lee el catálogo actualizado aunque se reemplace una entrada en el mismo arreglo', () => {
    const catalog = makeCatalog()
    const b = bom({ items: [itemLine({ itemId: 'kit-ob', qty: 1 })] })
    expect(priceItem(b, design(), catalog, plain()).materials.hardware).toBe(12000)
    catalog.items[0] = { ...catalog.items[0], price: 15000 }
    expect(priceItem(b, design(), catalog, plain()).materials.hardware).toBe(15000)
    catalog.items[0] = { ...catalog.items[0], id: 'kit-nuevo' }
    const gone = priceItem(b, design(), catalog, plain())
    expect(gone.materials.hardware).toBe(0)
    expect(gone.warnings[0].message).toContain('no está en tu catálogo')
  })

  it('datos incompletos nunca lanzan: BOM vacío, cantidad inválida, línea desconocida', () => {
    const price = priceItem(bom({ area: 0 }), design({ lineId: 'otra', width: 1500, height: 1000 }), makeCatalog(), { ...DEFAULT_PRICING }, { qty: Number.NaN })
    expect(price.qty).toBe(1)
    expect(price.labor).toBe(18000)
    expect(price.area).toBe(1.5)
    const codes = price.warnings.map((w) => w.code)
    expect(codes).toEqual(expect.arrayContaining(['line_missing', 'qty_invalid', 'no_materials']))
    // BOM malformado (sin arreglos) tampoco rompe.
    const broken = priceItem({} as never, design(), makeCatalog(), {})
    expect(broken.cost).toBe(12000)
  })
})

describe('explainPrice', () => {
  it('desglose humano que cuadra: sumandos = costo; costo + ganancia + redondeo = precio', () => {
    const catalog: Catalog = { ...makeCatalog(), items: [{ id: 'kit', brandId: 'vorne', kind: 'hardware', code: 'K', name: 'Kit', unit: 'kit', price: 40173 }] }
    const settings = plain({ marginPct: 35, laborPerM2: 15000, installMode: 'per_unit', installValue: 10000, roundTo: 1000, wastePct: 5 })
    const price = priceItem(bom({ area: 1.32, items: [itemLine({ itemId: 'kit', qty: 1 })] }), design(), catalog, settings, { qty: 3 })
    const lines = explainPrice(price)
    expect(lines.map((l) => l.label)).toEqual([
      'Herrajes',
      'Merma de material (5 %)',
      'Mano de obra (1,32 m² × $15.000)',
      'Instalación',
      'Costo directo',
      'Tu ganancia (margen 35 %)',
      'Redondeo a $1.000',
      'Precio por unidad (neto)',
      'Total por 3 unidades (neto)',
    ])
    const parts = lines.slice(0, 4).reduce((s, l) => s + l.amount, 0)
    expect(parts).toBe(price.cost)
    const profit = lines.find((l) => l.label.startsWith('Tu ganancia'))!.amount
    const rounding = lines.find((l) => l.label.startsWith('Redondeo'))!.amount
    expect(price.cost + profit + rounding).toBe(price.unitNet)
    expect(lines.at(-1)).toMatchObject({ amount: price.totalNet, kind: 'total' })
  })

  it('con precio manual bajo el costo muestra la pérdida', () => {
    const price = priceItem(fixedWindowBom(), design(), makeCatalog(), plain({ marginPct: 40 }), { manualUnitPrice: 1000 })
    const lines = explainPrice(price)
    expect(lines.some((l) => l.label === 'Pérdida: el precio queda bajo el costo' && l.amount < 0)).toBe(true)
    expect(lines.at(-1)).toMatchObject({ label: 'Precio manual por unidad (neto)', amount: 1000 })
  })

  it('funciona con un ItemPrice simple (sin detalle)', () => {
    const lines = explainPrice({
      materials: { profiles: 100, reinforcement: 0, hardware: 0, glass: 50, accessories: 0 },
      materialsTotal: 150,
      waste: 0,
      labor: 0,
      install: 0,
      cost: 150,
      unitNet: 250,
      qty: 1,
      totalNet: 250,
      marginPct: 40,
      lines: [],
      warnings: [],
    })
    expect(lines.map((l) => [l.label, l.amount])).toEqual([
      ['Perfiles', 100],
      ['Vidrios', 50],
      ['Costo directo', 150],
      ['Tu ganancia (margen 40 %)', 100],
      ['Precio por unidad (neto)', 250],
    ])
  })
})

describe('largo de barra: del perfil, luego de Ajustes, nunca inventado', () => {
  const sinLargo = (): Catalog => {
    const catalog = makeCatalog()
    return { ...catalog, profiles: catalog.profiles.map((p) => ({ ...p, barLength: 0 })) }
  }
  const piezas = () => {
    const b = fixedWindowBom()
    return { ...b, cuts: b.cuts.map((c) => ({ ...c, barLength: 0 })) }
  }

  it('sin largo en el perfil usa el de Ajustes que llega en `opts.cut`', () => {
    const a = priceItem(piezas(), design(), sinLargo(), plain(), { cut: { barLength: 6000 } })
    const b = priceItem(piezas(), design(), sinLargo(), plain(), { cut: { barLength: 3000 } })
    expect(a.pending).toBeUndefined()
    expect(b.materials.profiles).toBeCloseTo(a.materials.profiles * 2, -1)
  })

  it('el largo del perfil manda sobre el de Ajustes', () => {
    const conLargo = fixedWindowBom()
    const a = priceItem(conLargo, design(), makeCatalog(), plain(), { cut: { barLength: 3000 } })
    const b = priceItem(conLargo, design(), makeCatalog(), plain(), { cut: { barLength: 9000 } })
    expect(a.materials.profiles).toBe(b.materials.profiles)
  })

  it('sin ninguno no supone 5.800: queda pendiente, fuera del total, y lo avisa', () => {
    const price = priceItem(piezas(), design(), sinLargo(), plain())
    expect(price.pending?.length).toBeGreaterThan(0)
    expect(price.unitNet).toBe(0)
    expect(price.warnings.map((w) => w.message).join(' ')).toMatch(/largo de barra/)
  })
})
