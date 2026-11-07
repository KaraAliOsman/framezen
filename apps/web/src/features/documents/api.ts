/**
 * Plantillas de documentos (/api/templates) — cliente y hooks de TanStack Query propios de esta
 * carpeta (contrato de tipos en @dekopen/shared/api). Los diseños predefinidos no se piden al
 * servidor: vienen de @dekopen/shared (`DOC_PRESETS`) con la misma forma.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DOC_PRESET_IDS,
  getDocPreset,
  presetKind,
  type DocTemplate,
  type DocTemplateCreateBody,
  type DocTemplateDeleteResponse,
  type DocTemplateGenerateBody,
  type DocTemplateGenerateResponse,
  type DocTemplateKind,
  type DocTemplateListResponse,
  type DocTemplateOpsResponse,
  type DocTemplateRecord,
  type DocumentImageRecord,
} from '@dekopen/shared'
import { request } from '../../lib/api'
import { qk as appKeys } from '../../lib/queryClient'

export const templateKeys = {
  all: ['templates'] as const,
  list: ['templates', 'list'] as const,
  one: (id: string) => ['templates', 'one', id] as const,
  images: ['templates', 'images'] as const,
  image: (id: string) => ['templates', 'image', id] as const,
}

export const templatesApi = {
  list: () => request<DocTemplateListResponse>('/templates'),
  get: (id: string) => request<DocTemplateRecord>(`/templates/${encodeURIComponent(id)}`),
  create: (body: DocTemplateCreateBody) => request<DocTemplateRecord>('/templates', { method: 'POST', body }),
  save: (id: string, template: DocTemplate, version: number) =>
    request<DocTemplateRecord>(`/templates/${encodeURIComponent(id)}`, { method: 'PUT', body: { template, version }, retry: 0 }),
  ops: (id: string, ops: unknown[], version?: number) =>
    request<DocTemplateOpsResponse>(`/templates/${encodeURIComponent(id)}/ops`, { method: 'POST', body: { ops, ...(version ? { version } : {}) } }),
  duplicate: (id: string, name?: string) => request<DocTemplateRecord>(`/templates/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: name ? { name } : {} }),
  remove: (id: string) => request<DocTemplateDeleteResponse>(`/templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restore: (id: string, makeDefault?: boolean) =>
    request<DocTemplateRecord>(`/templates/${encodeURIComponent(id)}/restore`, { method: 'POST', body: makeDefault ? { makeDefault } : {} }),
  setDefault: (kind: DocTemplateKind, templateId: string) =>
    request<{ defaults: Record<DocTemplateKind, string> }>('/templates/default', { method: 'PUT', body: { kind, templateId } }),
  generate: (body: DocTemplateGenerateBody, signal?: AbortSignal) =>
    request<DocTemplateGenerateResponse>('/templates/generate', { method: 'POST', body, signal }),
  images: () => request<{ images: DocumentImageRecord[] }>('/templates/images'),
  image: (id: string) => request<{ image: DocumentImageRecord; dataUrl: string }>(`/templates/images/${encodeURIComponent(id)}`),
  uploadImage: (dataUrl: string, name?: string) =>
    request<{ image: DocumentImageRecord; duplicate: boolean }>('/templates/images', { method: 'POST', body: { dataUrl, ...(name ? { name } : {}) } }),
  removeImage: (id: string) => request<{ ok: true }>(`/templates/images/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restoreImage: (id: string) => request<{ image: DocumentImageRecord }>(`/templates/images/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} }),
}

/** Diseños predefinidos con la forma de la API (sin pedirlos al servidor). */
export function presetRecords(kind: DocTemplateKind, defaultId?: string): DocTemplateRecord[] {
  return DOC_PRESET_IDS.filter((id) => presetKind(id) === kind).map((id) => {
    const template = getDocPreset(id)
    return { id, kind, name: template.name, presetId: id, builtin: true, version: 0, template, isDefault: id === defaultId }
  })
}

export function useTemplates(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: templateKeys.list, queryFn: templatesApi.list, staleTime: 30_000, enabled: options.enabled })
}

export function useTemplate(id: string | undefined) {
  return useQuery({ queryKey: templateKeys.one(id ?? ''), queryFn: () => templatesApi.get(id as string), enabled: Boolean(id), staleTime: 10_000 })
}

export function useDocumentImages(enabled = true) {
  return useQuery({ queryKey: templateKeys.images, queryFn: templatesApi.images, enabled, staleTime: 60_000 })
}

/** Data URLs de las imágenes que usa una plantilla (para la vista previa). */
export function useImageData(ids: readonly string[]) {
  const key = [...new Set(ids)].sort()
  return useQuery({
    queryKey: ['templates', 'image-data', ...key],
    queryFn: async () => {
      const out: Record<string, string> = {}
      await Promise.all(
        key.map(async (id) => {
          try {
            out[id] = (await templatesApi.image(id)).dataUrl
          } catch {
            /* imagen borrada o ajena: la plantilla cae al dibujo */
          }
        }),
      )
      return out
    },
    enabled: key.length > 0,
    staleTime: 10 * 60_000,
  })
}

/** Refresca la lista y los ajustes (la predeterminada vive en settings.documents). */
export function useInvalidateTemplates() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: templateKeys.all })
    void client.invalidateQueries({ queryKey: appKeys.settings })
  }
}

/** Mutaciones de la galería con la lista al día. */
export function useTemplateMutations() {
  const client = useQueryClient()
  const refresh = () => {
    void client.invalidateQueries({ queryKey: templateKeys.list })
    void client.invalidateQueries({ queryKey: appKeys.settings })
  }
  const upsert = (record: DocTemplateRecord) => {
    client.setQueryData(templateKeys.one(record.id), record)
    client.setQueryData<DocTemplateListResponse>(templateKeys.list, (prev) => {
      if (!prev || record.builtin) return prev
      const exists = prev.templates.some((t) => t.id === record.id)
      const templates = exists ? prev.templates.map((t) => (t.id === record.id ? record : t)) : [record, ...prev.templates]
      return { ...prev, templates }
    })
  }
  return {
    upsert,
    create: useMutation({ mutationFn: templatesApi.create, onSuccess: (r) => (upsert(r), refresh()) }),
    duplicate: useMutation({ mutationFn: ({ id, name }: { id: string; name?: string }) => templatesApi.duplicate(id, name), onSuccess: (r) => (upsert(r), refresh()) }),
    remove: useMutation({
      mutationFn: templatesApi.remove,
      onSuccess: (res) => {
        client.setQueryData<DocTemplateListResponse>(templateKeys.list, (prev) => (prev ? { ...prev, templates: prev.templates.filter((t) => t.id !== res.template.id) } : prev))
        refresh()
      },
    }),
    restore: useMutation({ mutationFn: ({ id, makeDefault }: { id: string; makeDefault?: boolean }) => templatesApi.restore(id, makeDefault), onSuccess: (r) => (upsert(r), refresh()) }),
    setDefault: useMutation({
      mutationFn: ({ kind, templateId }: { kind: DocTemplateKind; templateId: string }) => templatesApi.setDefault(kind, templateId),
      onSuccess: (res) => {
        client.setQueryData<DocTemplateListResponse>(templateKeys.list, (prev) =>
          prev ? { ...prev, defaults: res.defaults, templates: prev.templates.map((t) => ({ ...t, isDefault: res.defaults[t.kind] === t.id })) } : prev,
        )
        refresh()
      },
    }),
  }
}

/** Reduce una foto en el navegador antes de subirla (los teléfonos sacan 12 MP+): JPEG ≤ 2400 px. */
export async function shrinkImage(file: File, maxSide = 2400): Promise<string> {
  const read = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  if (typeof createImageBitmap !== 'function') return read()
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 3 * 1024 * 1024) {
      bitmap.close()
      return read()
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return read()
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88)
  } catch {
    return read()
  }
}
