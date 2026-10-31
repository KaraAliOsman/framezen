import { describe, expect, it } from 'vitest'
import { computeBom, computeLayout, createDesign, setNodeSize } from '../../src/core'
import type { DesignNode, WindowDesign } from '../../src/types'
import { design, prolineCatalog } from './fixtures'

const catalog = prolineCatalog()
const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }

describe('computeLayout · practicable con travesaño (ítem 04)', () => {
  const root: DesignNode = {
    id: 'n1',
    type: 'split',
    dir: 'vertical',
    sizes: [596.5, 596.5],
    children: [
      { id: 'l', type: 'leaf', opening: { kind: 'casement', hinge: 'left', direction: 'out' } },
      { id: 'r', type: 'leaf', opening: { kind: 'awning', direction: 'out' } },
    ],
  }
  const layout = computeLayout(design({ width: 1193, height: 1350, root }), catalog)

  it('marco con su cara vista', () => {
    expect(layout.frame).toEqual({ rect: { x: 0, y: 0, w: 1193, h: 1350 }, face: 64 })
  })

  it('travesaño arrastrable: eje, cara vista y límites de paño mínimo', () => {
    expect(layout.mullions).toEqual([
      {
        nodeId: 'n1',
        index: 0,
        dir: 'vertical',
        rect: { x: 556.5, y: 64, w: 80, h: 1222 },
        kind: 'mullion',
        axis: 596.5,
        min: 200,
        max: 993,
      },
    ])
  })

  it('hojas: contorno nominal, vidrio visible y lado de la manilla', () => {
    const [left, right] = layout.sashes
    expect(left.rect).toEqual({ x: 36, y: 36, w: 548.5, h: 1278 })
    expect(left.glassRect).toEqual({ x: 116, y: 116, w: 388.5, h: 1118 })
    expect(left.handle).toBe('right')
    expect(right.rect.x).toBe(608.5)
    expect(right.handle).toBe('bottom')
    expect(layout.panes.map((p) => [p.nodeId, p.kind, p.glassId])).toEqual([
      ['l', 'sash', 'dvh-4-12-4'],
      ['r', 'sash', 'dvh-4-12-4'],
    ])
  })

  it('cotas totales y parciales editables', () => {
    expect(layout.dimensions).toEqual([
      { axis: 'x', from: 0, to: 1193, value: 1193, level: 0, target: { kind: 'width' } },
      { axis: 'y', from: 0, to: 1350, value: 1350, level: 0, target: { kind: 'height' } },
      { axis: 'x', from: 0, to: 596.5, value: 596.5, level: 1, target: { nodeId: 'n1', index: 0 } },
      { axis: 'x', from: 596.5, to: 1193, value: 596.5, level: 1, target: { nodeId: 'n1', index: 1 } },
    ])
  })

  it('celdas de selección con su ruta desde la raíz', () => {
    expect(layout.cells).toEqual([
      { nodeId: 'l', rect: { x: 64, y: 64, w: 492.5, h: 1222 }, path: ['n1', 'l'] },
      { nodeId: 'r', rect: { x: 636.5, y: 64, w: 492.5, h: 1222 }, path: ['n1', 'r'] },
    ])
  })
})

describe('computeLayout · otras tipologías', () => {
  it('fijo con sobreluz: paños fijos y travesaño horizontal', () => {
    const d = setNodeSize(createDesign('door_transom', { ...base, width: 856, height: 2240 }), 'n1', 0, 400)
    const layout = computeLayout(d, catalog)
    expect(layout.mullions[0]).toMatchObject({ dir: 'horizontal', axis: 400, rect: { x: 64, y: 360, w: 728, h: 80 } })
    expect(layout.panes[0]).toMatchObject({ kind: 'fixed', glassRect: { x: 64, y: 64, w: 728, h: 296 } })
    expect(layout.sashes[0].face).toBe(110)
    expect(layout.dimensions.filter((x) => x.level === 1).map((x) => x.value)).toEqual([400, 1840])
  })

  it('unión francesa: hoja pasiva sin manilla, activa con manilla al centro', () => {
    const layout = computeLayout(createDesign('casement_double', { ...base, width: 1200, height: 1200 }), catalog)
    expect(layout.mullions[0].kind).toBe('french')
    expect(layout.sashes[0].handle).toBeUndefined()
    expect(layout.sashes[1].handle).toBe('left')
    // Cada hoja llega al eje y traslapa 8 mm: 600 − 44 + 16 = 572.
    expect(layout.sashes.map((s) => s.rect.w)).toEqual([572, 572])
  })

  it('corredera: paneles por riel, vidrios y celdas por panel', () => {
    const d = createDesign('sliding_2', { ...base, lineId: 'prosld70', width: 1475, height: 1135 })
    const layout = computeLayout(d, catalog)
    expect(layout.rails).toBe(2)
    expect(layout.frame.face).toBe(72)
    expect(layout.sliding.map((p) => [p.panelId, p.rail, p.kind, p.direction])).toEqual([
      ['n2', 0, 'moving', 'right'],
      ['n3', 1, 'moving', 'left'],
    ])
    expect(layout.sliding[0].rect).toEqual({ x: 44, y: 44, w: 733.5, h: 1047 })
    expect(layout.sliding[1].rect.x + layout.sliding[1].rect.w).toBeCloseTo(1475 - 44, 6)
    expect(layout.cells.map((c) => c.path)).toEqual([
      ['n1', 'n2'],
      ['n1', 'n3'],
    ])
    expect(layout.panes).toHaveLength(2)
    expect(layout.mullions).toEqual([])
  })

  it('corredera 4 hojas: fijos al riel exterior, centrales al interior', () => {
    const layout = computeLayout(createDesign('sliding_4', { ...base, lineId: 'prosld70' }), catalog)
    expect(layout.sliding.map((p) => p.rail)).toEqual([0, 1, 1, 0])
  })

  it('formas: contorno SVG en mm del marco y del vidrio', () => {
    const t = computeLayout(createDesign('trapezoid', base), catalog)
    expect(t.frame.outline).toBe('M 0 1000 L 1000 1000 L 1000 0 L 0 500 Z')
    expect(t.frame.innerOutline).toMatch(/^M 64 936 L 936 936 L 936 /)
    expect(t.panes[0].outline).toBe(t.frame.innerOutline)
    expect(t.dimensions.some((x) => x.level === 1 && x.value === 500)).toBe(true)

    const arch = computeLayout(createDesign('arch', { ...base, width: 1000, height: 1200 }), catalog)
    expect(arch.frame.outline).toBe('M 0 1200 L 1000 1200 L 1000 500 A 500 500 0 0 0 0 500 Z')
    const tri = computeLayout(createDesign('triangle', { ...base, width: 1000, height: 800 }), catalog)
    expect(tri.frame.outline).toBe('M 0 800 L 1000 800 L 500 0 Z')
  })

  it('medio punto: tramos rectos y arco con ingletes reales', () => {
    const bom = computeBom(createDesign('arch', { ...base, width: 1000, height: 1200 }), catalog)
    const frame = bom.cuts.filter((c) => c.code === 'PRO01').map((c) => [c.label, c.length, c.angleStart, c.angleEnd])
    expect(frame).toEqual([
      ['aba', 1006, 45, 45],
      ['der', 706, 45, 90],
      ['izq', 706, 90, 45],
      ['arco', 1576.8, 90, 90],
    ])
    // El arco no lleva acero.
    expect(bom.cuts.filter((c) => c.kind === 'reinforcement').map((c) => c.label)).toEqual(['aba', 'der', 'izq'])
  })

  it('medidas inválidas: layout vacío sin lanzar', () => {
    const bad: WindowDesign = design({ width: 0, height: Number.NaN, root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } } })
    const layout = computeLayout(bad, catalog)
    expect(layout.width).toBe(0)
    expect(layout.cells).toEqual([])
  })

  it('rápido: diseño de 6 paños en menos de 16 ms por ventana (layout + despiece)', () => {
    let d = createDesign('casement_fixed_casement', { ...base, width: 2400, height: 1600 })
    d = { ...d, root: { id: 'n9', type: 'split', dir: 'horizontal', sizes: [400, null], children: [createDesign('fixed_3', base).root, d.root] } }
    for (let i = 0; i < 20; i++) computeBom(d, catalog)
    const t0 = Date.now()
    const runs = 100
    for (let i = 0; i < runs; i++) {
      computeLayout(d, catalog)
      computeBom(d, catalog)
    }
    expect((Date.now() - t0) / runs).toBeLessThan(16)
  })
})
