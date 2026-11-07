/**
 * Análisis léxico de una frase: tokens → átomos sin solaparse.
 *
 * Orden (investigación 24 §2.2): literales protegidos (comillas, correos, teléfonos, #123, V2,
 * recetas de vidrio, %) → la coincidencia más larga entre léxico, entidades del catálogo/datos y
 * números escritos → detección de idioma → se descartan los alias débiles de otros idiomas →
 * corrección acotada de errores de tipeo en lo que quedó sin reconocer.
 */
import type { Locale } from '../i18n/locales'
import { lookupFuzzy } from './fuzzy'
import { conceptSurfaces, lexiconIndex, LEXICON_LOCALES, type LexHit, type TrieNode } from './lexicon'
import { readWordNumber, type WordNumber } from './numbers'
import { foldText, readNumeric, strictText, tokenize, type Token } from './text'
import type { EntityHit, EntityIndex } from './entities'

export type AtomKind = 'concept' | 'entity' | 'number' | 'literal' | 'unknown' | 'punct'

export interface Atom {
  /** Rango de tokens [s, e). */
  s: number
  e: number
  kind: AtomKind
  /** Conceptos del léxico (ya filtrados por idioma). */
  hits: LexHit[]
  /** Entidades (catálogo, clientes, cotizaciones, plantillas, asistentes). */
  ents: EntityHit[]
  /** Número (cifras o palabras). */
  num?: { value: number; raw?: string; words: boolean; weak: boolean; decimals: number; locale?: Locale }
  /** Token literal (comillas, correo, teléfono, #, V, receta, %, x). */
  lit?: Token
  /** Distancia de la corrección de tipeo (0 = exacto). */
  fuzzy?: number
  /** Palabra corregida (clave plegada del léxico o del nombre) cuando hubo corrección. */
  fix?: string
  /** Frase completada a partir de una palabra a medio escribir («tilt and tur» → «tilt and turn»). */
  partial?: boolean
}

export interface Analysis {
  text: string
  tokens: Token[]
  atoms: Atom[]
  /** Idioma dominante detectado (null = indeterminado). */
  language: Locale | null
  /** Puntaje por idioma (para desempates de alias). */
  langScores: Partial<Record<Locale, number>>
}

const LITERAL_KINDS = new Set(['quoted', 'email', 'phone', 'hash', 'vref', 'recipe', 'pct', 'x'])
const PHRASE_PUNCT = new Set(['+', '°'])

interface TrieMatch<H> {
  end: number
  hits: H[]
}

/** Recorre un trie desde el token `i` y devuelve la coincidencia más larga con aciertos. */
function walk<H>(root: { next?: Map<string, { next?: Map<string, unknown>; hits?: H[] }> } | TrieNode, tokens: readonly Token[], i: number, accept?: (hits: H[], from: number, to: number) => H[]): TrieMatch<H> | null {
  let node = root as { next?: Map<string, { next?: Map<string, unknown>; hits?: H[] }>; hits?: H[] }
  let best: TrieMatch<H> | null = null
  for (let j = i; j < tokens.length && j < i + 8; j++) {
    const t = tokens[j]
    if (t.kind === 'punct' && !PHRASE_PUNCT.has(t.raw)) break
    if (t.kind === 'quoted' || t.kind === 'email' || t.kind === 'phone') break
    const next = node.next?.get(t.fold) as typeof node | undefined
    if (!next) {
      // Palabras unidas por guion: «oscilo-batiente» busca también «oscilobatiente».
      if (j === i && t.join === '-' && j + 1 < tokens.length) {
        const joined = node.next?.get(t.fold + tokens[j + 1].fold) as typeof node | undefined
        if (joined?.hits?.length) {
          const hits = accept ? accept(joined.hits, i, j + 2) : joined.hits
          if (hits.length) best = { end: j + 2, hits }
        }
      }
      break
    }
    node = next
    if (node.hits?.length) {
      const hits = accept ? accept(node.hits, i, j + 1) : node.hits
      if (hits.length) best = { end: j + 1, hits }
    }
  }
  return best
}

function strictOf(tokens: readonly Token[], from: number, to: number): string {
  return tokens
    .slice(from, to)
    .map((t) => strictText(t.raw))
    .join(' ')
    .replace(/[¿?¡!]/g, '')
    .trim()
}

/** Pesos de evidencia de idioma: palabras exclusivas de un idioma cuentan más. */
function languageEvidence(atoms: readonly Atom[]): Partial<Record<Locale, number>> {
  const scores: Partial<Record<Locale, number>> = {}
  for (const a of atoms) {
    if (!a.hits.length) {
      if (a.num?.words && a.num.locale && !a.num.weak) scores[a.num.locale] = (scores[a.num.locale] ?? 0) + 0.5
      continue
    }
    const langs = new Set<Locale>()
    let fillerOnly = true
    for (const h of a.hits) {
      langs.add(h.l)
      if (!h.c.startsWith('fil')) fillerOnly = false
    }
    if (langs.size === LEXICON_LOCALES.length) continue
    const weight = (fillerOnly ? 0.5 : 1) / langs.size
    for (const l of langs) scores[l] = (scores[l] ?? 0) + weight
  }
  return scores
}

function dominant(scores: Partial<Record<Locale, number>>, prior: Locale): Locale | null {
  const ranked = (Object.entries(scores) as [Locale, number][]).sort((a, b) => b[1] - a[1] || (a[0] === prior ? -1 : b[0] === prior ? 1 : 0))
  if (!ranked.length) return null
  const [top, second] = ranked
  if (top[1] < 0.9) return null
  if (second && top[1] < second[1] * 1.4 && second[1] > 0.5) return null
  return top[0]
}

/**
 * Frase del léxico a medio escribir: «tilt and tur» (la última palabra sin terminar) se completa a
 * «tilt and turn» en el idioma del texto en vez de leer «tur» como la «Tür» alemana. El átomo
 * resultante queda marcado como corrección parcial: se muestra y se confirma, nunca se ejecuta solo.
 */
function completePhrases(text: string, atoms: Atom[], tokens: readonly Token[], root: TrieNode, active: Locale): void {
  for (let k = atoms.length - 1; k >= 1; k--) {
    const a = atoms[k]
    if (a.e - a.s !== 1 || (a.kind !== 'unknown' && a.kind !== 'concept')) continue
    const t = tokens[a.s]
    if (t.kind !== 'word' || t.fold.length < 2 || /\d/.test(t.fold)) continue
    if (a.hits.some((h) => h.l === active)) continue
    let found: { m: number; key: string; hits: LexHit[] } | null = null
    // La frase más larga primero (hasta 4 átomos antes de la palabra).
    for (let m = Math.max(0, k - 4); m < k && !found; m++) {
      let node: TrieNode | undefined = root
      for (let j = atoms[m].s; j < a.s && node; j++) {
        const tok = tokens[j]
        node = tok.kind === 'punct' && !PHRASE_PUNCT.has(tok.raw) ? undefined : node.next?.get(tok.fold)
      }
      if (!node?.next) continue
      let best: [string, LexHit[]] | null = null
      for (const [key, child] of node.next) {
        if (key.length <= t.fold.length || !key.startsWith(t.fold)) continue
        const hits = child.hits?.filter((h) => h.l === active && !h.strict)
        if (hits?.length && (!best || key.length < best[0].length)) best = [key, hits]
      }
      if (best) found = { m, key: best[0], hits: best[1] }
    }
    if (!found) continue
    const start = atoms[found.m].s
    const merged: Atom = { s: start, e: a.e, kind: 'concept', hits: found.hits, ents: [], fuzzy: 1, fix: text.slice(tokens[start].start, t.start) + found.key, partial: true }
    atoms.splice(found.m, k - found.m + 1, merged)
    k = found.m
  }
}

/**
 * Coincidencia exacta solo en otro idioma y poco fiable (≤ 3 letras, o sin las tildes de la
 * superficie): «tur» en un texto en inglés no es «Tür». Se trata como corrección (se muestra la
 * interpretación y se pide confirmar) y se propone la palabra del idioma del texto.
 */
function flagForeignShortHits(text: string, atoms: Atom[], tokens: readonly Token[], active: Locale): void {
  for (const a of atoms) {
    if (a.kind !== 'concept' || a.fuzzy || !a.hits.length || a.hits.some((h) => h.l === active)) continue
    if (a.hits.some((h) => /^(fil|pol|trg\.to)$/.test(h.c))) continue
    const raw = text.slice(tokens[a.s].start, tokens[a.e - 1].end)
    const fold = foldText(raw)
    const strict = strictText(raw)
    let exact = false
    for (const h of a.hits) for (const s of conceptSurfaces(h.c, h.l)) if (foldText(s) === fold && strictText(s, h.l === 'tr') === strict) exact = true
    if (fold.replace(/\s+/g, '').length > 3 && exact) continue
    const native = a.hits.map((h) => conceptSurfaces(h.c, active)[0]).find(Boolean)
    a.fuzzy = 1
    a.fix = native ?? raw
  }
}

/** Verbos que modifican datos: nunca se aceptan corregidos por tipeo (exigen alias exacto). */
const NO_FUZZY_CONCEPTS = /^(act\.(remove|send|share|forget)|neg\.)/

export interface AnalyzeOptions {
  entities?: EntityIndex
  prior: Locale
}

/** Analiza un texto completo (antes de dividir en cláusulas). */
export function analyze(text: string, options: AnalyzeOptions): Analysis {
  const lex = lexiconIndex()
  const tokens = tokenize(text)
  const atoms: Atom[] = []
  const preferNum: Locale[] = [options.prior]
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (LITERAL_KINDS.has(t.kind)) {
      atoms.push({ s: i, e: i + 1, kind: 'literal', hits: [], ents: [], lit: t })
      i++
      continue
    }
    if (t.kind === 'punct' && !PHRASE_PUNCT.has(t.raw)) {
      atoms.push({ s: i, e: i + 1, kind: 'punct', hits: [], ents: [] })
      i++
      continue
    }
    const lexMatch = walk<LexHit>(lex.root, tokens, i, (hits, from, to) => {
      if (!hits.some((h) => h.strict)) return hits
      const strict = strictOf(tokens, from, to)
      return hits.filter((h) => !h.strict || h.strict === strict)
    })
    const entMatch = options.entities ? walk<EntityHit>(options.entities.root, tokens, i) : null
    let num: WordNumber | null = null
    let digits: Atom['num'] | undefined
    if (t.kind === 'num') {
      const r = readNumeric(t.raw)
      digits = { value: r?.value ?? t.value ?? 0, raw: t.raw, words: false, weak: false, decimals: r?.decimals ?? 0 }
    } else if (t.kind === 'word') num = readWordNumber(tokens, i, preferNum)
    // «+» suelto (no inicia una frase del léxico como «+ fijo»): puntuación.
    if (t.kind === 'punct' && !lexMatch) {
      atoms.push({ s: i, e: i + 1, kind: 'punct', hits: [], ents: [] })
      i++
      continue
    }
    const lexEnd = lexMatch?.end ?? 0
    const entEnd = entMatch?.end ?? 0
    const numEnd = digits ? i + 1 : (num?.end ?? 0)
    const end = Math.max(lexEnd, entEnd, numEnd, i + 1)
    // Un número escrito más largo que cualquier frase gana («mil quinientos»); a igual largo, el
    // léxico y las entidades conviven con el número en el mismo átomo («una» = artículo y 1).
    const atom: Atom = { s: i, e: end, kind: 'unknown', hits: [], ents: [] }
    if (lexEnd === end) atom.hits = lexMatch!.hits.slice()
    if (entEnd === end) atom.ents = entMatch!.hits.slice()
    if (numEnd === end) {
      if (digits) atom.num = digits
      else if (num) atom.num = { value: num.value, words: true, weak: num.weak, decimals: num.decimals, locale: num.locale }
    }
    atom.kind = atom.ents.length ? 'entity' : atom.hits.length ? 'concept' : atom.num ? 'number' : 'unknown'
    if (atom.num && atom.kind === 'concept' && !atom.num.weak) atom.kind = 'number'
    atoms.push(atom)
    i = end
  }

  // Idioma: evidencia léxica (sin nombres propios, números ni marcas).
  const scores = languageEvidence(atoms)
  const language = dominant(scores, options.prior)
  const active = language ?? options.prior
  // Una palabra que existe en el idioma del texto se lee solo en ese idioma («de» en español es una
  // preposición, aunque en portugués también sea «dar»). Las de otros idiomas se conservan (mezclas
  // como «agrega sliding 2 hojas white»); las débiles (`~`) solo valen en su idioma.
  for (const a of atoms) {
    if (!a.hits.length) continue
    const own = a.hits.some((h) => h.l === active)
    if (own || a.hits.some((h) => h.weak)) {
      a.hits = a.hits.filter((h) => (own ? h.l === active : !h.weak || h.l === active))
      if (!a.hits.length && a.kind === 'concept') a.kind = a.num ? 'number' : a.ents.length ? 'entity' : 'unknown'
    }
  }

  // Un número escrito en otro idioma no vale si la palabra existe en el del texto («dos» en
  // portugués es «de los», no 2).
  for (const a of atoms) {
    if (a.num?.words && a.num.locale && a.num.locale !== active && a.hits.some((h) => h.l === active)) {
      a.num = undefined
      if (a.kind === 'number') a.kind = 'concept'
    }
  }

  completePhrases(text, atoms, tokens, lex.root, active)
  if (language) flagForeignShortHits(text, atoms, tokens, active)

  // Corrección de tipeo acotada en palabras sin reconocer (≥ 4 letras).
  for (const a of atoms) {
    if (a.kind !== 'unknown' || a.e - a.s !== 1) continue
    const t = tokens[a.s]
    if (t.kind !== 'word' || t.fold.length < 4 || /\d/.test(t.fold)) continue
    const entCands = options.entities ? lookupFuzzy(t.fold, options.entities.words, options.entities.deletions, undefined, 6) : []
    if (entCands.length) {
      const best = entCands[0].distance
      a.ents = entCands.filter((c) => c.distance === best).flatMap((c) => c.item.hits.map((h) => ({ ...h, exact: false, partial: true })))
      a.kind = 'entity'
      a.fuzzy = best
      a.fix = entCands[0].item.fold
      continue
    }
    // Corrección solo hacia palabras del idioma del texto («lunes» no es «lines»).
    const cands = lookupFuzzy(t.fold, lex.words, lex.deletions, lex.long, 12).filter((c) => c.item.hits.some((h) => h.l === active))
    if (!cands.length) continue
    const best = cands[0].distance
    const hits = cands
      .filter((c) => c.distance === best)
      .flatMap((c) => c.item.hits)
      .filter((h) => h.l === active && !h.weak && !h.strict && !NO_FUZZY_CONCEPTS.test(h.c) && !h.c.startsWith('fil'))
    if (!hits.length) continue
    a.hits = hits
    a.kind = 'concept'
    a.fuzzy = best
    a.fix = cands.find((c) => c.distance === best && c.item.hits.some((h) => hits.includes(h)))?.item.fold ?? cands[0].item.fold
  }
  return { text, tokens, atoms, language, langScores: scores }
}

/** Texto original de un rango de tokens (con su espaciado real). */
export function rawSpan(analysis: Analysis, fromToken: number, toToken: number): string {
  if (toToken <= fromToken) return ''
  const start = analysis.tokens[fromToken].start
  const end = analysis.tokens[toToken - 1].end
  return analysis.text.slice(start, end)
}
