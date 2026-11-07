/**
 * v5: todas las tipologías del motor se cotizan completas con el catálogo de ejemplo, las listas
 * del catálogo salen del motor y los colores foliados llevan su textura.
 */
import { computeBom, computeLayout, createDesign, getTypology, matchTypology, priceItem, setExtras, TYPOLOGY_IDS as ENGINE_IDS, type Item, type TypologyId } from '@dekopen/engine'
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TEXTURES,
  CASEMENT_TYPOLOGIES,
  COLOR_PALETTE,
  DOOR_TYPOLOGIES,
  SAMPLE_CATALOG,
  SAMPLE_DEFAULTS,
  SHAPED_FIXED_TYPOLOGIES,
  SLIDING_TYPOLOGIES,
  TYPOLOGY_IDS,
  buildLineRules,
  catalogReadiness,
  genericRulesFor,
  normalizeColor,
  requiredRolesFor,
  typologyKind,
} from '../src/index'

const linesFor = (id: TypologyId) => SAMPLE_CATALOG.lines.filter((line) => line.typologyIds.includes(id))
const PROBLEM = /missing|kind_mismatch|sin_precio|no_price|unpriced|price_zero|opening_too|element_too|glass_too_big|shape_not_fixed|hardware_out_of_range/

/**
 * Piden datos que un catálogo de ejemplo no debe inventar (hoja de guillotina, precio de celosía o
 * de panel): las ofrece la línea que de verdad las fabrica.
 */
const NEEDS_OWN_DATA = new Set<TypologyId>(['vertical_sliding', 'vertical_sliding_double', 'louver_fixed', 'door_panel', 'door_zocalo', 'door_double_zocalo'])

describe('cobertura del catálogo de ejemplo', () => {
  it('cada tipología del motor la ofrece al menos una línea de su tipo', () => {
    for (const id of ENGINE_IDS.filter((id) => !NEEDS_OWN_DATA.has(id))) {
      const lines = linesFor(id)
      expect(lines.length, id).toBeGreaterThan(0)
      for (const line of lines) expect(line.kind, `${id} en ${line.name}`).toBe(getTypology(id)!.kind)
    }
  })

  it.each(ENGINE_IDS.flatMap((id) => linesFor(id).map((line) => [id, line.id] as const)))('%s en %s: medidas por defecto sin avisos, precio completo', (id, lineId) => {
    for (const colorId of ['blanco', 'roble-dorado']) {
      const design = createDesign(id, { lineId, colorId, glassId: SAMPLE_DEFAULTS.glassId })
      const layout = computeLayout(design, SAMPLE_CATALOG)
      const bom = computeBom(design, SAMPLE_CATALOG)
      const price = priceItem(bom, design, SAMPLE_CATALOG, {})
      const problems = [...bom.warnings, ...price.warnings].filter((w) => w.level === 'error' || PROBLEM.test(w.code))
      expect(problems.map((w) => `${w.code}: ${w.message}`)).toEqual([])
      expect(layout.cells.length).toBeGreaterThan(0)
      expect(price.materials.profiles).toBeGreaterThan(0)
      expect(price.materials.glass).toBeGreaterThan(0)
      expect(price.materials.accessories).toBeGreaterThan(0)
      expect(matchTypology(design)).toBe(id)
      // Toda tipología con hojas que abren lleva herrajes.
      const opens = layout.sashes.length > 0 || layout.sliding.some((p) => p.kind === 'moving')
      if (opens) expect(price.materials.hardware, id).toBeGreaterThan(0)
    }
  })

  it('las cuatro líneas quedan «Lista para cotizar»', () => {
    const readiness = catalogReadiness(SAMPLE_CATALOG)
    for (const line of SAMPLE_CATALOG.lines) {
      const r = readiness.get(line.id)!
      expect([line.name, r.state, r.missing]).toEqual([line.name, 'ready', []])
    }
  })

  it('los roles requeridos siguen a las tipologías (riel en plegables, umbral en elevadoras)', () => {
    expect(requiredRolesFor({ kind: 'casement', typologyIds: ['folding_3'] })).toEqual(['frame', 'sash', 'bead', 'guide'])
    expect(requiredRolesFor({ kind: 'casement', typologyIds: ['door_double_sidelights'] })).toEqual(['frame', 'door_sash', 'mullion', 'french_mullion', 'bead'])
    expect(requiredRolesFor({ kind: 'sliding', typologyIds: ['lift_slide_2'] })).toEqual(['sliding_frame', 'sliding_sash', 'interlock', 'guide', 'bead', 'threshold'])
    expect(requiredRolesFor({ kind: 'sliding', typologyIds: ['sliding_6'] })).toEqual(['sliding_frame', 'sliding_sash', 'interlock', 'guide', 'bead'])
    expect(requiredRolesFor({ kind: 'casement', typologyIds: ['round', 'pentagon'] })).toEqual(['frame', 'bead'])
  })
})

describe('listas derivadas del motor (sin prefijos)', () => {
  it('TYPOLOGY_IDS es la lista del motor y las familias la reparten completa', () => {
    expect(TYPOLOGY_IDS).toBe(ENGINE_IDS)
    expect([...SLIDING_TYPOLOGIES, ...CASEMENT_TYPOLOGIES].sort()).toEqual([...ENGINE_IDS].sort())
    expect(SLIDING_TYPOLOGIES).toEqual(expect.arrayContaining(['lift_slide_2', 'lift_slide_3', 'lift_slide_4', 'sliding_6']))
    expect(CASEMENT_TYPOLOGIES).toEqual(expect.arrayContaining(['tilt_slide', 'parallel_slide', 'folding_7', 'pivot_v']))
    expect(DOOR_TYPOLOGIES).toEqual(expect.arrayContaining(['door', 'balcony_door', 'entrance_door_sidelights', 'door_double_sidelights']))
    expect(SHAPED_FIXED_TYPOLOGIES).toEqual(expect.arrayContaining(['round', 'oval', 'pentagon', 'octagon', 'gable', 'arch_segmental']))
    expect(SHAPED_FIXED_TYPOLOGIES).not.toContain('arch_casement')
    expect(typologyKind('lift_slide_2')).toBe('sliding')
    expect(typologyKind('tilt_slide')).toBe('casement')
  })
})

describe('extras cotizados con las reglas de accesorios', () => {
  it('persiana monoblock con motor, mosquitero plisado y alféizar entran al costo', () => {
    const plain = createDesign('casement', { lineId: 'serie-60', width: 800, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const full = setExtras(plain, { rollerShutter: { type: 'monoblock', operation: 'motor' }, insectScreen: { type: 'pleated' }, sill: true })
    const price = priceItem(computeBom(full, SAMPLE_CATALOG), full, SAMPLE_CATALOG, {})
    const base = priceItem(computeBom(plain, SAMPLE_CATALOG), plain, SAMPLE_CATALOG, {})
    const codes = price.lines.map((l) => l.code)
    expect(codes).toEqual(expect.arrayContaining(['FZ-PERSIANA-CORTINA', 'FZ-PERSIANA-CAJON-MONOBLOCK', 'FZ-PERSIANA-GUIA', 'FZ-PERSIANA-MOTOR', 'FZ-MOSQUITERO-PLISADO', 'FZ-ALFEIZAR']))
    expect(codes).not.toContain('FZ-PERSIANA-MANIVELA')
    expect(price.unitNet).toBeGreaterThan(base.unitNet)
    expect(price.warnings).toEqual([])
  })

  it('la elevadora cobra sus tapas de umbral', () => {
    const d = createDesign('lift_slide_2', { lineId: 'serie-85-elevadora', colorId: 'blanco', glassId: 'dvh-4-12-4' })
    expect(computeBom(d, SAMPLE_CATALOG).items.map((i) => i.itemId)).toEqual(expect.arrayContaining(['fz.kit-elevadora', 'fz.fijacion-elevadora', 'fz.tapa-umbral']))
  })
})

describe('reglas genéricas v5', () => {
  it('la doble hoja francesa: pasadores en la pasiva, manilla y cremona solo en la activa', () => {
    const d = createDesign('french_casement', { lineId: 'serie-60', colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const bom = computeBom(d, SAMPLE_CATALOG)
    const at = (nodeId: string) => bom.items.filter((i) => i.nodeId === nodeId).map((i) => i.itemId)
    expect(at('n2')).toContain('fz.pasador-pasiva')
    expect(at('n2').some((id) => id === 'fz.manilla-ventana' || id.startsWith('fz.cremona-'))).toBe(false)
    expect(at('n3')).toEqual(expect.arrayContaining(['fz.manilla-ventana']))
    expect(at('n3').some((id) => id.startsWith('fz.cremona-'))).toBe(true)
  })

  it('genericRulesFor: la elevadora usa su kit y nunca el de corredera', () => {
    const lift = genericRulesFor('sliding', { liftSlide: true })
    expect(lift.hardwareRules.map((r) => r.itemId)).toEqual(['fz.kit-elevadora', 'fz.fijacion-elevadora'])
    expect(lift.hardwareRules.every((r) => r.systems?.includes('lift_slide'))).toBe(true)
    expect(genericRulesFor('sliding').hardwareRules.some((r) => r.systems)).toBe(false)
  })

  it('buildLineRules: respaldo genérico para las aperturas v5 y manilla de marca solo en la hoja activa', () => {
    const item = (id: string, name: string): Item => ({ id, brandId: 'x', kind: 'hardware', code: id, name, unit: 'u', price: 1000 })
    const rules = buildLineRules('casement', [[item('m1', 'Manilla ventana blanca'), item('c1', 'Cremona abatir E15 400-600'), item('c2', 'Cremona abatir E15 600-800')]], 'linea')
    expect(rules.hardwareRules.find((r) => r.id === 'linea.r.manilla')?.leaf).toBe('active')
    expect(rules.hardwareRules.filter((r) => /^linea\.r\.cremona-\d+$/.test(r.id)).every((r) => r.leaf === 'active')).toBe(true)
    expect(rules.fromGeneric).toEqual(expect.arrayContaining(['kits de pivotante', 'kits de osciloparalela', 'herrajes de plegable', 'pasadores de hoja pasiva']))
    expect(rules.accessoryRules.some((r) => r.extra === 'rollerShutter')).toBe(true)
    const lift = buildLineRules('sliding', [[]], 'hst', { liftSlide: true })
    expect(lift.hardwareRules.map((r) => r.itemId)).toEqual(['fz.kit-elevadora', 'fz.fijacion-elevadora'])
  })
})

describe('colores foliados con textura', () => {
  it('la paleta asigna texturas incluidas a maderas, texturizados y metalizados', () => {
    const ids = new Set(BUILTIN_TEXTURES.map((t) => t.id))
    expect(ids.size).toBe(BUILTIN_TEXTURES.length)
    for (const color of COLOR_PALETTE) {
      if (!color.texture) continue
      expect(color.texture.kind).toBe('builtin')
      expect(ids.has((color.texture as { id: string }).id), color.id).toBe(true)
    }
    expect(COLOR_PALETTE.find((c) => c.id === 'nogal')?.texture).toEqual({ kind: 'builtin', id: 'wood-walnut', scaleMm: 450, finish: 'woodgrain' })
    expect(COLOR_PALETTE.find((c) => c.id === 'blanco')?.texture).toBeUndefined()
  })

  it('normalizeColor y el catálogo de ejemplo conservan la textura (copiada, no compartida)', () => {
    const golden = normalizeColor('GOLDEN OAK')
    expect(golden).toMatchObject({ id: 'roble-dorado', texture: { kind: 'builtin', id: 'wood-golden-oak', finish: 'woodgrain' } })
    expect(golden.texture).not.toBe(COLOR_PALETTE.find((c) => c.id === 'roble-dorado')?.texture)
    const sample = SAMPLE_CATALOG.colors.find((c) => c.id === 'roble-dorado')!
    expect(sample.texture).toEqual(golden.texture)
    expect(sample).not.toBe(COLOR_PALETTE.find((c) => c.id === 'roble-dorado'))
    expect(normalizeColor('VERDE MUSGO').texture).toBeUndefined()
  })
})
