/** Imágenes que usa una plantilla (portada con foto, quiénes somos, galerías), sin repetir. */
import type { DocTemplate, DocumentPrefs } from '@dekopen/shared'

export function templateAssetIdsOf(template: Pick<DocTemplate, 'sections'> & Partial<Pick<DocTemplate, 'settings'>>): string[] {
  const ids = new Set<string>()
  if (template.settings?.logoAssetId) ids.add(template.settings.logoAssetId)
  for (const s of template.sections) {
    if ((s.type === 'cover' || s.type === 'about_us' || s.type === 'acceptance') && s.options.assetId) ids.add(s.options.assetId)
    if (s.type === 'gallery') for (const img of s.options.images) ids.add(img.assetId)
  }
  return [...ids]
}

/** Logos de marca que subió el taller. */
export function brandLogoIdsOf(documents: Pick<DocumentPrefs, 'brandLogos' | 'hardwareLogos'> | null | undefined): string[] {
  return [...new Set([...Object.values(documents?.brandLogos ?? {}), ...(documents?.hardwareLogos ?? []).map((h) => h.assetId)])]
}
