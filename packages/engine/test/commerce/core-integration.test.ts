import { describe, expect, it } from 'vitest'
import { DEFAULT_CUT, DEFAULT_PRICING, buildWorkshopData, evaluateQuote, explainPrice, priceItem, toSawCsv } from '../../src/commerce'
import { computeBom } from '../../src/core'
import type { QuoteInput } from '../../src/commerce'
import { design, makeCatalog } from './fixtures'

/** Integración con el núcleo real: fijos PRO6004 (T01/T02: marco = cota + 6, vidrio = cota − 98). */
describe('comercio + núcleo', () => {
  const catalog = makeCatalog()
  const quote: QuoteInput = {
    items: [
      { id: 'a', ref: 'V1', qty: 2, design: design() },
      { id: 'b', ref: 'V2', qty: 1, design: design({ width: 1200, height: 1500, colorId: 'winchester' }) },
    ],
    extras: [{ id: 'x', label: 'Transporte', amount: 25000 }],
    discountPct: 0,
  }

  it('evaluateQuote usa computeBom y cotiza igual que priceItem', () => {
    const result = evaluateQuote(quote, catalog, DEFAULT_PRICING)
    expect(result.items).toHaveLength(2)
    for (const [i, item] of quote.items.entries()) {
      const direct = priceItem(computeBom(item.design, catalog), item.design, catalog, DEFAULT_PRICING, { qty: item.qty })
      expect(result.items[i].price.unitNet).toBe(direct.unitNet)
      expect(result.items[i].price.unitNet % 100).toBe(0)
    }
    // Marco blanco 1000 × 1000: 4 × 1006 mm a $20.000 la barra de 5.800.
    const frame = result.items[0].price.lines.find((l) => l.code === 'PRO01')!
    expect(frame.qty).toBe(4.024)
    expect(frame.total).toBe(Math.round((4024 / 5800) * 20000))
    // DVH 902 × 902 = 0,813604 m² × $40.000.
    expect(result.items[0].price.materials.glass).toBe(32544)
    const { totals } = result
    expect(totals.subtotal).toBe(result.items[0].price.unitNet * 2 + result.items[1].price.unitNet)
    expect(totals.net).toBe(totals.subtotal + 25000)
    expect(totals.total).toBe(totals.net + Math.round(totals.net * 0.19))
    expect(totals.area).toBe(2 + 1.8)
    expect(explainPrice(result.items[0].price).at(-1)?.amount).toBe(result.items[0].price.totalNet)
  })

  it('perfil sin asignar en la línea: un solo aviso humano, sin «—» como código', () => {
    const base = makeCatalog()
    const cat = { ...base, lines: base.lines.map((l) => ({ ...l, profiles: { ...l.profiles, bead: undefined } })) }
    const d = design()
    const bom = computeBom(d, cat)
    const price = priceItem(bom, d, cat, DEFAULT_PRICING)
    expect(bom.warnings.filter((w) => w.code === 'profile_missing').map((w) => w.message)).toEqual([
      'El junquillo de PRO6004 no está en tu catálogo: la ventana queda fuera del total. Agrégalo en Catálogo.',
    ])
    expect(price.warnings.filter((w) => w.code === 'price_missing')).toEqual([])
    expect(price.warnings.some((w) => w.message.includes('—'))).toBe(false)
    // El corte sigue en el desglose, y la ventana queda fuera del total hasta tener su perfil.
    expect(price.lines.find((l) => l.name.startsWith('Junquillo'))?.total).toBe(0)
    expect(price.pending).toEqual([{ code: 'profile_missing', ref: 'junquillo' }])
    expect(price.unitNet).toBe(0)
  })

  it('una línea inexistente no llena el precio de «El perfil —»', () => {
    const d = design({ lineId: 'nada' })
    const price = priceItem(computeBom(d, catalog), d, catalog, DEFAULT_PRICING)
    expect(price.warnings.map((w) => w.code)).toEqual(['price_pending', 'line_missing'])
    expect(price.pending?.[0]).toEqual({ code: 'line_missing', ref: 'línea' })
  })

  it('buildWorkshopData arma ventanas, cortes, vidrios, materiales y CSV de sierra', () => {
    const data = buildWorkshopData(quote, catalog, DEFAULT_PRICING, { ...DEFAULT_CUT, trimStart: 15, trimEnd: 15 })
    expect(data.windows.map((w) => w.ref)).toEqual(['V1', 'V2'])
    expect(data.windows[0].description.length).toBeGreaterThan(0)
    expect(data.windows[1].layout.width).toBe(1200)
    const frameWhite = data.optimization.groups.find((g) => g.key === 'pro01|blanco')!
    expect(frameWhite.pieces).toBe(8)
    expect(frameWhite.barsNeeded).toBe(2)
    expect(data.glass.find((g) => g.width === 902 && g.height === 902)).toMatchObject({ qty: 2, refs: [expect.stringMatching(/^V1 · /)] })
    expect(data.glass.find((g) => g.width === 1102 && g.height === 1402)?.qty).toBe(1)
    expect(data.materials.find((m) => m.code === 'PRO01' && m.colorId === 'blanco')).toMatchObject({ qty: 2, total: 40000 })
    expect(data.costs.total).toBe(data.purchaseOrders.reduce((s, o) => s + o.total, 0))
    const csv = toSawCsv(data.optimization, catalog.colors)
    expect(csv.split('\r\n').filter(Boolean).length).toBe(1 + data.optimization.totalPieces)
    expect(csv).toContain('PRO01;Blanco;1;1;1006;45;45;V1 · ')
  })
})
