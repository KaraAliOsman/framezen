/**
 * Texturas y colores propios (TEXUP, ola 1): contrato extendido sobre `./index` (ola 0).
 *
 * Flujo de subida con vista previa en vivo (la web):
 *   1. POST /api/textures { dataUrl, preview: true, …opciones } → TexturePreviewResponse
 *      (procesa la foto, guarda un borrador en memoria del servidor; no ocupa espacio todavía).
 *   2. POST /api/textures/drafts/:id { …opciones } → TexturePreviewResponse (girar, recortar,
 *      cambiar escala o costura sin volver a subir la foto).
 *   3. POST /api/textures/drafts/:id/commit { name, …opciones, color? } → TextureCommitResponse
 *      (guarda la tesela y, si se pide, crea el color propio en el mismo paso).
 * Sin `preview`, POST /api/textures guarda de una vez (API, asistente): TextureUploadResponse.
 *
 * Colores propios (catálogo → custom.colors): /api/catalog/colors. Sus ids empiezan por
 * `custom-` y nunca chocan con los del catálogo base. Un color archivado sigue existiendo (las
 * cotizaciones que lo usan se dibujan y cotizan igual) pero no se ofrece en las líneas.
 */
import { z } from 'zod'
import {
  BUILTIN_TEXTURE_IDS,
  textureFinishSchema,
  textureRefSchema,
  type AssetMimeType,
  type BuiltinTextureId,
  type TextureAiSuggestion,
  type TextureAssetWithData,
  type TextureFinish,
  type TexturePalette,
  type TextureRef,
} from './index'

// ── Procesamiento ────────────────────────────────────────────────────────────

export const TEXTURE_SEAM_METHODS = ['feather', 'mirror'] as const
export type TextureSeamMethod = (typeof TEXTURE_SEAM_METHODS)[number]

/** Recorte normalizado (0–1) sobre la foto ya enderezada (orientación EXIF aplicada). */
export interface TextureCrop {
  x: number
  y: number
  width: number
  height: number
}

/** Ajustes del procesamiento (todos opcionales: sin nada, el servidor decide solo). */
export interface TextureProcessOptions {
  /**
   * Giro manual en grados (sentido horario). Si viene, reemplaza al giro automático de la veta.
   * Para «la veta quedó vertical» basta con ±90.
   */
  rotationDeg?: number
  /** false = no enderezar la veta automáticamente. */
  autoRotate?: boolean
  crop?: TextureCrop
  /** 'feather' (fundido de bordes, por defecto) o 'mirror' (espejo 2×2, más robusto). */
  seam?: TextureSeamMethod
  finish?: TextureFinish
  /** Largo físico de una repetición de la tesela (mm). */
  scaleMm?: number
}

/** Avisos que no bloquean (la web los traduce por código). */
export const TEXTURE_WARNING_CODES = [
  'low_resolution',
  'grain_unclear',
  'seam_visible',
  'uneven_light',
  'exposure',
  'ai_unavailable',
  'ai_plan',
  'ai_no_credits',
  'ai_daily_limit',
  'ai_failed',
] as const
export type TextureWarningCode = (typeof TEXTURE_WARNING_CODES)[number]

/** Motivo de rechazo de una foto (`error.code` 415/413 + `reason`), para mensajes precisos. */
export const TEXTURE_REJECT_REASONS = ['format', 'animated', 'decode', 'too_large', 'too_many_pixels', 'too_small'] as const
export type TextureRejectReason = (typeof TEXTURE_REJECT_REASONS)[number]

/** Lo que midió el servidor (para explicar la vista previa: antes/después, veta, costura). */
export interface TextureAnalysis {
  source: { width: number; height: number; mime: AssetMimeType }
  crop: TextureCrop
  /** Ángulo de la veta en la foto (grados, horario, −90…90) y qué tan clara es (0–1). */
  grainAngleDeg: number
  coherence: number
  /** Giro aplicado para dejar la veta horizontal (grados, horario). */
  rotatedDeg: number
  autoRotated: boolean
  finishDetected: TextureFinish
  illuminationCorrected: boolean
  seam: TextureSeamMethod
  /** 1 ≈ sin costura visible; > 2 se nota al repetir. */
  seamScore: number
  palette: TexturePalette
}

export interface TexturePreview {
  /** Tesela final (512 px, WebP) y miniatura (128 px). */
  tileDataUrl: string
  thumbDataUrl: string
  /** Recorte original antes de procesar (para comparar antes/después). */
  beforeDataUrl: string
  finish: TextureFinish
  scaleMm: number
  /** Nombre sugerido (IA si se pidió y hubo créditos; si no, uno descriptivo). */
  name: string
  hex: string
  analysis: TextureAnalysis
  ai?: TextureAiSuggestion
  similarBuiltin: BuiltinTextureId[]
  warnings: TextureWarningCode[]
}

export interface TextureDraftInfo {
  id: string
  expiresAt: string
}

export interface TexturePreviewResponse {
  draft: TextureDraftInfo
  preview: TexturePreview
  creditsUsed: number
}

/** Crear un color propio al guardar la textura (un solo paso). */
export interface TextureCommitColor {
  name?: string
  lineIds?: string[]
  priceFactor?: number
  priceBaseColorId?: string
}

export interface TextureDraftCommitBody extends TextureProcessOptions {
  name?: string
  color?: TextureCommitColor
}

export interface TextureCommitResponse {
  texture: TextureAssetWithData
  duplicate: boolean
  warnings: TextureWarningCode[]
  creditsUsed: number
  color?: CatalogColorView
}

/** GET /api/textures/resolve?ids=a,b → imágenes en línea para dibujar (TextureProvider de DRAW). */
export interface ResolvedTexture {
  id: string
  name: string
  dataUrl: string
  scaleMm: number
  finish: TextureFinish
  hex: string
}

export interface TextureResolveResponse {
  textures: Record<string, ResolvedTexture>
}

export interface TextureDeleteResponse {
  ok: true
  /** Colores propios que usaban la textura (se dibujarán con su color plano hasta restaurarla). */
  colors: number
  undo: { method: 'POST'; path: string }
}

export const TEXTURE_V2_PATHS = {
  resolve: '/api/textures/resolve',
  draft: (id: string) => `/api/textures/drafts/${encodeURIComponent(id)}`,
  commit: (id: string) => `/api/textures/drafts/${encodeURIComponent(id)}/commit`,
} as const

// ── Validación del procesamiento ─────────────────────────────────────────────

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/
const unit = z.number().min(0).max(1)

export const textureCropSchema = z
  .object({ x: unit, y: unit, width: z.number().min(0.02).max(1), height: z.number().min(0.02).max(1) })
  .strict()
  .refine((c) => c.x + c.width <= 1.0001 && c.y + c.height <= 1.0001, { message: 'El recorte se sale de la foto.' })

export const textureProcessOptionsShape = {
  rotationDeg: z.number().min(-180).max(180).optional(),
  autoRotate: z.boolean().optional(),
  crop: textureCropSchema.optional(),
  seam: z.enum(TEXTURE_SEAM_METHODS).optional(),
  finish: textureFinishSchema.optional(),
  scaleMm: z.number().min(10).max(5000).optional(),
}

export const textureProcessOptionsSchema = z.object(textureProcessOptionsShape).strict()

/** POST /api/textures (extiende `textureUploadBodySchema` con vista previa y ajustes). */
export const textureUploadRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    dataUrl: z.string().max(14_000_000).regex(DATA_URL_RE),
    useAi: z.boolean().optional(),
    preview: z.boolean().optional(),
    ...textureProcessOptionsShape,
  })
  .strict()

const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const idSchema = z.string().trim().min(1).max(100)
const lineIdsSchema = z.array(idSchema).max(200)

export const textureCommitColorSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    lineIds: lineIdsSchema.optional(),
    priceFactor: z.number().min(0.1).max(10).optional(),
    priceBaseColorId: idSchema.optional(),
  })
  .strict()

export const textureDraftCommitSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: textureCommitColorSchema.optional(),
    ...textureProcessOptionsShape,
  })
  .strict()

// ── Colores propios ──────────────────────────────────────────────────────────

export const CUSTOM_COLOR_ID_PREFIX = 'custom-'

export function isCustomColorId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(CUSTOM_COLOR_ID_PREFIX)
}

/** Ajustes de un color propio (custom.colorSettings[id]). */
export interface CustomColorSettings {
  /** Líneas que lo ofrecen (se agrega a `line.colorIds` en el catálogo efectivo). */
  lineIds: string[]
  /** Precio del perfil = precio en `priceBaseColorId` (o el primer color de la línea) × factor. */
  priceFactor?: number
  priceBaseColorId?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
}

/** Color tal como lo muestra la pestaña «Colores y texturas». */
export interface CatalogColorView {
  id: string
  name: string
  hex: string
  code?: string
  texture?: TextureRef
  source: 'custom' | 'base'
  /** Solo base: textura de fábrica y si la organización la reemplazó. */
  factoryTexture?: TextureRef
  textureOverridden?: boolean
  lineIds: string[]
  priceFactor?: number
  priceBaseColorId?: string
  archived: boolean
  createdAt?: string
  updatedAt?: string
}

/** GET /api/catalog/colors */
export interface CatalogColorsResponse {
  /** Colores propios (incluye los archivados con `archived: true`). */
  items: CatalogColorView[]
  /** Texturas propias puestas sobre colores del catálogo base (id del color → textura). */
  overrides: Record<string, TextureRef>
  updatedAt: string
}

export interface CatalogColorMutationResponse {
  color: CatalogColorView
  updatedAt: string
  undo?: { method: 'POST'; path: string }
}

export const customColorCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    hex: hexSchema,
    code: z.string().trim().max(20).optional(),
    texture: textureRefSchema.optional(),
    priceFactor: z.number().min(0.1).max(10).optional(),
    priceBaseColorId: idSchema.optional(),
    lineIds: lineIdsSchema.optional(),
  })
  .strict()

/** PATCH /api/catalog/colors/:id — en colores base solo se acepta `texture` (null = la de fábrica). */
export const customColorPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    hex: hexSchema.optional(),
    code: z.string().trim().max(20).nullable().optional(),
    texture: textureRefSchema.nullable().optional(),
    priceFactor: z.number().min(0.1).max(10).nullable().optional(),
    priceBaseColorId: idSchema.nullable().optional(),
    lineIds: lineIdsSchema.optional(),
  })
  .strict()

export type CustomColorCreateBody = z.infer<typeof customColorCreateSchema>
export type CustomColorPatchBody = z.infer<typeof customColorPatchSchema>

export const CATALOG_COLOR_PATHS = {
  list: '/api/catalog/colors',
  create: '/api/catalog/colors',
  item: (id: string) => `/api/catalog/colors/${encodeURIComponent(id)}`,
  restore: (id: string) => `/api/catalog/colors/${encodeURIComponent(id)}/restore`,
} as const

/** Ids integrados válidos (para validar sugerencias de la IA sin importar la lista completa). */
export const BUILTIN_TEXTURE_ID_SET: ReadonlySet<string> = new Set(BUILTIN_TEXTURE_IDS)
