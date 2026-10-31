import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import type { Catalog, Glass, Line } from '@framezen/engine'
import { defaultGlassId, glassComposition, isClearDvh, pickGlass, preferredGlass } from './catalog'
import { defaultLineFor } from './typologies'

const g = (id: string, name: string, pricePerM2: number, kind: Glass['kind'] = 'dvh', composition?: string): Glass => ({ id, name, kind, thickness: 20, pricePerM2, composition })
const withGlass = (glass: Glass[]): Catalog => ({ ...SAMPLE_CATALOG, glass })

describe('vidrio por defecto', () => {
  it('lee la composición del nombre o de la descripción', () => {
    expect(glassComposition({ name: 'DVH 4+12+4' })).toBe('4+12+4')
    expect(glassComposition({ name: 'DVH Incoloro 8 + 10 + 8 Incoloro' })).toBe('8+10+8')
    expect(glassComposition({ name: 'Termopanel', composition: '4 incoloro + 12 cámara + 4 incoloro' })).toBe('4+12+4')
    expect(glassComposition({ name: 'Incoloro 4mm' })).toBeNull()
  })

  it('distingue el DVH incoloro corriente de los especiales', () => {
    expect(isClearDvh(g('a', 'DVH 4+12+4', 1))).toBe(true)
    expect(isClearDvh(g('b', 'DVH Incoloro 8+10+8 Incoloro', 1))).toBe(true)
    expect(isClearDvh(g('c', 'DVH 4+12+4 Bronce', 1))).toBe(false)
    expect(isClearDvh(g('d', 'DVH 4+12+4 Low-e', 1))).toBe(false)
    expect(isClearDvh(g('e', 'DVH 4+12+4 Laminado', 1))).toBe(false)
  })

  it('prefiere DVH 4+12+4 incoloro con precio, aunque haya otros antes en el catálogo', () => {
    const catalog = withGlass([
      g('dvh-10-12-8', 'DVH 10+12+8', 50000),
      g('dvh-4-12-4-bronce', 'DVH 4+12+4 Bronce', 0),
      g('dvh-4-12-4-low-e', 'DVH 4+12+4 Low-e', 52000),
      g('dvh-4-12-4', 'DVH 4+12+4', 45000),
      g('mono-4', 'Incoloro 4mm', 15000, 'mono'),
    ])
    expect(preferredGlass(catalog)?.id).toBe('dvh-4-12-4')
    expect(pickGlass(catalog, undefined)).toBe('dvh-4-12-4')
    expect(pickGlass(catalog, 'mono-4')).toBe('mono-4') // lo pedido manda
    // Sobre lo que dejó el alta de la cuenta (el primer DVH con precio), gana el 4+12+4.
    expect(defaultGlassId(catalog, 'dvh-10-12-8')).toBe('dvh-4-12-4')
  })

  it('sin 4+12+4: el de tus ajustes si tiene precio; si no, el DVH incoloro más común', () => {
    const catalog = withGlass([
      g('dvh-5-10-5', 'DVH 5+10+5', 30000),
      g('dvh-4-10-4', 'DVH 4+10+4', 38000),
      g('dvh-4-10-4-argon', 'DVH 4+10+4 con Argón', 21000),
      g('dvh-4-10-4-bronce', 'DVH 4+10+4 Bronce', 0),
      g('dvh-6-12-6', 'DVH 6+12+6', 0),
    ])
    expect(preferredGlass(catalog)?.id).toBe('dvh-4-10-4')
    expect(defaultGlassId(catalog, 'dvh-5-10-5')).toBe('dvh-5-10-5')
    expect(defaultGlassId(catalog, 'dvh-6-12-6')).toBe('dvh-4-10-4') // sin precio: no
    expect(defaultGlassId(catalog, undefined)).toBe('dvh-4-10-4')
  })

  it('sin termopaneles: el primer vidrio con precio; catálogo vacío: nada', () => {
    expect(preferredGlass(withGlass([g('m0', 'Incoloro 3mm', 0, 'mono'), g('m1', 'Incoloro 4mm', 15000, 'mono')]))?.id).toBe('m1')
    expect(preferredGlass(withGlass([]))).toBeUndefined()
    expect(defaultGlassId(withGlass([]), 'x')).toBe('x')
  })
})

describe('línea por defecto', () => {
  const line = (id: string, brandId: string, completeness: Line['completeness'], typologyIds: string[], kind: Line['kind'] = 'sliding'): Line =>
    ({ ...SAMPLE_CATALOG.lines[0], id, brandId, name: id, completeness, typologyIds, kind, colorIds: [] }) as Line
  const catalog: Catalog = {
    ...SAMPLE_CATALOG,
    lines: [
      line('marca-a.parcial', 'a', 'partial', ['sliding_2']),
      line('marca-b.completa', 'b', 'complete', ['sliding_2']),
      line('marca-a.verificada', 'a', 'verified', ['sliding_2']),
      line('marca-a.practicable', 'a', 'verified', ['casement'], 'casement'),
    ],
  }

  it('recorre las preferidas en orden: la de la ventana de referencia y luego la de tus ajustes', () => {
    expect(defaultLineFor(catalog, 'sliding_2', ['marca-a.practicable', 'marca-b.completa'], {})).toBe('marca-b.completa')
    expect(defaultLineFor(catalog, 'casement', ['marca-b.completa', 'marca-a.practicable'], {})).toBe('marca-a.practicable')
  })

  it('sin historial: misma marca que tu línea y con los datos más completos (nunca la «parcial» primero)', () => {
    expect(defaultLineFor(catalog, 'sliding_2', 'marca-a.practicable', {})).toBe('marca-a.verificada')
    expect(defaultLineFor(catalog, 'sliding_2', undefined, {})).toBe('marca-a.verificada')
  })

  it('lo más usado manda sobre el orden por datos', () => {
    expect(defaultLineFor(catalog, 'sliding_2', 'marca-a.practicable', { 'marca-a.parcial': 2 })).toBe('marca-a.parcial')
  })
})
