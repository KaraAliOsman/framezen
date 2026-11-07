/**
 * Límites duros del sistema de plantillas. Todo string, arreglo y número del esquema tiene tope:
 * una plantilla (manual, importada o generada por la IA) nunca puede crecer sin control ni
 * convertirse en un vector de abuso del renderizador.
 */

/** Versión del esquema `DocTemplate`. Cambia sólo con una migración explícita. */
export const DOC_TEMPLATE_SCHEMA_VERSION = 1 as const

/** Versión del objeto de ajustes por cotización (`QuoteDocOverridesV2`). */
export const QUOTE_DOC_OVERRIDES_VERSION = 2 as const

export const TEMPLATE_LIMITS = {
  /** Bytes máximos de una plantilla serializada (JSON) aceptada desde fuera (IA, importación). */
  maxJsonBytes: 256 * 1024,
  /** Profundidad máxima de anidamiento JSON aceptada antes de validar. */
  maxJsonDepth: 16,
  /** Nodos JSON (objetos + arreglos + valores) máximos antes de validar. */
  maxJsonNodes: 20_000,

  nameMax: 80,
  descriptionMax: 300,
  sectionsMax: 40,
  sectionTitleMax: 80,
  coverTitleMax: 160,
  coverSubtitleMax: 240,
  captionMax: 200,
  galleryImagesMax: 24,

  /** Texto enriquecido (AST): bloques, nodos en línea y largo total. */
  richTextBlocksMax: 60,
  richTextInlineMax: 200,
  richTextListItemsMax: 50,
  richTextRunMax: 2_000,
  richTextTotalCharsMax: 12_000,

  /** Ajustes por cotización. */
  itemNotesMax: 500,
  itemNoteMax: 1_000,
  addedSectionsMax: 10,
  sectionOverridesMax: 60,

  /** Campos personalizados del encabezado. */
  customFieldsMax: 4,
  customFieldLabelMax: 40,
  customFieldValueMax: 120,

  /** Operaciones por lote (editor, comandos locales, IA). */
  opsPerBatchMax: 50,
} as const

/**
 * Topes de los textos del documento (iguales a los de `PATCH /api/settings` → documents, para que
 * un texto aceptado en la organización también lo sea en una cotización).
 */
export const DOC_TEXT_LIMITS = {
  intro: 4_000,
  conditions: 8_000,
  paymentTerms: 1_000,
  warranty: 2_000,
  leadTimeText: 500,
  signatureName: 120,
  footer: 500,
  clientNote: 4_000,
  includes: 2_000,
  excludes: 2_000,
} as const

/** Márgenes de página admitidos (mm). */
export const PAGE_MARGIN_RANGE_MM = { min: 8, max: 30 } as const

/** Validez de la cotización (días). */
export const VALIDITY_DAYS_RANGE = { min: 1, max: 365 } as const
