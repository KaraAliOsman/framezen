/**
 * Paneles ciegos (`fill: 'panel'`) cotizados por el catálogo y junquillos curvos largos partidos
 * según SU barra (no la del marco).
 */
import { describe, expect, it } from 'vitest'
import { collectLeaves, computeBom, createDesign, mapNode, priceItem, TYPOLOGY_IDS } from '../../src'
import type { AccessoryRule, Bom, Catalog, Item, LeafNode, WindowDesign } from '../../src/types'
import { ITEMS } from './fixtures'
import { V5_ACCESSORIES, V5_ITEMS, V5_LINE, v5Catalog } from './v5-fixtures'

const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }
const PANEL_ITEM: Item = { id: 'P-CIEGO', brandId: 'proline', kind: 'accessory', code: 'P-CIEGO', name: 'Panel ciego sándwich 24', unit: 'm2', price: 40000 }
const PANEL_RULE: AccessoryRule = { id: 'p-ciego', itemId: 'P-CIEGO', per: 'area_m2', qty: 1, scope: 'panels' }

/** Catálogo v5 con (o sin) la regla de panel ciego por m². */
function catalogWithPanels(rules: AccessoryRule[] = [PANEL_RULE]): Catalog {
  return v5Catalog({
    lines: [{ ...V5_LINE, accessoryRules: [...V5_ACCESSORIES, ...rules] }, ...v5Catalog().lines.slice(1)],
    items: [...ITEMS, ...V5_ITEMS, PANEL_ITEM],
  })
}

/** El mismo diseño con los paños que cumplen `pick` rellenos con panel ciego. */
function withPanels(design: WindowDesign, pick: (leaf: LeafNode) => boolean = () => true): WindowDesign {
  let root = design.root
  for (const leaf of collectLeaves(design.root)) if (pick(leaf)) root = mapNode(root, leaf.id, (n) => (n.type === 'leaf' ? { ...n, fill: 'panel' } : n))
  return { ...design, root }
}

const panelLines = (price: ReturnType<typeof priceItem>) => price.lines.filter((l) => l.code === 'P-CIEGO')
const beads = (bom: Bom) => bom.cuts.filter((c) => c.kind === 'bead')

describe('paneles ciegos: despiece', () => {
  const catalog = catalogWithPanels()

  it('puerta con panel: lleva panel en vez de vidrio y el panel mide lo que mediría el vidrio', () => {
    const door = createDesign('door', { ...base, width: 900, height: 2100 })
    const glass = computeBom(door, catalog)
    const panel = computeBom(withPanels(door), catalog)
    expect(glass.glass).toHaveLength(1)
    expect(glass.panels).toBeUndefined()
    expect(panel.glass).toEqual([])
    expect(panel.panels).toEqual([{ nodeId: 'n1', label: 'Puerta', width: 638, height: 1838, qty: 1, area: 1.1726 }])
    expect([panel.panels![0].width, panel.panels![0].height]).toEqual([glass.glass[0].width, glass.glass[0].height])
    // El marco, la hoja y los junquillos son los mismos.
    expect(panel.cuts).toEqual(glass.cuts)
  })

  it('paño fijo ciego junto a una hoja: solo el paño ciego va como panel', () => {
    const d = createDesign('fixed_casement', { ...base, width: 1400, height: 1200 })
    const fixed = collectLeaves(d.root).find((l) => l.opening.kind === 'fixed')!
    const bom = computeBom(withPanels(d, (l) => l.id === fixed.id), catalog)
    expect(bom.panels?.map((p) => [p.nodeId, p.label])).toEqual([[fixed.id, 'Paño fijo izq.']])
    expect(bom.glass.map((g) => g.label)).toEqual(['Hoja der.'])
  })

  it('forma con panel: el panel sale del rectángulo envolvente del contorno y no hay vidrio', () => {
    const d = createDesign('round', { ...base, width: 1000, height: 1000 })
    const glass = computeBom(d, catalog).glass[0]
    const bom = computeBom(withPanels(d), catalog)
    expect(bom.glass).toEqual([])
    expect(bom.panels).toHaveLength(1)
    expect([bom.panels![0].width, bom.panels![0].height, bom.panels![0].area]).toEqual([glass.width, glass.height, glass.area])
  })

  it('arco con abatible y el paño del arco ciego: el panel toma la región recortada', () => {
    const d = createDesign('arch_casement', { ...base, width: 1200, height: 2200 })
    const arc = collectLeaves(d.root).find((l) => l.opening.kind === 'fixed')!
    const glass = computeBom(d, catalog).glass.find((g) => g.nodeId === arc.id)!
    const bom = computeBom(withPanels(d, (l) => l.id === arc.id), catalog)
    expect(bom.glass.some((g) => g.nodeId === arc.id)).toBe(false)
    expect(bom.panels?.map((p) => [p.nodeId, p.width, p.height])).toEqual([[arc.id, glass.width, glass.height]])
  })

  it('un diseño con vidrio no cambia con la regla de panel: mismo despiece y mismo precio en todas las tipologías', () => {
    const without = catalogWithPanels([])
    for (const id of TYPOLOGY_IDS) {
      const lineId = id.startsWith('sliding') || id.startsWith('lift_slide') ? (id.startsWith('lift') ? 'hst' : 'prosld70') : 'pro6004'
      const d = createDesign(id, { ...base, lineId })
      // Lo que lleva panel de por sí cambia con la regla: acá solo interesa lo vidriado.
      if (computeBom(d, without).panels?.length) continue
      const a = computeBom(d, catalog)
      const b = computeBom(d, without)
      expect(a, id).toEqual(b)
      expect(priceItem(a, d, catalog, {}), id).toEqual(priceItem(b, d, without, {}))
    }
  })
})

describe('paneles ciegos: precio', () => {
  const catalog = catalogWithPanels()

  it('se cotizan por m² de panel con el precio del artículo', () => {
    const door = createDesign('door', { ...base, width: 900, height: 2100 })
    const d = withPanels(door)
    const bom = computeBom(d, catalog)
    const item = bom.items.find((i) => i.itemId === 'P-CIEGO')
    expect(item).toMatchObject({ unit: 'm2', qty: 1.18, kind: 'accessory' }) // 1,1726 m² → 1,18 (se redondea hacia arriba a 0,01)
    const price = priceItem(bom, d, catalog, {})
    const line = panelLines(price)
    expect(line).toHaveLength(1)
    expect(line[0]).toMatchObject({ group: 'accessories', unit: 'm2', unitCost: 40000, qty: 1.18 })
    expect(line[0].total).toBe(Math.round(1.18 * 40000))
    expect(price.warnings.map((w) => w.code)).not.toContain('panel_rules_missing')
  })

  it('reemplazar el vidrio por un panel mueve el costo: sin vidrio, con panel', () => {
    const door = createDesign('door', { ...base, width: 900, height: 2100 })
    const g = priceItem(computeBom(door, catalog), door, catalog, {})
    const p = priceItem(computeBom(withPanels(door), catalog), withPanels(door), catalog, {})
    expect(g.materials.glass).toBeGreaterThan(0)
    expect(p.materials.glass).toBe(0)
    expect(p.materials.accessories).toBeGreaterThan(g.materials.accessories)
    expect(panelLines(g)).toEqual([])
  })

  it('con dos paneles se suman las áreas (también en un fijo y una puerta)', () => {
    const d = withPanels(createDesign('door_sidelight', { ...base, width: 1300, height: 2100 }))
    const bom = computeBom(d, catalog)
    expect(bom.panels?.length).toBe(2)
    const m2 = bom.panels!.reduce((a, p) => a + p.area, 0)
    expect(bom.items.find((i) => i.itemId === 'P-CIEGO')?.qty).toBe(Math.ceil(m2 * 100 - 1e-6) / 100)
  })


  it('cuenta por ancho, alto, perímetro o por panel según la regla', () => {
    const d = withPanels(createDesign('door', { ...base, width: 900, height: 2100 }))
    const qty = (per: AccessoryRule['per'], q = 1) =>
      computeBom(d, catalogWithPanels([{ ...PANEL_RULE, per, qty: q }])).items.find((i) => i.itemId === 'P-CIEGO')?.qty
    expect(qty('width_m')).toBe(0.64) // 0,638 m
    expect(qty('height_m', 2)).toBe(3.68) // 2 × 1,838 m
    expect(qty('perimeter_m')).toBe(4.96) // 2 × (0,638 + 1,838) m = 4,952
    expect(qty('glass_m')).toBe(4.96)
    expect(qty('window')).toBe(1)
    expect(qty('sash', 3)).toBe(3)
  })

  it('una medida que no aplica a paneles avisa en vez de cotizar cero en silencio', () => {
    const d = withPanels(createDesign('door', { ...base, width: 900, height: 2100 }))
    const bom = computeBom(d, catalogWithPanels([{ ...PANEL_RULE, per: 'mullion' }]))
    expect(bom.items.some((i) => i.itemId === 'P-CIEGO')).toBe(false)
    expect(bom.warnings.find((w) => w.code === 'accessory_rule_unknown')?.params).toEqual({ line: 'PRO6004', item: 'Panel ciego sándwich 24' })
  })

  it('sin regla de panel en la línea: se dibuja y se lista, avisa y no entra al costo', () => {
    const d = withPanels(createDesign('door', { ...base, width: 900, height: 2100 }))
    const catalog = catalogWithPanels([])
    const bom = computeBom(d, catalog)
    expect(bom.panels).toHaveLength(1)
    expect(bom.items.some((i) => i.itemId === 'P-CIEGO')).toBe(false)
    const w = bom.warnings.find((x) => x.code === 'panel_rules_missing')
    expect(w).toMatchObject({
      level: 'info',
      message: 'PRO6004 no tiene precio para paneles ciegos en el catálogo: se dibujan, pero la ventana queda fuera del total. Agrégalo en Catálogo › Accesorios.',
      params: { line: 'PRO6004' },
    })
    expect(panelLines(priceItem(bom, d, catalog, {}))).toEqual([])
  })

  it('el aviso de paneles sin precio solo aparece si hay paneles', () => {
    const d = createDesign('door', { ...base, width: 900, height: 2100 })
    expect(computeBom(d, catalogWithPanels([])).warnings.map((w) => w.code)).not.toContain('panel_rules_missing')
  })
})

describe('junquillos curvos: se parten según la barra del junquillo', () => {
  /** Catálogo con la barra del junquillo de PRO6004 acortada (el marco sigue en 5.800). */
  const withBeadBar = (barLength: number): Catalog => {
    const full = v5Catalog()
    return v5Catalog({ profiles: full.profiles.map((p) => (p.id === 'PRO05' ? { ...p, barLength } : p)) })
  }
  const arcs = (bom: Bom) => beads(bom).filter((c) => c.label === 'arco')
  const frameArcs = (bom: Bom) => bom.cuts.filter((c) => c.kind === 'profile' && c.label === 'arco')
  const total = (cuts: Bom['cuts']) => cuts.reduce((a, c) => a + c.length * c.qty, 0)

  it('arco: con barra de 5.800 el junquillo del arco va en una pieza; con barra de 3.000 se parte en dos iguales', () => {
    const d = createDesign('arch', { ...base, width: 2000, height: 2000 })
    const long = computeBom(d, v5Catalog())
    expect(arcs(long).map((c) => [c.length, c.qty, c.angleStart, c.angleEnd])).toEqual([[3003.4, 1, 90, 90]])
    const short = computeBom(d, withBeadBar(3000))
    const pieces = arcs(short)
    // 3003,4 > 3000 − 300 → dos piezas de 1501,7 unidas a 90°.
    expect(pieces.map((c) => [c.length, c.qty])).toEqual([[1501.7, 2]])
    expect(pieces.every((c) => c.length <= 3000 - 300)).toBe(true)
    expect(total(pieces)).toBeCloseTo(3003.4, 0)
    // El marco no cambia: su barra sigue siendo de 5.800.
    expect(frameArcs(short)).toEqual(frameArcs(long))
  })

  it('arco con barra corta: piezas iguales que caben, hasta el número entero que haga falta', () => {
    const d = createDesign('arch', { ...base, width: 2000, height: 2000 })
    const bom = computeBom(d, withBeadBar(1300)) // máximo 1.000 → ceil(3003,4 / 1000) = 4 piezas
    expect(arcs(bom).map((c) => [c.length, c.qty])).toEqual([[750.8, 4]])
  })

  it('arco rebajado: el inglete del arco se conserva solo en los dos extremos y las uniones van a 90°', () => {
    const d = createDesign('arch_segmental', { ...base, width: 2400, height: 1500 })
    const normal = arcs(computeBom(d, v5Catalog()))
    expect(normal).toHaveLength(1)
    const miter = normal[0].angleStart
    expect(miter).not.toBe(90)
    const bom = computeBom(d, withBeadBar(1500))
    const pieces = arcs(bom)
    const lengths = pieces.flatMap((c) => Array<number>(c.qty).fill(c.length))
    expect(lengths.length).toBeGreaterThan(1)
    expect(Math.max(...lengths)).toBeLessThanOrEqual(1500 - 300)
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(0.15) // iguales
    expect(pieces.filter((c) => c.angleStart === miter)).toHaveLength(1)
    expect(pieces.filter((c) => c.angleEnd === miter)).toHaveLength(1)
    expect(pieces.flatMap((c) => [c.angleStart, c.angleEnd]).filter((a) => a === 90).length).toBe(2 * (lengths.length - 1))
  })

  it('redonda: las mitades del aro del junquillo pasan a cuartos si no caben', () => {
    const d = createDesign('round', { ...base, width: 2000, height: 2000 })
    expect(arcs(computeBom(d, v5Catalog())).map((c) => [c.length, c.qty])).toEqual([[3003.4, 2]])
    const short = arcs(computeBom(d, withBeadBar(3000))) // 3003,4 > 2.700 → cuartos de 1.501,7
    expect(short.map((c) => [c.length, c.qty, c.angleStart, c.angleEnd])).toEqual([[1501.7, 4, 90, 90]])
  })

  it('paño recortado por un travesaño (arco con abatible): el tramo curvo del junquillo se parte', () => {
    const d = createDesign('arch_casement', { ...base, width: 1200, height: 2200 })
    const normal = computeBom(d, v5Catalog())
    expect(arcs(normal).map((c) => [c.length, c.qty])).toEqual([[1706.7, 1]])
    const bom = computeBom(d, withBeadBar(1000)) // máximo 700 → 3 piezas
    const pieces = arcs(bom)
    const lengths = pieces.flatMap((c) => Array<number>(c.qty).fill(c.length))
    expect(lengths).toHaveLength(3)
    for (const length of lengths) {
      expect(length).toBeCloseTo(1706.7 / 3, 1)
      expect(length).toBeLessThanOrEqual(700)
    }
    // Los extremos conservan el inglete del arco con el recto; la unión entre piezas va a 90°.
    expect(pieces.flatMap((c) => [c.angleStart, c.angleEnd]).filter((a) => a === 90)).toHaveLength(4)
    // Los tramos rectos del junquillo del mismo paño no se tocan.
    const straight = (b: Bom) => beads(b).filter((c) => c.label !== 'arco').map((c) => [c.label, c.length, c.qty])
    expect(straight(bom)).toEqual(straight(normal))
  })

  it('los polígonos y los junquillos que caben no se tocan', () => {
    // (la barra del junquillo cambia en la pieza; todo lo demás debe ser idéntico)
    const same = (a: Bom, b: Bom) => expect(a.cuts.map(({ barLength: _bar, ...rest }) => rest)).toEqual(b.cuts.map(({ barLength: _bar, ...rest }) => rest))
    for (const id of ['pentagon', 'octagon', 'gable', 'trapezoid', 'triangle'] as const) {
      const d = createDesign(id, { ...base })
      same(computeBom(d, withBeadBar(1300)), computeBom(d, v5Catalog()))
    }
    const small = createDesign('arch', { ...base, width: 900, height: 1200 })
    same(computeBom(small, withBeadBar(2000)), computeBom(small, v5Catalog()))
  })

  it('partir el junquillo no cambia los metros que se cobran', () => {
    const d = createDesign('arch', { ...base, width: 2000, height: 2000 })
    const a = priceItem(computeBom(d, v5Catalog()), d, v5Catalog(), {})
    const catalog = withBeadBar(3000)
    const b = priceItem(computeBom(d, catalog), d, catalog, {})
    const beadQty = (p: typeof a) => p.lines.find((l) => l.code === 'PRO05')!.qty
    expect(Math.abs(beadQty(a) - beadQty(b))).toBeLessThan(0.01)
  })
})
