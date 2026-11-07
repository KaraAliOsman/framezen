/**
 * Motor de plantillas de documentos (v5): `DocTemplate` + datos de la cotización + ajustes por
 * cotización v2 + idioma → documento React paginado. Ver `sales/quote/QuoteDocument` para el punto de
 * entrada de la cotización.
 */
export { TEMPLATE_CSS } from './css'
export { flowDocumentPages, TEMPLATE_FLOW_SCRIPT, TRUSTED_TEMPLATE_FLOW } from './flow-dom'
export { markEdges, paginateFlow, type FlowBlock as TemplateFlowBlock, type FlowBudgets, type FlowPage, type FlowResult, type PlacedBlock } from './flow'
export { CHROME, PX_PER_MM, mmToPx, pageGeometry, type PageGeometry } from './page'
export {
  DENSITY_VALUES,
  FONT_WIDTH,
  RADIUS_VALUES,
  TYPE_SCALE_VALUES,
  resolveThemeTokens,
  templateThemeVars,
  themeFontIds,
  type ResolvedThemeTokens,
} from './theme'
export { baseQuoteTemplate, buildQuoteModel, type QuoteModel, type QuoteRenderOptions, type QuoteTexts, type SectionTextSlot } from './model'
export { MeasuredTemplateDocument, TemplateDocumentView, paginateQuote, quoteBlocks, templateRootProps, type TemplateDocumentViewProps } from './Document'
export { QUOTE_SECTION_RENDERERS } from './registry'
export { quoteDocChecks, type DocCheck, type DocCheckCode } from './checks'
export { parseWarranty } from './sections/closing'
export { glassLayers as glassBuildupLayers, type GlassLayer } from './sections/specs'
export { brandAssetIds, preloadDocumentTextures, templateAssetIds, templateUsesItalic } from './assets'
export { isQrValue, QrCode } from './qr'
export { DOC_FONT_FILES, docFontFaceRules, docFontFiles, type DocFontFile } from './fonts'
