/**
 * Contrato de plantillas de documentos (DocTemplate v1, ajustes por cotización v2, operaciones,
 * diseños predefinidos y contrato con la IA). Sin renderizado: eso vive en @dekopen/documents.
 *
 * Los ayudantes genéricos internos (clonado JSON, igualdad, creación de issues…) se exportan con
 * prefijo de documento para no chocar con otros módulos de @dekopen/shared.
 */
export * from './limits'
export * from './locales'
export * from './kinds'
export * from './placeholders'
export {
  unsafeTextReason,
  isSafeDocText,
  sanitizeDocText,
  truncateText as truncateDocText,
  isReservedId as isReservedDocId,
  measureJson as measureDocJson,
  findUnsafeStrings as findUnsafeDocStrings,
  cloneJson as cloneDocJson,
  jsonEqual as docJsonEqual,
  type UnsafeTextReason,
  type SanitizeTextOptions,
  type JsonShape as DocJsonShape,
  type UnsafeString as UnsafeDocString,
} from './safety'
export * from './color'
export * from './fonts'
export {
  DOC_ISSUE_CODES,
  hasErrors as hasDocErrors,
  fromZodIssues as docIssuesFromZod,
  type DocIssue,
  type DocIssueCode,
  type DocIssueSeverity,
  type DocIssuePath,
  type DocIssueParams,
} from './issues'
export * from './fields'
export * from './richtext'
export * from './theme'
export * from './page'
export * from './settings'
export * from './seeded'
export * from './sections'
export * from './preset-ids'
export * from './template'
export * from './presets'
export * from './overrides'
export * from './i18n'
export * from './ops'
export * from './repair'
export * from './ai'
