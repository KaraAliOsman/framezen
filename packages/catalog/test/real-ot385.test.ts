/**
 * Casos dorados con el catálogo REAL de marcas contra la OT N° 385 (docs/research/06 §4 y §8).
 *
 * Importa de nuevo la carpeta de marcas (CATALOG_SOURCE_DIR, fuera del repositorio público) en vez
 * de leer `.data/catalog/base.json`, para probar el importador de hoy y no un archivo viejo. Si la
 * carpeta no existe (CI, otro equipo), se omite.
 *
 * Los herrajes y accesorios siguen el color de la ventana como en la OT: marrones (y silicona toffee)
 * en winchester, negros en antracita y el tope negro cuando la marca no tiene marrón (V4).
 *
 * Los precios esperados se calculan con la lista recién importada y un descuento de prueba
 * inventado: en este repositorio público no se escriben precios de lista ni el descuento de nadie.
 *
 * Diferencias conocidas con la OT, a propósito:
 * - La proyectante de V7 lleva brazos: la OT los omitió (research 06 lo marca como posible omisión).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { computeBom, createDesign, priceItem, roundHalfUp, type Bom, type Catalog, type DesignNode, type WindowDesign } from '@dekopen/engine'
import { beforeAll, describe, expect, it } from 'vitest'
import { hardwareRangeGaps } from '../src/index'
import { DEFAULT_SOURCE_DIR, importBrandData } from '../src/node'

const hasSource = existsSync(join(DEFAULT_SOURCE_DIR, 'items'))
const GLASS = 'vidrios.dvh-4-12-4'
const PRO6004 = 'proline.pro6004'

let catalog: Catalog

/** Descuento de prueba, inventado (el real de cada taller vive en su «Mis precios»). */
const TEST_DISCOUNT = 20

/** El catálogo importado con el descuento de prueba en todas las familias de Proline. */
function discounted(): Catalog {
  const pct = TEST_DISCOUNT
  return {
    ...catalog,
    brandSettings: catalog.brandSettings.map((settings) =>
      settings.brandId === 'proline' ? { ...settings, discounts: { profiles: pct, reinforcement: pct, hardware: pct, glass: pct, accessories: pct } } : settings,
    ),
  }
}

/** Artículo de Proline por código, tal como viene en la lista importada. */
function proline(code: string) {
  const item = catalog.items.find((candidate) => candidate.brandId === 'proline' && candidate.code === code)
  if (!item) throw new Error(`Proline no trae el artículo ${code}`)
  return item
}
/** Costo neto por unidad: precio del envase con el descuento de prueba, repartido por unidad. */
function netUnit(code: string): number {
  const item = proline(code)
  return (item.price * (1 - TEST_DISCOUNT / 100)) / (item.packSize && item.packSize > 0 ? item.packSize : 1)
}
const unitCost = (code: string) => roundHalfUp(netUnit(code), 2)
const cost = (code: string, qty: number) => roundHalfUp(qty * netUnit(code))

/** Cantidad total de cada artículo (el motor lo anota por hoja). */
function itemQty(bom: Bom): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of bom.items) {
    const code = line.code ?? line.itemId
    out[code] = Math.round(((out[code] ?? 0) + line.qty) * 100) / 100
  }
  return out
}

/** Cortes agrupados «código largo» → cantidad. */
function cuts(bom: Bom, kind?: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const cut of bom.cuts) {
    if (kind && cut.kind !== kind) continue
    const key = `${cut.code} ${cut.length}`
    out[key] = (out[key] ?? 0) + cut.qty
  }
  return out
}

function design(width: number, height: number, colorId: string, root: DesignNode, lineId = PRO6004): WindowDesign {
  return { version: 1, lineId, width, height, colorId, glassId: GLASS, root }
}

const v1 = () =>
  design(856, 2240, 'winchester', {
    id: 'n1',
    type: 'split',
    dir: 'horizontal',
    sizes: [400, 1840],
    children: [
      { id: 'n2', type: 'leaf', opening: { kind: 'fixed' } },
      { id: 'n3', type: 'leaf', opening: { kind: 'door', hinge: 'right', direction: 'in' } },
    ],
  })
const v7 = () =>
  design(1193, 1350, 'blanco', {
    id: 'n1',
    type: 'split',
    dir: 'vertical',
    sizes: [596.5, 596.5],
    children: [
      { id: 'n2', type: 'leaf', opening: { kind: 'casement', hinge: 'left', direction: 'out' } },
      { id: 'n3', type: 'leaf', opening: { kind: 'awning', direction: 'out' } },
    ],
  })
const v8 = () =>
  design(1193, 1358, 'blanco', {
    id: 'n1',
    type: 'split',
    dir: 'vertical',
    sizes: [596.5, 596.5],
    children: [
      { id: 'n2', type: 'leaf', opening: { kind: 'fixed' } },
      { id: 'n3', type: 'leaf', opening: { kind: 'casement', hinge: 'right', direction: 'in' } },
    ],
  })
const v9 = () =>
  design(2385, 900, 'antracita', {
    id: 'n1',
    type: 'split',
    dir: 'vertical',
    sizes: [1192.5, 1192.5],
    children: [
      { id: 'n2', type: 'leaf', opening: { kind: 'fixed' } },
      { id: 'n3', type: 'leaf', opening: { kind: 'fixed' } },
    ],
  })
const v6 = () => createDesign('sliding_2', { lineId: 'proline.prosld70', width: 1475, height: 1135, colorId: 'blanco', glassId: GLASS })

describe.skipIf(!hasSource)('catálogo real · casos dorados de la OT 385', () => {
  beforeAll(() => {
    catalog = importBrandData(DEFAULT_SOURCE_DIR).catalog
  })

  it('V6 · corredera PROSLD70 1.475 × 1.135: cortes, vidrios y herrajes de la OT', () => {
    const bom = computeBom(v6(), catalog)
    expect(cuts(bom, 'profile')).toEqual({
      'PRO201 1481': 2,
      'PRO201 1141': 2,
      'PRO211 739.5': 4,
      'PRO211 1053': 4,
      'PRO204 1047': 2,
      'PRO271 1371': 2,
    })
    expect(cuts(bom, 'bead')).toEqual({ 'PRO703 613.5': 4, 'PRO703 927': 4 })
    expect(cuts(bom, 'reinforcement')).toEqual({ 'PRO-R5 1351': 2, 'PRO-R5 1011': 2, 'PRO-R18 593.5': 4, 'PRO-R18 907': 4 })
    expect(bom.glass.map((glass) => [glass.width, glass.height])).toEqual([
      [603.5, 917],
      [603.5, 917],
    ])

    const items = itemQty(bom)
    // Herrajes de la OT: carro doble × 4, cremona E15 800-801/1000 × 2 (hoja 1.047 − 100), manilla recta × 2.
    const hardware = Object.fromEntries(bom.items.filter((line) => line.kind === 'hardware').map((line) => [line.code, items[line.code]]))
    expect(hardware).toEqual({ '121000030': 4, '121000005': 2, '120100059': 2 })
    expect(items).toMatchObject({
      '120800007': 2, // tope estanco blanco PRO201
      '120500066': 4, // tapa desagüe, 2 por hoja
      '120500051': 24, // tornillo 3,9 × 19
      '120500072': 20, // tornillo de instalación 7,5 × 92
      '120500061': 20, // tapa tornillo AMO3
      '120800012': 16, // puente de acristalamiento PROSLD70
      '120500034': 16, // calzo 5 mm 26 × 100, tantos como puentes
    })
    // El calzo ajustable de 18 mm es de otra holgura: la OT usa el de 5 mm.
    expect(items['120500128']).toBeUndefined()
    // Felpa 7 × 8 negra con aleta (061200008), no la 7 × 10. OT: 17,45 m.
    expect(items['061200025']).toBeUndefined()
    expect(items['061200008']).toBeGreaterThanOrEqual(17.45)
    expect(items['061200008']).toBeLessThan(17.45 * 1.05)
    // La OT no lleva cerradero en la corredera de 2 hojas.
    expect(bom.items.some((line) => /cerradero/i.test(line.name))).toBe(false)
    expect(bom.warnings.filter((warning) => warning.code.startsWith('hardware'))).toEqual([])

    // Herrajes con el descuento de la marca sobre la lista: 4 carros + 2 cremonas + 2 manillas.
    const price = priceItem(bom, v6(), discounted(), {})
    expect(price.materials.hardware).toBe(cost('121000030', 4) + cost('121000005', 2) + cost('120100059', 2))
  })

  it('T15–T17 · accesorios e insumos de Proline con el descuento de la marca, por envase', () => {
    const price = priceItem(computeBom(v6(), catalog), v6(), discounted(), {})
    const line = (code: string) => price.lines.find((entry) => entry.code === code)!
    // T15: tornillos 3,9 × 19 en caja de 1.000: el precio de la caja se reparte por unidad.
    expect(proline('120500051').packSize).toBe(1000)
    expect(line('120500051')).toMatchObject({ qty: 24, unitCost: unitCost('120500051'), total: cost('120500051', 24) })
    expect(line('120500051').unitCost).toBeLessThan(proline('120500051').price / 1000)
    // T16: tornillos 7,5 × 92 en caja de 200.
    expect(proline('120500072').packSize).toBe(200)
    expect(line('120500072').unitCost).toBe(unitCost('120500072'))
    // T17: la silicona neutra y la felpa llevan el mismo descuento (familia accesorios).
    expect(line('061700062').unitCost).toBe(unitCost('061700062'))
    expect(line('061200008').unitCost).toBe(unitCost('061200008'))
  })

  it('V7 · abatible + proyectante PRO6004: la proyectante cierra con cremona por ancho y 2 cerraderos', () => {
    const bom = computeBom(v7(), catalog)
    const items = itemQty(bom)
    expect(items).toMatchObject({
      '121000054': 1, // cremona aba E25 1200-1201/1400 (hoja abatible de 1.278 de alto)
      '121000050': 1, // cremona aba E25 400-401/600 (proyectante de 548,5 de ancho)
      '121000060': 3, // bisagra 2D 100 mm
      '121000150': 5, // cerraderos: 3 de la abatible + 2 de la proyectante
      '120100059': 2, // manilla recta
      '120800001': 2, // conector metálico del travesaño
      '120500051': 54, // tornillo 3,9 × 19: 18 del marco y 18 por hoja
      '120800010': 14, // puentes: 2 por ventana + 6 por hoja
      '120500034': 14, // calzos, tantos como puentes
    })
    // Hojas PRO521 con su refuerzo PRO-R19 («Refuerzo Pro 521»); marco y travesaño con PRO-R1.
    expect(cuts(bom, 'reinforcement')).toEqual({
      'PRO-R1 1085': 2,
      'PRO-R1 1242': 2,
      'PRO-R1 1330': 1,
      'PRO-R19 408.5': 4,
      'PRO-R19 1138': 4,
    })
  })

  it('V8 · fijo + hoja interior PRO6004: herrajes e insumos de la OT', () => {
    const items = itemQty(computeBom(v8(), catalog))
    expect(items).toMatchObject({
      '121000054': 1,
      '121000060': 3,
      '121000150': 3,
      '120100059': 1,
      '120500051': 36, // tornillo 3,9 × 19: 18 del marco y 18 de la hoja
      '120500044': 10, // tornillo de herrajes 4,1 × 25
      '120500072': 20,
      '120500061': 20,
      '120800010': 8, // puentes: 2 por ventana + 6 por hoja
      '120500034': 8,
      '120800001': 2, // conector metálico del travesaño
    })
  })

  it('V9 · dos fijos PRO6004: travesaño con su refuerzo y sus 2 conectores, sin herrajes', () => {
    const bom = computeBom(v9(), catalog)
    expect(cuts(bom, 'reinforcement')).toEqual({ 'PRO-R1 2277': 2, 'PRO-R1 792': 2, 'PRO-R1 880': 1 })
    const items = itemQty(bom)
    expect(items).toMatchObject({
      '120800001': 2, // los conectores que a la OT le faltaron
      '120500072': 20,
      '120500064': 20, // tapa tornillo negra (antracita)
      '120500074': 2, // tapa desagüe negra
      '061700063': 1.32, // silicona negra
      // La OT pone 36 tornillos de refuerzo y 4 puentes, pero en V8 (fijo + hoja) pone 36 y 8: se
      // sigue la regla que cuadra con V1, V7 y V8 (18 por marco + 18 por hoja; 2 + 6 por hoja).
      '120500051': 18,
      '120800010': 2,
    })
    expect(bom.items.filter((line) => line.kind === 'hardware')).toEqual([])
  })

  it('V1 · puerta + fijo PRO6004: herrajes Proline de la OT, sin cilindro genérico', () => {
    const bom = computeBom(v1(), catalog)
    const items = itemQty(bom)
    expect(items).toMatchObject({
      '121000105': 1, // cremona balconera E30 1700-2200
      '121000106': 2, // extensión de puerta
      '121000150': 4, // cerradero abatir R13
      '121000121': 1, // doble manilla marrón con llave (winchester)
      '121000111': 3, // bisagra 3D marrón 105 mm
      '120500060': 20, // tapa tornillo marrón
      '120500067': 2, // tapa desagüe marrón
      '061700065': 1.24, // silicona toffee
      '120500044': 10, // tornillo 4,1 × 25
      '120500051': 36, // tornillo 3,9 × 19 (OT: 12 + 24)
      '120500072': 20,
      '120800010': 8, // puentes: 2 del fijo + 6 de la puerta
      '120500034': 8, // calzos 5 mm
      '120800001': 2, // conector metálico del travesaño
    })
    expect(items['GEN-4040']).toBeUndefined()
    expect(items['GEN-ADHB']).toBeUndefined()
    expect(items['121000120']).toBeUndefined()
    expect(bom.items.some((line) => /cilindro/i.test(line.name))).toBe(false)
    // Doble manilla marrón con llave: su precio de lista con el descuento de herrajes.
    const price = priceItem(bom, v1(), discounted(), {})
    expect(price.lines.find((line) => line.code === '121000121')?.unitCost).toBe(unitCost('121000121'))
  })

  it('correderas PROSLD84 y monorriel: cremona por alto − 100, topes de su marco y cerradero solo en el fijo', () => {
    const v4 = computeBom(createDesign('sliding_2', { lineId: 'proline.prosld84', width: 1000, height: 1000, colorId: 'winchester', glassId: GLASS }), catalog)
    expect(itemQty(v4)).toMatchObject({ '121000030': 4, '121000004': 2, '120100058': 2, '120800016': 2, '120500067': 4, '120500051': 24, '120500044': 20, '120800013': 16 })
    const v3 = computeBom(createDesign('sliding_mono', { lineId: 'proline.prosld70-monorriel', width: 1000, height: 1000, colorId: 'winchester', glassId: GLASS }), catalog)
    expect(itemQty(v3)).toMatchObject({ '121000005': 1, '121000030': 2, '120100058': 1, '121000020': 2, '120800019': 2 })
    // OT V4 en winchester: manilla marrón y tope estanco NEGRO (Proline no hace el tope de PRO20 en marrón).
    expect(itemQty(v4)['120800009']).toBeUndefined()
  })

  it('PROSLD70 sin huecos de herrajes: toda hoja de 400 a 2.400 mm lleva cremona', () => {
    const line = catalog.lines.find((candidate) => candidate.id === 'proline.prosld70')!
    const cremonas = line.hardwareRules.filter((rule) => /\.r\.cremona-\d+$/.test(rule.id))
    // El último tramo («2000-2001/CV», cota variable) no tiene tope.
    expect(cremonas.at(-1)?.maxHeight).toBeUndefined()
    // Corredera típica de 2.400 × 1.500: hoja de 1.412 → cremona 1200-1201/1400.
    const typical = computeBom(createDesign('sliding_2', { lineId: line.id, width: 2400, height: 1500, colorId: 'blanco', glassId: GLASS }), catalog)
    expect(itemQty(typical)['121000007']).toBe(2)
    for (let height = 600; height <= 2500; height += 25) {
      const bom = computeBom(createDesign('sliding_2', { lineId: line.id, width: 1800, height, colorId: 'blanco', glassId: GLASS }), catalog)
      expect({ height, warnings: bom.warnings.filter((warning) => warning.code === 'hardware_out_of_range').map((warning) => warning.message) }).toEqual({ height, warnings: [] })
      expect(bom.items.filter((entry) => /cremona/i.test(entry.name)).reduce((sum, entry) => sum + entry.qty, 0)).toBe(2)
    }
  })

  it('PRO6004 y PRO7005 sin techo de cremonas: toda abatible y proyectante común cierra con una', () => {
    const cremonas = (bom: Bom) => bom.items.filter((entry) => /cremona/i.test(entry.name)).reduce((sum, entry) => sum + entry.qty, 0)
    for (const lineId of [PRO6004, 'proline.pro7005']) {
      // Abatible de 1.500 de alto: hoja de 1.428, sobre el último tramo E25 de Proline (1.200-1.400).
      const tall = computeBom(createDesign('casement', { lineId, width: 800, height: 1500, colorId: 'blanco', glassId: GLASS }), catalog)
      expect(tall.items.find((entry) => /cremona/i.test(entry.name))?.name).toMatch(/E25 1400-1600/)
      for (let height = 500; height <= 2250; height += 50) {
        const bom = computeBom(createDesign('casement', { lineId, width: 700, height, colorId: 'blanco', glassId: GLASS }), catalog)
        expect({ lineId, height, cremonas: cremonas(bom) }).toEqual({ lineId, height, cremonas: 1 })
      }
      for (let width = 500; width <= 2250; width += 50) {
        const bom = computeBom(createDesign('awning', { lineId, width, height: 600, colorId: 'blanco', glassId: GLASS }), catalog)
        expect({ lineId, width, cremonas: cremonas(bom), gaps: bom.warnings.filter((w) => w.code === 'hardware_out_of_range').length }).toEqual({ lineId, width, cremonas: 1, gaps: 0 })
      }
    }
  })

  it('ninguna línea del catálogo real deja huecos entre tramos de herrajes', () => {
    const withGaps = catalog.lines.map((line) => ({ line: line.id, gaps: hardwareRangeGaps(line.hardwareRules) })).filter((entry) => entry.gaps.length)
    expect(withGaps).toEqual([])
  })

  it('PRO6004 y PRO7005 ofrecen las compuestas con travesaño y las cotizan con precio de perfiles', () => {
    for (const lineId of [PRO6004, 'proline.pro7005']) {
      const line = catalog.lines.find((candidate) => candidate.id === lineId)!
      for (const typologyId of ['fixed_casement', 'casement_double', 'fixed_tilt_turn', 'casement_transom', 'fixed_awning_bottom', 'fixed_3', 'casement_fixed_casement', 'door_transom', 'door_sidelight']) {
        expect(line.typologyIds).toContain(typologyId)
      }
      const fixedCasement = createDesign('fixed_casement', { lineId, width: 1193, height: 1358, colorId: 'blanco', glassId: GLASS })
      const bom = computeBom(fixedCasement, catalog)
      const price = priceItem(bom, fixedCasement, catalog, {})
      expect(price.materials.profiles).toBeGreaterThan(0)
      expect(price.materials.reinforcement).toBeGreaterThan(0)
      expect([...bom.warnings, ...price.warnings].filter((warning) => /missing/.test(warning.code))).toEqual([])
    }
  })
})
