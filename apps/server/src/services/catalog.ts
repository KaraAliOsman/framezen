/**
 * Catálogo efectivo de cada organización = catálogo base (versionado, compartido)
 * + marcas activas + ajustes por marca + precios propios + ítems propios.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { desc, eq, sql } from 'drizzle-orm'
import type { BrandSettings, Catalog, Id, Line, Pauta } from '@framezen/engine'
import type {
  CatalogBrandSummary,
  CatalogResponse,
  EffectiveLine,
  FactoryPauta,
  LineOverride,
  PautaPatch,
  PriceOverride,
  Quote,
} from '@framezen/shared'
import { rowsOf, type Db } from '../db/client'
import { catalogBase, orgCatalog, quotes, type CustomCatalog } from '../db/schema'
import { newId, sha256 } from '../lib/crypto'
import type { Logger } from '../lib/logger'

// Tipos del contrato (antes definidos aquí): se re-exportan para las rutas y pruebas.
export type { CatalogBrandSummary, EffectiveLine, FactoryPauta, LineOverride, PautaPatch }

export interface BaseCatalog {
  id: string
  version: string
  source: string
  data: Catalog
  createdAt: Date
}

export interface OrgCatalogState {
  enabledBrandIds: Id[]
  brandSettings: BrandSettings[]
  priceOverrides: PriceOverride[]
  custom: CustomCatalog
  updatedAt: Date
}

export const EMPTY_CATALOG: Catalog = { colors: [], brands: [], lines: [], profiles: [], items: [], glass: [], brandSettings: [] }

/** Normaliza lo que venga en base.json: un Catalog directo o { catalog, version }. */
export function normalizeCatalogJson(json: unknown): { catalog: Catalog; version?: string } {
  const obj = (json ?? {}) as Record<string, unknown>
  const raw = (obj.catalog && typeof obj.catalog === 'object' ? obj.catalog : obj) as Partial<Catalog>
  const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : [])
  const catalog: Catalog = {
    colors: list(raw.colors),
    brands: list(raw.brands),
    lines: list(raw.lines),
    profiles: list(raw.profiles),
    items: list(raw.items),
    glass: list(raw.glass),
    brandSettings: list(raw.brandSettings),
  }
  const version = typeof obj.version === 'string' ? obj.version : typeof obj.generatedAt === 'string' ? obj.generatedAt : undefined
  return { catalog, version }
}

// ── Siembra ──────────────────────────────────────────────────────────────────

export interface SeedOptions {
  /** Ruta de base.json generado por el importador (si existe se usa). */
  sourcePath?: string
  /** Catálogo de ejemplo cuando no hay archivo. */
  fallback: () => Catalog
  /** Catálogo explícito (pruebas). Tiene prioridad sobre todo. */
  catalog?: Catalog
  logger?: Logger
}

/**
 * Siembra o RE-SIEMBRA el catálogo base (compartido por todas las organizaciones):
 * - Vacío: carga base.json (o el catálogo de ejemplo si no existe).
 * - Si el contenido de base.json cambió (hash distinto al de la versión vigente), agrega una
 *   versión nueva; lo mismo si no hay archivo y cambió el catálogo de ejemplo del código.
 * Nunca toca org_catalog: marcas activas, precios propios, pautas y áreas mínimas de cada
 * organización se aplican encima de la versión vigente.
 */
export async function seedCatalogBase(db: Db, options: SeedOptions): Promise<BaseCatalog> {
  const [latest] = await db
    .select({ id: catalogBase.id, hash: catalogBase.hash, source: catalogBase.source })
    .from(catalogBase)
    .orderBy(desc(catalogBase.createdAt))
    .limit(1)

  let candidate: { catalog: Catalog; version?: string; source: string } | undefined
  if (options.catalog) candidate = { catalog: options.catalog, source: 'explicit' }
  else if (options.sourcePath && existsSync(options.sourcePath)) {
    try {
      const parsed = normalizeCatalogJson(JSON.parse(readFileSync(options.sourcePath, 'utf8')))
      if (parsed.catalog.lines.length || parsed.catalog.items.length) candidate = { ...parsed, source: `file:${options.sourcePath}` }
      else options.logger?.warn(`El catálogo ${options.sourcePath} está vacío; uso el de ejemplo.`)
    } catch (error) {
      options.logger?.warn(`No pude leer ${options.sourcePath}; uso el catálogo de ejemplo.`, error)
    }
  }

  if (latest) {
    if (candidate?.source === 'explicit') return (await loadLatestBase(db))!
    // Sin archivo: sólo se actualiza si lo vigente es el catálogo de ejemplo y éste cambió.
    if (!candidate) {
      if (latest.source !== 'sample') return (await loadLatestBase(db))!
      candidate = { catalog: options.fallback(), source: 'sample' }
    }
    const hash = sha256(JSON.stringify(candidate.catalog))
    if (hash === latest.hash) return (await loadLatestBase(db))!
    const row = await insertBase(db, candidate.catalog, candidate.source, hash, candidate.version)
    options.logger?.info(
      `Catálogo base actualizado (${row.version}) desde ${candidate.source === 'sample' ? 'el catálogo de ejemplo' : options.sourcePath}; los ajustes de cada taller se mantienen.`,
    )
    return row
  }

  candidate ??= { catalog: options.fallback(), source: 'sample' }
  const row = await insertBase(db, candidate.catalog, candidate.source, sha256(JSON.stringify(candidate.catalog)), candidate.version)
  options.logger?.info(
    `Catálogo base sembrado: ${row.data.brands.length} marcas, ${row.data.lines.length} líneas (${candidate.source === 'sample' ? 'catálogo de ejemplo' : candidate.source})`,
  )
  return row
}

async function insertBase(db: Db, catalog: Catalog, source: string, hash: string, version?: string): Promise<BaseCatalog> {
  const row = { id: newId(), version: version ?? `v-${hash.slice(0, 10)}`, source, hash, data: catalog, createdAt: new Date() }
  await db.insert(catalogBase).values(row)
  return row
}

/** Id de la versión vigente del catálogo base (sin cargar sus datos). */
export async function latestBaseId(db: Db): Promise<string | undefined> {
  const [row] = await db.select({ id: catalogBase.id }).from(catalogBase).orderBy(desc(catalogBase.createdAt)).limit(1)
  return row?.id
}

export async function loadLatestBase(db: Db): Promise<BaseCatalog | undefined> {
  const [row] = await db.select().from(catalogBase).orderBy(desc(catalogBase.createdAt)).limit(1)
  return row ? { id: row.id, version: row.version, source: row.source, data: row.data, createdAt: row.createdAt } : undefined
}

// ── Marcas por defecto ───────────────────────────────────────────────────────

const COMPLETENESS_SCORE: Record<NonNullable<Line['completeness']>, number> = { verified: 100, complete: 50, partial: 10 }

/** Puntaje de "datos completos" de cada marca: líneas con pauta verificada, perfiles e ítems con precio. */
export function brandScores(catalog: Catalog): Map<Id, number> {
  const scores = new Map<Id, number>()
  const lineBrand = new Map<Id, Id>()
  for (const line of catalog.lines) {
    lineBrand.set(line.id, line.brandId)
    scores.set(line.brandId, (scores.get(line.brandId) ?? 0) + COMPLETENESS_SCORE[line.completeness ?? 'partial'])
  }
  for (const profile of catalog.profiles) {
    const brandId = lineBrand.get(profile.lineId)
    if (brandId && Object.values(profile.priceByColor ?? {}).some((p) => p > 0)) scores.set(brandId, (scores.get(brandId) ?? 0) + 1)
  }
  for (const item of catalog.items) if (item.price > 0) scores.set(item.brandId, (scores.get(item.brandId) ?? 0) + 0.5)
  return scores
}

/** Las 3 marcas con datos más completos; primero las que fabrican ventanas (tienen líneas). */
export function defaultBrandIds(catalog: Catalog, count = 3): Id[] {
  const scores = brandScores(catalog)
  const withLines = new Set(catalog.lines.map((l) => l.brandId))
  return [...catalog.brands]
    .sort((a, b) => Number(withLines.has(b.id)) - Number(withLines.has(a.id)) || (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((b) => b.id)
}

// ── Catálogo efectivo ────────────────────────────────────────────────────────

export function defaultBrandSettings(brandId: Id, enabled: boolean, kerf = 4): BrandSettings {
  return { brandId, enabled, trim: 0, kerf, discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } }
}

function mergeBrandSettings(base: BrandSettings | undefined, own: BrandSettings | undefined, brandId: Id, enabled: boolean, kerf: number): BrandSettings {
  const fallback = defaultBrandSettings(brandId, enabled, kerf)
  return {
    ...fallback,
    ...base,
    ...own,
    brandId,
    enabled,
    discounts: { ...fallback.discounts, ...base?.discounts, ...own?.discounts },
  }
}

export function overrideKey(o: Pick<PriceOverride, 'kind' | 'id' | 'colorId'>): string {
  return `${o.kind}:${o.id}:${o.colorId ?? ''}`
}

/** Aplica precios propios sobre una copia del catálogo. */
export function applyOverrides(catalog: Catalog, overrides: PriceOverride[]): Catalog {
  if (!overrides.length) return catalog
  const byKind = { profile: new Map<Id, PriceOverride[]>(), item: new Map<Id, number>(), glass: new Map<Id, number>() }
  for (const o of overrides) {
    if (o.kind === 'profile') byKind.profile.set(o.id, [...(byKind.profile.get(o.id) ?? []), o])
    else byKind[o.kind].set(o.id, o.price)
  }
  const linesById = new Map(catalog.lines.map((l) => [l.id, l]))
  return {
    ...catalog,
    profiles: catalog.profiles.map((p) => {
      const list = byKind.profile.get(p.id)
      if (!list) return p
      const priceByColor = { ...p.priceByColor }
      // Primero los generales (todos los colores), después los de un color específico.
      for (const o of list.filter((x) => !x.colorId)) {
        const colors = Object.keys(priceByColor).length ? Object.keys(priceByColor) : (linesById.get(p.lineId)?.colorIds ?? [])
        for (const c of colors) priceByColor[c] = o.price
      }
      for (const o of list.filter((x) => x.colorId)) priceByColor[o.colorId!] = o.price
      return { ...p, priceByColor }
    }),
    items: catalog.items.map((i) => (byKind.item.has(i.id) ? { ...i, price: byKind.item.get(i.id)! } : i)),
    glass: catalog.glass.map((g) => (byKind.glass.has(g.id) ? { ...g, pricePerM2: byKind.glass.get(g.id)! } : g)),
  }
}

// ── Pautas propias por línea ─────────────────────────────────────────────────

export const LINE_OVERRIDE_KEYS = ['pauta', 'doorPauta', 'sashInPauta'] as const
export type LineOverrideKey = (typeof LINE_OVERRIDE_KEYS)[number]

/** Ajustes de pauta guardados (viven en custom.lines para no tocar el esquema). */
export function lineOverridesOf(custom: CustomCatalog | null | undefined): Record<Id, LineOverride> {
  const lines: unknown = custom?.lines
  return lines && typeof lines === 'object' && !Array.isArray(lines) ? (lines as Record<Id, LineOverride>) : {}
}

/** Áreas mínimas de vidrio propias (custom.glassMinArea), sólo valores numéricos válidos. */
export function glassMinAreasOf(custom: CustomCatalog | null | undefined): Record<Id, number> {
  const raw: unknown = custom?.glassMinArea
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<Id, number> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[id] = value
  }
  return out
}

function hasKeys(value: object | undefined): boolean {
  return Boolean(value && Object.keys(value).length)
}

/** Pauta + ajuste (el refuerzo se mezcla por pieza). */
export function mergePautaPatch<T extends Partial<Pauta>>(base: T | undefined, patch: PautaPatch | undefined): T {
  const { reinforcement, ...rest } = patch ?? {}
  const merged = { ...(base ?? {}), ...rest } as T
  if (reinforcement && hasKeys(reinforcement)) merged.reinforcement = { ...(base?.reinforcement ?? {}), ...reinforcement }
  return merged
}

/** Aplica el ajuste de pauta a una línea (devuelve la misma línea si no hay ajuste). */
export function applyLineOverride(line: Line, override: LineOverride | undefined): EffectiveLine {
  if (!override || !LINE_OVERRIDE_KEYS.some((k) => hasKeys(override[k]))) return line
  const factory: FactoryPauta = {
    pauta: line.pauta,
    ...(line.doorPauta ? { doorPauta: line.doorPauta } : {}),
    ...(line.sashInPauta ? { sashInPauta: line.sashInPauta } : {}),
  }
  const next: EffectiveLine = { ...line, factory }
  if (hasKeys(override.pauta)) next.pauta = mergePautaPatch(line.pauta, override.pauta)
  if (hasKeys(override.doorPauta)) next.doorPauta = mergePautaPatch(line.doorPauta, override.doorPauta)
  if (hasKeys(override.sashInPauta)) next.sashInPauta = mergePautaPatch(line.sashInPauta, override.sashInPauta)
  return next
}

/** Líneas y vidrios que usan las cotizaciones de la organización (aunque su marca ya no esté activa). */
export interface CatalogInclude {
  lineIds: Id[]
  glassIds: Id[]
}

/**
 * Líneas y vidrios (de cualquier nivel del diseño) que usan las cotizaciones de la organización.
 * El editor calcula con el catálogo de GET /api/catalog: si desactivar una marca sacara de ahí una
 * línea o un vidrio ya cotizado, el navegador mostraría otra cifra que el servidor, el PDF y el portal.
 */
export async function referencedByQuotes(db: Db, orgId: Id): Promise<CatalogInclude> {
  const rows = rowsOf<{ kind: string; id: string | null }>(
    await db.execute(sql`
      select distinct t.kind, t.v #>> '{}' as id from (
        select 'line' as kind, jsonb_path_query(q.data, 'lax $.items[*].design.lineId') as v from ${quotes} q where q.org_id = ${orgId}
        union all
        select 'glass' as kind, jsonb_path_query(q.data, 'lax $.items[*].design.**.glassId') as v from ${quotes} q where q.org_id = ${orgId}
      ) t`),
  )
  const include: CatalogInclude = { lineIds: [], glassIds: [] }
  for (const row of rows) {
    if (!row.id) continue
    if (row.kind === 'line') include.lineIds.push(row.id)
    else include.glassIds.push(row.id)
  }
  include.lineIds.sort()
  include.glassIds.sort()
  return include
}

/** Ítems que piden las reglas de una línea, incluidas sus variantes por color. */
function ruleItemIds(line: Line): Id[] {
  return [...line.hardwareRules, ...line.accessoryRules].flatMap((r) => [r.itemId, ...Object.values(r.byColor ?? {})])
}

/**
 * Construye el catálogo de la organización. `onlyEnabled` = sólo marcas activas (para la
 * interfaz); sin él se incluyen todas (para recalcular cotizaciones antiguas sin perder precios).
 * `include` conserva, aunque su marca esté desactivada, las líneas (con sus perfiles e ítems) y
 * los vidrios que ya usan las cotizaciones: así el editor calcula lo mismo que el servidor.
 */
export function buildEffectiveCatalog(base: Catalog, org: OrgCatalogState, options: { onlyEnabled: boolean; kerf?: number; include?: CatalogInclude }): Catalog {
  const enabled = new Set(org.enabledBrandIds)
  const kerf = options.kerf ?? 4
  const custom = org.custom ?? {}
  let lines = base.lines
  let profiles = base.profiles
  let items = base.items
  let glass = base.glass
  if (options.onlyEnabled) {
    const keepLines = new Set(options.include?.lineIds ?? [])
    const keepGlass = new Set(options.include?.glassIds ?? [])
    lines = base.lines.filter((l) => enabled.has(l.brandId) || keepLines.has(l.id))
    const lineIds = new Set(lines.map((l) => l.id))
    profiles = base.profiles.filter((p) => lineIds.has(p.lineId))
    // Los herrajes y accesorios que piden las reglas de las líneas (y sus variantes por color) van siempre.
    const referenced = new Set(lines.flatMap(ruleItemIds))
    items = base.items.filter((i) => enabled.has(i.brandId) || referenced.has(i.id))
    glass = base.glass.filter((g) => !g.brandId || enabled.has(g.brandId) || keepGlass.has(g.id))
    if (!glass.length) glass = base.glass // sin vidrios no se puede cotizar: nunca bloquear
  }
  const usedBrandIds = new Set<Id>([
    ...lines.map((l) => l.brandId),
    ...items.map((i) => i.brandId),
    ...glass.map((g) => g.brandId).filter((b): b is Id => Boolean(b)),
    ...(options.onlyEnabled ? enabled : base.brands.map((b) => b.id)),
  ])
  const brands = base.brands.filter((b) => usedBrandIds.has(b.id))
  const baseSettings = new Map(base.brandSettings.map((s) => [s.brandId, s]))
  const ownSettings = new Map(org.brandSettings.map((s) => [s.brandId, s]))
  // Para recalcular (todas las marcas) se marcan como activas: el motor nunca debe descartar una línea ya cotizada.
  const brandSettings = brands.map((b) =>
    mergeBrandSettings(baseSettings.get(b.id), ownSettings.get(b.id), b.id, options.onlyEnabled ? enabled.has(b.id) : true, kerf),
  )
  const lineOverrides = lineOverridesOf(custom)
  if (Object.keys(lineOverrides).length) lines = lines.map((l) => applyLineOverride(l, lineOverrides[l.id]))
  let allGlass = [...glass, ...(custom.glass ?? [])]
  const minAreas = glassMinAreasOf(custom)
  if (Object.keys(minAreas).length) allGlass = allGlass.map((g) => (g.id in minAreas ? { ...g, minArea: minAreas[g.id] } : g))
  const merged: Catalog = {
    colors: [...base.colors, ...(custom.colors ?? [])],
    brands,
    lines,
    profiles,
    items: [...items, ...(custom.items ?? [])],
    glass: allGlass,
    brandSettings,
  }
  return applyOverrides(merged, org.priceOverrides)
}

export function summarizeBrands(base: Catalog, org: OrgCatalogState, kerf = 4): CatalogBrandSummary[] {
  const enabled = new Set(org.enabledBrandIds)
  const recommended = new Set(defaultBrandIds(base))
  const baseSettings = new Map(base.brandSettings.map((s) => [s.brandId, s]))
  const ownSettings = new Map(org.brandSettings.map((s) => [s.brandId, s]))
  const lineBrand = new Map(base.lines.map((l) => [l.id, l.brandId]))
  const profileBrand = new Map(base.profiles.map((p) => [p.id, lineBrand.get(p.lineId)]))
  const itemBrand = new Map(base.items.map((i) => [i.id, i.brandId]))
  const glassBrand = new Map(base.glass.map((g) => [g.id, g.brandId]))
  const counts = new Map<Id, CatalogBrandSummary['counts']>()
  const levels = new Map<Id, Set<string>>()
  const get = (id: Id) => {
    let c = counts.get(id)
    if (!c) counts.set(id, (c = { lines: 0, profiles: 0, items: 0, glass: 0, priced: 0, unpriced: 0, overrides: 0 }))
    return c
  }
  for (const line of base.lines) {
    get(line.brandId).lines++
    if (!levels.has(line.brandId)) levels.set(line.brandId, new Set())
    levels.get(line.brandId)!.add(line.completeness ?? 'partial')
  }
  for (const p of base.profiles) {
    const brandId = lineBrand.get(p.lineId)
    if (!brandId) continue
    const c = get(brandId)
    c.profiles++
    if (Object.values(p.priceByColor ?? {}).some((v) => v > 0)) c.priced++
    else c.unpriced++
  }
  for (const i of base.items) {
    const c = get(i.brandId)
    c.items++
    if (i.price > 0) c.priced++
    else c.unpriced++
  }
  for (const g of base.glass) {
    if (!g.brandId) continue
    const c = get(g.brandId)
    c.glass++
    if (g.pricePerM2 > 0) c.priced++
    else c.unpriced++
  }
  for (const o of org.priceOverrides) {
    const brandId = o.kind === 'profile' ? profileBrand.get(o.id) : o.kind === 'item' ? itemBrand.get(o.id) : glassBrand.get(o.id)
    if (brandId) get(brandId).overrides++
  }
  return base.brands.map((brand) => {
    const lv = levels.get(brand.id)
    const completeness: CatalogBrandSummary['completeness'] = !lv
      ? 'none'
      : lv.has('verified')
        ? 'verified'
        : lv.has('complete')
          ? 'complete'
          : 'partial'
    return {
      brand,
      enabled: enabled.has(brand.id),
      settings: mergeBrandSettings(baseSettings.get(brand.id), ownSettings.get(brand.id), brand.id, enabled.has(brand.id), kerf),
      completeness,
      recommended: recommended.has(brand.id),
      counts: get(brand.id),
    }
  })
}

/**
 * Catálogo mínimo para el portal del cliente: sólo lo que se usa para dibujar y
 * describir las ventanas de la cotización, sin costos de proveedor.
 */
export function publicCatalog(catalog: Catalog, quote: Pick<Quote, 'items'>, updatedAt: string): CatalogResponse {
  const lineIds = new Set<Id>()
  const colorIds = new Set<Id>()
  const glassIds = new Set<Id>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as { glassId?: Id; children?: unknown[]; panels?: unknown[] }
    if (n.glassId) glassIds.add(n.glassId)
    n.children?.forEach(walk)
    n.panels?.forEach(walk)
  }
  for (const item of quote.items) {
    const d = item.design
    if (!d) continue
    lineIds.add(d.lineId)
    colorIds.add(d.colorId)
    if (d.colorInId) colorIds.add(d.colorInId)
    glassIds.add(d.glassId)
    walk(d.root)
  }
  const lines = catalog.lines.filter((l) => lineIds.has(l.id))
  const brandIds = new Set(lines.map((l) => l.brandId))
  return {
    colors: catalog.colors.filter((c) => colorIds.has(c.id)),
    brands: catalog.brands.filter((b) => brandIds.has(b.id)),
    lines: lines.map((l) => ({ ...l, hardwareRules: [], accessoryRules: [] })),
    profiles: catalog.profiles.filter((p) => lineIds.has(p.lineId)).map((p) => ({ ...p, priceByColor: {} })),
    items: [],
    glass: catalog.glass.filter((g) => glassIds.has(g.id)).map((g) => ({ ...g, pricePerM2: 0 })),
    brandSettings: [],
    updatedAt,
  }
}

// ── Acceso con caché ─────────────────────────────────────────────────────────

/** Huella barata de un archivo (fecha de modificación + tamaño) para saber si cambió. */
function fileStamp(path: string | undefined): string {
  if (!path) return 'none'
  try {
    const st = statSync(path)
    return `${st.mtimeMs}:${st.size}`
  } catch {
    return 'missing'
  }
}

/**
 * Caché en memoria del catálogo base (por versión) y del catálogo efectivo de cada
 * organización (por fecha de actualización), para no reconstruirlo en cada guardado.
 */
export class CatalogService {
  private base: BaseCatalog | undefined
  private baseCheckedAt = 0
  private cache = new Map<string, Catalog>()
  private source: Omit<SeedOptions, 'catalog'> | undefined
  private sourceStamp: string | undefined
  private reseeding: Promise<void> | undefined
  private baseListeners: (() => void)[] = []

  constructor(
    private readonly db: Db,
    private readonly ttlMs = 5000,
  ) {}

  /**
   * Avisa cuando se siembra una versión nueva del catálogo base (p. ej. para dejar al día los
   * totales guardados de los borradores, como tras cambiar precios propios).
   */
  onBaseChange(listener: () => void): void {
    this.baseListeners.push(listener)
  }

  /** Lo llama quien sembró una versión nueva: olvida lo cacheado y avisa a los interesados. */
  baseChanged(): void {
    this.invalidate()
    for (const listener of this.baseListeners) listener()
  }

  /**
   * Vigila base.json: si el archivo cambia con el servidor andando (p. ej. tras correr
   * `npm run catalog:import`), se re-siembra solo en la próxima consulta, sin reiniciar.
   */
  watchSource(source: Omit<SeedOptions, 'catalog'>): void {
    this.source = source
    this.sourceStamp = fileStamp(source.sourcePath)
  }

  private async checkSource(): Promise<void> {
    const source = this.source
    if (!source?.sourcePath) return
    const stamp = fileStamp(source.sourcePath)
    if (stamp === this.sourceStamp) return
    this.reseeding ??= (async () => {
      try {
        const before = await latestBaseId(this.db)
        const row = await seedCatalogBase(this.db, source)
        // Versión nueva: los precios de los borradores guardados cambian (lista, Inicio, ficha).
        if (row.id !== before) this.baseChanged()
        else if (row.id !== this.base?.id) this.invalidate()
      } catch (error) {
        source.logger?.warn('No pude actualizar el catálogo base; sigo con la versión vigente.', error)
      } finally {
        // Se marca visto aunque falle (archivo a medio escribir): el próximo cambio vuelve a intentar.
        this.sourceStamp = stamp
        this.reseeding = undefined
      }
    })()
    await this.reseeding
  }

  async getBase(): Promise<BaseCatalog> {
    const now = Date.now()
    if (this.base && now - this.baseCheckedAt < this.ttlMs) return this.base
    await this.checkSource()
    const [head] = await this.db.select({ id: catalogBase.id }).from(catalogBase).orderBy(desc(catalogBase.createdAt)).limit(1)
    if (!head) {
      this.base = { id: 'empty', version: 'vacío', source: 'none', data: EMPTY_CATALOG, createdAt: new Date(0) }
    } else if (!this.base || this.base.id !== head.id) {
      this.base = (await loadLatestBase(this.db))!
      this.cache.clear()
    }
    this.baseCheckedAt = now
    return this.base
  }

  /** Olvida lo cacheado (p. ej. tras sembrar una versión nueva). */
  invalidate(): void {
    this.base = undefined
    this.cache.clear()
  }

  async getOrgState(orgId: Id): Promise<OrgCatalogState> {
    const [row] = await this.db.select().from(orgCatalog).where(eq(orgCatalog.orgId, orgId)).limit(1)
    if (row) return row
    return { enabledBrandIds: [], brandSettings: [], priceOverrides: [], custom: {}, updatedAt: new Date(0) }
  }

  async effective(
    orgId: Id,
    options: { onlyEnabled: boolean; kerf?: number; include?: CatalogInclude },
  ): Promise<{ catalog: Catalog; updatedAt: Date; base: BaseCatalog; state: OrgCatalogState }> {
    const base = await this.getBase()
    const state = await this.getOrgState(orgId)
    const updatedAt = new Date(Math.max(base.createdAt.getTime(), state.updatedAt.getTime()))
    const include =
      options.onlyEnabled && options.include ? sha256(`${options.include.lineIds.join(',')}|${options.include.glassIds.join(',')}`).slice(0, 16) : '-'
    const key = `${orgId}:${base.id}:${state.updatedAt.getTime()}:${options.onlyEnabled ? 1 : 0}:${options.kerf ?? 4}:${include}`
    let catalog = this.cache.get(key)
    if (!catalog) {
      catalog = buildEffectiveCatalog(base.data, state, options)
      if (this.cache.size > 200) this.cache.clear()
      this.cache.set(key, catalog)
    }
    return { catalog, updatedAt, base, state }
  }
}
