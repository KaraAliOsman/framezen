/**
 * Muestras realistas de los colores del catálogo en tamaño de interfaz (12–96 px): veta de madera
 * para los foliados, grano fino para los texturizados y cepillado para los metalizados, sobre el
 * `hex` del color (que sigue siendo el respaldo).
 *
 * Es una vista previa vectorial y determinista (SVG con ruido, sin descargas ni lienzo): sirve en
 * tablas y listas, donde una tesela fotográfica no se distinguiría. Las teselas reales (biblioteca
 * de foliados y texturas subidas) las resuelve el dibujo realista en ventanas y documentos.
 */
import type { Color, ColorFinish } from '@dekopen/engine'
import { builtinTexture } from '@dekopen/catalog'
import { BUILTIN_TEXTURES as SHARED_TEXTURES } from '@dekopen/shared'

export type SwatchFinish = ColorFinish

const WOOD = /(nogal|roble|winchester|caoba|embero|colonial|anteak|lenga|wengu|madera|cerezo|pino|teca|teak|oak|walnut|mahogany|cherry|sapelli|sheffield|irish|douglas)/i
const METAL = /(metal|titanio|peltre|bronce|acero|inox|aluminio|plata|cromo|champagne|cepillado|brush)/i
const TEXTURED = /(texturad|arenad|sablé|sable|grafiato|granulad|rugos)/i

const SHARED_FINISH = new Map<string, ColorFinish>(Object.values(SHARED_TEXTURES).map((texture) => [texture.id, texture.finish]))

/** Terminación de un color: la de su textura si la tiene, o la que sugiere su nombre. */
export function swatchFinish(color: Pick<Color, 'name'> & { texture?: Color['texture'] }): SwatchFinish {
  const texture = color.texture
  if (texture?.finish) return texture.finish
  if (texture?.kind === 'builtin') {
    const finish = builtinTexture(texture.id)?.finish ?? SHARED_FINISH.get(texture.id)
    if (finish) return finish
  }
  // Un color «Antracita texturado» es texturizado aunque su nombre no diga madera.
  if (TEXTURED.test(color.name)) return 'textured'
  if (WOOD.test(color.name)) return 'woodgrain'
  if (METAL.test(color.name)) return 'metallic'
  return 'smooth'
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace('#', '')
  const full = m.length === 3 ? m.replace(/./g, (c) => c + c) : m
  if (!/^[\da-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** Mezcla con negro (amount < 0) o blanco (amount > 0), en 0–1. */
function shade(rgb: [number, number, number], amount: number): [number, number, number] {
  const target = amount < 0 ? 0 : 255
  const k = Math.abs(amount)
  return rgb.map((c) => clampByte(c + (target - c) * k)) as [number, number, number]
}

function unit(rgb: [number, number, number]): string {
  return rgb.map((c) => (c / 255).toFixed(3)).join(' ')
}

/** Semilla estable por color: dos maderas distintas no repiten el mismo dibujo. */
function seedOf(text: string): number {
  let hash = 7
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return (hash % 97) + 1
}

/** Capa de ruido teñida: el canal rojo del ruido pasa a ser la opacidad del color dado. */
function noiseLayer(id: string, freq: string, octaves: number, seed: number, rgb: [number, number, number], gain: number, offset: number, opacity: number): string {
  const [r, g, b] = unit(rgb).split(' ')
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${gain} 0 0 0 ${offset}"/>` +
    `</filter><rect width="96" height="96" filter="url(#${id})" opacity="${opacity}"/>`
  )
}

const cache = new Map<string, string | undefined>()

/**
 * Imagen (data URL SVG) de la muestra de un color, o `undefined` para los lisos (se ven con su
 * color plano y el brillo de canto de `ColorSwatch`).
 */
export function swatchImage(color: Pick<Color, 'id' | 'name' | 'hex'> & { texture?: Color['texture'] }): string | undefined {
  const finish = swatchFinish(color)
  if (finish === 'smooth') return undefined
  const key = `${color.hex}|${finish}|${color.id}`
  if (cache.has(key)) return cache.get(key)
  const rgb = parseHex(color.hex)
  if (!rgb) {
    cache.set(key, undefined)
    return undefined
  }
  const seed = seedOf(color.id || color.name)
  const base = `<rect width="96" height="96" fill="rgb(${rgb.join(',')})"/>`
  let layers = ''
  if (finish === 'woodgrain') {
    // Figura de la veta (larga en horizontal), poros finos y vetas claras: como un foliado laminado.
    layers =
      noiseLayer('f', '0.006 0.16', 4, seed, shade(rgb, -0.42), 2.6, -1.05, 0.85) +
      noiseLayer('p', '0.04 0.9', 2, seed + 3, shade(rgb, -0.55), 2.2, -1.0, 0.5) +
      noiseLayer('l', '0.01 0.28', 3, seed + 7, shade(rgb, 0.22), 2.4, -1.05, 0.55)
  } else if (finish === 'textured') {
    layers = noiseLayer('d', '0.85', 2, seed, shade(rgb, -0.35), 2.4, -0.95, 0.55) + noiseLayer('l', '0.7', 2, seed + 5, shade(rgb, 0.25), 2.2, -0.95, 0.4)
  } else {
    // Cepillado: líneas finas horizontales y un brillo suave de arriba a la izquierda.
    layers =
      noiseLayer('b', '0.003 1.1', 2, seed, shade(rgb, 0.35), 2.2, -0.85, 0.55) +
      noiseLayer('k', '0.004 0.9', 2, seed + 9, shade(rgb, -0.3), 2.2, -0.9, 0.45) +
      `<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient><rect width="96" height="96" fill="url(#s)"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" preserveAspectRatio="none">${base}${layers}</svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  cache.set(key, url)
  return url
}
