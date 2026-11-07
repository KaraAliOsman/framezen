/**
 * Resolución de datos de una cláusula contra el contexto: cotización, cliente, plantilla, asistente,
 * ítems de la cotización abierta y la especificación de una ventana (tipología, medidas, colores,
 * vidrio, línea, ambiente, accesorios y apertura), con su parte del «Entendí: …».
 */
import type { OpeningKind, TypologyId } from '@dekopen/engine'
import type { Build } from './build'
import { assemblyLabel, simpleOpening, type AssemblyPick, type Clause, type ColorPick, type GlassPick } from './clause'
import type { NluDesignArgs, NluExtras, NluItemTarget, NluQuoteTarget } from './commands'
import type { EntityEntry } from './entities'
import { appendChoice, entriesNamed, fmt, inline, slot, tr, type GEnv } from './env'
import { conceptSurface, conceptSurfaces, lowerBound } from './lexicon'
import { nameKey } from './text'
import type { NluSuggestion } from './types'

// ── Utilidades ──────────────────────────────────────────────────────────────

/** Marca como usados todos los átomos con alguno de los conceptos (o prefijos terminados en «.»). */
export function useConcepts(c: Clause, ...concepts: string[]): number[] {
  const out: number[] = []
  for (let i = c.from; i < c.to; i++) {
    for (const k of c.concepts(i)) {
      if (concepts.some((p) => (p.endsWith('.') ? k.startsWith(p) : k === p))) {
        c.used.add(i)
        out.push(i)
        break
      }
    }
  }
  return out
}

/** Primer átomo con alguno de los conceptos (o -1). */
export function at(c: Clause, ...concepts: string[]): number {
  return c.findAny(concepts)
}

/** Palabras sueltas de corte entre un sustantivo y su complemento («de», «of», «von»…). */
const OF_WORDS = new Set(['de', 'del', 'para', 'of', 'for', 'do', 'da', 'dos', 'das', 'von', 'fur', 'di', 'della', 'del', 'per', 'du', 'des', 'pour', 'icin'])
const LEADING_ARTICLES = /^(los|las|la|el|lo|les|the|os|as|o|a|die|der|das|den|i|gli|le|il)\s+/i

export function cleanQuery(text: string): string {
  return text.replace(LEADING_ARTICLES, '').trim()
}

// ── Cotización ──────────────────────────────────────────────────────────────

export interface QuoteResolved {
  target: NluQuoteTarget
  label: string
  current: boolean
  explicit: boolean
  query?: string
  entry?: EntityEntry
}

function quoteLabel(g: GEnv, entry: EntityEntry | undefined, number: number | undefined): string {
  if (number !== undefined) return tr(g, 'sum.quoteRef', { number }) + (entry?.name ? ` «${entry.name}»` : '')
  if (entry?.number !== undefined) return quoteLabel(g, entry, entry.number)
  return tr(g, 'sum.quoteNamed', { name: entry?.name ?? '' })
}

/** Cotizaciones recientes como opciones para completar. */
export function recentQuoteChoices(g: GEnv, limit = 5): NluSuggestion[] {
  return [...g.bundle.index.lists.quote]
    .sort((a, b) => (b.number ?? 0) - (a.number ?? 0))
    .slice(0, limit)
    .map((q, i) =>
      appendChoice(g, 'quote', q.number !== undefined ? tr(g, 'sum.quoteRef', { number: q.number }) : q.name, q.number !== undefined ? `#${q.number}` : `"${q.name}"`, {
        id: q.id,
        detail: [q.name, q.detail].filter(Boolean).join(' · '),
        score: 1 - i * 0.01,
      }),
    )
}

/**
 * Cotización a la que se refiere la cláusula: «#123», «cotización 412», «la última cotización»,
 * su título, «"Casa Sur"» (si `allowQuoted`) o «la de los Pérez» (si `allowQuery`). Sin referencia,
 * la abierta. Si no hay ninguna y `require`, pide el slot.
 */
export function resolveQuote(c: Clause, g: GEnv, b: Build, options: { allowQuoted?: boolean; allowQuery?: boolean; require?: boolean } = {}): QuoteResolved | null {
  const lists = g.bundle.index
  let number: number | undefined
  let entry: EntityEntry | undefined
  let query: string | undefined
  const atoms: number[] = []
  for (let i = c.from; i < c.to && number === undefined; i++) {
    if (c.used.has(i)) continue
    if (c.lit(i, 'hash')) {
      number = c.atoms[i].lit!.value
      atoms.push(i)
    }
  }
  if (number === undefined) {
    for (let i = c.from; i < c.to; i++) {
      if (!(c.is(i, 'obj.quote') || c.is(i, 'obj.number')) || c.used.has(i)) continue
      let j = i + 1
      if (c.is(j, 'obj.number')) j++
      const a = c.atoms[j]
      if (j < c.to && a?.num?.raw && /^\d{1,7}$/.test(a.num.raw) && !c.used.has(j)) {
        const after = j + 1
        if (after < c.to && (c.lit(after, 'x') || c.is(after, 'sep.x') || c.isPrefix(after, 'unit.') || c.isPrefix(after, 'pan.') || c.lit(after, 'pct'))) continue
        number = Number(a.num.raw)
        atoms.push(i, j)
        if (j > i + 1) atoms.push(i + 1)
        break
      }
    }
  }
  const qi = c.find('obj.quote')
  // Turco: «123 numaralı teklifi aç» (el número antes del sustantivo).
  if (number === undefined && qi > c.from) {
    let p = qi - 1
    while (p > c.from && c.isFiller(p) && !c.atoms[p].num) p--
    const a = c.atoms[p]
    if (a?.num?.raw && /^\d{1,7}$/.test(a.num.raw) && !c.used.has(p) && p >= c.from) {
      number = Number(a.num.raw)
      atoms.push(p)
      for (let k = p + 1; k < qi; k++) atoms.push(k)
    }
  }
  if (number === undefined && qi >= 0) {
    // «la última cotización»
    const last = c.find('scp.last')
    if (last >= 0 && Math.abs(last - qi) <= 2 && lists.lists.quote.length) {
      entry = [...lists.lists.quote].sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0]
      atoms.push(last)
    }
  }
  if (number === undefined && !entry) {
    const ent = c.findEntity('quote', true)
    if (ent && ent.hits.length === 1) {
      entry = c.entry(ent.hits[0])
      atoms.push(ent.i)
    }
  }
  if (number === undefined && !entry && qi >= 0) {
    const nx = c.next(qi, false)
    if (options.allowQuoted) {
      const quoted = nx >= 0 && c.lit(nx, 'quoted') ? nx : -1
      if (quoted >= 0 && !c.used.has(quoted)) {
        const raw = c.atoms[quoted].lit!.raw
        const named = entriesNamed(g, 'quote', raw)
        if (named.length === 1) entry = named[0]
        else query = raw
        atoms.push(quoted)
      }
    }
    if (!entry && query === undefined && options.allowQuery && nx >= 0 && OF_WORDS.has(c.fold(nx))) {
      const text = c.freeText(nx + 1, { stop: (k) => c.isPrefix(k, 'act.') || c.lit(k, 'email') || c.lit(k, 'phone') })
      if (text.text) {
        query = cleanQuery(text.text)
        atoms.push(nx, ...text.atoms)
        const key = nameKey(query)
        const words = key.split(' ')
        const matches = lists.lists.quote.filter((q) => {
          const hay = nameKey(`${q.name} ${q.detail ?? ''}`)
          return words.every((w) => hay.split(' ').includes(w))
        })
        if (matches.length === 1) {
          entry = matches[0]
          query = undefined
        }
      }
    }
  }
  if (number !== undefined && !entry) {
    const idx = lists.byNumber.get(number)
    if (idx !== undefined) entry = lists.lists.quote[idx]
  }
  // Palabras que refieren a la cotización («esta cotización», «el presupuesto»).
  for (let i = c.from; i < c.to; i++) {
    if (c.is(i, 'obj.quote') || c.is(i, 'obj.number')) atoms.push(i)
    else if ((c.is(i, 'scp.this') || c.is(i, 'scp.selected')) && qi >= 0 && Math.abs(i - qi) <= 2) atoms.push(i)
  }
  c.use(atoms)
  const explicit = number !== undefined || !!entry || query !== undefined
  if (explicit) {
    if (entry && entry.id === g.ctx.quoteId) return { target: {}, label: tr(g, 'sum.quoteCurrent'), current: true, explicit: true, entry }
    const target: NluQuoteTarget = {}
    if (entry) target.quoteId = entry.id
    if (number !== undefined) target.number = number
    else if (entry?.number !== undefined) target.number = entry.number
    if (query !== undefined && !entry) return { target, label: `«${query}»`, current: false, explicit: true, query }
    return { target, label: quoteLabel(g, entry, number), current: false, explicit: true, entry }
  }
  if (g.ctx.quoteOpen) return { target: {}, label: tr(g, 'sum.quoteCurrent'), current: true, explicit: false }
  if (options.require !== false) b.need(slot(g, 'quote', undefined, recentQuoteChoices(g)))
  return null
}

// ── Cliente ─────────────────────────────────────────────────────────────────

export interface ClientResolved {
  clientId?: string
  name: string
  choices?: EntityEntry[]
  /** Encontrado por una palabra del nombre («Soto» → «María Soto»). */
  partial?: string
  fuzzy?: boolean
}

export function clientChoices(g: GEnv, entries: readonly EntityEntry[]): NluSuggestion[] {
  return entries.slice(0, 8).map((e, i) => appendChoice(g, 'client', e.name, `"${e.name}"`, { id: e.id, detail: e.detail, score: 1 - i * 0.01 }))
}

/**
 * Cliente nombrado en la cláusula: entre comillas, por su nombre en los datos, o como texto libre
 * después de `from` (p. ej. tras «cliente» o «para»). Nunca asigna una corrección de tipeo sin
 * preguntar.
 */
export function resolveClient(c: Clause, g: GEnv, from: number, options: { stop?: (i: number) => boolean } = {}): ClientResolved | null {
  // 1. Entre comillas (antes o después del sustantivo: en turco el nombre va primero)
  let quoted = c.findLiteral('quoted', from)
  if (quoted < 0) quoted = c.findLiteral('quoted')
  if (quoted >= 0) {
    const raw = c.atoms[quoted].lit!.raw
    c.use(quoted)
    const named = entriesNamed(g, 'client', raw)
    if (named.length === 1) return { clientId: named[0].id, name: named[0].name }
    if (named.length > 1) return { name: raw, choices: named }
    return { name: raw }
  }
  // 2. Nombre completo de un cliente en cualquier parte de la cláusula
  const partials: number[] = []
  for (let i = c.from; i < c.to; i++) {
    if (c.used.has(i)) continue
    const hits = c.entityAt(i, 'client')
    if (!hits.length) continue
    const exact = hits.filter((h) => h.exact && !h.partial)
    if (exact.length && !c.atoms[i].fuzzy) {
      const unique = [...new Map(exact.map((h) => [c.entry(h).id, c.entry(h)])).values()]
      c.use(i)
      if (unique.length === 1) return { clientId: unique[0].id, name: unique[0].name }
      return { name: c.raw(i), choices: unique }
    }
    partials.push(i)
  }
  // 3. Texto libre: un nombre exacto, una sola palabra de un nombre («Pérez») o un nombre nuevo.
  const text = c.freeText(from, {
    stop: (k) => (options.stop?.(k) ?? false) || c.isPrefix(k, 'act.') || c.is(k, 'obj.phone') || c.is(k, 'obj.email') || c.is(k, 'obj.rut') || c.lit(k, 'quoted') || c.is(k, 'trg.named'),
    maxWords: 6,
  })
  const name = text.text ? cleanQuery(text.text) : ''
  const fromPartial = (i: number): ClientResolved => {
    const hits = c.entityAt(i, 'client')
    const unique = [...new Map(hits.map((h) => [c.entry(h).id, c.entry(h)])).values()]
    c.use(i)
    if (c.atoms[i].fuzzy) return { name: c.raw(i), choices: unique, fuzzy: true }
    if (unique.length === 1) return { clientId: unique[0].id, name: unique[0].name, partial: c.raw(i) }
    return { name: c.raw(i), choices: unique }
  }
  if (name && /\p{L}/u.test(name)) {
    c.use(text.atoms)
    const named = entriesNamed(g, 'client', name)
    if (named.length === 1) return { clientId: named[0].id, name: named[0].name }
    if (named.length > 1) return { name, choices: named }
    const inside = partials.filter((i) => text.atoms.includes(i))
    if (inside.length === 1 && text.atoms.filter((i) => !c.isFiller(i)).length === 1) return fromPartial(inside[0])
    // Una sola palabra que también existe en otro idioma del léxico («Ana» es «principal» en turco):
    // se busca igual entre las palabras de los nombres.
    const key = nameKey(name)
    if (key && !key.includes(' ')) {
      const words = g.bundle.index.words
      const at = lowerBound(words, key)
      if (words[at]?.fold === key) {
        const entries = [...new Map(words[at].hits.filter((h) => h.type === 'client').map((h) => [g.bundle.index.lists.client[h.idx].id, g.bundle.index.lists.client[h.idx]])).values()]
        if (entries.length === 1) return { clientId: entries[0].id, name: entries[0].name, partial: name }
        if (entries.length > 1) return { name, choices: entries }
      }
    }
    return { name }
  }
  if (partials.length === 1) return fromPartial(partials[0])
  return null
}

// ── Plantilla y asistente ───────────────────────────────────────────────────

export function resolveTemplate(c: Clause, g: GEnv, from: number): { templateId?: string; name: string; choices?: EntityEntry[] } | null {
  const quoted = c.findLiteral('quoted', from)
  const pick = (raw: string) => {
    const named = entriesNamed(g, 'template', raw)
    if (named.length >= 1) return { templateId: named[0].id, name: named[0].name }
    const all = g.bundle.index.lists.template
    return all.length ? { name: raw, choices: all } : { name: raw }
  }
  if (quoted >= 0) {
    c.use(quoted)
    return pick(c.atoms[quoted].lit!.raw)
  }
  const ent = c.findEntity('template')
  if (ent) {
    const exact = ent.hits.filter((h) => h.exact)
    c.use(ent.i)
    const entries = (exact.length ? exact : ent.hits).map((h) => c.entry(h))
    if (entries.length === 1) return { templateId: entries[0].id, name: entries[0].name }
    return { name: c.raw(ent.i), choices: entries }
  }
  const text = c.freeText(from, { stop: (k) => c.isPrefix(k, 'act.') || c.is(k, 'obj.quote') || c.isPrefix(k, 'scp.'), maxWords: 4 })
  if (!text.text) return null
  c.use(text.atoms)
  return pick(cleanQuery(text.text))
}

export function resolveAssistant(c: Clause, g: GEnv, from: number): { assistantId?: string; name: string; choices?: EntityEntry[] } | null {
  const ent = c.findEntity('assistant')
  if (ent) {
    c.use(ent.i)
    const entries = ent.hits.map((h) => c.entry(h))
    if (entries.length === 1) return { assistantId: entries[0].id, name: entries[0].name }
    return { name: c.raw(ent.i), choices: entries }
  }
  const quoted = c.findLiteral('quoted', from)
  const text = quoted >= 0 ? { text: c.atoms[quoted].lit!.raw, atoms: [quoted] } : c.freeText(from, { maxWords: 3, stop: (k) => c.isPrefix(k, 'act.') })
  if (!text.text) return null
  c.use(text.atoms)
  const named = entriesNamed(g, 'assistant', cleanQuery(text.text))
  if (named.length) return { assistantId: named[0].id, name: named[0].name }
  return { name: cleanQuery(text.text), choices: g.bundle.index.lists.assistant }
}

// ── Ítems de la cotización abierta ──────────────────────────────────────────

export interface ItemsResolved {
  target: NluItemTarget
  label: string
  /** Cuántos ítems toca (si se sabe). */
  count?: number
  explicit: boolean
}

export function itemChoices(g: GEnv, allowAll: boolean): NluSuggestion[] {
  const items = g.ctx.items ?? []
  const out = items.slice(0, 12).map((it, i) =>
    appendChoice(g, 'value', it.ref, it.ref, { id: it.id, detail: [it.typology ? g.glossary.typologyName(it.typology, g.locale) : '', it.location ?? ''].filter(Boolean).join(' · '), score: 1 - i * 0.01 }),
  )
  if (allowAll && items.length > 1) out.push(appendChoice(g, 'value', tr(g, 'sum.targetAllCount', { count: items.length }), conceptSurface('scp.all', g.inputLocale) ?? 'todas', { id: 'all', score: 0.5 }))
  return out
}

/**
 * Ítems a los que apunta la cláusula. Sin referencia: el seleccionado; si hay uno solo, ese; si no
 * hay ninguno, error; si hay varios, pide cuál.
 */
export function resolveItems(c: Clause, g: GEnv, b: Build, options: { allowAll: boolean; single?: boolean }): ItemsResolved | null {
  const pick = c.target({ allowAll: options.allowAll })
  c.use(pick.atoms)
  const items = g.ctx.items
  // Palabras genéricas que nombran la ventana («la ventana», «el ítem»): parte de la referencia.
  useConcepts(c, 'obj.item', 'obj.window', 'scp.selected', 'scp.this')
  if (pick.found) {
    if (pick.all) {
      if (items && !items.length) {
        b.fail(tr(g, 'reply.noItems'))
        return null
      }
      return { target: { all: true }, label: items ? tr(g, 'sum.targetAllCount', { count: items.length }) : tr(g, 'sum.targetAll'), count: items?.length, explicit: true }
    }
    const refs = (pick.items ?? [pick.ref!]).map((r) => {
      if (!r.startsWith('#')) return r
      const n = Number(r.slice(1))
      if (items?.length) return n < 0 ? items[items.length + n]?.ref ?? r : items[n - 1]?.ref ?? r
      return n > 0 ? `V${n}` : r
    })
    const unknownRef = refs.find((r) => r.startsWith('#'))
    if (unknownRef) {
      b.need(slot(g, 'item', undefined, itemChoices(g, options.allowAll)))
      return null
    }
    if (items) {
      const known = new Set(items.map((i) => i.ref.toUpperCase()))
      const missing = refs.find((r) => !known.has(r.toUpperCase()))
      if (missing) {
        b.fail(tr(g, 'reply.itemMissing', { ref: missing }))
        b.ambiguous(slot(g, 'item', undefined, itemChoices(g, options.allowAll)))
        return null
      }
    }
    if (options.single && refs.length > 1) {
      b.need(slot(g, 'item', undefined, itemChoices(g, false)))
      return null
    }
    return refs.length === 1 ? { target: { ref: refs[0] }, label: refs[0], count: 1, explicit: true } : { target: { items: refs }, label: refs.join(', '), count: refs.length, explicit: true }
  }
  const selected = g.ctx.selectedRef
  if (selected) {
    b.assume(tr(g, 'assume.selected', { ref: selected }))
    return { target: { ref: selected }, label: selected, count: 1, explicit: false }
  }
  if (items) {
    if (!items.length) {
      b.fail(tr(g, 'reply.noItems'))
      return null
    }
    if (items.length === 1) {
      b.assume(tr(g, 'assume.onlyItem', { ref: items[0].ref }))
      return { target: { ref: items[0].ref }, label: items[0].ref, count: 1, explicit: false }
    }
    b.need(slot(g, 'item', undefined, itemChoices(g, options.allowAll)))
    return null
  }
  return { target: {}, label: tr(g, 'sum.targetSelected'), explicit: false }
}

// ── Ventana: especificación completa ────────────────────────────────────────

export type WindowArgs = NluDesignArgs & { typology?: TypologyId; qty?: number; pane?: number; opening?: OpeningKind }

export interface WindowSpec {
  args: WindowArgs
  /** Piezas del resumen (sin la acción ni la tipología). */
  parts: string[]
  typologyLabel?: string
  /** Conjunto en vez de una ventana suelta. */
  assembly?: { preset: AssemblyPick; panes?: number }
  changed: boolean
  hasMeasure: boolean
  hasTypology: boolean
  /** Hojas sin familia (para derivar la tipología del ítem actual). */
  loosePanels?: number
  /** Nombra un paño u hoja de una ventana existente («la hoja derecha»). */
  pane: boolean
}

const GLASS_V4: Record<string, string> = {
  'gls.double': 'termopanel',
  'gls.triple': 'triple vidriado',
  'gls.laminated': 'laminado',
  'gls.tempered': 'templado',
  'gls.single': 'simple',
  'gls.low_e': 'low-e',
  'gls.frosted': 'satinado',
  'gls.acoustic': 'acústico',
  'gls.solar_control': 'control solar',
  'gls.reflective': 'reflectivo',
  'gls.argon': 'argón',
}
const GLASS_TERM: Record<string, string> = {
  'gls.double': 'glass.double',
  'gls.triple': 'glass.triple',
  'gls.laminated': 'glass.laminated',
  'gls.tempered': 'glass.tempered',
  'gls.single': 'glass.single',
  'gls.low_e': 'glass.low_e',
  'gls.frosted': 'glass.frosted',
  'gls.acoustic': 'glass.acoustic',
  'gls.solar_control': 'glass.solar_control',
  'gls.argon': 'glass.argon',
}
const GLASS_ORDER = ['gls.triple', 'gls.double', 'gls.laminated', 'gls.tempered', 'gls.single', 'gls.low_e', 'gls.frosted', 'gls.acoustic', 'gls.solar_control', 'gls.reflective', 'gls.argon']

function sortGlass(concepts: readonly string[]): string[] {
  return [...concepts].sort((a, b) => GLASS_ORDER.indexOf(a) - GLASS_ORDER.indexOf(b))
}

/** Nombre del vidrio para el ejecutor (español, como en v4): «DVH 4+16+4 low-e», «laminado 3+3». */
export function glassArgName(pick: GlassPick): string {
  if (pick.id) return pick.name
  const concepts = sortGlass(pick.concepts)
  const recipe = pick.recipe?.replace(/\//g, '+')
  const words: string[] = []
  const covered = new Set<string>()
  if (recipe) {
    if (concepts.includes('gls.triple')) words.push(`TVH ${recipe}`), covered.add('gls.triple')
    else if (concepts.includes('gls.laminated') && !concepts.includes('gls.double')) words.push(`laminado ${recipe}`), covered.add('gls.laminated')
    else words.push(`DVH ${recipe}`), covered.add('gls.double')
  } else if (concepts.includes('gls.single') && /\d/.test(pick.name)) {
    words.push(pick.name)
    covered.add('gls.single')
  }
  for (const k of concepts) if (!covered.has(k) && GLASS_V4[k]) words.push(GLASS_V4[k])
  return words.join(' ') || pick.name
}

/** Nombre del vidrio para mostrar en el idioma de la interfaz. */
export function glassLabel(g: GEnv, pick: GlassPick): string {
  if (pick.id) return pick.name
  const concepts = sortGlass(pick.concepts)
  const recipe = pick.recipe?.replace(/\//g, '+')
  const words: string[] = []
  for (const k of concepts) {
    const key = GLASS_TERM[k]
    const label = key ? g.glossary.term(key as Parameters<GEnv['glossary']['term']>[0], g.locale) : (conceptSurface(k, g.locale) ?? k.slice(4))
    words.push(words.length ? inline(label, g.locale) : label)
    if (recipe && words.length === 1) words.push(recipe)
  }
  if (!words.length) return recipe ? `DVH ${recipe}` : pick.name
  return words.join(' ')
}

/** Nombre de un color para el ejecutor (catálogo o término en español). */
function colorArg(pick: ColorPick): string {
  return pick.name
}

export function colorLabel(g: GEnv, pick: ColorPick): string {
  if (pick.id || !pick.concept) return pick.name
  return conceptSurface(pick.concept, g.locale) ?? pick.name
}

function colorChoices(g: GEnv, entries: readonly EntityEntry[]): NluSuggestion[] {
  return entries.slice(0, 8).map((e, i) => appendChoice(g, 'color', e.name, e.name, { id: e.id, detail: e.detail, score: 1 - i * 0.01 }))
}

function glassChoices(g: GEnv, entries: readonly EntityEntry[]): NluSuggestion[] {
  return entries.slice(0, 8).map((e, i) => appendChoice(g, 'glass', e.name, e.name, { id: e.id, detail: e.detail, score: 1 - i * 0.01 }))
}

const MAX_MM = 20000

/**
 * Lee todo lo que describe una ventana. `mode='add'` acepta un ancho suelto («corredera de 1500») y
 * la cantidad antes del producto; `mode='update'` solo cantidades rotuladas («cantidad 5», «x5»).
 */
export function windowSpec(c: Clause, g: GEnv, b: Build, mode: 'add' | 'update'): WindowSpec {
  const args: WindowArgs = {}
  const parts: string[] = []
  let changed = false
  let hasMeasure = false
  let hasTypology = false
  let typologyLabel: string | undefined
  let loosePanels: number | undefined
  let showQty = false
  let pane = false

  // Medidas
  const m = c.measure() ?? (mode === 'add' ? c.loneWidth() : null)
  if (m) {
    c.use(m.atoms)
    // «1500x» o «1500 por» a medio escribir: el separador queda explicado y falta el alto.
    const last = Math.max(...m.atoms)
    if (m.height === undefined && (c.lit(last + 1, 'x') || c.is(last + 1, 'sep.x'))) c.use(last + 1)
    hasMeasure = true
    changed = true
    const bad = [m.width, m.height].some((v) => v !== undefined && (!(v > 0) || v > MAX_MM))
    if (m.third) {
      const written = m.written ?? `${m.width} × ${m.height}`
      b.fail(tr(g, 'reply.thirdAxis', { written }))
    } else if (bad) {
      b.fail(tr(g, 'reply.sizeInvalid', { size: `${m.width ?? '?'} × ${m.height ?? '?'} mm` }))
    }
    if (m.width !== undefined) args.width = m.width
    if (m.height !== undefined) args.height = m.height
    if (m.width !== undefined && m.height !== undefined) {
      const size = fmt.size(g, m.width, m.height)
      parts.push(size)
      if (m.inferred) {
        b.assume(tr(g, m.inferred === 'cm' ? 'assume.cm' : 'assume.m', { written: m.written ?? '', size }))
        const end = c.an.tokens[c.atoms[Math.max(...m.atoms)].e - 1].end
        const fixed = `${g.text.slice(0, end)} mm${g.text.slice(end)}`
        b.repair(tr(g, 'repair.useMm'), fixed)
        if (m.inferred === 'm') b.repair(tr(g, 'repair.useCm'), `${g.text.slice(0, end)} cm${g.text.slice(end)}`)
      }
      b.fill('size', 'width', 'height')
    } else if (mode === 'update') {
      // Cambiar solo el ancho o solo el alto de una ventana existente.
      if (m.width !== undefined) parts.push(`${tr(g, 'slot.width')} ${fmt.mm(g, m.width)}`)
      if (m.height !== undefined) parts.push(`${tr(g, 'slot.height')} ${fmt.mm(g, m.height)}`)
      b.fill('size', 'width', 'height')
    } else if (m.width !== undefined) {
      b.fill('width')
      b.need(slot(g, 'height', tr(g, 'prompt.height', { width: fmt.mm(g, m.width).replace(/\s*mm$/, '') }), [appendChoice(g, 'hint', tr(g, 'prompt.sizeHint'), '')]))
    } else if (m.height !== undefined) {
      b.fill('height')
      b.need(slot(g, 'width', tr(g, 'prompt.width', { height: fmt.mm(g, m.height).replace(/\s*mm$/, '') })))
    }
  }

  // Conjunto de ventanas: se agrega, no se cambia una ventana existente.
  const asm = mode === 'add' ? c.assembly() : null
  let assembly: WindowSpec['assembly']
  if (asm) {
    c.use(asm.atoms)
    hasTypology = true
    changed = true
    b.fill('typology', 'panels')
    assembly = { preset: asm.preset, ...(asm.panes !== undefined ? { panes: asm.panes } : {}) }
  }

  // Tipología
  const tp = asm ? null : c.typology()
  if (tp) {
    c.use(tp.atoms)
    hasTypology = true
    if (tp.missingPanels) {
      const choices = (tp.options ?? []).map((id, i) => appendChoice(g, 'typology', g.glossary.typologyName(id, g.locale), inline(g.glossary.typologyName(id, g.inputLocale), g.inputLocale), { id, score: 1 - i * 0.01 }))
      b.need(slot(g, 'panels', tp.family === 'fam.folding' ? tr(g, 'prompt.folding') : tr(g, 'prompt.panels'), choices))
    } else if (tp.id) {
      changed = true
      b.fill('typology', 'panels')
      typologyLabel = g.glossary.typologyName(tp.id, g.locale)
      const opening = simpleOpening(tp.id)
      args.typology = tp.id
      if (mode === 'update' && opening) args.opening = opening
    }
  } else {
    const specs = c.panelSpecs()
    if (specs.leaf && mode === 'update') {
      loosePanels = specs.leaf.count
      c.use(specs.leaf.atoms)
    }
  }

  // Cantidad
  const q = c.quantity(tp?.at ?? -1)
  if (q) {
    const labeled = q.atoms.some((i) => c.isPrefix(i, 'qty.') || c.lit(i, 'x'))
    if (mode === 'add' || labeled) {
      c.use(q.atoms)
      useConcepts(c, 'qty.label')
      if (q.conflict) {
        const values = [...new Set(q.atoms.map((i) => c.num(i)).filter((v): v is number => v !== undefined && v !== 1))]
        b.fail(tr(g, 'reply.qtyConflict', { a: values[0] ?? q.qty, b: values[1] ?? q.qty }))
      }
      // «dos ventanas unidas»: el número cuenta las ventanas del conjunto, no copias de él.
      if (assembly?.preset === 'coupled_2' && !labeled) {
        if (q.qty > 3) b.fail(tr(g, 'reply.assemblyCount'))
        assembly = { ...assembly, preset: q.qty === 3 ? 'coupled_3' : 'coupled_2' }
      } else {
        args.qty = q.qty
        showQty = q.qty > 1 || labeled
      }
      changed = true
      b.fill('quantity')
    }
  }

  // Colores
  const col = c.colors()
  if (col.color || col.colorIn) {
    c.use(col.atoms)
    changed = true
    b.fill('color')
    const apply = (pick: ColorPick, inside: boolean) => {
      if (pick.choices?.length) {
        b.ambiguous(slot(g, 'color', undefined, colorChoices(g, pick.choices)))
      }
      if (inside) {
        if (pick.id) args.colorInId = pick.id
        args.color_in = colorArg(pick)
      } else {
        if (pick.id) args.colorId = pick.id
        args.color = colorArg(pick)
      }
    }
    if (col.color) apply(col.color, false)
    if (col.colorIn) apply(col.colorIn, true)
    if (col.color && col.colorIn) parts.push(tr(g, 'sum.colorOut', { color: colorLabel(g, col.color) }), tr(g, 'sum.colorIn', { color: colorLabel(g, col.colorIn) }))
    else if (col.color) parts.push(colorLabel(g, col.color))
    else if (col.colorIn) parts.push(tr(g, 'sum.colorIn', { color: colorLabel(g, col.colorIn) }))
  }

  // Vidrio
  const gl = c.glass()
  if (gl) {
    c.use(gl.atoms)
    changed = true
    b.fill('glass')
    if (gl.choices?.length) b.ambiguous(slot(g, 'glass', undefined, glassChoices(g, gl.choices)))
    if (gl.id) args.glassId = gl.id
    args.glass = glassArgName(gl)
    parts.push(glassLabel(g, gl))
  }

  // Línea (+ «marca VEKA»)
  const ln = c.line()
  if (ln) {
    c.use(ln.atoms)
    changed = true
    b.fill('line')
    let id = ln.id
    let name = ln.name
    if (!id) {
      const named = entriesNamed(g, 'line', name)
      if (named.length) {
        id = named[0].id
        name = named[0].name
      }
    }
    if (id) args.lineId = id
    args.line = name
    parts.push(tr(g, 'sum.line', { line: name }))
    const brand = c.find('obj.brand')
    if (brand >= 0) {
      c.use(brand)
      const nx = c.next(brand)
      if (nx >= 0 && !c.used.has(nx) && (c.atoms[nx].kind === 'unknown' || c.atoms[nx].kind === 'literal' || c.atoms[nx].fuzzy)) {
        c.use(nx)
        c.textAtoms.add(nx)
      }
    }
  }

  // Apertura
  const op = c.opening()
  if (op.atoms.length) {
    c.use(op.atoms)
    if (op.hinge) {
      args.hinge = op.hinge
      parts.push(inline(g.glossary.term(`hinge.${op.hinge}`, g.locale), g.locale))
    }
    if (op.direction) {
      args.direction = op.direction
      parts.push(inline(g.glossary.term(`direction.${op.direction}`, g.locale), g.locale))
    }
    if (op.sequence) {
      args.sequence = op.sequence
      parts.push(inline(g.glossary.term(`sequence.${op.sequence}`, g.locale), g.locale))
    }
    if (op.pane !== undefined) pane = true
    if (op.pane !== undefined && mode === 'update') {
      args.pane = op.pane
      parts.push(op.pane < 0 ? tr(g, 'sum.paneLast') : tr(g, 'sum.pane', { n: op.pane }))
    }
    if (op.hinge || op.direction || op.sequence) changed = true
  }

  // Accesorios
  const ex = c.extras()
  if (ex) {
    c.use(ex.atoms)
    changed = true
    args.extras = ex.extras
    parts.push(...extrasParts(g, ex.extras))
  }

  // Ambiente
  const loc = c.location()
  if (loc) {
    c.use(loc.atoms)
    changed = true
    args.location = loc.name
    parts.push(tr(g, 'sum.location', { location: loc.name }))
  }

  // Palabras de categoría ya explicadas por su valor («el color», «el vidrio», «el marco»).
  if (args.color || args.color_in) useConcepts(c, 'obj.color', 'obj.frame', 'obj.texture')
  if (args.glass) useConcepts(c, 'obj.glass')
  if (args.line) useConcepts(c, 'obj.line')
  if (args.typology) useConcepts(c, 'obj.typology', 'obj.opening')
  if (args.extras) useConcepts(c, 'obj.accessory')
  if (args.hinge) useConcepts(c, 'obj.opening')
  if (args.qty !== undefined && showQty) parts.push(tr(g, 'sum.quantity', { count: args.qty }))
  if (assembly) typologyLabel = assemblyLabel(assembly.preset, g.locale)
  return { args, parts, typologyLabel, ...(assembly ? { assembly } : {}), changed, hasMeasure, hasTypology, loosePanels, pane }
}

export function extrasParts(g: GEnv, extras: NluExtras): string[] {
  const out: string[] = []
  const term = (key: string) => inline(g.glossary.term(key as Parameters<GEnv['glossary']['term']>[0], g.locale), g.locale)
  if (extras.rollerShutter === null) out.push(tr(g, 'sum.without', { what: term('accessory.rollerShutter') }))
  else if (extras.rollerShutter) {
    const bits = [term('accessory.rollerShutter')]
    if (extras.rollerShutter.type) bits.push(term(`accessory.rollerShutterType.${extras.rollerShutter.type}`))
    if (extras.rollerShutter.operation) bits.push(term(`accessory.rollerShutterOperation.${extras.rollerShutter.operation}`))
    out.push(bits.join(' · '))
  }
  if (extras.insectScreen === null) out.push(tr(g, 'sum.without', { what: term('accessory.insectScreen') }))
  else if (extras.insectScreen) out.push(extras.insectScreen.type ? `${term('accessory.insectScreen')} · ${term(`accessory.insectScreenType.${extras.insectScreen.type}`)}` : term('accessory.insectScreen'))
  if (extras.sill === true) out.push(term('accessory.sill'))
  else if (extras.sill === false) out.push(tr(g, 'sum.without', { what: term('accessory.sill') }))
  if (extras.threshold === true) out.push(term('accessory.threshold'))
  else if (extras.threshold === false) out.push(tr(g, 'sum.without', { what: term('accessory.threshold') }))
  return out
}

/** Hojas sin familia sobre un ítem conocido: «cambia la V2 a 3 hojas» con la V2 corredera → corredera 3 hojas. */
export function typologyFromPanels(current: string | undefined, panels: number): TypologyId | undefined {
  if (!current) return undefined
  if (current.startsWith('lift_slide')) return panels >= 2 && panels <= 4 ? (`lift_slide_${panels}` as TypologyId) : undefined
  if (current.startsWith('folding')) return panels >= 3 && panels <= 7 ? (`folding_${panels}` as TypologyId) : undefined
  if (current.startsWith('sliding')) return panels === 2 ? 'sliding_2' : panels === 3 ? 'sliding_3' : panels === 4 ? 'sliding_4' : panels === 6 ? 'sliding_6' : undefined
  if (current === 'casement' || current === 'casement_double') return panels === 1 ? 'casement' : panels === 2 ? 'casement_double' : undefined
  if (current === 'tilt_turn' || current === 'french_tilt_turn') return panels === 1 ? 'tilt_turn' : panels === 2 ? 'french_tilt_turn' : undefined
  return undefined
}

/** Superficies de un concepto en el idioma de entrada (para frases de reparación). */
export function surface(g: GEnv, concept: string): string {
  return conceptSurface(concept, g.inputLocale) ?? conceptSurfaces(concept, 'es')[0] ?? concept
}
