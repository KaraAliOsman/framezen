import { describe, expect, it } from 'vitest'
import { quoteTotals } from '../../src/commerce/totals'
import type { ItemPrice } from '../../src/types'

function priceOf(unitNet: number, qty = 1, cost = 0): ItemPrice {
  return {
    materials: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 },
    materialsTotal: cost,
    waste: 0,
    labor: 0,
    install: 0,
    cost,
    unitNet,
    qty,
    totalNet: unitNet * qty,
    marginPct: 0,
    lines: [],
    warnings: [],
  }
}

describe('quoteTotals', () => {
  it('obra 385 (9 ítems × 1 u): neto $2.247.511, IVA $427.027, total $2.674.538, 12,969 m², margen 50 %', () => {
    const rows = [
      [386216, 193108, 1.917],
      [122058, 61029, 1],
      [233102, 116551, 1],
      [300526, 150263, 1],
      [205653, 102826, 1],
      [272604, 136302, 1.674],
      [263665, 131832, 1.611],
      [228695, 114347, 1.62],
      [234992, 117496, 2.147],
    ]
    const totals = quoteTotals(
      rows.map(([unit, cost, area]) => ({ price: priceOf(unit, 1, cost), area })),
      { discountPct: 0, extras: [], ivaPct: 19 },
    )
    expect(totals).toEqual({
      subtotal: 2247511,
      discountPct: 0,
      discount: 0,
      extras: 0,
      net: 2247511,
      iva: 427027,
      total: 2674538,
      area: 12.969,
      units: 9,
      cost: 1123754,
      marginPct: 50,
    })
  })

  it('descuento sobre ítems, extras sin descuento (también ocultos) e IVA sobre el neto total', () => {
    const totals = quoteTotals([{ price: priceOf(250000, 4, 150000), bom: { area: 1.5 } }], {
      discountPct: 5,
      extras: [
        { id: 'e1', label: 'Instalación', amount: 80000 },
        { id: 'e2', label: 'Transporte', amount: 20000, hidden: true },
      ],
      ivaPct: 19,
    })
    expect(totals).toMatchObject({ subtotal: 1000000, discount: 50000, extras: 100000, net: 1050000, iva: 199500, total: 1249500 })
    expect(totals.area).toBe(6)
    expect(totals.units).toBe(4)
    expect(totals.cost).toBe(600000)
    // Margen sobre lo vendido en ventanas (sin extras): (950.000 − 600.000) / 950.000.
    expect(totals.marginPct).toBe(36.8)
  })

  it('redondea HALF_UP a $1 y sanea entradas raras', () => {
    const a = quoteTotals([{ price: priceOf(10001) }], { discountPct: 5, extras: [], ivaPct: 19 })
    expect(a.discount).toBe(500)
    expect(a.net).toBe(9501)
    expect(a.iva).toBe(1805)
    const b = quoteTotals([{ price: priceOf(1000) }], { discountPct: 150, extras: [{ id: 'x', label: 'x', amount: Number.NaN }], ivaPct: -3 })
    expect(b).toMatchObject({ discountPct: 100, discount: 1000, extras: 0, net: 0, iva: 0, total: 0, marginPct: 0 })
    const empty = quoteTotals([], { discountPct: 0, extras: [], ivaPct: 19 })
    expect(empty).toMatchObject({ subtotal: 0, net: 0, total: 0, units: 0, area: 0 })
  })

  it('toma el área del precio detallado si no viene aparte', () => {
    const totals = quoteTotals([{ price: { ...priceOf(1000, 2), area: 1.25 } }], { discountPct: 0, extras: [], ivaPct: 19 })
    expect(totals.area).toBe(2.5)
  })
})
