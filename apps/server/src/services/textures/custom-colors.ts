/**
 * Colores propios de la organización (foliados con textura, nombre y precio) y texturas propias
 * sobre colores del catálogo base. Se guardan en `org_catalog.custom`:
 *
 * - `custom.colors`: `Color` del motor (id `custom-…`, nombre, hex de respaldo, código, textura).
 *   El catálogo efectivo ya los mezcla con los del catálogo base (`buildEffectiveCatalog`).
 * - `custom.colorSettings[id]`: líneas que lo ofrecen, factor de precio y color de referencia,
 *   archivado (deshacer), fechas.
 * - `custom.colorTextures[id]`: textura propia sobre un color base (p. ej. la foto del «Nogal» del
 *   proveedor del taller), sin duplicar el color ni tocar sus precios.
 *
 * `applyCustomColors` es la única regla de mezcla (catálogo efectivo del servidor, el motor del
 * navegador recibe el resultado ya mezclado): agrega el color a `line.colorIds` de sus líneas y,
 * si tiene factor, precia sus perfiles como «precio del color de referencia × factor» salvo que la
 * organización haya cargado un precio propio para ese color (Precios → precio por color).
 */
import { and, eq, isNull } from 'drizzle-orm'
import type { Catalog, Color, Id, Profile } from '@dekopen/engine'
import {
  CUSTOM_COLOR_ID_PREFIX,
  isBuiltinTextureId,
  type CatalogColorView,
  type CustomColorSettings,
  type TextureRef,
} from '@dekopen/shared'
import type { AppDeps } from '../../context'
import { assets, orgCatalog, type CustomCatalog } from '../../db/schema'

/** `custom` con las claves de colores propios (el resto del objeto no se toca). */
export type CustomCatalogWithColors = CustomCatalog & {
  colorSettings?: Record<Id, CustomColorSettings>
  colorTextures?: Record<Id, TextureRef>
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function customColorsOf(custom: CustomCatalog | null | undefined): Color[] {
  return Array.isArray(custom?.colors) ? custom.colors.filter((c) => isRecord(c) && typeof c.id === 'string') : []
}

export function colorSettingsOf(custom: CustomCatalog | null | undefined): Record<Id, CustomColorSettings> {
  const raw: unknown = (custom as CustomCatalogWithColors | null | undefined)?.colorSettings
  if (!isRecord(raw)) return {}
  const out: Record<Id, CustomColorSettings> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue
    const lineIds = Array.isArray(value.lineIds) ? value.lineIds.filter((l): l is string => typeof l === 'string') : []
    out[id] = { ...(value as unknown as CustomColorSettings), lineIds }
  }
  return out
}

export function colorTexturesOf(custom: CustomCatalog | null | undefined): Record<Id, TextureRef> {
  const raw: unknown = (custom as CustomCatalogWithColors | null | undefined)?.colorTextures
  if (!isRecord(raw)) return {}
  const out: Record<Id, TextureRef> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue
    if (value.kind === 'builtin' && isBuiltinTextureId(value.id)) out[id] = value as unknown as TextureRef
    else if (value.kind === 'upload' && typeof value.assetId === 'string') out[id] = value as unknown as TextureRef
  }
  return out
}

// ── Mezcla en el catálogo efectivo ───────────────────────────────────────────

const usable = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const GENERIC_PRICE_KEYS = ['*', 'default', 'any', '']

/** Precio de referencia de un perfil para calcular un color propio por factor. */
export function referencePrice(profile: Profile, lineColorIds: readonly Id[], preferred?: Id): number | undefined {
  const prices = profile.priceByColor ?? {}
  if (preferred && usable(prices[preferred])) return prices[preferred]
  for (const id of lineColorIds) if (!id.startsWith(CUSTOM_COLOR_ID_PREFIX) && usable(prices[id])) return prices[id]
  for (const key of GENERIC_PRICE_KEYS) if (usable(prices[key])) return prices[key]
  return undefined
}

/**
 * Aplica colores propios y texturas propias sobre un catálogo ya mezclado (después de los precios
 * propios). Devuelve el mismo objeto si no hay nada que aplicar.
 */
export function applyCustomColors<C extends Catalog>(catalog: C, custom: CustomCatalog | null | undefined): C {
  const settings = colorSettingsOf(custom)
  const overrides = colorTexturesOf(custom)
  const ownIds = new Set(customColorsOf(custom).map((c) => c.id))
  if (!ownIds.size && !Object.keys(overrides).length) return catalog

  // Un color propio nunca tapa a uno del catálogo base (ni se repite): gana el primero.
  const seen = new Set<Id>()
  const colors: Color[] = []
  for (const color of catalog.colors) {
    if (seen.has(color.id)) continue
    seen.add(color.id)
    const texture = overrides[color.id]
    const own = ownIds.has(color.id) ? settings[color.id] : undefined
    if (own && color.id.startsWith(CUSTOM_COLOR_ID_PREFIX) && usable(own.priceFactor) && own.lineIds.length) {
      colors.push({ ...color, priceFrom: { factor: own.priceFactor, ...(own.priceBaseColorId ? { colorId: own.priceBaseColorId } : {}) } })
      continue
    }
    colors.push(texture && !ownIds.has(color.id) ? { ...color, texture } : color)
  }

  const active = [...ownIds].filter((id) => settings[id] && !settings[id]!.archivedAt)
  const byLine = new Map<Id, Id[]>()
  for (const id of active) for (const lineId of settings[id]!.lineIds) byLine.set(lineId, [...(byLine.get(lineId) ?? []), id])
  const lines = byLine.size
    ? catalog.lines.map((line) => {
        const extra = (byLine.get(line.id) ?? []).filter((id) => !line.colorIds.includes(id))
        return extra.length ? { ...line, colorIds: [...line.colorIds, ...extra] } : line
      })
    : catalog.lines

  // Precio por factor (también para archivados: las cotizaciones que ya lo usan siguen cotizando).
  const priced = [...ownIds].filter((id) => usable(settings[id]?.priceFactor) && settings[id]!.lineIds.length)
  let profiles = catalog.profiles
  if (priced.length) {
    const lineColors = new Map(catalog.lines.map((l) => [l.id, l.colorIds]))
    // Perfiles que una línea toma de otra de la marca (travesaño, acople…): también llevan el color
    // propio de las líneas que los usan, o la línea perdería colores listos para cotizar.
    const usedBy = new Map<Id, Id[]>()
    for (const line of catalog.lines) {
      for (const id of new Set([...Object.values(line.profiles ?? {}), line.sashInProfileId])) {
        if (id) usedBy.set(id, [...(usedBy.get(id) ?? []), line.id])
      }
    }
    profiles = catalog.profiles.map((profile) => {
      if (profile.role === 'reinforcement') return profile
      let next: Record<Id, number> | null = null
      for (const id of priced) {
        const s = settings[id]!
        const users = usedBy.get(profile.id) ?? []
        if (!s.lineIds.includes(profile.lineId) && !users.some((l) => s.lineIds.includes(l))) continue
        if (usable(profile.priceByColor?.[id])) continue // precio propio cargado: manda
        const refColors = [...(lineColors.get(profile.lineId) ?? []), ...users.flatMap((l) => lineColors.get(l) ?? [])]
        const base = referencePrice(profile, refColors, s.priceBaseColorId)
        if (base === undefined) continue
        next ??= { ...profile.priceByColor }
        next[id] = Math.round(base * s.priceFactor!)
      }
      return next ? { ...profile, priceByColor: next } : profile
    })
  }
  return { ...catalog, colors, lines, profiles }
}

// ── Vistas e ids ─────────────────────────────────────────────────────────────

export function toColorView(color: Color, settings: CustomColorSettings | undefined): CatalogColorView {
  return {
    id: color.id,
    name: color.name,
    hex: color.hex,
    ...(color.code ? { code: color.code } : {}),
    ...(color.texture ? { texture: color.texture as TextureRef } : {}),
    source: 'custom',
    lineIds: settings?.lineIds ?? [],
    ...(usable(settings?.priceFactor) ? { priceFactor: settings!.priceFactor } : {}),
    ...(settings?.priceBaseColorId ? { priceBaseColorId: settings.priceBaseColorId } : {}),
    archived: Boolean(settings?.archivedAt),
    ...(settings?.createdAt ? { createdAt: settings.createdAt } : {}),
    ...(settings?.updatedAt ? { updatedAt: settings.updatedAt } : {}),
  }
}

/** «Roble Rústico N°2» → «roble-rustico-n-2». */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'color'
  )
}

/** Id nuevo `custom-<slug>` que no choca con ningún id existente (base, propio o archivado). */
export function newCustomColorId(name: string, taken: ReadonlySet<string>): Id {
  const base = `${CUSTOM_COLOR_ID_PREFIX}${slugify(name)}`
  if (!taken.has(base)) return base
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

/** ¿La textura existe y es de esta organización? (las integradas siempre). */
export async function textureRefExists(deps: Pick<AppDeps, 'db'>, orgId: string, ref: TextureRef): Promise<boolean> {
  if (ref.kind === 'builtin') return isBuiltinTextureId(ref.id)
  const [row] = await deps.db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), eq(assets.id, ref.assetId), eq(assets.kind, 'texture'), isNull(assets.deletedAt)))
    .limit(1)
  return Boolean(row)
}

/** Guarda `custom` completo (misma regla que el resto de las escrituras del catálogo). */
export async function saveCustomCatalog(deps: Pick<AppDeps, 'db' | 'now'>, orgId: string, custom: CustomCatalogWithColors): Promise<Date> {
  const now = deps.now()
  await deps.db
    .insert(orgCatalog)
    .values({ orgId, enabledBrandIds: [], custom, updatedAt: now })
    .onConflictDoUpdate({ target: orgCatalog.orgId, set: { custom, updatedAt: now } })
  return now
}

/** Colores propios que usan una textura subida (para avisar al borrarla). */
export function colorsUsingTexture(custom: CustomCatalog | null | undefined, assetId: string): Id[] {
  const own = customColorsOf(custom)
    .filter((c) => c.texture?.kind === 'upload' && c.texture.assetId === assetId)
    .map((c) => c.id)
  const overrides = Object.entries(colorTexturesOf(custom))
    .filter(([, t]) => t.kind === 'upload' && t.assetId === assetId)
    .map(([id]) => id)
  return [...own, ...overrides]
}
