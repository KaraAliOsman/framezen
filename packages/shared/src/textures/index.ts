/**
 * Contrato de texturas (foils) de DEKOPEN v5.
 *
 * - Biblioteca integrada: `BUILTIN_TEXTURE_IDS` son ids ESTABLES (se guardan en catálogos y
 *   cotizaciones; nunca se renombran). Las teselas WebP viven en
 *   packages/documents/src/textures/builtin/<id>.webp (las genera DRAW).
 * - Texturas subidas: se guardan como assets (tabla `assets`, kind 'texture' + 'texture_thumb')
 *   tras el pipeline del servidor (TEXUP). La web y los documentos las reciben como data URL.
 * - `TextureRef` tiene la misma forma que `Color.texture` del motor: el motor nunca la lee, solo la
 *   pasa de largo; el dibujo la resuelve.
 */
import type { ColorTexture } from '@dekopen/engine'
import { z } from 'zod'

// ── Referencias ──────────────────────────────────────────────────────────────

export const TEXTURE_FINISHES = ['smooth', 'woodgrain', 'textured', 'metallic'] as const
export type TextureFinish = (typeof TEXTURE_FINISHES)[number]

/** Textura de un color: integrada (id estable) o subida por la organización (asset). */
export type TextureSource = { kind: 'builtin'; id: BuiltinTextureId } | { kind: 'upload'; assetId: string }

/**
 * Lo que guarda un color del catálogo (`Color.texture`) además de su `hex` de respaldo. Es el tipo
 * del motor (`ColorTexture`) con los ids de la biblioteca integrada estrechados a `BuiltinTextureId`:
 * se deriva de él, así que ambos no pueden separarse (una prueba de compilación lo verifica).
 */
export type TextureRef = ColorTexture<BuiltinTextureId>

// ── Biblioteca integrada ─────────────────────────────────────────────────────

export const BUILTIN_TEXTURE_IDS = [
  'white_9016',
  'cream_9001',
  'grey_7035',
  'quartz_grey_7039',
  'anthracite_7016_smooth',
  'anthracite_7016_woodgrain',
  'anthracite_7016_sand',
  'black_9005',
  'black_brown_8022',
  'chartwell_green',
  'golden_oak',
  'nut_tree',
  'mahogany',
  'winchester',
  'sheffield_oak',
  'irish_oak',
  'metbrush_silver',
] as const
export type BuiltinTextureId = (typeof BUILTIN_TEXTURE_IDS)[number]

export function isBuiltinTextureId(value: unknown): value is BuiltinTextureId {
  return typeof value === 'string' && (BUILTIN_TEXTURE_IDS as readonly string[]).includes(value)
}

/** Nombres en los 7 idiomas de la app (es, en, pt, fr, de, it, tr). */
export interface TextureNames {
  es: string
  en: string
  pt: string
  fr: string
  de: string
  it: string
  tr: string
}

export interface BuiltinTexture {
  id: BuiltinTextureId
  names: TextureNames
  finish: TextureFinish
  /** Color base (respaldo plano y promedio para el motor/3D). */
  hex: string
  light: string
  dark: string
  /** Código RAL de referencia cuando aplica (nunca un código de proveedor). */
  ral?: string
  /** Repetición física por defecto de la tesela (mm). */
  scaleMm: number
}

/**
 * Valores de apariencia de referencia (investigación 21): base / claro / oscuro. Son decisiones de
 * dibujo, no muestras certificadas de un proveedor.
 */
export const BUILTIN_TEXTURES: Record<BuiltinTextureId, BuiltinTexture> = {
  white_9016: {
    id: 'white_9016',
    names: { es: 'Blanco tráfico', en: 'Traffic white', pt: 'Branco tráfego', fr: 'Blanc signalisation', de: 'Verkehrsweiß', it: 'Bianco traffico', tr: 'Trafik beyazı' },
    finish: 'smooth',
    hex: '#F5F5F0',
    light: '#FCFCF8',
    dark: '#DADDD8',
    ral: 'RAL 9016',
    scaleMm: 300,
  },
  cream_9001: {
    id: 'cream_9001',
    names: { es: 'Blanco crema', en: 'Cream white', pt: 'Branco creme', fr: 'Blanc crème', de: 'Cremeweiß', it: 'Bianco crema', tr: 'Krem beyaz' },
    finish: 'smooth',
    hex: '#E8E1D2',
    light: '#F2ECDD',
    dark: '#C7C0B2',
    ral: 'RAL 9001',
    scaleMm: 300,
  },
  grey_7035: {
    id: 'grey_7035',
    names: { es: 'Gris luminoso', en: 'Light grey', pt: 'Cinza claro', fr: 'Gris clair', de: 'Lichtgrau', it: 'Grigio luce', tr: 'Açık gri' },
    finish: 'smooth',
    hex: '#C5C7C4',
    light: '#D8DAD7',
    dark: '#A3A6A3',
    ral: 'RAL 7035',
    scaleMm: 300,
  },
  quartz_grey_7039: {
    id: 'quartz_grey_7039',
    names: { es: 'Gris cuarzo', en: 'Quartz grey', pt: 'Cinza quartzo', fr: 'Gris quartz', de: 'Quarzgrau', it: 'Grigio quarzo', tr: 'Kuvars gri' },
    finish: 'textured',
    hex: '#6B695F',
    light: '#817E72',
    dark: '#504F48',
    ral: 'RAL 7039',
    scaleMm: 120,
  },
  anthracite_7016_smooth: {
    id: 'anthracite_7016_smooth',
    names: { es: 'Gris antracita liso', en: 'Anthracite grey smooth', pt: 'Cinza antracite liso', fr: 'Gris anthracite lisse', de: 'Anthrazitgrau glatt', it: 'Grigio antracite liscio', tr: 'Antrasit gri düz' },
    finish: 'smooth',
    hex: '#383E42',
    light: '#4C5255',
    dark: '#282D31',
    ral: 'RAL 7016',
    scaleMm: 300,
  },
  anthracite_7016_woodgrain: {
    id: 'anthracite_7016_woodgrain',
    names: { es: 'Gris antracita veta', en: 'Anthracite grey woodgrain', pt: 'Cinza antracite veio', fr: 'Gris anthracite veiné', de: 'Anthrazitgrau Holzstruktur', it: 'Grigio antracite venato', tr: 'Antrasit gri ahşap dokulu' },
    finish: 'woodgrain',
    hex: '#383E42',
    light: '#4A5053',
    dark: '#262B2F',
    ral: 'RAL 7016',
    scaleMm: 600,
  },
  anthracite_7016_sand: {
    id: 'anthracite_7016_sand',
    names: { es: 'Gris antracita arenado', en: 'Anthracite grey sand texture', pt: 'Cinza antracite areado', fr: 'Gris anthracite sablé', de: 'Anthrazitgrau Sandstruktur', it: 'Grigio antracite sabbiato', tr: 'Antrasit gri kum dokulu' },
    finish: 'textured',
    hex: '#383E42',
    light: '#464B4F',
    dark: '#2A2F33',
    ral: 'RAL 7016',
    scaleMm: 80,
  },
  black_9005: {
    id: 'black_9005',
    names: { es: 'Negro intenso', en: 'Jet black', pt: 'Preto intenso', fr: 'Noir foncé', de: 'Tiefschwarz', it: 'Nero intenso', tr: 'Derin siyah' },
    finish: 'smooth',
    hex: '#1C1D1F',
    light: '#2E3033',
    dark: '#111213',
    ral: 'RAL 9005',
    scaleMm: 300,
  },
  black_brown_8022: {
    id: 'black_brown_8022',
    names: { es: 'Marrón negro', en: 'Black brown', pt: 'Castanho negro', fr: 'Brun noir', de: 'Schwarzbraun', it: 'Marrone nerastro', tr: 'Siyah kahve' },
    finish: 'woodgrain',
    hex: '#302923',
    light: '#483D32',
    dark: '#1E1B18',
    ral: 'RAL 8022',
    scaleMm: 600,
  },
  chartwell_green: {
    id: 'chartwell_green',
    names: { es: 'Verde Chartwell', en: 'Chartwell green', pt: 'Verde Chartwell', fr: 'Vert Chartwell', de: 'Chartwell-Grün', it: 'Verde Chartwell', tr: 'Chartwell yeşili' },
    finish: 'woodgrain',
    hex: '#89998B',
    light: '#A8B4A3',
    dark: '#65776A',
    scaleMm: 600,
  },
  golden_oak: {
    id: 'golden_oak',
    names: { es: 'Roble dorado', en: 'Golden oak', pt: 'Carvalho dourado', fr: 'Chêne doré', de: 'Golden Oak', it: 'Rovere dorato', tr: 'Altın meşe' },
    finish: 'woodgrain',
    hex: '#A76B32',
    light: '#C99250',
    dark: '#623A1F',
    scaleMm: 900,
  },
  nut_tree: {
    id: 'nut_tree',
    names: { es: 'Nogal', en: 'Walnut', pt: 'Nogueira', fr: 'Noyer', de: 'Nussbaum', it: 'Noce', tr: 'Ceviz' },
    finish: 'woodgrain',
    hex: '#68472F',
    light: '#92704D',
    dark: '#36271E',
    scaleMm: 900,
  },
  mahogany: {
    id: 'mahogany',
    names: { es: 'Caoba', en: 'Mahogany', pt: 'Mogno', fr: 'Acajou', de: 'Mahagoni', it: 'Mogano', tr: 'Maun' },
    finish: 'woodgrain',
    hex: '#713F32',
    light: '#9B6047',
    dark: '#3F231F',
    scaleMm: 800,
  },
  winchester: {
    id: 'winchester',
    names: { es: 'Roble Winchester', en: 'Winchester oak', pt: 'Carvalho Winchester', fr: 'Chêne Winchester', de: 'Eiche Winchester', it: 'Rovere Winchester', tr: 'Winchester meşe' },
    finish: 'woodgrain',
    hex: '#A57E50',
    light: '#C5A477',
    dark: '#6B4B2D',
    scaleMm: 900,
  },
  sheffield_oak: {
    id: 'sheffield_oak',
    names: { es: 'Roble Sheffield claro', en: 'Sheffield oak light', pt: 'Carvalho Sheffield claro', fr: 'Chêne Sheffield clair', de: 'Eiche Sheffield hell', it: 'Rovere Sheffield chiaro', tr: 'Açık Sheffield meşe' },
    finish: 'woodgrain',
    hex: '#C3BDAE',
    light: '#E0DDD2',
    dark: '#8D877B',
    scaleMm: 900,
  },
  irish_oak: {
    id: 'irish_oak',
    names: { es: 'Roble irlandés', en: 'Irish oak', pt: 'Carvalho irlandês', fr: 'Chêne irlandais', de: 'Irische Eiche', it: 'Rovere irlandese', tr: 'İrlanda meşesi' },
    finish: 'woodgrain',
    hex: '#B3976F',
    light: '#D2B993',
    dark: '#786249',
    scaleMm: 900,
  },
  metbrush_silver: {
    id: 'metbrush_silver',
    names: { es: 'Aluminio cepillado', en: 'Brushed silver', pt: 'Alumínio escovado', fr: 'Aluminium brossé', de: 'Aluminium gebürstet', it: 'Alluminio spazzolato', tr: 'Fırçalanmış gümüş' },
    finish: 'metallic',
    hex: '#A5A8A6',
    light: '#D0D2CE',
    dark: '#777C7B',
    scaleMm: 400,
  },
}

// ── Texturas subidas (assets) ────────────────────────────────────────────────

/** Tipos de asset que guarda el servidor (tabla `assets`). */
export const ASSET_KINDS = ['texture', 'texture_thumb', 'document_image', 'avatar'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

/** Formatos aceptados: solo raster (nunca SVG: puede llevar scripts). */
export const ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type AssetMimeType = (typeof ASSET_MIME_TYPES)[number]

/** Límites de la subida original de una textura (antes del pipeline). */
export const TEXTURE_UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 24_000_000,
  /** Lado de la tesela resultante (WebP) y de su miniatura. */
  tilePx: 512,
  thumbPx: 128,
} as const

/** Paleta extraída de la foto (base = mediana; claro/oscuro = percentiles; promedio). */
export interface TexturePalette {
  base: string
  light: string
  dark: string
  average: string
}

/** Clasificación opcional con IA (visión). Nunca obligatoria: el pipeline funciona sin IA. */
export interface TextureAiSuggestion {
  name: string
  finish: TextureFinish
  /** Escala sugerida (mm por repetición). */
  scaleMm?: number
  confidence: number
  /** Ids integrados parecidos, si los hay. */
  similarBuiltin?: BuiltinTextureId[]
}

/** Metadatos de una textura subida (assets.meta). */
export interface TextureAssetMeta {
  finish: TextureFinish
  scaleMm: number
  palette: TexturePalette
  /** Orientación de veta detectada en la foto original (grados) y si se giró a horizontal. */
  grainAngleDeg?: number
  rotatedDeg?: number
  /** Costura corregida (offset + fundido). */
  seamless: boolean
  /** Dimensiones de la foto original. */
  source?: { width: number; height: number; mime: AssetMimeType; sha256: string }
  ai?: TextureAiSuggestion
  /** Revisión del pipeline que la generó (para regenerar si cambia el algoritmo). */
  pipelineRevision: number
}

/** Textura subida tal como la ve la web (sin bytes; la imagen viaja como data URL aparte). */
export interface TextureAsset {
  id: string
  name: string
  mime: AssetMimeType
  width: number
  height: number
  byteSize: number
  sha256: string
  meta: TextureAssetMeta
  /** Miniatura (asset kind 'texture_thumb'). */
  thumbId?: string
  createdAt: string
  createdBy?: string
}

/** Textura con sus imágenes en línea (para dibujar sin otra petición). */
export interface TextureAssetWithData extends TextureAsset {
  /** data:image/webp;base64,… de la tesela. */
  dataUrl: string
  thumbDataUrl?: string
}

// ── Endpoints (/api/textures) ────────────────────────────────────────────────

export const TEXTURE_PATHS = {
  /** GET → TextureListResponse; POST TextureUploadBody → TextureUploadResponse. */
  list: '/api/textures',
  upload: '/api/textures',
  /** GET → TextureAssetWithData; PATCH TexturePatchBody → TextureAsset; DELETE → { ok, undo } */
  item: (id: string) => `/api/textures/${encodeURIComponent(id)}`,
  /** POST → TextureAsset (deshace el borrado). */
  restore: (id: string) => `/api/textures/${encodeURIComponent(id)}/restore`,
  /** GET → imagen (Content-Type del asset, nosniff, CSP estricta, ETag = sha256). */
  image: (id: string) => `/api/textures/${encodeURIComponent(id)}/image`,
} as const

/** POST /api/textures — JSON (el servidor admite hasta 15 MB en esta ruta: foto ≤ 10 MiB en base64 ≈ +33 %). */
export interface TextureUploadBody {
  name?: string
  /** data:image/png|jpeg|webp;base64,… de la foto original. */
  dataUrl: string
  /** Escala física conocida (mm por repetición), si la persona la sabe. */
  scaleMm?: number
  finish?: TextureFinish
  /** Pedir sugerencia de nombre/acabado con IA (gasta créditos; requiere plan con IA). */
  useAi?: boolean
}

export interface TextureUploadResponse {
  texture: TextureAssetWithData
  /** true si ya existía la misma imagen (deduplicada por sha256). */
  duplicate: boolean
  /** Avisos que no bloquean (foto muy chica, veta poco clara, IA no disponible…). */
  warnings: string[]
  creditsUsed: number
}

export interface TextureListResponse {
  items: TextureAsset[]
  total: number
  builtin: BuiltinTextureId[]
}

export interface TexturePatchBody {
  name?: string
  scaleMm?: number
  finish?: TextureFinish
  angleDeg?: number
}

/** Color propio de la organización con textura (catálogo → custom.colors). */
export interface CustomColorInput {
  name: string
  /** Respaldo plano obligatorio (#RRGGBB). */
  hex: string
  code?: string
  texture?: TextureRef
  /** Factor sobre el precio del perfil blanco (1 = mismo precio), si no se cargan precios propios. */
  priceFactor?: number
}

// ── Validación (zod) ─────────────────────────────────────────────────────────

const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/

export const textureFinishSchema = z.enum(TEXTURE_FINISHES)

export const textureRefSchema = z.union([
  z.object({
    kind: z.literal('builtin'),
    id: z.enum(BUILTIN_TEXTURE_IDS),
    scaleMm: z.number().min(10).max(5000).optional(),
    angleDeg: z.number().min(-180).max(180).optional(),
    finish: textureFinishSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal('upload'),
    assetId: z.string().min(1).max(64),
    scaleMm: z.number().min(10).max(5000).optional(),
    angleDeg: z.number().min(-180).max(180).optional(),
    finish: textureFinishSchema.optional(),
  }).strict(),
])

export const textureUploadBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  dataUrl: z.string().max(14_000_000).regex(DATA_URL_RE),
  scaleMm: z.number().min(10).max(5000).optional(),
  finish: textureFinishSchema.optional(),
  useAi: z.boolean().optional(),
}).strict()

export const texturePatchBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  scaleMm: z.number().min(10).max(5000).optional(),
  finish: textureFinishSchema.optional(),
  angleDeg: z.number().min(-180).max(180).optional(),
}).strict()

export const customColorInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  hex: hexSchema,
  code: z.string().trim().max(20).optional(),
  texture: textureRefSchema.optional(),
  priceFactor: z.number().min(0.1).max(10).optional(),
}).strict()
