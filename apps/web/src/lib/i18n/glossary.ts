/**
 * Glosario de dominio en la interfaz: nombres de tipologías, aperturas, formas, estados, roles,
 * planes y avisos del motor en el idioma del componente (en español, el texto de siempre).
 *
 * A diferencia del `glossary` estático de `@dekopen/shared` (7 idiomas en memoria, para servidor y
 * documentos), aquí el español viaja con la app y cada idioma se descarga al elegirlo, junto con
 * el resto de los textos. No importes en la web las funciones estáticas (`typologyName`…): usa estas.
 */
import { useMemo } from 'react'
import {
  createGlossaryHelpers,
  defineLazyDictionary,
  glossarySource,
  type GlossaryMessages,
  type LocalizableWarning,
  type Locale,
  type Translation,
} from '@dekopen/shared'
import { useT, type Translator } from './provider'
import { getLocale, loadedNamespace } from './runtime'

/** Diccionario del glosario para `useT`/`translate`: español siempre, otros idiomas cuando bajan. */
export const webGlossary = defineLazyDictionary(glossarySource, (locale) => loadedNamespace('glossary', locale) as Translation<GlossaryMessages> | undefined)

const api = createGlossaryHelpers(webGlossary)

export interface GlossaryHelpers {
  locale: Locale
  /** Cualquier término por clave: `g.term('business.quote')`. */
  term: (key: Parameters<typeof api.term>[0], params?: Parameters<typeof api.term>[2]) => string
  typology: (id: string, fallback?: string) => string
  opening: (kind: string) => string
  shape: (kind: string, options?: { segmental?: boolean }) => string
  quoteStatus: (status: string) => string
  workOrderStatus: (status: string) => string
  station: (station: string) => string
  role: (role: string) => string
  roleDescription: (role: string) => string
  plan: (code: string) => string
  planTagline: (code: string) => string
  feature: (feature: string) => { title: string; why: string }
  profileRole: (role: string) => string
  glassKind: (kind: string) => string
  count: (unit: keyof GlossaryMessages['unit'], count: number) => string
  /** Texto de un aviso del motor (en español, su `message` tal cual). */
  warning: (warning: LocalizableWarning) => string
  /** Etiqueta del botón de corrección de un aviso, si tiene. */
  warningFix: (warning: Pick<LocalizableWarning, 'fix'>) => string | undefined
}

function bind(locale: Locale): GlossaryHelpers {
  return {
    locale,
    term: (key, params) => api.term(key, locale, params),
    typology: (id, fallback) => api.typologyName(id, locale, fallback),
    opening: (kind) => api.openingName(kind, locale),
    shape: (kind, options) => api.shapeName(kind, locale, options),
    quoteStatus: (status) => api.quoteStatusLabel(status, locale),
    workOrderStatus: (status) => api.workOrderStatusLabel(status, locale),
    station: (station) => api.stationLabel(station, locale),
    role: (role) => api.roleName(role, locale),
    roleDescription: (role) => api.roleDescription(role, locale),
    plan: (code) => api.planName(code, locale),
    planTagline: (code) => api.planTagline(code, locale),
    feature: (feature) => api.featureCopy(feature, locale),
    profileRole: (role) => api.profileRoleName(role, locale),
    glassKind: (kind) => api.glassKindName(kind, locale),
    count: (unit, count) => api.unitCount(unit, count, locale),
    warning: (warning) => api.warningMessage(warning, locale),
    warningFix: (warning) => api.warningFixLabel(warning, locale),
  }
}

/** Ayudas del glosario ligadas al idioma del componente (se refrescan al cambiar el idioma). */
export function useGlossary(): GlossaryHelpers & { t: Translator<GlossaryMessages> } {
  const t = useT(webGlossary)
  return useMemo(() => ({ ...bind(t.locale), t }), [t])
}

/** Igual que `useGlossary()` pero sin hooks (modelos, toasts): idioma actual o el que indiques. */
export function getGlossary(locale: Locale = getLocale()): GlossaryHelpers {
  return bind(locale)
}
