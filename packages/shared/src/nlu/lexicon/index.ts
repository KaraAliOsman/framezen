/**
 * Índice del léxico multilingüe: un trie de frases por tokens plegados (la coincidencia más larga
 * gana), las superficies por concepto e idioma (etiquetas y autocompletado) y un índice de borrados
 * de un carácter para tolerar errores de tipeo (estilo SymSpell, verificado con OSA).
 *
 * Marcas en las superficies:
 * - `~palabra`: débil, solo cuenta si el idioma detectado del texto es el de ese léxico
 *   (p. ej. el turco «en» = ancho, que en español es una preposición).
 * - `=palabra`: estricta con tildes («qué» pregunta; «que» no).
 *
 * Se construye una sola vez (perezoso) y se comparte entre instancias del intérprete.
 */
import type { Locale } from '../../i18n/locales'
import { expandSurfaces, preferredSurface, type LexiconSource } from './expand'
import { foldText, strictText, tokenize, type Token } from '../text'
import de from './de'
import en from './en'
import es from './es'
import fr from './fr'
import it from './it'
import pt from './pt'
import tr from './tr'

export const LEXICONS: Readonly<Record<Locale, LexiconSource>> = { es, en, pt, fr, de, it, tr }
export const LEXICON_LOCALES: readonly Locale[] = ['es', 'en', 'pt', 'fr', 'de', 'it', 'tr']

export interface LexHit {
  /** Concepto («act.add», «col.walnut»…). */
  c: string
  /** Idioma del léxico. */
  l: Locale
  /** Solo vale si el idioma detectado es `l`. */
  weak?: boolean
  /** Clave estricta (con tildes) que debe calzar. */
  strict?: string
}

export interface TrieNode {
  next?: Map<string, TrieNode>
  hits?: LexHit[]
}

export interface LexWord {
  fold: string
  hits: LexHit[]
}

export interface LexiconIndex {
  root: TrieNode
  /** Concepto → idioma → superficies expandidas (preferida primero). */
  surfaces: Map<string, Partial<Record<Locale, string[]>>>
  /** Palabras de una sola pieza (plegadas) → aciertos, para el autocompletado por prefijo. */
  words: LexWord[]
  /** Borrado de un carácter → índices en `words` (tolerancia a errores de tipeo). */
  deletions: Map<string, number[]>
  /** Palabras largas (≥ 9) para distancia 2. */
  long: number[]
}

/** Conceptos que no participan en la corrección de errores (relleno, cortesía, saludos). */
const NO_FUZZY = /^(fil|pol|grt|thx|trg\.|q\.|neg\.|sep\.|unit\.|qty\.|roomq)/

function surfaceTokens(surface: string): Token[] {
  return tokenize(surface).filter((t) => t.kind !== 'punct' || t.raw === '+' || t.raw === '°')
}

/** Variantes alemanas sin diéresis (Tür → Tuer) para teclados sin ä/ö/ü. */
function germanVariants(surface: string): string[] {
  if (!/[äöüÄÖÜ]/.test(surface)) return [surface]
  return [surface, surface.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')]
}

let cached: LexiconIndex | null = null

function insert(root: TrieNode, keys: readonly string[], hit: LexHit): void {
  let node = root
  for (const key of keys) {
    if (!node.next) node.next = new Map()
    let child = node.next.get(key)
    if (!child) {
      child = {}
      node.next.set(key, child)
    }
    node = child
  }
  const hits = (node.hits ??= [])
  if (!hits.some((h) => h.c === hit.c && h.l === hit.l && h.weak === hit.weak && h.strict === hit.strict)) hits.push(hit)
}

/** Índice del léxico (se construye una vez). */
export function lexiconIndex(): LexiconIndex {
  if (cached) return cached
  const root: TrieNode = {}
  const surfaces = new Map<string, Partial<Record<Locale, string[]>>>()
  const wordMap = new Map<string, LexHit[]>()
  for (const locale of LEXICON_LOCALES) {
    const lex = LEXICONS[locale]
    for (const concept of Object.keys(lex)) {
      const list: string[] = []
      for (const raw of expandSurfaces(lex[concept])) {
        const weak = raw.startsWith('~')
        const strict = raw.startsWith('=')
        const surface = weak || strict ? raw.slice(1) : raw
        list.push(surface)
        for (const variant of locale === 'de' ? germanVariants(surface) : [surface]) {
          const toks = surfaceTokens(variant)
          if (!toks.length) continue
          const keys = toks.map((t) => t.fold)
          const hit: LexHit = { c: concept, l: locale }
          if (weak) hit.weak = true
          if (strict) hit.strict = strictText(variant, locale === 'tr').replace(/\s+/g, ' ')
          insert(root, keys, hit)
          // Una palabra con guiones también se indexa unida («oscilo-batiente» = «oscilobatiente»).
          if (keys.length > 1 && /-/.test(variant)) insert(root, [keys.join('')], hit)
          if (keys.length === 1 && toks[0].kind === 'word') {
            const arr = wordMap.get(keys[0]) ?? []
            if (!arr.some((h) => h.c === concept && h.l === locale)) arr.push(hit)
            wordMap.set(keys[0], arr)
          }
        }
      }
      const entry = surfaces.get(concept) ?? {}
      entry[locale] = list
      surfaces.set(concept, entry)
    }
  }
  const words: LexWord[] = [...wordMap].map(([fold, hits]) => ({ fold, hits })).sort((a, b) => (a.fold < b.fold ? -1 : a.fold > b.fold ? 1 : 0))
  const deletions = new Map<string, number[]>()
  const long: number[] = []
  words.forEach((w, i) => {
    if (w.fold.length < 4 || w.hits.every((h) => NO_FUZZY.test(h.c))) return
    for (const key of deletionKeys(w.fold)) {
      const arr = deletions.get(key)
      if (arr) arr.push(i)
      else deletions.set(key, [i])
    }
    if (w.fold.length >= 9) long.push(i)
  })
  cached = { root, surfaces, words, deletions, long }
  return cached
}

/** La palabra y sus borrados de un carácter. */
export function deletionKeys(word: string): string[] {
  const out = [word]
  for (let i = 0; i < word.length; i++) {
    const del = word.slice(0, i) + word.slice(i + 1)
    if (!out.includes(del)) out.push(del)
  }
  return out
}

/** Superficie preferida de un concepto en un idioma (o en español si ese idioma no la tiene). */
export function conceptSurface(concept: string, locale: Locale): string | undefined {
  return preferredSurface(LEXICONS[locale][concept])?.replace(/^[~=]/, '') ?? preferredSurface(LEXICONS.es[concept])?.replace(/^[~=]/, '')
}

/** Todas las superficies de un concepto en un idioma (expandidas, sin marcas). */
export function conceptSurfaces(concept: string, locale: Locale): string[] {
  return lexiconIndex().surfaces.get(concept)?.[locale] ?? []
}

/** Busca la clave plegada `fold` entre las palabras del léxico (búsqueda binaria). */
export function lowerBound(words: readonly { fold: string }[], fold: string): number {
  let lo = 0
  let hi = words.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (words[mid].fold < fold) lo = mid + 1
    else hi = mid
  }
  return lo
}

export { foldText }
