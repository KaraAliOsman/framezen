/**
 * Ids de los diseños predefinidos (estables: se guardan en ajustes de la organización y en plantillas
 * duplicadas como `presetId`) y equivalencia con los ids de diseño v4, para que los ajustes ya
 * guardados sigan funcionando sin migrar datos.
 */
import type { DocTemplateKind } from './kinds'

export const QUOTE_PRESET_IDS = ['atelier', 'corporativa', 'obra', 'hogar', 'memoria'] as const

export const CATALOG_PRESET_IDS = ['habitar', 'sistema', 'coleccion-modular', 'materia-y-color'] as const

export const DOC_PRESET_IDS = [...QUOTE_PRESET_IDS, ...CATALOG_PRESET_IDS] as const

export type QuotePresetId = (typeof QUOTE_PRESET_IDS)[number]
export type CatalogPresetId = (typeof CATALOG_PRESET_IDS)[number]
export type DocPresetId = (typeof DOC_PRESET_IDS)[number]

export const DEFAULT_QUOTE_PRESET_ID: QuotePresetId = 'hogar'
export const DEFAULT_CATALOG_PRESET_ID: CatalogPresetId = 'coleccion-modular'

export function isDocPresetId(value: unknown): value is DocPresetId {
  return typeof value === 'string' && (DOC_PRESET_IDS as readonly string[]).includes(value)
}

export function presetKind(id: DocPresetId): DocTemplateKind {
  return (QUOTE_PRESET_IDS as readonly string[]).includes(id) ? 'quote' : 'catalog'
}

/** Ids de diseño v4 (`DocumentPrefs.quoteTemplate` / `catalogTemplate`). */
export const LEGACY_QUOTE_TEMPLATE_IDS = ['esencial', 'galeria', 'compacta', 'editorial'] as const
export const LEGACY_CATALOG_TEMPLATE_IDS = ['vitrina', 'ficha', 'lookbook'] as const
/** Diseños de cotización v5, retirados en v6 (quedan en ajustes y plantillas duplicadas ya guardadas). */
export const RETIRED_QUOTE_PRESET_IDS = [
  'luz',
  'plano',
  'umbral-atelier',
  'casa-por-casa',
  'taller-directo',
  'confort-medible',
  'linea-negra',
  'patrimonio',
  'obra-control',
  'decision-clara',
] as const
export type LegacyQuoteTemplateId = (typeof LEGACY_QUOTE_TEMPLATE_IDS)[number]
export type LegacyCatalogTemplateId = (typeof LEGACY_CATALOG_TEMPLATE_IDS)[number]
export type RetiredQuotePresetId = (typeof RETIRED_QUOTE_PRESET_IDS)[number]

/**
 * Ids antiguos → diseño vigente. Criterio: misma estructura de página y mismo público.
 *
 * Residencial (filas con dibujo, tarjetas por recinto, propuesta educativa) → Hogar · portada con
 * producto protagonista, dossier con carta → Atelier · planilla → Obra · juego de planos → Memoria ·
 * contratos por etapas y hoja de decisión → Corporativa. Catálogo: vitrina → Colección Modular,
 * ficha → Sistema, lookbook → Habitar.
 */
export const LEGACY_TEMPLATE_PRESETS: Readonly<Record<LegacyQuoteTemplateId | LegacyCatalogTemplateId | RetiredQuotePresetId, DocPresetId>> = {
  esencial: 'hogar',
  galeria: 'hogar',
  compacta: 'obra',
  editorial: 'atelier',
  vitrina: 'coleccion-modular',
  ficha: 'sistema',
  lookbook: 'habitar',
  luz: 'hogar',
  plano: 'memoria',
  'umbral-atelier': 'atelier',
  'casa-por-casa': 'hogar',
  'taller-directo': 'obra',
  'confort-medible': 'hogar',
  'linea-negra': 'atelier',
  patrimonio: 'atelier',
  'obra-control': 'corporativa',
  'decision-clara': 'corporativa',
}

export function isLegacyTemplateId(value: unknown): value is keyof typeof LEGACY_TEMPLATE_PRESETS {
  return typeof value === 'string' && Object.hasOwn(LEGACY_TEMPLATE_PRESETS, value)
}
