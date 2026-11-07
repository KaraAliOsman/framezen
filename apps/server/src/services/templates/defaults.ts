/**
 * Plantilla predeterminada por tipo de documento. Vive donde siempre: `OrgSettings.documents`
 * (`quoteTemplate` / `catalogTemplate`), ahora como referencia de texto (diseño predefinido, id v4
 * o plantilla propia). Cada cotización puede elegir otra (`documentOverrides.templateId`).
 */
import { eq } from 'drizzle-orm'
import { resolveDocTemplateRef, type DocTemplateKind } from '@dekopen/shared'
import type { Db } from '../../db/client'
import { orgSettings } from '../../db/schema'
import { deepMerge } from '../../lib/merge'
import { defaultStoredSettings, getSettings, withDefaults } from '../settings'

const prefKey = (kind: DocTemplateKind) => (kind === 'quote' ? 'quoteTemplate' : 'catalogTemplate')

/** Referencia guardada y el id efectivo (ids v4 traducidos; desconocidos → diseño por defecto). */
export async function defaultTemplateRefs(db: Db, orgId: string): Promise<Record<DocTemplateKind, { stored: string | null; id: string }>> {
  const settings = await getSettings(db, orgId)
  const out = {} as Record<DocTemplateKind, { stored: string | null; id: string }>
  for (const kind of ['quote', 'catalog'] as const) {
    const stored = (settings.documents as unknown as Record<string, unknown>)[prefKey(kind)]
    out[kind] = { stored: typeof stored === 'string' ? stored : null, id: resolveDocTemplateRef(stored, kind).id }
  }
  return out
}

/** Guarda la plantilla predeterminada de un tipo (la ruta ya validó que exista). */
export async function setDefaultTemplate(db: Db, orgId: string, kind: DocTemplateKind, templateId: string, now: Date): Promise<void> {
  const patch = { documents: { [prefKey(kind)]: templateId } }
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1)
  if (row) await db.update(orgSettings).set({ data: deepMerge(withDefaults(row.data), patch), updatedAt: now }).where(eq(orgSettings.orgId, orgId))
  else await db.insert(orgSettings).values({ orgId, data: deepMerge(defaultStoredSettings(), patch), updatedAt: now })
}
