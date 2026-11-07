/**
 * Normalización y tokenizador del intérprete local.
 *
 * Tres representaciones (investigación 24 §3.1):
 * - `raw`: el texto original, intacto (nombres, títulos, correos, cifras tal como se escribieron).
 * - `fold`: clave de búsqueda sin mayúsculas ni tildes, con transliteraciones (ß→ss, œ→oe, ı/İ→i).
 *   Es la clave con la que se indexa todo el vocabulario (mismo plegado en ambos lados).
 * - `strict`: minúsculas con tildes (desempate: una coincidencia exacta con tildes vale un poco más).
 *
 * El tokenizador protege antes de interpretar palabras: comillas, correos, teléfonos (+56…), `#123`,
 * recetas de vidrio (`4/16/4`, `5+12+5`), referencias de ítem (`V2`), medidas pegadas (`1500x1200`,
 * `60cm`) y porcentajes (`10%`, `%10`). Cada token guarda su posición en el texto original.
 */

export type TokenKind = 'word' | 'num' | 'x' | 'pct' | 'hash' | 'vref' | 'quoted' | 'email' | 'phone' | 'recipe' | 'punct'

export interface Token {
  kind: TokenKind
  /** Texto original del token (sin comillas en `quoted`). */
  raw: string
  /** Posición en el texto original: [start, end). En `quoted` incluye las comillas. */
  start: number
  end: number
  /** Clave plegada (minúsculas, sin tildes). */
  fold: string
  /** Valor numérico (`num` = el entero de los dígitos sin interpretar separadores; ver `numberOf`). */
  value?: number
  /** Unido al siguiente por guion o apóstrofo («tilt-turn», «l'article»). */
  join?: '-' | "'"
  /** Hay espacio antes. */
  space: boolean
}

const FOLD_CHAR = new Map<string, string>([
  ['ß', 'ss'],
  ['ẞ', 'ss'],
  ['œ', 'oe'],
  ['Œ', 'oe'],
  ['æ', 'ae'],
  ['Æ', 'ae'],
  ['ı', 'i'],
  ['İ', 'i'],
  ['ø', 'o'],
  ['Ø', 'o'],
  ['đ', 'd'],
  ['ł', 'l'],
  ['Ł', 'l'],
  ['’', "'"],
  ['‘', "'"],
  ['´', "'"],
  ['`', "'"],
  ['×', 'x'],
  ['–', '-'],
  ['—', '-'],
  [' ', ' '],
  [' ', ' '],
  [' ', ' '],
])
const MARK = /\p{M}/u
const charCache = new Map<string, string>()

function foldChar(ch: string): string {
  const code = ch.charCodeAt(0)
  if (code < 128) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch
  const cached = charCache.get(ch)
  if (cached !== undefined) return cached
  let out = FOLD_CHAR.get(ch)
  if (out === undefined) {
    out = ''
    for (const c of ch.toLowerCase().normalize('NFD')) if (!MARK.test(c)) out += FOLD_CHAR.get(c) ?? c
  }
  if (charCache.size < 4096) charCache.set(ch, out)
  return out
}

/** Clave plegada de un texto cualquiera (mismo plegado que los tokens). */
export function foldText(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFKC')) out += foldChar(ch)
  return out
}

/** Minúsculas conservando tildes; en turco usa sus reglas (I→ı, İ→i). */
export function strictText(text: string, turkish = false): string {
  const n = text.normalize('NFKC')
  return (turkish ? n.toLocaleLowerCase('tr') : n.toLowerCase()).normalize('NFC')
}

/** Clave compacta para comparar nombres: plegada y solo letras/dígitos separados por un espacio. */
export function nameKey(text: string): string {
  return foldText(text)
    .replace(/[^\p{L}\p{N}+/]+/gu, ' ')
    .trim()
}

// ── Tokenizador ──────────────────────────────────────────────────────────────

const QUOTE_PAIRS: Record<string, string[]> = {
  '"': ['"', '”'],
  '«': ['»'],
  '“': ['”', '"'],
  '„': ['“', '"', '”'],
  "'": ["'", '’'],
  '‘': ['’', "'"],
  '‹': ['›'],
}
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/uy
const PHONE_RE = /\+\d[\d\s().-]{6,}\d/y
const RECIPE_RE = /\d{1,2}(?:[.,]\d{1,2})?(?:\s*\/\s*\d{1,2}(?:[.,]\d{1,2})?){2,4}(?![\d/])|\d{1,2}(?:[.,]\d)?(?:\s*\+\s*\d{1,2}(?:[.,]\d)?){1,4}(?![\d+])/y
const NUM_RE = /\d+(?:[.,]\d+)*/y
const WORD_RE = /[\p{L}\p{M}\p{N}_]+/uy
const SPACE_RE = /\s/u
const LETTER_RE = /\p{L}/u

export const MAX_COMMAND_LENGTH = 1200

function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && LETTER_RE.test(ch)
}

/** Divide un texto en tokens con posiciones originales. Lineal en el largo del texto. */
export function tokenize(input: string): Token[] {
  const text = input.length > MAX_COMMAND_LENGTH ? input.slice(0, MAX_COMMAND_LENGTH) : input
  const tokens: Token[] = []
  let i = 0
  let space = true
  const push = (kind: TokenKind, raw: string, start: number, end: number, extra?: Partial<Token>) => {
    tokens.push({ kind, raw, start, end, fold: foldText(raw), space, ...extra })
    space = false
  }
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (SPACE_RE.test(ch) || ch === ' ' || ch === ' ') {
      space = true
      i++
      continue
    }
    // Comillas: solo abren al inicio de una palabra (no el apóstrofo de «l'article» ni «VEKA'nın»).
    const closers = QUOTE_PAIRS[ch]
    if (closers && (ch !== "'" || !isLetter(text[i - 1]))) {
      let close = -1
      for (let j = i + 1; j < n; j++) {
        if (closers.includes(text[j]) && (text[j] !== "'" || !isLetter(text[j + 1]))) {
          close = j
          break
        }
      }
      if (close > i + 1) {
        const inner = text.slice(i + 1, close)
        if (inner.trim()) {
          push('quoted', inner.trim(), i, close + 1)
          i = close + 1
          continue
        }
      }
      if (ch !== "'") {
        push('punct', ch, i, i + 1)
        i++
        continue
      }
    }
    // Correo (puede empezar con letra o dígito).
    if (/[\p{L}\p{N}._%+-]/u.test(ch)) {
      EMAIL_RE.lastIndex = i
      const m = EMAIL_RE.exec(text)
      if (m) {
        push('email', m[0], i, i + m[0].length)
        i += m[0].length
        continue
      }
    }
    if (ch === '+' && /\d/.test(text[i + 1] ?? '')) {
      PHONE_RE.lastIndex = i
      const m = PHONE_RE.exec(text)
      if (m && m[0].replace(/\D/g, '').length >= 8) {
        push('phone', m[0].trim(), i, i + m[0].length)
        i += m[0].length
        continue
      }
    }
    if (ch === '#' && /\d/.test(text[i + 1] ?? '')) {
      NUM_RE.lastIndex = i + 1
      const m = NUM_RE.exec(text)!
      const digits = m[0].replace(/\D/g, '')
      push('hash', `#${m[0]}`, i, i + 1 + m[0].length, { value: Number(digits) })
      i += 1 + m[0].length
      continue
    }
    if (ch === '%') {
      push('pct', '%', i, i + 1)
      i++
      continue
    }
    if (ch === '×' || ch === '*') {
      push('x', 'x', i, i + 1)
      i++
      continue
    }
    if (/\d/.test(ch)) {
      RECIPE_RE.lastIndex = i
      const recipe = RECIPE_RE.exec(text)
      if (recipe && !isLetter(text[i + recipe[0].length])) {
        push('recipe', recipe[0].replace(/\s+/g, ''), i, i + recipe[0].length)
        i += recipe[0].length
        continue
      }
      NUM_RE.lastIndex = i
      const m = NUM_RE.exec(text)!
      // «1.500.» al final de una frase: el punto final no es parte del número (NUM_RE exige dígitos).
      push('num', m[0], i, i + m[0].length, { value: Number(m[0].replace(/\D/g, '')) })
      i += m[0].length
      // Sufijo pegado: «x» de medida («1500x1200», «1,5x1,2»), unidad («60cm») o «h» de hojas («2h»).
      if ((text[i] === 'x' || text[i] === 'X') && /\d/.test(text[i + 1] ?? '')) {
        push('x', 'x', i, i + 1)
        i++
        continue
      }
      if (isLetter(text[i])) {
        WORD_RE.lastIndex = i
        const word = WORD_RE.exec(text)![0]
        // «70AD», «3er»: el sufijo queda como palabra aparte.
        push(/^x$/i.test(word) ? 'x' : 'word', word, i, i + word.length)
        i += word.length
      }
      continue
    }
    WORD_RE.lastIndex = i
    const w = WORD_RE.exec(text)
    if (w) {
      const word = w[0]
      const end = i + word.length
      const vref = /^[vV](\d{1,3})$/.exec(word)
      const xq = /^[xX](\d{1,3})$/.exec(word)
      if (vref) push('vref', word, i, end, { value: Number(vref[1]) })
      else if (xq) {
        push('x', 'x', i, i + 1)
        push('num', xq[1], i + 1, end, { value: Number(xq[1]) })
      } else if (/^[xX]$/.test(word) && tokens.length && tokens[tokens.length - 1].kind === 'num' && /\s*\d/.test(text.slice(end, end + 3))) {
        push('x', 'x', i, end)
      } else push('word', word, i, end)
      i = end
      // Guion o apóstrofo entre letras: une palabras («oscilo-batiente», «l'ouvrant», «VEKA'nın»).
      const next = text[i]
      if ((next === '-' || next === "'" || next === '’') && /[\p{L}\p{N}]/u.test(text[i + 1] ?? '')) {
        tokens[tokens.length - 1].join = next === '-' ? '-' : "'"
        i++
      }
      continue
    }
    push('punct', ch, i, i + 1)
    i++
  }
  return tokens
}

// ── Números escritos con cifras ──────────────────────────────────────────────

export interface NumericReading {
  value: number
  /** «1.500» / «1,500»: puede ser 1500 (miles) o 1,5 (decimal). */
  ambiguous?: boolean
  /** Lectura alternativa cuando es ambiguo. */
  alt?: number
  decimals: number
}

/**
 * Interpreta cifras con separadores sin adivinar el idioma: grupos de miles válidos (1.234.567,
 * 1,234,567), decimal con coma o punto (1,5 · 12.25), y mixtos válidos (1.500,5 · 1,500.5). Un solo
 * separador seguido de exactamente tres dígitos es ambiguo: se lee como miles salvo que
 * `preferDecimal` (p. ej. la unidad es metros).
 */
export function readNumeric(raw: string, preferDecimal = false): NumericReading | null {
  const t = raw.trim()
  if (!t) return null
  if (/^\d+$/.test(t)) return { value: Number(t), decimals: 0 }
  const single = /^(\d{1,3})([.,])(\d{3})$/.exec(t)
  if (single) {
    const thousands = Number(single[1] + single[3])
    const decimal = Number(`${single[1]}.${single[3]}`)
    return preferDecimal
      ? { value: decimal, ambiguous: true, alt: thousands, decimals: 3 }
      : { value: thousands, ambiguous: true, alt: decimal, decimals: 0 }
  }
  if (/^\d{1,3}(\.\d{3}){2,}$/.test(t)) return { value: Number(t.replace(/\./g, '')), decimals: 0 }
  if (/^\d{1,3}(,\d{3}){2,}$/.test(t)) return { value: Number(t.replace(/,/g, '')), decimals: 0 }
  const mixedEu = /^(\d{1,3}(?:\.\d{3})+),(\d+)$/.exec(t)
  if (mixedEu) return { value: Number(`${mixedEu[1].replace(/\./g, '')}.${mixedEu[2]}`), decimals: mixedEu[2].length }
  const mixedUs = /^(\d{1,3}(?:,\d{3})+)\.(\d+)$/.exec(t)
  if (mixedUs) return { value: Number(`${mixedUs[1].replace(/,/g, '')}.${mixedUs[2]}`), decimals: mixedUs[2].length }
  const dec = /^(\d+)[.,](\d+)$/.exec(t)
  if (dec) return { value: Number(`${dec[1]}.${dec[2]}`), decimals: dec[2].length }
  return null
}
