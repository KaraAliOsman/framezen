/**
 * @framezen/catalog — catálogo base, catálogo de ejemplo, lectura de listas
 * «MisPrecios» y normalización de datos de marcas. Este punto de entrada es seguro
 * para navegador (sin node:*). El importador de archivos está en «@framezen/catalog/node».
 */
export const CATALOG_VERSION = '4.0.0'

export { parseCsv, parseMisPreciosCsv, splitType } from './csv'
export type { MisPreciosRow } from './csv'
export { COLOR_PALETTE, isColorless, normalizeColor } from './colors'
export {
  TYPOLOGY_IDS,
  SLIDING_TYPOLOGIES,
  CASEMENT_TYPOLOGIES,
  DOOR_TYPOLOGIES,
  SHAPED_FIXED_TYPOLOGIES,
  mapTypology,
  supplierFamily,
  typologyMatch,
  typologyKind,
} from './typologies'
export type { SupplierFamily } from './typologies'
export { brandRuleFor, colorFromCode, modelGroupKey, profileModelCode, prolineToken } from './codes'
export {
  COMPLEMENT_PATTERN,
  DEPRECATED_PATTERN,
  PLACEHOLDER_MAX,
  chamberFromColor,
  isComplementProfile,
  PROFILE_ROLE_LABEL,
  inferUnit,
  isPlaceholderPrice,
  isPlausibleGlassPrice,
  itemKind,
  parseBackset,
  parseBarLength,
  parseFace,
  parseGlass,
  parseInches,
  parseRange,
  profileFamily,
  repeatedPlaceholderValues,
  roleFor,
  rowStatus,
} from './classify'
export type { InferredUnit, ParsedGlass, ProfileFamily, RowStatus } from './classify'
export {
  GENERIC_ACCESSORY_RULES,
  GENERIC_BRAND,
  GENERIC_BRAND_ID,
  GENERIC_HARDWARE_RULES,
  GENERIC_ITEMS,
  GENERIC_SLIDING_ACCESSORY_RULES,
  GENERIC_SLIDING_HARDWARE_RULES,
  SAMPLE_SOURCE,
  SLIDING_CREMONA_OFFSET,
  buildLineRules,
  genericRulesFor,
  hardwareRangeGaps,
} from './rules'
export type { HardwareRangeGap, LineRuleOptions, ResolvedRules } from './rules'
export { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from './sample'
export { CATALOG_STATS, catalogStats } from './stats'
export type { CatalogStats } from './stats'
export {
  READINESS_ROLE_NAME,
  TYPICAL_PAUTA_PREFIX,
  VERIFIED_EVIDENCE_PATTERN,
  VERIFIED_SOURCE_MARK,
  brandReadiness,
  catalogReadiness,
  lineReadiness,
  readinessIndex,
  requiredRolesFor,
} from './readiness'
export type { LineReadiness, ReadinessIndex, ReadinessState, RoleGap } from './readiness'
export { matchMisPrecios, misPreciosRowKind } from './misprecios'
export type { MisPreciosMatch, MisPreciosRowKind } from './misprecios'
export { cleanLabel, normalizeKey, parseDecimal, slug } from './text'

/** Alias en mayúsculas pedidos por la especificación. */
export { GENERIC_HARDWARE_RULES as HARDWARE_RULES, GENERIC_ACCESSORY_RULES as ACCESSORY_RULES } from './rules'
