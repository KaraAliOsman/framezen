/**
 * Teselas de la biblioteca integrada (las genera DRAW en packages/documents/src/textures/builtin,
 * una por id de `BUILTIN_TEXTURE_IDS`). Se toman por ruta con `import.meta.glob`: si un archivo aún
 * no existe, esa textura usa su muestra de respaldo (color base + veta suave), nunca rompe.
 */
import { BUILTIN_TEXTURES, isBuiltinTextureId, type BuiltinTextureId } from '@dekopen/shared'

const files = import.meta.glob<string>('../../../../../../packages/documents/src/textures/builtin/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

const URLS: Partial<Record<BuiltinTextureId, string>> = {}
for (const [path, url] of Object.entries(files)) {
  const id = path.split('/').pop()!.replace(/\.webp$/, '')
  if (isBuiltinTextureId(id)) URLS[id] = url
}

/** URL de la tesela integrada, o undefined si todavía no está en el paquete. */
export function builtinTileUrl(id: BuiltinTextureId): string | undefined {
  return URLS[id]
}

export function builtinTexture(id: BuiltinTextureId) {
  return BUILTIN_TEXTURES[id]
}
