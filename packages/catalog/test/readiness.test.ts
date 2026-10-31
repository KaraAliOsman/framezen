import type { Catalog, Line } from '@framezen/engine'
import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG, brandReadiness, catalogReadiness, lineReadiness, requiredRolesFor } from '../src/index'

/** Copia del catálogo de ejemplo con una línea cambiada. */
function withLine(lineId: string, patch: (line: Line) => Line, catalog: Catalog = SAMPLE_CATALOG): Catalog {
  return { ...catalog, lines: catalog.lines.map((line) => (line.id === lineId ? patch(line) : line)) }
}
function withPrice(profileId: string, prices: Record<string, number>, catalog: Catalog = SAMPLE_CATALOG): Catalog {
  return { ...catalog, profiles: catalog.profiles.map((profile) => (profile.id === profileId ? { ...profile, priceByColor: prices } : profile)) }
}
const sample = (id: string) => SAMPLE_CATALOG.lines.find((line) => line.id === id)!

describe('completitud honesta por línea', () => {
  it('los roles requeridos salen de las tipologías que publica la línea', () => {
    expect(requiredRolesFor({ kind: 'casement', typologyIds: ['fixed'] })).toEqual(['frame', 'bead'])
    expect(requiredRolesFor({ kind: 'casement', typologyIds: ['casement', 'fixed_casement'] })).toEqual(['frame', 'sash', 'mullion', 'bead'])
    expect(requiredRolesFor({ kind: 'casement', typologyIds: ['door_double'] })).toEqual(['frame', 'door_sash', 'french_mullion', 'bead'])
    expect(requiredRolesFor({ kind: 'sliding', typologyIds: ['sliding_2'] })).toEqual(['sliding_frame', 'sliding_sash', 'interlock', 'guide', 'bead'])
  })

  it('«Lista para cotizar» cuando todo tiene precio en algún color', () => {
    const readiness = lineReadiness(SAMPLE_CATALOG, sample('serie-60'))
    expect(readiness).toMatchObject({ level: 'complete', state: 'ready', headline: 'Lista para cotizar', missingRoles: [], unpricedItems: [] })
    expect(readiness.readyColors.length).toBeGreaterThan(0)
  })

  it('«verified» exige evidencia de taller y además la ventana completa', () => {
    const withOt = withLine('serie-60', (line) => ({ ...line, source: 'Pauta de la distribuidora, verificada por Framezen' }))
    expect(lineReadiness(withOt, withOt.lines.find((line) => line.id === 'serie-60')!).level).toBe('verified')
    // La evidencia no se salta la comprobación: sin precio de hoja vuelve a «partial».
    const sashId = sample('serie-60').profiles.sash!
    const broken = withPrice(sashId, {}, withOt)
    const readiness = lineReadiness(broken, broken.lines.find((line) => line.id === 'serie-60')!)
    expect(readiness.level).toBe('partial')
    expect(readiness.details.join(' ')).toContain('orden de trabajo real')
  })

  it('la evidencia se lee del texto nuevo y del de catálogos generados antes, no de cualquier fuente', () => {
    const levelWith = (source: string) => {
      const catalog = withLine('serie-60', (line) => ({ ...line, source }))
      return lineReadiness(catalog, catalog.lines.find((line) => line.id === 'serie-60')!).level
    }
    expect(levelWith('Pauta de la distribuidora, verificada por Framezen en una ventana real')).toBe('verified')
    expect(levelWith('Pauta de la distribuidora + OT N° 385 (un caso verificado)')).toBe('verified')
    expect(levelWith('Pauta de la distribuidora · lista del 31-10-2026')).toBe('complete')
  })

  it('«Cotiza con avisos» nombra lo que falta', () => {
    const sashId = sample('serie-60').profiles.sash!
    const catalog = withPrice(sashId, {})
    const readiness = lineReadiness(catalog, catalog.lines.find((line) => line.id === 'serie-60')!)
    expect(readiness).toMatchObject({ level: 'partial', state: 'warnings', missing: ['hoja'] })
    expect(readiness.headline).toBe('Cotiza con avisos: faltan precios de hoja')
    expect(readiness.unpricedRoles.map((gap) => gap.role)).toEqual(['sash'])
  })

  it('un color sin precio no impide cotizar en los demás, pero se avisa', () => {
    const line = sample('serie-60')
    const sash = SAMPLE_CATALOG.profiles.find((profile) => profile.id === line.profiles.sash)!
    const [first, ...rest] = line.colorIds
    const catalog = withPrice(sash.id, Object.fromEntries(rest.map((colorId) => [colorId, 30000])))
    const readiness = lineReadiness(catalog, catalog.lines.find((candidate) => candidate.id === line.id)!)
    expect(readiness.state).toBe('ready')
    expect(readiness.readyColors).not.toContain(first)
    expect(readiness.details[0]).toMatch(/faltan precios de hoja: ahí cotiza con avisos/)
  })

  it('falta de perfil, herraje sin precio y pauta típica impiden «complete»', () => {
    const noBead = withLine('serie-60', (line) => ({ ...line, profiles: { ...line.profiles, bead: undefined } }))
    expect(lineReadiness(noBead, noBead.lines.find((line) => line.id === 'serie-60')!).headline).toBe('Cotiza con avisos: falta el perfil de junquillo')

    const ruleItem = sample('serie-60').hardwareRules[0].itemId
    const freeItem = { ...SAMPLE_CATALOG, items: SAMPLE_CATALOG.items.map((item) => (item.id === ruleItem ? { ...item, price: 0 } : item)) }
    const itemReadiness = lineReadiness(freeItem, sample('serie-60'))
    expect(itemReadiness.unpricedItems).toContain(ruleItem)
    expect(itemReadiness.missing).toContain('herrajes')

    const typical = withLine('serie-60', (line) => ({ ...line, source: 'Pauta típica de practicable: revisar con el fabricante' }))
    expect(lineReadiness(typical, typical.lines.find((line) => line.id === 'serie-60')!).headline).toBe('Cotiza con avisos: falta la pauta del fabricante')
  })

  it('«Solo medidas» cuando ningún perfil tiene precio', () => {
    const line = sample('serie-60')
    let catalog: Catalog = SAMPLE_CATALOG
    for (const id of Object.values(line.profiles)) catalog = withPrice(id!, {}, catalog)
    const readiness = lineReadiness(catalog, catalog.lines.find((candidate) => candidate.id === line.id)!)
    expect(readiness).toMatchObject({ state: 'geometry', level: 'partial', headline: 'Solo medidas' })
  })

  it('cuenta las líneas de una marca por estado', () => {
    const counts = brandReadiness(SAMPLE_CATALOG, 'ejemplo-pvc')
    expect(counts.lines).toBe(SAMPLE_CATALOG.lines.filter((line) => line.brandId === 'ejemplo-pvc').length)
    expect(counts.lines).toBeGreaterThan(0)
    expect(counts.ready + counts.warnings + counts.geometry).toBe(counts.lines)
    expect(catalogReadiness(SAMPLE_CATALOG).size).toBe(SAMPLE_CATALOG.lines.length)
  })
})
