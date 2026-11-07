/**
 * Texturas propias y colores propios (TEXUP). Ver routes/textures.ts y routes/catalog.ts
 * (/api/catalog/colors). Para documentos/PDF: `textureDataUrlsForColors`.
 */
export { TextureService, textureDataUrlsForColors, toTextureAsset, type StoredTextureMeta, type TextureServiceOptions } from './service'
export { CustomColorService } from './color-service'
export {
  applyCustomColors,
  colorSettingsOf,
  colorTexturesOf,
  colorsUsingTexture,
  customColorsOf,
  newCustomColorId,
  referencePrice,
  slugify,
  type CustomCatalogWithColors,
} from './custom-colors'
export { TextureDraftStore, type TextureDraft } from './drafts'
export { suggestTextureWithAi, cleanSuggestedName, type TextureAiOutcome, type TextureAiRuntime } from './ai'
export {
  TEXTURE_PIPELINE_LIMITS,
  TEXTURE_PIPELINE_REVISION,
  TextureRejected,
  TexturePipelineBusy,
  processTexture,
  sanitizeTextureSource,
  withPipelineSlot,
  type ProcessedTexture,
  type SanitizedSource,
} from './pipeline'
