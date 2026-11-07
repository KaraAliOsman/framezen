/**
 * Mensajes «ICU-lite»: interpolación `{nombre}`, plural `{n, plural, =0 {…} one {# ítem} other {# ítems}}`,
 * ordinal `{n, selectordinal, one {#st} other {#th}}` y selección `{tipo, select, puerta {…} other {…}}`.
 * Sin dependencias ni `Intl.MessageFormat`; las reglas de plural salen de `Intl.PluralRules`.
 *
 * Diferencias deliberadas con ICU, para que el francés y el italiano no sufran:
 * - el apóstrofo es siempre literal (en ICU `'` escapa llaves); `l'ouvrant` se escribe tal cual;
 * - no hay llaves literales: si un texto necesita `{` o `}`, pásalas como parámetro.
 *
 * `{nombre}` con un número imprime `String(n)` (sin formato: el llamador formatea con `useFormat`);
 * `#` dentro de un plural imprime el número con el formato del idioma (1.500 / 1,500 / 1 500).
 */
import { intlTag, type Locale } from './locales'

export type MessageParamValue = string | number | boolean | null | undefined
export type MessageParams = Readonly<Record<string, MessageParamValue>>

export type MessageNode =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'arg'; readonly name: string }
  | { readonly t: 'pound' }
  | {
      readonly t: 'plural'
      readonly name: string
      readonly ordinal: boolean
      readonly offset: number
      readonly cases: Readonly<Record<string, readonly MessageNode[]>>
    }
  | { readonly t: 'select'; readonly name: string; readonly cases: Readonly<Record<string, readonly MessageNode[]>> }

export class MessageSyntaxError extends Error {
  constructor(
    readonly source: string,
    readonly position: number,
    detail: string,
  ) {
    super(`Mensaje mal formado en la posición ${position}: ${detail} — «${source}»`)
    this.name = 'MessageSyntaxError'
  }
}

const IDENT = /^[\p{L}\p{N}_$.-]+$/u

class Parser {
  private pos = 0
  constructor(private readonly src: string) {}

  parse(): MessageNode[] {
    const nodes = this.nodes(false)
    if (this.pos < this.src.length) this.fail('llave de cierre sin abrir')
    return nodes
  }

  private fail(detail: string): never {
    throw new MessageSyntaxError(this.src, this.pos, detail)
  }

  /** Secuencia de texto y argumentos hasta el fin o hasta la `}` que cierra un caso. */
  private nodes(inPlural: boolean): MessageNode[] {
    const out: MessageNode[] = []
    let text = ''
    const flush = () => {
      if (text) out.push({ t: 'text', v: text })
      text = ''
    }
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]
      if (ch === '{') {
        flush()
        out.push(this.argument(inPlural))
      } else if (ch === '}') {
        break
      } else if (ch === '#' && inPlural) {
        flush()
        out.push({ t: 'pound' })
        this.pos++
      } else {
        text += ch
        this.pos++
      }
    }
    flush()
    return out
  }

  private skipSpace(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++
  }

  private word(): string {
    this.skipSpace()
    const start = this.pos
    while (this.pos < this.src.length && !/[\s,{}]/.test(this.src[this.pos])) this.pos++
    return this.src.slice(start, this.pos)
  }

  private argument(inPlural: boolean): MessageNode {
    this.pos++ // {
    const name = this.word()
    if (!name || !IDENT.test(name)) this.fail('nombre de parámetro vacío o inválido')
    this.skipSpace()
    const ch = this.src[this.pos]
    if (ch === '}') {
      this.pos++
      return { t: 'arg', name }
    }
    if (ch !== ',') this.fail('se esperaba «,» o «}»')
    this.pos++
    const type = this.word()
    this.skipSpace()
    if (this.src[this.pos] !== ',') this.fail(`se esperaba «,» después de «${type}»`)
    this.pos++
    if (type === 'plural' || type === 'selectordinal') {
      this.skipSpace()
      let offset = 0
      if (this.src.startsWith('offset:', this.pos)) {
        this.pos += 'offset:'.length
        const raw = this.word()
        offset = Number(raw)
        if (!Number.isFinite(offset)) this.fail('offset inválido')
      }
      const cases = this.cases(true)
      return { t: 'plural', name, ordinal: type === 'selectordinal', offset, cases }
    }
    if (type === 'select') return { t: 'select', name, cases: this.cases(inPlural) }
    return this.fail(`tipo «${type}» no soportado (usa plural, selectordinal o select)`)
  }

  private cases(inPlural: boolean): Record<string, MessageNode[]> {
    const cases: Record<string, MessageNode[]> = {}
    for (;;) {
      this.skipSpace()
      if (this.pos >= this.src.length) this.fail('falta «}» al final del argumento')
      if (this.src[this.pos] === '}') {
        this.pos++
        break
      }
      const selector = this.word()
      if (!selector) this.fail('selector vacío')
      this.skipSpace()
      if (this.src[this.pos] !== '{') this.fail(`se esperaba «{» después de «${selector}»`)
      this.pos++
      const body = this.nodes(inPlural)
      if (this.src[this.pos] !== '}') this.fail(`falta «}» en el caso «${selector}»`)
      this.pos++
      cases[selector] = body
    }
    if (!cases.other) this.fail('todo plural/select necesita el caso «other»')
    return cases
  }
}

const compiled = new Map<string, readonly MessageNode[]>()
const COMPILE_CACHE_LIMIT = 5000

/** Analiza un mensaje (con caché). Lanza `MessageSyntaxError` si está mal formado. */
export function compileMessage(message: string): readonly MessageNode[] {
  const hit = compiled.get(message)
  if (hit) return hit
  const nodes: readonly MessageNode[] = message.includes('{') ? new Parser(message).parse() : [{ t: 'text', v: message }]
  if (compiled.size >= COMPILE_CACHE_LIMIT) compiled.clear()
  compiled.set(message, nodes)
  return nodes
}

const pluralRules = new Map<string, Intl.PluralRules>()

/** `Intl.PluralRules` del idioma (cardinal u ordinal), con caché. */
export function pluralRulesFor(locale: Locale, ordinal = false): Intl.PluralRules {
  const key = `${locale}|${ordinal ? 'o' : 'c'}`
  let rules = pluralRules.get(key)
  if (!rules) {
    rules = new Intl.PluralRules(intlTag(locale), { type: ordinal ? 'ordinal' : 'cardinal' })
    pluralRules.set(key, rules)
  }
  return rules
}

/** Categoría de plural para `value` (`one`, `few`, `many`, `other`…). */
export function pluralCategory(value: number, locale: Locale, ordinal = false): string {
  return pluralRulesFor(locale, ordinal).select(value)
}

export interface RenderContext {
  locale: Locale
  /** Texto de un argumento `{nombre}`. */
  arg(name: string): string
  /** Valor numérico de un argumento de plural (NaN si no es número). */
  num(name: string): number
  /** Cadena de `#` (número del plural ya formateado). */
  pound(value: number): string
  /** Valor crudo para `select`. */
  raw(name: string): string
}

function pickCase(cases: Readonly<Record<string, readonly MessageNode[]>>, keys: string[]): readonly MessageNode[] {
  for (const key of keys) if (cases[key]) return cases[key]
  return cases.other
}

/** Evalúa el árbol de un mensaje con un contexto (lo usan `formatMessage` y el texto enriquecido de la web). */
export function renderNodes(nodes: readonly MessageNode[], ctx: RenderContext, poundValue?: number): string {
  let out = ''
  for (const node of nodes) {
    switch (node.t) {
      case 'text':
        out += node.v
        break
      case 'arg':
        out += ctx.arg(node.name)
        break
      case 'pound':
        out += poundValue === undefined ? '#' : ctx.pound(poundValue)
        break
      case 'plural': {
        const value = ctx.num(node.name)
        const keys: string[] = []
        if (Number.isFinite(value)) {
          keys.push(`=${value}`)
          keys.push(pluralCategory(value - node.offset, ctx.locale, node.ordinal))
        }
        const branch = pickCase(node.cases, keys)
        out += renderNodes(branch, ctx, Number.isFinite(value) ? value - node.offset : undefined)
        break
      }
      case 'select': {
        const branch = pickCase(node.cases, [ctx.raw(node.name)])
        out += renderNodes(branch, ctx, poundValue)
        break
      }
    }
  }
  return out
}

/** Nombres de los parámetros que usa un mensaje (para validar traducciones en pruebas). */
export function messageParams(message: string): string[] {
  const names = new Set<string>()
  const visit = (nodes: readonly MessageNode[]) => {
    for (const node of nodes) {
      if (node.t === 'arg') names.add(node.name)
      else if (node.t === 'plural' || node.t === 'select') {
        names.add(node.name)
        for (const branch of Object.values(node.cases)) visit(branch)
      }
    }
  }
  visit(compileMessage(message))
  return [...names]
}
