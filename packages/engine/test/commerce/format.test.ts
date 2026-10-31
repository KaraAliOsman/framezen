import { describe, expect, it } from 'vitest'
import { formatArea, formatCLP, formatMeters, formatMM, formatPct, formatSize, roundHalfUp, roundUpTo } from '../../src/commerce/format'

describe('formato chileno', () => {
  it('formatCLP: punto de miles, sin decimales, HALF_UP', () => {
    expect(formatCLP(1234567)).toBe('$1.234.567')
    expect(formatCLP(0)).toBe('$0')
    expect(formatCLP(999)).toBe('$999')
    expect(formatCLP(1000)).toBe('$1.000')
    expect(formatCLP(999.5)).toBe('$1.000')
    expect(formatCLP(-1500)).toBe('−$1.500')
    expect(formatCLP(Number.NaN)).toBe('$0')
  })

  it('formatMM: decimales solo si existen (resolución 0,1)', () => {
    expect(formatMM(1200)).toBe('1.200')
    expect(formatMM(554.5)).toBe('554,5')
    expect(formatMM(1124.03)).toBe('1.124')
    expect(formatMM(603.45)).toBe('603,5')
    expect(formatMM(12)).toBe('12')
  })

  it('formatSize, formatArea, formatPct y formatMeters', () => {
    expect(formatSize(1200, 1500)).toBe('1.200 × 1.500 mm')
    expect(formatSize(603.5, 917)).toBe('603,5 × 917 mm')
    expect(formatArea(1.95)).toBe('1,95 m²')
    expect(formatArea(2)).toBe('2,00 m²')
    expect(formatArea(12.969)).toBe('12,97 m²')
    expect(formatPct(35)).toBe('35 %')
    expect(formatPct(35.25)).toBe('35,3 %')
    expect(formatPct(97.1724, 2)).toBe('97,17 %')
    expect(formatMeters(4392)).toBe('4,39 m')
  })

  it('roundHalfUp aleja el 0,5 del cero y tolera errores de coma flotante', () => {
    expect(roundHalfUp(2.5)).toBe(3)
    expect(roundHalfUp(-2.5)).toBe(-3)
    expect(roundHalfUp(110.58)).toBe(111)
    expect(roundHalfUp(1.005, 2)).toBe(1.01)
    expect(roundHalfUp(-0.4)).toBe(0)
  })

  it('roundUpTo redondea hacia arriba al múltiplo sin inflar valores exactos', () => {
    expect(roundUpTo(107650.34, 1000)).toBe(108000)
    expect(roundUpTo(108000, 1000)).toBe(108000)
    expect(roundUpTo(108000.0000000001, 1000)).toBe(108000)
    expect(roundUpTo(193.75, 1)).toBe(194)
    expect(roundUpTo(1, 100)).toBe(100)
    expect(roundUpTo(0, 100)).toBe(0)
    expect(roundUpTo(1234, 0)).toBe(1234)
  })
})
