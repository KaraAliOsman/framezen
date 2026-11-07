import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lineReadiness } from '../src/index'
import { formatImportReport, importBrandData, type ImportResult } from '../src/node'
import { catalogProblems } from './integrity'
import { createQualitySource } from './quality-fixtures'

let source: string
let result: ImportResult

beforeAll(() => {
  source = createQualitySource()
  result = importBrandData(source)
})

afterAll(() => {
  rmSync(source, { recursive: true, force: true })
})

const line = (id: string) => {
  const found = result.catalog.lines.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no existe la línea ${id}: ${result.catalog.lines.map((l) => l.id).join(', ')}`)
  return found
}
const code = (id?: string) => result.catalog.profiles.find((profile) => profile.id === id)?.code
const brandReport = (id: string) => result.report.brands.find((brand) => brand.id === id)!

describe('calidad del importador (marca sintética Cordillera)', () => {
  it('produce un catálogo íntegro', () => {
    expect(catalogProblems(result.catalog)).toEqual([])
  })

  it('nunca elige rótulas, mosquiteros ni tapas como estructura', () => {
    const practicable = line('cordillera.cordillera-60')
    expect(code(practicable.profiles.frame)).toBe('CO100')
    expect(code(practicable.profiles.sash)).toBe('CO200')
    expect(code(practicable.profiles.mullion)).toBe('CO300') // no la barra T de mosquitero
    expect(code(practicable.profiles.french_mullion)).toBe('CO320') // el poste inversor es la unión de doble hoja
    expect(code(practicable.profiles.bead)).toBe('CO400') // el de termopanel 18-20, no el monolítico
    for (const complement of ['CO310', 'CO450', 'CO460']) {
      expect(result.catalog.profiles.find((profile) => profile.code === complement)?.role).toBe('other')
    }
  })

  it('une el sufijo de color del código con su modelo (CO200N nogal = CO200)', () => {
    const sash = result.catalog.profiles.filter((profile) => profile.code.startsWith('CO200'))
    expect(sash).toHaveLength(1)
    expect(sash[0].priceByColor).toEqual({ blanco: 25000, nogal: 36000 })
  })

  it('deja los perfiles comunes disponibles para todas las líneas de la marca', () => {
    const coupler = result.catalog.profiles.find((profile) => profile.code === 'COAC')!
    const lines = result.catalog.lines.filter((candidate) => candidate.profiles.coupler === coupler.id)
    expect(lines.map((candidate) => candidate.id)).toEqual(expect.arrayContaining(['cordillera.cordillera-60', 'cordillera.cordillera-corredera-70']))
    expect(code(line('cordillera.cordillera-corredera-70').profiles.guide)).toBe('CORIEL')
  })

  it('crea variantes de corredera con su marco, su hoja y su pauta', () => {
    const base = line('cordillera.cordillera-corredera-70')
    expect(code(base.profiles.sliding_frame)).toBe('CO501')
    expect(code(base.profiles.sliding_sash)).toBe('CO511')
    expect(code(base.profiles.interlock)).toBe('CO520') // no el inversor de 4ª hoja
    expect(base.pauta).toMatchObject({ frameDeduction: 50, sashWidth: 80, sashDeduction: 60 })
    expect(base.typologyIds.sort()).toEqual(['sliding_2', 'sliding_2_fixed', 'sliding_3'])

    const triple = line('cordillera.cordillera-corredera-70-triple-riel')
    expect(triple.name).toBe('Cordillera Corredera 70 · triple riel')
    expect(code(triple.profiles.sliding_frame)).toBe('CO502')
    expect(triple.pauta.frameDeduction).toBe(48)
    // «6 hojas triple riel» es la corredera de 6 hojas de 3 rieles (v5): se publica junto a la de 3 hojas.
    expect([...triple.typologyIds].sort()).toEqual(['sliding_3_rail', 'sliding_6'])
    expect(code(triple.profiles.guide)).toBe('CORIEL')

    const wide = line('cordillera.cordillera-corredera-70-hoja-100-mm')
    expect(code(wide.profiles.sliding_sash)).toBe('CO513') // nunca la hoja de puerta corredera
    expect(wide.pauta).toMatchObject({ sashWidth: 100, sashDeduction: 80 })
    expect(brandReport('cordillera').lines.find((entry) => entry.id === wide.id)?.variantOf).toBe(base.id)
  })

  it('separa puertas declaradas como ventana para la pauta', () => {
    const practicable = line('cordillera.cordillera-60')
    expect(practicable.pauta).toMatchObject({ frameDeduction: 44, sashWidth: 78, sashDeduction: 58 })
    expect(practicable.doorPauta).toEqual({ sashWidth: 108, sashDeduction: 88 })
    expect(practicable.typologyIds).toEqual(expect.arrayContaining(['door', 'casement_double', 'fixed_casement']))
  })

  it('calcula la completitud con reglas reales y la explica', () => {
    const practicable = line('cordillera.cordillera-60')
    // Todo con precio, pero sus cortes no están confirmados: se cotiza con aviso, nunca como automática.
    expect(practicable.completeness).toBe('partial')
    const report = brandReport('cordillera').lines.find((entry) => entry.id === practicable.id)!
    expect(report.readiness).toMatchObject({ state: 'warnings', headline: 'Cotiza con avisos: falta la pauta del fabricante', readyColors: ['blanco', 'nogal'] })
    // El tornillo con envase deducido queda anotado en la línea que lo usa.
    expect(report.readiness.details.join(' ')).toContain('Confirma el envase')

    const noPrices = line('cordillera.cordillera-50')
    expect(noPrices.completeness).toBe('partial')
    const geometry = lineReadiness(result.catalog, noPrices)
    expect(geometry.state).toBe('geometry')
    expect(geometry.headline).toBe('Solo medidas')

    expect(result.report.readiness.geometry).toBeGreaterThanOrEqual(1)
    const text = formatImportReport(result.report)
    expect(text).toContain('Para cotizar:')
    expect(text).toContain('Solo medidas')
  })

  it('fusiona duplicados comerciales y marca las unidades dudosas', () => {
    const report = brandReport('cordillera')
    expect(result.catalog.items.filter((item) => item.code === 'CH-1')).toHaveLength(1)
    expect(report.duplicates).toEqual([{ keptId: 'cordillera.ch-1', rowIds: ['5302'], name: 'Bisagra 2D blanca' }])
    expect(result.catalog.items.find((item) => item.code === 'CH-2')).toMatchObject({ unit: 'caja', packSize: 1000 })
    expect(report.doubtfulUnits.map((entry) => entry.id)).toContain('cordillera.ch-2')
  })

  it('lee los DVH por capas y descarta lo que no es vidrio', () => {
    const glass = result.catalog.glass.filter((entry) => entry.brandId === 'vidrios-cordillera')
    expect(glass.find((entry) => entry.name.startsWith('DVH 4+4'))).toMatchObject({
      name: 'DVH 4+4 (cámara mate 10)',
      kind: 'dvh',
      thickness: 18,
      composition: '4 + 10 cámara + 4',
      weightKgM2: 20,
    })
    expect(glass.find((entry) => entry.name.includes('Blue Green'))).toMatchObject({ thickness: 22, weightKgM2: 25 })
    expect(glass.some((entry) => /PALETA|SILICONA/i.test(entry.name))).toBe(false)
    const items = result.catalog.items.filter((item) => item.brandId === 'vidrios-cordillera')
    expect(items.find((item) => item.code === '120500001')?.kind).toBe('other')
    expect(items.find((item) => item.code === '061700030')).toMatchObject({ kind: 'consumable', unit: 'cartucho' })
  })
})
