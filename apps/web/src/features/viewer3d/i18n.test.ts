import { diffTranslation, LOCALES, lookupMessage, messageKeys, messageParams, type MessageTree } from '@dekopen/shared'
import { describe, expect, it } from 'vitest'
import es from './i18n/es'

const modules = import.meta.glob<{ default: Record<string, unknown> }>('./i18n/*.ts', { eager: true })

describe('textos del visor 3D en los 7 idiomas', () => {
  it('cada idioma tiene las claves y los parámetros del español', () => {
    for (const locale of LOCALES) {
      if (locale === 'es') continue
      const dict = modules[`./i18n/${locale}.ts`]?.default
      expect(dict, `falta ${locale}.ts`).toBeTruthy()
      const diff = diffTranslation(es as never, dict as never)
      expect(diff.missing, `${locale}: faltan`).toEqual([])
      expect(diff.extra, `${locale}: sobran`).toEqual([])
      for (const key of messageKeys(es as never)) {
        expect(messageParams(lookupMessage(dict as MessageTree, key) ?? '').sort(), `${locale}: ${key}`).toEqual(messageParams(lookupMessage(es as MessageTree, key)!).sort())
      }
    }
  })
})
