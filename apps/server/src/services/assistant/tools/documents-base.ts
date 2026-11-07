/**
 * Plantilla base de una cotización (para aplicar DocOps sobre sus ajustes por cotización): la
 * elegida en la cotización o la de la empresa; si es propia, se lee por /api/templates/:id (sesión
 * de la persona); si no existe o no es válida, el diseño predefinido de respaldo.
 */
import { getDocPreset, isDocPresetId, pickQuoteTemplateRef, validateDocTemplate, type DocTemplate, type DocumentPrefs, type Quote } from '@dekopen/shared'
import { getSettings } from '../../settings'
import type { ToolContext } from './types'

/** Una plantilla tal como la devuelve la API (la plantilla misma o `{ spec }`). */
export function templateFromApi(data: unknown): DocTemplate | null {
  if (!data || typeof data !== 'object') return null
  const raw = (data as { spec?: unknown; template?: unknown }).spec ?? (data as { template?: unknown }).template ?? data
  const parsed = validateDocTemplate(raw)
  return parsed.ok ? parsed.template : null
}

export async function quoteBaseTemplate(ctx: ToolContext, quote: Pick<Quote, 'documentOverrides'>): Promise<DocTemplate> {
  const settings = await getSettings(ctx.deps.db, ctx.auth.org.id)
  const ref = pickQuoteTemplateRef(settings.documents as Partial<DocumentPrefs>, quote.documentOverrides ?? null)
  if (ref.source === 'org') {
    const res = await ctx.call('templateGet', { params: { id: ref.id } })
    const template = res.ok ? templateFromApi(res.data) : null
    if (template) return template
  }
  return getDocPreset(isDocPresetId(ref.id) ? ref.id : ref.fallbackPresetId)
}
