/**
 * Medidas escritas a mano en el lienzo: «1200», «1.200», «1,200», «1200,5», «1200.5», «120 cm»,
 * «1,2 m» y expresiones simples como «2400/2», «1200 + 50», «(2400 − 80) / 3» o «=2400/2».
 * Resolución 0,1 mm. Nunca lanza: devuelve null si no se entiende.
 *
 * Sirve en cualquier idioma sin adivinar por el idioma: con punto y coma juntos, el último es el
 * decimal («1.249,5» = «1,249.5»); un separador solo seguido de exactamente tres cifras en una
 * medida en mm es de miles («1.200» = «1,200» = 1200 mm, nadie mide en milésimas de milímetro); en
 * cualquier otro caso es decimal («1200,5», «1,2 m», «12.5 cm»).
 */
import { getLocale } from '../../../lib/i18n'
import type { Locale } from '@dekopen/shared'

type Unit = '' | 'mm' | 'cm' | 'm'
type Token = { t: 'num'; v: number } | { t: 'op'; v: '+' | '-' | '*' | '/' } | { t: 'lp' } | { t: 'rp' }

const round1 = (n: number): number => Math.round(n * 10) / 10
const FACTOR: Record<Unit, number> = { '': 1, mm: 1, cm: 10, m: 1000 }
const count = (s: string, ch: string) => s.split(ch).length - 1

/** Lee un número con separadores de miles o decimales («1.249,5», «1,249.5», «1 200»). */
export function readNumber(raw: string, unit: Unit = ''): number | null {
  const t = raw.replace(/[\s  ']/g, '')
  if (!/^\d[\d.,]*$/.test(t) || /[.,]{2,}/.test(t) || /[.,]$/.test(t)) return null
  const dots = count(t, '.')
  const commas = count(t, ',')
  let normalized: string
  if (dots && commas) {
    const decimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ','
    const group = decimal === '.' ? ',' : '.'
    if (count(t, decimal) !== 1) return null
    const [intPart, frac] = t.split(decimal)
    if (!/^\d{1,3}([.,]\d{3})*$/.test(intPart) || intPart.includes(decimal)) return null
    normalized = `${intPart.split(group).join('')}.${frac}`
  } else if (dots || commas) {
    const sep = dots ? '.' : ','
    const parts = t.split(sep)
    if (parts.length > 2) {
      // Varios separadores iguales: son de miles («1.200.000»).
      if (!/^\d{1,3}$/.test(parts[0]) || parts.slice(1).some((p) => !/^\d{3}$/.test(p))) return null
      normalized = parts.join('')
    } else if (parts[1].length === 3 && /^\d{1,3}$/.test(parts[0]) && (unit === '' || unit === 'mm')) {
      normalized = parts.join('')
    } else {
      normalized = `${parts[0]}.${parts[1]}`
    }
  } else {
    normalized = t
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Una medida suelta con unidad opcional («1200», «120 cm», «1,2 m») → mm, o null. */
export function parseMeasureText(text: string): number | null {
  const m = /^\s*(\d[\d.,\s  ']*?)\s*(mm|cm|m)?\s*$/i.exec(text)
  if (!m) return null
  const unit = (m[2]?.toLowerCase() ?? '') as Unit
  const n = readNumber(m[1], unit)
  return n === null ? null : round1(n * FACTOR[unit])
}

/** Divide el texto en números (con su unidad pegada) y operadores. */
function tokenize(input: string): Token[] | null {
  const text = input
    .replace(/[−–—]/g, '-') // signos menos tipográficos
    .replace(/[÷:]/g, '/')
    .replace(/[·×]/g, '*')
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ t: 'lp' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ t: 'rp' })
      i++
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ t: 'op', v: ch })
      i++
      continue
    }
    // Número: dígitos con puntos/comas, espacios de miles («1 200») y unidad opcional.
    const match = /^(\d[\d.,]*(?:[\s  ]\d{3}(?!\d))*)\s*(mm|cm|m)?(?![a-z])/i.exec(text.slice(i))
    if (!match) return null
    const unit = (match[2]?.toLowerCase() ?? '') as Unit
    const value = readNumber(match[1], unit)
    if (value === null) return null
    tokens.push({ t: 'num', v: value * FACTOR[unit] })
    i += match[0].length
  }
  return tokens
}

/** Descenso recursivo: expr = term (± term)* ; term = factor (×÷ factor)* ; factor = ±factor | num | (expr). */
function evaluate(tokens: Token[]): number | null {
  let pos = 0
  const peek = () => tokens[pos]

  function factor(): number | null {
    const tok = peek()
    if (!tok) return null
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      pos++
      const inner = factor()
      return inner === null ? null : tok.v === '-' ? -inner : inner
    }
    if (tok.t === 'num') {
      pos++
      return tok.v
    }
    if (tok.t === 'lp') {
      pos++
      const inner = expr()
      if (inner === null || peek()?.t !== 'rp') return null
      pos++
      return inner
    }
    return null
  }

  function term(): number | null {
    let left = factor()
    while (left !== null) {
      const tok = peek()
      if (!tok || tok.t !== 'op' || (tok.v !== '*' && tok.v !== '/')) break
      pos++
      const right = factor()
      if (right === null) return null
      if (tok.v === '/') {
        if (right === 0) return null
        left = left / right
      } else left = left * right
    }
    return left
  }

  function expr(): number | null {
    let left = term()
    while (left !== null) {
      const tok = peek()
      if (!tok || tok.t !== 'op' || (tok.v !== '+' && tok.v !== '-')) break
      pos++
      const right = term()
      if (right === null) return null
      left = tok.v === '+' ? left + right : left - right
    }
    return left
  }

  const value = expr()
  if (value === null || pos !== tokens.length || !Number.isFinite(value)) return null
  return value
}

/**
 * Interpreta una medida o una expresión simple. Devuelve milímetros (0,1 mm) o null.
 *   "1200" → 1200 · "1.200" → 1200 · "2400/2" → 1200 · "1200+50" → 1250 · "1,2 m" → 1200
 */
export function parseMeasureExpression(input: string): number | null {
  const text = input.trim().replace(/^=/, '').trim()
  if (!text) return null
  const direct = parseMeasureText(text)
  if (direct !== null) return direct
  const tokens = tokenize(text)
  if (!tokens || tokens.length === 0) return null
  const value = evaluate(tokens)
  return value === null ? null : round1(value)
}

/**
 * «1500x1200», «1500 × 1200», «2400/2 x 1200», «150 x 120 cm» → { width, height }.
 * La unidad escrita solo al final vale para ambas medidas.
 */
export function parseSizeExpression(input: string): { width: number; height: number } | null {
  const parts = input.split(/\s*[x×]\s*/i)
  if (parts.length !== 2) return null
  const unit = parts[1].trim().match(/(mm|cm|m)$/i)?.[1]?.toLowerCase() ?? ''
  const first = /(mm|cm|m)$/i.test(parts[0].trim()) || !unit ? parts[0] : `(${parts[0]})${unit === 'mm' ? '' : unit === 'cm' ? '*10' : '*1000'}`
  const width = parseMeasureExpression(first)
  const height = parseMeasureExpression(parts[1])
  if (width === null || height === null) return null
  return { width, height }
}

export interface SizeLine {
  width: number
  height: number
  qty: number
}

const MIN_SIDE = 100
const MAX_SIDE = 20000
/** Cantidad al final: «x2», «× 2», «*2», « 2», «(2)», «2 un», «2 unidades». */
const QTY_END = /(?:\s*[x×*]\s*|\s+|\s*\()(\d{1,3})\)?\s*(?:u|un|uds?|unid(?:ades)?|pzs?|piezas?)?\.?\s*$/i
/** Cantidad al inicio: «2 x 1500 x 1200». */
const QTY_START = /^(\d{1,3})\s*[x×*]\s*(.+)$/i

/** Medida razonable de una ventana; lo escrito en metros («1,50 x 1,20») se pasa a milímetros. */
function usableSize(size: { width: number; height: number } | null): { width: number; height: number } | null {
  if (!size) return null
  const inMeters = size.width <= 20 && size.height <= 20
  const width = inMeters ? round1(size.width * 1000) : size.width
  const height = inMeters ? round1(size.height * 1000) : size.height
  return width >= MIN_SIDE && width <= MAX_SIDE && height >= MIN_SIDE && height <= MAX_SIDE ? { width, height } : null
}

/**
 * Una línea de una lista de medidas: «1500x1200», «1500x1200 x2», «1500 × 1200 (3)», «2 x 1500 x 1200»,
 * «1,50 x 1,20», «150 x 120 cm x 2» o columnas de una planilla («1500⇥1200⇥2»). Null si no se entiende.
 */
export function parseSizeLine(input: string): SizeLine | null {
  const line = input.trim().replace(/\s*\t\s*/g, ' x ')
  if (!line) return null
  const end = QTY_END.exec(line)
  if (end) {
    const size = usableSize(parseSizeExpression(line.slice(0, end.index)))
    const qty = Number(end[1])
    if (size && qty > 0) return { ...size, qty }
  }
  const plain = usableSize(parseSizeExpression(line))
  if (plain) return { ...plain, qty: 1 }
  const start = QTY_START.exec(line)
  if (start) {
    const size = usableSize(parseSizeExpression(start[2]))
    const qty = Number(start[1])
    if (size && qty > 0) return { ...size, qty }
  }
  return null
}

/** Lista pegada, una medida por línea (o separadas por «;»): cada línea con lo que se entendió. */
export function parseSizeList(text: string): { text: string; size: SizeLine | null }[] {
  return text
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line, size: parseSizeLine(line) }))
}

/** Texto inicial del editor de cotas: «1200» o «1200,5» / «1200.5» (sin miles, para reescribir rápido). */
export function measureDraft(mm: number, locale: Locale = getLocale()): string {
  const v = round1(mm)
  if (Number.isInteger(v)) return String(v)
  return locale === 'en' ? String(v) : String(v).replace('.', ',')
}
