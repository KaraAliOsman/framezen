import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG, hardwareRangeGaps } from '../src/index'
import { formatImportReport, importBrandData, loadBaseCatalog, readBaseCatalog, writeBaseCatalog, type ImportResult } from '../src/node'
import { createSyntheticSource } from './fixtures'
import { catalogProblems } from './integrity'

let source: string
let result: ImportResult

beforeAll(() => {
  source = createSyntheticSource()
  result = importBrandData(source)
})

afterAll(() => {
  rmSync(source, { recursive: true, force: true })
})

describe('importBrandData con datos sintéticos', () => {
  it('lee las listas, omite el archivo duplicado y descarta marcadores', () => {
    const { report } = result
    expect(report.files.read).toBe(3)
    expect(report.files.duplicates).toEqual([{ file: 'MisPrecios_15012026_0900 (1).csv', sameAs: 'MisPrecios_15012026_0900.csv' }])
    expect(report.priceListDate).toBe('15-01-2026')
    expect(report.rows.deprecated).toBe(2) // «NO USAR» en perfiles y vidrios
    expect(report.rows.virtual).toBe(1) // «Tamaño de Vidrios»
    expect(report.rows.placeholderPrice).toBeGreaterThanOrEqual(1) // 1,00 → 0
  })

  it('produce un catálogo íntegro', () => {
    expect(catalogProblems(result.catalog)).toEqual([])
    expect(result.catalog.profiles.some((profile) => profile.code.includes('AN999'))).toBe(false)
  })

  it('arma las líneas con tipo, pauta más frecuente, puertas y tipologías', () => {
    const lines = result.catalog.lines.filter((line) => line.brandId === 'andina')
    expect(lines.map((line) => line.name).sort()).toEqual(['Andina 60', 'Andina Corredera 70'])
    const practicable = lines.find((line) => line.name === 'Andina 60')!
    expect(practicable.kind).toBe('casement')
    expect(practicable.pauta).toMatchObject({ weld: 3, frameDeduction: 45, sashWidth: 78, sashDeduction: 58, sashOverlap: 8, glassGap: 5, mullionDeduction: 20 })
    expect(practicable.doorPauta).toEqual({ sashWidth: 108, sashDeduction: 88 })
    expect(practicable.typologyIds.sort()).toEqual(['awning', 'casement_out', 'door', 'fixed', 'tilt_turn'])
    expect(practicable.depth).toBe(60)
    const sliding = lines.find((line) => line.name === 'Andina Corredera 70')!
    expect(sliding.kind).toBe('sliding')
    expect(sliding.pauta.frameDeduction).toBe(50)
    expect(sliding.typologyIds.sort()).toEqual(['sliding_2', 'sliding_2_fixed', 'sliding_3'])
  })

  it('agrupa las variantes de color de un perfil y elige los perfiles por rol', () => {
    const line = result.catalog.lines.find((candidate) => candidate.id === 'andina.andina-60')!
    const frame = result.catalog.profiles.find((profile) => profile.id === line.profiles.frame)!
    expect(frame.code).toBe('AN100')
    expect(frame.role).toBe('frame')
    expect(frame.priceByColor).toEqual({ blanco: 21000, nogal: 30500, antracita: 32000 })
    expect(frame.face).toBe(62)
    expect(line.colorIds).toEqual(expect.arrayContaining(['blanco', 'nogal', 'antracita']))
    expect(result.catalog.profiles.find((profile) => profile.id === line.profiles.sash)?.code).toBe('AN200')
    expect(result.catalog.profiles.find((profile) => profile.id === line.profiles.door_sash)?.code).toBe('AN210')
    expect(result.catalog.profiles.find((profile) => profile.id === line.profiles.mullion)?.code).toBe('AN300')

    // Refuerzo sin color: mismo precio en todos los colores de la línea; enlazado por «para AN100».
    const reinforcement = result.catalog.profiles.find((profile) => profile.code === 'AR10')!
    expect(reinforcement.role).toBe('reinforcement')
    expect(new Set(Object.values(reinforcement.priceByColor))).toEqual(new Set([9000]))
    expect(frame.reinforcementId).toBe(reinforcement.id)
    expect(line.profiles.reinforcement).toBe(reinforcement.id)

    // Precio de relleno 1,00 → 0 (se cotiza con aviso, no bloquea).
    expect(result.catalog.profiles.find((profile) => profile.code === 'AN600')?.priceByColor.blanco).toBe(0)

    const sliding = result.catalog.lines.find((candidate) => candidate.id === 'andina.andina-corredera-70')!
    expect(result.catalog.profiles.find((profile) => profile.id === sliding.profiles.sliding_frame)?.role).toBe('sliding_frame')
    expect(result.catalog.profiles.find((profile) => profile.id === sliding.profiles.interlock)?.code).toBe('AN520')
  })

  it('importa herrajes con unidad y envase, y reglas con los artículos de la marca', () => {
    const items = result.catalog.items.filter((item) => item.brandId === 'andina')
    expect(items.find((item) => item.code === 'H-T1')).toMatchObject({ kind: 'consumable', unit: 'caja', packSize: 1000, price: 15000 })
    expect(items.find((item) => item.code === 'H-P1')).toMatchObject({ unit: 'par', name: 'Tapa batiente "clásica" (par)' })
    expect(items.find((item) => item.code === 'H-S1')).toMatchObject({ unit: 'cartucho', kind: 'consumable' })

    const line = result.catalog.lines.find((candidate) => candidate.id === 'andina.andina-60')!
    const cremonas = line.hardwareRules.filter((rule) => /\.r\.cremona-\d+$/.test(rule.id))
    expect(cremonas.map((rule) => rule.itemId)).toEqual(['andina.h-c1', 'andina.h-c2', 'andina.h-c3'])
    // La proyectante cierra con la misma cremona, elegida por el ancho, y 2 cerraderos.
    expect(line.hardwareRules.filter((rule) => rule.id.includes('.r.cremona-ancho')).map((rule) => [rule.itemId, rule.minWidth, rule.maxWidth])).toEqual([
      ['andina.h-c1', 400, 600],
      ['andina.h-c2', 600.1, 800],
      ['andina.h-c3', 800.1, 1000],
    ])
    expect(line.hardwareRules.some((rule) => rule.itemId === 'andina.h-b1')).toBe(true)
    // Lo que la marca no trae (kit oscilobatiente) se completa con genéricos que sí existen en el catálogo.
    expect(line.hardwareRules.some((rule) => rule.itemId.startsWith('fz.kit-ob'))).toBe(true)
    expect(result.catalog.brands.some((brand) => brand.id === 'dekopen-genericos')).toBe(true)
    const sliding = result.catalog.lines.find((candidate) => candidate.id === 'andina.andina-corredera-70')!
    expect(sliding.hardwareRules.find((rule) => rule.itemId === 'andina.h-k1')).toMatchObject({ openings: [], qty: 2 })
  })

  it('importa vidrios de las marcas de vidrio con precio m² y descarta los dudosos', () => {
    const glass = result.catalog.glass.filter((entry) => entry.brandId === 'vidrios-demo')
    expect(glass.find((entry) => entry.name === 'DVH 4+12+4')).toMatchObject({ kind: 'dvh', thickness: 20, pricePerM2: 31000 })
    expect(glass.find((entry) => entry.name === 'Cristal Incoloro 4mm')).toMatchObject({ kind: 'mono', pricePerM2: 14000 })
    expect(glass.find((entry) => entry.name.startsWith('Laminado'))).toMatchObject({ kind: 'laminated', thickness: 6.38 })
    expect(glass.find((entry) => entry.name === 'DVH 6+12+6')?.pricePerM2).toBe(0) // 11,00 no es un precio m² real
    expect(glass.some((entry) => entry.name.includes('5+12+5'))).toBe(false) // NO USAR
    expect(result.catalog.items.find((item) => item.code === 'SEP12')).toMatchObject({ kind: 'consumable', unit: 'm' })
    expect(result.catalog.brands.find((brand) => brand.id === 'vidrios-demo')?.kind).toBe('glass')
  })

  it('aplica los datos verificados de Proline', () => {
    const line = result.catalog.lines.find((candidate) => candidate.id === 'proline.pro6004')!
    expect(line.completeness).toBe('verified')
    expect(line.pauta).toMatchObject({ frameDeduction: 44, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, mullionDeduction: 20, reinforcement: { frame: 114, sash: 146, mullion: 20 } })
    expect(line.doorPauta).toMatchObject({ sashWidth: 110, sashDeduction: 90 })
    const code = (id?: string) => result.catalog.profiles.find((profile) => profile.id === id)?.code
    expect(code(line.profiles.frame)).toBe('PRO01')
    expect(code(line.profiles.sash)).toBe('PRO521')
    expect(code(line.sashInProfileId)).toBe('PRO02')
    expect(code(line.profiles.mullion)).toBe('PRO03')
    const frame = result.catalog.profiles.find((profile) => profile.id === line.profiles.frame)!
    expect(frame.priceByColor).toMatchObject({ blanco: 20000, nogal: 30000 })
    expect(frame.face).toBe(64)
    expect(code(frame.reinforcementId)).toBe('PRO-R1')
    expect(result.catalog.brandSettings.find((settings) => settings.brandId === 'proline')).toMatchObject({
      enabled: true,
      trim: 0,
      kerf: 4,
      // Sin descuentos en el catálogo base: cada taller carga los suyos en «Mis precios».
      discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 },
    })
    expect(line.source).toBe('Pauta de la distribuidora, verificada por DEKOPEN')
  })

  it('declara en PRO6004 las tipologías compuestas que el motor arma con travesaños', () => {
    const line = result.catalog.lines.find((candidate) => candidate.id === 'proline.pro6004')!
    expect(line.typologyIds).toEqual(expect.arrayContaining(['casement', 'fixed_casement', 'fixed_tilt_turn', 'casement_transom', 'fixed_awning_bottom', 'fixed_3', 'casement_fixed_casement']))
    // El Proline sintético no trae hoja de puerta (PRO04) ni inversor (PRO12): no se ofrecen
    // tipologías que no podría fabricar.
    for (const id of ['casement_double', 'door_transom', 'door_sidelight']) expect(line.typologyIds).not.toContain(id)
    expect(line.completeness).toBe('verified')
  })

  it('deja los tramos de herrajes de cada línea contiguos, sin huecos', () => {
    for (const line of result.catalog.lines) expect({ line: line.id, gaps: hardwareRangeGaps(line.hardwareRules) }).toEqual({ line: line.id, gaps: [] })
  })

  it('arma un reporte legible', () => {
    const text = formatImportReport(result.report)
    expect(text).toContain('Andina')
    expect(text).toContain('Perfiles')
    expect(result.report.totals.lines).toBe(result.catalog.lines.length)
  })

  it('no lanza si la carpeta no existe', () => {
    const empty = importBrandData(join(tmpdir(), 'dekopen-no-existe-123'))
    expect(empty.catalog.lines).toEqual([])
    expect(empty.report.warnings.length).toBeGreaterThan(0)
  })
})

describe('catálogo base en disco', () => {
  it('escribe y vuelve a leer el catálogo; sin archivo usa el de ejemplo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dekopen-base-'))
    const file = join(dir, 'sub', 'base.json')
    try {
      expect(readBaseCatalog(file)).toBeNull()
      expect(loadBaseCatalog(file)).toEqual({ catalog: SAMPLE_CATALOG, source: 'sample' })
      writeBaseCatalog(result.catalog, file)
      expect(existsSync(file)).toBe(true)
      expect(readBaseCatalog(file)).toEqual(result.catalog)
      expect(loadBaseCatalog(file).source).toBe('base')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
