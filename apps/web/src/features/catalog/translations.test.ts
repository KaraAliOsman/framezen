import { describe, expect, it } from 'vitest'
import { LOCALES, compileMessage, messageKeys, messageParams, type MessageTree } from '@dekopen/shared'
import es from './i18n/es'

/**
 * Los 7 idiomas de «catálogo»: mismas claves, mismos parámetros y etiquetas que el español, y
 * traducidos de verdad. Un valor igual al español solo se admite si es la misma palabra en ese
 * idioma (nombres propios, unidades, cognados): se declara aquí, idioma por idioma.
 */
const dictionaries = import.meta.glob<{ default: unknown }>('./i18n/*.ts', { eager: true })
const value = (tree: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
const tags = (message: string) => (message.match(/<\/?[a-z]+\/?>/g) ?? []).sort().join(' ')

/** Sin palabras propias de un idioma: solo parámetros, números, símbolos o nombres de marca (WhatsApp, PDF). */
const NEUTRAL_WORDS = new Set(['whatsapp', 'pdf', 'iva', 'ot', 'mm', 'm', 'cm', 'kg', 'cnc', 'csv', 'rut'])
function isNeutral(message: string): boolean {
  const words = message
    .replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, ' ')
    .replace(/<\/?[a-z]+\/?>/g, ' ')
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
  return words.every((w) => w.length <= 2 || NEUTRAL_WORDS.has(w.toLowerCase()))
}
/** Claves que son la misma palabra en todos los idiomas (no hay ninguna hoy). */
const SAME_EVERYWHERE = new Set<string>([])
/** Claves que coinciden con el español solo en ese idioma (cognados reales). */
const SAME_ALLOWED: Partial<Record<string, string[]>> = {
  it: ['unit.bar', 'unit.meter', 'unit.kit', 'glass.colKind', 'hardware.onlyVariants', 'brands.colBrand', 'brands.nounOne'],
  en: [
    'sheet.marginUnit',
    'unit.kit',
    'prices.color',
    'prices.colColor',
    'import.colColor',
  ],
  pt: [
    'provenance.origin.fabricante',
    'brands.colBrand',
    'brands.nounOne',
    'brands.nounOther',
    'page.title',
    'page.tabs.marcas',
    'page.tabs.importar',
    'page.completeLine',
    'common.cancel',
    'brands.kindLabel',
    'brands.kind.all',
    'brands.search',
    'brands.recommended',
    'sheet.cutTitle',
    'sheet.barKerf',
    'readiness.role.frame',
    'readiness.role.sliding_frame',
    'pauta.measure.frame.label',
    'pauta.diagram.frame',
    'unit.meter',
    'unit.pair',
    'unit.kit',
    'unit.cartridge',
    'prices.brand',
    'prices.colState',
    'bulk.apply',
    'glass.all',
    'glass.colKind',
    'glass.colMin',
    'glass.colState',
    'glass.minAreaOf',
    'hardware.per.frame_m',
    'hardware.per.perimeter_m',
    'hardware.per.area_m2',
  ],
  fr: [
    'sheet.marginUnit',
    'unit.kit',
  ],
}

describe('catalog translations', () => {
  const keys = messageKeys(es as unknown as MessageTree)

  it('hay un archivo por idioma', () => {
    for (const locale of LOCALES) expect(dictionaries[`./i18n/${locale}.ts`], locale).toBeDefined()
  })

  for (const locale of LOCALES.filter((l) => l !== 'es')) {
    it(`${locale}: mismas claves, parámetros y etiquetas que el español, y traducido`, () => {
      const dict = dictionaries[`./i18n/${locale}.ts`]?.default
      expect(dict, `falta i18n/${locale}.ts`).toBeDefined()
      expect(messageKeys(dict as MessageTree).sort()).toEqual([...keys].sort())
      const allowed = new Set(SAME_ALLOWED[locale] ?? [])
      const untranslated: string[] = []
      for (const key of keys) {
        const source = value(es, key) as string
        const message = value(dict, key) as string
        expect(() => compileMessage(message), `${locale}:${key}`).not.toThrow()
        expect(messageParams(message).sort(), `${locale}:${key}`).toEqual(messageParams(source).sort())
        expect(tags(message), `${locale}:${key}`).toBe(tags(source))
        if (message === source && !isNeutral(message) && !SAME_EVERYWHERE.has(key) && !allowed.has(key)) untranslated.push(key)
      }
      expect(untranslated).toEqual([])
    })
  }
})
