/**
 * i18n de la web. Guía completa: docs/build/i18n-guia.md.
 *
 * Convención por carpeta (sin índice central que editar):
 *   <carpeta>/i18n/es.ts  — fuente en español, `export default { … } as const`
 *   <carpeta>/i18n/{en,pt,fr,de,it,tr}.ts — `const en: Translation<typeof es> = { … }; export default en`
 *
 * Componentes: `useT(es)`, `<T>`, `useFormat()`, `useGlossary()`, `useLocale()`.
 * Módulos sin React: `translate(es, 'clave', params)`, `getFormatter()`, `getGlossary()`, `getLocale()`.
 * Glosario: usa `useGlossary()`/`getGlossary()`/`webGlossary` (bajan solo el idioma en uso), no el
 * `glossary` estático de `@dekopen/shared` (trae los 7 idiomas al paquete de la web).
 * (Dentro de `lib/` importa desde './i18n/runtime' para no crear ciclos con `api.ts`).
 */
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  isLocale,
  defineNamespace,
  type Locale,
  type LocaleMeta,
  type MessageKey,
  type MessageParams,
  type MessageTree,
  type Translation,
  type Formatter,
} from '@dekopen/shared'
export {
  LOCALE_STORAGE_KEY,
  applyHtmlLang,
  detectInitialLocale,
  getLocale,
  getPendingLocale,
  hasMessage,
  isLocaleReady,
  loadLocale,
  onLocaleChange,
  preloadNamespace,
  resetI18nForTests,
  setLocale,
  subscribeLocale,
  switchLocale,
  translate,
  type LocaleChangeSource,
  type Namespace,
} from './runtime'
export { namespaceIds, namespaceOf, registerNamespace, type NamespaceLoader } from './registry'
export { I18nProvider, LocaleScope, T, useLocale, useT, type LocaleState, type Translator } from './provider'
export { renderRich, type RichValue, type RichValues } from './rich'
export { getFormatter, readOrgCurrency, useFormat, useOrgCurrency, type UseFormatOptions } from './format'
export { getGlossary, useGlossary, webGlossary, type GlossaryHelpers } from './glossary'
export { LocaleServerSync } from './sync'
