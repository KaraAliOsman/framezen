/**
 * Lógica pura de la pestaña Precios: filas editables a partir del catálogo efectivo, filtros,
 * ajuste masivo por porcentaje (con su deshacer exacto) y aplicación optimista de precios propios.
 */
import type { Catalog, Id, Item, Profile, ProfileRole } from '@framezen/engine'
import type { PriceOverride } from '@framezen/shared'
import { formatMeters } from '@framezen/engine'
import { formatNumber, normalizeSearch } from '../../../lib/format'

export type PriceFamily = 'profile' | 'reinforcement' | 'hardware' | 'accessory' | 'glass'

export interface PriceRow {
  /** Clave del precio propio: `kind:id:color`. */
  key: string
  kind: PriceOverride['kind']
  family: PriceFamily
  id: Id
  colorId?: Id
  code: string
  name: string
  brandId: Id
  brandName: string
  lineId?: Id
  lineName?: string
  role?: ProfileRole
  /** «barra 5,8 m», «u», «caja de 1.000», «m²». */
  unit: string
  price: number
  /** Precio cargado por el taller (no el de lista). */
  own: boolean
  minArea?: number
}

export type FamilyFilter = 'all' | Exclude<PriceFamily, 'glass'>

/** Conjunto puntual de filas («Lo que falta en PRO6004»), con su etiqueta para el chip. */
export interface PriceFocus {
  label: string
  /** Claves de fila (`kind:id:color`). */
  keys: string[]
}

export interface PriceFilters {
  q: string
  family: FamilyFilter
  brandId: 'all' | Id
  lineId: 'all' | Id
  colorId: 'all' | Id
  /** Solo los que están en $0 (se cotizan sin ese costo). */
  missing: boolean
  /** Solo los que el taller cambió. */
  own: boolean
  /** Solo estas filas (lo que le falta a una línea para quedar lista para cotizar). */
  focus?: PriceFocus | null
}

export const EMPTY_FILTERS: PriceFilters = { q: '', family: 'all', brandId: 'all', lineId: 'all', colorId: 'all', missing: false, own: false, focus: null }

export const FAMILY_LABEL: Record<PriceFamily, string> = {
  profile: 'Perfiles',
  reinforcement: 'Refuerzos',
  hardware: 'Herrajes',
  accessory: 'Accesorios',
  glass: 'Vidrios',
}

export const FAMILY_SINGULAR: Record<PriceFamily, string> = {
  profile: 'Perfil',
  reinforcement: 'Refuerzo',
  hardware: 'Herraje',
  accessory: 'Accesorio',
  glass: 'Vidrio',
}

export function overrideKey(o: Pick<PriceOverride, 'kind' | 'id' | 'colorId'>): string {
  return `${o.kind}:${o.id}:${o.colorId ?? ''}`
}

/** Precio de un refuerzo: clave '*', o el primer precio que tenga. */
export function reinforcementPrice(profile: Profile): { price: number; colorKey?: string } {
  const entries = Object.entries(profile.priceByColor ?? {})
  if (profile.priceByColor?.['*'] !== undefined) return { price: profile.priceByColor['*'], colorKey: '*' }
  const priced = entries.find(([, v]) => v > 0) ?? entries[0]
  return priced ? { price: priced[1], colorKey: priced[0] } : { price: 0 }
}

export function itemUnitLabel(item: Pick<Item, 'unit' | 'packSize'>): string {
  const pack = item.packSize && item.packSize > 1 ? formatNumber(item.packSize) : ''
  switch (item.unit) {
    case 'caja':
      return pack ? `caja de ${pack}` : 'caja'
    case 'm':
      return pack ? `rollo de ${pack} m` : 'metro'
    case 'par':
      return 'par'
    case 'kit':
      return 'kit'
    case 'cartucho':
      return 'cartucho'
    default:
      return pack ? `envase de ${pack}` : 'unidad'
  }
}

export function itemFamily(item: Pick<Item, 'kind'>): 'hardware' | 'accessory' {
  return item.kind === 'hardware' ? 'hardware' : 'accessory'
}

/** Todas las filas de precio del catálogo efectivo (perfiles por color, refuerzos, herrajes, accesorios y vidrios). */
export function buildPriceRows(catalog: Catalog, overrides: readonly PriceOverride[] = []): PriceRow[] {
  const own = new Set(overrides.map(overrideKey))
  const ownIds = new Set(overrides.map((o) => `${o.kind}:${o.id}`))
  const brandName = new Map(catalog.brands.map((b) => [b.id, b.name]))
  const lines = new Map(catalog.lines.map((l) => [l.id, l]))
  const rows: PriceRow[] = []
  // Colores que ofrece cada línea para los perfiles que usa por defecto: aunque la lista no traiga
  // ese color, la fila existe para que el taller pueda cargar el precio que falta.
  const offeredColors = new Map<Id, Set<Id>>()
  for (const line of catalog.lines) {
    for (const id of [...Object.values(line.profiles ?? {}), line.sashInProfileId]) {
      if (!id) continue
      const set = offeredColors.get(id) ?? new Set<Id>()
      for (const colorId of line.colorIds ?? []) set.add(colorId)
      offeredColors.set(id, set)
    }
  }

  for (const profile of catalog.profiles) {
    const line = lines.get(profile.lineId)
    const brandId = line?.brandId ?? ''
    const common = {
      kind: 'profile' as const,
      id: profile.id,
      code: profile.code,
      name: profile.name,
      brandId,
      brandName: brandName.get(brandId) ?? brandId,
      lineId: profile.lineId,
      lineName: line?.name,
      role: profile.role,
      unit: `barra ${formatMeters(profile.barLength || 5800)}`,
    }
    if (profile.role === 'reinforcement') {
      const { price } = reinforcementPrice(profile)
      rows.push({ ...common, key: overrideKey({ kind: 'profile', id: profile.id }), family: 'reinforcement', price, own: ownIds.has(`profile:${profile.id}`) })
      continue
    }
    const colors = [...new Set([...Object.keys(profile.priceByColor ?? {}), ...(offeredColors.get(profile.id) ?? [])])]
    if (colors.length === 0) {
      rows.push({ ...common, key: overrideKey({ kind: 'profile', id: profile.id }), family: 'profile', price: 0, own: ownIds.has(`profile:${profile.id}`) })
      continue
    }
    for (const colorId of colors) {
      const key = overrideKey({ kind: 'profile', id: profile.id, colorId })
      rows.push({
        ...common,
        key,
        family: 'profile',
        colorId,
        price: profile.priceByColor[colorId] ?? 0,
        own: own.has(key) || own.has(overrideKey({ kind: 'profile', id: profile.id })),
      })
    }
  }

  for (const item of catalog.items) {
    const key = overrideKey({ kind: 'item', id: item.id })
    rows.push({
      key,
      kind: 'item',
      family: itemFamily(item),
      id: item.id,
      code: item.code,
      name: item.name,
      brandId: item.brandId,
      brandName: brandName.get(item.brandId) ?? item.brandId,
      unit: itemUnitLabel(item),
      price: item.price ?? 0,
      own: own.has(key),
    })
  }

  for (const glass of catalog.glass) {
    const key = overrideKey({ kind: 'glass', id: glass.id })
    rows.push({
      key,
      kind: 'glass',
      family: 'glass',
      id: glass.id,
      code: glass.composition ?? '',
      name: glass.name,
      brandId: glass.brandId ?? '',
      brandName: glass.brandId ? (brandName.get(glass.brandId) ?? glass.brandId) : 'Sin marca',
      unit: 'm²',
      price: glass.pricePerM2 ?? 0,
      own: own.has(key),
      minArea: glass.minArea,
    })
  }
  return rows
}

/** Texto donde busca la caja de búsqueda (sin tildes ni mayúsculas). */
export function rowSearchText(row: PriceRow, colorName?: string): string {
  return normalizeSearch([row.code, row.name, row.lineName, row.brandName, colorName].filter(Boolean).join(' '))
}

export function filterRows(rows: readonly PriceRow[], filters: PriceFilters, colorNames?: ReadonlyMap<Id, string>): PriceRow[] {
  const terms = normalizeSearch(filters.q).split(/\s+/).filter(Boolean)
  const focus = filters.focus ? new Set(filters.focus.keys) : null
  return rows.filter((row) => {
    if (focus && !focus.has(row.key)) return false
    if (filters.family !== 'all' && row.family !== filters.family) return false
    if (filters.brandId !== 'all' && row.brandId !== filters.brandId) return false
    if (filters.lineId !== 'all' && row.lineId !== filters.lineId) return false
    // El color solo existe en perfiles: filtrar por color deja solo esas filas (así un ajuste
    // masivo «+5 % al nogal» nunca toca herrajes ni refuerzos).
    if (filters.colorId !== 'all' && row.colorId !== filters.colorId) return false
    if (filters.missing && row.price > 0) return false
    if (filters.own && !row.own) return false
    if (terms.length) {
      const text = rowSearchText(row, row.colorId ? colorNames?.get(row.colorId) : undefined)
      if (!terms.every((t) => text.includes(t))) return false
    }
    return true
  })
}

/** Cuántos filtros están activos (para «Quitar filtros»). */
export function activeFilterCount(filters: PriceFilters): number {
  return (
    Number(Boolean(filters.q.trim())) +
    Number(filters.family !== 'all') +
    Number(filters.brandId !== 'all') +
    Number(filters.lineId !== 'all') +
    Number(filters.colorId !== 'all') +
    Number(filters.missing) +
    Number(filters.own) +
    Number(Boolean(filters.focus))
  )
}

export function toOverride(row: Pick<PriceRow, 'kind' | 'id' | 'colorId'>, price: number): PriceOverride {
  return { kind: row.kind, id: row.id, ...(row.colorId ? { colorId: row.colorId } : {}), price: Math.max(0, Math.round(price)) }
}

export interface PriceChange {
  overrides: PriceOverride[]
  remove: Omit<PriceOverride, 'price'>[]
}

/** Lo necesario para volver exactamente al estado anterior de estas filas. */
export function undoFor(rows: readonly PriceRow[]): PriceChange {
  const overrides: PriceOverride[] = []
  const remove: Omit<PriceOverride, 'price'>[] = []
  for (const row of rows) {
    if (row.own) overrides.push(toOverride(row, row.price))
    else remove.push({ kind: row.kind, id: row.id, ...(row.colorId ? { colorId: row.colorId } : {}) })
  }
  return { overrides, remove }
}

/** Precios propios guardados que afectan a esta fila (un refuerzo puede tener uno por color). */
export function overridesForRow(row: Pick<PriceRow, 'kind' | 'id' | 'colorId'>, overrides: readonly PriceOverride[]): PriceOverride[] {
  return overrides.filter((o) => o.kind === row.kind && o.id === row.id && (row.colorId === undefined || o.colorId === row.colorId || o.colorId === undefined))
}

/**
 * Cambio para fijar el precio de una fila. En filas sin color (refuerzos) se quitan los precios
 * por color que pudiera haber traído una importación, para que el nuevo valor mande en todos.
 */
export function editChange(row: PriceRow, price: number, overrides: readonly PriceOverride[] = []): PriceChange {
  const remove =
    row.colorId === undefined
      ? overrides.filter((o) => o.kind === row.kind && o.id === row.id && o.colorId !== undefined).map(({ kind, id, colorId }) => ({ kind, id, colorId }))
      : []
  return { overrides: [toOverride(row, price)], remove }
}

/** Cambio para volver al precio de lista (quita todos los precios propios de la fila). */
export function resetChange(row: PriceRow, overrides: readonly PriceOverride[] = []): PriceChange {
  const own = overridesForRow(row, overrides).filter((o) => row.colorId === undefined || o.colorId === row.colorId)
  const remove = own.length ? own.map(({ kind, id, colorId }) => ({ kind, id, ...(colorId ? { colorId } : {}) })) : [{ kind: row.kind, id: row.id, ...(row.colorId ? { colorId: row.colorId } : {}) }]
  return { overrides: [], remove }
}

/** Redondeo amable para listas de precios: al peso bajo $1.000, a $10 hasta $100.000, a $100 sobre eso. */
export function friendlyRound(value: number): number {
  const v = Math.max(0, value)
  if (v < 1000) return Math.round(v)
  if (v < 100_000) return Math.round(v / 10) * 10
  return Math.round(v / 100) * 100
}

export interface BulkAdjustResult {
  change: PriceChange
  undo: PriceChange
  /** Filas que cambian de precio. */
  changed: number
  /** Filas en $0 que no se tocan (no hay base para un porcentaje). */
  skipped: number
  /** Suma de precios antes y después (para el resumen). */
  before: number
  after: number
}

/**
 * Sube o baja en `pct` % los precios de las filas (las que están en $0 se omiten).
 * `round` = redondeo amable (por defecto) o exacto al peso.
 */
export function bulkAdjust(rows: readonly PriceRow[], pct: number, options: { round?: 'friendly' | 'exact' } = {}): BulkAdjustResult {
  const safePct = Number.isFinite(pct) ? pct : 0
  const factor = 1 + safePct / 100
  const round = options.round === 'exact' ? (v: number) => Math.max(0, Math.round(v)) : friendlyRound
  const changedRows: PriceRow[] = []
  const overrides: PriceOverride[] = []
  let skipped = 0
  let before = 0
  let after = 0
  for (const row of rows) {
    if (!(row.price > 0)) {
      skipped++
      continue
    }
    // 0 % no toca nada (ni siquiera redondea).
    if (safePct === 0) continue
    const next = round(row.price * factor)
    if (next === row.price) continue
    changedRows.push(row)
    overrides.push(toOverride(row, next))
    before += row.price
    after += next
  }
  return { change: { overrides, remove: [] }, undo: undoFor(changedRows), changed: changedRows.length, skipped, before, after }
}

/** Precios sin valor (en $0) por familia. */
export function missingByFamily(rows: readonly PriceRow[]): Record<PriceFamily, number> {
  const out: Record<PriceFamily, number> = { profile: 0, reinforcement: 0, hardware: 0, accessory: 0, glass: 0 }
  for (const row of rows) if (!(row.price > 0)) out[row.family]++
  return out
}

/**
 * Aplica precios propios sobre una copia del catálogo (misma regla que el servidor: primero los
 * generales de un perfil, después los de un color). Sirve para la respuesta optimista.
 */
export function applyOverridesToCatalog<C extends Catalog>(catalog: C, overrides: readonly PriceOverride[]): C {
  if (!overrides.length) return catalog
  const profileOv = new Map<Id, PriceOverride[]>()
  const itemOv = new Map<Id, number>()
  const glassOv = new Map<Id, number>()
  for (const o of overrides) {
    if (o.kind === 'profile') profileOv.set(o.id, [...(profileOv.get(o.id) ?? []), o])
    else if (o.kind === 'item') itemOv.set(o.id, o.price)
    else glassOv.set(o.id, o.price)
  }
  const lines = new Map(catalog.lines.map((l) => [l.id, l]))
  return {
    ...catalog,
    profiles: profileOv.size
      ? catalog.profiles.map((p) => {
          const list = profileOv.get(p.id)
          if (!list) return p
          const priceByColor = { ...p.priceByColor }
          for (const o of list.filter((x) => !x.colorId)) {
            const keys = Object.keys(priceByColor).length ? Object.keys(priceByColor) : (lines.get(p.lineId)?.colorIds ?? [])
            for (const k of keys) priceByColor[k] = o.price
          }
          for (const o of list.filter((x) => x.colorId)) priceByColor[o.colorId!] = o.price
          return { ...p, priceByColor }
        })
      : catalog.profiles,
    items: itemOv.size ? catalog.items.map((i) => (itemOv.has(i.id) ? { ...i, price: itemOv.get(i.id)! } : i)) : catalog.items,
    glass: glassOv.size ? catalog.glass.map((g) => (glassOv.has(g.id) ? { ...g, pricePerM2: glassOv.get(g.id)! } : g)) : catalog.glass,
  }
}

/** Orden estable para la tabla: familia (perfiles primero), marca, línea, código, color. */
export function sortRows(rows: PriceRow[], colorOrder?: ReadonlyMap<Id, number>): PriceRow[] {
  const familyOrder: Record<PriceFamily, number> = { profile: 0, reinforcement: 1, hardware: 2, accessory: 3, glass: 4 }
  return [...rows].sort(
    (a, b) =>
      familyOrder[a.family] - familyOrder[b.family] ||
      a.brandName.localeCompare(b.brandName, 'es') ||
      (a.lineName ?? '').localeCompare(b.lineName ?? '', 'es') ||
      a.code.localeCompare(b.code, 'es', { numeric: true }) ||
      (colorOrder?.get(a.colorId ?? '') ?? 99) - (colorOrder?.get(b.colorId ?? '') ?? 99),
  )
}
