import { describe, expect, it } from 'vitest'
import {
  createDesign,
  findNode,
  findParent,
  getTypology,
  mapNode,
  mergeNode,
  nextId,
  nodePath,
  resolveSizes,
  setColor,
  setGlass,
  setJoint,
  setLine,
  setMullionAxis,
  setNodeSize,
  setOpening,
  setShape,
  setSize,
  setSlidingPanels,
  splitNode,
  TYPOLOGIES,
} from '../../src/core'
import { TYPOLOGY_IDS } from '../../src/types'
import type { DesignNode, SplitNode, TypologyId, WindowDesign } from '../../src/types'
import { design, prolineCatalog } from './fixtures'

const catalog = prolineCatalog()
const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }

/** Ids de v4: los diseños guardados con ellos deben seguir cargando (compatibilidad). */
const V4_TYPOLOGY_IDS: TypologyId[] = [
  'fixed', 'casement', 'casement_out', 'tilt_turn', 'tilt', 'awning', 'casement_double', 'fixed_casement',
  'fixed_tilt_turn', 'casement_transom', 'fixed_awning_bottom', 'fixed_3', 'casement_fixed_casement', 'door',
  'door_double', 'door_sidelight', 'door_transom', 'arch', 'trapezoid', 'triangle', 'sliding_2', 'sliding_2_fixed',
  'sliding_3', 'sliding_3_rail', 'sliding_4', 'sliding_mono',
]
const ALL_TYPOLOGY_IDS: TypologyId[] = [...TYPOLOGY_IDS]

function ids(d: WindowDesign): string[] {
  const out: string[] = []
  const visit = (n: DesignNode) => {
    out.push(n.id)
    if (n.type === 'split') n.children.forEach(visit)
    if (n.type === 'sliding') n.panels.forEach((p) => out.push(p.id))
  }
  visit(d.root)
  return out
}

const sizesOf = (d: WindowDesign, id = d.root.id) => (findNode(d, id) as SplitNode).sizes

describe('tipologías', () => {
  it('cubren todos los TypologyId, con nombre, etiquetas y medida por defecto', () => {
    expect(TYPOLOGIES.map((t) => t.id)).toEqual(ALL_TYPOLOGY_IDS)
    expect(TYPOLOGIES).toHaveLength(TYPOLOGY_IDS.length)
    for (const id of V4_TYPOLOGY_IDS) expect(getTypology(id)?.id).toBe(id)
    for (const t of TYPOLOGIES) {
      expect(t.name.length).toBeGreaterThan(2)
      expect(t.tags.length).toBeGreaterThan(0)
      expect(t.defaultSize.width).toBeGreaterThan(0)
      expect(getTypology(t.id)).toBe(t)
    }
  })

  it('arman árboles válidos: ids únicos, correderas solo en tipologías corredera', () => {
    for (const t of TYPOLOGIES) {
      const d = createDesign(t.id, base)
      const list = ids(d)
      expect(new Set(list).size).toBe(list.length)
      expect(d.root.type === 'sliding').toBe(t.kind === 'sliding')
    }
  })

  it('createDesign es determinista, usa la medida por defecto y cae en paño fijo si el id no existe', () => {
    const a = createDesign('fixed_casement', base)
    expect(createDesign('fixed_casement', base)).toEqual(a)
    expect([a.width, a.height]).toEqual([1200, 1200])
    const unknown = createDesign('no-existe', base)
    expect(unknown.root).toEqual({ id: 'n1', type: 'leaf', opening: { kind: 'fixed' } })
    expect(createDesign('door', { ...base, width: 950.04, height: -5 }).width).toBe(950)
    expect(createDesign('door', { ...base, width: 950.04, height: -5 }).height).toBe(2100)
  })

  it('sobreluz de 400 mm en una puerta alta', () => {
    const d = createDesign('door_transom', { ...base, width: 900, height: 2500 })
    expect(sizesOf(d)).toEqual([400, null])
    expect(createDesign('arch', { ...base, width: 1200, height: 1500 }).shape).toEqual({ kind: 'arch', rise: 600 })
  })
})

describe('ids y búsqueda en el árbol', () => {
  it('nextId sigue al máximo existente y no usa azar', () => {
    const d = createDesign('casement_fixed_casement', base) // n1..n4
    expect(nextId(d)).toBe('n5')
    expect(nextId(design({ width: 1000, height: 1000, root: { id: 'x', type: 'leaf', opening: { kind: 'fixed' } } }))).toBe('n1')
    expect(nextId(createDesign('sliding_4', base))).toBe('n6')
  })

  it('findNode, findParent, nodePath y mapNode', () => {
    const d = createDesign('fixed_casement', base)
    expect(findNode(d, 'n3')?.type).toBe('leaf')
    expect(findParent(d, 'n3')).toEqual({ parent: d.root, index: 1 })
    expect(nodePath(d, 'n3')).toEqual(['n1', 'n3'])
    const mapped = mapNode(d.root, 'n2', (n) => ({ ...n, glassId: 'mono-4' }) as DesignNode)
    expect(mapped).not.toBe(d.root)
    expect((findNode(mapped, 'n2') as { glassId?: string }).glassId).toBe('mono-4')
    expect(mapNode(d.root, 'zz', (n) => n)).toBe(d.root)
  })
})

describe('resolveSizes', () => {
  it('reparte los vacíos en partes iguales a 0,1 mm', () => {
    expect(resolveSizes([null, null], 1193)).toEqual([596.5, 596.5])
    expect(resolveSizes([400, null], 2240)).toEqual([400, 1840])
    expect(resolveSizes([null, null, null], 1000)).toEqual([333.3, 333.3, 333.4])
  })

  it('reescala si las medidas fijas no cuadran y descuenta separadores', () => {
    expect(resolveSizes([500, 500], 1200)).toEqual([600, 600])
    expect(resolveSizes([900, null], 600).reduce((a, b) => a + b, 0)).toBeCloseTo(600, 6)
    expect(resolveSizes([null, null], 1000, 40)).toEqual([480, 480])
    expect(resolveSizes([], 1000)).toEqual([])
  })
})

describe('setSize', () => {
  const item04 = createDesign('fixed_casement', { ...base, width: 1193, height: 1350 })

  it('reescala proporcionalmente y no muta el original', () => {
    const fixedSizes = setNodeSize(item04, 'n1', 0, 400)
    const wider = setSize(fixedSizes, { width: 2386 })
    expect(sizesOf(wider)).toEqual([800, 1586])
    expect(sizesOf(fixedSizes)).toEqual([400, 793])
    expect(wider.height).toBe(1350)
  })

  it('las divisiones horizontales siguen al alto', () => {
    const door = createDesign('door_transom', { ...base, width: 856, height: 2240 })
    const d = setNodeSize(door, 'n1', 0, 400)
    expect(sizesOf(setSize(d, { height: 1120 }))).toEqual([200, 920])
  })

  it('ignora medidas inválidas y conserva la forma de medio punto', () => {
    expect(setSize(item04, { width: -3 })).toBe(item04)
    expect(setSize(item04, { width: Number.NaN, height: 1350 })).toBe(item04)
    const arch = createDesign('arch', { ...base, width: 1000, height: 1200 })
    expect(setSize(arch, { width: 1400 }).shape).toEqual({ kind: 'arch', rise: 700 })
  })
})

describe('divisiones', () => {
  it('splitNode divide un paño conservando su id en el primer hijo', () => {
    const d = splitNode(createDesign('fixed', base), 'n1', 'vertical')
    expect(d.root.type).toBe('split')
    const root = d.root as SplitNode
    expect(root.children.map((c) => c.id)).toEqual(['n1', 'n3'])
    expect(root.id).toBe('n2')
    expect(root.sizes).toEqual([null, null])
  })

  it('splitNode en la misma dirección del padre suma paños a esa división', () => {
    const d = splitNode(createDesign('fixed_casement', base), 'n3', 'vertical')
    const root = d.root as SplitNode
    expect(root.children).toHaveLength(3)
    expect(root.sizes).toEqual([600, 300, 300])
    expect(root.children[2].type === 'leaf' && root.children[2].opening.kind).toBe('casement')
  })

  it('splitNode en otra dirección anida y admite varias partes', () => {
    const d = splitNode(createDesign('fixed_casement', base), 'n2', 'horizontal', 3)
    const inner = findNode(d, (d.root as SplitNode).children[0].id) as SplitNode
    expect(inner.dir).toBe('horizontal')
    expect(inner.children).toHaveLength(3)
  })

  it('mergeNode quita un travesaño, un paño o toda la división', () => {
    const three = createDesign('casement_fixed_casement', base) // 1800: 600 · 600 · 600
    const a = mergeNode(three, 'n1', 0)
    expect((a.root as SplitNode).children.map((c) => c.id)).toEqual(['n2', 'n4'])
    expect(sizesOf(a)).toEqual([1200, 600])
    const b = mergeNode(three, 'n4')
    expect(sizesOf(b)).toEqual([600, 1200])
    const c = mergeNode(three, 'n1')
    expect(c.root).toEqual({ id: 'n2', type: 'leaf', opening: { kind: 'casement', hinge: 'left', direction: 'in' } })
    const two = mergeNode(createDesign('fixed_casement', base), 'n1', 0)
    expect(two.root.type).toBe('leaf')
  })

  it('setNodeSize mueve un solo travesaño respetando el paño mínimo de 200 mm', () => {
    const d = createDesign('fixed_casement', { ...base, width: 1193, height: 1350 })
    expect(sizesOf(setNodeSize(d, 'n1', 0, 400))).toEqual([400, 793])
    expect(sizesOf(setNodeSize(d, 'n1', 0, 50))).toEqual([200, 993])
    expect(sizesOf(setNodeSize(d, 'n1', 1, 1100))).toEqual([200, 993])
    expect(setNodeSize(d, 'n1', 5, 400)).toBe(d)
    expect(setNodeSize(d, 'n2', 0, 400)).toBe(d)
  })

  it('setMullionAxis ubica el eje en la posición pedida', () => {
    const d = createDesign('casement_fixed_casement', base)
    expect(sizesOf(setMullionAxis(d, 'n1', 1, 1000))).toEqual([600, 400, 800])
  })

  it('setJoint: unión francesa solo entre hojas lado a lado', () => {
    const v = createDesign('fixed_casement', base)
    expect((setJoint(v, 'n1', 'french').root as SplitNode).joint).toBe('french')
    const h = createDesign('casement_transom', base)
    expect(setJoint(h, 'n1', 'french')).toBe(h)
  })
})

describe('aperturas, vidrios, colores, forma', () => {
  it('setOpening cambia solo hojas', () => {
    const d = createDesign('fixed_casement', base)
    const next = setOpening(d, 'n2', { kind: 'tilt_turn', hinge: 'left' })
    expect((findNode(next, 'n2') as { opening: unknown }).opening).toEqual({ kind: 'tilt_turn', hinge: 'left' })
    expect(setOpening(d, 'n1', { kind: 'fixed' })).toBe(d)
  })

  it('setGlass por paño, por panel y para toda la ventana', () => {
    const d = setGlass(createDesign('fixed_casement', base), 'n2', 'mono-4')
    expect((findNode(d, 'n2') as { glassId?: string }).glassId).toBe('mono-4')
    const all = setGlass(d, null, 'mono-4')
    expect(all.glassId).toBe('mono-4')
    expect((findNode(all, 'n2') as { glassId?: string }).glassId).toBeUndefined()
    const s = setGlass(createDesign('sliding_2', base), 'n3', 'mono-4')
    expect(s.root.type === 'sliding' && s.root.panels[1].glassId).toBe('mono-4')
    expect(setGlass(s, 'nope', 'mono-4')).toBe(s)
  })

  it('setColor: bicolor solo si el interior es distinto', () => {
    const d = createDesign('fixed', base)
    expect(setColor(d, 'winchester', 'blanco').colorInId).toBe('blanco')
    expect(setColor(setColor(d, 'winchester', 'blanco'), 'antracita').colorInId).toBeUndefined()
    expect(setColor(d, 'blanco', 'blanco').colorInId).toBeUndefined()
  })

  it('setShape quita la forma al volver a rectangular', () => {
    const d = setShape(createDesign('fixed', base), { kind: 'triangle', apex: 'left' })
    expect(d.shape).toEqual({ kind: 'triangle', apex: 'left' })
    expect(setShape(d, { kind: 'rect' }).shape).toBeUndefined()
  })
})

describe('sin cambio: misma referencia (deshacer y memo no ven cambios falsos)', () => {
  it('setOpening con la misma apertura devuelve el mismo diseño', () => {
    const d = setOpening(createDesign('fixed_casement', base), 'n2', { kind: 'tilt_turn', hinge: 'left' })
    expect(setOpening(d, 'n2', { kind: 'tilt_turn', hinge: 'left' })).toBe(d)
    expect(setOpening(d, 'n2', { kind: 'tilt_turn', hinge: 'right' })).not.toBe(d)
    expect(setOpening(d, 'n2', { kind: 'tilt_turn', hinge: 'left', direction: 'out' })).not.toBe(d)
  })

  it('setGlass, setColor, setShape, setLine y setSize sin cambio', () => {
    const d = createDesign('fixed_casement', base)
    expect(setGlass(d, null, d.glassId)).toBe(d)
    const paned = setGlass(d, 'n2', 'mono-4')
    expect(setGlass(paned, 'n2', 'mono-4')).toBe(paned)
    expect(setGlass(paned, 'n1', 'mono-4')).not.toBe(paned)
    expect(setGlass(paned, null, paned.glassId)).not.toBe(paned)
    const s = setGlass(createDesign('sliding_2', base), 'n3', 'mono-4')
    expect(setGlass(s, 'n3', 'mono-4')).toBe(s)
    expect(setColor(d, d.colorId)).toBe(d)
    const bi = setColor(d, 'winchester', 'blanco')
    expect(setColor(bi, 'winchester', 'blanco')).toBe(bi)
    expect(setColor(bi, 'winchester')).not.toBe(bi)
    expect(setShape(d, undefined)).toBe(d)
    expect(setShape(d, { kind: 'rect' })).toBe(d)
    const tri = setShape(createDesign('fixed', base), { kind: 'triangle', apex: 'left' })
    expect(setShape(tri, { kind: 'triangle', apex: 'left' })).toBe(tri)
    expect(setLine(d, d.lineId, catalog)).toBe(d)
    expect(setSize(d, { width: d.width, height: d.height })).toBe(d)
    expect(setJoint(d, 'n1', 'mullion')).toBe(d)
  })

  it('setNodeSize y setSlidingPanels sin cambio', () => {
    const d = setNodeSize(createDesign('fixed_casement', { ...base, width: 1500 }), 'n1', 0, 600)
    expect(setNodeSize(d, 'n1', 0, 600)).toBe(d)
    const s = createDesign('sliding_2', base)
    if (s.root.type !== 'sliding') throw new Error('corredera')
    expect(setSlidingPanels(s, s.root.panels.map((p) => ({ ...p })), s.root.rails)).toBe(s)
    expect(setSlidingPanels(s, 3)).not.toBe(s)
  })
})

describe('setLine y correderas', () => {
  it('practicable → corredera conserva medidas y vidrios por paño', () => {
    const d = setGlass(createDesign('fixed_casement', { ...base, width: 1475, height: 1135 }), 'n2', 'mono-4')
    const s = setLine(d, 'prosld70', catalog)
    expect(s.lineId).toBe('prosld70')
    expect([s.width, s.height]).toEqual([1475, 1135])
    expect(s.root.type).toBe('sliding')
    if (s.root.type !== 'sliding') return
    expect(s.root.panels.map((p) => p.kind)).toEqual(['fixed', 'moving'])
    expect(s.root.panels[0].glassId).toBe('mono-4')
  })

  it('corredera → practicable arma hojas lado a lado', () => {
    const s = createDesign('sliding_2', { ...base, lineId: 'prosld70' })
    const c = setLine(s, 'pro6004', catalog)
    expect(c.root.type).toBe('split')
    const kinds = (c.root as SplitNode).children.map((n) => (n.type === 'leaf' ? n.opening.kind : n.type))
    expect(kinds).toEqual(['casement', 'casement'])
  })

  it('misma familia de línea: solo cambia lineId', () => {
    const d = createDesign('fixed', base)
    expect(setLine(d, 'otra', catalog)).toEqual({ ...d, lineId: 'otra' })
  })

  it('setSlidingPanels cambia la cantidad conservando ids y vidrios', () => {
    const s = setGlass(createDesign('sliding_2', base), 'n2', 'mono-4')
    const three = setSlidingPanels(s, 3)
    expect(three.root.type === 'sliding' && three.root.panels.map((p) => p.id)).toEqual(['n2', 'n3', 'n4'])
    expect(three.root.type === 'sliding' && three.root.panels[0].glassId).toBe('mono-4')
    const four = setSlidingPanels(s, 4, 2)
    expect(four.root.type === 'sliding' && four.root.panels.map((p) => p.kind)).toEqual(['fixed', 'moving', 'moving', 'fixed'])
    const mono = setSlidingPanels(s, [{ id: 'n2', kind: 'fixed' }, { id: 'n2', kind: 'moving' }], 1)
    expect(mono.root.type === 'sliding' && mono.root.rails).toBe(1)
    expect(mono.root.type === 'sliding' && new Set(mono.root.panels.map((p) => p.id)).size).toBe(2)
  })
})
