import { describe, expect, it } from 'vitest'
import {
  computeBom,
  computeLayout,
  createDesign,
  matchTypology,
  ruleApplies,
  setJoint,
  setOpening,
  setPassiveLeaf,
  setSize,
  setSlidingPanels,
  setSlidingSystem,
} from '../../src'
import type { Bom, HardwareRule, SlidingNode, SplitNode, WindowDesign } from '../../src/types'
import { lengths, prolineCatalog } from './fixtures'
import { v5Catalog } from './v5-fixtures'

const catalog = v5Catalog()
const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }
const hst = { ...base, lineId: 'hst' }
const sliding = { ...base, lineId: 'prosld70' }

const itemsOf = (bom: Bom, nodeId?: string) => bom.items.filter((i) => nodeId === undefined || i.nodeId === nodeId).map((i) => `${i.itemId}×${i.qty}`)
const codes = (bom: Bom) => bom.warnings.map((w) => w.code)

describe('ruleApplies: las aperturas nuevas nunca contaminan la corredera estándar', () => {
  const rule = (r: Partial<HardwareRule>): HardwareRule => ({ id: 'r', openings: [], itemId: 'x', qty: 1, ...r })

  it('corredera estándar: vacío y aperturas de v4 sí; aperturas nuevas y reglas de elevadora no', () => {
    expect(ruleApplies(rule({ openings: [] }), 'sliding_moving')).toBe(true)
    expect(ruleApplies(rule({ openings: ['casement'] }), 'sliding_moving')).toBe(true)
    for (const kind of ['pivot_v', 'pivot_h', 'tilt_slide', 'parallel_slide', 'folding'] as const) {
      expect(ruleApplies(rule({ openings: [kind] }), 'sliding_moving'), kind).toBe(false)
    }
    expect(ruleApplies(rule({ systems: ['lift_slide'] }), 'sliding_moving')).toBe(false)
    expect(ruleApplies(rule({ openings: ['fixed'] }), 'sliding_fixed')).toBe(true)
    expect(ruleApplies(rule({ openings: ['fixed'], systems: ['lift_slide'] }), 'sliding_fixed')).toBe(false)
  })

  it('elevadora: solo reglas declaradas para ella; nunca a hojas de practicable', () => {
    expect(ruleApplies(rule({ openings: [] }), 'lift_slide_moving')).toBe(false)
    expect(ruleApplies(rule({ systems: ['lift_slide'] }), 'lift_slide_moving')).toBe(true)
    expect(ruleApplies(rule({ systems: ['standard', 'lift_slide'] }), 'sliding_moving')).toBe(true)
    expect(ruleApplies(rule({ openings: ['fixed'], systems: ['lift_slide'] }), 'lift_slide_fixed')).toBe(true)
    expect(ruleApplies(rule({ systems: ['lift_slide'] }), 'casement')).toBe(false)
  })

  it('hoja activa/pasiva y secuencia del oscilobatiente', () => {
    expect(ruleApplies(rule({ openings: ['casement'], leaf: 'active' }), 'casement', { passive: true })).toBe(false)
    expect(ruleApplies(rule({ openings: ['casement'], leaf: 'passive' }), 'casement', { passive: true })).toBe(true)
    expect(ruleApplies(rule({ openings: ['casement'], leaf: 'passive' }), 'casement')).toBe(false)
    expect(ruleApplies(rule({ openings: ['casement'] }), 'casement', { passive: true })).toBe(true)
    expect(ruleApplies(rule({ openings: ['tilt_turn'], sequence: 'tilt_first' }), 'tilt_turn')).toBe(false)
    expect(ruleApplies(rule({ openings: ['tilt_turn'], sequence: 'tilt_first' }), 'tilt_turn', { sequence: 'tilt_first' })).toBe(true)
    expect(ruleApplies(rule({ openings: ['tilt_turn'], sequence: 'turn_first' }), 'tilt_turn')).toBe(true)
  })
})

describe('pivotantes', () => {
  it('vertical: kit pivotante, manilla en el montante lejano al eje', () => {
    const d = createDesign('pivot_v', base)
    const bom = computeBom(d, catalog)
    // Solo el kit pivotante: ni bisagras ni cremona de abatir.
    expect(itemsOf(bom, 'n1')).toEqual(['K-PIVV×1'])
    expect(computeLayout(d, catalog).sashes[0]).toMatchObject({ handle: 'right', opening: { kind: 'pivot_v', pivot: 0.5 } })
    const offset = setOpening(d, 'n1', { kind: 'pivot_v', pivot: 0.8 })
    expect(computeLayout(offset, catalog).sashes[0].handle).toBe('left')
    // El eje se acota a 5–95 % y solo existe en pivotantes.
    expect((setOpening(d, 'n1', { kind: 'pivot_v', pivot: 3 }).root as { opening: { pivot: number } }).opening.pivot).toBe(0.95)
    expect(setOpening(d, 'n1', { kind: 'casement', pivot: 0.3 }).root).toMatchObject({ opening: { kind: 'casement' } })
    expect('pivot' in (setOpening(d, 'n1', { kind: 'casement', pivot: 0.3 }).root as { opening: object }).opening).toBe(false)
  })

  it('horizontal: kit pivotante y manilla arriba', () => {
    const d = createDesign('pivot_h', base)
    expect(itemsOf(computeBom(d, catalog), 'n1')).toContain('K-PIVH×1')
    expect(computeLayout(d, catalog).sashes[0].handle).toBe('top')
  })
})

describe('osciloparalela y corredera paralela', () => {
  it('kit por ancho de hoja; la manilla va al lado de la jamba', () => {
    const d = createDesign('tilt_slide', base)
    const bom = computeBom(d, catalog)
    const sash = computeLayout(d, catalog).sashes[0]
    expect(sash).toMatchObject({ opening: { kind: 'tilt_slide', slide: 'left' }, handle: 'right' })
    // 2400 de ancho en dos paños: hoja de 1200 − 44 − 20 + 16 = 1152 → kit hasta 1200.
    expect(itemsOf(bom, 'n3')).toContain('K-PSK1×1')
    expect(lengths(bom.cuts, { role: 'mullion' })).toEqual([[2200, 1]])
    const wide = setSize(d, { width: 3000 })
    expect(itemsOf(computeBom(wide, catalog), 'n3')).toContain('K-PSK2×1')
  })

  it('corredera paralela con su kit y nombre', () => {
    const d = createDesign('parallel_slide', base)
    expect(itemsOf(computeBom(d, catalog), 'n3')).toContain('K-PS×1')
    expect(matchTypology(setOpening(d, 'n3', { kind: 'parallel_slide', slide: 'right' }))).toBe('parallel_slide')
  })
})

describe('plegables', () => {
  it('3 hojas a la izquierda: la de la jamba es la de paso (activa); sin travesaños; rieles arriba y abajo', () => {
    const d = createDesign('folding_3', base)
    const layout = computeLayout(d, catalog)
    const bom = computeBom(d, catalog)
    expect(layout.mullions.map((m) => m.kind)).toEqual(['fold', 'fold'])
    expect(lengths(bom.cuts, { role: 'mullion' })).toEqual([])
    expect(lengths(bom.cuts, { role: 'guide' })).toEqual([[2700 - 2 * 44, 2]])
    expect(layout.sashes.map((s) => [s.nodeId, s.handle ?? null, s.passive ?? false])).toEqual([
      ['n2', 'right', false],
      ['n3', null, true],
      ['n4', null, true],
    ])
    expect(itemsOf(bom, 'n2')).toEqual(expect.arrayContaining(['K-FOLD×1', 'K-FOLDA×1']))
    expect(itemsOf(bom, 'n3')).toEqual(expect.arrayContaining(['K-FOLD×1', 'K-FOLDP×1']))
    // Sin inversor: el plegable no lleva perfil entre hojas.
    expect(lengths(bom.cuts, { role: 'french_mullion' })).toEqual([])
    // Encuentro de plegable: cada hoja termina 2 mm antes del eje (traslapo 8 + 2 de luz).
    const sash = bom.cuts.filter((c) => c.role === 'sash' && c.label === 'arr/aba').map((c) => c.length)
    expect(sash).toEqual([900 - 44 - 10 + 16 + 6, 900 - 20 + 16 + 6, 900 - 44 - 10 + 16 + 6])
    // Solo el aviso informativo del acero de la hoja interior PRO02 (dato del catálogo de prueba).
    expect(bom.warnings.filter((w) => w.level !== 'info').map((w) => w.code)).toEqual([])
  })

  it('6 hojas en 3 + 3: una hoja de paso por grupo', () => {
    const layout = computeLayout(createDesign('folding_6', base), catalog)
    expect(layout.sashes.filter((s) => !s.passive).map((s) => [s.nodeId, s.handle])).toEqual([
      ['n2', 'right'],
      ['n7', 'left'],
    ])
  })

  it('4 hojas a un lado: la manilla va en la hoja que encabeza el grupo', () => {
    const layout = computeLayout(createDesign('folding_4', base), catalog)
    expect(layout.sashes.filter((s) => !s.passive).map((s) => s.nodeId)).toEqual(['n5'])
  })

  it('avisa grupos desordenados, uniones sin hojas plegables y hojas plegables sueltas', () => {
    const d = createDesign('folding_3', base)
    const root = d.root as SplitNode
    const mixed: WindowDesign = { ...d, root: { ...root, children: [root.children[0], { ...root.children[1], opening: { kind: 'folding', hinge: 'right' } }, root.children[2]] } as SplitNode }
    expect(codes(computeBom(mixed, catalog))).toContain('folding_groups')
    const withFixed: WindowDesign = { ...d, root: { ...root, children: [{ id: 'n2', type: 'leaf', opening: { kind: 'fixed' } }, ...root.children.slice(1)] } as SplitNode }
    const bom = computeBom(withFixed, catalog)
    expect(bom.warnings.find((w) => w.code === 'fold_needs_folding_leaves')?.fix?.label).toBe('Usar travesaño')
    const single = setOpening(createDesign('casement', base), 'n1', { kind: 'folding', hinge: 'left' })
    expect(codes(computeBom(single, catalog))).toContain('folding_needs_chain')
  })

  it('setJoint(fold) convierte las hojas en plegables; el plegable ancho avisa', () => {
    const d = setJoint(createDesign('fixed_3', { ...base, width: 2700, height: 2200 }), 'n1', 'fold')
    expect((d.root as SplitNode).children.every((c) => c.type === 'leaf' && c.opening.kind === 'folding')).toBe(true)
    expect(matchTypology(d)).toBe('folding_3')
    // Solo entre hojas lado a lado: una división horizontal no cambia (misma referencia).
    const transom = createDesign('casement_transom', base)
    expect(setJoint(transom, 'n1', 'fold')).toBe(transom)
    const wide = setSize(createDesign('folding_7', base), { width: 7000 })
    expect(codes(computeBom(wide, catalog))).toContain('element_too_large')
  })
})

describe('doble hoja francesa', () => {
  it('la pasiva lleva inversor y pasadores; sin manilla ni cremona (reglas con hoja activa)', () => {
    const d = createDesign('french_casement', { ...base, width: 1200, height: 1300 })
    const bom = computeBom(d, catalog)
    expect(lengths(bom.cuts, { role: 'french_mullion', nodeId: 'n2' })).toHaveLength(1)
    expect(itemsOf(bom, 'n2')).toContain('K-PAS×1')
    expect(itemsOf(bom, 'n2').some((i) => i.startsWith('H-M1') || i.startsWith('H-C12'))).toBe(false)
    expect(itemsOf(bom, 'n3')).toEqual(expect.arrayContaining(['H-M1×1', 'H-C12×1']))
  })

  it('pasiva a la derecha: inversor, manilla y pasadores cambian de hoja; sigue siendo la misma tipología', () => {
    const d = setPassiveLeaf(createDesign('french_casement', { ...base, width: 1200, height: 1300 }), 'n1', 'right')
    const bom = computeBom(d, catalog)
    expect(lengths(bom.cuts, { role: 'french_mullion', nodeId: 'n3' })).toHaveLength(1)
    expect(lengths(bom.cuts, { role: 'french_mullion', nodeId: 'n2' })).toEqual([])
    expect(computeLayout(d, catalog).sashes.map((s) => [s.nodeId, s.passive ?? false])).toEqual([
      ['n2', false],
      ['n3', true],
    ])
    expect(matchTypology(d)).toBe('french_casement')
    expect(setPassiveLeaf(d, 'n1', 'right')).toBe(d)
  })

  it('una puerta 2 hojas v4 con pasiva elegida sigue siendo «Puerta 2 hojas»', () => {
    const d = setPassiveLeaf(createDesign('door_double', base), 'n1', 'right')
    expect(matchTypology(d)).toBe('door_double')
    expect(matchTypology(setPassiveLeaf(createDesign('casement_double', base), 'n1', 'left'))).toBe('french_casement')
  })

  it('catálogo v4 sin reglas de hoja activa: la pasiva conserva todos sus herrajes (compatibilidad)', () => {
    const bom = computeBom(createDesign('casement_double', { ...base, width: 1200, height: 1300 }), prolineCatalog())
    expect(itemsOf(bom, 'n2')).toEqual(itemsOf(bom, 'n3'))
  })

  it('francesa oscilobatiente: solo la activa oscila', () => {
    const bom = computeBom(createDesign('french_tilt_turn', base), catalog)
    expect(itemsOf(bom, 'n3')).toContain('sin-precio×1')
    expect(itemsOf(bom, 'n2')).not.toContain('sin-precio×1')
  })
})

describe('oscila primero (tilt_first)', () => {
  it('suma el kit de seguridad y se conserva solo en oscilobatientes', () => {
    const d = createDesign('tilt_turn', { ...base, width: 700, height: 1300 })
    const tbt = setOpening(d, 'n1', { kind: 'tilt_turn', hinge: 'left', direction: 'in', sequence: 'tilt_first' })
    expect(itemsOf(computeBom(d, catalog), 'n1')).not.toContain('K-TBT×1')
    expect(itemsOf(computeBom(tbt, catalog), 'n1')).toContain('K-TBT×1')
    expect(setOpening(tbt, 'n1', { kind: 'casement', hinge: 'left', sequence: 'tilt_first' }).root).toEqual({ id: 'n1', type: 'leaf', opening: { kind: 'casement', hinge: 'left' } })
    expect(matchTypology(tbt)).toBe('tilt_turn')
  })
})

describe('puertas balconeras y de acceso', () => {
  it('balconera: hoja de puerta con la pauta de puerta y herrajes de abatir', () => {
    const cat = v5Catalog({ lines: [{ ...v5Catalog().lines[0], doorPauta: { sashWidth: 110, sashDeduction: 90 } }] })
    const d = createDesign('balcony_door', base)
    const bom = computeBom(d, cat)
    expect(bom.cuts.filter((c) => c.role === 'door_sash').length).toBeGreaterThan(0)
    expect(bom.glass[0].width).toBe(900 - 88 + 16 - 2 * 95)
    expect(matchTypology(d)).toBe('balcony_door')
    expect(matchTypology(setOpening(d, 'n1', { kind: 'tilt_turn', hinge: 'left', use: 'balcony' }))).toBeUndefined()
  })

  it('umbral bajo en balconeras y plegables al piso cuando se pide', () => {
    for (const id of ['balcony_door', 'entrance_door', 'folding_3'] as const) {
      const d = { ...createDesign(id, base), extras: { threshold: true } }
      const bom = computeBom(d, catalog)
      expect(lengths(bom.cuts, { role: 'threshold' }).length, id).toBe(1)
      expect(itemsOf(bom)).toContain('X-UMB×1')
    }
  })
})

describe('correderas: 6 hojas, fijos centrales y elevadora', () => {
  it('6 hojas en 3 rieles: rieles explícitos simétricos y aviso sobre 6', () => {
    const d = createDesign('sliding_6', sliding)
    expect(computeLayout(d, catalog).sliding.map((p) => p.rail)).toEqual([0, 1, 2, 2, 1, 0])
    const seven = setSlidingPanels(d, [...(d.root as SlidingNode).panels, { id: 'x', kind: 'moving' }])
    expect(codes(computeBom(seven, catalog))).toContain('sliding_too_many_panels')
  })

  it('fijo central doble: anchos propios que se reescalan con la ventana', () => {
    const d = createDesign('sliding_3_center_fixed', sliding)
    const layout = computeLayout(d, catalog)
    const widths = layout.sliding.map((p) => p.rect.w)
    expect(widths[1]).toBeCloseTo(2 * widths[0], 0)
    expect(widths[0]).toBe(widths[2])
    const resized = setSize(d, { width: 3000 })
    expect((resized.root as SlidingNode).sizes).toEqual([null, 1500, null])
    expect(matchTypology(resized)).toBe('sliding_3_center_fixed')
  })

  it('elevadora: umbral siempre, kit de elevadora por hoja móvil, nunca el kit de corredera', () => {
    const d = createDesign('lift_slide_2', hst)
    const bom = computeBom(d, catalog)
    expect(lengths(bom.cuts, { role: 'threshold' })).toEqual([[3000 - 2 * 58, 1]])
    expect(itemsOf(bom, 'n3')).toEqual(['K-HST×1'])
    expect(itemsOf(bom, 'n2')).toEqual(['K-HSTF×1'])
    expect(itemsOf(bom)).toContain('X-UMB×1')
    expect(computeLayout(d, catalog).slidingSystem).toBe('lift_slide')
    expect(codes(bom)).toEqual([])
    // En la línea de corredera estándar no hay reglas de elevadora: se avisa, no se mezclan kits.
    const onStandard = computeBom({ ...d, lineId: 'prosld70' }, catalog)
    expect(onStandard.items.some((i) => i.itemId === 'carro')).toBe(false)
    expect(codes(onStandard)).toContain('hardware_missing')
  })

  it('setSlidingSystem y setSlidingPanels conservan el sistema', () => {
    const d = createDesign('sliding_2_fixed', sliding)
    const lift = setSlidingSystem(d, 'lift_slide')
    expect((lift.root as SlidingNode).system).toBe('lift_slide')
    expect(setSlidingSystem(lift, 'lift_slide')).toBe(lift)
    expect('system' in setSlidingSystem(lift, 'standard').root).toBe(false)
    expect((setSlidingPanels(lift, 4).root as SlidingNode).system).toBe('lift_slide')
    expect(matchTypology({ ...lift, lineId: 'hst' })).toBe('lift_slide_2')
  })

  it('elevadora más ancha que lo publicado: aviso', () => {
    expect(codes(computeBom(setSize(createDesign('lift_slide_4', hst), { width: 7000 }), catalog))).toContain('element_too_large')
  })
})

describe('rangos de tamaño por apertura', () => {
  it('avisa hojas fuera del rango típico de su herraje, con código y medida', () => {
    const big = computeBom(createDesign('casement', { ...base, width: 1400, height: 1800 }), catalog)
    const w = big.warnings.find((x) => x.code === 'opening_too_large')
    expect(w?.nodeId).toBe('n1')
    expect(w?.message).toMatch(/rango típico de una hoja abatible es de 400 a 1\.000 mm de ancho/)
    const small = computeBom(createDesign('tilt_slide', { ...base, width: 1000, height: 2200 }), catalog)
    expect(small.warnings.find((x) => x.code === 'opening_too_small')?.nodeId).toBe('n3')
    // Las medidas por defecto de la galería quedan dentro de rango.
    expect(codes(computeBom(createDesign('folding_7', base), catalog))).not.toContain('opening_too_large')
  })
})
