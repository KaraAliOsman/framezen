/**
 * Traductor sin framework (servidor, documentos, motor de comandos y la web).
 *
 * Un *árbol de mensajes* es un objeto literal `as const` con textos (o grupos anidados):
 *   `{ save: 'Guardar', items: { count: '{count, plural, one {# ítem} other {# ítems}}' } }`
 * Las claves se escriben con puntos (`'items.count'`) y quedan tipadas: un error de tipeo no compila.
 *
 * Un *diccionario* agrupa el árbol español (fuente) con sus traducciones, todas tipadas
 * `Translation<typeof es>` para que tsc avise si falta o sobra una clave.
 */
import { DEFAULT_LOCALE, LOCALES, type Locale } from './locales'
import { formatNumber } from './format'
import { compileMessage, MessageSyntaxError, renderNodes, type MessageParams, type RenderContext } from './message'

export type { MessageParams, MessageParamValue } from './message'

/** Árbol de mensajes: textos ICU-lite o grupos anidados. */
export interface MessageTree {
  readonly [key: string]: string | MessageTree
}

/** Misma forma que el árbol fuente, con textos libres (para escribir `en.ts`, `pt.ts`…). */
export type Translation<T> = T extends string ? string : { readonly [K in keyof T]: Translation<T[K]> }

/** Claves de un árbol con notación de puntos: `'save' | 'items.count'`. */
export type MessageKey<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : `${K}.${MessageKey<T[K]>}` }[keyof T & string]

declare const DICTIONARY_BRAND: unique symbol

/** Árbol español + traducciones a los 6 idiomas restantes, con marca de diccionario. */
export type Dictionary<M extends MessageTree = MessageTree> = { readonly es: M } & {
  readonly [L in Exclude<Locale, 'es'>]: Translation<M>
} & { readonly [DICTIONARY_BRAND]: true }

/** Árbol de un diccionario (o el árbol mismo). */
export type TreeOf<N> = N extends Dictionary<infer M> ? M : N

const DICTIONARY = Symbol.for('dekopen.i18n.dictionary')

/**
 * Declara el árbol español de un espacio de nombres conservando los literales (equivale a `as const`).
 * Opcional: `export default { … } as const` funciona igual.
 */
export function defineNamespace<const M extends MessageTree>(messages: M): M {
  return messages
}

/** Agrupa un árbol español con sus seis traducciones (todas obligatorias y con la misma forma). */
export function defineDictionary<M extends MessageTree>(locales: { readonly es: M } & { readonly [L in Exclude<Locale, 'es'>]: Translation<M> }): Dictionary<M> {
  const dict = { ...locales }
  Object.defineProperty(dict, DICTIONARY, { value: true, enumerable: false })
  return dict as unknown as Dictionary<M>
}

/**
 * Diccionario cuyos idiomas llegan bajo demanda: `resolve(locale)` devuelve el árbol si ya está
 * cargado (o undefined, y entonces se usa el español). Lo usa la web para no cargar los 7 idiomas.
 */
export function defineLazyDictionary<M extends MessageTree>(es: M, resolve: (locale: Exclude<Locale, 'es'>) => Translation<M> | undefined): Dictionary<M> {
  const dict: Record<string, unknown> = { es }
  for (const locale of LOCALES) {
    if (locale !== 'es') Object.defineProperty(dict, locale, { get: () => resolve(locale), enumerable: true })
  }
  Object.defineProperty(dict, DICTIONARY, { value: true, enumerable: false })
  return dict as unknown as Dictionary<M>
}

export function isDictionary(value: unknown): value is Dictionary {
  return Boolean(value) && typeof value === 'object' && (value as Record<symbol, unknown>)[DICTIONARY] === true
}

/** Texto de una clave con puntos dentro de un árbol (undefined si no existe o es un grupo). */
export function lookupMessage(tree: MessageTree | undefined, key: string): string | undefined {
  if (!tree) return undefined
  const direct = tree[key]
  if (typeof direct === 'string') return direct
  let node: string | MessageTree | undefined = tree
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Todas las claves hoja de un árbol (pruebas de completitud, herramientas). */
export function messageKeys(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') keys.push(path)
    else keys.push(...messageKeys(value, path))
  }
  return keys
}

// ── Avisos de desarrollo ────────────────────────────────────────────────────

export type I18nIssue =
  | { kind: 'missing'; key: string; locale: Locale; namespace?: string }
  | { kind: 'syntax'; key?: string; locale: Locale; message: string; error: string }
  | { kind: 'param'; key?: string; locale: Locale; param: string }

let issueHandler: ((issue: I18nIssue) => void) | null = null

/** Registra quién se entera de claves faltantes, mensajes mal formados o parámetros sin valor. */
export function setI18nIssueHandler(handler: ((issue: I18nIssue) => void) | null): void {
  issueHandler = handler
}

export function reportI18nIssue(issue: I18nIssue): void {
  issueHandler?.(issue)
}

// ── Formato de mensajes ─────────────────────────────────────────────────────

function paramText(value: MessageParams[string]): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** Contexto de evaluación con los parámetros dados (base de `formatMessage`). */
export function paramContext(params: MessageParams | undefined, locale: Locale, key?: string): RenderContext {
  const get = (name: string) => {
    const value = params?.[name]
    if (value === undefined && !(params && name in params)) reportI18nIssue({ kind: 'param', key, locale, param: name })
    return value
  }
  return {
    locale,
    arg: (name) => paramText(get(name)),
    num: (name) => {
      const value = get(name)
      return typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
    },
    raw: (name) => paramText(get(name)),
    pound: (value) => formatNumber(value, { locale, maxDecimals: 2 }),
  }
}

/**
 * Formatea un mensaje ICU-lite. Un mensaje mal formado no rompe la pantalla: se reporta y se
 * devuelve tal cual.
 */
export function formatMessage(message: string, params?: MessageParams, locale: Locale = DEFAULT_LOCALE, key?: string): string {
  if (!message.includes('{')) return message
  try {
    return renderNodes(compileMessage(message), paramContext(params, locale, key))
  } catch (error) {
    if (!(error instanceof MessageSyntaxError)) throw error
    reportI18nIssue({ kind: 'syntax', key, locale, message, error: error.message })
    return message
  }
}

/** Resuelve el texto de `key` en `locale` con respaldo en español. `locale` indica qué reglas de plural usar. */
export function resolveMessage(dict: Dictionary, key: string, locale: Locale): { message: string; locale: Locale } | undefined {
  if (locale !== 'es') {
    const translated = lookupMessage(dict[locale] as MessageTree | undefined, key)
    if (translated !== undefined) return { message: translated, locale }
  }
  const source = lookupMessage(dict.es, key)
  if (source === undefined) return undefined
  if (locale !== 'es') reportI18nIssue({ kind: 'missing', key, locale })
  return { message: source, locale: 'es' }
}

/**
 * Traduce `key` de un diccionario al idioma pedido (español si falta la clave en ese idioma;
 * la clave misma si tampoco existe en español).
 */
export function translate<M extends MessageTree>(dict: Dictionary<M>, key: MessageKey<M>, params?: MessageParams, locale: Locale = DEFAULT_LOCALE): string {
  const found = resolveMessage(dict as unknown as Dictionary, key, locale)
  if (!found) {
    reportI18nIssue({ kind: 'missing', key, locale: 'es' })
    return key
  }
  return formatMessage(found.message, params, found.locale, key)
}

export interface Translator<M extends MessageTree> {
  (key: MessageKey<M>, params?: MessageParams): string
  readonly locale: Locale
  /** ¿Existe la clave (en el idioma o en español)? Útil para claves dinámicas (códigos de aviso). */
  has(key: string): boolean
}

/** Traductor ligado a un diccionario y un idioma: `const t = createTranslator(glossary, 'de'); t('typology.tilt_turn')`. */
export function createTranslator<M extends MessageTree>(dict: Dictionary<M>, locale: Locale = DEFAULT_LOCALE): Translator<M> {
  const t = ((key: MessageKey<M>, params?: MessageParams) => translate(dict, key, params, locale)) as Translator<M>
  Object.defineProperty(t, 'locale', { value: locale, enumerable: true })
  Object.defineProperty(t, 'has', {
    value: (key: string) => lookupMessage(dict[locale] as MessageTree | undefined, key) !== undefined || lookupMessage(dict.es, key) !== undefined,
  })
  return t
}

/** Claves que faltan o sobran en una traducción respecto del español (pruebas y scripts). */
export function diffTranslation(source: MessageTree, translation: MessageTree): { missing: string[]; extra: string[] } {
  const want = new Set(messageKeys(source))
  const have = new Set(messageKeys(translation))
  return { missing: [...want].filter((k) => !have.has(k)), extra: [...have].filter((k) => !want.has(k)) }
}

/** Idiomas distintos del español (los que se traducen). */
export const TRANSLATED_LOCALES = LOCALES.filter((l): l is Exclude<Locale, 'es'> => l !== 'es')
