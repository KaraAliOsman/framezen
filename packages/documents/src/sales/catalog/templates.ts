/**
 * Diseños de catálogo: los 4 predefinidos (Habitar, Sistema, Colección Modular, Materia y Color) como
 * `DocTemplate` de `@dekopen/shared`, más la resolución de lo que llega (id de diseño, id v4 heredado,
 * plantilla propia validada) y la capa de la organización (color de marca y papel).
 */
import {
  CATALOG_PRESET_IDS,
  DEFAULT_CATALOG_PRESET_ID,
  LEGACY_TEMPLATE_PRESETS,
  brandPalette,
  getDocPreset,
  isDocPresetId,
  isLegacyTemplateId,
  mergeTemplateOverrides,
  migrateQuoteDocOverrides,
  normalizeHex,
  presetDescription,
  presetKind,
  presetName,
  resolveDocTemplateRef,
  validateDocTemplate,
  type CatalogPresetId,
  type DocIssue,
  type DocLocale,
  type DocTemplate,
  type DocumentPrefs,
} from '@dekopen/shared'

export interface CatalogTemplateInfo {
  id: CatalogPresetId
  name: string
  description: string
  /** Ids v4 que se muestran con este diseño (`vitrina` → Colección Modular…). */
  legacyIds: string[]
}

function legacyIdsOf(id: CatalogPresetId): string[] {
  return Object.entries(LEGACY_TEMPLATE_PRESETS)
    .filter(([, preset]) => preset === id)
    .map(([legacy]) => legacy)
}

/** Diseños de catálogo predefinidos (nombres en el idioma pedido; español por defecto). */
export function catalogTemplates(locale: DocLocale = 'es'): CatalogTemplateInfo[] {
  return CATALOG_PRESET_IDS.map((id) => ({ id, name: presetName(id, locale), description: presetDescription(id, locale), legacyIds: legacyIdsOf(id) }))
}

/** Los 4 diseños de catálogo (español). Para otro idioma, `catalogTemplates(locale)`. */
export const CATALOG_TEMPLATES: readonly CatalogTemplateInfo[] = Object.freeze(catalogTemplates('es'))

/** ¿Es una referencia de catálogo conocida (diseño predefinido o id v4)? */
export function isCatalogTemplateRef(value: unknown): value is string {
  if (isDocPresetId(value)) return presetKind(value) === 'catalog'
  return isLegacyTemplateId(value) && presetKind(LEGACY_TEMPLATE_PRESETS[value]) === 'catalog'
}

/**
 * Referencia a usar entre la pedida (`?template=`) y la preferida del taller: la pedida si es de
 * catálogo; si no, la preferida (diseño, id v4 o plantilla propia); si no, el diseño por defecto.
 */
export function pickCatalogTemplateRef(requested: string | null | undefined, preferred: string | null | undefined): string {
  if (isCatalogTemplateRef(requested)) return requested
  if (preferred && resolveDocTemplateRef(preferred, 'catalog').source !== 'default') return preferred
  return DEFAULT_CATALOG_PRESET_ID
}

export interface ResolveCatalogTemplateInput {
  /** Diseño pedido: id predefinido (`habitar`), id v4 (`vitrina`) o id de plantilla propia. */
  template?: string | null
  /** Plantilla propia ya cargada (se valida aquí; si no es válida se usa el diseño de respaldo). */
  spec?: unknown
  /** Ajustes de documentos de la organización: color de marca y papel. */
  prefs?: Partial<Pick<DocumentPrefs, 'accent' | 'paper'>> | null
  /** Color de marca de la organización (si los ajustes no traen uno). */
  brandAccent?: string | null
}

export interface ResolvedCatalogTemplate {
  template: DocTemplate
  /** Diseño predefinido de origen (también para plantillas propias duplicadas de uno). */
  presetId?: CatalogPresetId
  /** Id v4 equivalente (clase CSS de compatibilidad). */
  legacyId?: string
  source: 'spec' | 'preset' | 'legacy' | 'default'
  issues: DocIssue[]
}

/** Plantilla de catálogo final: valida, cae al diseño de respaldo si hace falta y aplica la capa del taller. */
export function resolveCatalogTemplate(input: ResolveCatalogTemplateInput = {}): ResolvedCatalogTemplate {
  const issues: DocIssue[] = []
  const ref = resolveDocTemplateRef(input.template ?? undefined, 'catalog')
  let template: DocTemplate | undefined
  let source: ResolvedCatalogTemplate['source'] = 'default'
  if (input.spec !== undefined && input.spec !== null) {
    const valid = validateDocTemplate(input.spec, { kind: 'catalog' })
    if (valid.ok) {
      template = valid.template
      source = 'spec'
      issues.push(...valid.issues)
    } else issues.push(...valid.issues)
  }
  if (!template) {
    const presetId = (ref.source === 'org' ? ref.fallbackPresetId : ref.id) as CatalogPresetId
    template = getDocPreset(presetId)
    source = ref.source === 'preset' ? 'preset' : ref.source === 'legacy' ? 'legacy' : 'default'
  }
  const presetId = template.presetId && presetKind(template.presetId) === 'catalog' ? (template.presetId as CatalogPresetId) : undefined
  const legacyId = isLegacyTemplateId(input.template) && ref.source === 'legacy' ? input.template : presetId ? legacyIdsOf(presetId)[0] : undefined

  // Capa del taller: papel siempre; color de marca solo sobre diseños predefinidos (una plantilla
  // propia ya trae su paleta elegida).
  const org = migrateQuoteDocOverrides(input.prefs ? { ...(input.prefs.paper ? { paper: input.prefs.paper } : {}), ...(input.prefs.accent ? { accent: input.prefs.accent } : {}) } : null, { source: 'org' }).overrides
  const isPreset = isDocPresetId(template.id) && template.presetId === template.id
  const accent = normalizeHex(input.prefs?.accent ?? undefined) ?? normalizeHex(input.brandAccent ?? undefined)
  if (isPreset && accent) org.theme = { ...(org.theme ?? {}), palette: { ...(org.theme?.palette ?? {}), ...brandPalette(template, accent) } }
  else if (org.theme?.palette?.accent) delete org.theme.palette.accent
  delete org.templateId
  const merged = mergeTemplateOverrides(template, org)
  issues.push(...merged.issues)
  return { template: merged.template, ...(presetId ? { presetId } : {}), ...(legacyId ? { legacyId } : {}), source, issues }
}
