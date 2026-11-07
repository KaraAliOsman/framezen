import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { computeLayout, createDesign, type LayoutDimension, type TypologyId, type WindowDesign } from '@dekopen/engine'
import { applyDimension, applySizePair, dimensionAnchor, dimensionTarget, isEditableDimension } from './dimensions'
import { stageViewport } from './viewport'

const catalog = SAMPLE_CATALOG
const make = (t: TypologyId, width: number, height: number, lineId = 'serie-60'): WindowDesign =>
  createDesign(t, { lineId, width, height, colorId: 'blanco', glassId: 'dvh-4-12-4' })

const dims = (d: WindowDesign) => computeLayout(d, catalog).dimensions
const total = (d: WindowDesign, axis: 'x' | 'y') => dims(d).find((x) => x.level === 0 && x.axis === axis)!
const partial = (d: WindowDesign, index: number) => dims(d).find((x) => x.target && 'nodeId' in x.target && x.target.index === index)!

describe('cotas → operaciones del motor', () => {
  it('cota total de ancho → setSize (reescala los paños)', () => {
    const d = make('fixed_casement', 1200, 1200)
    const change = applyDimension(d, total(d, 'x'), 1500)
    expect(change?.design.width).toBe(1500)
    expect(change?.design.height).toBe(1200)
    expect(change?.label).toBe('Ancho 1.500 mm')
    const parts = dims(change!.design).filter((x) => x.level === 1 && x.axis === 'x')
    expect(parts.map((p) => p.value)).toEqual([750, 750])
  })

  it('cota total de alto → setSize', () => {
    const d = make('casement', 600, 1000)
    const change = applyDimension(d, total(d, 'y'), 1250.5)
    expect(change?.design.height).toBe(1250.5)
    expect(change?.label).toBe('Alto 1.250,5 mm')
  })

  it('cota parcial → setNodeSize (compensa el vecino)', () => {
    const d = make('fixed_casement', 1200, 1200)
    const dim = partial(d, 0)
    expect(dimensionTarget(d, dim)).toMatchObject({ kind: 'partial', index: 0 })
    const change = applyDimension(d, dim, 500)
    expect(change?.label).toBe('Medida del paño')
    const parts = dims(change!.design).filter((x) => x.level === 1 && x.axis === 'x')
    expect(parts.map((p) => p.value)).toEqual([500, 700])
  })

  it('la última parcial también se puede escribir', () => {
    const d = make('fixed_3', 2100, 1000)
    const change = applyDimension(d, partial(d, 2), 900)
    const parts = dims(change!.design).filter((x) => x.level === 1 && x.axis === 'x').map((p) => p.value)
    expect(parts[2]).toBe(900)
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(2100, 5)
  })

  it('sin cambios, cero o valores raros → null (nada que deshacer)', () => {
    const d = make('fixed', 1000, 1000)
    expect(applyDimension(d, total(d, 'x'), 1000)).toBeNull()
    expect(applyDimension(d, total(d, 'x'), 0)).toBeNull()
    expect(applyDimension(d, total(d, 'x'), Number.NaN)).toBeNull()
    expect(applyDimension(d, total(d, 'x'), -5)).toBeNull()
  })

  it('la flecha del arco es editable aunque el motor la marque informativa', () => {
    const d = make('arch', 1000, 1200)
    const rise = dims(d).find((x) => x.level === 1 && x.axis === 'y' && !x.target)!
    expect(isEditableDimension(d, rise)).toBe(true)
    const change = applyDimension(d, rise, 300)
    expect(change?.design.shape).toEqual({ kind: 'arch', rise: 300 })
  })

  it('las alturas del trapecio se editan por lado', () => {
    const d = make('trapezoid', 1000, 1000)
    const low = dims(d).find((x) => x.level === 1 && x.axis === 'y' && !x.target)!
    expect(dimensionTarget(d, low)).toEqual({ kind: 'trapezoid', side: 'leftHeight' })
    const change = applyDimension(d, low, 600)
    expect(change?.design.shape).toMatchObject({ kind: 'trapezoid', leftHeight: 600, rightHeight: 1000 })
  })

  it('una cota que no corresponde a nada no se edita', () => {
    const d = make('fixed', 1000, 1000)
    const fake: LayoutDimension = { axis: 'y', from: 10, to: 20, value: 10, level: 1 }
    expect(dimensionTarget(d, fake)).toBeNull()
    expect(applyDimension(d, fake, 50)).toBeNull()
  })

  it('«1500x1200» en una cota total cambia ambas medidas', () => {
    const d = make('fixed', 1000, 1000)
    const change = applySizePair(d, { width: 1500, height: 1200 })
    expect(change?.design).toMatchObject({ width: 1500, height: 1200 })
    expect(change?.label).toBe('Medidas 1.500 mm × 1.200 mm')
    expect(applySizePair(d, { width: 1000, height: 1000 })).toBeNull()
  })
})

describe('dimensionAnchor', () => {
  it('ubica las cifras bajo y a la izquierda del dibujo, dentro del escenario', () => {
    const d = make('fixed_casement', 1600, 1300)
    const layout = computeLayout(d, catalog)
    for (const view of ['interior', 'exterior'] as const) {
      const vp = stageViewport(layout, { width: 900, height: 640 }, view)
      const bottom = vp.oy + layout.height * vp.scale
      for (const dim of layout.dimensions) {
        const a = dimensionAnchor(layout, vp, dim)!
        expect(a).not.toBeNull()
        expect(a.x).toBeGreaterThan(0)
        expect(a.x).toBeLessThan(900)
        expect(a.y).toBeLessThan(640)
        if (dim.axis === 'x') {
          expect(a.y).toBeGreaterThan(bottom)
          expect(a.vertical).toBe(false)
        } else {
          expect(a.x).toBeLessThan(vp.ox)
          expect(a.vertical).toBe(true)
        }
      }
    }
  })

  it('la cota total queda más afuera que las parciales', () => {
    const d = make('fixed_casement', 1600, 1300)
    const layout = computeLayout(d, catalog)
    const vp = stageViewport(layout, { width: 900, height: 640 }, 'interior')
    const t = dimensionAnchor(layout, vp, total(d, 'x'))!
    const p = dimensionAnchor(layout, vp, partial(d, 0))!
    expect(t.y).toBeGreaterThan(p.y)
  })

  it('en vista exterior la parcial izquierda pasa a la derecha', () => {
    const d = make('fixed_casement', 1600, 1300)
    const layout = computeLayout(d, catalog)
    const inside = dimensionAnchor(layout, stageViewport(layout, { width: 900, height: 640 }, 'interior'), partial(d, 0))!
    const outside = dimensionAnchor(layout, stageViewport(layout, { width: 900, height: 640 }, 'exterior'), partial(d, 0))!
    expect(inside.x).toBeLessThan(450)
    expect(outside.x).toBeGreaterThan(450)
  })
})
