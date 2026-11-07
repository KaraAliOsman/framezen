import { DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, LinearFilter, LinearSRGBColorSpace, RGBAFormat } from 'three'

/**
 * Estudio fotográfico calculado aquí mismo: un mapa equirectangular HDR (valores por encima de 1) sin
 * archivos ni red. Cielo claro que baja a un piso cálido, softbox cenital, un key lateral y dos paños de
 * luz muy difusos al frente y atrás. Todo con bordes anchos: lo que el vidrio refleja es un degradado de
 * cielo, nunca una franja recortada.
 */

interface Light {
  /** Azimut (rad): 0 = +Z, positivo hacia +X. */
  az: number
  /** Elevación (rad). */
  el: number
  halfW: number
  halfH: number
  /** Inclinación del borde: cuánto corre el azimut por radián de elevación. */
  skew: number
  power: number
  color: [number, number, number]
  soft: number
}

const deg = (value: number) => (value * Math.PI) / 180
const WARM: [number, number, number] = [1, 0.97, 0.92]
const COOL: [number, number, number] = [0.92, 0.96, 1]
const WHITE: [number, number, number] = [1, 1, 1]

/** Paño de luz difuso: un ventanal grande visto desenfocado. */
function softWindow(center: number): Light[] {
  return [{ az: center + deg(-24), el: deg(18), halfW: deg(26), halfH: deg(34), skew: 0, power: 2.6, color: COOL, soft: deg(26) }]
}

export const STUDIO_LIGHTS: Light[] = [
  { az: 0, el: deg(78), halfW: deg(180), halfH: deg(20), skew: 0, power: 2.4, color: WHITE, soft: deg(8) },
  { az: deg(-68), el: deg(26), halfW: deg(22), halfH: deg(24), skew: 0, power: 3.5, color: WARM, soft: deg(5) },
  { az: deg(68), el: deg(16), halfW: deg(18), halfH: deg(26), skew: 0, power: 1.6, color: COOL, soft: deg(6) },
  { az: deg(-112), el: deg(26), halfW: deg(22), halfH: deg(24), skew: 0, power: 3, color: WARM, soft: deg(5) },
  { az: deg(112), el: deg(16), halfW: deg(18), halfH: deg(26), skew: 0, power: 1.5, color: COOL, soft: deg(6) },
  ...softWindow(0),
  ...softWindow(Math.PI),
]

function smooth(edge: number, soft: number): number {
  // edge < 0 = dentro del rectángulo.
  const t = Math.min(1, Math.max(0, 0.5 - edge / (2 * soft)))
  return t * t * (3 - 2 * t)
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/** Radiancia (lineal) del estudio en una dirección. */
export function studioRadiance(az: number, el: number, out: [number, number, number]): void {
  // Fondo: gris neutro con el techo más claro y el piso un poco cálido.
  const up = Math.sin(el)
  const sky = up > 0 ? 0.62 + up * 0.55 : 0.62 + up * 0.42
  out[0] = sky * (up > 0 ? 0.98 : 1.04)
  out[1] = sky
  out[2] = sky * (up > 0 ? 1.03 : 0.94)
  for (const light of STUDIO_LIGHTS) {
    const dEl = el - light.el
    const inH = smooth(Math.abs(dEl) - light.halfH, light.soft)
    if (inH <= 0) continue
    const dAz = wrap(az - light.az - dEl * light.skew)
    const inW = light.halfW >= Math.PI ? 1 : smooth(Math.abs(dAz) - light.halfW, light.soft)
    const amount = inH * inW * light.power
    if (amount <= 0) continue
    out[0] += amount * light.color[0]
    out[1] += amount * light.color[1]
    out[2] += amount * light.color[2]
  }
}

/** Mapa RGBA lineal de `width` × `width/2`, en Float32 (puro, sin WebGL). */
export function generateStudioPixels(width: number): { data: Float32Array; width: number; height: number } {
  const height = Math.round(width / 2)
  const data = new Float32Array(width * height * 4)
  const color: [number, number, number] = [0, 0, 0]
  for (let y = 0; y < height; y++) {
    // Fila 0 = abajo: el DataTexture de three no invierte.
    const el = ((y + 0.5) / height - 0.5) * Math.PI
    for (let x = 0; x < width; x++) {
      const az = ((x + 0.5) / width - 0.5) * 2 * Math.PI
      studioRadiance(az, el, color)
      const i = (y * width + x) * 4
      data[i] = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = 1
    }
  }
  return { data, width, height }
}

/** Textura lista para `PMREMGenerator.fromEquirectangular`. Quien la pide la libera. */
export function createStudioTexture(width: number): DataTexture {
  const pixels = generateStudioPixels(width)
  const half = new Uint16Array(pixels.data.length)
  for (let i = 0; i < half.length; i++) half[i] = DataUtils.toHalfFloat(Math.min(pixels.data[i], 60))
  const texture = new DataTexture(half, pixels.width, pixels.height, RGBAFormat, HalfFloatType)
  texture.mapping = EquirectangularReflectionMapping
  texture.colorSpace = LinearSRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}
