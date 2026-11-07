/** Imágenes sintéticas para las pruebas de texturas (sin archivos binarios en el repositorio). */
import type { RgbImage } from '../src/services/textures/image'

/** Veta sintética: bandas a un ángulo (horario, y hacia abajo), con ondulación y ruido determinista. */
export function woodImage(w: number, h: number, angleDeg: number, options: { period?: number; gradient?: number; seed?: number } = {}): RgbImage {
  const data = new Uint8Array(w * h * 3)
  const a = (angleDeg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const k = (2 * Math.PI) / (options.period ?? 22)
  let seed = options.seed ?? 11
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const across = -x * sa + y * ca
      const along = x * ca + y * sa
      const ring = 0.5 + 0.5 * Math.sin(across * k + Math.sin(along * 0.012) * 1.6)
      const light = 0.66 + 0.24 * ring - rnd() * 0.06 + (options.gradient ?? 0) * (x / w - 0.5)
      const i = (y * w + x) * 3
      data[i] = Math.max(0, Math.min(255, 196 * light))
      data[i + 1] = Math.max(0, Math.min(255, 128 * light))
      data[i + 2] = Math.max(0, Math.min(255, 62 * light))
    }
  }
  return { width: w, height: h, data }
}


/**
 * Veta suave como en una foto real de PVC foliado o madera de poro fino: bandas anchas de poco
 * contraste y casi sin ruido (poco detalle de alta frecuencia, pero dirección y estructura claras).
 */
export function softWoodImage(w: number, h: number, options: { period?: number; contrast?: number; base?: [number, number, number] } = {}): RgbImage {
  const data = new Uint8Array(w * h * 3)
  const k = (2 * Math.PI) / (options.period ?? 70)
  const amp = options.contrast ?? 0.12
  const [r, g, b] = options.base ?? [176, 120, 70]
  let seed = 7
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ring = 0.5 + 0.5 * Math.sin(y * k + Math.sin(x * 0.01) * 2.2 + 0.6 * Math.sin(y * k * 0.37))
      const light = 1 - amp + amp * ring + (rnd() - 0.5) * 0.01
      const i = (y * w + x) * 3
      data[i] = Math.max(0, Math.min(255, r * light))
      data[i + 1] = Math.max(0, Math.min(255, g * light))
      data[i + 2] = Math.max(0, Math.min(255, b * light))
    }
  }
  return { width: w, height: h, data }
}

/** Liso con degradé de iluminación (sin ruido: las bandas de 8 bits no son veta). */
export function smoothRampImage(w: number, h: number, base: [number, number, number] = [200, 180, 160]): RgbImage {
  const data = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const light = 1 + 0.3 * (x / w - 0.5)
      const i = (y * w + x) * 3
      data[i] = Math.max(0, Math.min(255, base[0] * light))
      data[i + 1] = Math.max(0, Math.min(255, base[1] * light))
      data[i + 2] = Math.max(0, Math.min(255, base[2] * light))
    }
  }
  return { width: w, height: h, data }
}
