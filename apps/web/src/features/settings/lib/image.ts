/**
 * Utilidades de imagen para el logo: detectar dónde está el dibujo (para recortar márgenes),
 * quitar el fondo blanco y exportar liviano (≤ 1 MB, el límite del servidor).
 * Las funciones de píxeles son puras (se prueban sin navegador).
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** ¿El píxel es «fondo»? Transparente o casi blanco. */
function isBackground(data: Uint8ClampedArray, i: number, threshold: number, alphaMin: number): boolean {
  const a = data[i + 3]
  if (a < alphaMin) return true
  return data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold
}

/**
 * Caja que contiene el dibujo (todo lo que no es blanco ni transparente). null si la imagen
 * está vacía. `pad` agrega aire alrededor (en px), sin salirse de la imagen.
 */
export function contentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  { threshold = 244, alphaMin = 16, pad = 0 }: { threshold?: number; alphaMin?: number; pad?: number } = {},
): Box | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBackground(data, (y * width + x) * 4, threshold, alphaMin)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  return { x, y, w: Math.min(width, maxX + 1 + pad) - x, h: Math.min(height, maxY + 1 + pad) - y }
}

/**
 * Vuelve transparente el fondo blanco, con un borde suave para no dejar halos (JPG).
 * Modifica `data` en el lugar.
 */
export function whiteToAlpha(data: Uint8ClampedArray, { threshold = 236, soft = 14 }: { threshold?: number; soft?: number } = {}): void {
  for (let i = 0; i < data.length; i += 4) {
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    if (min >= threshold + soft) data[i + 3] = 0
    else if (min > threshold) data[i + 3] = Math.round(data[i + 3] * (1 - (min - threshold) / soft))
  }
}

/** Ajusta (w, h) para que el lado mayor no pase de `max`, manteniendo la proporción. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= max && h <= max) return { w: Math.round(w), h: Math.round(h) }
  const k = max / Math.max(w, h)
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** Mantiene la caja dentro de la imagen y con un tamaño mínimo. */
export function clampBox(box: Box, width: number, height: number, min = 8): Box {
  const w = Math.min(width, Math.max(min, box.w))
  const h = Math.min(height, Math.max(min, box.h))
  const x = Math.min(width - w, Math.max(0, box.x))
  const y = Math.min(height - h, Math.max(0, box.y))
  return { x, y, w, h }
}

/** Bytes reales de un data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return dataUrl.length
  const meta = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (meta.endsWith(';base64')) return Math.floor((payload.replace(/=+$/, '').length * 3) / 4)
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).length
  } catch {
    return payload.length
  }
}

export const MAX_LOGO_BYTES = 1024 * 1024

// ── Navegador ────────────────────────────────────────────────────────────────

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('No pudimos leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No pudimos abrir esa imagen.'))
    img.src = src
  })
}

/** Caja del dibujo en coordenadas de la imagen original (analiza una copia reducida). */
export function detectContent(img: HTMLImageElement): Box {
  const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
  try {
    const size = fitWithin(img.naturalWidth, img.naturalHeight, 600)
    const canvas = document.createElement('canvas')
    canvas.width = size.w
    canvas.height = size.h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return full
    ctx.drawImage(img, 0, 0, size.w, size.h)
    const box = contentBounds(ctx.getImageData(0, 0, size.w, size.h).data, size.w, size.h, { pad: 2 })
    if (!box) return full
    const kx = img.naturalWidth / size.w
    const ky = img.naturalHeight / size.h
    return clampBox(
      { x: Math.floor(box.x * kx), y: Math.floor(box.y * ky), w: Math.ceil(box.w * kx), h: Math.ceil(box.h * ky) },
      img.naturalWidth,
      img.naturalHeight,
    )
  } catch {
    return full
  }
}

/** Recorta, opcionalmente quita el blanco, y exporta un PNG (o WEBP si el PNG pesa demasiado). */
export function exportLogo(img: HTMLImageElement, crop: Box, { removeWhite = false, maxSide = 900 } = {}): string {
  let side = maxSide
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = fitWithin(crop.w, crop.h, side)
    const canvas = document.createElement('canvas')
    canvas.width = size.w
    canvas.height = size.h
    const ctx = canvas.getContext('2d', { willReadFrequently: removeWhite })
    if (!ctx) return img.src
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, size.w, size.h)
    if (removeWhite) {
      const pixels = ctx.getImageData(0, 0, size.w, size.h)
      whiteToAlpha(pixels.data)
      ctx.putImageData(pixels, 0, 0)
    }
    const png = canvas.toDataURL('image/png')
    if (dataUrlBytes(png) <= MAX_LOGO_BYTES * 0.92) return png
    const webp = canvas.toDataURL('image/webp', 0.9)
    if (webp.startsWith('data:image/webp') && dataUrlBytes(webp) <= MAX_LOGO_BYTES * 0.92) return webp
    side = Math.round(side * 0.7)
  }
  return img.src
}
