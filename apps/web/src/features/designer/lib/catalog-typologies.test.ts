import { beforeEach, describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import { computeLayout, createDesign, type Catalog, type Warning } from '@framezen/engine'
import { availableTypologies, glassGroups, lineColors, linesByBrand, pickColor, pickGlass } from './catalog'
import { defaultLineFor, matchesQuery, readLineUsage, readRecentTypologies, rememberLine, rememberTypology, typologySections } from './typologies'
import { splitWarnings, worstLevel } from './warnings'
import { TYPOLOGIES } from '@framezen/engine'

const catalog = SAMPLE_CATALOG
const slidingOnly: Catalog = { ...catalog, lines: catalog.lines.filter((l) => l.kind === 'sliding') }

describe('catálogo', () => {
  it('agrupa líneas por marca y las ordena', () => {
    const groups = linesByBrand(catalog)
    expect(groups).toHaveLength(1)
    expect(groups[0].brandName).toBe('Perfiles de ejemplo')
    expect(groups[0].lines.map((l) => l.name)).toEqual(['Serie 60 Practicable', 'Serie 70 Corredera', 'Serie Puerta 70'])
    expect(linesByBrand(catalog, (l) => l.kind === 'sliding')[0].lines).toHaveLength(1)
    expect(linesByBrand(undefined)).toEqual([])
  })

  it('elige color y vidrio válidos con respaldo', () => {
    expect(pickColor(catalog, 'serie-60', 'nogal')).toBe('nogal')
    expect(pickColor(catalog, 'serie-60', 'inexistente')).toBe('blanco')
    expect(pickGlass(catalog, 'laminado-3-3')).toBe('laminado-3-3')
    expect(pickGlass(catalog, 'otro')).toBe('dvh-4-12-4')
    expect(pickGlass({ ...catalog, glass: [] }, undefined)).toBe('')
    expect(lineColors(catalog, 'serie-60').map((c) => c.id)).toContain('antracita')
  })

  it('agrupa vidrios: termopanel primero', () => {
    const groups = glassGroups(catalog)
    expect(groups[0].label).toBe('Termopanel (DVH)')
    expect(groups.flatMap((g) => g.items)).toHaveLength(catalog.glass.length)
  })

  it('tipologías disponibles según las líneas', () => {
    expect(availableTypologies(catalog)?.has('door')).toBe(true)
    expect(availableTypologies(slidingOnly)?.has('door')).toBe(false)
    expect(availableTypologies({ ...catalog, lines: [] })).toBeNull()
  })
})

describe('galería de tipologías', () => {
  beforeEach(() => localStorage.clear())

  it('muestra los cuatro grupos con todas las tipologías del catálogo', () => {
    const sections = typologySections(catalog, '')
    expect(sections.map((s) => s.label)).toEqual(['Ventanas', 'Puertas', 'Correderas', 'Formas'])
    expect(sections.flatMap((s) => s.items)).toHaveLength(TYPOLOGIES.length)
  })

  it('filtra por las líneas disponibles', () => {
    const sections = typologySections(slidingOnly, '')
    expect(sections.map((s) => s.label)).toEqual(['Correderas'])
  })

  it('busca sin tildes y por etiquetas', () => {
    const t = TYPOLOGIES.find((x) => x.id === 'tilt_turn')!
    expect(matchesQuery(t, 'oscilo')).toBe(true)
    expect(matchesQuery(t, 'OSCILOBATIENTE')).toBe(true)
    expect(typologySections(catalog, 'puerta').flatMap((s) => s.items.map((i) => i.id))).toEqual(['door', 'door_double', 'door_sidelight', 'door_transom'])
    expect(typologySections(catalog, 'triangulo').flatMap((s) => s.items.map((i) => i.id))).toEqual(['triangle'])
  })

  it('con búsqueda también ofrece las que ninguna línea declara (atenuadas)', () => {
    const sections = typologySections(slidingOnly, 'puerta')
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ id: 'other', muted: true })
  })

  it('recuerda las últimas tipologías y las muestra primero', () => {
    rememberTypology('casement')
    rememberTypology('sliding_2')
    rememberTypology('casement')
    expect(readRecentTypologies()).toEqual(['casement', 'sliding_2'])
    const sections = typologySections(catalog, '', readRecentTypologies())
    expect(sections[0]).toMatchObject({ id: 'recent', label: 'Recientes' })
    expect(sections[0].items.map((i) => i.id)).toEqual(['casement', 'sliding_2'])
  })

  it('línea por defecto: la de los ajustes, la más usada o la primera que fabrica la tipología', () => {
    expect(defaultLineFor(catalog, 'casement', 'serie-puerta-70', {})).toBe('serie-puerta-70')
    expect(defaultLineFor(catalog, 'sliding_2', 'serie-60', {})).toBe('serie-70-corredera')
    expect(defaultLineFor(catalog, 'casement', undefined, { 'serie-puerta-70': 3, 'serie-60': 1 })).toBe('serie-puerta-70')
    expect(defaultLineFor(catalog, 'casement', undefined, {})).toBe('serie-60')
    expect(defaultLineFor({ ...catalog, lines: [] }, 'casement', undefined, {})).toBe('')
    rememberLine('serie-puerta-70')
    expect(readLineUsage()).toEqual({ 'serie-puerta-70': 1 })
  })
})

describe('avisos en el lienzo', () => {
  it('ubica los avisos de un paño y deja los generales aparte (sin los de precio)', () => {
    const d = createDesign('fixed_casement', { lineId: 'serie-60', width: 1200, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const layout = computeLayout(d, catalog)
    const leafId = layout.cells[0].nodeId
    const warnings: Warning[] = [
      { level: 'warn', code: 'pane_small', message: 'Paño chico', nodeId: leafId },
      { level: 'error', code: 'pane_impossible', message: 'No cabe', nodeId: leafId },
      { level: 'info', code: 'color_missing', message: 'Sin color' },
      { level: 'warn', code: 'price_missing_glass', message: 'Sin precio', nodeId: leafId },
      { level: 'warn', code: 'profile_missing', message: 'Falta perfil', nodeId: 'frame' },
    ]
    const { markers, general } = splitWarnings(warnings, layout)
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ nodeId: leafId, level: 'error' })
    expect(markers[0].warnings).toHaveLength(2)
    expect(general.map((w) => w.code)).toEqual(['color_missing', 'profile_missing'])
    expect(worstLevel([])).toBe('info')
  })
})
