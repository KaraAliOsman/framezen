import { describe, expect, it } from 'vitest'
import {
  firstName,
  formatCLP,
  formatDate,
  formatDocNumber,
  formatMMUnit,
  formatNumber,
  formatRelative,
  formatSize,
  initials,
  normalizeSearch,
  revisionLetter,
} from '../src/lib/format'

describe('formatos humanos', () => {
  it('formatea pesos chilenos sin decimales', () => {
    expect(formatCLP(1234567)).toBe('$1.234.567')
    expect(formatCLP(0)).toBe('$0')
    expect(formatCLP(-12000)).toBe('−$12.000')
  })

  it('formatea medidas como en el taller', () => {
    expect(formatSize(1200, 1500)).toBe('1.200 × 1.500 mm')
    expect(formatMMUnit(1249.5)).toBe('1.249,5 mm')
    expect(formatNumber(1200)).toBe('1.200')
    expect(formatNumber(32.45, 1)).toBe('32,5')
    expect(formatNumber(40, 1)).toBe('40')
  })

  it('usa números humanos para documentos y revisiones', () => {
    expect(formatDocNumber(412)).toBe('N° 412')
    expect(revisionLetter(0)).toBe('')
    expect(revisionLetter(1)).toBe('A')
    expect(revisionLetter(2)).toBe('B')
    expect(revisionLetter(27)).toBe('AA')
  })

  it('formatea fechas en hora de Chile', () => {
    expect(formatDate('2026-10-04T15:00:00Z')).toBe('04-10-2026')
    const now = new Date('2026-10-31T12:00:00Z')
    expect(formatRelative('2026-10-31T11:59:40Z', now)).toBe('hace un momento')
    expect(formatRelative('2026-10-31T11:55:00Z', now)).toBe('hace 5 min')
    expect(formatRelative('2026-10-31T09:00:00Z', now)).toBe('hace 3 h')
    expect(formatRelative('2026-10-30T10:00:00Z', now)).toBe('ayer')
    expect(formatRelative('2026-10-27T10:00:00Z', now)).toBe('hace 4 días')
    expect(formatRelative('2026-10-01T10:00:00Z', now)).toBe('01-10-2026')
  })

  it('arma iniciales, primer nombre y búsquedas sin tildes', () => {
    expect(initials('Ana Pérez')).toBe('AP')
    expect(initials('Camila')).toBe('CA')
    expect(firstName('  María José Soto ')).toBe('María')
    expect(normalizeSearch('Cotización Pérez')).toBe('cotizacion perez')
  })
})
