/**
 * Idiomas de documento. Mismos códigos que `Locale` de `packages/shared/src/i18n` (plan v5 §4.B);
 * se declaran aquí para que el contrato de plantillas no dependa del orden de carga del módulo i18n.
 * Ambos tipos son estructuralmente idénticos y asignables entre sí.
 */
export const DOC_LOCALES = ['es', 'en', 'pt', 'fr', 'de', 'it', 'tr'] as const
export type DocLocale = (typeof DOC_LOCALES)[number]
export const DEFAULT_DOC_LOCALE: DocLocale = 'es'

export function isDocLocale(value: unknown): value is DocLocale {
  return typeof value === 'string' && (DOC_LOCALES as readonly string[]).includes(value)
}

// Garantía en compilación: mismos códigos que el `Locale` general (sin dependencia en ejecución).
type SameLocales = [import('../i18n').Locale] extends [DocLocale] ? ([DocLocale] extends [import('../i18n').Locale] ? true : false) : false
const sameLocales: SameLocales = true
void sameLocales
