// Catálogo de productos (4 diseños predefinidos + plantillas propias de catálogo).
export { CatalogDocument, assembleCatalog, prepareCatalogDocument } from './CatalogDocument'
export type { CatalogDocumentProps, PreparedCatalogDocument } from './CatalogDocument'
export {
  CATALOG_TEMPLATES,
  catalogTemplates,
  isCatalogTemplateRef,
  pickCatalogTemplateRef,
  resolveCatalogTemplate,
} from './templates'
export type { CatalogTemplateInfo, ResolveCatalogTemplateInput, ResolvedCatalogTemplate } from './templates'
export { buildCatalogModel, glassLayers, productOpening } from './model'
export type { CatalogModel, FamilyModel, FinishModel, GlassModel, HardwareModel, ProductModel } from './model'
export { paginateBlocks } from './layout'
export type { Block as CatalogBlock, CatalogPage } from './layout'
export { catalogMetrics, themeFontIds as catalogFontIds } from './theme'
export { CATALOG_MESSAGES, catalogText } from './i18n'
export { safeImageSrc as catalogSafeImageSrc } from './parts'
