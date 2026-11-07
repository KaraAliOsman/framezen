/**
 * Biblioteca de foliados integrados del dibujo realista (2D y 3D).
 *
 * Los ids, nombres (7 idiomas), acabado, hex/claro/oscuro y escala por defecto vienen del contrato
 * compartido (`@dekopen/shared` › textures). Aquí se agrega lo que solo usa el dibujo: proporción física
 * de la tesela, dirección de la veta y parámetros PBR para el visor 3D. Las teselas WebP (640 × 768 px, ≤ 80 KB)
 * viven en `./builtin/<id>.webp` y como data URL en `./builtin/<id>.ts` (las genera
 * `packages/documents/scripts/generate-textures.ts`, determinista).
 */
import { BUILTIN_TEXTURES, BUILTIN_TEXTURE_IDS, type BuiltinTexture, type BuiltinTextureId, type Locale, type TextureFinish } from '@dekopen/shared'

export { BUILTIN_TEXTURE_IDS, type BuiltinTextureId }

/** Material físico de referencia para el visor 3D (valores de partida, no medidos). */
export interface SurfaceMaterial {
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
}

export interface BuiltinTextureLook extends BuiltinTexture {
  /** Alto/ancho de la repetición física: una tesela cubre `scaleMm` × `scaleMm·aspect` mm. */
  aspect: number
  /** Veta direccional (sigue el largo de cada pieza) o superficie isótropa. */
  grain: 'x' | 'none'
  material: SurfaceMaterial
}

const SMOOTH: SurfaceMaterial = { roughness: 0.42, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.32 }
const WOOD: SurfaceMaterial = { roughness: 0.58, metalness: 0, clearcoat: 0.05, clearcoatRoughness: 0.45 }
const SAND: SurfaceMaterial = { roughness: 0.72, metalness: 0, clearcoat: 0.03, clearcoatRoughness: 0.55 }
const BRUSHED: SurfaceMaterial = { roughness: 0.46, metalness: 0.12, clearcoat: 0.12, clearcoatRoughness: 0.36 }

function lookFor(id: BuiltinTextureId): BuiltinTextureLook {
  const base = BUILTIN_TEXTURES[id]
  const wood = base.finish === 'woodgrain'
  const brushed = base.finish === 'metallic'
  const sand = base.finish === 'textured'
  return {
    ...base,
    aspect: wood ? 1 / 3 : brushed ? 1 / 4 : 1,
    grain: wood || brushed ? 'x' : 'none',
    material: wood ? WOOD : brushed ? BRUSHED : sand ? SAND : id === 'anthracite_7016_smooth' ? { ...SMOOTH, roughness: 0.45, clearcoat: 0.08 } : SMOOTH,
  }
}

export const BUILTIN_TEXTURE_LIBRARY: Readonly<Record<BuiltinTextureId, BuiltinTextureLook>> = Object.freeze(
  Object.fromEntries(BUILTIN_TEXTURE_IDS.map((id) => [id, lookFor(id)])) as Record<BuiltinTextureId, BuiltinTextureLook>,
)

export function builtinTextureLook(id: BuiltinTextureId): BuiltinTextureLook {
  return BUILTIN_TEXTURE_LIBRARY[id]
}

/** Nombre comercial del foliado integrado en el idioma pedido (es por defecto). */
export function builtinTextureName(id: BuiltinTextureId, locale: Locale = 'es'): string {
  return BUILTIN_TEXTURES[id].names[locale] ?? BUILTIN_TEXTURES[id].names.es
}

/** Material 3D por acabado, para texturas subidas (sin receta propia). */
export function surfaceMaterialFor(finish: TextureFinish): SurfaceMaterial {
  return finish === 'woodgrain' ? WOOD : finish === 'metallic' ? BRUSHED : finish === 'textured' ? SAND : SMOOTH
}

/**
 * Ids de textura del catálogo v5 inicial (`@dekopen/catalog` › BUILTIN_TEXTURES: «wood-walnut»…) que
 * equivalen a un foliado de la biblioteca. Si el tono del color difiere, el dibujo lo tiñe.
 */
export const LEGACY_TEXTURE_ALIASES: Readonly<Record<string, BuiltinTextureId>> = Object.freeze({
  'wood-walnut': 'nut_tree',
  'wood-walnut-dark': 'nut_tree',
  'wood-walnut-light': 'nut_tree',
  'wood-golden-oak': 'golden_oak',
  'wood-oak': 'golden_oak',
  'wood-mountain-oak': 'winchester',
  'wood-natural-oak': 'irish_oak',
  'wood-grey-oak': 'sheffield_oak',
  'wood-winchester': 'winchester',
  'wood-lenga': 'winchester',
  'wood-wenge': 'black_brown_8022',
  'wood-colonial': 'nut_tree',
  'wood-anteak': 'golden_oak',
  'wood-mahogany': 'mahogany',
  'wood-embero': 'mahogany',
  'wood-generic': 'golden_oak',
  'textured-anthracite': 'anthracite_7016_sand',
  'textured-graphite': 'anthracite_7016_sand',
  'metallic-titanium': 'metbrush_silver',
  'metallic-pewter': 'metbrush_silver',
  'metallic-bronze': 'metbrush_silver',
  'metallic-aluminium': 'metbrush_silver',
  'metallic-steel': 'metbrush_silver',
})
