import type { Catalog } from '@framezen/engine'

export interface CatalogStats {
  brands: number
  lines: number
  profiles: number
  /** Perfiles con al menos un color con precio > 0. */
  profilesPriced: number
  profilesUnpriced: number
  items: number
  itemsPriced: number
  itemsUnpriced: number
  glass: number
  glassPriced: number
  glassUnpriced: number
  colors: number
  linesByKind: { casement: number; sliding: number }
  linesByCompleteness: { verified: number; complete: number; partial: number }
}

/** Cifras de un catálogo (para reportes, pantallas de catálogo y pruebas). */
export function catalogStats(catalog: Catalog): CatalogStats {
  const profilesPriced = catalog.profiles.filter((profile) => Object.values(profile.priceByColor).some((price) => price > 0)).length
  const itemsPriced = catalog.items.filter((item) => item.price > 0).length
  const glassPriced = catalog.glass.filter((glass) => glass.pricePerM2 > 0).length
  const count = <T>(values: T[], test: (value: T) => boolean) => values.filter(test).length
  return {
    brands: catalog.brands.length,
    lines: catalog.lines.length,
    profiles: catalog.profiles.length,
    profilesPriced,
    profilesUnpriced: catalog.profiles.length - profilesPriced,
    items: catalog.items.length,
    itemsPriced,
    itemsUnpriced: catalog.items.length - itemsPriced,
    glass: catalog.glass.length,
    glassPriced,
    glassUnpriced: catalog.glass.length - glassPriced,
    colors: catalog.colors.length,
    linesByKind: {
      casement: count(catalog.lines, (line) => line.kind === 'casement'),
      sliding: count(catalog.lines, (line) => line.kind === 'sliding'),
    },
    linesByCompleteness: {
      verified: count(catalog.lines, (line) => line.completeness === 'verified'),
      complete: count(catalog.lines, (line) => line.completeness === 'complete'),
      partial: count(catalog.lines, (line) => (line.completeness ?? 'partial') === 'partial'),
    },
  }
}

/** Alias con el nombre usado en la especificación de la zona. */
export const CATALOG_STATS = catalogStats
