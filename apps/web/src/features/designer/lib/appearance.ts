/**
 * Muestras de color realistas para los selectores del diseñador: un foliado con veta nunca se
 * muestra como un punto plano. Resuelve cada color del catálogo a `{ hex, image?, finish }` con el
 * **mismo resolvedor del dibujo** (`resolveColorAppearance` de @dekopen/documents), así la muestra y
 * la ventana dibujada con ese color son el mismo foliado:
 *
 * - textura subida (TEXUP): la tesela servida por `/api/textures/:id/image` (misma sesión, nosniff);
 * - foliado integrado (por `Color.texture`, por nombre — «Nogal», «Roble dorado», «Antracita» — o por
 *   tono): una tesela vectorial liviana (SVG en data URL) con la veta, el granulado o el cepillado de
 *   su terminación, en los tonos claro/oscuro de la biblioteca. A 32 px una foto de 512 px se ve lisa;
 *   la tesela real se usa en el dibujo y en el 3D, no en la muestra;
 * - lisos: planos, con el `hex` del catálogo (un blanco no necesita imagen).
 *
 * Las muestras se memorizan por color (mismo objeto → misma URL), así la galería no recalcula nada.
 */
import type { Color, ColorFinish } from '@dekopen/engine'
import { resolveColorAppearance } from '@dekopen/documents'
import { TEXTURE_PATHS } from '@dekopen/shared'

export interface SwatchAppearance {
  hex: string
  /** Tesela (data URL o URL de la API) para `ColorSwatch.image`. */
  image?: string
  finish: ColorFinish
  /** Color propio de la organización (ids `custom-…`). */
  custom: boolean
}

interface Palette {
  hex: string
  light: string
  dark: string
}

const HEX = /^#[0-9a-f]{6}$/i

function parse(hex: string): [number, number, number] {
  const h = HEX.test(hex) ? hex.slice(1) : 'f6f5f1'
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function channel(hex: string): string {
  return parse(hex)
    .map((v) => (v / 255).toFixed(3))
    .join(' ')
}

/** Capa de ruido coloreada (alpha = ruido). */
function noiseLayer(id: string, color: string, freq: string, octaves: number, seed: number, alpha: number, offset: number): string {
  const [r, g, b] = channel(color).split(' ')
  return (
    `<filter id='${id}' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${alpha} 0 0 0 ${offset}'/></filter>` +
    `<rect width='64' height='64' filter='url(#${id})'/>`
  )
}

/** Tesela vectorial de 64 px con la terminación (la muestra se escala a cualquier tamaño). */
export function swatchTile(finish: ColorFinish, palette: Palette): string | undefined {
  let body: string
  switch (finish) {
    case 'woodgrain':
      // Veta a lo largo (horizontal): franjas oscuras finas + vetas claras + poro fino.
      body =
        noiseLayer('a', palette.dark, '0.006 0.19', 3, 11, 2.1, -0.85) +
        noiseLayer('b', palette.light, '0.012 0.42', 2, 4, 1.8, -0.9) +
        noiseLayer('c', palette.dark, '0.05 0.9', 1, 23, 1.2, -0.62)
      break
    case 'textured':
      body = noiseLayer('a', palette.dark, '0.9', 2, 5, 1.6, -0.72) + noiseLayer('b', palette.light, '1.1', 1, 9, 1.4, -0.8)
      break
    case 'metallic':
      body = noiseLayer('a', palette.light, '0.004 0.75', 2, 3, 1.9, -0.75) + noiseLayer('b', palette.dark, '0.003 0.6', 2, 17, 1.5, -0.8)
      break
    default:
      return undefined
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><rect width='64' height='64' fill='${palette.hex}'/>${body}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const cache = new WeakMap<Color, SwatchAppearance>()

/** Apariencia de una muestra para un color del catálogo (memorizada por objeto: misma muestra → misma URL). */
export function swatchAppearance(color: Color): SwatchAppearance {
  const hit = cache.get(color)
  if (hit) return hit
  const value = resolve(color)
  cache.set(color, value)
  return value
}

function resolve(color: Color): SwatchAppearance {
  const hex = HEX.test(color.hex ?? '') ? color.hex : '#F6F5F1'
  const custom = color.id.startsWith('custom-')
  const texture = color.texture
  if (texture?.kind === 'upload' && texture.assetId) {
    return { hex, image: TEXTURE_PATHS.image(texture.assetId), finish: texture.finish ?? 'woodgrain', custom }
  }
  // Mismo resolvedor que el dibujo: la muestra y la ventana con ese color son el mismo foliado.
  const look = resolveColorAppearance(color)
  const finish: ColorFinish = look.source ? look.finish : (texture?.finish ?? 'smooth')
  // Lo liso queda plano con su tono: una tesela casi uniforme no agrega nada a 32 px.
  if (!look.source || finish === 'smooth') return { hex, finish, custom }
  return { hex, image: swatchTile(finish, { hex, light: look.light, dark: look.dark }), finish, custom }
}
