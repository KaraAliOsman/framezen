/**
 * i18n de DEKOPEN (plan v5 §4.B): idiomas, traductor ICU-lite sin framework, formatos por idioma
 * y glosario de dominio en 7 idiomas. Guía de uso: docs/build/i18n-guia.md.
 */
export * from './locales'
export {
  compileMessage,
  messageParams,
  pluralCategory,
  pluralRulesFor,
  renderNodes,
  MessageSyntaxError,
  type MessageNode,
  type RenderContext,
} from './message'
export * from './translator'
export * from './format'
export * from './glossary'
