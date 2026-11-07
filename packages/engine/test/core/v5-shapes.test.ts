import { describe, expect, it } from 'vitest'
import { computeBom, computeLayout, createDesign, ellipsePerimeter, matchTypology, priceItem, setOpening, setShape, setSize } from '../../src'
import type { Bom, SplitNode, WindowDesign } from '../../src/types'
import { lengths } from './fixtures'
import { v5Catalog } from './v5-fixtures'

const catalog = v5Catalog()
const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }
const frame = (bom: Bom) => bom.cuts.filter((c) => c.code === 'PRO01')
const codes = (bom: Bom) => bom.warnings.map((w) => w.code)
const halfAngles = (bom: Bom) => frame(bom).reduce((a, c) => a + c.angleStart, 0)

describe('redonda y ovalada', () => {
  it('redonda: perímetro π·D, dos medias cañas a 90° y vidrio con área real', () => {
    const d = createDesign('round', { ...base, width: 1000, height: 1000 })
    const bom = computeBom(d, catalog)
    expect(bom.perimeter).toBe(3.142)
    expect(frame(bom).map((c) => [c.label, c.length, c.qty, c.angleStart, c.angleEnd])).toEqual([['arco', 1576.8, 2, 90, 90]])
    // El acero no se curva.
    expect(bom.cuts.filter((c) => c.kind === 'reinforcement')).toEqual([])
    const g = bom.glass[0]
    expect([g.width, g.height, g.shape]).toEqual([1000 - 2 * 49, 1000 - 2 * 49, 'round'])
    expect(g.area).toBe(0.8136)
    expect(g.realArea).toBeCloseTo((Math.PI * 451 * 451) / 1e6, 3)
    expect(g.outline).toMatch(/^M .* A 451 451 0 1 1 /)
    expect(codes(bom)).toContain('shape_bending')
    expect(computeLayout(d, catalog).frame.outline).toBe('M 1000 500 A 500 500 0 1 1 0 500 A 500 500 0 1 1 1000 500 Z')
  })

  it('el vidrio con forma se cobra por su rectángulo envolvente', () => {
    const d = createDesign('round', { ...base, width: 1000, height: 1000 })
    const bom = computeBom(d, catalog)
    const price = priceItem(bom, d, catalog, {})
    const glassLine = price.lines.find((l) => l.group === 'glass')!
    expect(glassLine.qty).toBeCloseTo((902 * 902) / 1e6, 4)
  })

  it('ovalada: perímetro de Ramanujan, radio mínimo b²/a y aviso de curvado', () => {
    const d = createDesign('oval', { ...base, width: 1200, height: 800 })
    const bom = computeBom(d, catalog)
    const P = ellipsePerimeter(600, 400)
    expect(P).toBeCloseTo(Math.PI * (3 * 1000 - Math.sqrt(2200 * 1800)), 6)
    expect(bom.perimeter).toBe(Math.round(P) / 1000)
    expect(lengths(frame(bom), {})).toEqual([[Math.round((P / 2 + 6) * 10) / 10, 2]])
    expect(bom.warnings.find((w) => w.code === 'shape_bending')?.message).toMatch(/radio mínimo 266,7 mm/)
    expect(bom.glass[0].realArea).toBeCloseTo((Math.PI * 551 * 351) / 1e6, 3)
  })

  it('redonda con ancho y alto distintos: se calcula como óvalo y ofrece igualarlos', () => {
    const bom = computeBom(createDesign('round', { ...base, width: 1000, height: 900 }), catalog)
    expect(bom.warnings.find((w) => w.code === 'round_not_square')?.fix?.patch).toEqual({ height: 1000 })
  })

  it('aro más largo que la barra: se divide en piezas iguales que caben', () => {
    // D 4000: π·4000/2 = 6283 > 5800 − 300 − 2·3 → cuatro cuartos de 3141,6 + 6.
    const bom = computeBom(createDesign('round', { ...base, width: 4000, height: 4000 }), catalog)
    expect(lengths(frame(bom), {})).toEqual([[3147.6, 4]])
    for (const c of frame(bom)) expect(c.length).toBeLessThanOrEqual(5800 - 300)
  })
})

describe('polígonos convexos', () => {
  it('pentágono regular: 5 tramos, ingletes que suman 540°/2 y junquillo paralelo', () => {
    const d = createDesign('pentagon', { ...base, width: 1000, height: 1000 })
    const bom = computeBom(d, catalog)
    expect(frame(bom)).toHaveLength(5)
    expect(halfAngles(bom)).toBeCloseTo(270, 1)
    expect(frame(bom).find((c) => c.label === 'aba')?.length).toBeCloseTo(1000 * 0.618034 + 6, 0)
    expect(bom.cuts.filter((c) => c.kind === 'bead')).toHaveLength(5)
    expect(bom.glass[0].shape).toBe('pentagon')
  })

  it('octógono regular: 8 lados iguales a 67,5°', () => {
    const bom = computeBom(createDesign('octagon', { ...base, width: 1000, height: 1000 }), catalog)
    const side = 1000 / (1 + Math.SQRT2)
    expect(lengths(frame(bom), {})).toEqual([[Math.round((side + 6) * 10) / 10, 8]])
    expect(frame(bom).every((c) => c.angleStart === 67.5 && c.angleEnd === 67.5)).toBe(true)
    expect(computeLayout(createDesign('octagon', base), catalog).dimensions.some((x) => x.level === 1 && Math.abs(x.value - 292.9) < 0.1)).toBe(true)
  })

  it('frontón: hombros verticales y techo a 45° con la medida por defecto', () => {
    const d = createDesign('gable', base)
    expect(d.shape).toEqual({ kind: 'gable', shoulderHeight: 900 })
    const bom = computeBom(d, catalog)
    expect(frame(bom).map((c) => c.label).sort()).toEqual(['aba', 'der', 'incl.', 'incl.', 'izq'])
    expect(frame(bom).find((c) => c.label === 'der')?.angleEnd).toBe(67.5)
    expect(computeLayout(d, catalog).dimensions.some((x) => x.level === 1 && x.value === 900)).toBe(true)
    // Al cambiar el alto, los hombros se reescalan.
    expect(setSize(d, { height: 2800 }).shape).toEqual({ kind: 'gable', shoulderHeight: 1800 })
  })
})

describe('arcos: medio punto y rebajado', () => {
  it('matchTypology distingue el arco rebajado del medio punto', () => {
    const semi = createDesign('arch', { ...base, width: 1200, height: 1400 })
    expect(semi.shape).toEqual({ kind: 'arch', rise: 600 })
    expect(matchTypology(semi)).toBe('arch')
    const seg = setShape(semi, { kind: 'arch', rise: 240 })
    expect(matchTypology(seg)).toBe('arch_segmental')
    expect(matchTypology(createDesign('arch_segmental', { ...base, width: 1200, height: 1400 }))).toBe('arch_segmental')
    // 1 % de tolerancia: 595 en 1.200 sigue siendo medio punto.
    expect(matchTypology(setShape(semi, { kind: 'arch', rise: 595 }))).toBe('arch')
  })

  it('arco muy largo: el tramo curvo se parte en piezas iguales unidas a 90°', () => {
    // Medio punto de 4.000: π·2000 = 6283 → dos mitades (el arco llega tangente a las jambas: 90°).
    const semi = computeBom(createDesign('arch', { ...base, width: 4000, height: 2500 }), catalog)
    expect(lengths(frame(semi).filter((c) => c.label === 'arco'), {})).toEqual([[Math.round((Math.PI * 1000 + 6) * 10) / 10, 2]])
    // Rebajado de 6.000 con flecha 1.500 (R 3.750, 2φ = 106,26°): las puntas conservan su inglete.
    const seg = computeBom(setShape(createDesign('arch', { ...base, width: 6000, height: 2500 }), { kind: 'arch', rise: 1500 }), catalog)
    const arcs = frame(seg).filter((c) => c.label === 'arco')
    expect(arcs.map((c) => [c.angleStart, c.angleEnd])).toEqual([
      [71.57, 90],
      [90, 71.57],
    ])
    for (const c of arcs) expect(c.length).toBeLessThanOrEqual(5800 - 300)
    expect(arcs.reduce((a, c) => a + c.length - 6, 0)).toBeCloseTo(2 * Math.asin(0.8) * 3750, 0)
  })
})

describe('formas con hojas: medio punto sobre abatible', () => {
  const d = createDesign('arch_casement', { ...base, width: 1000, height: 1700 })

  it('travesaño en el arranque del arco, hoja rectangular y paño fijo recortado por el arco', () => {
    expect(d.shape).toEqual({ kind: 'arch', rise: 500 })
    expect((d.root as SplitNode).sizes).toEqual([500, null])
    const bom = computeBom(d, catalog)
    expect(codes(bom)).not.toContain('shape_not_fixed')
    expect(lengths(bom.cuts, { role: 'mullion' })).toEqual([[1000, 1]])
    // La hoja es igual a la de un abatible con sobreluz rectangular del mismo paño.
    const rect = createDesign('casement_transom', { ...base, width: 1000, height: 1700 })
    const rectBom = computeBom({ ...rect, root: { ...(rect.root as SplitNode), sizes: [500, null] } }, catalog)
    expect(lengths(bom.cuts, { nodeId: 'n3', role: 'sash' })).toEqual(lengths(rectBom.cuts, { nodeId: 'n3', role: 'sash' }))
    // Junquillo del paño en arco: la cuerda bajo el travesaño y el arco.
    const beads = bom.cuts.filter((c) => c.nodeId === 'n2' && c.kind === 'bead')
    expect(beads.map((c) => c.label).sort()).toEqual(['aba', 'arco'])
    expect(beads.find((c) => c.label === 'aba')?.length).toBeCloseTo(2 * Math.sqrt(456 ** 2 - 20 ** 2), 0)
    const glass = bom.glass.find((g) => g.nodeId === 'n2')!
    expect(glass.shape).toBe('arch')
    expect(glass.outline).toMatch(/^M /)
    expect(glass.height).toBeCloseTo(500 - 20 - 5 - 49, 0)
    const layout = computeLayout(d, catalog)
    expect(layout.panes.find((p) => p.nodeId === 'n2')?.outline).toMatch(/^M /)
    expect(layout.panes.find((p) => p.nodeId === 'n3')?.outline).toBeUndefined()
  })

  it('al cambiar el ancho, el travesaño sigue al arranque del arco', () => {
    const wider = setSize(d, { width: 1200 })
    expect(wider.shape).toEqual({ kind: 'arch', rise: 600 })
    expect((wider.root as SplitNode).sizes).toEqual([600, null])
    expect(matchTypology(wider)).toBe('arch_casement')
  })

  it('una hoja que cruza el arco avisa y ofrece dejarla fija', () => {
    const crossing: WindowDesign = { ...d, root: { ...(d.root as SplitNode), sizes: [300, null] } }
    expect(codes(computeBom(crossing, catalog))).toContain('shape_not_fixed')
    const whole = setOpening(createDesign('arch', base), 'n1', { kind: 'casement', hinge: 'left' })
    expect(computeBom(whole, catalog).warnings.find((w) => w.code === 'shape_not_fixed')?.fix?.label).toBe('Dejar como paño fijo')
  })

  it('frontón con hoja bajo los hombros: sin aviso y techo fijo recortado', () => {
    const gable: WindowDesign = {
      ...createDesign('casement_transom', { ...base, width: 1000, height: 1700 }),
      shape: { kind: 'gable', shoulderHeight: 1200 },
    }
    const withHead = { ...gable, root: { ...(gable.root as SplitNode), sizes: [500, null] } }
    const bom = computeBom(withHead, catalog)
    expect(codes(bom)).not.toContain('shape_not_fixed')
    expect(bom.glass.find((g) => g.nodeId === 'n2')?.shape).toBe('gable')
    expect(bom.cuts.filter((c) => c.nodeId === 'n2' && c.kind === 'bead').map((c) => c.label).sort()).toEqual(['aba', 'incl.', 'incl.'])
  })
})
