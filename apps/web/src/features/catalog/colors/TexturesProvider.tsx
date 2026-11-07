import { TextureProvider, type TextureSources } from '@dekopen/documents'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useMemo } from 'react'
import { texturesApi, textureKeys } from './api'

/**
 * Entrega a todos los dibujos (diseñador, editor de cotizaciones, vista previa de documentos, visor 3D)
 * las texturas subidas por el taller como data URL: nunca una URL remota, porque los PDF se imprimen sin
 * red y el SVG no debe pedir imágenes por su cuenta. Se monta una sola vez dentro del shell con sesión.
 *
 * Una petición liviana lista las texturas (sin imágenes) y otra las resuelve en línea; ambas se guardan en
 * el caché de consultas y se refrescan cuando se sube, renombra o borra una textura.
 */
export function TexturesProvider({ children }: { children: ReactNode }) {
  const list = useQuery({ queryKey: textureKeys.list, queryFn: texturesApi.list, staleTime: 60_000, retry: false })
  const ids = useMemo(
    () =>
      (list.data?.items ?? [])
        .map((texture) => texture.id)
        .sort()
        .slice(0, 100),
    [list.data],
  )
  const resolved = useQuery({
    queryKey: textureKeys.resolve(ids),
    queryFn: () => texturesApi.resolve(ids),
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const sources = useMemo<TextureSources | undefined>(() => {
    const textures = resolved.data?.textures
    if (!textures || Object.keys(textures).length === 0) return undefined
    return {
      uploads: Object.fromEntries(Object.entries(textures).map(([id, t]) => [id, { href: t.dataUrl, scaleMm: t.scaleMm, finish: t.finish, palette: { base: t.hex }, name: t.name }])),
    }
  }, [resolved.data])
  return <TextureProvider sources={sources}>{children}</TextureProvider>
}
