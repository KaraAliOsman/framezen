import { describe, expect, it } from 'vitest'
import { LOCALES, compileMessage, messageKeys, messageParams, type MessageTree } from '@dekopen/shared'
import es from './i18n/es'

/** Los 7 idiomas de Documentos: mismas claves y mismos parámetros que el español. */
const dictionaries = import.meta.glob<{ default: unknown }>('./i18n/*.ts', { eager: true })
const value = (tree: unknown, key: string): unknown => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)

describe('documents translations', () => {
  const keys = messageKeys(es as unknown as MessageTree)
  for (const locale of LOCALES.filter((l) => l !== 'es')) {
    it(`${locale}: mismas claves y parámetros que el español`, () => {
      const dict = dictionaries[`./i18n/${locale}.ts`]?.default
      expect(dict, `falta i18n/${locale}.ts`).toBeDefined()
      expect(messageKeys(dict as MessageTree).sort()).toEqual([...keys].sort())
      for (const key of keys) {
        const message = value(dict, key) as string
        expect(() => compileMessage(message), `${locale}:${key}`).not.toThrow()
        expect(messageParams(message).sort(), `${locale}:${key}`).toEqual(messageParams(value(es, key) as string).sort())
      }
    })
  }
})
