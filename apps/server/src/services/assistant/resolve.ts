/**
 * Resolución de lo que pide el modelo (o el intérprete local) contra el catálogo y la cotización
 * reales: «nogal» → color del catálogo, «termopanel» / «double glazing» → un DVH con precio,
 * «V2» → ítem. Funciones puras (sin base ni red). Tolerantes a tildes, mayúsculas y a las palabras
 * del oficio en los 7 idiomas para el vidrio.
 */
import { getTypology, type Catalog, type Color, type Glass, type Id, type Line, type LineKind, type TypologyId } from '@dekopen/engine'
import { TYPOLOGY_IDS, detectTypology, type Quote, type QuoteItem } from '@dekopen/shared'

export function fold(text: string | undefined | null): string {
  return (text ?? '')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Nombres reales más parecidos a lo pedido: los que comparten más palabras con la consulta y, si
 * ninguno comparte nada, vacío. Para ofrecer una alternativa que exista, nunca una supuesta.
 */
export function closestNames(names: readonly string[], query: string, max = 8): string[] {
  const words = fold(query).split(/[^a-z0-9.+]+/).filter((w) => w.length >= 2)
  return names
    .map((name) => ({ name, hits: words.filter((w) => fold(name).includes(w)).length }))
    .filter((n) => n.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((n) => n.name)
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
  if (new RegExp(`(^|[^a-z0-9])${escapeRe(q)}([^a-z0-9]|$)`).test(n)) return 70
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

export interface LineOptions {
  kind?: LineKind
  typologyId?: TypologyId
  defaultLineId?: Id | null
  currentLineId?: Id
}

/**
 * Línea para una tipología: la pedida por nombre (del tipo correcto si se puede), o la por defecto
 * del taller si sirve, o una de la misma marca, o la primera que fabrique la tipología.
 */
export function resolveLine(catalog: Catalog, query: string | undefined, opts: LineOptions = {}): LineChoice {
  const lines = catalog.lines ?? []
  const ofKind = opts.kind ? lines.filter((l) => l.kind === opts.kind) : lines
  if (query) {
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

function pickDefaultLine(catalog: Catalog, opts: LineOptions): Line | undefined {
  const lines = catalog.lines ?? []
  const fits = (l: Line) => (!opts.kind || l.kind === opts.kind) && (!opts.typologyId || l.typologyIds.length === 0 || l.typologyIds.includes(opts.typologyId))
  const kindOnly = (l: Line) => !opts.kind || l.kind === opts.kind
  const anchor = lines.find((l) => l.id === opts.currentLineId) ?? lines.find((l) => l.id === opts.defaultLineId)
  if (anchor && fits(anchor)) return anchor
  const rank = { verified: 0, complete: 1, partial: 2 } as const
  const byData = (list: Line[]) => [...list].sort((a, b) => rank[a.completeness ?? 'partial'] - rank[b.completeness ?? 'partial'])
  const sameBrand = anchor ? byData(lines.filter((l) => l.brandId === anchor.brandId)) : []
  const all = byData(lines)
  return sameBrand.find(fits) ?? all.find(fits) ?? sameBrand.find(kindOnly) ?? all.find(kindOnly) ?? anchor ?? lines[0]
}

/** Sinónimos frecuentes (en varios idiomas) → nombre canónico en español del catálogo base. */
const COLOR_SYNONYMS: Record<string, string[]> = {
  'roble dorado': ['golden oak', 'roble', 'carvalho dourado', 'chene dore', 'golden eiche', 'rovere dorato', 'altin mese'],
  nogal: ['walnut', 'nogueira', 'noyer', 'nussbaum', 'noce', 'ceviz'],
  blanco: ['white', 'branco', 'blanc', 'weiss', 'bianco', 'beyaz'],
  negro: ['negro mate', 'black', 'preto', 'noir', 'schwarz', 'nero', 'siyah'],
  antracita: ['gris antracita', 'grafito', 'anthracite', 'antracite', 'anthrazit', 'antrasit', '7016'],
}

/** Color del catálogo por nombre o id; prefiere los que la línea ofrece. */
export function resolveColor(catalog: Catalog, query: string | undefined, line?: Line): Color | undefined {
  if (!query) return undefined
  const colors = catalog.colors ?? []
  const inLine = (c: Color) => (line?.colorIds.includes(c.id) ? 8 : 0)
  const q = fold(query)
  const exact = colors.find((c) => fold(c.name) === q || c.id === query.trim())
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

// ── Vidrio ──────────────────────────────────────────────────────────────────

const SPECIAL_GLASS =
  /bronce|gris|verde|azul|humo|reflect|espej|low.?e|lamin|templ|empavon|sat[eé]n|semilla|palill|acust|arg[oó]n|morisco|control|solar|catedral|acanal|esmeril|[aá]cid|fijo|proyect|jumbo|policarb|acr[ií]lic|mate|negro/i

function composition(glass: Pick<Glass, 'name' | 'composition'>): string | null {
  const fromName = (glass.name ?? '').match(/(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)/)
  if (fromName) return fromName.slice(1, 4).map((n) => n.replace(',', '.')).join('+')
  const parts = (glass.composition ?? '').match(/\d+(?:[.,]\d+)?/g)
  return parts && parts.length >= 3 ? parts.slice(0, 3).map((n) => n.replace(',', '.')).join('+') : null
}

const isClearDvh = (g: Glass) => g.kind === 'dvh' && !SPECIAL_GLASS.test(g.name.replace(/incoloro/gi, ''))

/** El termopanel de siempre: DVH 4+12+4 incoloro con precio (o el DVH más común; o el primero con precio). */
export function preferredGlass(catalog: Catalog): Glass | undefined {
  const glass = catalog.glass ?? []
  const dvh = glass.filter((g) => g.kind === 'dvh')
  if (!dvh.length) return glass.find((g) => g.pricePerM2 > 0) ?? glass[0]
  const priced = dvh.filter((g) => g.pricePerM2 > 0)
  const pool = priced.length ? priced : dvh
  const clear = pool.filter(isClearDvh)
  const candidates = clear.length ? clear : pool
  const byName = (a: Glass, b: Glass) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'es')
  const standard = candidates.filter((g) => composition(g) === '4+12+4').sort(byName)
  if (standard.length) return standard[0]
  return [...candidates].sort(byName)[0]
}

/** Vidrio por defecto de una ventana nueva: el estándar, o el de los ajustes si tiene precio. */
export function defaultGlass(catalog: Catalog, settingsGlassId?: string | null): Glass | undefined {
  const preferred = preferredGlass(catalog)
  if (preferred && composition(preferred) === '4+12+4' && isClearDvh(preferred)) return preferred
  const fromSettings = settingsGlassId ? catalog.glass.find((g) => g.id === settingsGlassId) : undefined
  if (fromSettings && fromSettings.pricePerM2 > 0) return fromSettings
  return preferred ?? fromSettings ?? catalog.glass[0]
}

const priced = (g: Glass) => (g.pricePerM2 > 0 ? 10 : 0)
const LOW_E = /low\s*-?\s*e|lowe|baja emisividad|basso emissivo|faible emissivite|warmeschutz|isicam\s*s/
const DOUBLE = /termo|thermo|dvh|doble|double|igu|insulated|insulado|vidro duplo|isolierglas|vetrocamera|isicam|camara/
const LAMINATED = /laminad|laminated|seguridad|safety|feuillete|stratifi|verbund|vsg|lamine/
const TEMPERED = /templad|tempered|temperado|trempe|esg|temperato|temperli|sekurit/
const SINGLE = /simple|monolitic|incoloro|transparente|claro|single|float|einfach|semplice|tek cam/

/**
 * Vidrio del catálogo por nombre o tipo («termopanel», «DVH 5+12+5», «laminado», «tempered»,
 * «simple 4 mm», «low-e»…). Prefiere vidrios con precio.
 */
export function resolveGlass(catalog: Catalog, query: string | undefined, settingsGlassId?: string | null): Glass | undefined {
  if (!query) return undefined
  const glass = catalog.glass ?? []
  const q = fold(query)
  const exact = glass.find((g) => g.id === query.trim() || fold(g.name) === q)
  if (exact) return exact
  const byKind = (kind: Glass['kind']) => glass.filter((g) => g.kind === kind)
  const pick = (list: Glass[], prefer?: (g: Glass) => number) => [...list].sort((a, b) => (prefer?.(b) ?? 0) + priced(b) - ((prefer?.(a) ?? 0) + priced(a)))[0]
  const comp = /(\d{1,2})\s*\+\s*(\d{1,2})(?:\s*\+\s*(\d{1,2}))?/.exec(q)
  const nameHas = (g: Glass, re: RegExp) => re.test(fold(g.name)) || re.test(fold(g.composition))

  if (LOW_E.test(q)) {
    const list = glass.filter((g) => nameHas(g, /low\s*-?\s*e|lowe|baja emisividad/))
    if (list.length) return pick(list, (g) => (g.kind === 'dvh' ? 5 : 0))
  }
  if (DOUBLE.test(q) || (comp && comp[3])) {
    const dvh = byKind('dvh').filter((g) => !nameHas(g, /low/))
    const pool = dvh.length ? dvh : byKind('dvh')
    if (comp) {
      const re = new RegExp(`${comp[1]}\\s*\\+\\s*${comp[2]}${comp[3] ? `\\s*\\+\\s*${comp[3]}` : ''}`)
      const exactComp = pool.filter((g) => nameHas(g, re))
      if (exactComp.length) return pick(exactComp)
    } else {
      const standard = defaultGlass(catalog, settingsGlassId)
      if (standard?.kind === 'dvh') return standard
    }
    if (pool.length) return pick(pool, (g) => (nameHas(g, /4\s*\+\s*12\s*\+\s*4/) ? 5 : 0))
  }
  if (LAMINATED.test(q)) {
    const list = byKind('laminated').length ? byKind('laminated') : glass.filter((g) => nameHas(g, /laminad/))
    const re = comp ? new RegExp(`${comp[1]}\\s*\\+\\s*${comp[2]}`) : /3\s*\+\s*3/
    if (list.length) return pick(list, (g) => (nameHas(g, re) ? 5 : 0))
  }
  if (TEMPERED.test(q)) {
    const list = byKind('tempered').length ? byKind('tempered') : glass.filter((g) => nameHas(g, /templad/))
    if (list.length) return pick(list)
  }
  if (SINGLE.test(q)) {
    const mm = /(\d{1,2})\s*mm/.exec(q)?.[1]
    const list = byKind('mono')
    if (list.length) return pick(list, (g) => (nameHas(g, /incoloro|claro|float|transparente/) ? 4 : 0) + (mm && g.thickness === Number(mm) ? 6 : 0) + (!mm && g.thickness === 4 ? 2 : 0))
  }
  return best(glass, q, (g) => `${g.name} ${g.composition ?? ''}`, priced)
}

// ── Ítems ───────────────────────────────────────────────────────────────────

export interface ResolvedItems {
  items: QuoteItem[]
  missing: string[]
}

function matchRef(quote: Pick<Quote, 'items'>, ref: string): QuoteItem | undefined {
  const items = quote.items
  const pos = /^#(-?\d+)$/.exec(ref.trim())
  if (pos) {
    const n = Number(pos[1])
    return n < 0 ? items[items.length + n] : items[n - 1]
  }
  const r = fold(ref).replace(/[^a-z0-9]/g, '')
  return (
    items.find((i) => fold(i.ref).replace(/[^a-z0-9]/g, '') === r) ??
    (/^[a-z]*\d+$/.test(r) ? items.find((i) => fold(i.ref).replace(/[^0-9]/g, '') === r.replace(/[^0-9]/g, '')) : undefined) ??
    items.find((i) => i.id === ref)
  )
}

/**
 * Ítems a los que apunta una orden. Sin referencia: el último tocado en este turno, el
 * seleccionado en pantalla o, si hay uno solo, ese; si no, el último.
 */
export function resolveItems(
  quote: Pick<Quote, 'items'>,
  target: { ref?: string; items?: string[]; all?: boolean },
  fallback: { lastItemId?: Id | null; selectedId?: Id | null } = {},
): ResolvedItems {
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
  const chosen = byId(fallback.lastItemId) ?? byId(fallback.selectedId) ?? quote.items[quote.items.length - 1]
  return { items: chosen ? [chosen] : [], missing: [] }
}
