/**
 * Estado del idioma de la interfaz, sin React (lo usan `api.ts`, `format.ts`, modelos y toasts).
 *
 * - El idioma inicial sale de `fz-locale` (elección guardada), si no del navegador y si no `es`.
 *   En pruebas (vitest) no se mira el navegador: siempre parte en español.
 * - Cambiar de idioma **primero descarga** los textos de ese idioma y recién después lo aplica:
 *   la pantalla nunca muestra una mezcla ni un destello de español.
 * - `translate()` resuelve en el idioma actual con respaldo en español por clave.
 */
import {
  DEFAULT_LOCALE,
  isDictionary,
  isLocale,
  LOCALE_META,
  LOCALES,
  lookupMessage,
  matchLocale,
  resolveMessage,
  setI18nIssueHandler,
  formatMessage,
  type Dictionary,
  type I18nIssue,
  type Locale,
  type MessageKey,
  type MessageParams,
  type MessageTree,
  type TreeOf,
} from '@dekopen/shared'
import { namespaceLoaders, namespaceOf, onNamespaceRegistered, type NamespaceLoader } from './registry'

export const LOCALE_STORAGE_KEY = 'fz-locale'

/** Quién cambió el idioma: la persona, el servidor (su preferencia guardada) o el arranque. */
export type LocaleChangeSource = 'user' | 'server' | 'init'

const DEV = import.meta.env.DEV
const TEST = import.meta.env.MODE === 'test'

// ── Detección y persistencia ────────────────────────────────────────────────

function readStored(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(stored) ? stored : null
  } catch {
    return null
  }
}

function persist(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Modo privado: el idioma dura la sesión.
  }
}

/** Idioma con el que arranca la app: guardado → navegador → español. */
export function detectInitialLocale(): Locale {
  const stored = readStored()
  if (stored) return stored
  if (TEST || typeof navigator === 'undefined') return DEFAULT_LOCALE
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  return matchLocale(langs.filter(Boolean))
}

/** Pone `<html lang>` con la etiqueta BCP 47 del idioma (lectores de pantalla, guiones, ortografía). */
export function applyHtmlLang(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = LOCALE_META[locale].intl
}

// ── Estado ──────────────────────────────────────────────────────────────────

let current: Locale = detectInitialLocale()
let pending: Locale | null = null
let version = 0
let switchToken = 0
const loaded = new Map<Locale, Map<string, MessageTree>>()
const ready = new Set<Locale>([DEFAULT_LOCALE])
const inFlight = new Map<Locale, Promise<void>>()
const listeners = new Set<() => void>()
const changeListeners = new Set<(locale: Locale, source: LocaleChangeSource) => void>()

let snapshot = `${current}||${version}`
/** Sube con cada reinicio (pruebas): una descarga de antes del reinicio no deja rastros. */
let generation = 0

function notify(): void {
  version++
  snapshot = `${current}|${pending ?? ''}|${version}`
  for (const listener of [...listeners]) listener()
}

/** Idioma actual de la interfaz. */
export function getLocale(): Locale {
  return current
}

/** Idioma que se está descargando (para mostrar «Cambiando idioma…»), o null. */
export function getPendingLocale(): Locale | null {
  return pending
}

/** Suscripción para `useSyncExternalStore` (cambia con el idioma y con cada carga de textos). */
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Instantánea estable para `useSyncExternalStore`. */
export function getLocaleSnapshot(): string {
  return snapshot
}

/** Se entera de cada cambio aplicado y de su origen (p. ej. para guardar la preferencia en el servidor). */
export function onLocaleChange(listener: (locale: Locale, source: LocaleChangeSource) => void): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

/** ¿Ya están los textos de ese idioma? El español siempre. */
export function isLocaleReady(locale: Locale): boolean {
  return ready.has(locale)
}

function moduleTree(value: unknown): MessageTree | undefined {
  if (!value || typeof value !== 'object') return undefined
  const maybe = (value as { default?: unknown }).default
  return (maybe && typeof maybe === 'object' ? maybe : value) as MessageTree
}

async function loadOne(locale: Locale, id: string, loader: NamespaceLoader): Promise<void> {
  const gen = generation
  try {
    const tree = moduleTree(await loader())
    if (!tree || gen !== generation) return
    let byId = loaded.get(locale)
    if (!byId) {
      byId = new Map()
      loaded.set(locale, byId)
    }
    byId.set(id, tree)
  } catch (error) {
    // Un archivo que no baja (sin conexión, despliegue a medias) no bloquea: esas claves caen al español.
    if (DEV) console.warn(`[i18n] No se pudo cargar ${id} (${locale}).`, error)
  }
}

/** Textos ya descargados de un espacio en un idioma (o undefined). */
export function loadedNamespace(id: string, locale: Locale): MessageTree | undefined {
  return loaded.get(locale)?.get(id)
}

// Un espacio registrado tarde (paquete, ruta diferida) se descarga para los idiomas ya cargados.
onNamespaceRegistered((id) => {
  for (const locale of ready) {
    if (locale === DEFAULT_LOCALE) continue
    const entry = namespaceLoaders(locale).find(([nid]) => nid === id)
    if (entry) void loadOne(locale, id, entry[1]).then(notify)
  }
})

/**
 * Descarga un solo espacio en todos los idiomas (p. ej. el glosario para el asistente, que entiende
 * comandos en 7 idiomas y completa «add a tilt and turn» con el nombre en inglés aunque la interfaz
 * esté en español). Nunca rechaza; lo ya cargado no se vuelve a pedir.
 */
export function preloadNamespace(id: string): Promise<void> {
  const jobs: Promise<void>[] = []
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE || loaded.get(locale)?.has(id)) continue
    const entry = namespaceLoaders(locale).find(([nid]) => nid === id)
    if (entry) jobs.push(loadOne(locale, id, entry[1]))
  }
  return jobs.length ? Promise.all(jobs).then(notify) : Promise.resolve()
}

/** Descarga (una sola vez) todos los textos de un idioma. Nunca rechaza. */
export function loadLocale(locale: Locale): Promise<void> {
  if (ready.has(locale)) return Promise.resolve()
  const running = inFlight.get(locale)
  if (running) return running
  const gen = generation
  const job = Promise.all(namespaceLoaders(locale).map(([id, loader]) => loadOne(locale, id, loader))).then(() => {
    if (gen !== generation) return
    ready.add(locale)
    inFlight.delete(locale)
    notify()
  })
  inFlight.set(locale, job)
  return job
}

function apply(locale: Locale, source: LocaleChangeSource): void {
  const changed = locale !== current
  current = locale
  pending = null
  if (source !== 'init') persist(locale)
  applyHtmlLang(locale)
  notify()
  if (changed || source === 'user') for (const listener of [...changeListeners]) listener(locale, source)
}

/**
 * Cambia el idioma: descarga sus textos y recién entonces lo aplica (sin destello). Si llegan
 * dos cambios seguidos gana el último. Devuelve false si otro cambio lo reemplazó.
 */
export async function switchLocale(locale: Locale, source: LocaleChangeSource = 'user'): Promise<boolean> {
  if (!isLocale(locale)) return false
  const token = ++switchToken
  if (!ready.has(locale)) {
    pending = locale
    notify()
    await loadLocale(locale)
    if (token !== switchToken) return false
  }
  apply(locale, source)
  return true
}

/** Cambia el idioma de la interfaz por decisión de la persona (guarda `fz-locale` y avisa al servidor). */
export function setLocale(locale: Locale): Promise<boolean> {
  return switchLocale(locale, 'user')
}

// ── Avisos de desarrollo ────────────────────────────────────────────────────

const warned = new Set<string>()

function warnOnce(issue: I18nIssue, namespace?: string): void {
  if (!DEV) return
  const detail = issue.kind === 'param' ? `{${issue.param}}` : issue.kind === 'syntax' ? issue.error : ''
  const id = `${issue.kind}|${issue.locale}|${namespace ?? ''}|${issue.key ?? ''}|${detail}`
  if (warned.has(id)) return
  warned.add(id)
  const where = `${namespace ? `${namespace}:` : ''}${issue.key ?? '(sin clave)'}`
  if (issue.kind === 'missing') console.warn(`[i18n] Falta «${where}» en ${issue.locale}; se muestra en español.`)
  else if (issue.kind === 'param') console.warn(`[i18n] «${where}» (${issue.locale}) usa {${issue.param}} pero no se pasó.`)
  else console.warn(`[i18n] Mensaje mal formado «${where}» (${issue.locale}): ${issue.error}`)
}

setI18nIssueHandler((issue) => warnOnce(issue))

// ── Traducción sin hooks ────────────────────────────────────────────────────

/** Espacio de nombres: árbol español de una carpeta (`import es from './i18n/es'`) o diccionario completo. */
export type Namespace = MessageTree | Dictionary

/** Mensaje y el idioma del que salió (las reglas de plural siguen al texto, no a la interfaz). */
export function lookupNamespace(ns: object, key: string, locale: Locale): { message: string; locale: Locale } | undefined {
  if (isDictionary(ns)) return resolveMessage(ns, key, locale)
  const tree = ns as MessageTree
  const id = namespaceOf(tree)
  if (locale !== 'es' && id) {
    const translated = lookupMessage(loaded.get(locale)?.get(id), key)
    if (translated !== undefined) return { message: translated, locale }
  }
  const source = lookupMessage(tree, key)
  if (source === undefined) return undefined
  if (locale !== 'es' && ready.has(locale)) warnOnce({ kind: 'missing', key, locale }, id)
  return { message: source, locale: 'es' }
}

/**
 * Traduce sin hooks (modelos `.ts`, toasts, etiquetas de deshacer): `translate(es, 'items.count', { count })`.
 * Usa el idioma actual salvo que se indique otro (p. ej. el idioma del documento).
 */
export function translate<N extends object>(ns: N, key: MessageKey<TreeOf<N>>, params?: MessageParams, locale: Locale = current): string {
  const found = lookupNamespace(ns, key, locale)
  if (!found) {
    warnOnce({ kind: 'missing', key, locale: 'es' }, isDictionary(ns) ? undefined : namespaceOf(ns))
    return key
  }
  return formatMessage(found.message, params, found.locale, key)
}

/** ¿Existe la clave (en el idioma o en español)? Útil para claves dinámicas (códigos de error, avisos). */
export function hasMessage(ns: object, key: string): boolean {
  if (isDictionary(ns)) return lookupMessage(ns.es, key) !== undefined
  return lookupMessage(ns as MessageTree, key) !== undefined
}

// ── Arranque y pruebas ──────────────────────────────────────────────────────

// Un idioma guardado distinto del español empieza a bajar antes de que React pinte nada.
if (current !== DEFAULT_LOCALE) void loadLocale(current)

/** Solo pruebas: vuelve al español y olvida lo descargado. */
export function resetI18nForTests(locale: Locale = DEFAULT_LOCALE): void {
  generation++
  switchToken++
  loaded.clear()
  inFlight.clear()
  ready.clear()
  ready.add(DEFAULT_LOCALE)
  warned.clear()
  current = locale
  pending = null
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY)
  } catch {
    // sin almacenamiento
  }
  applyHtmlLang(locale)
  notify()
}
