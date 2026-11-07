/**
 * Diccionario del catálogo en los 7 idiomas de documento. El paquete no usa `import.meta.glob`: los
 * idiomas van completos (son pocos kB) y el idioma del documento llega por props.
 */
import { createTranslator, defineDictionary, type DocLocale, type Translator } from '@dekopen/shared'
import es from './es'
import en from './en'
import pt from './pt'
import fr from './fr'
import de from './de'
import it from './it'
import tr from './tr'

export const CATALOG_MESSAGES = defineDictionary({ es, en, pt, fr, de, it, tr })

export type CatalogMessages = typeof es

const cache = new Map<DocLocale, Translator<CatalogMessages>>()

/** Traductor del catálogo para un idioma de documento (memorizado). */
export function catalogText(locale: DocLocale = 'es'): Translator<CatalogMessages> {
  let t = cache.get(locale)
  if (!t) {
    t = createTranslator(CATALOG_MESSAGES, locale)
    cache.set(locale, t)
  }
  return t
}
