/**
 * Biblioteca de texturas incluidas (foliados): ids estables que el dibujo realista resuelve a sus
 * mosaicos (`packages/documents/src/textures/builtin/<id>.webp`). El catálogo las asigna a los
 * colores de madera, texturizados y metalizados de la paleta; el motor nunca las lee.
 *
 * `scaleMm` es el largo físico sugerido de una repetición del mosaico (escala de la veta) y `hex`
 * el tono medio, que sigue siendo el color de respaldo de todo dibujo.
 */
import type { ColorFinish, ColorTexture } from '@dekopen/engine'

export interface BuiltinTexture {
  id: string
  /** Nombre en español (fuente; la interfaz lo traduce por id). */
  name: string
  finish: ColorFinish
  hex: string
  scaleMm: number
}

export const BUILTIN_TEXTURES: BuiltinTexture[] = [
  { id: 'wood-walnut', name: 'Nogal', finish: 'woodgrain', hex: '#5B3A22', scaleMm: 450 },
  { id: 'wood-walnut-dark', name: 'Nogal oscuro', finish: 'woodgrain', hex: '#4A2E1B', scaleMm: 450 },
  { id: 'wood-walnut-light', name: 'Nogal claro', finish: 'woodgrain', hex: '#7A5232', scaleMm: 450 },
  { id: 'wood-golden-oak', name: 'Roble dorado', finish: 'woodgrain', hex: '#A8692E', scaleMm: 500 },
  { id: 'wood-oak', name: 'Roble', finish: 'woodgrain', hex: '#B07D48', scaleMm: 500 },
  { id: 'wood-mountain-oak', name: 'Roble montaña', finish: 'woodgrain', hex: '#8A6A4A', scaleMm: 500 },
  { id: 'wood-natural-oak', name: 'Roble natural', finish: 'woodgrain', hex: '#C19A6B', scaleMm: 500 },
  { id: 'wood-grey-oak', name: 'Roble gris', finish: 'woodgrain', hex: '#8B8378', scaleMm: 500 },
  { id: 'wood-winchester', name: 'Winchester', finish: 'woodgrain', hex: '#7A4A2A', scaleMm: 550 },
  { id: 'wood-lenga', name: 'Lenga', finish: 'woodgrain', hex: '#B07A4F', scaleMm: 450 },
  { id: 'wood-wenge', name: 'Wengué', finish: 'woodgrain', hex: '#3B2A20', scaleMm: 400 },
  { id: 'wood-colonial', name: 'Colonial', finish: 'woodgrain', hex: '#7E4E2C', scaleMm: 450 },
  { id: 'wood-anteak', name: 'Anteak', finish: 'woodgrain', hex: '#8C5B33', scaleMm: 450 },
  { id: 'wood-mahogany', name: 'Caoba', finish: 'woodgrain', hex: '#6B2E1F', scaleMm: 450 },
  { id: 'wood-embero', name: 'Embero', finish: 'woodgrain', hex: '#8C5A3C', scaleMm: 450 },
  { id: 'wood-generic', name: 'Madera', finish: 'woodgrain', hex: '#8B5A2B', scaleMm: 450 },
  { id: 'textured-anthracite', name: 'Antracita texturado', finish: 'textured', hex: '#383E42', scaleMm: 200 },
  { id: 'textured-graphite', name: 'Grafito texturado', finish: 'textured', hex: '#43464B', scaleMm: 200 },
  { id: 'metallic-titanium', name: 'Titanio metalizado', finish: 'metallic', hex: '#8E9196', scaleMm: 300 },
  { id: 'metallic-pewter', name: 'Peltre metalizado', finish: 'metallic', hex: '#7C7F82', scaleMm: 300 },
  { id: 'metallic-bronze', name: 'Bronce metalizado', finish: 'metallic', hex: '#6E5636', scaleMm: 300 },
  { id: 'metallic-aluminium', name: 'Aluminio mate', finish: 'metallic', hex: '#B8B8B4', scaleMm: 300 },
  { id: 'metallic-steel', name: 'Acero inoxidable', finish: 'metallic', hex: '#C9CBCD', scaleMm: 300 },
]

const BY_ID = new Map(BUILTIN_TEXTURES.map((texture) => [texture.id, texture]))

export function builtinTexture(id: string): BuiltinTexture | undefined {
  return BY_ID.get(id)
}

/** Referencia de color a una textura incluida, con su escala y terminación por defecto. */
export function builtinTextureRef(id: string): ColorTexture | undefined {
  const texture = BY_ID.get(id)
  return texture ? { kind: 'builtin', id: texture.id, scaleMm: texture.scaleMm, finish: texture.finish } : undefined
}

/** Copia de una textura (sin compartir el objeto entre colores ni catálogos). */
export function cloneTexture(texture: ColorTexture | undefined): ColorTexture | undefined {
  return texture ? { ...texture } : undefined
}
