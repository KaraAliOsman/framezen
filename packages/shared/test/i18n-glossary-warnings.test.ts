/**
 * Avisos del motor en 7 idiomas con sus parámetros (`Warning.params`, `fix.key/params`): la frase en
 * español del glosario reproduce el mensaje del motor, y cada idioma usa los mismos datos.
 *
 * Los avisos son reales: salen de `engine/test/core/warning-samples.ts`, que provoca cada código y
 * cada variante con diseños y catálogos de prueba.
 */
import {
  ACCESSORY_PER,
  HARDWARE_KIND_NAMES,
  OPENING_LIMIT_NAMES,
  PAUTA_LABELS,
  roleSubject,
  WARNING_CODES,
  WARNING_FIX_KEYS,
  WARNING_HAS_PARAMS,
  type ProfileRole,
  type WarningCode,
  type Warning,
} from '@dekopen/engine'
import { describe, expect, it } from 'vitest'
import { collectWarningSamples } from '../../engine/test/core/warning-samples'
import {
  createGlossaryHelpers,
  glossary,
  glossaryTerm,
  LOCALES,
  lookupMessage,
  messageParams,
  TRANSLATED_LOCALES,
  warningFixLabel,
  warningFixText,
  warningMessage,
  warningText,
  type Locale,
  type MessageTree,
} from '../src'

const samples = collectWarningSamples()
const tree = (locale: Locale) => glossary[locale] as unknown as MessageTree
const text = (locale: Locale, key: string) => lookupMessage(tree(locale), key)!

/** Datos que pueden faltar: sin ellos el motor dice una palabra en español («ese color») y el glosario cae a la versión genérica. */
const OPTIONAL_PARAMS: Record<string, string[]> = {
  threshold_missing: ['line'],
  color_not_in_line: ['color'],
  reinforcement_deduction_missing: ['profile'],
  reinforcement_profile_missing: ['profile'],
  accessory_rule_unknown: ['item'],
  price_missing_profile: ['color'],
}
const degraded = (w: Warning): boolean => {
  if (w.code === 'price_missing') return w.params === undefined
  if (w.code === 'price_missing_profile' && w.params?.variant !== 'profile') return false
  return (OPTIONAL_PARAMS[w.code] ?? []).some((name) => w.params?.[name] === undefined)
}
/** El resumen de varios materiales lista los dos primeros con su color entre paréntesis (no con «en <color>»). */
const neutralList = (w: Warning): boolean => w.code === 'price_missing' && w.params?.variant === 'many' && String(w.params.shown).includes('(')

describe('registro de códigos y glosario', () => {
  it('el glosario tiene frase con datos y frase genérica para cada código del motor, y nada más', () => {
    const codes = [...WARNING_CODES].sort()
    expect(Object.keys(glossary.es.warning).sort()).toEqual(codes)
    expect(Object.keys(glossary.es.warningGeneric).sort()).toEqual(codes)
    expect(Object.keys(glossary.es.warningFix).sort()).toEqual([...WARNING_FIX_KEYS].sort())
  })

  it('los 10 códigos nuevos y los dos de rango de apertura están en los 7 idiomas', () => {
    const added = [
      'opening_too_large',
      'opening_too_small',
      'element_too_large',
      'fold_needs_folding_leaves',
      'folding_needs_chain',
      'folding_groups',
      'sliding_too_many_panels',
      'shape_bending',
      'round_not_square',
      'extra_rules_missing',
      'panel_rules_missing',
    ]
    for (const locale of LOCALES) {
      for (const code of added) {
        expect(text(locale, `warning.${code}`), `${locale}:${code}`).toBeTruthy()
        expect(text(locale, `warningGeneric.${code}`), `${locale}:${code} (genérico)`).toBeTruthy()
      }
    }
  })

  it('unidad m² y etiquetas «por…» de las reglas de accesorios (incluidas ancho, alto y m²)', () => {
    for (const locale of LOCALES) {
      expect(text(locale, 'unit.m2'), locale).toBe('m²')
      expect(text(locale, 'hardwareUnit.m2'), locale).toBe('m²')
      for (const per of ACCESSORY_PER) expect(text(locale, `accessoryPer.${per}`), `${locale}:${per}`).toBeTruthy()
    }
    expect(Object.keys(glossary.es.accessoryPer).sort()).toEqual([...ACCESSORY_PER].sort())
    expect(['width_m', 'height_m', 'area_m2'].map((per) => text('es', `accessoryPer.${per}`))).toEqual(['por metro de ancho', 'por metro de alto', 'por m²'])
    expect(['width_m', 'height_m', 'area_m2'].map((per) => text('en', `accessoryPer.${per}`))).toEqual(['per meter of width', 'per meter of height', 'per m²'])
  })

  it('los nombres en español de los avisos coinciden con los del motor', () => {
    for (const [kind, name] of Object.entries(HARDWARE_KIND_NAMES)) expect(text('es', `hardwareTarget.${kind}`), kind).toBe(name)
    for (const [field, label] of Object.entries(PAUTA_LABELS)) expect(text('es', `pautaField.${field}`), field).toBe(label)
    for (const [limit, name] of Object.entries(OPENING_LIMIT_NAMES)) expect(text('es', `openingLimit.${limit}`), limit).toBe(name)
    for (const role of Object.keys(glossary.es.profileSubject) as ProfileRole[]) expect(text('es', `profileSubject.${role}`), role).toBe(roleSubject(role))
  })

  it('«Corredera elevadora» (no «elevable») y «Medio punto con abatible», «Alféizar» (no «Botaguas»)', () => {
    expect(text('es', 'typology.lift_slide_2')).toBe('Corredera elevadora 2 hojas')
    expect(text('es', 'typology.lift_slide_4')).toBe('Corredera elevadora 4 hojas')
    expect(text('es', 'typology.arch_casement')).toBe('Medio punto con abatible')
    expect(text('es', 'accessory.sill')).toBe('Alféizar')
    expect(text('es', 'typologyGroup.liftParallel')).toBe('Elevadoras y paralelas')
    const all = JSON.stringify(glossary.es)
    expect(all).not.toMatch(/[Ee]levable|[Bb]otaguas/)
  })
})

describe('en español, el glosario reproduce el mensaje del motor palabra por palabra', () => {
  it('todos los avisos producidos (con todos sus datos)', () => {
    expect(samples.length).toBeGreaterThan(150)
    for (const { scenario, warning: w } of samples) {
      const got = warningText(w, 'es')
      if (degraded(w)) expect(got, `${scenario}: ${w.code}`).toBe(text('es', `warningGeneric.${w.code}`))
      else if (neutralList(w)) expect(got, `${scenario}: ${w.code}`).toContain(String(w.params!.shown))
      else expect(got, `${scenario}: ${w.code}`).toBe(w.message)
    }
  })

  it('todas las correcciones', () => {
    const fixes = samples.filter((s) => s.warning.fix)
    expect(fixes.length).toBeGreaterThan(8)
    for (const { scenario, warning: w } of fixes) expect(warningFixText(w, 'es'), `${scenario}: ${w.code}`).toBe(w.fix!.label)
  })

  it('warningMessage y warningFixLabel en español devuelven lo del motor tal cual', () => {
    for (const { warning: w } of samples) {
      expect(warningMessage(w, 'es')).toBe(w.message)
      if (w.fix) expect(warningFixLabel(w, 'es')).toBe(w.fix.label)
    }
  })
})

describe('en los otros 6 idiomas, cada aviso sale con sus datos y sin restos', () => {
  const NAME_PARAMS = ['line', 'color', 'profile', 'item', 'glass', 'code', 'name', 'ref', 'piece', 'label', 'shown']

  it.each(TRANSLATED_LOCALES)('%s', (locale) => {
    for (const { scenario, warning: w } of samples) {
      const label = `${locale} · ${scenario}: ${w.code}`
      const got = warningText(w, locale)
      const generic = text(locale, `warningGeneric.${w.code}`)
      expect(got, label).not.toBe(w.message)
      expect(got, label).not.toMatch(/[{}]|undefined|NaN|\[object|#/)
      if (degraded(w)) {
        expect(got, label).toBe(generic)
        continue
      }
      if (WARNING_HAS_PARAMS[w.code as WarningCode]) expect(got, label).not.toBe(generic)
      // Los nombres del catálogo se conservan tal cual.
      for (const name of NAME_PARAMS) {
        const value = w.params?.[name]
        if (typeof value === 'string' && value) expect(got, `${label} (${name})`).toContain(value)
      }
      // Sin restos del español: ni letras ni signos propios, salvo dentro de nombres del catálogo.
      let rest = got
      for (const value of Object.values(w.params ?? {})) if (typeof value === 'string' && value) rest = rest.split(value).join('')
      expect(rest, label).not.toMatch(/[ñ¿¡]/)
    }
  })

  it('un dato que falta manda a la versión genérica del código; un código desconocido, al texto del motor', () => {
    const w = { code: 'color_not_in_line', message: 'M', params: { line: 'L' } }
    for (const locale of TRANSLATED_LOCALES) {
      expect(warningMessage(w, locale)).toBe(text(locale, 'warningGeneric.color_not_in_line'))
      expect(warningMessage({ code: 'color_not_in_line', message: 'M' }, locale)).toBe(text(locale, 'warningGeneric.color_not_in_line'))
      expect(warningMessage({ code: 'inventado', message: 'M', params: { a: 1 } }, locale)).toBe('M')
    }
  })

  it('cada variante pide solo sus datos: «hardware_missing» por regla no necesita el tipo de hoja', () => {
    const rules = { code: 'hardware_missing', message: 'M', params: { variant: 'rules', line: 'S60' } }
    expect(warningMessage(rules, 'en')).toBe('S60 has no hardware rules in the catalog: the window stays out of the total until it has them.')
    const target = { code: 'hardware_missing', message: 'M', params: { variant: 'target', line: 'S60' } }
    expect(warningMessage(target, 'en')).toBe(text('en', 'warningGeneric.hardware_missing'))
    expect(warningMessage({ ...target, params: { ...target.params, target: 'tilt_turn' } }, 'de')).toBe(
      'S60 hat keine Beschläge für Dreh-Kipp-Flügel: Das Fenster bleibt außerhalb der Summe, bis Sie sie im Katalog ergänzen.',
    )
  })

  it('las medidas, superficies, porcentajes e importes salen con el formato del idioma', () => {
    const pick = (code: string, scenario: string) => samples.find((s) => s.warning.code === code && s.scenario === scenario)!.warning
    const big = pick('glass_too_big', 'vidrio grande (termopanel)')
    expect(warningMessage(big, 'en')).toBe('The insulated glass unit of the fixed pane measures 2.73 m²: over 2.6 m² it is too heavy to handle and install. Divide the pane with a mullion.')
    expect(warningMessage(big, 'de')).toBe('Das Isolierglas des Festfelds misst 2,73 m²: Über 2,6 m² ist es zu schwer für Handling und Montage. Teilen Sie das Feld mit einem Pfosten.')
    const round = pick('round_not_square', 'redonda con ancho y alto distintos')
    expect(warningMessage(round, 'fr')).toContain('1 000 mm × 900 mm')
    expect(warningMessage(round, 'en')).toContain('1,000 mm × 900 mm')
    const high = pick('margin_invalid', 'margen sobre 95 %')
    expect(warningMessage(high, 'en')).toBe('A 97.2% margin on the sale price is not possible: 95% was used. To multiply the cost, use markup.')
    expect(warningMessage(high, 'tr')).toContain('%97,2')
    const below = pick('below_cost', 'precio manual bajo el costo')
    expect(warningMessage(below, 'en')).toMatch(/^The manual price \(CLP\s1,000\) is below cost \(CLP\s[\d,]+\): you lose CLP\s[\d,]+ per unit\.$/)
    // La moneda de la empresa se pasa como opción.
    expect(warningMessage(below, 'de', { currency: 'EUR' })).toMatch(/\(1\.000,00\s€\)/)
    expect(warningMessage(below, 'en', { currency: 'USD' })).toContain('($1,000.00)')
  })

  it('la lista de campos de la pauta se nombra y se une en el idioma', () => {
    const w = samples.find((s) => s.warning.code === 'pauta_incomplete')!.warning
    expect(warningMessage(w, 'en')).toContain('is missing sash width, sash deduction, sash overlap, glass clearance, and mullion deduction')
    expect(warningMessage(w, 'de')).toContain('(es fehlen: Flügelbreite, Flügelabzug, Flügelüberlappung, Glasspiel und Pfostenabzug)')
    expect(warningMessage({ ...w, params: { line: 'S60', fields: 'weld' } }, 'pt')).toContain('(falta: soldagem)')
  })

  it('«línea que ya no está» y «no encontramos la línea» son frases distintas', () => {
    const [design, pricing] = ['design', 'pricing'].map((source) => warningMessage({ code: 'line_missing', message: 'M', params: { source } }, 'en'))
    expect(design).toContain('We could not find')
    expect(pricing).toContain('no longer in your catalog')
  })
})

describe('el paño del aviso se nombra en cada idioma', () => {
  const cases = {
    A: { kind: 'sash', v: 'top', h: 'left', n: 0 },
    B: { kind: 'fixed', v: 'none', h: 'right', n: 0 },
    C: { kind: 'door', v: 'none', h: 'none', n: 0 },
    D: { kind: 'sash', v: 'none', h: 'none', n: 4 },
    E: { kind: 'fixed', v: 'middle', h: 'center', n: 0 },
  } as const
  const label = (locale: Locale, c: keyof typeof cases) => glossaryTerm('pane.label', locale, cases[c])
  const labelOf = (locale: Locale, c: keyof typeof cases) => glossaryTerm('pane.labelOf', locale, cases[c])

  const EXPECTED: Record<Locale, { label: string[]; of: string[] }> = {
    es: {
      label: ['la hoja superior izquierda', 'el paño fijo derecho', 'la puerta', 'la hoja 4', 'el paño fijo del medio central'],
      of: ['de la hoja superior izquierda', 'del paño fijo derecho', 'de la puerta', 'de la hoja 4', 'del paño fijo del medio central'],
    },
    en: {
      label: ['the top left sash', 'the right fixed pane', 'the door', 'sash 4', 'the middle center fixed pane'],
      of: ['of the top left sash', 'of the right fixed pane', 'of the door', 'of sash 4', 'of the middle center fixed pane'],
    },
    pt: {
      label: ['a folha superior esquerda', 'o fixo direito', 'a porta', 'a folha 4', 'o fixo do meio central'],
      of: ['da folha superior esquerda', 'do fixo direito', 'da porta', 'da folha 4', 'do fixo do meio central'],
    },
    fr: {
      label: ['l’ouvrant supérieur gauche', 'le châssis fixe droit', 'la porte', 'l’ouvrant 4', 'le châssis fixe du milieu central'],
      of: ['de l’ouvrant supérieur gauche', 'du châssis fixe droit', 'de la porte', 'de l’ouvrant 4', 'du châssis fixe du milieu central'],
    },
    de: {
      label: ['der obere linke Flügel', 'das rechte Festfeld', 'die Tür', 'der Flügel 4', 'das zentrale Festfeld'],
      of: ['des oberen linken Flügels', 'des rechten Festfelds', 'der Tür', 'des Flügels 4', 'des zentralen Festfelds'],
    },
    it: {
      label: ['l’anta superiore sinistra', 'il fisso destro', 'la porta', 'l’anta 4', 'il fisso intermedio centrale'],
      of: ['dell’anta superiore sinistra', 'del fisso destro', 'della porta', 'dell’anta 4', 'del fisso intermedio centrale'],
    },
    tr: {
      label: ['sol üst kanat', 'sağ sabit bölme', 'kapı', '4 numaralı kanat', 'merkezdeki sabit bölme'],
      of: ['sol üst kanadın', 'sağ sabit bölmenin', 'kapının', '4 numaralı kanadın', 'merkezdeki sabit bölmenin'],
    },
  }

  it.each(LOCALES)('%s', (locale) => {
    const keys = Object.keys(cases) as (keyof typeof cases)[]
    expect(keys.map((c) => label(locale, c))).toEqual(EXPECTED[locale].label)
    expect(keys.map((c) => labelOf(locale, c))).toEqual(EXPECTED[locale].of)
  })

  it('el paño abre la frase con mayúscula, también con «i» turca', () => {
    const w = { code: 'pane_small', message: 'M', params: { paneKind: 'sash', paneV: 'none', paneH: 'none', paneN: 0, size: 100, dim: 'width' } }
    expect(warningMessage(w, 'en')).toMatch(/^The sash ends up/)
    expect(warningMessage(w, 'fr')).toMatch(/^L’ouvrant se retrouve/)
    expect(warningMessage(w, 'de')).toMatch(/^Der Flügel erhält/)
    expect(warningMessage(w, 'tr')).toMatch(/^Kanat için/)
  })
})

describe('las frases de cada idioma usan los mismos datos que el motor entrega', () => {
  const PANE_KEYS = new Set(['paneKind', 'paneV', 'paneH', 'paneN'])
  /** Datos que el glosario arma a partir de los del motor y que las frases pueden usar. */
  const DERIVED = new Set(['pane', 'paneOf', 'subject'])
  /** Datos del motor que una traducción puede no necesitar (sin género en el idioma, por ejemplo). */
  const NOT_NEEDED: Record<string, Partial<Record<Locale, string[]>>> = { profile_missing: { en: ['role'], de: ['role'], tr: ['role'] } }

  const declared = new Map<string, Set<string>>()
  for (const { warning: w } of samples) {
    const names = declared.get(w.code) ?? new Set<string>()
    for (const name of Object.keys(w.params ?? {})) names.add(name)
    declared.set(w.code, names)
  }

  it.each(LOCALES)('%s: ninguna frase inventa datos y ninguna deja caer los suyos', (locale) => {
    for (const code of WARNING_CODES) {
      const names = declared.get(code) ?? new Set<string>()
      const used = new Set(messageParams(text(locale, `warning.${code}`)))
      for (const name of used) expect(names.has(name) || DERIVED.has(name), `${locale}:${code} usa {${name}}`).toBe(true)
      for (const name of names) {
        if (PANE_KEYS.has(name) || NOT_NEEDED[code]?.[locale]?.includes(name)) continue
        expect(used.has(name), `${locale}:${code} no usa {${name}}`).toBe(true)
      }
      if (names.has('paneKind')) expect(used.has('pane') || used.has('paneOf'), `${locale}:${code} no nombra el paño`).toBe(true)
      expect(messageParams(text(locale, `warningGeneric.${code}`)), `${locale}:${code} (genérico)`).toEqual([])
    }
  })

  it.each(LOCALES)('%s: las correcciones usan sus datos', (locale) => {
    expect(messageParams(text(locale, 'warningFix.use'))).toEqual(['name'])
    expect(messageParams(text(locale, 'warningFix.square')).sort()).toEqual(['height', 'width'])
    for (const key of WARNING_FIX_KEYS.filter((k) => k !== 'use' && k !== 'square')) expect(messageParams(text(locale, `warningFix.${key}`)), `${locale}:${key}`).toEqual([])
  })
})

describe('correcciones en un clic en 7 idiomas', () => {
  const LABELS: Record<string, Record<Locale, string>> = {
    to_sliding: { es: 'Convertir en corredera', en: 'Convert to slider', pt: 'Converter em janela de correr', fr: 'Convertir en coulissant', de: 'In Schiebeelement umwandeln', it: 'Converti in scorrevole', tr: 'Sürmeye dönüştür' },
    use_first_color: { es: 'Usar su primer color', en: 'Use its first color', pt: 'Usar a primeira cor', fr: 'Utiliser sa première couleur', de: 'Erste Farbe verwenden', it: 'Usa il primo colore', tr: 'İlk rengi kullan' },
  }

  it('por clave, con y sin parámetros', () => {
    for (const locale of LOCALES) {
      for (const [key, labels] of Object.entries(LABELS)) expect(warningFixText({ fix: { label: 'x', key } }, locale), `${locale}:${key}`).toBe(labels[locale])
    }
    expect(warningFixLabel({ fix: { label: 'x', key: 'use', params: { name: 'Roble' } } }, 'de')).toBe('Roble verwenden')
    expect(warningFixLabel({ fix: { label: 'x', key: 'square', params: { width: 1200, height: 1200 } } }, 'en')).toBe('Set to 1,200 mm × 1,200 mm')
    expect(warningFixLabel({ fix: { label: 'x', key: 'square', params: { width: 1200, height: 1200 } } }, 'fr')).toBe('Passer à 1 200 mm × 1 200 mm')
  })

  it('una clave sin sus datos, o desconocida, cae al reconocimiento por el texto en español', () => {
    expect(warningFixLabel({ fix: { label: 'Usar Blanco', key: 'use' } }, 'en')).toBe('Use Blanco')
    expect(warningFixLabel({ fix: { label: 'Usar su primer color' } }, 'en')).toBe('Use its first color')
    expect(warningFixLabel({ fix: { label: 'Algo nuevo', key: 'inventada' } }, 'en')).toBe('Algo nuevo')
  })

  it('las ayudas sobre un diccionario propio funcionan igual (createGlossaryHelpers)', () => {
    const api = createGlossaryHelpers(glossary)
    const w = samples.find((s) => s.warning.code === 'round_not_square')!.warning
    expect(api.warningMessage(w, 'it')).toBe(warningMessage(w, 'it'))
    expect(api.warningText(w, 'es')).toBe(w.message)
  })
})
