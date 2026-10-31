/**
 * Medidas escritas a mano en el lienzo: «1200», «1.200», «1200,5», «120 cm», «1,2 m» y
 * expresiones simples como «2400/2», «1200 + 50», «(2400 − 80) / 3» o «=2400/2».
 * Resolución 0,1 mm. Nunca lanza: devuelve null si no se entiende.
 */
import { parseMeasure } from '../../../ui/NumberField'

type Token = { t: 'num'; v: number } | { t: 'op'; v: '+' | '-' | '*' | '/' } | { t: 'lp' } | { t: 'rp' }

const round1 = (n: number): number => Math.round(n * 10) / 10

/** Divide el texto en números (con su unidad pegada) y operadores. */
function tokenize(input: string): Token[] | null {
  const text = input
    .replace(/[−–—]/g, '-') // signos menos tipográficos
    .replace(/[÷:]/g, '/')
    .replace(/[·]/g, '*')
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
    const match = /^(\d[\d.,]*(?:\s\d{3}(?![\d]))*)\s*(mm|cm|m)?/i.exec(text.slice(i))
    if (!match) return null
    const value = parseMeasure(`${match[1].replace(/\s/g, '')}${match[2] ?? ''}`)
    if (value === null) return null
    tokens.push({ t: 'num', v: value })
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
  // Caso común sin operadores: lo resuelve el parser de medidas del kit (miles, coma decimal, unidades).
  const direct = parseMeasure(text)
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
  const unit = parts[1].trim().match(/(mm|cm|m)$/i)?.[1] ?? ''
  const first = /(mm|cm|m)$/i.test(parts[0].trim()) || !unit ? parts[0] : `(${parts[0]})${unit === 'mm' ? '' : unit === 'cm' ? '*10' : '*1000'}`
  const width = parseMeasureExpression(first)
  const height = parseMeasureExpression(parts[1])
  if (width === null || height === null) return null
  return { width, height }
}

/** Texto inicial del editor de cotas: «1200» o «1200,5» (sin puntos de miles, para reescribir rápido). */
export function measureDraft(mm: number): string {
  const v = round1(mm)
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',')
}
