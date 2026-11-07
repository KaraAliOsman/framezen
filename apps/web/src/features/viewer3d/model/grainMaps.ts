/**
 * Relieve del foliado: un normal map derivado de la misma tesela que da el color, para que la luz siga la
 * veta que se ve (y no otra). Se calcula una vez por foliado, en el navegador y sin descargas.
 */

/** Convierte alturas (luminancia de una imagen RGBA) en normales de espacio tangente. La tesela se repite: los bordes dan la vuelta. */
export function heightToNormal(rgba: Uint8ClampedArray, width: number, height: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  const heightAt = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const j = i * 4
    heightAt[i] = (0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]) / 255
  }
  for (let y = 0; y < height; y++) {
    const up = ((y - 1 + height) % height) * width
    const down = ((y + 1) % height) * width
    const row = y * width
    for (let x = 0; x < width; x++) {
      const left = (x - 1 + width) % width
      const right = (x + 1) % width
      // Sobel: la derivada en x usa la fila vecina, así un píxel suelto no se vuelve ruido.
      const dx = heightAt[up + right] + 2 * heightAt[row + right] + heightAt[down + right] - heightAt[up + left] - 2 * heightAt[row + left] - heightAt[down + left]
      const dy = heightAt[down + left] + 2 * heightAt[down + x] + heightAt[down + right] - heightAt[up + left] - 2 * heightAt[up + x] - heightAt[up + right]
      // v crece hacia arriba y la imagen hacia abajo: la pendiente en y cambia de signo.
      const nx = -dx * strength
      const ny = dy * strength
      const length = Math.hypot(nx, ny, 1)
      const i = (row + x) * 4
      out[i] = ((nx / length) * 0.5 + 0.5) * 255
      out[i + 1] = ((ny / length) * 0.5 + 0.5) * 255
      out[i + 2] = ((1 / length) * 0.5 + 0.5) * 255
      out[i + 3] = 255
    }
  }
  return out
}

const MAX_SIDE = 768
const CACHE_LIMIT = 6
const cache = new Map<string, HTMLCanvasElement>()

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Normal map de una tesela ya decodificada; null si el navegador no deja leerla. */
export function normalMapFromImage(key: string, image: HTMLImageElement, strength: number): HTMLCanvasElement | null {
  const hit = cache.get(key)
  if (hit) return hit
  const naturalW = image.naturalWidth || image.width
  const naturalH = image.naturalHeight || image.height
  if (!(naturalW > 0 && naturalH > 0) || typeof document === 'undefined') return null
  const scale = Math.min(1, MAX_SIDE / Math.max(naturalW, naturalH))
  const width = Math.max(4, Math.round(naturalW * scale))
  const height = Math.max(4, Math.round(naturalH * scale))
  const source = canvasOf(width, height)
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  try {
    context.drawImage(image, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height)
    const normals = heightToNormal(pixels.data, width, height, strength)
    pixels.data.set(normals)
    context.putImageData(pixels, 0, 0)
  } catch {
    return null
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  cache.set(key, source)
  return source
}
