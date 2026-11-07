import { describe, expect, it } from 'vitest'
import {
  CATALOG_PRESET_IDS,
  DOC_FONT_IDS,
  DOC_LOCALES,
  DOC_PRESETS,
  DOC_PRESET_IDS,
  DOC_PRESET_TRAITS,
  LEGACY_CATALOG_TEMPLATE_IDS,
  LEGACY_QUOTE_TEMPLATE_IDS,
  LEGACY_TEMPLATE_PRESETS,
  QUOTE_PRESET_IDS,
  RETIRED_QUOTE_PRESET_IDS,
  checkPaletteContrast,
  closingOrderViolation,
  docPresetsFor,
  duplicateDocPreset,
  getDocPreset,
  presetDescription,
  presetForLegacyId,
  presetKind,
  presetName,
  resolveDocTemplateRef,
  validateDocTemplate,
  type DocTemplate,
} from '../../src/templates'

const quote = QUOTE_PRESET_IDS.map((id) => DOC_PRESETS[id])
const catalog = CATALOG_PRESET_IDS.map((id) => DOC_PRESETS[id])

function itemsSignature(t: DocTemplate): string {
  const s = t.sections.find((x) => x.type === 'items' || x.type === 'product_cards')
  if (!s) return 'none'
  const o = s.options as Record<string, unknown>
  return [s.type, o.variant, o.columns, o.drawingSize, o.groupBy ?? ''].join('/')
}

function expectDistinct(list: DocTemplate[], key: (t: DocTemplate) => string, label: string) {
  const values = list.map(key)
  expect(new Set(values).size, `${label}: ${values.join(' | ')}`).toBe(values.length)
}

describe('diseños predefinidos', () => {
  it('hay 5 de cotización y 4 de catálogo', () => {
    expect(quote.map((t) => t.name)).toEqual(['Atelier', 'Corporativa', 'Obra', 'Hogar', 'Memoria'])
    expect(catalog.map((t) => t.name)).toEqual(['Habitar', 'Sistema', 'Colección Modular', 'Materia y Color'])
    expect(quote.every((t) => t.kind === 'quote')).toBe(true)
    expect(catalog.every((t) => t.kind === 'catalog')).toBe(true)
  })

  it('todos son plantillas válidas, sin errores ni avisos de contraste', () => {
    for (const id of DOC_PRESET_IDS) {
      const r = validateDocTemplate(DOC_PRESETS[id])
      expect(r.ok, id).toBe(true)
      expect(r.issues.filter((i) => i.severity !== 'info'), id).toEqual([])
      expect(checkPaletteContrast(DOC_PRESETS[id].theme.palette).every((c) => c.ok), id).toBe(true)
      expect(DOC_PRESETS[id].presetId).toBe(id)
      expect(presetKind(id)).toBe(DOC_PRESETS[id].kind)
    }
  })

  it('son realmente distintos en tema, estructura y variante de ítems', () => {
    for (const list of [quote, catalog]) {
      expectDistinct(list, (t) => t.theme.palette.accent, 'acento')
      expectDistinct(list, (t) => JSON.stringify(t.theme.palette), 'paleta')
      expectDistinct(list, (t) => `${t.theme.fonts.heading}+${t.theme.fonts.body}`, 'tipografías')
      expectDistinct(list, (t) => t.sections.map((s) => `${s.type}:${(s.options as { variant?: string }).variant ?? ''}`).join(','), 'estructura')
      expectDistinct(list, itemsSignature, 'variante de ítems')
      expectDistinct(list, (t) => [t.theme.density, t.theme.typeScale, t.theme.radius, t.theme.accentUsage, t.theme.rules, t.theme.labelCase, t.theme.headingWeight].join('/'), 'tokens de tema')
    }
    const variants = new Set(quote.map((t) => (t.sections.find((s) => s.type === 'items')!.options as { variant: string }).variant))
    expect(variants).toEqual(new Set(['table', 'cards', 'sheet', 'per_page']))
  })

  it('cada uno tiene su retícula, su tipografía y su estructura', () => {
    const at = (id: (typeof DOC_PRESET_IDS)[number]) => DOC_PRESETS[id]
    expect(quote.map((t) => t.theme.composition)).toEqual(['atelier', 'corporativa', 'obra', 'hogar', 'memoria'])
    expect(at('obra').sections.some((s) => s.type === 'cover')).toBe(false)
    expect(at('hogar').sections.some((s) => s.type === 'cover')).toBe(false)
    expect(at('obra').sections.find((s) => s.type === 'items')!.options).toMatchObject({ variant: 'table' })
    expect(at('memoria').page.orientation).toBe('landscape')
    expect(at('memoria').sections.find((s) => s.type === 'items')!.options).toMatchObject({ variant: 'sheet', drawingDimensions: 'all' })
    expect(at('atelier').sections.find((s) => s.type === 'items')!.options).toMatchObject({ variant: 'per_page' })
    expect(at('hogar').sections.find((s) => s.type === 'items')!.options).toMatchObject({ groupBy: 'room', columns: 2 })
    expect(at('corporativa').sections.find((s) => s.type === 'items')!.options).toMatchObject({ groupBy: 'floor', showGroupSubtotals: true })
  })

  it('ninguna fuente retirada queda en uso', () => {
    const retired = /fraunces|cormorant|dm-serif|bricolage|plex|manrope/
    for (const id of DOC_PRESET_IDS) expect(JSON.stringify(DOC_PRESETS[id].theme.fonts), id).not.toMatch(retired)
    expect(DOC_FONT_IDS.join(' ')).not.toMatch(retired)
  })

  it('el total va al final en todas las cotizaciones y las portadas no tienen dónde mostrarlo', () => {
    for (const t of quote) {
      expect(closingOrderViolation(t.sections), t.id).toBe(-1)
      const types = t.sections.map((s) => s.type)
      expect(types.slice(types.indexOf('totals')), t.id).toEqual(['totals', 'options_comparison', 'payment', 'warranty', 'terms', 'acceptance'])
      expect(t.sections.find((s) => s.type === 'letter')?.enabled ?? false, t.id).toBe(false)
      expect(JSON.stringify(t), t.id).not.toContain('showTotal')
      expect(JSON.stringify(t.sections.filter((s) => s.type === 'client_strip')), t.id).not.toContain('"total"')
    }
  })

  it('son inmutables y se entregan copias editables', () => {
    expect(Object.isFrozen(DOC_PRESETS.atelier.sections[0].options)).toBe(true)
    const copy = getDocPreset('atelier')
    copy.sections[0].enabled = false
    expect(DOC_PRESETS.atelier.sections[0].enabled).toBe(true)
    expect(docPresetsFor('catalog').map((t) => t.id)).toEqual([...CATALOG_PRESET_IDS])
    expect(Object.keys(DOC_PRESET_TRAITS).sort()).toEqual([...DOC_PRESET_IDS].sort())
  })

  it('duplicar un diseño crea una plantilla propia restablecible', () => {
    const dup = duplicateDocPreset('memoria', { id: '6c1b2a3d-1111-4222-8333-944455556666', name: 'Plano de la casa' })
    expect(dup).toMatchObject({ id: '6c1b2a3d-1111-4222-8333-944455556666', name: 'Plano de la casa', presetId: 'memoria', kind: 'quote' })
    expect(validateDocTemplate(dup).ok).toBe(true)
  })
})

describe('ids v4 → diseños (los ajustes guardados siguen funcionando)', () => {
  it('mapea cada id antiguo a un diseño del mismo tipo', () => {
    for (const id of LEGACY_QUOTE_TEMPLATE_IDS) expect(presetKind(LEGACY_TEMPLATE_PRESETS[id])).toBe('quote')
    for (const id of LEGACY_CATALOG_TEMPLATE_IDS) expect(presetKind(LEGACY_TEMPLATE_PRESETS[id])).toBe('catalog')
    for (const id of RETIRED_QUOTE_PRESET_IDS) expect(presetKind(LEGACY_TEMPLATE_PRESETS[id]), id).toBe('quote')
    expect(LEGACY_TEMPLATE_PRESETS).toEqual({
      esencial: 'hogar',
      galeria: 'hogar',
      compacta: 'obra',
      editorial: 'atelier',
      vitrina: 'coleccion-modular',
      ficha: 'sistema',
      lookbook: 'habitar',
      luz: 'hogar',
      plano: 'memoria',
      'umbral-atelier': 'atelier',
      'casa-por-casa': 'hogar',
      'taller-directo': 'obra',
      'confort-medible': 'hogar',
      'linea-negra': 'atelier',
      patrimonio: 'atelier',
      'obra-control': 'corporativa',
      'decision-clara': 'corporativa',
    })
    expect(presetForLegacyId('compacta')).toBe('obra')
    expect(presetForLegacyId('memoria')).toBe('memoria')
    expect(presetForLegacyId('otra')).toBeUndefined()
  })

  it('resolveDocTemplateRef: predefinido, heredado, propio o por defecto', () => {
    expect(resolveDocTemplateRef('esencial', 'quote')).toEqual({ id: 'hogar', source: 'legacy', fallbackPresetId: 'hogar' })
    expect(resolveDocTemplateRef('vitrina', 'catalog')).toEqual({ id: 'coleccion-modular', source: 'legacy', fallbackPresetId: 'coleccion-modular' })
    expect(resolveDocTemplateRef('sistema', 'catalog').source).toBe('preset')
    expect(resolveDocTemplateRef('sistema', 'quote')).toMatchObject({ id: 'hogar', source: 'default' })
    expect(resolveDocTemplateRef('3f2c1d4e-9b8a-4c7d-8e6f-5a4b3c2d1e0f', 'quote').source).toBe('org')
    for (const bad of [undefined, null, '', 'javascript:alert(1)', '../x', 'constructor', 42]) expect(resolveDocTemplateRef(bad, 'quote').source).toBe('default')
  })
})

describe('nombres y descripciones traducidos', () => {
  it('7 idiomas completos, sin textos vacíos ni sobrantes de otro idioma', () => {
    for (const locale of DOC_LOCALES) {
      for (const id of DOC_PRESET_IDS) {
        expect(presetName(id, locale).trim().length, `${locale}/${id}`).toBeGreaterThan(1)
        expect(presetDescription(id, locale).length, `${locale}/${id}`).toBeGreaterThan(40)
      }
    }
    for (const locale of ['en', 'fr', 'de', 'tr'] as const) {
      const same = DOC_PRESET_IDS.filter((id) => presetDescription(id, locale) === presetDescription(id, 'es'))
      expect(same, locale).toEqual([])
    }
    expect(presetName('hogar', 'en')).toBe('Home')
    expect(presetName('hogar', 'tr')).toBe('Konut')
    expect(presetDescription('hogar', 'es')).toBe(DOC_PRESETS.hogar.description)
  })
})
