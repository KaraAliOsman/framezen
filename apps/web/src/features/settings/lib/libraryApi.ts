/**
 * Plantillas y texturas propias vistas desde Ajustes (solo lectura: se crean y editan en Documentos y
 * en Catálogo › Colores). Las rutas son de TPL-EDITOR (`/api/templates`) y TEXUP (`/api/textures`);
 * aquí se leen con tolerancia: si una ruta aún no responde, la sección sigue en pie sin esa lista.
 */
import { useQuery } from '@tanstack/react-query'
import { TEXTURE_PATHS, validateDocTemplate, type DocTemplate, type DocTemplateKind, type TextureListResponse } from '@dekopen/shared'
import { request } from '../../../lib/api'
import { apiPath, isMissingRoute } from './assistantsApi'

export interface OrgTemplateSummary {
  id: string
  name: string
  kind: DocTemplateKind
  /** Plantilla válida para dibujar su huella (si el servidor la envía). */
  template?: DocTemplate
  updatedAt?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Acepta `{ items }` o una lista; cada fila con `id`, `name`, `kind` y opcionalmente `spec`/`template`. */
export function normalizeTemplateList(data: unknown): OrgTemplateSummary[] {
  const root = asRecord(data)
  const list = Array.isArray(data) ? data : Array.isArray(root?.items) ? (root.items as unknown[]) : []
  const out: OrgTemplateSummary[] = []
  for (const raw of list) {
    const row = asRecord(raw)
    if (!row || typeof row.id !== 'string' || !row.id) continue
    const kind = row.kind === 'catalog' ? 'catalog' : row.kind === 'quote' ? 'quote' : null
    if (!kind) continue
    const spec = row.spec ?? row.template
    const valid = spec ? validateDocTemplate(spec, { kind }) : null
    out.push({
      id: row.id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : (valid?.ok ? valid.template.name : row.id),
      kind,
      ...(valid?.ok ? { template: valid.template } : {}),
      ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
    })
  }
  return out
}

export function useOrgTemplates() {
  return useQuery({
    queryKey: ['templates', 'org'],
    queryFn: async () => normalizeTemplateList(await request<unknown>('/templates', { retry: 0 })),
    retry: (count, error) => !isMissingRoute(error) && count < 1,
    staleTime: 60_000,
  })
}

export function useTextureLibrary() {
  return useQuery({
    queryKey: ['textures', 'list'],
    queryFn: () => request<TextureListResponse>(apiPath(TEXTURE_PATHS.list), { retry: 0 }),
    retry: (count, error) => !isMissingRoute(error) && count < 1,
    staleTime: 60_000,
  })
}
