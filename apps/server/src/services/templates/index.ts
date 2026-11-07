/**
 * Plantillas de documentos (TPL-EDITOR): almacenamiento por organización, resolución para el PDF y
 * el portal, imágenes de documentos, generación con IA y ajustes por cotización v2.
 *
 * Contratos para otros equipos:
 * - `loadDocTemplate(db, orgId, ref, kind)`: plantilla con que se dibuja una referencia guardada.
 * - `resolveOrgQuoteDocument(db, orgId, { documents, quote, org })`: documento completo de una
 *   cotización (plantilla ⊕ empresa ⊕ cotización, textos, validez, idioma, notas por ítem).
 * - `resolveOrgCatalogTemplate(db, orgId, documents, requested?)`.
 * - `normalizeIncomingDocOverrides(input)` / `readStoredDocOverrides(stored)`: v1/v2 → v2.
 */
export * from './store'
export * from './resolve'
export * from './assets'
export * from './defaults'
export * from './overrides'
export * from './images'
export * from './generate'
export * from './records'
