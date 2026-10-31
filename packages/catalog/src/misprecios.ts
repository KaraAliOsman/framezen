/**
 * Aplicar una lista «MisPrecios» subida desde la interfaz sobre un catálogo
 * existente: produce precios propios (`PriceOverride`) sin tocar el catálogo base.
 *
 * Cada fila calza solo con lo de su tipo: una fila de perfil con perfiles, una de herraje,
 * accesorio o insumo con artículos, una de vidrio con vidrios. Así un herraje cuyo código
 * se parece al de un perfil nunca pisa el precio de ese perfil.
 */
import type { Catalog, Item, Profile } from '@framezen/engine'
import type { PriceOverride } from '@framezen/shared'
import { isPlaceholderPrice, itemKind, parseGlass, rowStatus } from './classify'
import { colorFromCode, modelGroupKey, profileModelCode } from './codes'
import { isColorless, normalizeColor } from './colors'
import type { MisPreciosRow } from './csv'
import { cleanLabel, normalizeKey } from './text'

export interface MisPreciosMatch {
  overrides: PriceOverride[]
  /** Filas que actualizaron al menos un precio. */
  matched: number
  /** Filas válidas que no se encontraron en el catálogo. */
  unmatched: MisPreciosRow[]
  /** Filas omitidas: sin precio, precio de relleno o marcadas «NO USAR». */
  skipped: number
}

/** Tipo de fila según su grupo («Perfil · Marco», «Herraje · Hoja», «Vidrio»…). */
export type MisPreciosRowKind = 'profile' | 'item' | 'glass' | 'unknown'

const PROFILE_GROUPS = new Set(['PERFIL', 'REFUERZO', 'JUNQUILLO', 'COMPLEMENTARIO'])

export function misPreciosRowKind(row: Pick<MisPreciosRow, 'group' | 'subtype' | 'description'>): MisPreciosRowKind {
  const group = normalizeKey(row.group ?? '')
  const subtype = normalizeKey(row.subtype ?? '')
  if (group === 'VIDRIO' || subtype === 'VIDRIO' || /^V\./.test(subtype)) return 'glass'
  if (PROFILE_GROUPS.has(group)) return 'profile'
  if (group) return 'item'
  // Sin grupo: si el nombre dice herraje, accesorio o insumo, se trata como artículo.
  return itemKind('', row.description) !== 'other' ? 'item' : 'unknown'
}

function brandMatches(catalogBrandName: string, rowBrand: string): boolean {
  const a = normalizeKey(cleanLabel(catalogBrandName)).replace(/[^A-Z0-9]/g, '')
  const b = normalizeKey(cleanLabel(rowBrand)).replace(/[^A-Z0-9]/g, '')
  return a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b))
}

/**
 * Busca cada fila del CSV en el catálogo (perfil por modelo y color, herraje por
 * código o nombre, vidrio por nombre) y devuelve los precios a sobrescribir.
 */
export function matchMisPrecios(catalog: Catalog, rows: MisPreciosRow[]): MisPreciosMatch {
  const overrides = new Map<string, PriceOverride>()
  const unmatched: MisPreciosRow[] = []
  let matched = 0
  let skipped = 0

  const lineBrand = new Map(catalog.lines.map((line) => [line.id, line.brandId]))
  const profilesByBrand = new Map<string, Map<string, Profile[]>>()
  for (const profile of catalog.profiles) {
    const brandId = lineBrand.get(profile.lineId) ?? ''
    const byKey = profilesByBrand.get(brandId) ?? new Map<string, Profile[]>()
    const key = modelGroupKey(profile.code)
    byKey.set(key, [...(byKey.get(key) ?? []), profile])
    profilesByBrand.set(brandId, byKey)
  }

  for (const row of rows) {
    if (row.price <= 0 || isPlaceholderPrice(row.price) || rowStatus(row.description, row.code, row.line) !== 'ok') {
      skipped++
      continue
    }
    const brands = catalog.brands.filter((brand) => brandMatches(brand.name, row.brand))
    const brandIds = new Set((brands.length ? brands : catalog.brands).map((brand) => brand.id))
    const brandName = brands[0]?.name ?? row.brand
    const kind = misPreciosRowKind(row)
    const code = normalizeKey(row.code)
    const name = normalizeKey(cleanLabel(row.description))
    let hit = false

    const matchProfiles = (): boolean => {
      const colorId = isColorless(row.color) ? colorFromCode(brandName, row.code) : normalizeColor(row.color).id
      const model = modelGroupKey(profileModelCode(brandName, row.code, row.description, colorId))
      let found = false
      for (const brandId of brandIds) {
        for (const profile of profilesByBrand.get(brandId)?.get(model) ?? []) {
          const colors = colorId ? [colorId] : Object.keys(profile.priceByColor)
          for (const color of colors.length ? colors : ['blanco']) {
            overrides.set(`profile:${profile.id}:${color}`, { kind: 'profile', id: profile.id, colorId: color, price: row.price })
          }
          found = true
        }
      }
      return found
    }
    const matchItem = (byNameToo: boolean): boolean => {
      const inBrand = catalog.items.filter((candidate) => brandIds.has(candidate.brandId))
      const sameCode = code ? inBrand.filter((candidate) => normalizeKey(candidate.code) === code) : []
      // Mismo código con varios artículos (descripciones distintas): solo calza el que además tiene el mismo nombre.
      const item: Item | undefined =
        (sameCode.length === 1 ? sameCode[0] : sameCode.find((candidate) => normalizeKey(candidate.name) === name)) ??
        (byNameToo ? inBrand.find((candidate) => normalizeKey(candidate.name) === name) : undefined)
      if (!item) return false
      overrides.set(`item:${item.id}`, { kind: 'item', id: item.id, price: row.price })
      return true
    }
    const matchGlass = (): boolean => {
      const parsed = parseGlass(row.description)
      const glassName = parsed ? normalizeKey(parsed.name) : ''
      const glass = parsed && catalog.glass.find((candidate) => (!candidate.brandId || brandIds.has(candidate.brandId)) && normalizeKey(candidate.name) === glassName)
      if (!glass) return false
      overrides.set(`glass:${glass.id}`, { kind: 'glass', id: glass.id, price: row.price })
      return true
    }

    if (kind === 'profile') hit = matchProfiles() || matchItem(false)
    else if (kind === 'item') hit = matchItem(true)
    else if (kind === 'glass') hit = matchGlass() || matchItem(false)
    else hit = matchProfiles() || matchItem(true) || matchGlass()

    if (hit) matched++
    else unmatched.push(row)
  }

  return { overrides: [...overrides.values()], matched, unmatched, skipped }
}
