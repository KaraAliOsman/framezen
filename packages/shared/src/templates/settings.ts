/**
 * Ajustes del documento que no pertenecen a una sección: título y numeración, encabezado, orden de las
 * condiciones, marcas y campos personalizados. Viven por capas, de abajo hacia arriba: la plantilla, el
 * taller (`DocumentPrefs.settings`) y la cotización (`QuoteDocOverridesV2.settings`). Solo se guarda lo
 * que alguien decidió: lo demás sale de `DEFAULT_DOC_SETTINGS`.
 */
import { z } from 'zod'
import { TEMPLATE_LIMITS as L } from './limits'
import { AssetIdSchema, docText } from './fields'
import { cloneJson } from './safety'
import type { DocSectionType } from './sections'

export const DOC_TITLES = ['quote', 'budget', 'proposal', 'offer'] as const
export type DocTitle = (typeof DOC_TITLES)[number]
export const LETTERHEAD_LAYOUTS = ['split', 'stacked', 'centered'] as const
export const LOGO_SIZES = ['s', 'm', 'l', 'xl'] as const
export const BRAND_SIZES = ['s', 'm', 'l'] as const
/** Una sola vez (franja bajo la identidad), en cada ítem, o ambas. */
export const BRAND_PLACEMENTS = ['strip', 'items', 'both'] as const
/** `series`: solo la línea tal cual. `full`: además los datos verificados del catálogo. */
export const LINE_DETAILS = ['series', 'full'] as const
export type LineDetail = (typeof LINE_DETAILS)[number]
export const TERMS_PLACEMENTS = ['after_total', 'own_page', 'before_total'] as const
export type TermsPlacement = (typeof TERMS_PLACEMENTS)[number]

const CUSTOM_FIELD_ID = /^[a-z][a-z0-9-]{0,23}$/

export const CustomFieldSchema = z.strictObject({
  id: z.string().regex(CUSTOM_FIELD_ID, 'invalid_value'),
  label: docText({ max: L.customFieldLabelMax, multiline: false, placeholders: false, required: true }),
})
export type CustomField = z.infer<typeof CustomFieldSchema>

export const DocSettingsSchema = z.strictObject({
  docTitle: z.enum(DOC_TITLES).optional(),
  /** Título propio («Oferta técnica»): reemplaza al de la lista. */
  customTitle: docText({ max: L.customFieldLabelMax, multiline: false, placeholders: false }).optional(),
  /** Prefijo del número («COT-»). */
  numberPrefix: docText({ max: 12, multiline: false, placeholders: false }).optional(),
  /** Dígitos mínimos del número (412 → 000412). */
  numberPad: z.number().int().min(0).max(6).optional(),
  showRevision: z.boolean().optional(),
  letterhead: z.enum(LETTERHEAD_LAYOUTS).optional(),
  logoSize: z.enum(LOGO_SIZES).optional(),
  /** Mostrar el logo en el encabezado y en la cabecera de cada hoja. */
  showLogo: z.boolean().optional(),
  /** Imagen de la biblioteca que reemplaza al logo de la empresa en este documento. */
  logoAssetId: AssetIdSchema.optional(),
  termsPlacement: z.enum(TERMS_PLACEMENTS).optional(),
  /** Mostrar el logo de la marca de perfil, si el taller lo subió. */
  brandProfile: z.boolean().optional(),
  /** Mostrar el logo de la marca de herrajes, si el taller lo subió. */
  brandHardware: z.boolean().optional(),
  brandPlacement: z.enum(BRAND_PLACEMENTS).optional(),
  brandSize: z.enum(BRAND_SIZES).optional(),
  lineDetail: z.enum(LINE_DETAILS).optional(),
  /** Datos propios del encabezado (N° de OC, N° de obra). El valor se escribe en cada cotización. */
  customFields: z.array(CustomFieldSchema).max(L.customFieldsMax).optional(),
})
export type DocSettings = z.infer<typeof DocSettingsSchema>

/** Parche de ajustes: `null` borra la llave y vuelve a la capa de abajo. */
export const DocSettingsPatchSchema = z.strictObject(
  Object.fromEntries(Object.entries(DocSettingsSchema.shape).map(([k, s]) => [k, (s as z.ZodOptional<z.ZodType>).unwrap().nullable().optional()])),
)
export type ResolvedDocSettings = Required<Omit<DocSettings, 'customTitle' | 'numberPrefix' | 'logoAssetId'>> & Pick<DocSettings, 'customTitle' | 'numberPrefix' | 'logoAssetId'>

export const DEFAULT_DOC_SETTINGS: ResolvedDocSettings = Object.freeze({
  docTitle: 'quote',
  numberPad: 0,
  showRevision: true,
  letterhead: 'split',
  logoSize: 'm',
  showLogo: true,
  termsPlacement: 'after_total',
  brandProfile: true,
  brandHardware: true,
  brandPlacement: 'strip',
  brandSize: 'm',
  lineDetail: 'series',
  customFields: [],
}) as ResolvedDocSettings

/** Aplica un parche: `null` borra la llave (vuelve a la capa de abajo). */
export function applySettingsPatch(base: DocSettings | undefined, patch: Record<string, unknown>): DocSettings {
  const next = cloneJson(base ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next as DocSettings
}

/** Capas de abajo hacia arriba → ajustes completos. */
export function resolveDocSettings(...layers: readonly (DocSettings | null | undefined)[]): ResolvedDocSettings {
  const out = { ...DEFAULT_DOC_SETTINGS } as Record<string, unknown>
  for (const layer of layers) {
    if (!layer) continue
    for (const [key, value] of Object.entries(layer)) if (value !== undefined) out[key] = value
  }
  return out as ResolvedDocSettings
}

/**
 * Orden de las condiciones respecto del total. Garantía y condiciones se mueven juntas; todo lo demás
 * conserva su lugar. `own_page` deja las condiciones al final, con la aceptación antes (el salto de hoja
 * lo pone el documento). Pura e idempotente.
 */
export function applyTermsPlacement<T extends { type: DocSectionType }>(sections: readonly T[], placement: TermsPlacement): T[] {
  const at = sections.findIndex((s) => s.type === 'totals')
  if (at < 0) return [...sections]
  const legal = (s: T) => s.type === 'warranty' || s.type === 'terms'
  const rest = sections.filter((s) => !legal(s))
  const warranty = sections.filter((s) => s.type === 'warranty')
  const terms = sections.filter((s) => s.type === 'terms')
  const totals = rest.findIndex((s) => s.type === 'totals')
  if (placement === 'before_total') return [...rest.slice(0, totals), ...warranty, ...terms, ...rest.slice(totals)]
  const accept = rest.findIndex((s) => s.type === 'acceptance')
  const end = accept >= 0 ? accept : rest.length
  if (placement === 'own_page') {
    return [...rest.slice(0, end), ...warranty, ...rest.slice(end), ...terms]
  }
  return [...rest.slice(0, end), ...warranty, ...terms, ...rest.slice(end)]
}
