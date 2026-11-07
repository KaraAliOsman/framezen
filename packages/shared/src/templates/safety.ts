/**
 * Seguridad de contenido de plantillas: ningún string puede llevar HTML, CSS, JavaScript, URLs ni
 * sintaxis de plantillas ejecutables. El renderizador pinta todo como nodos de texto de React (ya es
 * seguro por construcción); estas reglas además impiden que esos contenidos se guarden, se muestren
 * como texto engañoso o lleguen a un contexto peligroso (atributo, CSS, URL) en el futuro.
 */

export type UnsafeTextReason =
  | 'control_chars'
  | 'invisible_chars'
  | 'html'
  | 'html_entity'
  | 'script'
  | 'url'
  | 'css'
  | 'template_syntax'

// Caracteres de control C0/C1 salvo tabulación y salto de línea.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/
// Controles bidireccionales (Trojan Source) y caracteres invisibles (ofuscación de palabras clave).
// Más rellenos invisibles (Hangul, mongol, CGJ) y etiquetas Unicode U+E0000–E007F ("ASCII smuggling":
// texto oculto que una persona no ve pero la IA sí lee).
const BIDI_OR_INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u034F\u115F\u1160\u17B4\u17B5\u180E\u3164\uFFA0\u{E0000}-\u{E007F}]/u
const BIDI_OR_INVISIBLE_G = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u034F\u115F\u1160\u17B4\u17B5\u180E\u3164\uFFA0\u{E0000}-\u{E007F}]/gu
const CONTROL_G = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g

// `<b`, `</p`, `<!--`, `<?xml`: cualquier apertura de etiqueta o comentario ("a < b" con espacio es texto).
const HTML_TAG = /<\/?[a-z!?]/i
const HTML_ENTITY = /&#x?[0-9a-f]+;?|&[a-z][a-z0-9]{1,31};/i

// Manejadores de eventos tipo atributo (`onerror=`, `onload =`).
const EVENT_HANDLER = /\bon[a-z]{3,}\s*=/i
const SCRIPT_WORDS = ['javascript:', 'vbscript:', 'livescript:', 'mocha:']

const URL_PATTERNS: RegExp[] = [
  /\b[a-z][a-z0-9+.-]{1,20}:\/\//i, // cualquier esquema con // (http://, ftp://, file://, chrome://…)
  /(^|[\s(["'])\/\/[a-z0-9-]+\.[a-z]/i, // relativa al protocolo: //example.com
  /\bwww\.[a-z0-9-]+\.[a-z]/i,
  /\bdata:\s*[a-z-]+\/[a-z0-9.+-]+/i, // data:text/html, data:image/svg+xml
  /\bdata:\s*,/i,
  /;\s*base64\s*,/i,
  /\bblob:\s*https?/i,
  /\bmailto:\s*\S/i,
  /\babout:\s*(blank|srcdoc)/i,
]

const CSS_PATTERNS: RegExp[] = [
  /\burl\s*\(/i,
  /\bexpression\s*\(/i,
  /@import\b/i,
  /@font-face\b/i,
  /@media\b/i,
  /\bbehaviou?r\s*:/i,
  /-moz-binding/i,
  /\bstyle\s*=/i,
]

const TEMPLATE_SYNTAX = /\{\{|\}\}|\$\{|<%|%>|#\{|\{%|%\}/

/**
 * Motivo por el que un texto no es aceptable, o `null` si es seguro. Las llaves de marcadores se
 * validan aparte (`invalidBraces`), salvo `{…:…}`/`{…;…}`, que se tratan como CSS.
 */
export function unsafeTextReason(text: string): UnsafeTextReason | null {
  if (CONTROL.test(text)) return 'control_chars'
  if (BIDI_OR_INVISIBLE.test(text)) return 'invisible_chars'
  if (HTML_TAG.test(text)) return 'html'
  if (HTML_ENTITY.test(text)) return 'html_entity'
  const squashed = text.toLowerCase().replace(/[\s\u0000-\u001F]+/g, '')
  if (SCRIPT_WORDS.some((w) => squashed.includes(w)) || EVENT_HANDLER.test(text)) return 'script'
  if (URL_PATTERNS.some((re) => re.test(text))) return 'url'
  if (CSS_PATTERNS.some((re) => re.test(text)) || /\{[^{}]*[:;][^{}]*\}/.test(text)) return 'css'
  if (TEMPLATE_SYNTAX.test(text)) return 'template_syntax'
  return null
}

export function isSafeDocText(text: string): boolean {
  return unsafeTextReason(text) === null
}

export interface SanitizeTextOptions {
  /** Permite saltos de línea (párrafos). Si no, se convierten en espacios. */
  multiline?: boolean
  /** Largo máximo (unidades UTF-16); corta sin partir pares sustitutos. */
  max?: number
}

/**
 * Limpieza no destructiva de lo que escribe una persona (o pega desde Word): normaliza a NFC, quita
 * controles e invisibles, unifica saltos de línea y recorta espacios. No "arregla" contenido
 * inseguro (HTML, URLs…): eso se rechaza con `unsafeTextReason` para que nadie lo pase por alto.
 */
export function sanitizeDocText(input: string, options: SanitizeTextOptions = {}): string {
  let text = String(input).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
  text = text.replace(CONTROL_G, '').replace(BIDI_OR_INVISIBLE_G, '')
  if (options.multiline) {
    text = text
      .split('\n')
      .map((line) => line.replace(/[  ]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
  } else {
    text = text.replace(/\n+/g, ' ')
  }
  text = text.replace(/ {2,}/g, (m) => (options.multiline ? m : ' ')).trim()
  if (options.max !== undefined) text = truncateText(text, options.max)
  return text
}

/** Corta a `max` unidades UTF-16 sin dejar medio par sustituto ni espacios colgando. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, Math.max(0, max))
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut.trimEnd()
}

/** Llaves que nunca se aceptan en objetos de entrada (contaminación de prototipos). */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'prototype', 'constructor'])

/**
 * Identificadores que chocan con propiedades de `Object.prototype` y que por eso no se aceptan como
 * ids de sección/ítem usados como llaves de diccionario.
 */
export const RESERVED_IDS: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'hasownproperty',
  'isprototypeof',
  'propertyisenumerable',
  'tolocalestring',
  'tostring',
  'valueof',
  '__definegetter__',
  '__definesetter__',
  '__lookupgetter__',
  '__lookupsetter__',
])

export function isReservedId(id: string): boolean {
  return RESERVED_IDS.has(id.toLowerCase())
}

export interface JsonShape {
  depth: number
  nodes: number
  chars: number
  /** Se cortó el recorrido porque superó algún tope. */
  exceeded: boolean
  forbiddenKey?: string
  /** Hay valores que no son JSON (funciones, símbolos, bigint, ciclos). */
  nonJson?: boolean
}

/** Mide un valor tipo JSON con cortes tempranos (no recorre estructuras gigantes completas). */
export function measureJson(value: unknown, limits: { maxDepth: number; maxNodes: number; maxChars: number }): JsonShape {
  const shape: JsonShape = { depth: 0, nodes: 0, chars: 0, exceeded: false }
  const seen = new Set<object>()
  const walk = (v: unknown, depth: number): void => {
    if (shape.exceeded) return
    shape.nodes++
    if (depth > shape.depth) shape.depth = depth
    if (shape.nodes > limits.maxNodes || depth > limits.maxDepth) {
      shape.exceeded = true
      return
    }
    if (typeof v === 'string') {
      shape.chars += v.length
      if (shape.chars > limits.maxChars) shape.exceeded = true
      return
    }
    if (v === null || typeof v === 'number' || typeof v === 'boolean' || v === undefined) return
    if (typeof v !== 'object') {
      shape.nonJson = true
      return
    }
    if (seen.has(v)) {
      shape.nonJson = true
      shape.exceeded = true
      return
    }
    seen.add(v)
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1)
    } else {
      for (const key of Object.keys(v)) {
        if (FORBIDDEN_KEYS.has(key)) shape.forbiddenKey = key
        shape.chars += key.length
        walk((v as Record<string, unknown>)[key], depth + 1)
      }
    }
    seen.delete(v)
  }
  walk(value, 0)
  return shape
}

export interface UnsafeString {
  path: (string | number)[]
  reason: UnsafeTextReason
}

/** Recorre todos los strings (valores y llaves) y devuelve los inseguros. */
export function findUnsafeStrings(value: unknown, max = 50): UnsafeString[] {
  const out: UnsafeString[] = []
  const walk = (v: unknown, path: (string | number)[]): void => {
    if (out.length >= max) return
    if (typeof v === 'string') {
      const reason = unsafeTextReason(v)
      if (reason) out.push({ path, reason })
      return
    }
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, [...path, i]))
      return
    }
    for (const key of Object.keys(v)) {
      const reason = unsafeTextReason(key)
      if (reason) out.push({ path: [...path, key], reason })
      walk((v as Record<string, unknown>)[key], [...path, key])
    }
  }
  walk(value, [])
  return out
}

/** Copia profunda de datos JSON (sin prototipos raros ni llaves prohibidas). */
export function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => cloneJson(v)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    const v = (value as Record<string, unknown>)[key]
    if (v !== undefined) out[key] = cloneJson(v)
  }
  return out as T
}

/** Igualdad estructural de datos JSON (orden de llaves irrelevante). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((v, i) => jsonEqual(v, bb[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined)
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined)
  return ak.length === bk.length && ak.every((k) => Object.hasOwn(bo, k) && jsonEqual(ao[k], bo[k]))
}

/** Lectura segura de un diccionario por llave (ignora la cadena de prototipos). */
export function ownValue<T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined
}
