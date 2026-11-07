/**
 * Imágenes para el modelo: siempre JPEG reducido. Una foto de teléfono pesa 20 veces lo necesario
 * para leer un plano, y la reducción la paga el navegador, no la red.
 */
import { ATTACHMENT_LIMITS } from '@dekopen/shared'

/** Lado mayor: suficiente para leer letra a mano en una hoja completa. */
export const MAX_EDGE = 1800
const QUALITIES = [0.82, 0.68, 0.52]

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  for (const quality of QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length <= ATTACHMENT_LIMITS.imageChars) return url
  }
  return canvas.toDataURL('image/jpeg', 0.4)
}

export function fitCanvas(width: number, height: number, maxEdge = MAX_EDGE): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  return canvas
}

/** Decodifica con el navegador (JPG, PNG, WEBP, GIF, BMP, AVIF, SVG). Falla si no lo conoce. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const width = image.naturalWidth || 1200
    const height = image.naturalHeight || 1200
    const canvas = fitCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    // El JPEG no tiene transparencia: sin esto un PNG con fondo transparente queda negro.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvasToDataUrl(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}
