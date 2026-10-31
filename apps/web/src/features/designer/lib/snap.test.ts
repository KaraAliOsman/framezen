import { describe, expect, it } from 'vitest'
import { keyboardStep, snapMullion } from './snap'

const base = { segStart: 0, segEnd: 1200, min: 200, max: 1000 }

describe('snapMullion (imán de travesaños)', () => {
  it('prefiere la mitad exacta del tramo dentro de ±12 px', () => {
    // 0,5 px/mm → 12 px = 24 mm.
    const r = snapMullion({ ...base, raw: 618, pxPerMm: 0.5 })
    expect(r).toMatchObject({ axis: 600, kind: 'center', before: 600, after: 600 })
  })

  it('ajusta a 50 mm si está a ±12 px de un múltiplo', () => {
    const r = snapMullion({ ...base, raw: 462, pxPerMm: 0.5 })
    expect(r).toMatchObject({ axis: 450, kind: 'coarse', before: 450, after: 750 })
  })

  it('si no, ajusta a 10 mm', () => {
    // 2 px/mm → 12 px = 6 mm: 473 está a 23 mm de 450 y de 500.
    const r = snapMullion({ ...base, raw: 473, pxPerMm: 2 })
    expect(r).toMatchObject({ axis: 470, kind: 'fine' })
  })

  it('mide el múltiplo desde el inicio del tramo (travesaños anidados)', () => {
    const r = snapMullion({ raw: 761, segStart: 300, segEnd: 1500, min: 500, max: 1300, pxPerMm: 1 })
    expect(r.axis).toBe(750) // paño de 450 mm
    expect(r.kind).toBe('coarse')
    expect(r.before).toBe(450)
    expect(r.after).toBe(750)
  })

  it('respeta los límites del paño mínimo', () => {
    expect(snapMullion({ ...base, raw: 40, pxPerMm: 1 })).toMatchObject({ axis: 200, kind: 'limit' })
    expect(snapMullion({ ...base, raw: 1180, pxPerMm: 1 })).toMatchObject({ axis: 1000, kind: 'limit' })
  })

  it('sin imán (Alt) redondea al milímetro', () => {
    expect(snapMullion({ ...base, raw: 473.4, pxPerMm: 2, free: true })).toMatchObject({ axis: 473, kind: 'free' })
  })

  it('paso de teclado: 10 mm, 50 con Shift, 1 con Alt', () => {
    expect(keyboardStep({ shiftKey: false, altKey: false })).toBe(10)
    expect(keyboardStep({ shiftKey: true, altKey: false })).toBe(50)
    expect(keyboardStep({ shiftKey: true, altKey: true })).toBe(1)
  })
})
