/**
 * Configuración de página. Tamaños físicos reales (A4 210 × 297 mm, Carta 215,9 × 279,4 mm) y
 * márgenes acotados; cabecera/pie/numeración como presets que el renderizador compone con contenido
 * de confianza (nunca texto concatenado en CSS).
 */
import { z } from 'zod'
import { PAGE_MARGIN_RANGE_MM } from './limits'

export const PAGE_SIZES = ['A4', 'Letter'] as const
export type DocPageSize = (typeof PAGE_SIZES)[number]

/** Medidas físicas en mm (vertical). */
export const PAGE_SIZE_MM: Readonly<Record<DocPageSize, { width: number; height: number }>> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
}

/** Vertical por defecto; horizontal para hojas de especificación. */
export const PAGE_ORIENTATIONS = ['portrait', 'landscape'] as const
export type DocPageOrientation = (typeof PAGE_ORIENTATIONS)[number]

export const PAGE_HEADERS = ['none', 'logo', 'logo_reference', 'reference'] as const
export const PAGE_FOOTERS = ['none', 'contact', 'reference', 'contact_reference', 'custom'] as const
export const PAGE_NUMBER_STYLES = ['none', 'page', 'page_of_total'] as const
export const PAGE_NUMBER_ALIGNS = ['left', 'center', 'right'] as const

const margin = z.number().int().min(PAGE_MARGIN_RANGE_MM.min).max(PAGE_MARGIN_RANGE_MM.max)

export const PageMarginsSchema = z.strictObject({ top: margin, right: margin, bottom: margin, left: margin })

export const PageSchema = z.strictObject({
  size: z.enum(PAGE_SIZES),
  /** Sin dato: vertical. */
  orientation: z.enum(PAGE_ORIENTATIONS).optional(),
  /** Márgenes interiores en mm (enteros). */
  margins: PageMarginsSchema,
  /** Cabecera de las páginas interiores: logo, referencia de la cotización, ambos o nada. */
  header: z.enum(PAGE_HEADERS),
  /** Pie: contacto de la empresa, referencia, ambos, el texto de pie configurado (`custom`) o nada. */
  footer: z.enum(PAGE_FOOTERS),
  pageNumbers: z.enum(PAGE_NUMBER_STYLES),
  pageNumberAlign: z.enum(PAGE_NUMBER_ALIGNS),
  /** Mostrar cabecera y pie también sobre la portada. La portada siempre cuenta en "página X de Y". */
  chromeOnCover: z.boolean(),
})

export type DocPage = z.infer<typeof PageSchema>
export type DocPageMargins = z.infer<typeof PageMarginsSchema>

export const PagePatchSchema = z.strictObject({
  size: z.enum(PAGE_SIZES).optional(),
  orientation: z.enum(PAGE_ORIENTATIONS).optional(),
  margins: PageMarginsSchema.partial().optional(),
  header: z.enum(PAGE_HEADERS).optional(),
  footer: z.enum(PAGE_FOOTERS).optional(),
  pageNumbers: z.enum(PAGE_NUMBER_STYLES).optional(),
  pageNumberAlign: z.enum(PAGE_NUMBER_ALIGNS).optional(),
  chromeOnCover: z.boolean().optional(),
})
export type DocPagePatch = z.infer<typeof PagePatchSchema>

/** Presets de márgenes para la UI (mm). */
export const PAGE_MARGIN_PRESETS: Readonly<Record<'narrow' | 'normal' | 'wide', DocPageMargins>> = {
  narrow: { top: 12, right: 12, bottom: 12, left: 12 },
  normal: { top: 16, right: 16, bottom: 16, left: 16 },
  wide: { top: 22, right: 22, bottom: 22, left: 22 },
}

export function applyPagePatch(page: DocPage, patch: DocPagePatch): DocPage {
  const out: DocPage = { ...page, margins: { ...page.margins } }
  if (patch.margins) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) if (patch.margins[side] !== undefined) out.margins[side] = patch.margins[side]
  }
  for (const key of ['size', 'orientation', 'header', 'footer', 'pageNumbers', 'pageNumberAlign', 'chromeOnCover'] as const) {
    const v = patch[key]
    if (v !== undefined) (out as Record<string, unknown>)[key] = v
  }
  return out
}

/** v4 `DocumentPrefs.paper` ↔ tamaño de página. */
export function pageSizeFromPaper(paper: unknown): DocPageSize | undefined {
  return paper === 'a4' || paper === 'A4' ? 'A4' : paper === 'letter' || paper === 'Letter' ? 'Letter' : undefined
}

export function paperFromPageSize(size: DocPageSize): 'a4' | 'letter' {
  return size === 'A4' ? 'a4' : 'letter'
}
