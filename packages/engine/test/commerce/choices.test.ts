import { describe, expect, it } from 'vitest'
import { applyQuoteSelection, includedLineIds, lineDiscount, selectionTotals, withTax } from '../../src/commerce'
import { quoteTotals } from '../../src/commerce/totals'

const base = { id: 'a' }
const opt = { id: 'b', role: 'optional' as const }
const on = { id: 'c', role: 'optional' as const, included: true }
const alt1 = { id: 'd', role: 'alternative' as const, altGroup: 'Terraza' }
const alt2 = { id: 'e', role: 'alternative' as const, altGroup: 'Terraza' }

describe('qué cuenta en el total', () => {
  it('lo base siempre; un opcional solo si se marca', () => {
    expect([...includedLineIds([base, opt, on])]).toEqual(['a', 'c'])
  })

  it('de un grupo de alternativas cuenta exactamente una: la elegida o la primera', () => {
    expect([...includedLineIds([alt1, alt2])]).toEqual(['d'])
    expect([...includedLineIds([alt1, { ...alt2, included: true }])]).toEqual(['e'])
    expect([...includedLineIds([alt1, alt2], { alternatives: { Terraza: 'e' } })]).toEqual(['e'])
  })

  it('una elección inválida no deja el grupo sin nada', () => {
    expect([...includedLineIds([alt1, alt2], { alternatives: { Terraza: 'no-existe' } })]).toEqual(['d'])
  })

  it('la elección manda sobre lo guardado y se puede escribir en las líneas', () => {
    expect([...includedLineIds([on], { optional: { c: false } })]).toEqual([])
    const lines = applyQuoteSelection([base, opt, alt1, alt2], { optional: { b: true }, alternatives: { Terraza: 'e' } })
    expect(lines.map((l) => [l.id, (l as { included?: boolean }).included])).toEqual([['a', undefined], ['b', true], ['d', false], ['e', true]])
  })
})

describe('totales por elección', () => {
  const lines = [
    { id: 'a', qty: 1, totalNet: 1000 },
    { id: 'b', qty: 2, totalNet: 500, role: 'optional' as const },
    { id: 'd', qty: 1, totalNet: 800, role: 'alternative' as const, altGroup: 'T' },
    { id: 'e', qty: 1, totalNet: 600, role: 'alternative' as const, altGroup: 'T' },
  ]
  const input = { lines, extras: [{ id: 'x', label: 'Mantención', amount: 100, role: 'optional' as const }], discountPct: 10, ivaPct: 19 }

  it('recalcula igual que el total del motor', () => {
    const t = selectionTotals(input, { optional: { b: true, x: true }, alternatives: { T: 'e' } })
    expect(t.subtotal).toBe(2100)
    expect(t.discount).toBe(210)
    expect(t.extras).toBe(100)
    expect(t.net).toBe(1990)
    expect(t.total).toBe(t.net + t.iva)
    expect(t.units).toBe(4)
  })

  it('sin elección solo cuenta lo base y la primera alternativa', () => {
    expect(selectionTotals(input).subtotal).toBe(1800)
  })

  it('lo pendiente se cuenta para avisar, sin sumar', () => {
    const t = selectionTotals({ ...input, lines: [...lines, { id: 'p', qty: 1, totalNet: 0, pending: true }] })
    expect(t.pendingItems).toBe(1)
    expect(t.subtotal).toBe(1800)
  })

  it('es el mismo redondeo de `quoteTotals`', () => {
    const direct = quoteTotals([{ price: { qty: 1, totalNet: 1800, cost: 0 } as never, area: 0 }], { discountPct: 10, extras: [], ivaPct: 19 })
    expect(selectionTotals(input).iva).toBe(direct.iva)
  })
})

describe('descuento e impuesto de línea', () => {
  it('acota el porcentaje', () => {
    expect(lineDiscount(1000, 10)).toBe(100)
    expect(lineDiscount(1000, 150)).toBe(1000)
    expect(lineDiscount(1000, -5)).toBe(0)
    expect(lineDiscount(1000, undefined)).toBe(0)
  })
  it('agrega el impuesto redondeando', () => {
    expect(withTax(1000, 19)).toBe(1190)
  })
})
