/**
 * Formato compacto de los léxicos: superficies separadas por `|`; dentro de una superficie,
 * `(a|b)` alterna y `(x)?` es opcional. La primera superficie de cada concepto es la preferida
 * (la que se inserta al autocompletar y se muestra como etiqueta del idioma).
 *
 *   'correder(a|as)|corrediza(s)?'  →  corredera, correderas, corrediza, corredizas
 */

/** Concepto → superficies en formato compacto. */
export type LexiconSource = Readonly<Record<string, string>>

/** Divide en el nivel superior por `|` (respeta paréntesis). */
function splitTop(source: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === '|' && depth === 0) {
      out.push(source.slice(start, i))
      start = i + 1
    }
  }
  out.push(source.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

const MAX_VARIANTS = 64

/** Expande una superficie con grupos `(a|b)` y `(x)?` (sin anidar). */
function expandOne(surface: string): string[] {
  const open = surface.indexOf('(')
  if (open < 0) return [surface]
  const close = surface.indexOf(')', open)
  if (close < 0) return [surface]
  const optional = surface[close + 1] === '?'
  const alternatives = surface.slice(open + 1, close).split('|')
  if (optional) alternatives.push('')
  const head = surface.slice(0, open)
  const tail = surface.slice(close + (optional ? 2 : 1))
  const out: string[] = []
  for (const alt of alternatives) {
    for (const rest of expandOne(tail)) {
      out.push((head + alt + rest).replace(/\s+/g, ' ').trim())
      if (out.length >= MAX_VARIANTS) return out
    }
  }
  return out
}

/** Todas las superficies de una entrada compacta, la preferida primero y sin repetidos. */
export function expandSurfaces(source: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of splitTop(source)) {
    for (const s of expandOne(part)) {
      if (s && !seen.has(s)) {
        seen.add(s)
        out.push(s)
      }
    }
  }
  return out
}

/** Superficie preferida de un concepto (primera variante de la primera entrada). */
export function preferredSurface(source: string | undefined): string | undefined {
  if (!source) return undefined
  const first = splitTop(source)[0]
  return first ? expandOne(first)[0] : undefined
}
