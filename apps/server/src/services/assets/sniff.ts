/**
 * Reconoce imágenes por sus bytes (nunca por la extensión ni el Content-Type declarado) y lee sus
 * dimensiones del encabezado, sin decodificar: PNG, JPEG y WebP. Rechaza animaciones (APNG,
 * WebP animado) y cualquier otro formato (SVG, GIF, HTML disfrazado…).
 */
import type { AssetMimeType } from '@dekopen/shared'

export interface SniffedImage {
  mime: AssetMimeType
  width: number
  height: number
  animated: boolean
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!
}
function u24le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)
}
function ascii(b: Uint8Array, o: number, n: number): string {
  let s = ''
  for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]!)
  return s
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function sniffPng(b: Uint8Array): SniffedImage | null {
  if (b.length < 33 || !PNG_SIGNATURE.every((v, i) => b[i] === v)) return null
  if (ascii(b, 12, 4) !== 'IHDR') return null
  const width = u32be(b, 16)
  const height = u32be(b, 20)
  // APNG: chunk acTL antes de IDAT.
  let animated = false
  let offset = 8
  while (offset + 8 <= b.length) {
    const length = u32be(b, offset)
    const type = ascii(b, offset + 4, 4)
    if (type === 'acTL') animated = true
    if (type === 'IDAT' || type === 'IEND') break
    offset += 12 + length
  }
  return { mime: 'image/png', width, height, animated }
}

function sniffJpeg(b: Uint8Array): SniffedImage | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null
  let offset = 2
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = b[offset + 1]!
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break
    const length = u16be(b, offset + 2)
    // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = u16be(b, offset + 5)
      const width = u16be(b, offset + 7)
      return { mime: 'image/jpeg', width, height, animated: false }
    }
    if (length < 2) break
    offset += 2 + length
  }
  return null
}

function sniffWebp(b: Uint8Array): SniffedImage | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ') {
    // Fotograma clave: 3 bytes de etiqueta + 3 de firma (9d 01 2a) + ancho/alto de 14 bits.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return { mime: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, animated: false }
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, animated: false }
  }
  if (chunk === 'VP8X') {
    const flags = b[20]!
    return { mime: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, animated: (flags & 0x02) !== 0 }
  }
  return null
}

function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8)
}

/** Imagen reconocida por sus bytes, o null si no es PNG/JPEG/WebP válido. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const found = sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes)
  if (!found || !(found.width > 0) || !(found.height > 0)) return null
  return found
}

const DATA_URL = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/]+=*)$/

/** Decodifica un data URL base64 de imagen (sin confiar en el tipo declarado). */
export function decodeImageDataUrl(dataUrl: string): { declared: string; bytes: Buffer } | null {
  const match = DATA_URL.exec(dataUrl.trim())
  if (!match) return null
  return { declared: match[1] === 'image/jpg' ? 'image/jpeg' : match[1]!, bytes: Buffer.from(match[2]!, 'base64') }
}
