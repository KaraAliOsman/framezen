import { describe, expect, it } from 'vitest'
import {
  floorHalfMm,
  fmtAngle,
  fmtDate,
  fmtGlassMm,
  fmtInt,
  fmtM2,
  fmtMm,
  fmtMoney,
  fmtPct,
  fmtQty,
  fmtSize,
} from '../../src/workshop/format'

describe('formato de taller', () => {
  it('agrupa miles con punto incluso en números de 4 cifras', () => {
    expect(fmtInt(1200)).toBe('1.200')
    expect(fmtInt(2674538)).toBe('2.674.538')
    expect(fmtInt(856)).toBe('856')
  })

  it('muestra medidas a 0,1 mm sin decimal cuando son exactas', () => {
    expect(fmtMm(2246)).toBe('2.246')
    expect(fmtMm(554.5)).toBe('554,5')
    expect(fmtMm(1124.03)).toBe('1.124')
    expect(fmtMm(917, { fixed: true })).toBe('917,0')
    expect(fmtSize(1475, 1135)).toBe('1.475 × 1.135 mm')
  })

  it('redondea vidrios hacia abajo al 0,5 mm, nunca hacia arriba', () => {
    expect(floorHalfMm(603.5)).toBe(603.5)
    expect(floorHalfMm(365.9)).toBe(365.5)
    expect(floorHalfMm(767.4)).toBe(767)
    expect(floorHalfMm(902)).toBe(902)
    expect(fmtGlassMm(603.5)).toBe('603,5')
    expect(fmtGlassMm(917)).toBe('917,0')
    expect(fmtGlassMm(1118.5)).toBe('1.118,5')
    expect(fmtGlassMm(365.9)).toBe('365,5')
  })

  it('formatea pesos, porcentajes, superficies y ángulos', () => {
    expect(fmtMoney(1234567)).toBe('$1.234.567')
    expect(fmtMoney(-1500)).toBe('−$1.500')
    expect(fmtPct(85)).toBe('85,0 %')
    expect(fmtM2(1.6197)).toBe('1,62 m²')
    expect(fmtAngle(45)).toBe('45°')
    expect(fmtAngle(58.28)).toBe('58,3°')
  })

  it('cantidades de compra sin ceros sobrantes', () => {
    expect(fmtQty(36)).toBe('36')
    expect(fmtQty(17.45)).toBe('17,45')
    expect(fmtQty(0.7)).toBe('0,7')
    expect(fmtQty(1.6)).toBe('1,6')
  })

  it('fecha larga sin correrse por zona horaria', () => {
    expect(fmtDate('2026-10-31')).toBe('31 de octubre de 2026')
    expect(fmtDate('2026-01-01T00:30:00-03:00')).toBe('1 de enero de 2026')
    expect(fmtDate('mañana')).toBe('mañana')
  })
})
