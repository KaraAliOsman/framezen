import { describe, expect, it } from 'vitest'
import { SETTINGS_ORDER, SETTINGS_SLUGS } from '../../features/settings/sections'
import { MAIN_NAV, SETTINGS_NAV, SETTINGS_SECTIONS, settingsSectionLabel } from './nav'

describe('contrato de navegación', () => {
  it('las secciones de Ajustes de la paleta y del menú son las mismas y en el mismo orden', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.slug)).toEqual([...SETTINGS_ORDER])
    expect([...SETTINGS_SECTIONS.map((s) => s.slug)].sort()).toEqual([...SETTINGS_SLUGS].sort())
  })

  it('los slugs de las secciones nuevas de v5 están en español (van en la URL)', () => {
    for (const slug of ['idioma', 'asistentes', 'ia', 'plantillas', 'texturas']) expect(SETTINGS_SLUGS).toContain(slug)
  })

  it('cada entrada tiene texto y palabras clave en el idioma actual', () => {
    for (const item of [...MAIN_NAV, SETTINGS_NAV]) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.keywords.length).toBeGreaterThan(0)
      expect(item.to.startsWith('/')).toBe(true)
    }
    for (const section of SETTINGS_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0)
      expect(section.description.length).toBeGreaterThan(0)
    }
  })

  it('con una sola persona «Equipo» pasa a «Invitar a alguien»', () => {
    const team = SETTINGS_SECTIONS.find((s) => s.slug === 'equipo')!
    expect(settingsSectionLabel(team, true)).toBe('Invitar a alguien')
    expect(settingsSectionLabel(team, false)).toBe('Equipo')
  })
})
