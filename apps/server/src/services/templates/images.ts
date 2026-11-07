/**
 * Imágenes de documentos (portada con foto, galerías, quiénes somos). Se reconocen por sus bytes
 * (PNG, JPEG o WebP; nunca SVG ni animaciones), se vuelven a codificar con sharp (orientación
 * corregida, sRGB, sin metadatos EXIF/GPS, máximo 2400 px por lado) y se guardan como assets
 * `document_image` de la organización. Las plantillas sólo las nombran por id; el renderizador las
 * recibe como data URL (Chromium no sale a la red).
 */
import sharp from 'sharp'
import type { AssetRecord, AssetStore } from '../assets'
import { decodeImageDataUrl, sniffImage } from '../assets'
import { HttpError, apiError } from '../../lib/errors'

/** Lado mayor de la imagen guardada (≈ 300 ppi en media página A4). */
export const DOCUMENT_IMAGE_MAX_SIDE = 2400
/** Miniatura que viaja en los listados (dentro de `meta.thumb`). */
export const DOCUMENT_IMAGE_THUMB_SIDE = 320
/** Imagen original máxima aceptada (antes de recomprimir). */
export const DOCUMENT_IMAGE_MAX_INPUT_BYTES = 4 * 1024 * 1024
const MAX_INPUT_PIXELS = 24_000_000

export interface DocumentImage {
  id: string
  name: string | null
  width: number | null
  height: number | null
  byteSize: number
  mime: string
  /** Miniatura JPEG (data URL, ~10–20 KB) para la galería del editor. */
  thumb?: string
  createdAt: string
}

export function toDocumentImage(asset: AssetRecord): DocumentImage {
  const thumb = typeof asset.meta?.thumb === 'string' && asset.meta.thumb.startsWith('data:image/jpeg;base64,') ? asset.meta.thumb : undefined
  return {
    id: asset.id,
    name: asset.name,
    width: asset.width,
    height: asset.height,
    byteSize: asset.byteSize,
    mime: asset.mime,
    ...(thumb ? { thumb } : {}),
    createdAt: asset.createdAt.toISOString(),
  }
}

export interface ProcessedImage {
  bytes: Buffer
  mime: 'image/jpeg' | 'image/webp'
  thumb: string
  width: number
  height: number
}

/** Valida y recodifica una imagen subida. Lanza 415/413 con códigos estables. */
export async function processDocumentImage(dataUrl: string): Promise<ProcessedImage> {
  const decoded = decodeImageDataUrl(dataUrl)
  if (!decoded) throw apiError(415, 'asset_unsupported')
  if (decoded.bytes.length > DOCUMENT_IMAGE_MAX_INPUT_BYTES) throw apiError(413, 'asset_too_large', { extra: { maxBytes: DOCUMENT_IMAGE_MAX_INPUT_BYTES } })
  const sniffed = sniffImage(decoded.bytes)
  if (!sniffed || sniffed.animated) throw apiError(415, 'asset_unsupported')
  if (sniffed.width * sniffed.height > MAX_INPUT_PIXELS) throw apiError(413, 'asset_too_large', { extra: { maxPixels: MAX_INPUT_PIXELS } })
  try {
    const source = sharp(decoded.bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false })
    const meta = await source.metadata()
    if ((meta.pages ?? 1) > 1) throw apiError(415, 'asset_unsupported')
    const base = source.rotate().resize({ width: DOCUMENT_IMAGE_MAX_SIDE, height: DOCUMENT_IMAGE_MAX_SIDE, fit: 'inside', withoutEnlargement: true }).toColorspace('srgb')
    const alpha = Boolean(meta.hasAlpha)
    const encoded = alpha ? base.webp({ quality: 86 }) : base.jpeg({ quality: 84, mozjpeg: true })
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true })
    const thumbBuffer = await sharp(data)
      .resize({ width: DOCUMENT_IMAGE_THUMB_SIDE, height: DOCUMENT_IMAGE_THUMB_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer()
    return {
      bytes: data,
      mime: alpha ? 'image/webp' : 'image/jpeg',
      thumb: `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`,
      width: info.width,
      height: info.height,
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw apiError(415, 'asset_unsupported')
  }
}

/** Sube una imagen de documento ya validada a la organización. */
export async function putDocumentImage(store: AssetStore, input: { orgId: string; userId: string; dataUrl: string; name?: string | null }): Promise<{ image: DocumentImage; duplicate: boolean }> {
  const processed = await processDocumentImage(input.dataUrl)
  const { asset, duplicate } = await store.put({
    orgId: input.orgId,
    kind: 'document_image',
    bytes: processed.bytes,
    name: input.name ?? null,
    meta: { thumb: processed.thumb },
    createdBy: input.userId,
  })
  return { image: toDocumentImage(asset), duplicate }
}
