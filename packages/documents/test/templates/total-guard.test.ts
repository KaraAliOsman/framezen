import { describe, expect, it } from 'vitest'
import { fineType } from '../../src/templates/typography'
import { totalGuard, totalPattern } from '../../src/templates/total-guard'

describe('barrera del total en textos libres', () => {
  const guard = totalGuard(7828106, '(ver cierre)')

  it('reconoce la cifra con cualquier separador', () => {
    for (const written of ['$7.828.106', '$ 7.828.106', '7,828,106', '7 828 106', '7828106', 'CLP 7.828.106']) {
      expect(guard(`El valor es ${written} con IVA`), written).toBe('El valor es (ver cierre) con IVA')
    }
  })

  it('no toca otras cifras', () => {
    expect(guard('Serie 7828 y 17.828.106 unidades, plazo 15 días')).toBe('Serie 7828 y 17.828.106 unidades, plazo 15 días')
  })

  it('no actúa con montos cortos', () => {
    expect(totalPattern(950)).toBeNull()
    expect(totalGuard(0, 'x')('$0')).toBe('$0')
  })
})

describe('detalles tipográficos', () => {
  it('corrige comillas, puntos suspensivos y guiones sin tocar cifras', () => {
    expect(fineType('Vidrio "laminado"... ok - listo')).toBe('Vidrio “laminado”… ok – listo')
    expect(fineType('4+12+4 y 76.543.210-K')).toBe('4+12+4 y 76.543.210-K')
    expect(fineType('N° 412')).toBe('N° 412')
  })

  it('es idempotente', () => {
    const once = fineType('Texto "citado" - de prueba...')
    expect(fineType(once)).toBe(once)
  })
})
