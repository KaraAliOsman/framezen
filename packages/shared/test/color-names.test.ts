/** Nombres de colores del catálogo en el idioma de quien lee (interfaz, portal y documentos). */
import { describe, expect, it } from 'vitest'
import { BUILTIN_TEXTURES, colorDisplayName, localizeCatalogColors } from '../src'
import { LOCALES } from '../src/i18n/locales'

describe('nombres de colores localizados', () => {
  it('los nombres habituales del catálogo se traducen en los 7 idiomas', () => {
    const name = (n: string, l: (typeof LOCALES)[number]) => colorDisplayName({ id: n.toLowerCase(), name: n }, l)
    expect(name('Blanco', 'en')).toBe('White')
    expect(name('Nogal', 'de')).toBe('Nussbaum')
    expect(name('Roble dorado', 'fr')).toBe('Chêne doré')
    expect(name('Antracita', 'tr')).toBe('Antrasit')
    expect(name('Negro', 'pt')).toBe('Preto')
    expect(name('Caoba', 'it')).toBe('Mogano')
    for (const l of LOCALES) for (const n of ['Blanco', 'Nogal', 'Roble dorado', 'Antracita']) expect(name(n, l).length).toBeGreaterThan(2)
    // Español: lo que trae el catálogo, sin tocar.
    expect(name('Roble dorado', 'es')).toBe('Roble dorado')
  })

  it('usa los nombres de la biblioteca integrada cuando el color usa esa textura', () => {
    const golden = { id: 'roble-dorado', name: 'Roble dorado', texture: { kind: 'builtin', id: 'golden_oak' } }
    for (const l of LOCALES) expect(colorDisplayName(golden, l)).toBe(BUILTIN_TEXTURES.golden_oak.names[l])
  })

  it('colores propios y nombres desconocidos se muestran tal como se escribieron', () => {
    expect(colorDisplayName({ id: 'custom-nogal', name: 'Nogal' }, 'en')).toBe('Nogal')
    expect(colorDisplayName({ id: 'embero', name: 'Embero' }, 'de')).toBe('Embero')
    expect(colorDisplayName({ id: 'x', name: 'Verde Patagonia' }, 'en')).toBe('Verde Patagonia')
  })

  it('re-localizar un nombre ya traducido funciona (la vista previa usa el idioma del documento)', () => {
    expect(colorDisplayName({ id: 'nogal', name: 'Walnut' }, 'de')).toBe('Nussbaum')
    expect(colorDisplayName({ id: 'nogal', name: 'Walnut' }, 'es')).toBe('Nogal')
  })

  it('localiza el catálogo sin copiarlo si nada cambia', () => {
    const catalog = { colors: [{ id: 'blanco', name: 'Blanco', hex: '#FFF' }, { id: 'custom-a', name: 'Mi color', hex: '#000' }] }
    expect(localizeCatalogColors(catalog, 'es')).toBe(catalog)
    const en = localizeCatalogColors(catalog, 'en')
    expect(en.colors.map((c) => c.name)).toEqual(['White', 'Mi color'])
    expect(catalog.colors[0]!.name).toBe('Blanco')
  })
})
