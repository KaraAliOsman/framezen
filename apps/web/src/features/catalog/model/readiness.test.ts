import { describe, expect, it } from 'vitest'
import type { Catalog } from '@dekopen/engine'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { buildPriceRows, EMPTY_FILTERS, filterRows, activeFilterCount } from './prices'
import { completePricesFocus, completePricesLabel, missingPriceKeys, readinessByLine, readinessCopy } from './readiness'

const serie60 = SAMPLE_CATALOG.lines.find((line) => line.id === 'serie-60')!
const sashId = serie60.profiles.sash!

/** El catálogo de ejemplo con la hoja de la Serie 60 sin ningún precio (ni siquiera la clave del color). */
const withoutSashPrices: Catalog = {
  ...SAMPLE_CATALOG,
  profiles: SAMPLE_CATALOG.profiles.map((profile) => (profile.id === sashId ? { ...profile, priceByColor: {} } : profile)),
}

describe('completitud en la web', () => {
  it('usa lenguaje humano para los tres estados', () => {
    expect(readinessCopy('ready').label).toBe('Lista para cotizar')
    expect(readinessCopy('warnings').label).toBe('Cotiza con avisos')
    expect(readinessCopy('geometry').label).toBe('Solo medidas')
  })

  it('una línea completa no ofrece completar precios', () => {
    const readiness = readinessByLine(SAMPLE_CATALOG).get('serie-60')!
    expect(readiness.state).toBe('ready')
    expect(missingPriceKeys(readiness)).toEqual([])
    expect(completePricesFocus(serie60, readiness)).toBeNull()
  })

  it('lo que falta se convierte en filas de la pestaña Precios, aunque el color no venga en la lista', () => {
    const readiness = readinessByLine(withoutSashPrices).get('serie-60')!
    expect(readiness.state).toBe('warnings')
    expect(readiness.headline).toBe('Cotiza con avisos: faltan precios de hoja')
    const focus = completePricesFocus(serie60, readiness)!
    expect(focus.label).toBe('Lo que falta en Serie 60 Practicable')
    expect(focus.keys).toEqual(serie60.colorIds.map((colorId) => `profile:${sashId}:${colorId}`))
    expect(completePricesLabel(readiness)).toBe(`Completar ${serie60.colorIds.length} precios`)

    // Las filas existen aunque el perfil no tenga ningún color cargado: se pueden completar.
    const rows = buildPriceRows(withoutSashPrices)
    const focused = filterRows(rows, { ...EMPTY_FILTERS, focus })
    expect(focused.map((row) => row.key).sort()).toEqual([...focus.keys].sort())
    expect(focused.every((row) => row.price === 0)).toBe(true)
    expect(activeFilterCount({ ...EMPTY_FILTERS, focus })).toBe(1)
  })
})
