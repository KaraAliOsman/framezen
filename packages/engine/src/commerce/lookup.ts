import type { Brand, BrandSettings, Catalog, Color, Glass, Id, Item, Line, Profile } from '../types'
import { defaultBrandSettings } from './defaults'

/**
 * Búsquedas por id sobre el catálogo con índice en caché por arreglo (el catálogo puede
 * traer miles de ítems y el precio se recalcula en cada tecla). El índice guarda posiciones,
 * así una entrada reemplazada en el mismo lugar se lee al día; si el arreglo cambia de largo
 * o la posición ya no calza, se reconstruye.
 */
type Index = { size: number; positions: Map<string, number> }

const byIdCache = new WeakMap<readonly object[], Index>()
const byBrandCache = new WeakMap<readonly object[], Index>()

function lookup<T extends object>(
  list: readonly T[] | undefined,
  id: string | undefined,
  key: (entry: T) => string,
  cache: WeakMap<readonly object[], Index>,
): T | undefined {
  if (!list || id === undefined || id === null) return undefined
  const build = (): Index => {
    const positions = new Map<string, number>()
    list.forEach((entry, i) => {
      const k = entry ? key(entry) : undefined
      if (k !== undefined && !positions.has(k)) positions.set(k, i)
    })
    const fresh = { size: list.length, positions }
    cache.set(list, fresh)
    return fresh
  }
  let index = cache.get(list)
  if (!index || index.size !== list.length) index = build()
  const at = index.positions.get(id)
  const hit = at === undefined ? undefined : list[at]
  if (hit && key(hit) === id) return hit
  // Fallo o entrada cambiada en el lugar: se confirma recorriendo y, si aparece, se reindexa.
  const found = list.find((entry) => entry && key(entry) === id)
  if (found) build()
  return found
}

export interface CatalogLookup {
  catalog: Catalog
  line(id?: Id): Line | undefined
  profile(id?: Id): Profile | undefined
  item(id?: Id): Item | undefined
  glass(id?: Id): Glass | undefined
  color(id?: Id): Color | undefined
  brand(id?: Id): Brand | undefined
  /** Ajustes guardados de la marca (o el reemplazo indicado); undefined si no hay. */
  explicitBrandSettings(brandId?: Id): BrandSettings | undefined
  /** Ajustes efectivos de la marca: guardados, reemplazo o por defecto (sin descuentos). */
  brandSettings(brandId?: Id): BrandSettings
  /** Marca del perfil: la de su línea, o la indicada como respaldo. */
  profileBrandId(profile: Profile | undefined, fallback?: Id): Id | undefined
}

/**
 * Crea las búsquedas sobre un catálogo. `override` reemplaza los ajustes de SU marca
 * (`override.brandId`), útil para previsualizar «Mis precios» sin guardar.
 */
export function catalogLookup(catalog: Catalog, override?: BrandSettings): CatalogLookup {
  const byId = <T extends { id: string }>(list: readonly T[] | undefined, id?: Id) =>
    lookup(list, id, (e) => e.id, byIdCache)
  const explicitBrandSettings = (brandId?: Id): BrandSettings | undefined => {
    if (brandId === undefined) return undefined
    if (override && override.brandId === brandId) return override
    return lookup(catalog.brandSettings, brandId, (e) => e.brandId, byBrandCache)
  }
  const api: CatalogLookup = {
    catalog,
    line: (id) => byId(catalog.lines, id),
    profile: (id) => byId(catalog.profiles, id),
    item: (id) => byId(catalog.items, id),
    glass: (id) => byId(catalog.glass, id),
    color: (id) => byId(catalog.colors, id),
    brand: (id) => byId(catalog.brands, id),
    explicitBrandSettings,
    brandSettings: (brandId) => explicitBrandSettings(brandId) ?? defaultBrandSettings(brandId ?? ''),
    profileBrandId: (profile, fallback) => (profile ? api.line(profile.lineId)?.brandId : undefined) ?? fallback,
  }
  return api
}

/** Descuento (0–100) de una familia en los ajustes de marca, saneado. */
export function familyDiscount(settings: BrandSettings, family: keyof BrandSettings['discounts']): number {
  const value = settings.discounts?.[family]
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const GENERIC_PRICE_KEYS = ['*', 'default', 'any', ''] as const

/**
 * Precio de lista de la barra en un color. Los refuerzos (sin color) toman el precio
 * genérico o el único que tengan. Devuelve undefined si no hay precio utilizable.
 */
export function profileBarPrice(profile: Profile, colorId?: Id): number | undefined {
  const prices = profile.priceByColor ?? {}
  const usable = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (colorId !== undefined && usable(prices[colorId])) return prices[colorId]
  for (const key of GENERIC_PRICE_KEYS) if (usable(prices[key])) return prices[key]
  if (colorId === undefined || profile.role === 'reinforcement') {
    for (const value of Object.values(prices)) if (usable(value)) return value
  }
  return undefined
}
