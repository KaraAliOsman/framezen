/**
 * Galería de tipologías: grupos por `Typology.group` del motor (con las elevables/paralelas y las
 * pivotantes como grupos propios), búsqueda sin tildes en el idioma de la interfaz (y en español,
 * con los sinónimos del rubro) ordenada por relevancia, y recuerdos locales (últimas tipologías,
 * línea más usada) en localStorage.
 */
import { TYPOLOGIES, type Catalog, type Line, type Typology, type TypologyId } from '@dekopen/engine'
import type { Locale } from '@dekopen/shared'
import { getGlossary, translate } from '../../../lib/i18n'
import { normalizeSearch } from '../../../lib/format'
import es from '../i18n/es'
import { availableTypologies, lineSupports } from './catalog'

export type TypologyGroupId = 'windows' | 'doors' | 'sliding' | 'liftParallel' | 'folding' | 'pivot' | 'shapes'

/** Orden de la galería y clave del glosario (`typologyGroup.*`) de cada grupo. */
export const TYPOLOGY_GROUPS: { id: TypologyGroupId; glossary: 'window' | 'door' | 'sliding' | 'liftParallel' | 'folding' | 'pivot' | 'shape' }[] = [
  { id: 'windows', glossary: 'window' },
  { id: 'doors', glossary: 'door' },
  { id: 'sliding', glossary: 'sliding' },
  { id: 'liftParallel', glossary: 'liftParallel' },
  { id: 'folding', glossary: 'folding' },
  { id: 'pivot', glossary: 'pivot' },
  { id: 'shapes', glossary: 'shape' },
]

const LIFT_PARALLEL = /^(lift_slide|tilt_slide|parallel_slide)/

/** Grupo de la galería: el del motor, con dos subgrupos propios (elevables/paralelas y pivotantes). */
export function typologyGroup(t: Pick<Typology, 'id' | 'group'>): TypologyGroupId {
  switch (t.group) {
    case 'door':
      return 'doors'
    case 'folding':
      return 'folding'
    case 'shape':
      return 'shapes'
    case 'sliding':
      return LIFT_PARALLEL.test(t.id) ? 'liftParallel' : 'sliding'
    default:
      return t.id.startsWith('pivot') ? 'pivot' : 'windows'
  }
}

export function groupLabel(id: TypologyGroupId | 'recent', locale?: Locale): string {
  if (id === 'recent') return translate(es, 'picker.recent', undefined, locale)
  const group = TYPOLOGY_GROUPS.find((g) => g.id === id)!
  return getGlossary(locale).term(`typologyGroup.${group.glossary}`)
}

/** Nombre de la tipología en el idioma de la interfaz (glosario; el del motor como respaldo). */
export function typologyLabel(t: Pick<Typology, 'id' | 'name'>, locale?: Locale): string {
  return getGlossary(locale).typology(t.id, t.name)
}

/**
 * Relevancia de una tipología para la búsqueda (0 = no coincide): 3 = el nombre es la búsqueda,
 * 2 = todas las palabras están en el nombre (palabra entera o comienzo de palabra), 1 = solo por
 * sinónimos y etiquetas del rubro. Los empates se resuelven por el orden de la galería (ventanas
 * primero, luego el orden del motor), así «fijo» elige «Paño fijo» y «corredera» la de 2 hojas.
 * Busca en el idioma de la interfaz y en español (las etiquetas del motor están en español).
 */
export function typologyScore(t: Typology, query: string, locale?: Locale): number {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 1
  const local = normalizeSearch(typologyLabel(t, locale))
  const spanish = normalizeSearch(t.name)
  const hay = normalizeSearch([local, spanish, ...t.tags, t.id.replace(/_/g, ' ')].join(' '))
  if (!terms.every((term) => hay.includes(term))) return 0
  const q = terms.join(' ')
  const names = [local, spanish]
  if (names.some((n) => n === q)) return 3
  const words = (n: string) => n.split(/[\s+·,()-]+/).filter(Boolean)
  if (names.some((n) => terms.every((term) => words(n).some((w) => w.startsWith(term))))) return 2
  return 1
}

export function matchesQuery(t: Typology, query: string, locale?: Locale): boolean {
  return typologyScore(t, query, locale) > 0
}

export interface TypologySection {
  id: TypologyGroupId | 'recent'
  label: string
  items: Typology[]
  /** Tipologías de la sección que ninguna línea activa declara (se crean igual, con aviso del motor). */
  unavailable: ReadonlySet<TypologyId>
}

export interface TypologySectionOptions {
  /** Solo lo que fabrican tus líneas (por defecto se muestran todas, las demás atenuadas). */
  onlyAvailable?: boolean
}

/**
 * Secciones de la galería: «Recientes» (sin búsqueda) y todos los grupos. Las tipologías que
 * ninguna línea declara se muestran igual (nunca se esconde una tipología del mercado) pero al
 * final de su grupo y marcadas en `unavailable`; con `onlyAvailable` se omiten. Con búsqueda, los
 * grupos y sus ítems van por relevancia (a igual relevancia, primero lo que fabrican tus líneas).
 */
export function typologySections(
  catalog: Catalog | undefined,
  query: string,
  recent: TypologyId[] = [],
  locale?: Locale,
  options: TypologySectionOptions = {},
): TypologySection[] {
  const available = availableTypologies(catalog)
  const isAvailable = (t: Typology) => !available || available.has(t.id)
  const q = query.trim()
  const sections: (TypologySection & { best: number })[] = []
  const flag = (items: Typology[]): ReadonlySet<TypologyId> => new Set(items.filter((t) => !isAvailable(t)).map((t) => t.id))
  if (!q && recent.length) {
    const items = recent
      .map((id) => TYPOLOGIES.find((t) => t.id === id))
      .filter((t): t is Typology => Boolean(t && (!options.onlyAvailable || isAvailable(t))))
      .slice(0, 6)
    if (items.length) sections.push({ id: 'recent', label: groupLabel('recent', locale), items, unavailable: flag(items), best: Infinity })
  }
  const groupOrder = (t: Typology) => TYPOLOGY_GROUPS.findIndex((g) => g.id === typologyGroup(t))
  const scored = TYPOLOGIES.map((t, index) => ({ t, index, score: q ? typologyScore(t, q, locale) : 1 })).filter((x) => x.score > 0 && (!options.onlyAvailable || isAvailable(x.t)))
  const byScore = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.score - a.score || Number(isAvailable(b.t)) - Number(isAvailable(a.t)) || groupOrder(a.t) - groupOrder(b.t) || a.index - b.index
  TYPOLOGY_GROUPS.forEach((g, order) => {
    const hits = scored.filter((x) => typologyGroup(x.t) === g.id)
    if (!hits.length) return
    // Sin búsqueda: lo que fabrican tus líneas primero; el resto en el orden del motor.
    if (q) hits.sort(byScore)
    else hits.sort((a, b) => Number(isAvailable(b.t)) - Number(isAvailable(a.t)) || a.index - b.index)
    const items = hits.map((x) => x.t)
    sections.push({ id: g.id, label: groupLabel(g.id, locale), items, unavailable: flag(items), best: q ? hits[0].score * 100 - order : -order })
  })
  if (q) sections.sort((a, b) => b.best - a.best)
  return sections.map(({ best: _best, ...section }) => section)
}

// ─── Recuerdos locales ───────────────────────────────────────────────────────

const RECENT_KEY = 'fz-designer-recent-typologies'
const LINE_USAGE_KEY = 'fz-designer-line-usage'
const MAX_RECENT = 6

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readRecentTypologies(): TypologyId[] {
  try {
    const raw = storage()?.getItem(RECENT_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((id): id is TypologyId => typeof id === 'string' && TYPOLOGIES.some((t) => t.id === id)) : []
  } catch {
    return []
  }
}

const ONLY_MINE_KEY = 'fz-designer-only-mine'

/** Preferencia de la galería: ver solo lo que fabrican tus líneas (por defecto no). */
export function readOnlyMine(): boolean {
  try {
    return storage()?.getItem(ONLY_MINE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeOnlyMine(on: boolean): void {
  try {
    if (on) storage()?.setItem(ONLY_MINE_KEY, '1')
    else storage()?.removeItem(ONLY_MINE_KEY)
  } catch {
    /* sin almacenamiento */
  }
}

export function rememberTypology(id: TypologyId): TypologyId[] {
  const next = [id, ...readRecentTypologies().filter((x) => x !== id)].slice(0, MAX_RECENT)
  try {
    storage()?.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* sin almacenamiento: seguimos igual */
  }
  return next
}

export function readLineUsage(): Record<string, number> {
  try {
    const raw = storage()?.getItem(LINE_USAGE_KEY)
    const data = raw ? (JSON.parse(raw) as unknown) : {}
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function rememberLine(lineId: string): void {
  if (!lineId) return
  const usage = readLineUsage()
  usage[lineId] = (usage[lineId] ?? 0) + 1
  try {
    storage()?.setItem(LINE_USAGE_KEY, JSON.stringify(usage))
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Línea por defecto para una tipología: la primera de las preferidas que la fabrique (la de la
 * ventana de referencia, luego la de tus ajustes); si no, la más usada que la fabrique; si no, la
 * primera que la fabrique; si ninguna, la preferida o la primera del catálogo (nunca bloquea: el
 * motor avisa si no calza).
 */
export function defaultLineFor(
  catalog: Catalog | undefined,
  typologyId: TypologyId,
  preferred?: string | ReadonlyArray<string | undefined>,
  usage: Record<string, number> = readLineUsage(),
): string {
  const lines = catalog?.lines ?? []
  const supporting = lines.filter((l) => lineSupports(l, typologyId, catalog))
  const wanted = (typeof preferred === 'string' ? [preferred] : (preferred ?? [])).filter((id): id is string => !!id)
  const prefs = wanted.map((id) => lines.find((l) => l.id === id)).filter((l): l is Line => !!l)
  const fits = prefs.find((l) => lineSupports(l, typologyId, catalog))
  if (fits) return fits.id
  const pref = prefs[0]
  const typology = TYPOLOGIES.find((t) => t.id === typologyId)
  const byKind = (l: Line) => !typology || l.kind === typology.kind
  const pool = supporting.length ? supporting : lines.filter(byKind)
  const used = [...pool].sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0))
  if (used.length && (usage[used[0].id] ?? 0) > 0) return used[0].id
  // Sin historial: de la misma marca que tu línea preferida y con los datos más completos
  // (una línea «parcial» con un solo color no es una buena primera opción).
  const brand = pref?.brandId
  const best = pool
    .map((line, index) => ({ line, index }))
    .sort(
      (a, b) =>
        Number(!!brand && b.line.brandId === brand) - Number(!!brand && a.line.brandId === brand) ||
        COMPLETENESS_RANK[a.line.completeness ?? 'partial'] - COMPLETENESS_RANK[b.line.completeness ?? 'partial'] ||
        a.index - b.index,
    )[0]?.line
  return best?.id ?? pref?.id ?? lines[0]?.id ?? ''
}

const COMPLETENESS_RANK = { verified: 0, complete: 1, partial: 2 } as const
