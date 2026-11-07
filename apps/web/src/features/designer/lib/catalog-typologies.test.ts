import { beforeEach, describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { computeLayout, createDesign, type Catalog, type Warning } from '@dekopen/engine'
import { availableTypologies, glassGroups, lineColors, linesByBrand, pickColor, pickGlass } from './catalog'
import { TYPOLOGY_GROUPS, defaultLineFor, matchesQuery, readLineUsage, readOnlyMine, readRecentTypologies, rememberLine, rememberTypology, typologyGroup, typologySections, writeOnlyMine } from './typologies'
import { splitWarnings, worstLevel } from './warnings'
import { TYPOLOGIES } from '@dekopen/engine'

const catalog = SAMPLE_CATALOG
const slidingOnly: Catalog = { ...catalog, lines: catalog.lines.filter((l) => l.kind === 'sliding') }

describe('catálogo', () => {
  it('agrupa líneas por marca y las ordena', () => {
    const groups = linesByBrand(catalog)
    expect(groups).toHaveLength(1)
    expect(groups[0].brandName).toBe('Perfiles de ejemplo')
    expect(groups[0].lines.map((l) => l.name)).toEqual(['Serie 60 Practicable', 'Serie 70 Corredera', 'Serie 85 Elevadora', 'Serie Puerta 70'])
    expect(linesByBrand(catalog, (l) => l.kind === 'sliding')[0].lines.map((l) => l.id)).toEqual(['serie-70-corredera', 'serie-85-elevadora'])
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

  it('agrupa por Typology.group del motor (con elevables/paralelas y pivotantes aparte) y muestra todas', () => {
    const sections = typologySections(catalog, '')
    expect(sections.map((s) => s.label)).toEqual(['Ventanas', 'Puertas', 'Correderas', 'Elevadoras y paralelas', 'Plegables', 'Pivotantes', 'Formas'])
    expect(sections.flatMap((s) => s.items)).toHaveLength(TYPOLOGIES.length)
    for (const t of TYPOLOGIES) expect(TYPOLOGY_GROUPS.map((g) => g.id)).toContain(typologyGroup(t))
    const groupOf = (id: string) => typologyGroup(TYPOLOGIES.find((t) => t.id === id)!)
    expect(groupOf('lift_slide_2')).toBe('liftParallel')
    expect(groupOf('tilt_slide')).toBe('liftParallel')
    expect(groupOf('parallel_slide')).toBe('liftParallel')
    expect(groupOf('sliding_6')).toBe('sliding')
    expect(groupOf('pivot_h')).toBe('pivot')
    expect(groupOf('folding_5')).toBe('folding')
    expect(groupOf('gable')).toBe('shapes')
    expect(groupOf('entrance_door')).toBe('doors')
    expect(groupOf('french_tilt_turn')).toBe('windows')
  })

  it('muestra todas las tipologías: las que ninguna línea declara van al final de su grupo y marcadas', () => {
    const sections = typologySections(slidingOnly, '')
    expect(sections.map((s) => s.label)).toEqual(['Ventanas', 'Puertas', 'Correderas', 'Elevadoras y paralelas', 'Plegables', 'Pivotantes', 'Formas'])
    expect(sections.flatMap((s) => s.items)).toHaveLength(TYPOLOGIES.length)
    const sliding = sections.find((s) => s.id === 'sliding')!
    const lift = sections.find((s) => s.id === 'liftParallel')!
    expect(lift.items.slice(0, 3).map((i) => i.id)).toEqual(['lift_slide_2', 'lift_slide_3', 'lift_slide_4'])
    // Lo que fabrican las líneas va primero; lo demás, marcado.
    expect([...sliding.unavailable].every((id) => !availableTypologies(slidingOnly)!.has(id))).toBe(true)
    const doors = sections.find((s) => s.id === 'doors')!
    expect(doors.unavailable.has('door')).toBe(true)
    expect(sections.find((s) => s.id === 'windows')!.unavailable.has('fixed')).toBe(true)
    const firstFlag = sliding.items.findIndex((i) => sliding.unavailable.has(i.id))
    if (firstFlag >= 0) expect(sliding.items.slice(firstFlag).every((i) => sliding.unavailable.has(i.id))).toBe(true)
  })

  it('con «solo mis líneas» oculta las que ninguna línea declara', () => {
    const sections = typologySections(slidingOnly, '', [], undefined, { onlyAvailable: true })
    expect(sections.map((s) => s.label)).toEqual(['Correderas', 'Elevadoras y paralelas'])
    expect(sections[1].items.map((i) => i.id)).toEqual(['lift_slide_2', 'lift_slide_3', 'lift_slide_4'])
    expect(sections.every((s) => s.unavailable.size === 0)).toBe(true)
    expect(readOnlyMine()).toBe(false)
    writeOnlyMine(true)
    expect(readOnlyMine()).toBe(true)
    writeOnlyMine(false)
    expect(readOnlyMine()).toBe(false)
  })

  it('busca sin tildes, por etiquetas y por relevancia (Enter elige la primera)', () => {
    const t = TYPOLOGIES.find((x) => x.id === 'tilt_turn')!
    expect(matchesQuery(t, 'oscilo')).toBe(true)
    expect(matchesQuery(t, 'OSCILOBATIENTE')).toBe(true)
    const first = (q: string) => typologySections(catalog, q)[0]?.items[0]?.id
    expect(first('puerta')).toBe('door')
    expect(first('fijo')).toBe('fixed')
    expect(first('corredera')).toBe('sliding_2')
    expect(first('corredera 2')).toBe('sliding_2')
    expect(first('oscilo')).toBe('tilt_turn')
    expect(first('hst')).toBe('lift_slide_2')
    expect(first('psk')).toBe('tilt_slide')
    expect(first('acordeon')).toBe('folding_3')
    expect(first('ojo de buey')).toBe('round')
    const doors = typologySections(catalog, 'puerta')
    expect(doors[0]).toMatchObject({ id: 'doors' })
    expect(doors[0].items.map((i) => i.id)).toContain('balcony_door')
    expect(typologySections(catalog, 'triangulo').flatMap((s) => s.items.map((i) => i.id))).toEqual(['triangle'])
    expect(typologySections(catalog, 'zzz')).toEqual([])
  })

  it('con búsqueda también ofrece las que ninguna línea declara (marcadas), después de las que sí', () => {
    const sections = typologySections(slidingOnly, 'puerta')
    const doors = sections.find((s) => s.id === 'doors')!
    expect(doors.items.map((i) => i.id)).toContain('door')
    expect(doors.unavailable.has('door')).toBe(true)
    expect(typologySections(slidingOnly, 'puerta', [], undefined, { onlyAvailable: true }).flatMap((s) => s.items.map((i) => i.id))).not.toContain('door')
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
