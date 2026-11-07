/**
 * Mensajes del intérprete en 7 idiomas (misma forma, mismos parámetros, sin restos en español) y
 * léxicos con las mismas claves de concepto.
 */
import { describe, expect, it } from 'vitest'
import { compileMessage, messageParams } from '../../src/i18n/message'
import { LOCALES } from '../../src/i18n/locales'
import { diffTranslation, lookupMessage, messageKeys, type MessageTree } from '../../src/i18n/translator'
import { nluMessages } from '../../src/nlu'
import { LEXICONS } from '../../src/nlu/lexicon'

const es = nluMessages.es as MessageTree
const keys = messageKeys(es)

describe('mensajes del intérprete', () => {
  it('los 6 idiomas tienen exactamente las claves del español', () => {
    for (const locale of LOCALES) {
      if (locale === 'es') continue
      expect(diffTranslation(es, nluMessages[locale] as MessageTree), locale).toEqual({ missing: [], extra: [] })
    }
  })

  it('cada mensaje compila y usa los mismos parámetros que el español', () => {
    for (const locale of LOCALES) {
      for (const key of keys) {
        const source = lookupMessage(es, key)!
        const text = lookupMessage(nluMessages[locale] as MessageTree, key)!
        expect(() => compileMessage(text), `${locale}.${key}`).not.toThrow()
        expect([...messageParams(text)].sort(), `${locale}.${key}`).toEqual([...messageParams(source)].sort())
      }
    }
  })

  it('sin restos en español en los otros idiomas', () => {
    // Textos que pueden coincidir legítimamente (ejemplos con nombres propios, «PDF», «V2», marcas).
    const same = (key: string) => /^(sum\.stats|sum\.quoteNamed|sum\.catalog|nav\.(plan|team)|mode\.chat|slot\.(item|client|mode|tema|status|locale)|prompt\.sizeHint)$/.test(key)
    for (const locale of LOCALES) {
      if (locale === 'es') continue
      const tree = nluMessages[locale] as MessageTree
      const identical = keys.filter((k) => !same(k) && lookupMessage(tree, k) === lookupMessage(es, k) && /\p{L}{4,}/u.test(lookupMessage(es, k)!))
      // El portugués y el italiano comparten muchas palabras con el español («tema», «título», «Imprimir»).
      const limit = locale === 'pt' ? 0.12 : locale === 'it' ? 0.08 : 0.04
      expect(identical.length / keys.length, `${locale}: ${identical.join(', ')}`).toBeLessThan(limit)
    }
  })

  it('los ejemplos y las frases de inicio cubren todos los comandos con frase propia', () => {
    for (const locale of LOCALES) {
      const say = nluMessages[locale].say as Record<string, string>
      const example = nluMessages[locale].example as Record<string, string>
      expect(Object.keys(say).sort()).toEqual(Object.keys(example).sort())
      for (const text of Object.values(say)) expect(text.trim().length).toBeGreaterThan(1)
    }
  })
})

describe('léxicos', () => {
  it('los 7 léxicos tienen los mismos conceptos', () => {
    const want = Object.keys(LEXICONS.es).sort()
    for (const locale of LOCALES) expect(Object.keys(LEXICONS[locale]).sort(), locale).toEqual(want)
  })

  it('ninguna superficie está vacía ni mal formada', () => {
    for (const locale of LOCALES) {
      for (const [concept, source] of Object.entries(LEXICONS[locale])) {
        expect(source.trim().length, `${locale}.${concept}`).toBeGreaterThan(0)
        expect(source.split('(').length, `${locale}.${concept}`).toBe(source.split(')').length)
      }
    }
  })
})
