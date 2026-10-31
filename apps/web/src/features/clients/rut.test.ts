import { describe, expect, it } from 'vitest'
import { cleanRut, formatRut, isValidRut, rutCheckDigit, rutHint, rutStatus } from './rut'

describe('RUT chileno (módulo 11, aviso suave)', () => {
  it('calcula el dígito verificador, incluidos 0 y K', () => {
    expect(rutCheckDigit('12345678')).toBe('5')
    expect(rutCheckDigit('11111111')).toBe('1')
    expect(rutCheckDigit('10000013')).toBe('K')
    expect(rutCheckDigit('6')).toBe('K')
    expect(rutCheckDigit('76086428')).toBe('5')
    expect(rutCheckDigit('28')).toBe('0')
    expect(rutCheckDigit('15')).toBe('9')
  })

  it('valida con o sin puntos y guion, k minúscula incluida', () => {
    expect(isValidRut('12.345.678-5')).toBe(true)
    expect(isValidRut('123456785')).toBe(true)
    expect(isValidRut('10.000.013-k')).toBe(true)
    expect(isValidRut('12.345.678-9')).toBe(false)
    expect(isValidRut('5')).toBe(false)
    expect(isValidRut('')).toBe(false)
  })

  it('formatea solo si es válido; si no, conserva lo escrito', () => {
    expect(formatRut('123456785')).toBe('12.345.678-5')
    expect(formatRut(' 10000013k ')).toBe('10.000.013-K')
    expect(formatRut('12.345.678-9')).toBe('12.345.678-9')
    expect(formatRut('sin rut')).toBe('sin rut')
    expect(cleanRut('12.345.678-k')).toBe('12345678K')
  })

  it('distingue vacío, a medio escribir, válido e inválido', () => {
    expect(rutStatus('')).toBe('empty')
    expect(rutStatus(undefined)).toBe('empty')
    expect(rutStatus('12.34')).toBe('incomplete')
    expect(rutStatus('12.345.678-5')).toBe('valid')
    expect(rutStatus('12.345.678-9')).toBe('invalid')
  })

  it('el aviso explica qué pasa y nunca bloquea', () => {
    expect(rutHint('12.345.678-5')).toBeNull()
    expect(rutHint('12.34')).toBeNull()
    expect(rutHint('12.345.678-9')).toBe(
      'El dígito verificador no calza (con ese número debería terminar en 5). Lo guardamos igual por si acaso.',
    )
  })
})
