/**
 * Pipeline de texturas subidas (sharp). Dos etapas:
 *
 * 1. `sanitizeTextureSource(bytes)`: valida y limpia la foto original.
 *    - Bytes ≤ 10 MiB, reconocida por sus bytes (PNG/JPEG/WebP; nunca SVG, GIF, HEIC, TIFF…),
 *      sin animación (APNG acTL, WebP con bandera de animación, varias páginas), ≤ 24 MP y ≤ 8192 px
 *      por lado, ≥ 64 px. El tipo declarado y la extensión no se creen: mandan los bytes.
 *    - Decodificación completa con límites de libvips (`limitInputPixels`, `failOn: 'error'`,
 *      plazo), orientación EXIF aplicada, conversión a sRGB con su perfil ICC, transparencia
 *      aplanada sobre blanco y metadatos fuera (EXIF/GPS/XMP no sobreviven a la recodificación).
 *    - Resultado: copia de trabajo JPEG 4:4:4 de ≤ 2048 px. El original nunca se guarda.
 * 2. `processTexture(source, options)`: recorte → veta (tensor de estructura) → giro a horizontal
 *    → recorte válido sin esquinas vacías → 512 px → iluminación pareja → paleta → costura
 *    (fundido de bordes o espejo) → tesela WebP 512 + miniatura 128 + «antes» 256.
 *
 * Límite de concurrencia propio (2 a la vez, cola corta) para que unas pocas subidas grandes no
 * se coman la CPU del servidor; libvips además corta cada operación por plazo.
 */
import { createHash } from 'node:crypto'
import sharp, { type Metadata, type Sharp } from 'sharp'
import {
  TEXTURE_UPLOAD_LIMITS,
  type AssetMimeType,
  type TextureAnalysis,
  type TextureCrop,
  type TextureFinish,
  type TextureProcessOptions,
  type TextureRejectReason,
  type TextureSeamMethod,
  type TextureWarningCode,
} from '@dekopen/shared'
import { sniffImage } from '../assets/sniff'
import {
  DEFAULT_SCALE_MM,
  estimateGrain,
  extractPalette,
  featherSeams,
  findPeriodicWindow,
  flattenIllumination,
  guessFinish,
  mirrorTile,
  periodicTile,
  rotationForGrain,
  seamScore,
  surfaceStats,
  toLinear,
  toSrgb,
  validRotatedSquare,
  type GrainEstimate,
  type RgbImage,
  type SurfaceStats,
} from './image'

/** Sube cuando cambia el algoritmo (las texturas guardadas indican con cuál se hicieron). */
export const TEXTURE_PIPELINE_REVISION = 1

export const TEXTURE_PIPELINE_LIMITS = {
  maxBytes: TEXTURE_UPLOAD_LIMITS.maxBytes,
  maxPixels: TEXTURE_UPLOAD_LIMITS.maxPixels,
  maxSide: 8192,
  minSide: 64,
  /** Lado máximo de la copia de trabajo (de ahí sale la tesela de 512). */
  workSide: 2048,
  tilePx: TEXTURE_UPLOAD_LIMITS.tilePx,
  thumbPx: TEXTURE_UPLOAD_LIMITS.thumbPx,
  beforePx: 256,
  /** Por debajo de este lado de recorte la tesela se agranda (se avisa). */
  lowResSide: 256,
  /** Tesela más pesada que esto se recomprime (documentos y PDF la llevan en línea). */
  tileBudgetBytes: 180 * 1024,
  timeoutSeconds: 20,
} as const

/** La foto no sirve: código de rechazo estable (la ruta lo traduce a 413/415). */
export class TextureRejected extends Error {
  constructor(
    readonly reason: TextureRejectReason,
    message: string,
  ) {
    super(message)
    this.name = 'TextureRejected'
  }

  get status(): 413 | 415 | 422 {
    if (this.reason === 'too_large' || this.reason === 'too_many_pixels') return 413
    if (this.reason === 'too_small') return 422
    return 415
  }
}

/** Demasiadas fotos procesándose a la vez (la ruta responde 429 con Retry-After). */
export class TexturePipelineBusy extends Error {
  constructor() {
    super('pipeline_busy')
    this.name = 'TexturePipelineBusy'
  }
}

// ── Concurrencia ─────────────────────────────────────────────────────────────

const MAX_ACTIVE = 2
const MAX_QUEUED = 12
let active = 0
const queue: (() => void)[] = []

/** Ejecuta `fn` con uno de los cupos del pipeline (o lanza TexturePipelineBusy si la cola está llena). */
export async function withPipelineSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_ACTIVE) {
    if (queue.length >= MAX_QUEUED) throw new TexturePipelineBusy()
    await new Promise<void>((resolve) => queue.push(resolve))
  }
  active++
  try {
    return await fn()
  } finally {
    active--
    queue.shift()?.()
  }
}

// ── Etapa 1: validar y limpiar ───────────────────────────────────────────────

export interface SanitizedSource {
  /** Copia de trabajo JPEG sRGB (≤ 2048 px, sin metadatos). */
  bytes: Buffer
  width: number
  height: number
  original: { mime: AssetMimeType; width: number; height: number; byteSize: number; sha256: string }
}

const SHARP_FORMAT: Record<AssetMimeType, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }

export async function sanitizeTextureSource(input: Uint8Array): Promise<SanitizedSource> {
  const L = TEXTURE_PIPELINE_LIMITS
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (bytes.length === 0) throw new TextureRejected('format', 'Archivo vacío.')
  if (bytes.length > L.maxBytes) throw new TextureRejected('too_large', 'La foto pesa más de 10 MB.')
  const sniffed = sniffImage(bytes)
  if (!sniffed) throw new TextureRejected('format', 'No es una imagen PNG, JPG o WEBP.')
  if (sniffed.animated) throw new TextureRejected('animated', 'Las imágenes animadas no sirven como textura.')
  if (sniffed.width > L.maxSide || sniffed.height > L.maxSide || sniffed.width * sniffed.height > L.maxPixels) {
    throw new TextureRejected('too_many_pixels', 'La foto tiene demasiados píxeles.')
  }
  if (Math.min(sniffed.width, sniffed.height) < L.minSide) throw new TextureRejected('too_small', 'La foto es demasiado chica.')

  const open = () =>
    sharp(bytes, { failOn: 'error', limitInputPixels: L.maxPixels, animated: false, pages: 1, sequentialRead: true }).timeout({ seconds: L.timeoutSeconds })
  let meta: Metadata
  try {
    meta = await open().metadata()
  } catch {
    throw new TextureRejected('decode', 'No pudimos leer la imagen.')
  }
  // El decodificador debe coincidir con lo que dicen los bytes (un políglota no cambia de tipo).
  if (meta.format !== SHARP_FORMAT[sniffed.mime]) throw new TextureRejected('format', 'El contenido no coincide con su formato.')
  if ((meta.pages ?? 1) !== 1) throw new TextureRejected('animated', 'Las imágenes de varias páginas no sirven como textura.')
  if (!meta.width || !meta.height || meta.width * meta.height > L.maxPixels) throw new TextureRejected('too_many_pixels', 'La foto tiene demasiados píxeles.')
  if ((meta.channels ?? 3) > 4) throw new TextureRejected('format', 'Formato de color no admitido.')

  try {
    const { data, info } = await open()
      .autoOrient()
      .resize({ width: L.workSide, height: L.workSide, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .jpeg({ quality: 93, chromaSubsampling: '4:4:4' })
      .toBuffer({ resolveWithObject: true })
    return {
      bytes: data,
      width: info.width,
      height: info.height,
      original: {
        mime: sniffed.mime,
        width: meta.autoOrient?.width ?? meta.width,
        height: meta.autoOrient?.height ?? meta.height,
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    }
  } catch {
    throw new TextureRejected('decode', 'No pudimos leer la imagen completa (¿archivo cortado?).')
  }
}

// ── Etapa 2: tesela ──────────────────────────────────────────────────────────

export interface ProcessedTexture {
  tile: Buffer
  thumb: Buffer
  before: Buffer
  finish: TextureFinish
  scaleMm: number
  /** Color plano de respaldo (promedio en luz lineal: lo que se ve de lejos). */
  hex: string
  analysis: TextureAnalysis
  stats: SurfaceStats
  grain: GrainEstimate
  warnings: TextureWarningCode[]
}

const DIRECTIONAL: ReadonlySet<TextureFinish> = new Set(['woodgrain', 'metallic'])
/** Coherencia mínima para enderezar sola la veta (heurística de la investigación, algo más estricta). */
const AUTO_ROTATE_COHERENCE = 0.28

function clampCrop(crop: TextureCrop | undefined, width: number, height: number): { left: number; top: number; side: number; crop: TextureCrop } {
  if (crop) {
    const left = Math.max(0, Math.min(width - 1, Math.round(crop.x * width)))
    const top = Math.max(0, Math.min(height - 1, Math.round(crop.y * height)))
    const w = Math.max(1, Math.min(width - left, Math.round(crop.width * width)))
    const h = Math.max(1, Math.min(height - top, Math.round(crop.height * height)))
    // La tesela es cuadrada: el mayor cuadrado centrado dentro del recorte (nunca estirar la veta).
    const side = Math.max(16, Math.min(w, h))
    const l = Math.max(0, Math.min(width - side, left + Math.round((w - side) / 2)))
    const t = Math.max(0, Math.min(height - side, top + Math.round((h - side) / 2)))
    return { left: l, top: t, side: Math.min(side, width, height), crop: normalized(l, t, side, width, height) }
  }
  // Sin recorte: el centro (92 % del lado menor) evita bordes con viñeta, juntas o la mesa.
  const side = Math.max(16, Math.round(Math.min(width, height) * 0.92))
  const left = Math.round((width - side) / 2)
  const top = Math.round((height - side) / 2)
  return { left, top, side, crop: normalized(left, top, side, width, height) }
}

function normalized(left: number, top: number, side: number, width: number, height: number): TextureCrop {
  const r = (v: number) => Math.round(v * 10_000) / 10_000
  return { x: r(left / width), y: r(top / height), width: r(side / width), height: r(side / height) }
}

async function rawRgb(pipeline: Sharp): Promise<RgbImage> {
  const { data, info } = await pipeline.removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
}

function fromRaw(img: RgbImage): Sharp {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
    raw: { width: img.width, height: img.height, channels: 3 },
  }).timeout({ seconds: TEXTURE_PIPELINE_LIMITS.timeoutSeconds })
}

async function encodeTile(img: RgbImage): Promise<Buffer> {
  const L = TEXTURE_PIPELINE_LIMITS
  let tile = await fromRaw(img).webp({ quality: 88, effort: 5, smartSubsample: true }).toBuffer()
  if (tile.length > L.tileBudgetBytes) tile = await fromRaw(img).webp({ quality: 78, effort: 5, smartSubsample: true }).toBuffer()
  return tile
}

/** Fracción de píxeles quemados (casi blancos) o empastados (casi negros). */
function clippedFraction(img: RgbImage): { bright: number; dark: number } {
  const n = img.width * img.height
  let bright = 0
  let dark = 0
  for (let j = 0; j < img.data.length; j += 3) {
    const r = img.data[j]!
    const g = img.data[j + 1]!
    const b = img.data[j + 2]!
    if (r >= 252 && g >= 252 && b >= 252) bright++
    else if (r <= 4 && g <= 4 && b <= 4) dark++
  }
  return { bright: bright / n, dark: dark / n }
}

export async function processTexture(source: SanitizedSource, options: TextureProcessOptions = {}): Promise<ProcessedTexture> {
  const L = TEXTURE_PIPELINE_LIMITS
  const warnings = new Set<TextureWarningCode>()
  const open = () => sharp(source.bytes, { failOn: 'error', limitInputPixels: L.maxPixels }).timeout({ seconds: L.timeoutSeconds })
  const { left, top, side, crop } = clampCrop(options.crop, source.width, source.height)
  const region = await rawRgb(open().extract({ left, top, width: side, height: side }))

  // Análisis sobre ≤ 512 px: suficiente para la veta y rápido.
  const analysis = side > L.tilePx ? await rawRgb(fromRaw(region).resize(L.tilePx, L.tilePx, { kernel: 'lanczos3' })) : region
  const grain = estimateGrain(toLinear(analysis))
  const stats = surfaceStats(analysis)
  const finishDetected = guessFinish(stats, grain)
  const finish = options.finish ?? finishDetected
  const directional = DIRECTIONAL.has(finish)

  let rotation = 0
  let autoRotated = false
  if (typeof options.rotationDeg === 'number' && Number.isFinite(options.rotationDeg)) {
    rotation = Math.round(options.rotationDeg * 100) / 100
  } else if (options.autoRotate !== false && directional && grain.coherence >= AUTO_ROTATE_COHERENCE) {
    rotation = rotationForGrain(grain.angleDeg)
    autoRotated = rotation !== 0
  }
  if (directional && grain.coherence < AUTO_ROTATE_COHERENCE && options.rotationDeg === undefined) warnings.add('grain_unclear')

  // Giro: múltiplos de 90° sin pérdida; otros ángulos, recorte del mayor cuadrado sin esquinas vacías.
  let square: RgbImage = region
  const quarter = ((rotation % 360) + 360) % 360
  if (rotation !== 0 && quarter % 90 === 0) {
    square = await rawRgb(fromRaw(region).rotate(quarter))
  } else if (rotation !== 0) {
    const rotated = await rawRgb(fromRaw(region).rotate(rotation, { background: '#808080' }))
    const valid = Math.max(16, validRotatedSquare(side, rotation) - 2)
    square = await rawRgb(
      fromRaw(rotated).extract({
        left: Math.max(0, Math.floor((rotated.width - valid) / 2)),
        top: Math.max(0, Math.floor((rotated.height - valid) / 2)),
        width: Math.min(valid, rotated.width),
        height: Math.min(valid, rotated.height),
      }),
    )
  }
  if (Math.min(square.width, square.height) < L.lowResSide) warnings.add('low_resolution')

  const seam: TextureSeamMethod = options.seam ?? 'feather'
  // Fundido: se trabaja a 640 px para tener material de sobra alrededor de la ventana periódica.
  const workPx = seam === 'mirror' ? L.tilePx / 2 : Math.round(L.tilePx * 1.25)
  const prepared = await rawRgb(fromRaw(square).resize(workPx, workPx, { kernel: 'lanczos3', fit: 'cover' }))
  const clipped = clippedFraction(prepared)
  if (clipped.bright > 0.06 || clipped.dark > 0.25) warnings.add('exposure')

  const flat = flattenIllumination(toLinear(prepared))
  if (flat.variation > 0.3) warnings.add('uneven_light')
  const palette = extractPalette(flat.image)

  let tileRgb: RgbImage
  if (seam === 'mirror') {
    tileRgb = toSrgb(mirrorTile(flat.image))
  } else {
    const band = directional ? 40 : 32
    const win = findPeriodicWindow(flat.image, band)
    const periodic = toSrgb(periodicTile(flat.image, win, band))
    const sized = await rawRgb(fromRaw(periodic).resize(L.tilePx, L.tilePx, { kernel: 'lanczos3', fit: 'fill' }))
    // El remuestreo toca 1–2 px del borde: un fundido mínimo garantiza bordes que empalman.
    tileRgb = toSrgb(featherSeams(toLinear(sized), 3, 3))
  }
  const score = seamScore(tileRgb)
  if (seam === 'feather' && score > 2.2) warnings.add('seam_visible')

  const tile = await encodeTile(tileRgb)
  const thumb = await fromRaw(tileRgb).resize(L.thumbPx, L.thumbPx, { kernel: 'lanczos3' }).webp({ quality: 82, effort: 4 }).toBuffer()
  const before = await fromRaw(region).resize(L.beforePx, L.beforePx, { kernel: 'lanczos3' }).webp({ quality: 80, effort: 4 }).toBuffer()

  return {
    tile,
    thumb,
    before,
    finish,
    scaleMm: options.scaleMm ?? DEFAULT_SCALE_MM[finish],
    hex: palette.average,
    analysis: {
      source: { width: source.original.width, height: source.original.height, mime: source.original.mime },
      crop,
      grainAngleDeg: grain.angleDeg,
      coherence: grain.coherence,
      rotatedDeg: rotation,
      autoRotated,
      finishDetected,
      illuminationCorrected: flat.corrected,
      seam,
      seamScore: score,
      palette,
    },
    stats,
    grain,
    warnings: [...warnings],
  }
}
