import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import type { CutSettings } from '@dekopen/engine'
import { bladeStrip, miterRun, sawPlan, sawSampleOf } from './sawModel'

const CUT: CutSettings = { barLength: 5800, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 }

describe('dibujo de la sierra', () => {
  const sample = sawSampleOf(SAMPLE_CATALOG, undefined)!

  it('usa piezas reales del motor, no una muestra escrita a mano', () => {
    expect(sample).not.toBeNull()
    expect(sample.pieces.reduce((s, p) => s + p.qty, 0)).toBe(4)
    expect(sample.pieces[0]?.length).toBeGreaterThan(sample.width)
    expect(sample.steel === null || sample.steel.length < sample.steel.pieceLength).toBe(true)
  })

  it('sin catálogo no dibuja', () => {
    expect(sawSampleOf(undefined, undefined)).toBeNull()
    expect(sawSampleOf({ ...SAMPLE_CATALOG, lines: [] }, undefined)).toBeNull()
  })

  it('el efecto es en vivo: más despunte y más disco dejan menos sobrante', () => {
    const base = sawPlan(sample, CUT)
    const more = sawPlan(sample, { ...CUT, trimStart: 50, kerf: 6 })
    expect(more.geo!.remainder).toBeLessThan(base.geo!.remainder)
    // El marco va a inglete: cada pieza gasta 5,7 mm de disco en el eje, no 4.
    expect(base.geo!.remainder).toBeCloseTo(CUT.barLength - sample.pieces.reduce((s, p) => s + p.length * p.qty, 0) - 4 * 5.7, 1)
  })

  it('un retazo se reconoce por el mínimo, no por un número fijo', () => {
    const rest = sawPlan(sample, CUT).geo!.remainder
    expect(sawPlan(sample, { ...CUT, minReusable: rest }).geo!.reusable).toBe(true)
    expect(sawPlan(sample, { ...CUT, minReusable: rest + 1 }).geo!.reusable).toBe(false)
  })

  it('la barra corta parte el marco en más barras', () => {
    expect(sawPlan(sample, { ...CUT, barLength: 2600 }).count).toBeGreaterThan(1)
  })

  it('a 45° el disco ocupa √2 veces su espesor en el eje', () => {
    expect(sawPlan(sample, CUT).kerfAlong).toBeCloseTo(4 * Math.SQRT2, 3)
    expect(miterRun(64, 45)).toBeCloseTo(64, 5)
    expect(miterRun(64, 90)).toBe(0)
  })

  it('la tira del disco tiene el espesor pedido, medido en perpendicular', () => {
    const [a, , , d] = bladeStrip({ x: 100, y: 100 }, 64, 45, 8, 1, 10)
    expect(Math.hypot(a!.x - d!.x, a!.y - d!.y)).toBeCloseTo(8, 6)
  })
})
