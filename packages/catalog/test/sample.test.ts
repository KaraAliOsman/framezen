import type { Item } from '@framezen/engine'
import { describe, expect, it } from 'vitest'
import {
  CATALOG_STATS,
  GENERIC_ACCESSORY_RULES,
  GENERIC_HARDWARE_RULES,
  GENERIC_ITEMS,
  GENERIC_SLIDING_ACCESSORY_RULES,
  GENERIC_SLIDING_HARDWARE_RULES,
  SAMPLE_CATALOG,
  SAMPLE_DEFAULTS,
  SAMPLE_SOURCE,
  buildLineRules,
  catalogStats,
  genericRulesFor,
} from '../src/index'
import { catalogProblems } from './integrity'

describe('SAMPLE_CATALOG', () => {
  it('es íntegro: ids únicos y referencias que existen', () => {
    expect(catalogProblems(SAMPLE_CATALOG)).toEqual([])
  })

  it('trae tres líneas genéricas, colores y vidrios pedidos', () => {
    expect(SAMPLE_CATALOG.lines.map((line) => line.name)).toEqual(['Serie 60 Practicable', 'Serie 70 Corredera', 'Serie Puerta 70'])
    expect(SAMPLE_CATALOG.colors.map((color) => color.name)).toEqual(['Blanco', 'Nogal', 'Roble dorado', 'Antracita', 'Negro'])
    const glassNames = SAMPLE_CATALOG.glass.map((glass) => glass.name)
    for (const name of ['Incoloro 4 mm', 'Incoloro 5 mm', 'Laminado 3+3', 'DVH 4+12+4', 'DVH 5+12+5', 'DVH 4+12+4 low-e']) expect(glassNames).toContain(name)
    expect(SAMPLE_CATALOG.lines.every((line) => line.source === SAMPLE_SOURCE && line.completeness === 'complete')).toBe(true)
  })

  it('tiene precio por barra en todos los colores de su línea', () => {
    for (const profile of SAMPLE_CATALOG.profiles) {
      const line = SAMPLE_CATALOG.lines.find((candidate) => candidate.id === profile.lineId)!
      for (const colorId of line.colorIds) expect(profile.priceByColor[colorId], `${profile.code} ${colorId}`).toBeGreaterThan(0)
      expect(profile.barLength).toBe(5800)
    }
    const marco = SAMPLE_CATALOG.profiles.find((profile) => profile.code === 'S60-01')!
    expect(marco.priceByColor.negro).toBeGreaterThan(marco.priceByColor.blanco)
    const refuerzo = SAMPLE_CATALOG.profiles.find((profile) => profile.code === 'S60-R1')!
    expect(new Set(Object.values(refuerzo.priceByColor)).size).toBe(1)
  })

  it('las líneas practicables y corredera traen sus perfiles por rol', () => {
    const [s60, s70, p70] = SAMPLE_CATALOG.lines
    expect(s60.kind).toBe('casement')
    expect(Object.keys(s60.profiles)).toEqual(expect.arrayContaining(['frame', 'sash', 'mullion', 'bead', 'french_mullion']))
    expect(s70.kind).toBe('sliding')
    expect(Object.keys(s70.profiles)).toEqual(expect.arrayContaining(['sliding_frame', 'sliding_sash', 'interlock', 'bead', 'guide']))
    expect(s70.typologyIds).toContain('sliding_mono')
    expect(p70.doorPauta).toEqual({ sashWidth: 112, sashDeduction: 92 })
    expect(p70.typologyIds).toContain('door_double')
    expect(SAMPLE_DEFAULTS.lineId).toBe(s60.id)
  })

  it('las estadísticas cuentan todo con precio', () => {
    const stats = catalogStats(SAMPLE_CATALOG)
    expect(stats).toMatchObject({ brands: 3, lines: 3, profilesUnpriced: 0, itemsUnpriced: 0, glassUnpriced: 0, colors: 5 })
    expect(stats.linesByKind).toEqual({ casement: 2, sliding: 1 })
    expect(CATALOG_STATS(SAMPLE_CATALOG)).toEqual(stats)
  })
})

describe('reglas genéricas', () => {
  it('referencian ítems genéricos existentes', () => {
    const ids = new Set(GENERIC_ITEMS.map((item) => item.id))
    for (const rule of [...GENERIC_HARDWARE_RULES, ...GENERIC_ACCESSORY_RULES, ...GENERIC_SLIDING_HARDWARE_RULES, ...GENERIC_SLIDING_ACCESSORY_RULES]) {
      expect(ids.has(rule.itemId), rule.id).toBe(true)
    }
  })

  it('cremonas por rango de alto sin solaparse y bisagras con perStep', () => {
    const cremonas = GENERIC_HARDWARE_RULES.filter((rule) => rule.id.startsWith('fz.r.cremona'))
    for (let i = 1; i < cremonas.length; i++) expect(cremonas[i].minHeight!).toBeGreaterThan(cremonas[i - 1].maxHeight!)
    const hinge = GENERIC_HARDWARE_RULES.find((rule) => rule.id === 'fz.r.bisagra-2')!
    expect(hinge).toMatchObject({ qty: 2, minHeight: 1000.1, perStep: { stepMm: 700, qty: 1 } })
    expect(GENERIC_HARDWARE_RULES.some((rule) => rule.openings.includes('door'))).toBe(true)
  })

  it('las correderas llevan kit por hoja móvil (openings vacío) y felpa por metro', () => {
    const { hardwareRules, accessoryRules } = genericRulesFor('sliding')
    expect(hardwareRules).toEqual([{ id: 'fz.r.kit-corredera', openings: [], itemId: 'fz.kit-corredera', qty: 1 }])
    expect(accessoryRules.find((rule) => rule.itemId === 'fz.felpa')?.per).toBe('perimeter_m')
    expect(accessoryRules.some((rule) => rule.itemId === 'fz.kit-corredera')).toBe(false)
  })

  it('buildLineRules usa los artículos de la marca y completa con genéricos', () => {
    const item = (id: string, name: string, price = 1000): Item => ({ id, brandId: 'x', kind: 'hardware', code: id, name, unit: 'u', price })
    const pool = [
      item('c1', 'Cremona abatir E15 400-600'),
      item('c2', 'Cremona abatir E15 600-800'),
      item('c3', 'Cremona abatir E25 600-800'),
      item('b1', 'Bisagra 2D marrón'),
      item('b2', 'Bisagra 2D blanca'),
      item('m1', 'Manilla ventana blanca'),
    ]
    const casement = buildLineRules('casement', [pool], 'linea')
    const cremonas = casement.hardwareRules.filter((rule) => /^linea\.r\.cremona-\d+$/.test(rule.id))
    expect(cremonas.map((rule) => [rule.itemId, rule.minHeight, rule.maxHeight])).toEqual([
      ['c1', 400, 600],
      ['c2', 600.1, 800],
    ])
    // Proyectante y oscilante: la misma cremona por el ANCHO de la hoja (OT 385 V7).
    const byWidth = casement.hardwareRules.filter((rule) => rule.id.startsWith('linea.r.cremona-ancho'))
    expect(byWidth.map((rule) => [rule.itemId, rule.openings, rule.minWidth, rule.maxWidth, rule.minHeight])).toEqual([
      ['c1', ['awning', 'tilt'], 400, 600, undefined],
      ['c2', ['awning', 'tilt'], 600.1, 800, undefined],
    ])
    expect(casement.hardwareRules.find((rule) => rule.id === 'linea.r.bisagra-1')?.itemId).toBe('b2')
    expect(casement.fromBrand).toEqual(expect.arrayContaining(['cremonas de abatir', 'bisagras de ventana', 'manilla de ventana']))
    expect(casement.fromGeneric).toContain('kit oscilobatiente')
    expect(casement.genericItemIds).toContain('fz.kit-ob-450-800')

    const sliding = buildLineRules(
      'sliding',
      [[item('k1', 'Carro doble 80 kg'), item('k2', 'Carro doble PRO-B 120 kg'), item('r1', 'Cremona corredera E15 600-800'), item('r2', 'Cremona corredera E15 800-1000')]],
      'corr',
      { lineName: 'PRO-B', otherLineNames: ['PRO-A'] },
    )
    expect(sliding.hardwareRules.find((rule) => rule.id === 'corr.r.carro')).toMatchObject({ itemId: 'k2', openings: [], qty: 2 })
    expect(sliding.hardwareRules.filter((rule) => rule.id.startsWith('corr.r.cremona')).map((rule) => [rule.itemId, rule.minHeight, rule.maxHeight])).toEqual([
      // Por alto de hoja − 100 mm: los tramos del nombre se corren 100 mm (OT 385: hoja 1.047 → 800-1000).
      ['r1', 700, 900],
      ['r2', 900.1, 1100],
    ])
    expect(sliding.fromGeneric).toContain('felpa')
  })

  it('buildLineRules completa los extremos de la familia de cremonas con el catálogo de respaldo', () => {
    const item = (id: string, name: string, price = 1000): Item => ({ id, brandId: 'x', kind: 'hardware', code: id, name, unit: 'u', price })
    const brand = [item('m1', 'Cremona aba E25 400-401/600'), item('m2', 'Cremona aba E25 600-601/800')]
    const fallback = [
      item('g0', 'Cremona abatir E25 280-400'),
      item('g1', 'Cremona abatir E25 600-800'), // la marca ya lo trae: no se duplica
      item('g2', 'Cremona abatir E25 800-1000'),
      item('g3', 'Cremona abatir E25 1000-1200'),
      item('g4', 'Cremona abatir E15 1200-1400'), // otra entrada: no se mezcla
      item('g5', 'Cremona abatir E25 1200-1400', 0), // sin precio: no suma
    ]
    const rules = buildLineRules('casement', [brand, fallback], 'linea')
    const byHeight = rules.hardwareRules.filter((rule) => /^linea\.r\.cremona-\d+$/.test(rule.id))
    expect(byHeight.map((rule) => [rule.itemId, rule.minHeight, rule.maxHeight])).toEqual([
      ['g0', 280, 400],
      ['m1', 400.1, 600],
      ['m2', 600.1, 800],
      ['g2', 800.1, 1000],
      ['g3', 1000.1, 1200],
    ])
    expect(rules.hardwareRules.filter((rule) => rule.id.startsWith('linea.r.cremona-ancho')).map((rule) => rule.itemId)).toEqual(['g0', 'm1', 'm2', 'g2', 'g3'])
    expect(rules.fromBrand).toContain('cremonas de abatir')
    expect(rules.fromOtherCatalog).toContain('cremonas de abatir más cortas o más largas')
  })

  it('buildLineRules: cada regla lleva la variante de color del artículo (marrón en madera, negro en oscuros)', () => {
    const item = (id: string, name: string, kind: Item['kind'] = 'hardware', price = 1000): Item => ({ id, brandId: 'x', kind, code: id, name, unit: 'u', price })
    const pool = [
      item('mb', 'T02940107 Manilla ventana blanca'),
      item('mm', 'T02940123 Manilla ventana marron'),
      item('mn', 'T02940108 Manilla ventana negra'),
      item('tb', 'Tope estanco blanco PRO-B', 'accessory'),
      item('tn', 'Tope estanco negro PRO-B', 'accessory'),
      item('sb', 'Silicona neutra blanco', 'consumable'),
      item('sm', 'Silicona neutra marron', 'consumable'),
      item('st', 'Silicona neutra toffe', 'consumable'),
      item('dm', 'Tapa desague marron', 'accessory', 0), // sin precio: no reemplaza a la blanca
      item('db', 'Tapa desague blanca', 'accessory'),
    ]
    const rules = buildLineRules('casement', [pool], 'linea', { colorIds: ['blanco', 'winchester', 'antracita'] })
    const byItem = (itemId: string) => [...rules.hardwareRules, ...rules.accessoryRules].find((rule) => rule.itemId === itemId)
    expect(byItem('mb')?.byColor).toEqual({ winchester: 'mm', antracita: 'mn' })
    // La silicona de los foliados madera es la toffee (OT 385 V1).
    expect(byItem('sb')?.byColor).toEqual({ winchester: 'st' })
    expect(byItem('db')?.byColor).toBeUndefined()
    const sliding = buildLineRules('sliding', [[...pool, item('k1', 'Carro doble PRO-B')]], 'corr', { lineName: 'PRO-B', ownCodes: ['PRO-B'], colorIds: ['blanco', 'winchester'] })
    // Sin tope marrón, la madera lleva el negro (OT 385 V4).
    expect(sliding.accessoryRules.find((rule) => rule.itemId === 'tb')?.byColor).toEqual({ winchester: 'tn' })
    // Sin colores de la línea no se agrega nada.
    expect(buildLineRules('casement', [pool], 'otra').hardwareRules.some((rule) => rule.byColor)).toBe(false)
  })

  it('buildLineRules: calzo de acristalar de 5 mm (no el de carro ni el ajustable) y 2 conectores por travesaño', () => {
    const item = (id: string, name: string, price = 100): Item => ({ id, brandId: 'x', kind: 'accessory', code: id, name, unit: 'u', price })
    const pool = [
      item('k1', 'Calzo carro 140 kg 2mm'),
      item('k2', 'Calzo ajustable 18 mm', 230),
      item('k3', 'Calzo 5 mm de 26X100 mm', 85),
      item('k4', 'Calzo cerradero corredera'),
      item('t1', 'Conector metalico barra t/marco PRO-B', 1000),
      item('t2', 'Conector metalico barra t/marco PRO-A', 1000),
      item('t3', 'Conector metalico monoriel', 800),
    ]
    const rules = buildLineRules('casement', [pool], 'linea', { lineName: 'PRO-B', otherLineNames: ['PRO-A'] })
    const calzos = rules.accessoryRules.filter((rule) => rule.itemId.startsWith('k'))
    // Tantos calzos como puentes (OT 385): 2 por ventana y 6 por hoja.
    expect(calzos.map((rule) => [rule.itemId, rule.per, rule.qty])).toEqual([
      ['k3', 'window', 2],
      ['k3', 'sash', 6],
    ])
    expect(rules.accessoryRules.filter((rule) => rule.itemId.startsWith('t')).map((rule) => [rule.itemId, rule.per, rule.qty])).toEqual([['t1', 'mullion', 2]])
    // La corredera no lleva conector de travesaño y sus calzos van 8 por hoja.
    const sliding = buildLineRules('sliding', [pool], 'corr', { lineName: 'PRO-B' })
    expect(sliding.accessoryRules.some((rule) => rule.per === 'mullion')).toBe(false)
    expect(sliding.accessoryRules.filter((rule) => rule.itemId.startsWith('k')).map((rule) => [rule.itemId, rule.per, rule.qty])).toEqual([['k3', 'sash', 8]])
  })
})
