/**
 * Procedencia: el sistema dice de dónde sale cada corte y no presenta como automático lo que no
 * tiene base. Las evidencias de estas pruebas son inventadas; las reales son locales.
 */
import type { Line } from '@dekopen/engine'
import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG, applyEvidence, cutOrigin, defaultProvenance, lineProvenance, lineReadiness, provenanceWarnings, type CatalogEvidence } from '../src/index'

const sample = () => structuredClone(SAMPLE_CATALOG)
const SOURCE = { title: 'Ficha', publisher: 'Fabricante de prueba', url: 'https://example.com/ficha.pdf' }
const FACT = { origin: 'fabricante', source: 'ficha', status: 'verificado' } as const
const ALL_CUTS = {
  'pauta.weld': FACT,
  'pauta.frameDeduction': FACT,
  'pauta.sashWidth': FACT,
  'pauta.sashDeduction': FACT,
  'pauta.sashOverlap': FACT,
  'pauta.glassGap': FACT,
  'pauta.mullionDeduction': FACT,
}

describe('procedencia por defecto', () => {
  const line = (source: string, kind: Line['kind'] = 'casement') => ({ ...sample().lines[0]!, source, kind })

  it('una pauta de lista no pasa de «lista del taller» y las constantes quedan sin verificar', () => {
    const provenance = defaultProvenance(line('Pauta de la distribuidora (9 productos) · lista'))
    expect(provenance.fields['pauta.frameDeduction']?.origin).toBe('lista_taller')
    expect(provenance.fields['pauta.weld']?.origin).toBe('sin_verificar')
    expect(provenance.fields['pauta.glassGap']?.origin).toBe('sin_verificar')
    expect(provenance.fields['taller.kerf']?.origin).toBe('sin_verificar')
    expect(provenance.automatic).toBe(false)
    expect(provenance.reason).toContain('merma de soldadura')
  })

  it('la pauta típica nunca aparenta ser de la línea', () => {
    expect(defaultProvenance(line('Pauta típica de practicable: revisar con el fabricante')).fields['pauta.sashWidth']?.origin).toBe('sin_verificar')
  })

  it('una obra real respalda sus cortes como lista del taller, no como fabricante', () => {
    const provenance = defaultProvenance(line('Pauta de la distribuidora, verificada por DEKOPEN'))
    expect(provenance.automatic).toBe(true)
    expect(provenance.fields['pauta.weld']?.origin).toBe('lista_taller')
  })
})

describe('evidencia del fabricante', () => {
  const evidence = (lineId: string, patch: NonNullable<CatalogEvidence['lines']>[string]): CatalogEvidence => ({ version: 1, sources: { ficha: SOURCE }, lines: { [lineId]: patch } })

  it('«fabricante» sin fuente registrada se rebaja: nadie firma un dato que no se vio', () => {
    const catalog = sample()
    const line = catalog.lines[0]!
    const report = applyEvidence(catalog, evidence(line.id, { fields: { 'pauta.frameDeduction': { origin: 'fabricante', source: 'no-existe' } } }))
    expect(lineProvenance(line)!.fields['pauta.frameDeduction']?.origin).toBe('sin_verificar')
    expect(report.skipped.join(' ')).toContain('sin una fuente registrada')
  })

  it('cuando todos los cortes tienen fuente la línea queda automática y cita sus fuentes', () => {
    const catalog = sample()
    const line = catalog.lines[0]!
    applyEvidence(catalog, evidence(line.id, { fields: ALL_CUTS }))
    expect(lineProvenance(line)).toMatchObject({ automatic: true, sources: [{ id: 'ficha', url: SOURCE.url }] })
    expect(cutOrigin(line)).toBe('fabricante')
  })

  it('aplica correcciones y avisa lo que no pudo aplicar', () => {
    const catalog = sample()
    const line = catalog.lines[0]!
    const report = applyEvidence(catalog, evidence(line.id, { set: { depth: 61, pauta: { mullionDeduction: 21 }, roles: { bead: 'NO-EXISTE' } } }))
    expect(line).toMatchObject({ depth: 61, pauta: { mullionDeduction: 21 } })
    expect(report.skipped.join(' ')).toContain('NO-EXISTE')
  })

  it('crea una variante con sus perfiles y su pauta, sin tocar la línea madre', () => {
    const catalog = sample()
    const parent = catalog.lines[0]!
    const sash = parent.profiles.sash
    applyEvidence(catalog, {
      version: 1,
      sources: {},
      variants: [{ id: `${parent.id}-x`, parent: parent.id, name: `${parent.name} · x`, typologyIds: ['door'], set: { doorPauta: { sashWidth: 102 } } }],
    })
    const variant = catalog.lines.find((line) => line.id === `${parent.id}-x`)!
    expect(variant).toMatchObject({ typologyIds: ['door'], doorPauta: { sashWidth: 102 } })
    expect(parent.profiles.sash).toBe(sash)
    expect(parent.doorPauta?.sashWidth).not.toBe(102)
  })

  it('la cara vista de un acople exige fuente: sin ella queda sin dato', () => {
    const catalog = sample()
    const profile = catalog.profiles[0]!
    const brandId = catalog.lines.find((line) => line.id === profile.lineId)!.brandId
    profile.lineId = `${brandId}.${profile.lineId}`
    const report = applyEvidence(catalog, { version: 1, sources: {}, profiles: { [`${brandId}|${profile.code}`]: { face: 15 } } })
    expect(profile.face).not.toBe(15)
    expect(report.skipped.join(' ')).toContain('sin fuente')
  })

  it('carga la hoja de puerta exterior con su pauta', () => {
    const catalog = sample()
    const line = catalog.lines[0]!
    const sash = catalog.profiles.find((profile) => profile.id === line.profiles.sash)!
    sash.lineId = `${line.brandId}.${sash.lineId}`
    applyEvidence(catalog, evidence(line.id, { set: { doorOutProfile: sash.code, doorOutPauta: { sashWidth: 102 } } }))
    expect(line).toMatchObject({ doorOutProfileId: sash.id, doorOutPauta: { sashWidth: 102 } })
  })

  it('una marca hermana solo llena precios vacíos, con el mismo código y nombre', () => {
    const catalog = sample()
    const [a, b] = catalog.profiles
    a!.lineId = 'vacia.x'
    a!.priceByColor = {}
    b!.lineId = 'llena.x'
    b!.code = a!.code
    b!.name = a!.name
    applyEvidence(catalog, { version: 1, sources: {}, brands: { vacia: { priceFrom: 'llena' } } })
    expect(a!.priceByColor).toEqual(b!.priceByColor)
  })

  it('las contradicciones y las tipologías observadas llegan como avisos', () => {
    const catalog = sample()
    const line = catalog.lines[0]!
    applyEvidence(catalog, evidence(line.id, {
      fields: { 'pauta.weld': { origin: 'lista_taller', status: 'contradiccion', note: 'Plantilla 2,5; taller 3.' } },
      typologies: { door_double: { origin: 'sin_verificar', status: 'contradiccion', note: 'El motor no reproduce la fuente.' } },
    }))
    expect(provenanceWarnings(line).join(' ')).toContain('merma de soldadura: Plantilla 2,5; taller 3.')
    expect(provenanceWarnings(line).join(' ')).toContain('door_double')
  })
})

describe('cotizar con y sin base', () => {
  it('la línea del catálogo base sin cortes respaldados no sale «Lista para cotizar», aunque tenga precios', () => {
    const catalog = sample()
    const line = catalog.lines[0]!
    expect(lineReadiness(catalog, line).state).toBe('ready')
    applyEvidence(catalog)
    const readiness = lineReadiness(catalog, line)
    expect(readiness).toMatchObject({ state: 'warnings', level: 'partial', unbackedCuts: true, cutOrigin: 'sin_verificar', headline: 'Cotiza con avisos: falta la pauta del fabricante' })
    expect(readiness.details.join(' ')).toContain('no están confirmados por el fabricante')
  })

  it('la línea propia de un taller no se castiga: su dato es suyo', () => {
    const catalog = sample()
    expect(lineReadiness(catalog, catalog.lines[0]!)).toMatchObject({ state: 'ready', unbackedCuts: false, dataWarnings: [] })
  })
})
