import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { LOCALE_META, LOCALES, type Locale, type LocaleMeta, type MessageKey, type MessageParams, type TreeOf } from '@dekopen/shared'
import { renderRich, type RichValues } from './rich'
import {
  applyHtmlLang,
  getLocale,
  getLocaleSnapshot,
  getPendingLocale,
  hasMessage,
  isLocaleReady,
  loadLocale,
  lookupNamespace,
  setLocale,
  subscribeLocale,
  translate,
} from './runtime'

interface I18nContextValue {
  /** Idioma con el que se dibuja este subárbol. */
  locale: Locale
  /** true dentro de `<LocaleScope>` (p. ej. el portal en el idioma del documento). */
  scoped: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

/** Se vuelve a dibujar cuando cambia el idioma o llegan textos nuevos. */
function useI18nSnapshot(): string {
  return useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleSnapshot)
}

/**
 * Proveedor del idioma de la interfaz (el más externo de la app: también lo usan la landing, el portal
 * y los avisos). Mientras bajan los textos del idioma guardado al arrancar muestra `fallback`
 * (nada, por defecto): así nunca aparece un destello en español. El español está siempre listo.
 */
export function I18nProvider({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  useI18nSnapshot()
  const locale = getLocale()
  const ready = isLocaleReady(locale)

  useEffect(() => {
    if (!ready) void loadLocale(locale)
  }, [locale, ready])

  useEffect(() => {
    applyHtmlLang(locale)
  }, [locale])

  const value = useMemo<I18nContextValue>(() => ({ locale, scoped: false }), [locale])
  if (!ready) return <>{fallback}</>
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Dibuja una parte de la pantalla en otro idioma sin cambiar el de la persona (portal del cliente,
 * vista previa de un documento en su idioma). Dentro, usa los hooks: `translate()` sin hooks sigue al
 * idioma global salvo que le pases `locale`.
 */
export function LocaleScope({ locale, children, fallback = null }: { locale: Locale; children: ReactNode; fallback?: ReactNode }) {
  useI18nSnapshot()
  const ready = isLocaleReady(locale)
  useEffect(() => {
    if (!ready) void loadLocale(locale)
  }, [locale, ready])
  const value = useMemo<I18nContextValue>(() => ({ locale, scoped: true }), [locale])
  if (!ready) return <>{fallback}</>
  return (
    <I18nContext.Provider value={value}>
      <div lang={LOCALE_META[locale].intl} style={{ display: 'contents' }}>
        {children}
      </div>
    </I18nContext.Provider>
  )
}

export interface LocaleState {
  /** Idioma con el que se dibuja este componente. */
  locale: Locale
  meta: LocaleMeta
  /** Idioma que se está descargando, o null (para «Cambiando idioma…»). */
  pending: Locale | null
  /** Cambia el idioma de la interfaz (descarga primero, guarda `fz-locale` y avisa al servidor). */
  setLocale: (locale: Locale) => Promise<boolean>
  locales: readonly Locale[]
}

/** Idioma actual y cómo cambiarlo. Funciona también sin proveedor (pruebas, vitrinas). */
export function useLocale(): LocaleState {
  useI18nSnapshot()
  const ctx = useContext(I18nContext)
  const locale = ctx?.locale ?? getLocale()
  return { locale, meta: LOCALE_META[locale], pending: getPendingLocale(), setLocale, locales: LOCALES }
}

/** Traductor de un espacio de nombres, ligado al idioma del componente. */
export interface Translator<M> {
  (key: MessageKey<M>, params?: MessageParams): string
  /** Texto con etiquetas → nodos React: `t.rich('price', { b: <strong/>, price: fmt.money(x) })`. */
  rich(key: MessageKey<M>, values?: RichValues): ReactNode
  /** ¿Existe la clave? Para claves dinámicas (`t.has(\`code.${error.code}\`)`). */
  has(key: string): boolean
  readonly locale: Locale
}

function makeTranslator<N extends object>(ns: N, locale: Locale): Translator<TreeOf<N>> {
  const t = ((key: MessageKey<TreeOf<N>>, params?: MessageParams) => translate(ns, key, params, locale)) as Translator<TreeOf<N>>
  Object.defineProperties(t, {
    locale: { value: locale, enumerable: true },
    has: { value: (key: string) => hasMessage(ns, key) },
    rich: {
      value: (key: string, values?: RichValues) => {
        const found = lookupNamespace(ns, key, locale)
        return found ? renderRich(found.message, values, found.locale, key) : key
      },
    },
  })
  return t
}

/**
 * Hook de traducción tipado por el árbol español de la carpeta:
 * ```ts
 * import es from './i18n/es'
 * const t = useT(es)
 * t('items.count', { count })
 * ```
 * También acepta diccionarios completos (`useT(glossary)`). Sin proveedor, devuelve español.
 */
export function useT<N extends object>(ns: N): Translator<TreeOf<N>> {
  const snap = useI18nSnapshot()
  const ctx = useContext(I18nContext)
  const locale = ctx?.locale ?? getLocale()
  // `snap` cambia cuando llegan textos nuevos: el traductor se rehace y los textos se refrescan.
  return useMemo(() => makeTranslator(ns, locale), [ns, locale, snap])
}

/**
 * Texto enriquecido como componente:
 * `<T ns={es} k="pricing.from" values={{ b: <strong className="text-ink-700" />, price }} />`.
 */
export function T<N extends object>({ ns, k, values }: { ns: N; k: MessageKey<TreeOf<N>>; values?: RichValues }) {
  const t = useT(ns)
  return <>{t.rich(k, values)}</>
}
