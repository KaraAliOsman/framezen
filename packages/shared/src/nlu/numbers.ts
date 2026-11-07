/**
 * Números escritos con palabras en los 7 idiomas (investigación 24 §4.1).
 *
 * Una gramática cardinal pequeña por idioma, no un sumador genérico: el francés es vigesimal
 * (soixante-dix, quatre-vingt-dix), el alemán pone la unidad antes de la decena
 * (einundzwanzig) y escribe todo junto (eintausendfünfhundert), el italiano elide
 * (ventuno, centottanta) y el turco omite el «uno» implícito (bin beş yüz). Las palabras compuestas
 * se segmentan con un trie de morfemas del idioma (nunca se parte texto arbitrario).
 *
 * Límites: enteros de 0 a 999 999 y decimales con palabra decimal («uno coma cinco»,
 * «one point zero five» = 1,05). Nunca convierte «cero cinco» en 5.
 */
import type { Locale } from '../i18n/locales'
import type { Token } from './text'

/** z = cero · u = 1–9 · t = 10–19 o decena completa · d = decena · h = centena atómica · H = ×100 · K = ×1000 · c = conector · p = coma decimal */
type MorphKind = 'z' | 'u' | 't' | 'd' | 'h' | 'H' | 'K' | 'c' | 'p'
interface Morph {
  v: number
  k: MorphKind
}

const span = (words: string, k: MorphKind, start: number, step = 1): Record<string, Morph> => {
  const out: Record<string, Morph> = {}
  words.split(' ').forEach((w, i) => {
    for (const alt of w.split('/')) out[alt] = { v: start + i * step, k }
  })
  return out
}
const one = (words: string, v: number, k: MorphKind): Record<string, Morph> => {
  const out: Record<string, Morph> = {}
  for (const w of words.split(' ')) out[w] = { v, k }
  return out
}

/** Morfemas por idioma (claves ya plegadas: sin tildes, ß→ss). */
const MORPHS: Record<Locale, Record<string, Morph>> = {
  es: {
    ...one('cero', 0, 'z'),
    ...one('un uno una', 1, 'u'),
    ...span('dos tres cuatro cinco seis siete ocho nueve', 'u', 2),
    ...span('diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve', 't', 10),
    ...span('veintiun/veintiuno/veintiuna veintidos veintitres veinticuatro veinticinco veintiseis veintisiete veintiocho veintinueve', 't', 21),
    ...span('veinte treinta cuarenta cincuenta sesenta setenta ochenta noventa', 'd', 20, 10),
    ...one('cien ciento', 100, 'h'),
    ...span(
      'doscientos/doscientas trescientos/trescientas cuatrocientos/cuatrocientas quinientos/quinientas seiscientos/seiscientas setecientos/setecientas ochocientos/ochocientas novecientos/novecientas',
      'h',
      200,
      100,
    ),
    ...one('mil', 1000, 'K'),
    ...one('y', 0, 'c'),
    ...one('coma punto', 0, 'p'),
  },
  en: {
    ...one('zero', 0, 'z'),
    ...span('one two three four five six seven eight nine', 'u', 1),
    ...span('ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen', 't', 10),
    ...span('twenty thirty forty fifty sixty seventy eighty ninety', 'd', 20, 10),
    ...one('hundred', 100, 'H'),
    ...one('thousand', 1000, 'K'),
    ...one('and', 0, 'c'),
    ...one('point dot', 0, 'p'),
  },
  pt: {
    ...one('zero', 0, 'z'),
    ...one('um uma', 1, 'u'),
    ...one('dois duas', 2, 'u'),
    ...span('tres quatro cinco seis sete oito nove', 'u', 3),
    ...span('dez onze doze treze catorze/quatorze quinze dezesseis/dezasseis dezessete/dezassete dezoito dezenove/dezanove', 't', 10),
    ...span('vinte trinta quarenta cinquenta sessenta setenta oitenta noventa', 'd', 20, 10),
    ...one('cem cento', 100, 'h'),
    ...span(
      'duzentos/duzentas trezentos/trezentas quatrocentos/quatrocentas quinhentos/quinhentas seiscentos/seiscentas setecentos/setecentas oitocentos/oitocentas novecentos/novecentas',
      'h',
      200,
      100,
    ),
    ...one('mil', 1000, 'K'),
    ...one('e', 0, 'c'),
    ...one('virgula ponto', 0, 'p'),
  },
  fr: {
    ...one('zero', 0, 'z'),
    ...one('un une', 1, 'u'),
    ...span('deux trois quatre cinq six sept huit neuf', 'u', 2),
    ...span('dix onze douze treize quatorze quinze seize dixsept dixhuit dixneuf', 't', 10),
    ...span('vingt/vingts trente quarante cinquante soixante septante huitante/octante nonante', 'd', 20, 10),
    ...one('quatrevingt quatrevingts', 80, 'd'),
    ...one('cent cents', 100, 'H'),
    ...one('mille mil', 1000, 'K'),
    ...one('et', 0, 'c'),
    ...one('virgule', 0, 'p'),
  },
  de: {
    ...one('null', 0, 'z'),
    ...one('ein eins eine einen einem', 1, 'u'),
    ...span('zwei drei vier funf sechs sieben acht neun', 'u', 2),
    ...span('zehn elf zwolf dreizehn vierzehn funfzehn sechzehn siebzehn achtzehn neunzehn', 't', 10),
    ...span('zwanzig dreissig vierzig funfzig sechzig siebzig achtzig neunzig', 'd', 20, 10),
    ...one('hundert', 100, 'H'),
    ...one('tausend', 1000, 'K'),
    ...one('und', 0, 'c'),
    ...one('komma punkt', 0, 'p'),
  },
  it: {
    ...one('zero', 0, 'z'),
    ...one('uno un una', 1, 'u'),
    ...span('due tre quattro cinque sei sette otto nove', 'u', 2),
    ...span('dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove', 't', 10),
    ...span('venti/vent trenta/trent quaranta/quarant cinquanta/cinquant sessanta/sessant settanta/settant ottanta/ottant novanta/novant', 'd', 20, 10),
    ...one('cento cent', 100, 'H'),
    ...one('mille mila', 1000, 'K'),
    ...one('e', 0, 'c'),
    ...one('virgola', 0, 'p'),
  },
  tr: {
    ...one('sifir', 0, 'z'),
    ...span('bir iki uc dort bes alti yedi sekiz dokuz', 'u', 1),
    ...span('on yirmi otuz kirk elli altmis yetmis seksen doksan', 'd', 10, 10),
    ...one('yuz', 100, 'H'),
    ...one('bin', 1000, 'K'),
    ...one('virgul', 0, 'p'),
  },
}

/** Palabras que solas son artículos o preposiciones más que números («una ventana», «on» en inglés). */
const WEAK_ALONE: Record<Locale, readonly string[]> = {
  es: ['un', 'una', 'uno', 'y'],
  en: ['one'],
  pt: ['um', 'uma', 'e'],
  fr: ['un', 'une', 'et', 'mil'],
  de: ['ein', 'eine', 'einen', 'einem', 'eins'],
  it: ['un', 'uno', 'una', 'e'],
  tr: ['bir', 'on', 'bin', 'alti'],
}

const LOCALE_ORDER: readonly Locale[] = ['es', 'en', 'pt', 'fr', 'de', 'it', 'tr']

/** Trie de morfemas por idioma para segmentar compuestos (de, it, tr y cualquier palabra pegada). */
interface MorphTable {
  map: Map<string, Morph>
  maxLen: number
}
const TABLES = new Map<Locale, MorphTable>()
function tableOf(locale: Locale): MorphTable {
  let t = TABLES.get(locale)
  if (!t) {
    const map = new Map(Object.entries(MORPHS[locale]))
    t = { map, maxLen: Math.max(...[...map.keys()].map((k) => k.length)) }
    TABLES.set(locale, t)
  }
  return t
}

/** Segmenta una palabra plegada en morfemas del idioma (con retroceso: «centottanta» = cent+ottanta). */
function segment(word: string, table: MorphTable): Morph[] | null {
  if (word.length > 40) return null
  const memo = new Map<number, Morph[] | null>()
  const go = (pos: number): Morph[] | null => {
    if (pos === word.length) return []
    if (memo.has(pos)) return memo.get(pos)!
    let result: Morph[] | null = null
    for (let len = Math.min(table.maxLen, word.length - pos); len >= 1 && !result; len--) {
      const m = table.map.get(word.slice(pos, pos + len))
      if (!m) continue
      const rest = go(pos + len)
      if (rest) result = [m, ...rest]
    }
    memo.set(pos, result)
    return result
  }
  return go(0)
}

export interface WordNumber {
  value: number
  /** Índices de tokens [start, end). */
  start: number
  end: number
  locale: Locale
  /** Una sola palabra que suele ser artículo («una», «ein», «on»). */
  weak: boolean
  decimals: number
}

interface Evaluated {
  value: number
  /** Cantidad de morfemas consumidos (sin el conector final). */
  used: number
}

/** Evalúa una secuencia de morfemas; devuelve el prefijo válido más largo. */
function evaluate(morphs: readonly Morph[], locale: Locale): Evaluated | null {
  let total = 0
  let cur = 0
  let last: MorphKind | null = null
  let prev: MorphKind | null = null
  let best: Evaluated | null = null
  let pendingConn = false
  for (let i = 0; i < morphs.length; i++) {
    const m = morphs[i]
    if (m.k === 'p') break
    if (m.k === 'c') {
      if (last === null || pendingConn) break
      pendingConn = true
      prev = last
      last = 'c'
      continue
    }
    const group = cur % 100
    let ok = false
    switch (m.k) {
      case 'z':
        ok = last === null
        break
      case 'u':
        ok = cur % 10 === 0 && last !== 'u' && last !== 't' && last !== 'z'
        if (ok && locale === 'es' && last === 'd') ok = false // «treinta dos» no es español (sí «treinta y dos»)
        break
      case 't':
        ok = group === 0 && last !== 'u' && last !== 't'
        if (!ok && locale === 'fr' && last !== null && (prev === 'd' || last === 'd') && (group === 60 || group === 80)) ok = true
        break
      case 'd':
        ok = group === 0 && last !== 'u' && last !== 't'
        // Alemán: «ein-und-zwanzig» (unidad, «und», decena).
        if (!ok && locale === 'de' && pendingConn && prev === 'u' && group < 10) ok = true
        break
      case 'h':
        ok = cur === 0 && last !== 'h'
        break
      case 'H':
        ok = last !== 'H' && last !== 'h' && cur < 100
        break
      case 'K':
        ok = total === 0 && last !== 'K'
        break
    }
    if (pendingConn) {
      // Conectores válidos: es «treinta y dos»; pt «mil e quinhentos», «vinte e um»; en «hundred and five»;
      // fr «vingt et un»; de «ein und zwanzig»; it «mille e cinquecento».
      const allowed =
        (locale === 'es' && prev === 'd' && m.k === 'u') ||
        locale === 'pt' ||
        (locale === 'en' && (prev === 'H' || prev === 'K')) ||
        (locale === 'fr' && prev === 'd' && (m.k === 'u' || m.k === 't')) ||
        (locale === 'de' && prev === 'u' && m.k === 'd') ||
        (locale === 'it' && prev === 'K')
      if (!allowed) ok = false
    }
    if (!ok) break
    switch (m.k) {
      case 'z':
      case 'u':
      case 't':
      case 'd':
      case 'h':
        cur += m.v
        break
      case 'H':
        cur = cur === 0 ? 100 : cur * 100
        break
      case 'K':
        total = (cur === 0 ? 1 : cur) * 1000
        cur = 0
        break
    }
    pendingConn = false
    prev = last
    last = m.k
    best = { value: total + cur, used: i + 1 }
    if (m.k === 'z') break
  }
  return best
}

/** Morfemas de un token en un idioma, o null si la palabra no es un número de ese idioma. */
function morphsOf(token: Token, table: MorphTable): Morph[] | null {
  if (token.kind !== 'word') return null
  const direct = table.map.get(token.fold)
  if (direct) return [direct]
  return segment(token.fold, table)
}

/**
 * Lee un número escrito con palabras desde el token `i` en un idioma. Une los tokens con guion
 * («vingt-et-un», «quatre-vingt-dix») y respeta los conectores del idioma.
 */
function readIn(tokens: readonly Token[], i: number, locale: Locale): WordNumber | null {
  const table = tableOf(locale)
  const morphs: Morph[] = []
  const owner: number[] = []
  let j = i
  for (; j < tokens.length && j < i + 10; j++) {
    const t = tokens[j]
    // Palabras unidas por guion se leen juntas («quatre-vingt», «dix-sept»).
    let fold = t.fold
    let k = j
    while (tokens[k]?.join === '-' && k + 1 < tokens.length && k < j + 4) {
      fold += tokens[k + 1].fold
      k++
    }
    let ms: Morph[] | null = null
    if (k > j) {
      ms = segment(fold, table)
      if (!ms) k = j
    }
    if (!ms) ms = morphsOf(t, table)
    if (!ms) break
    for (const m of ms) {
      morphs.push(m)
      owner.push(k)
    }
    j = k
  }
  if (!morphs.length) return null
  const ev = evaluate(morphs, locale)
  if (!ev) return null
  let end = owner[ev.used - 1] + 1
  // Un token compuesto se usa entero o no se usa.
  if (ev.used < morphs.length && owner[ev.used] === owner[ev.used - 1]) return null
  let value = ev.value
  let decimals = 0
  // Parte decimal: «uno coma cinco», «one point zero five», «due virgola venticinque».
  const point = tokens[end]
  if (point && table.map.get(point.fold)?.k === 'p') {
    const digits: number[] = []
    let k = end + 1
    while (k < tokens.length && digits.length < 4) {
      const ms = morphsOf(tokens[k], table)
      if (!ms || ms.length !== 1 || (ms[0].k !== 'u' && ms[0].k !== 'z')) break
      digits.push(ms[0].v)
      k++
    }
    if (digits.length >= 2 || (digits.length === 1 && k < tokens.length && !morphsOf(tokens[k], table))) {
      value += Number(`0.${digits.join('')}`)
      decimals = digits.length
      end = k
    } else {
      const frac = readIn(tokens, end + 1, locale)
      if (frac && frac.decimals === 0 && frac.value > 0 && frac.value < 1000) {
        const len = String(frac.value).length
        value += frac.value / 10 ** len
        decimals = len
        end = frac.end
      } else if (digits.length === 1) {
        value += digits[0] / 10
        decimals = 1
        end = k
      }
    }
  }
  const single = end - i === 1 && morphs.length === 1
  const weak = single && WEAK_ALONE[locale].includes(tokens[i].fold)
  return { value, start: i, end, locale, weak, decimals }
}

/**
 * Número escrito con palabras que empieza en el token `i`. Prueba primero el idioma preferido y
 * devuelve la lectura más larga (a igual largo, la del idioma preferido).
 */
export function readWordNumber(tokens: readonly Token[], i: number, prefer: readonly Locale[] = LOCALE_ORDER): WordNumber | null {
  const t = tokens[i]
  if (!t || t.kind !== 'word' || t.fold.length < 2) return null
  let best: WordNumber | null = null
  const seen = new Set<Locale>()
  for (const locale of [...prefer, ...LOCALE_ORDER]) {
    if (seen.has(locale)) continue
    seen.add(locale)
    const r = readIn(tokens, i, locale)
    if (!r) continue
    if (!best || r.end > best.end || (r.end === best.end && best.weak && !r.weak)) best = r
  }
  return best
}

/** Palabras que en algún idioma son parte de un número (para el autocompletado y la cobertura). */
export function isNumberWord(fold: string): boolean {
  for (const locale of LOCALE_ORDER) if (tableOf(locale).map.has(fold)) return true
  return false
}
