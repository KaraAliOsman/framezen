import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as engine from '@dekopen/engine'
import { describe, expect, it } from 'vitest'
import {
  compileMessage,
  diffTranslation,
  FEATURE_COPY,
  featureCopy,
  glossary,
  glossaryTerm,
  LEGACY_TYPOLOGY_IDS,
  LOCALES,
  lookupMessage,
  messageKeys,
  messageParams,
  openingName,
  PLANS,
  planName,
  planTagline,
  quoteStatusLabel,
  relocalizeMm,
  ROLE_COPY,
  roleDescription,
  roleName,
  shapeName,
  TRANSLATED_LOCALES,
  typologyName,
  unitCount,
  V5_TYPOLOGY_IDS,
  warningFixLabel,
  warningMessage,
  type Locale,
  type MessageTree,
} from '../src'

const tree = (locale: Locale) => glossary[locale] as unknown as MessageTree
const keys = messageKeys(glossary.es)

/** Ids de tipología del motor: la lista canónica si ya existe, más la galería. */
const engineTypologyIds: string[] = [
  ...new Set([...(((engine as Record<string, unknown>).TYPOLOGY_IDS as readonly string[] | undefined) ?? []), ...engine.TYPOLOGIES.map((t) => t.id)]),
]
const engineOpeningKinds = ((engine as Record<string, unknown>).OPENING_KINDS as readonly string[] | undefined) ?? []
const engineShapeKinds = ((engine as Record<string, unknown>).SHAPE_KINDS as readonly string[] | undefined) ?? []

/**
 * Valores idénticos al español que son términos compartidos de verdad (unidades, siglas, cognados
 * revisados). Cualquier otro valor igual al español es una traducción olvidada.
 */
const SHARED_TERMS: Record<Exclude<Locale, 'es'>, string[]> = {
  en: ['material.pvc', 'unit.mm', 'unit.cm', 'unit.m', 'unit.m2', 'unit.kg', 'hardwareUnit.kit', 'hardwareUnit.m', 'hardwareUnit.m2', 'plan.pro', 'warningLevel.error', 'business.color', 'business.subtotal', 'business.total'],
  pt: [
    'typology.pivot_v', 'typology.pivot_h', 'typologyGroup.pivot', 'opening.pivot_v', 'opening.pivot_h', 'side.center', 'shape.round', 'shape.pentagon',
    'shape.octagon', 'shape.triangle', 'accessory.rollerShutterType.integrated', 'accessory.rollerShutterOperation.crank', 'accessory.fullFrame',
    'profileRole.frame', 'part.espagnolette', 'finish.smooth', 'finish.metallic', 'material.pvc', 'glassKind.mono', 'glassKind.laminated',
    'glass.laminated', 'glass.acoustic', 'itemKind.consumable', 'unit.mm', 'unit.cm', 'unit.m', 'unit.m2', 'unit.kg', 'unit.bars',
    'hardwareUnit.kit', 'hardwareUnit.m', 'hardwareUnit.m2', 'hardwareUnit.cartucho', 'hardwareUnit.par', 'dimension.size', 'dimension.perimeter',
    'dimension.weight', 'station.cut', 'station.installed', 'role.installer', 'plan.pro', 'plan.empresa', 'plan.empresa2x', 'warningLevel.info',
    'warningFix.use', 'business.client', 'business.clients', 'business.job', 'business.catalog', 'business.brand', 'business.texture',
    'business.subtotal', 'business.total', 'extraPlural.rollerShutter', 'accessoryPer.frame_m', 'accessoryPer.perimeter_m', 'accessoryPer.area_m2',
  ],
  fr: ['material.pvc', 'unit.mm', 'unit.cm', 'unit.m', 'unit.m2', 'unit.kg', 'hardwareUnit.u', 'hardwareUnit.kit', 'hardwareUnit.m', 'hardwareUnit.m2', 'plan.pro', 'business.total'],
  de: ['accessory.rollerShutterOperation.motor', 'unit.mm', 'unit.cm', 'unit.m', 'unit.m2', 'unit.kg', 'hardwareUnit.m', 'hardwareUnit.m2', 'plan.pro'],
  it: [
    'side.center', 'material.pvc', 'unit.mm', 'unit.cm', 'unit.m', 'unit.m2', 'unit.kg', 'hardwareUnit.kit', 'hardwareUnit.m', 'hardwareUnit.m2',
    'dimension.area', 'dimension.weight', 'plan.pro', 'feature.assistant.title', 'warningLevel.info', 'business.client', 'business.vat',
  ],
  tr: ['accessory.rollerShutterOperation.crank', 'material.pvc', 'unit.mm', 'unit.cm', 'unit.m', 'unit.m2', 'unit.kg', 'hardwareUnit.m', 'hardwareUnit.m2', 'plan.pro'],
}

describe('glosario: forma y calidad', () => {
  it('los 7 idiomas tienen exactamente las mismas claves que el español', () => {
    for (const locale of TRANSLATED_LOCALES) expect(diffTranslation(glossary.es, tree(locale)), locale).toEqual({ missing: [], extra: [] })
  })

  it('no hay textos vacíos ni restos de marcadores', () => {
    for (const locale of LOCALES) {
      for (const key of keys) {
        const value = lookupMessage(tree(locale), key) ?? ''
        expect(value.trim(), `${locale}:${key}`).not.toBe('')
        expect(value, `${locale}:${key}`).not.toMatch(/(?:^|\s)(?:TODO|FIXME)(?:\s|$)|lorem ipsum|undefined|\[object/)
      }
    }
  })

  it('cada valor igual al español es un término compartido revisado (no una traducción olvidada)', () => {
    for (const locale of TRANSLATED_LOCALES) {
      const same = keys.filter((k) => lookupMessage(tree(locale), k) === lookupMessage(glossary.es, k))
      expect(same.filter((k) => !SHARED_TERMS[locale].includes(k)), locale).toEqual([])
    }
  })

  it('todos los mensajes compilan y las traducciones no inventan parámetros', () => {
    for (const key of keys) {
      const source = lookupMessage(glossary.es, key)!
      const allowed = new Set(messageParams(source))
      // El paño se arma de dos formas (al inicio de la frase y dentro de ella): cada idioma usa la que le sirve.
      if (allowed.has('pane') || allowed.has('paneOf')) for (const name of ['pane', 'paneOf']) allowed.add(name)
      for (const locale of LOCALES) {
        const message = lookupMessage(tree(locale), key)!
        expect(() => compileMessage(message), `${locale}:${key}`).not.toThrow()
        for (const param of messageParams(message)) expect(allowed.has(param), `${locale}:${key} usa {${param}}`).toBe(true)
      }
    }
  })
})

describe('glosario: completitud contra el motor y el plan', () => {
  it('tiene nombre para cada tipología del motor y del plan v5, en los 7 idiomas', () => {
    const ids = new Set([...engineTypologyIds, ...LEGACY_TYPOLOGY_IDS, ...V5_TYPOLOGY_IDS])
    expect(ids.size).toBe(LEGACY_TYPOLOGY_IDS.length + V5_TYPOLOGY_IDS.length + engine.V7_TYPOLOGY_IDS.length)
    for (const id of ids) for (const locale of LOCALES) expect(lookupMessage(tree(locale), `typology.${id}`), `${locale}:${id}`).toBeTruthy()
  })

  it('las tipologías del motor se nombran igual que en el motor en español (byte a byte)', () => {
    expect(engine.TYPOLOGIES).toHaveLength(engine.TYPOLOGY_IDS.length)
    for (const t of engine.TYPOLOGIES) expect(typologyName(t.id), t.id).toBe(t.name)
  })

  it('las 26 tipologías de siempre se nombran igual que en el motor (byte a byte)', () => {
    for (const t of engine.TYPOLOGIES.filter((t) => (LEGACY_TYPOLOGY_IDS as readonly string[]).includes(t.id))) {
      expect(typologyName(t.id), t.id).toBe(t.name)
    }
    expect(engine.TYPOLOGIES.filter((t) => (LEGACY_TYPOLOGY_IDS as readonly string[]).includes(t.id))).toHaveLength(26)
  })

  it('cubre las aperturas y formas del motor (listas canónicas si ya existen)', () => {
    const openings = engineOpeningKinds.length ? engineOpeningKinds : ['fixed', 'casement', 'tilt_turn', 'tilt', 'awning', 'door', 'pivot_v', 'pivot_h', 'tilt_slide', 'parallel_slide', 'folding']
    const shapes = engineShapeKinds.length ? engineShapeKinds : ['rect', 'arch', 'trapezoid', 'triangle', 'round', 'oval', 'pentagon', 'octagon', 'gable']
    for (const locale of LOCALES) {
      for (const kind of openings) expect(lookupMessage(tree(locale), `opening.${kind}`), `${locale}:${kind}`).toBeTruthy()
      for (const kind of [...shapes, 'arch_segmental']) expect(lookupMessage(tree(locale), `shape.${kind}`), `${locale}:${kind}`).toBeTruthy()
    }
  })

  it('tiene texto para cada código de aviso que aparece en el código del motor', () => {
    const root = fileURLToPath(new URL('../../engine/src', import.meta.url))
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) files.push(path)
      }
    }
    walk(root)
    const codes = new Set<string>()
    for (const file of files) for (const m of readFileSync(file, 'utf8').matchAll(/code:\s*'([a-z][a-z_]*)'/g)) codes.add(m[1])
    expect(codes.size).toBeGreaterThan(30)
    const missing = [...codes].filter((code) => lookupMessage(glossary.es, `warning.${code}`) === undefined || lookupMessage(glossary.es, `warningGeneric.${code}`) === undefined)
    expect(missing).toEqual([])
  })

  it('la copia en español coincide con la de planes, roles y estados de hoy', () => {
    for (const [feature, copy] of Object.entries(FEATURE_COPY)) {
      expect(featureCopy(feature), feature).toEqual({ title: copy.title, why: copy.why })
    }
    for (const [role, copy] of Object.entries(ROLE_COPY)) {
      expect(roleName(role)).toBe(copy.name)
      expect(roleDescription(role)).toBe(copy.description)
    }
    for (const [code, plan] of Object.entries(PLANS)) {
      expect(planName(code)).toBe(plan.name)
      expect(planTagline(code)).toBe(plan.tagline)
    }
    expect(planName('trial')).toBe('Prueba Pro')
    expect(['draft', 'sent', 'accepted', 'rejected', 'workshop', 'installed', 'closed'].map((s) => quoteStatusLabel(s))).toEqual([
      'Borrador',
      'Enviada',
      'Aceptada',
      'Rechazada',
      'En taller',
      'Instalada',
      'Cerrada',
    ])
  })
})

describe('glosario: términos del oficio por idioma', () => {
  it('nombra el oscilobatiente y la corredera elevadora con el término de cada mercado', () => {
    const tt = LOCALES.map((l) => typologyName('tilt_turn', l))
    expect(tt).toEqual(['Oscilobatiente', 'Tilt and turn', 'Oscilo-batente', 'Oscillo-battant', 'Dreh-Kipp-Fenster', 'Anta-ribalta', 'Çift açılım'])
    const hs = LOCALES.map((l) => typologyName('lift_slide_2', l))
    expect(hs).toEqual([
      'Corredera elevadora 2 hojas',
      'Lift and slide, 2 panels',
      'Elevatória de correr 2 folhas',
      'Levant-coulissant 2 vantaux',
      'Hebe-Schiebe-Tür 2-flügelig',
      'Alzante scorrevole 2 ante',
      'Kaldır-sür, 2 kanat',
    ])
  })

  it('distingue proyectante (bisagra arriba, afuera) de oscilante (bisagra abajo, adentro)', () => {
    expect(openingName('awning')).toBe('Proyectante')
    expect(openingName('tilt')).toBe('Oscilante')
    expect(openingName('awning', 'en')).toBe('Awning')
    expect(openingName('tilt', 'en')).toBe('Hopper (tilt)')
    expect(openingName('awning', 'pt')).toBe('Maxim-ar')
    expect(openingName('tilt', 'it')).toBe('Vasistas')
    expect(openingName('pivot_h', 'de')).toBe('Schwingflügel')
    expect(openingName('pivot_v', 'de')).toBe('Wendeflügel')
  })

  it('nombra formas, con el arco rebajado como variante del arco', () => {
    expect(shapeName('arch')).toBe('Medio punto')
    expect(shapeName('arch', 'es', { segmental: true })).toBe('Arco rebajado')
    expect(shapeName('gable', 'fr')).toBe('En pignon')
  })

  it('devuelve el id (o el respaldo) para ids desconocidos', () => {
    expect(typologyName('nope_42', 'de')).toBe('nope_42')
    expect(typologyName('nope_42', 'de', 'Ventana especial')).toBe('Ventana especial')
    expect(featureCopy('nope')).toEqual({ title: 'nope', why: '' })
  })

  it('copia de las funciones nuevas de v5 en todos los idiomas', () => {
    for (const locale of LOCALES) {
      expect(featureCopy('custom_templates', locale).title).toBeTruthy()
      expect(featureCopy('texture_upload', locale).why).toBeTruthy()
    }
    expect(featureCopy('custom_templates', 'de').title).toBe('Eigene Vorlagen')
  })

  it('cantidades con el plural de cada idioma', () => {
    expect(unitCount('windows', 1)).toBe('1 ventana')
    expect(unitCount('windows', 3)).toBe('3 ventanas')
    expect(unitCount('windows', 0, 'fr')).toBe('0 fenêtre')
    expect(unitCount('windows', 3, 'de')).toBe('3 Fenster')
    expect(unitCount('windows', 3, 'tr')).toBe('3 pencere')
    expect(unitCount('items', 2, 'pt')).toBe('2 itens')
    expect(glossaryTerm('business.quote', 'it')).toBe('Preventivo')
  })
})

describe('avisos del motor localizados por código', () => {
  const warning = {
    code: 'color_not_in_line',
    message: 'Línea 70 no se fabrica en Nogal: revisa el color o la línea.',
    fix: { label: 'Usar Blanco' },
  }

  it('en español devuelve el texto del motor tal cual', () => {
    expect(warningMessage(warning)).toBe(warning.message)
    expect(warningMessage({ ...warning, params: { line: 'X', color: 'Y' } }, 'es')).toBe(warning.message)
    expect(warningFixLabel(warning, 'es')).toBe('Usar Blanco')
  })

  it('con parámetros, el detalle sale en el idioma; sin ellos, la versión genérica', () => {
    expect(warningMessage({ ...warning, params: { line: 'Línea 70', color: 'Nogal' } }, 'en')).toBe('Línea 70 is not made in Nogal: check the color or the line.')
    expect(warningMessage(warning, 'en')).toBe('The line is not made in that color: check the color or the line.')
    expect(warningMessage({ ...warning, params: { line: 'Línea 70' } }, 'de')).toBe('Das System wird nicht in dieser Farbe gefertigt: Prüfen Sie Farbe oder System.')
  })

  it('usa select y plural con los parámetros del aviso', () => {
    const w = { code: 'hardware_out_of_range', message: '…', params: { line: 'S60', size: 1450, dim: 'height', count: 2, coverage: 'between', below: 1400, above: 1600 } }
    expect(warningMessage(w, 'en')).toBe('There is no S60 hardware for sashes 1,450 mm high (covers up to 1,400 mm and from 1,600 mm). The 2 sashes stay out of the total.')
    expect(warningMessage({ ...w, params: { ...w.params, count: 1 } }, 'en')).toBe('There is no S60 hardware for sashes 1,450 mm high (covers up to 1,400 mm and from 1,600 mm). It stays out of the total.')
  })

  it('un código desconocido conserva el texto del motor', () => {
    expect(warningMessage({ code: 'brand_new_code', message: 'Texto nuevo del motor.' }, 'fr')).toBe('Texto nuevo del motor.')
  })

  it('traduce las correcciones reconociendo el texto del motor o una clave', () => {
    expect(warningFixLabel(warning, 'en')).toBe('Use Blanco')
    expect(warningFixLabel({ fix: { label: 'Usar travesaño' } }, 'de')).toBe('Pfosten verwenden')
    expect(warningFixLabel({ fix: { label: 'Convertir en corredera' } }, 'fr')).toBe('Convertir en coulissant')
    expect(warningFixLabel({ fix: { label: 'Dejar como paño fijo' } }, 'it')).toBe('Lascia come fisso')
    expect(warningFixLabel({ fix: { label: 'Dejar en 1.200 mm × 1.200 mm' } }, 'en')).toBe('Set to 1,200 mm × 1,200 mm')
    expect(warningFixLabel({ fix: { label: 'x', key: 'use', params: { name: 'Roble' } } }, 'tr')).toBe('Roble kullan')
    expect(warningFixLabel({ fix: { label: 'Algo nuevo' } }, 'en')).toBe('Algo nuevo')
    expect(warningFixLabel({}, 'en')).toBeUndefined()
  })

  it('reescribe medidas del motor con el formato del idioma', () => {
    expect(relocalizeMm('con 1.249,5 mm × 600 mm', 'en')).toBe('con 1,249.5 mm × 600 mm')
    expect(relocalizeMm('1.200 mm', 'es')).toBe('1.200 mm')
  })
})
