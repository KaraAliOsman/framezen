import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING } from '../../src/commerce/defaults'
import { evaluateQuoteWith, safeDescribe, safeLayout, type DesignCore, type QuoteInput } from '../../src/commerce/evaluate'
import { priceItem } from '../../src/commerce/pricing'
import type { Bom, WindowDesign } from '../../src/types'
import { PLAIN, bom, cut, design, fixedWindowBom, makeCatalog } from './fixtures'

/** Núcleo falso: el BOM depende del color y del ancho (los de 2800 son una sola pieza de marco). */
const fakeCore: DesignCore = {
  computeBom: (d: WindowDesign): Bom =>
    d.width === 2800 ? bom({ cuts: [cut({ length: 2800, colorId: d.colorId })], area: 2.8 }) : fixedWindowBom(d.colorId),
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

const quote = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  items: [
    { id: 'a', ref: 'V1', qty: 2, design: design() },
    { id: 'b', ref: 'V2', qty: 1, design: design({ colorId: 'winchester' }), manualUnitPrice: 200000 },
  ],
  extras: [{ id: 'x', label: 'Instalación', amount: 50000 }],
  discountPct: 10,
  ...over,
})

describe('evaluateQuoteWith', () => {
  it('calcula BOM, precio por ítem (igual que priceItem) y totales', () => {
    const catalog = makeCatalog()
    const result = evaluateQuoteWith(fakeCore, quote(), catalog, DEFAULT_PRICING)
    expect(result.items.map((i) => i.ref)).toEqual(['V1', 'V2'])
    const direct = priceItem(fixedWindowBom(), design(), catalog, DEFAULT_PRICING, { qty: 2 })
    expect(result.items[0].price.unitNet).toBe(direct.unitNet)
    expect(result.items[0].price.totalNet).toBe(direct.unitNet * 2)
    expect(result.items[1].price.unitNet).toBe(200000)
    const subtotal = direct.unitNet * 2 + 200000
    const discount = Math.round(subtotal * 0.1)
    expect(result.totals).toMatchObject({ subtotal, discount, extras: 50000, net: subtotal - discount + 50000, units: 3, area: 3 })
    expect(result.totals.iva).toBe(Math.round((subtotal - discount + 50000) * 0.19))
  })

  it('los ajustes de la cotización van encima de los de la organización', () => {
    const catalog = makeCatalog()
    const result = evaluateQuoteWith(fakeCore, quote({ pricing: { marginPct: 30, ivaPct: 10 } }), catalog, DEFAULT_PRICING)
    expect(result.pricing.marginPct).toBe(30)
    expect(result.pricing.laborPerM2).toBe(12000)
    const direct = priceItem(fixedWindowBom(), design(), catalog, { ...DEFAULT_PRICING, marginPct: 30 })
    expect(result.items[0].price.unitNet).toBe(direct.unitNet)
    expect(result.totals.iva).toBe(Math.round(result.totals.net * 0.1))
  })

  it('si el núcleo falla, la ventana queda con aviso y la cotización sigue', () => {
    const broken: DesignCore = {
      ...fakeCore,
      computeBom: () => {
        throw new Error('pauta rota')
      },
      computeLayout: () => {
        throw new Error('x')
      },
      describeDesign: () => {
        throw new Error('x')
      },
    }
    const result = evaluateQuoteWith(broken, quote(), makeCatalog(), DEFAULT_PRICING)
    expect(result.items[0].bom.warnings[0]).toMatchObject({ level: 'error', code: 'bom_failed' })
    expect(result.items[0].price.labor).toBe(12000)
    expect(result.totals.total).toBeGreaterThan(0)
    expect(safeLayout(broken, design(), makeCatalog()).frame.rect).toEqual({ x: 0, y: 0, w: 1000, h: 1000 })
    expect(safeDescribe(broken, design({ width: 1200, height: 1500 }), makeCatalog())).toBe('Ventana 1.200 × 1.500 mm')
  })

  it('barras completas se reparten con la optimización de toda la obra', () => {
    const catalog = makeCatalog()
    const settings = { ...PLAIN, chargeFullBars: true }
    const two: QuoteInput = {
      items: [
        { id: 'a', ref: 'V1', qty: 1, design: design({ width: 2800 }) },
        { id: 'b', ref: 'V2', qty: 1, design: design({ width: 2800 }) },
      ],
      extras: [],
      discountPct: 0,
    }
    // Cada ventana sola pagaría una barra entera; juntas comparten una barra (2 × 2.804 ≤ 5.800).
    const alone = priceItem(fakeCore.computeBom(design({ width: 2800 }), catalog), design({ width: 2800 }), catalog, settings)
    expect(alone.materials.profiles).toBe(20000)
    const result = evaluateQuoteWith(fakeCore, two, catalog, settings)
    const profiles = result.items.reduce((s, i) => s + i.price.materials.profiles * i.price.qty, 0)
    expect(Math.abs(profiles - 20000)).toBeLessThanOrEqual(1)

    // Tres fijos 1000 × 1000: 12 piezas de marco → 3 barras, una por ventana.
    const three: QuoteInput = { items: [1, 2, 3].map((n) => ({ id: `w${n}`, ref: `V${n}`, qty: 1, design: design() })), extras: [], discountPct: 0 }
    const r3 = evaluateQuoteWith(fakeCore, three, catalog, settings)
    expect(r3.items.map((i) => i.price.lines.find((l) => l.code === 'PRO01')!.total)).toEqual([20000, 20000, 20000])
  })
})
