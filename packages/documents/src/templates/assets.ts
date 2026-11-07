/**
 * Recursos que necesita una plantilla para dibujarse: ids de imágenes subidas (portada, galería,
 * quiénes somos) que el servidor debe resolver dentro de la organización como data URL, y si algún
 * texto usa cursiva (para incrustar la cursiva de la fuente).
 */
import { isAssetId, type DocTemplate, type DocumentPrefs, type RichText } from '@dekopen/shared'
import { drawingDefsBuiltinIds, loadBuiltinTextures, type DrawingDefsData } from '../textures'

/** Ids de recursos (únicos, en orden) que referencia la plantilla. Nunca URLs. */
export function templateAssetIds(template: DocTemplate): string[] {
  const ids = new Set<string>()
  const logo = template.settings?.logoAssetId
  if (logo && isAssetId(logo)) ids.add(logo)
  for (const s of template.sections) {
    if (!s.enabled) continue
    if ((s.type === 'cover' || s.type === 'about_us' || s.type === 'acceptance') && s.options.assetId && isAssetId(s.options.assetId)) ids.add(s.options.assetId)
    if (s.type === 'gallery') for (const img of s.options.images) if (isAssetId(img.assetId)) ids.add(img.assetId)
  }
  return [...ids]
}

/** Logos de marca que subió el taller (van en todos sus documentos). */
export function brandAssetIds(prefs: Pick<DocumentPrefs, 'brandLogos' | 'hardwareLogos'> | null | undefined): string[] {
  const ids = [...Object.values(prefs?.brandLogos ?? {}), ...(prefs?.hardwareLogos ?? []).map((h) => h.assetId)]
  return [...new Set(ids.filter(isAssetId))]
}

function richHasItalic(doc: RichText | undefined): boolean {
  if (!doc) return false
  for (const b of doc.blocks) {
    const lines = b.type === 'paragraph' || b.type === 'heading' ? [b.children] : b.items.map((i) => i.children)
    for (const line of lines) for (const n of line) if (n.type === 'text' && n.italic) return true
  }
  return false
}

/** ¿Algún texto de la plantilla (o de los textos de la cotización) va en cursiva? */
export function templateUsesItalic(template: DocTemplate, texts: readonly string[] = []): boolean {
  for (const s of template.sections) {
    if (!s.enabled) continue
    if ((s.type === 'custom_text' || s.type === 'about_us' || s.type === 'intro') && richHasItalic(s.options.content)) return true
  }
  return texts.some((t) => /(^|[^*])\*[^*\s][^*]*\*(?!\*)|(^|\s)_[^_\s][^_]*_/.test(t))
}

/**
 * Carga las teselas de foliado que usan los dibujos del documento. Un render estático (PDF, pruebas)
 * no puede esperarlas: llamar antes de dibujar. En el navegador los dibujos las piden solos.
 */
export async function preloadDocumentTextures(defs: DrawingDefsData): Promise<void> {
  await loadBuiltinTextures(drawingDefsBuiltinIds(defs))
}
