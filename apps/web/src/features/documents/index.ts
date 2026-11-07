/**
 * Documentos (plantillas, editor, IA y ajustes por cotización).
 *
 * Contrato para el editor de cotizaciones (UI-QUOTES):
 *  - `QuoteDocumentPanel`: panel «Documento» de una cotización (plantilla, idioma, secciones,
 *    textos, vigencia, nota al cliente, notas por ventana). Controlado: `overrides` entra,
 *    `onChange(next, { ops, label })` sale con el v2 compacto; el host guarda y registra el historial.
 *  - Utilidades puras del panel: `applyQuoteOps`, `normalizeOverrides`, `overrideCount`.
 *  - Datos: `useTemplates` (plantillas propias + predeterminadas), `templatesApi`.
 *  - Fuentes de los documentos: `documentTemplateFontCss`.
 *  - `TemplatePreview`: vista previa de una `DocTemplate` con datos reales.
 * La pantalla `/documentos` (galería + editor) es `DocumentsPage` (carga diferida por el router).
 */
export { QuoteDocumentPanel, type QuoteDocumentChange, type QuoteDocumentPanelProps, type QuotePanelItem } from './quote/QuoteDocumentPanel'
export { QUOTE_TEXT_FIELDS, applyQuoteOps, isEmptyOverrides, mergedTemplate, normalizeOverrides, overrideCount, templateChangeCount, type OpsResult, type QuoteTextField } from './quote/model'
export { templateKeys, templatesApi, useTemplate, useTemplates } from './api'
export { documentTemplateFontCss } from './fonts'
export { TemplatePreview, pageWidthPx, type TemplatePreviewProps } from './preview/TemplatePreview'
export { DocChecks, useDocChecks } from './quote/DocChecks'
export { DocCanvas, type DocCanvasProps } from './canvas/DocCanvas'
export { DocScope, type DocScopeProps } from './quote/DocScope'
export { getOpenTemplate, subscribeOpenTemplate, useOpenTemplate, type OpenTemplate } from './openTemplate'
