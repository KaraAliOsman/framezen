import { describe, expect, it } from 'vitest'
import {
  TYPOLOGIES,
  computeBom,
  computeLayout,
  createDesign,
  describeDesign,
  designName,
  getTypology,
  isTypologyId,
  matchTypology,
  openingLabel,
  priceItem,
} from '../../src'
import { OPENING_KINDS, SHAPE_KINDS, TYPOLOGY_IDS, type DesignNode, type OpeningKind, type TypologyId } from '../../src/types'
import { lineFor, v5Catalog } from './v5-fixtures'

const catalog = v5Catalog()

const V5_IDS: TypologyId[] = [
  'sliding_6', 'sliding_3_center_fixed', 'sliding_4_center_fixed', 'lift_slide_2', 'lift_slide_3', 'lift_slide_4', 'tilt_slide',
  'tilt_slide_2', 'parallel_slide', 'folding_3', 'folding_4', 'folding_5', 'folding_6', 'folding_7', 'pivot_v', 'pivot_h',
  'french_casement', 'french_tilt_turn', 'balcony_door', 'balcony_door_double', 'entrance_door', 'entrance_door_sidelights',
  'door_double_sidelights', 'fixed_tilt_turn_fixed', 'tilt_turn_double_transom', 'round', 'oval', 'pentagon', 'octagon', 'gable',
  'arch_segmental', 'arch_casement',
]

function openings(node: DesignNode): OpeningKind[] {
  if (node.type === 'leaf') return [node.opening.kind]
  if (node.type === 'split') return node.children.flatMap(openings)
  return []
}

const designFor = (id: TypologyId, size?: { width: number; height: number }) => {
  const t = getTypology(id)!
  const built = t.build(t.defaultSize.width, t.defaultSize.height)
  const lift = built.root.type === 'sliding' && built.root.system === 'lift_slide'
  return createDesign(id, { lineId: lineFor(t.kind, lift), colorId: 'blanco', glassId: 'dvh-4-12-4', ...size })
}

describe('listas canónicas del motor', () => {
  it('TYPOLOGY_IDS es la galería completa, en orden, con los 32 ids de v5', () => {
    expect(TYPOLOGIES.map((t) => t.id)).toEqual([...TYPOLOGY_IDS])
    for (const id of V5_IDS) expect(TYPOLOGY_IDS).toContain(id)
    expect(new Set(TYPOLOGY_IDS).size).toBe(TYPOLOGY_IDS.length)
    expect(isTypologyId('folding_5')).toBe(true)
    expect(isTypologyId('folding_9')).toBe(false)
  })

  it('las aperturas y formas de cada plantilla están en OPENING_KINDS y SHAPE_KINDS', () => {
    for (const t of TYPOLOGIES) {
      const { root, shape } = t.build(t.defaultSize.width, t.defaultSize.height)
      for (const kind of openings(root)) expect(OPENING_KINDS).toContain(kind)
      expect(SHAPE_KINDS).toContain(shape?.kind ?? 'rect')
      expect(['window', 'door', 'sliding', 'folding', 'shape']).toContain(t.group)
    }
    expect(OPENING_KINDS).toEqual(['fixed', 'casement', 'tilt_turn', 'tilt', 'awning', 'door', 'pivot_v', 'pivot_h', 'tilt_slide', 'parallel_slide', 'folding'])
    expect(SHAPE_KINDS).toEqual(['rect', 'arch', 'trapezoid', 'triangle', 'round', 'oval', 'pentagon', 'octagon', 'gable'])
  })
})

describe('todas las tipologías calculan', () => {
  it.each(TYPOLOGIES.map((t) => t.id))('%s: dibujo, despiece, precio y nombre', (id) => {
    const d = designFor(id)
    const layout = computeLayout(d, catalog)
    const bom = computeBom(d, catalog)
    const price = priceItem(bom, d, catalog, {})
    expect(layout.cells.length).toBeGreaterThan(0)
    expect(layout.panes.length).toBeGreaterThan(0)
    expect(bom.cuts.length).toBeGreaterThan(0)
    if (!bom.panels?.some((p) => p.kind !== 'zocalo')) expect(bom.glass.length).toBeGreaterThan(0)
    expect(bom.warnings.filter((w) => w.level === 'error')).toEqual([])
    expect(bom.warnings.map((w) => w.code)).not.toContain('line_kind_mismatch')
    expect(bom.warnings.map((w) => w.code)).not.toContain('profile_missing')
    expect(bom.warnings.map((w) => w.code)).not.toContain('shape_not_fixed')
    // El precio puede quedar pendiente si el catálogo de prueba no cubre esa hoja; el costo siempre se calcula.
    expect(price.cost).toBeGreaterThan(0)
    expect(price.unitNet > 0 || (price.pending?.length ?? 0) > 0).toBe(true)
    expect(matchTypology(d)).toBe(id)
    expect(designName(d)).toBe(getTypology(id)!.name)
    expect(describeDesign(d, catalog).startsWith(getTypology(id)!.name)).toBe(true)
  })

  it('cada tipología se reconoce a sí misma también a otras medidas', () => {
    for (const t of TYPOLOGIES) {
      for (const f of [0.8, 1.25]) {
        const d = createDesign(t.id, { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4', width: t.defaultSize.width * f, height: t.defaultSize.height * f })
        expect(matchTypology(d), `${t.id} × ${f}`).toBe(t.id)
      }
    }
  })

  it('las aperturas nuevas tienen nombre propio (nunca «Fijo»)', () => {
    for (const kind of OPENING_KINDS.filter((k) => k !== 'fixed')) expect(openingLabel({ kind })).not.toBe('Fijo')
    expect(openingLabel({ kind: 'casement', use: 'balcony' })).toBe('Puerta balconera')
    expect(openingLabel({ kind: 'tilt_turn', use: 'balcony' })).toBe('Puerta balconera oscilobatiente')
    expect(openingLabel({ kind: 'door', use: 'entrance' })).toBe('Puerta de acceso')
    expect(openingLabel({ kind: 'tilt_turn', hinge: 'left', sequence: 'tilt_first' }, true)).toBe('Oscilobatiente, bisagras a la izquierda (vista interior), oscila primero')
    expect(openingLabel({ kind: 'tilt_slide', slide: 'left' }, true)).toBe('Osciloparalela, se desliza a la izquierda (vista interior)')
    expect(openingLabel({ kind: 'pivot_v', pivot: 0.5 }, true)).toBe('Pivotante vertical, eje centrado')
    expect(openingLabel({ kind: 'pivot_h', pivot: 0.3 }, true)).toBe('Pivotante horizontal, eje al 30 % desde arriba')
    expect(openingLabel({ kind: 'folding', hinge: 'right' }, true)).toBe('Plegable, se pliega a la derecha (vista interior)')
  })

  it('nombres compuestos para diseños libres con aperturas nuevas', () => {
    const d = designFor('folding_4')
    const root = d.root as Extract<DesignNode, { type: 'split' }>
    const five = { ...d, root: { ...root, children: [...root.children, { id: 'n9', type: 'leaf', opening: { kind: 'folding', hinge: 'left' } }], sizes: [...root.sizes, null] } } as typeof d
    expect(matchTypology(five)).toBe('folding_5')
    const eight = { ...d, root: { ...root, children: Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, type: 'leaf', opening: { kind: 'folding', hinge: 'left' } })), sizes: Array.from({ length: 8 }, () => null) } } as typeof d
    expect(matchTypology(eight)).toBeUndefined()
    expect(designName(eight)).toBe('Plegable 8 hojas')
    const lift5 = { ...designFor('lift_slide_4'), root: { id: 'n1', type: 'sliding', rails: 2, system: 'lift_slide', panels: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, kind: 'moving' })) } } as typeof d
    expect(designName(lift5)).toBe('Corredera elevadora 5 hojas')
  })
})
