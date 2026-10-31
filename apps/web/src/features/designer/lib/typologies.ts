/**
 * Galería de tipologías: grupos (Ventanas, Puertas, Correderas, Formas), búsqueda sin tildes y
 * recuerdos locales (últimas tipologías, línea más usada) en localStorage.
 */
import { TYPOLOGIES, type Catalog, type Line, type Typology, type TypologyId } from '@framezen/engine'
import { normalizeSearch } from '../../../lib/format'
import { availableTypologies, lineSupports } from './catalog'

export type TypologyGroupId = 'windows' | 'doors' | 'sliding' | 'shapes'

export const TYPOLOGY_GROUPS: { id: TypologyGroupId; label: string }[] = [
  { id: 'windows', label: 'Ventanas' },
  { id: 'doors', label: 'Puertas' },
  { id: 'sliding', label: 'Correderas' },
  { id: 'shapes', label: 'Formas' },
]

const SHAPES: TypologyId[] = ['arch', 'trapezoid', 'triangle']

export function typologyGroup(t: Typology): TypologyGroupId {
  if (t.kind === 'sliding') return 'sliding'
  if (SHAPES.includes(t.id)) return 'shapes'
  if (t.id.startsWith('door')) return 'doors'
  return 'windows'
}

export function matchesQuery(t: Typology, query: string): boolean {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = normalizeSearch([t.name, ...t.tags, t.id.replace(/_/g, ' ')].join(' '))
  return terms.every((term) => hay.includes(term))
}

export interface TypologySection {
  id: TypologyGroupId | 'recent' | 'other'
  label: string
  items: Typology[]
  /** Tipologías que ninguna línea activa declara (se pueden crear igual, con aviso). */
  muted?: boolean
}

/**
 * Secciones de la galería. Sin búsqueda: recientes + los cuatro grupos (solo lo que fabrican
 * tus líneas). Con búsqueda: coincidencias por grupo y, al final, las que ninguna línea declara.
 */
export function typologySections(catalog: Catalog | undefined, query: string, recent: TypologyId[] = []): TypologySection[] {
  const available = availableTypologies(catalog)
  const isAvailable = (t: Typology) => !available || available.has(t.id)
  const q = query.trim()
  const sections: TypologySection[] = []
  if (!q && recent.length) {
    const items = recent.map((id) => TYPOLOGIES.find((t) => t.id === id)).filter((t): t is Typology => Boolean(t && isAvailable(t)))
    if (items.length) sections.push({ id: 'recent', label: 'Recientes', items: items.slice(0, 6) })
  }
  for (const g of TYPOLOGY_GROUPS) {
    const items = TYPOLOGIES.filter((t) => typologyGroup(t) === g.id && isAvailable(t) && matchesQuery(t, q))
    if (items.length) sections.push({ id: g.id, label: g.label, items })
  }
  if (q && available) {
    const other = TYPOLOGIES.filter((t) => !available.has(t.id) && matchesQuery(t, q))
    if (other.length) sections.push({ id: 'other', label: 'Sin línea activa que la fabrique', items: other, muted: true })
  }
  return sections
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
  const supporting = lines.filter((l) => lineSupports(l, typologyId))
  const wanted = (typeof preferred === 'string' ? [preferred] : (preferred ?? [])).filter((id): id is string => !!id)
  const prefs = wanted.map((id) => lines.find((l) => l.id === id)).filter((l): l is Line => !!l)
  const fits = prefs.find((l) => lineSupports(l, typologyId))
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
