/**
 * Resolución de lo que dice Marco (o la persona) contra el catálogo y la cotización reales:
 * «nogal» → color del catálogo, «termopanel» → un DVH con precio, «V2» → ítem. Funciones puras.
 */
import { getTypology, type Catalog, type Color, type Glass, type Id, type Line, type LineKind, type TypologyId } from '@dekopen/engine'
import { TYPOLOGY_IDS, detectTypology, foldSpanish, type ItemTarget, type Quote, type QuoteItem } from '@dekopen/shared'
import { translate } from '../../lib/i18n'
import { preferredGlass } from '../designer/lib/catalog'
import es from './i18n/es'

const fold = (s: string | undefined | null) => foldSpanish(s ?? '').replace(/\s+/g, ' ').trim()

/** Id de tipología desde un id del motor o desde palabras («oscilobatiente», «corredera 3 hojas»). */
export function resolveTypology(input: string | undefined): TypologyId | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  if ((TYPOLOGY_IDS as readonly string[]).includes(trimmed)) return trimmed as TypologyId
  return detectTypology(trimmed)?.id
}

export function typologyKind(id: TypologyId): LineKind {
  return getTypology(id)?.kind ?? 'casement'
}

function score(name: string, query: string): number {
  const n = fold(name)
  const q = fold(query)
  if (!q) return 0
  if (n === q) return 100
  if (n.replace(/[^a-z0-9]/g, '') === q.replace(/[^a-z0-9]/g, '')) return 95
  if (n.startsWith(q)) return 80
  if (new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(n)) return 70
  if (n.includes(q)) return 50
  const tokens = q.split(/[^a-z0-9+]+/).filter((t) => t.length > 1)
  if (tokens.length && tokens.every((t) => n.includes(t))) return 40
  return 0
}

function best<T>(list: readonly T[], query: string, nameOf: (t: T) => string, bonus: (t: T) => number = () => 0): T | undefined {
  let winner: T | undefined
  let top = 0
  for (const item of list) {
    const s = score(nameOf(item), query)
    if (s <= 0) continue
    const total = s + bonus(item)
    if (total > top) {
      top = total
      winner = item
    }
  }
  return winner
}

export interface LineChoice {
  line: Line | undefined
  /** Se pidió una línea por nombre y no se encontró. */
  missed?: string
}

/**
 * Línea para una tipología: la pedida por nombre (del tipo correcto si se puede), o la por defecto
 * del taller si sirve para ese tipo, o una de la misma marca, o la primera que fabrique la tipología.
 */
export function resolveLine(catalog: Catalog, query: string | undefined, opts: { kind?: LineKind; typologyId?: TypologyId; defaultLineId?: Id; currentLineId?: Id } = {}): LineChoice {
  const lines = catalog.lines ?? []
  const ofKind = opts.kind ? lines.filter((l) => l.kind === opts.kind) : lines
  if (query) {
    // «PRO6004 blanca» → «PRO6004»: se prueba el nombre completo y luego sin las palabras finales.
    const words = query.trim().split(/\s+/)
    for (let n = words.length; n >= 1; n--) {
      const q = words.slice(0, n).join(' ')
      if (n < words.length && q.length < 3) break
      const found = best(ofKind.length ? ofKind : lines, q, (l) => l.name, (l) => (opts.typologyId && l.typologyIds.includes(opts.typologyId) ? 5 : 0))
      if (found) return { line: found }
      const anyKind = best(lines, q, (l) => l.name)
      if (anyKind && !opts.kind) return { line: anyKind }
    }
    return { line: pickDefaultLine(catalog, opts), missed: query }
  }
  return { line: pickDefaultLine(catalog, opts) }
}

function pickDefaultLine(catalog: Catalog, opts: { kind?: LineKind; typologyId?: TypologyId; defaultLineId?: Id; currentLineId?: Id }): Line | undefined {
  const lines = catalog.lines ?? []
  const fits = (l: Line) => (!opts.kind || l.kind === opts.kind) && (!opts.typologyId || l.typologyIds.length === 0 || l.typologyIds.includes(opts.typologyId))
  const kindOnly = (l: Line) => !opts.kind || l.kind === opts.kind
  const anchor = lines.find((l) => l.id === opts.currentLineId) ?? lines.find((l) => l.id === opts.defaultLineId)
  if (anchor && fits(anchor)) return anchor
  // Entre las que calzan, primero las de datos más completos (una «parcial» con un color no sirve de base).
  const rank = { verified: 0, complete: 1, partial: 2 } as const
  const byData = (list: Line[]) => [...list].sort((a, b) => rank[a.completeness ?? 'partial'] - rank[b.completeness ?? 'partial'])
  const sameBrand = anchor ? byData(lines.filter((l) => l.brandId === anchor.brandId)) : []
  const all = byData(lines)
  return sameBrand.find(fits) ?? all.find(fits) ?? sameBrand.find(kindOnly) ?? all.find(kindOnly) ?? anchor ?? lines[0]
}

const COLOR_SYNONYMS: Record<string, string[]> = {
  'roble dorado': ['golden oak', 'roble'],
  negro: ['negro mate'],
  antracita: ['gris antracita', 'grafito'],
}

/** Color del catálogo por nombre; prefiere los que la línea ofrece. */
export function resolveColor(catalog: Catalog, query: string | undefined, line?: Line): Color | undefined {
  if (!query) return undefined
  const colors = catalog.colors ?? []
  const inLine = (c: Color) => (line?.colorIds.includes(c.id) ? 8 : 0)
  const q = fold(query)
  const exact = colors.find((c) => fold(c.name) === q || c.id === q)
  if (exact) return exact
  const found = best(colors, q, (c) => c.name, inLine)
  if (found) return found
  for (const [canonical, aliases] of Object.entries(COLOR_SYNONYMS)) {
    if (aliases.includes(q) || canonical === q) {
      const alt = best(colors, canonical, (c) => c.name, inLine) ?? aliases.map((a) => best(colors, a, (c) => c.name, inLine)).find(Boolean)
      if (alt) return alt
    }
  }
  return undefined
}

const priced = (g: Glass) => (g.pricePerM2 > 0 ? 10 : 0)

/**
 * Vidrio del catálogo por nombre o tipo: «termopanel»/«DVH» → un DVH (el por defecto si es DVH,
 * si no 4+12+4), «DVH 5+12+5», «laminado», «templado», «simple 4 mm», «low-e», «empavonado»…
 * Prefiere vidrios con precio.
 */
export function resolveGlass(catalog: Catalog, query: string | undefined, defaultGlassId?: Id): Glass | undefined {
  if (!query) return undefined
  const glass = catalog.glass ?? []
  const q = fold(query)
  const byKind = (kind: Glass['kind']) => glass.filter((g) => g.kind === kind)
  const pick = (list: Glass[], prefer?: (g: Glass) => number) =>
    [...list].sort((a, b) => (prefer?.(b) ?? 0) + priced(b) - ((prefer?.(a) ?? 0) + priced(a)))[0]
  const composition = /(\d{1,2})\s*\+\s*(\d{1,2})(?:\s*\+\s*(\d{1,2}))?/.exec(q)
  const nameHas = (g: Glass, re: RegExp) => re.test(fold(g.name)) || re.test(fold(g.composition))

  if (/low\s*-?\s*e|lowe|baja emisividad/.test(q)) {
    const list = glass.filter((g) => nameHas(g, /low\s*-?\s*e|lowe|baja emisividad/))
    if (list.length) return pick(list, (g) => (g.kind === 'dvh' ? 5 : 0))
  }
  if (/termo|thermo|dvh|doble/.test(q)) {
    const dvh = byKind('dvh').filter((g) => !nameHas(g, /low/))
    const pool = dvh.length ? dvh : byKind('dvh')
    if (composition) {
      const re = new RegExp(`${composition[1]}\\s*\\+\\s*${composition[2]}${composition[3] ? `\\s*\\+\\s*${composition[3]}` : ''}`)
      const exact = pool.filter((g) => nameHas(g, re))
      if (exact.length) return pick(exact)
    }
    if (!composition) {
      // «Termopanel» a secas = el de siempre: DVH 4+12+4 incoloro (o el DVH más común).
      const standard = preferredGlass(catalog)
      if (standard?.kind === 'dvh') return standard
    }
    const fallback = glass.find((g) => g.id === defaultGlassId)
    if (fallback?.kind === 'dvh' && !composition) return fallback
    return pick(pool, (g) => (nameHas(g, /4\s*\+\s*12\s*\+\s*4/) ? 5 : 0))
  }
  if (/laminad|seguridad/.test(q)) {
    const list = byKind('laminated').length ? byKind('laminated') : glass.filter((g) => nameHas(g, /laminad/))
    const re = composition ? new RegExp(`${composition[1]}\\s*\\+\\s*${composition[2]}`) : /3\s*\+\s*3/
    if (list.length) return pick(list, (g) => (nameHas(g, re) ? 5 : 0))
  }
  if (/templad/.test(q)) {
    const list = byKind('tempered').length ? byKind('tempered') : glass.filter((g) => nameHas(g, /templad/))
    if (list.length) return pick(list)
  }
  if (/simple|monolitic|incoloro|transparente|claro/.test(q)) {
    const mm = /(\d{1,2})\s*mm/.exec(q)?.[1]
    const list = byKind('mono')
    if (list.length) {
      return pick(list, (g) => (nameHas(g, /incoloro|claro|float|transparente/) ? 4 : 0) + (mm && g.thickness === Number(mm) ? 6 : 0) + (!mm && g.thickness === 4 ? 2 : 0))
    }
  }
  return best(glass, q, (g) => `${g.name} ${g.composition ?? ''}`, priced)
}

/** Etiqueta corta del vidrio para recibos. */
export function glassLabel(glass: Glass | undefined): string {
  return glass?.name ?? 'vidrio'
}

export interface ResolvedItems {
  items: QuoteItem[]
  missing: string[]
}

function matchRef(quote: Quote, ref: string): QuoteItem | undefined {
  const items = quote.items
  const pos = /^#(-?\d+)$/.exec(ref.trim())
  if (pos) {
    const n = Number(pos[1])
    return n < 0 ? items[items.length + n] : items[n - 1]
  }
  const r = fold(ref).replace(/[^a-z0-9]/g, '')
  return (
    items.find((i) => fold(i.ref).replace(/[^a-z0-9]/g, '') === r) ??
    // «V2» cuando las refs son «P2» o «2»: por número
    (/^[a-z]*\d+$/.test(r) ? items.find((i) => fold(i.ref).replace(/[^0-9]/g, '') === r.replace(/[^0-9]/g, '')) : undefined) ??
    items.find((i) => i.id === ref)
  )
}

/**
 * Ítems a los que apunta una orden. Sin referencia: el último tocado en esta orden, el
 * seleccionado o, si hay uno solo, ese.
 */
export function resolveItems(quote: Quote, target: ItemTarget, fallback: { lastTouchedId?: Id | null; selectedId?: Id | null } = {}): ResolvedItems {
  if (target.all) return { items: [...quote.items], missing: [] }
  const refs = [...(target.items ?? []), ...(target.ref ? [target.ref] : [])]
  if (refs.length) {
    const items: QuoteItem[] = []
    const missing: string[] = []
    for (const ref of refs) {
      const found = matchRef(quote, ref)
      if (found && !items.includes(found)) items.push(found)
      else if (!found) missing.push(ref)
    }
    return { items, missing }
  }
  const byId = (id: Id | null | undefined) => (id ? quote.items.find((i) => i.id === id) : undefined)
  const chosen = byId(fallback.lastTouchedId) ?? byId(fallback.selectedId) ?? (quote.items.length === 1 ? quote.items[0] : quote.items[quote.items.length - 1])
  return { items: chosen ? [chosen] : [], missing: [] }
}

/** «V1», «V1 y V3», «V1, V2 y V4», «todas las ventanas». */
export function refsLabel(items: readonly QuoteItem[], total: number): string {
  if (items.length > 1 && items.length === total) return total === 2 ? translate(es, 'executor.bothWindows') : translate(es, 'executor.allWindows', { count: total })
  const fallback = translate(es, 'executor.theWindow')
  const refs = items.map((i) => i.ref || fallback)
  if (refs.length <= 1) return refs[0] ?? fallback
  return translate(es, 'executor.and', { list: refs.slice(0, -1).join(', '), last: refs[refs.length - 1] })
}
