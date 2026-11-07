/**
 * Imágenes que una plantilla referencia (portada con foto, quiénes somos, galerías). Un id con
 * formato válido NO es una autorización: antes de guardar se comprueba que cada id exista en la
 * organización (tabla `assets`, tipo `document_image`) y se quita lo ajeno o inexistente. Así una
 * plantilla (manual, importada o generada por la IA) nunca puede apuntar a imágenes de otra cuenta.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { migrateQuoteDocOverrides, withMessages, type DocIssue, type DocSection, type DocTemplate, type DocumentPrefs } from '@dekopen/shared'
import type { Db } from '../../db/client'
import type { AssetStore } from '../assets'
import { assets } from '../../db/schema'

/** Tipos de asset que una plantilla puede mostrar. */
export const TEMPLATE_ASSET_KINDS = ['document_image'] as const

/** Ids de imágenes que usa la plantilla (sin repetir). */
export function templateAssetIds(template: Pick<DocTemplate, 'sections'> & Partial<Pick<DocTemplate, 'settings'>>): string[] {
  const ids = new Set<string>()
  if (template.settings?.logoAssetId) ids.add(template.settings.logoAssetId)
  for (const s of template.sections) {
    if ((s.type === 'cover' || s.type === 'about_us' || s.type === 'acceptance') && s.options.assetId) ids.add(s.options.assetId)
    if (s.type === 'gallery') for (const img of s.options.images) ids.add(img.assetId)
  }
  return [...ids]
}

/** Imágenes que una cotización eligió por su cuenta (logo, foto de portada): no están en la plantilla. */
export function overrideAssetIds(overrides: unknown): string[] {
  const o = migrateQuoteDocOverrides(overrides ?? null, { source: 'quote' }).overrides
  const ids = new Set<string>()
  if (o.settings?.logoAssetId) ids.add(o.settings.logoAssetId)
  for (const s of Object.values(o.sections ?? {})) {
    const options = s.options as { assetId?: unknown; images?: unknown } | undefined
    if (typeof options?.assetId === 'string') ids.add(options.assetId)
    if (Array.isArray(options?.images)) for (const img of options.images as { assetId?: unknown }[]) if (typeof img?.assetId === 'string') ids.add(img.assetId)
  }
  return [...ids]
}

/** Ids de los logos de marca que subió el taller. */
export function brandLogoIds(documents: Pick<DocumentPrefs, 'brandLogos' | 'hardwareLogos'> | null | undefined): string[] {
  return [...new Set([...Object.values(documents?.brandLogos ?? {}), ...(documents?.hardwareLogos ?? []).map((h) => h.assetId)])]
}

/** Ids de esa lista que existen (vigentes) en la organización. */
export async function ownedAssetIds(db: Db, orgId: string, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), inArray(assets.id, [...ids]), inArray(assets.kind, [...TEMPLATE_ASSET_KINDS]), isNull(assets.deletedAt)))
  return new Set(rows.map((r) => r.id))
}

/** Quita de la plantilla las imágenes que no están en `allowed`. Pura; devuelve los avisos. */
export function stripAssets(template: DocTemplate, allowed: ReadonlySet<string>): { template: DocTemplate; issues: DocIssue[] } {
  const issues: DocIssue[] = []
  let changed = false
  let settings = template.settings
  if (settings?.logoAssetId && !allowed.has(settings.logoAssetId)) {
    changed = true
    issues.push({ severity: 'warning', code: 'value_dropped', path: ['settings', 'logoAssetId'], message: '' })
    const { logoAssetId: _logo, ...rest } = settings
    void _logo
    settings = rest
  }
  const sections = template.sections.map((section, index): DocSection => {
    if ((section.type === 'cover' || section.type === 'about_us' || section.type === 'acceptance') && section.options.assetId && !allowed.has(section.options.assetId)) {
      changed = true
      issues.push({ severity: 'warning', code: 'value_dropped', path: ['sections', index, 'options', 'assetId'], message: '' })
      const { assetId: _drop, ...options } = section.options
      void _drop
      return { ...section, options } as DocSection
    }
    if (section.type === 'gallery') {
      const images = section.options.images.filter((img) => allowed.has(img.assetId))
      if (images.length !== section.options.images.length) {
        changed = true
        issues.push({ severity: 'warning', code: 'value_dropped', path: ['sections', index, 'options', 'images'], message: '' })
        return { ...section, options: { ...section.options, images } }
      }
    }
    return section
  })
  return changed ? { template: { ...template, sections, ...(settings ? { settings } : {}) }, issues: withMessages(issues) } : { template, issues }
}

/** Comprueba en la base y quita lo ajeno. */
export async function enforceTemplateAssets(db: Db, orgId: string, template: DocTemplate): Promise<{ template: DocTemplate; issues: DocIssue[] }> {
  const ids = templateAssetIds(template)
  if (!ids.length) return { template, issues: [] }
  return stripAssets(template, await ownedAssetIds(db, orgId, ids))
}

/**
 * Imágenes de la plantilla en línea (id → data URL) para el PDF y el portal: Chromium imprime sin
 * red, así que viajan dentro del documento. Sólo salen las de la organización (ajenas o borradas se
 * omiten y la plantilla cae al dibujo).
 */
export async function templateAssetDataUrls(
  store: Pick<AssetStore, 'dataUrls'>,
  orgId: string,
  template: Pick<DocTemplate, 'sections'> & Partial<Pick<DocTemplate, 'settings'>>,
  documents?: Pick<DocumentPrefs, 'brandLogos' | 'hardwareLogos'> | null,
  /** `Quote.documentOverrides`: lo que la cotización eligió aparte de su plantilla. */
  overrides?: unknown,
): Promise<Record<string, string>> {
  const ids = [...new Set([...templateAssetIds(template), ...brandLogoIds(documents), ...overrideAssetIds(overrides)])]
  return ids.length ? store.dataUrls(orgId, ids) : {}
}
