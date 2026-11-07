/**
 * Datos de texturas propias y colores propios (TEXUP). Contratos en `@dekopen/shared`
 * (textures/custom.ts). Cada cambio de color refresca el catálogo efectivo (el motor del editor lo
 * usa para dibujar y cotizar).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CatalogColorMutationResponse,
  CatalogColorsResponse,
  CustomColorCreateBody,
  CustomColorPatchBody,
  TextureAsset,
  TextureCommitResponse,
  TextureDeleteResponse,
  TextureDraftCommitBody,
  TextureListResponse,
  TexturePatchBody,
  TexturePreviewResponse,
  TextureProcessOptions,
  TextureResolveResponse,
} from '@dekopen/shared'
import { request } from '../../../lib/api'
import { qk } from '../../../lib/queryClient'

export const textureKeys = {
  list: ['textures'] as const,
  colors: ['catalog', 'colors'] as const,
  resolve: (ids: readonly string[]) => ['textures', 'resolve', [...ids].sort().join(',')] as const,
}

export type TextureUploadRequest = { dataUrl: string; name?: string; useAi?: boolean; preview?: boolean } & TextureProcessOptions

export const texturesApi = {
  list: () => request<TextureListResponse>('/textures', { query: { limit: 200 } }),
  upload: (body: TextureUploadRequest, signal?: AbortSignal) => request<TexturePreviewResponse | TextureCommitResponse>('/textures', { method: 'POST', body, signal }),
  adjust: (draftId: string, body: TextureProcessOptions & { useAi?: boolean }, signal?: AbortSignal) =>
    request<TexturePreviewResponse>(`/textures/drafts/${encodeURIComponent(draftId)}`, { method: 'POST', body, signal }),
  commit: (draftId: string, body: TextureDraftCommitBody) => request<TextureCommitResponse>(`/textures/drafts/${encodeURIComponent(draftId)}/commit`, { method: 'POST', body }),
  discard: (draftId: string) => request<{ ok: boolean }>(`/textures/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE', retry: 0 }),
  patch: (id: string, body: TexturePatchBody) => request<TextureAsset>(`/textures/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  remove: (id: string) => request<TextureDeleteResponse>(`/textures/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restore: (id: string) => request<TextureAsset>(`/textures/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  resolve: (ids: readonly string[]) => request<TextureResolveResponse>('/textures/resolve', { query: { ids: ids.join(',') } }),
  colors: () => request<CatalogColorsResponse>('/catalog/colors'),
  createColor: (body: CustomColorCreateBody) => request<CatalogColorMutationResponse>('/catalog/colors', { method: 'POST', body }),
  patchColor: (id: string, body: CustomColorPatchBody) => request<CatalogColorMutationResponse>(`/catalog/colors/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  archiveColor: (id: string) => request<CatalogColorMutationResponse>(`/catalog/colors/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restoreColor: (id: string) => request<CatalogColorMutationResponse>(`/catalog/colors/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
}

export function useTextures() {
  return useQuery({ queryKey: textureKeys.list, queryFn: texturesApi.list, staleTime: 60_000 })
}

export function useCustomColors() {
  return useQuery({ queryKey: textureKeys.colors, queryFn: texturesApi.colors, staleTime: 60_000 })
}

/**
 * Imágenes en línea (data URL) de texturas subidas, para el `TextureProvider` de los dibujos (DRAW)
 * en el editor, el diseñador o la vista previa de documentos: `{ [assetId]: dataUrl }`.
 */
export function useTextureDataUrls(assetIds: readonly string[]): Record<string, string> {
  const ids = [...new Set(assetIds.filter(Boolean))]
  const query = useQuery({
    queryKey: textureKeys.resolve(ids),
    queryFn: () => texturesApi.resolve(ids),
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
  })
  const out: Record<string, string> = {}
  for (const [id, t] of Object.entries(query.data?.textures ?? {})) out[id] = t.dataUrl
  return out
}

/** Después de tocar colores: lista de colores propios + catálogo efectivo (líneas, precios, texturas). */
function useRefreshColors() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: textureKeys.colors })
    void client.invalidateQueries({ queryKey: qk.catalog, exact: true })
  }
}

export function useCreateColor() {
  const refresh = useRefreshColors()
  return useMutation({ mutationFn: texturesApi.createColor, onSuccess: refresh })
}

export function usePatchColor() {
  const refresh = useRefreshColors()
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: CustomColorPatchBody }) => texturesApi.patchColor(id, body), onSuccess: refresh })
}

export function useArchiveColor() {
  const refresh = useRefreshColors()
  return useMutation({ mutationFn: texturesApi.archiveColor, onSuccess: refresh })
}

export function useRestoreColor() {
  const refresh = useRefreshColors()
  return useMutation({ mutationFn: texturesApi.restoreColor, onSuccess: refresh })
}

/** Cambios de texturas: la lista y, si algún color la usa, el catálogo. */
export function useRefreshTextures() {
  const client = useQueryClient()
  return (alsoColors = false) => {
    void client.invalidateQueries({ queryKey: textureKeys.list })
    if (alsoColors) {
      void client.invalidateQueries({ queryKey: textureKeys.colors })
      void client.invalidateQueries({ queryKey: qk.catalog, exact: true })
    }
  }
}
