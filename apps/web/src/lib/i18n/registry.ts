/**
 * Descubrimiento de espacios de nombres por convención de carpetas, sin índice central:
 *   `src/<carpeta>/i18n/es.ts` (fuente: viaja con su pantalla y se registra sola, ver `i18nSources` en vite.config)
 *   `src/<carpeta>/i18n/{en,pt,fr,de,it,tr}.ts` (cada archivo es un trozo aparte que se baja
 *   solo al cambiar a ese idioma).
 * El id de un espacio es la ruta de su carpeta (`features/quotes`), así que dos carpetas nunca chocan.
 */
import { glossarySource, type Locale, type MessageTree } from '@dekopen/shared'

type Module = { default: MessageTree }
export type NamespaceLoader = () => Promise<Module | MessageTree>

const LAZY_LOCALES = ['en', 'pt', 'fr', 'de', 'it', 'tr'] as const satisfies readonly Locale[]

const lazy = import.meta.glob<Module>(['/src/**/i18n/en.ts', '/src/**/i18n/pt.ts', '/src/**/i18n/fr.ts', '/src/**/i18n/de.ts', '/src/**/i18n/it.ts', '/src/**/i18n/tr.ts'])

/** `/src/features/quotes/i18n/en.ts` → `features/quotes`. El ejemplo de la guía no viaja a producción. */
function namespaceId(path: string): string | null {
  const match = /^\/src\/(.+)\/i18n\/[a-z]{2}\.ts$/.exec(path)
  if (!match) return null
  if (import.meta.env.PROD && match[1].includes('__example__')) return null
  return match[1]
}

const idByTree = new WeakMap<object, string>()
const sourceById = new Map<string, MessageTree>()
const loadersByLocale = new Map<Locale, Map<string, NamespaceLoader>>()

function addLoader(locale: Locale, id: string, loader: NamespaceLoader): void {
  let byId = loadersByLocale.get(locale)
  if (!byId) {
    byId = new Map()
    loadersByLocale.set(locale, byId)
  }
  byId.set(id, loader)
}

for (const [path, load] of Object.entries(lazy)) {
  const id = namespaceId(path)
  const locale = /\/i18n\/([a-z]{2})\.ts$/.exec(path)?.[1] as Locale | undefined
  if (!id || !locale || !(LAZY_LOCALES as readonly string[]).includes(locale)) continue
  addLoader(locale, id, load as NamespaceLoader)
}

// Glosario de dominio (packages/shared): español con la app; cada idioma, bajo demanda como el resto.
const GLOSSARY_ID = 'glossary'
const glossaryLazy = import.meta.glob<Module>([
  '../../../../../packages/shared/src/i18n/glossary/en.ts',
  '../../../../../packages/shared/src/i18n/glossary/pt.ts',
  '../../../../../packages/shared/src/i18n/glossary/fr.ts',
  '../../../../../packages/shared/src/i18n/glossary/de.ts',
  '../../../../../packages/shared/src/i18n/glossary/it.ts',
  '../../../../../packages/shared/src/i18n/glossary/tr.ts',
])
idByTree.set(glossarySource, GLOSSARY_ID)
sourceById.set(GLOSSARY_ID, glossarySource)
for (const [path, load] of Object.entries(glossaryLazy)) {
  const locale = /\/glossary\/([a-z]{2})\.ts$/.exec(path)?.[1] as Locale | undefined
  if (locale && (LAZY_LOCALES as readonly string[]).includes(locale)) addLoader(locale, GLOSSARY_ID, load as NamespaceLoader)
}

const registrationListeners = new Set<(id: string) => void>()

/** Avisa cuando se registra un espacio tarde (después de que un idioma ya estaba cargado). */
export function onNamespaceRegistered(listener: (id: string) => void): () => void {
  registrationListeners.add(listener)
  return () => registrationListeners.delete(listener)
}

/** Id del espacio de nombres al que pertenece un árbol español (o undefined si no está registrado). */
export function namespaceOf(tree: object): string | undefined {
  return idByTree.get(tree)
}

/** Árbol español de un espacio por id. */
export function namespaceSource(id: string): MessageTree | undefined {
  return sourceById.get(id)
}

/** Ids de todos los espacios registrados. */
export function namespaceIds(): string[] {
  return [...sourceById.keys()]
}

/** Cargadores de un idioma: `[id, cargar]` por espacio que tiene archivo para ese idioma. */
export function namespaceLoaders(locale: Locale): [string, NamespaceLoader][] {
  return [...(loadersByLocale.get(locale) ?? new Map<string, NamespaceLoader>()).entries()]
}

/**
 * Registra un espacio fuera de la convención de carpetas (paquetes del monorepo, pruebas).
 * `translations` acepta árboles ya importados o cargadores diferidos.
 */
export function registerNamespace(
  id: string,
  es: MessageTree,
  translations: Partial<Record<Exclude<Locale, 'es'>, MessageTree | NamespaceLoader>> = {},
): void {
  idByTree.set(es, id)
  sourceById.set(id, es)
  for (const [locale, value] of Object.entries(translations) as [Exclude<Locale, 'es'>, MessageTree | NamespaceLoader][]) {
    addLoader(locale, id, typeof value === 'function' ? value : async () => value)
  }
  for (const listener of [...registrationListeners]) listener(id)
}
