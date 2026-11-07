/**
 * Ayudas del glosario sobre **cualquier** diccionario con su forma: el completo y estático (servidor,
 * documentos: `glossary`) o uno que va recibiendo idiomas bajo demanda (la web descarga solo el idioma
 * en uso). No importa los textos: trabaja con lo que le pases.
 *
 * Avisos del motor: `Warning.params` trae los datos en bruto (mm, m², importes, ids, nombres del
 * catálogo; ver `WarningParamsMap` en `@dekopen/engine`). Aquí se formatean para el idioma
 * (`PARAM_RENDER`), los ids se nombran con el glosario, el paño se arma como «la hoja superior
 * izquierda» y recién entonces se rellena la frase del código. Si a una frase le falta un dato que
 * necesita, se usa la versión genérica (`warningGeneric`).
 */
import type { AllKeys, GlassKind, OpeningKind, ProfileRole, WarningCode, WarningFixKey, WarningFixParamsMap, WarningParamsMap } from '@dekopen/engine'
import type { QuoteStatus, Station, WorkOrder } from '../../api'
import type { PlanCode, Role } from '../../plans'
import { formatList, formatMm, formatMoney, formatNumber, formatPct } from '../format'
import { DEFAULT_LOCALE, intlTag, type Locale } from '../locales'
import { compileMessage, renderNodes, type MessageParamValue, type RenderContext } from '../message'
import { lookupMessage, translate, type Dictionary, type MessageKey, type MessageParams, type MessageTree } from '../translator'
import type es from './es'

export type GlossaryMessages = typeof es
export type GlossaryKey = MessageKey<GlossaryMessages>

/**
 * Aviso del motor tal como lo produce (`Warning`). `params` es opcional y aditivo: cuando el motor
 * los entrega, el aviso sale con detalle en cualquier idioma; si no, se usa la versión genérica.
 */
export interface LocalizableWarning {
  code: string
  message: string
  params?: MessageParams
  fix?: { label: string; key?: string; params?: MessageParams }
}

/** Opciones al nombrar avisos. */
export interface WarningTextOptions {
  /** Moneda de los importes del aviso (por defecto CLP, la del motor). */
  currency?: string
}

export interface GlossaryApi {
  /** Término por clave tipada: `term('business.quote', 'fr')` → «Devis». */
  term(key: GlossaryKey, locale?: Locale, params?: MessageParams): string
  typologyName(id: string, locale?: Locale, fallback?: string): string
  openingName(kind: OpeningKind | string, locale?: Locale): string
  shapeName(kind: string, locale?: Locale, options?: { segmental?: boolean }): string
  quoteStatusLabel(status: QuoteStatus | string, locale?: Locale): string
  workOrderStatusLabel(status: WorkOrder['status'] | string, locale?: Locale): string
  stationLabel(station: Station | string, locale?: Locale): string
  roleName(role: Role | string, locale?: Locale): string
  roleDescription(role: Role | string, locale?: Locale): string
  planName(code: PlanCode | string, locale?: Locale): string
  planTagline(code: PlanCode | string, locale?: Locale): string
  featureCopy(feature: string, locale?: Locale): { title: string; why: string }
  profileRoleName(role: ProfileRole | string, locale?: Locale): string
  glassKindName(kind: GlassKind | string, locale?: Locale): string
  unitCount(unit: keyof GlossaryMessages['unit'], count: number, locale?: Locale): string
  /** Texto del aviso: en español el `message` del motor; en otros idiomas, la frase del glosario con sus datos. */
  warningMessage(warning: LocalizableWarning, locale?: Locale, options?: WarningTextOptions): string
  /** Como `warningMessage`, pero también en español sale de la frase del glosario (pruebas: debe igualar al motor). */
  warningText(warning: LocalizableWarning, locale?: Locale, options?: WarningTextOptions): string
  warningFixLabel(warning: Pick<LocalizableWarning, 'fix'>, locale?: Locale, options?: WarningTextOptions): string | undefined
  /** Como `warningFixLabel`, pero también en español sale del glosario (pruebas: debe igualar a `fix.label` del motor). */
  warningFixText(warning: Pick<LocalizableWarning, 'fix'>, locale?: Locale, options?: WarningTextOptions): string | undefined
}

// ── Cómo se formatea cada parámetro ──────────────────────────────────────────

/** Grupos del glosario que nombran ids que viajan en los parámetros. */
type TermGroup = 'hardwareTarget' | 'extraPlural' | 'profileSubject' | 'openingLimit' | 'pautaField'

/**
 * Formato de un parámetro numérico o de id:
 * `mm` 1.249,5 mm · `mm0` 1.250 mm · `num0` 1.250 · `area` 1,95 m² · `pct` 35 % · `money` importe en la moneda;
 * `{ term }` nombra un id con el glosario (con `as`, en otro parámetro, y el id queda disponible);
 * `{ terms }` nombra una lista de ids separados por coma y la une según el idioma.
 */
export type ParamRender = 'mm' | 'mm0' | 'num0' | 'area' | 'pct' | 'money' | { term: TermGroup; as?: string } | { terms: TermGroup }

const OPENING_LIMIT_RENDER = {
  limit: { term: 'openingLimit' },
  width: 'num0',
  height: 'num0',
  minW: 'num0',
  maxW: 'num0',
  minH: 'num0',
  maxH: 'num0',
} as const satisfies Record<string, ParamRender>

/**
 * Formato de los parámetros de cada aviso (los no listados se usan tal cual). tsc exige que los
 * códigos y los nombres existan en `WarningParamsMap`; la prueba del glosario verifica que la frase
 * en español reproduzca el mensaje del motor, así que un formato mal elegido no pasa inadvertido.
 */
export const PARAM_RENDER = {
  pauta_incomplete: { fields: { terms: 'pautaField' } },
  arch_bending: { radius: 'mm' },
  shape_bending: { radius: 'mm' },
  round_not_square: { width: 'mm', height: 'mm' },
  profile_missing: { role: { term: 'profileSubject', as: 'subject' } },
  reinforcement_deduction_missing: { deduction: 'mm' },
  zocalo_invalid: { height: 'mm', max: 'mm' },
  bead_no_fit: { thickness: 'mm' },
  glazing_out_of_range: { thickness: 'num0', min: 'num0', max: 'num0' },
  supplier_limit_exceeded: { width: 'num0', height: 'num0', minW: 'num0', maxW: 'num0', minH: 'num0', maxH: 'num0' },
  hardware_missing: { target: { term: 'hardwareTarget' } },
  hardware_out_of_range: { size: 'mm', below: 'num0', above: 'num0' },
  extra_rules_missing: { extra: { term: 'extraPlural' } },
  opening_too_large: OPENING_LIMIT_RENDER,
  opening_too_small: OPENING_LIMIT_RENDER,
  element_too_large: { width: 'mm0', max: 'mm0' },
  pane_small: { size: 'mm' },
  glass_too_big: { area: 'area', max: 'area', thickness: 'mm' },
  margin_invalid: { pct: 'pct' },
  manual_price: { price: 'money' },
  below_cost: { price: 'money', cost: 'money', loss: 'money' },
  piece_too_long: { length: 'mm', bar: 'mm', needed: 'mm' },
} as const satisfies { [C in WarningCode]?: { [P in AllKeys<WarningParamsMap[C]>]?: ParamRender } }

/** Formato de los parámetros de cada corrección. */
export const FIX_PARAM_RENDER = {
  square: { width: 'mm', height: 'mm' },
} as const satisfies { [K in WarningFixKey]?: { [P in keyof WarningFixParamsMap[K]]?: ParamRender } }

/** Parámetros que el glosario arma a partir de los del motor (las frases pueden usarlos). */
export const DERIVED_PARAMS: Record<string, readonly string[]> = {
  /** El paño del aviso: `{pane}` al inicio de la frase y `{paneOf}` («de la hoja izquierda») dentro de ella. */
  pane: ['pane', 'paneOf'],
  /** El perfil con su artículo («La hoja de puerta»). */
  subject: ['subject'],
}

const FIX_BY_LABEL: Record<string, WarningFixKey> = {
  'Convertir en corredera': 'to_sliding',
  'Convertir en practicable': 'to_casement',
  'Usar travesaño': 'use_mullion',
  'Dejar como paño fijo': 'make_fixed',
  'Usar su primer color': 'use_first_color',
}

/** Reescribe medidas del motor («1.249,5 mm») con el formato del idioma («1,249.5 mm»). */
export function relocalizeMm(text: string, locale: Locale): string {
  if (locale === 'es') return text
  return text.replace(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?) mm/g, (_, num: string) =>
    formatMm(Number(num.replace(/\./g, '').replace(',', '.')), { locale, unit: true }),
  )
}

/** Primera letra en mayúscula según el idioma («i» → «İ» en turco). */
function upperFirst(text: string, locale: Locale): string {
  return text ? text.charAt(0).toLocaleUpperCase(intlTag(locale)) + text.slice(1) : text
}

type Prepared = Record<string, MessageParamValue>

/**
 * Rellena una frase con sus datos. Devuelve `undefined` si la frase necesita (por la rama que
 * resulta elegida) un dato que no vino, o si está mal formada: así cada variante pide solo los suyos.
 */
function renderComplete(template: string, params: Prepared, locale: Locale): string | undefined {
  let nodes
  try {
    nodes = compileMessage(template)
  } catch {
    return undefined
  }
  let missing = false
  const read = (name: string): MessageParamValue => {
    const value = params[name]
    if (value === undefined || value === null) missing = true
    return value
  }
  const ctx: RenderContext = {
    locale,
    arg: (name) => String(read(name) ?? ''),
    raw: (name) => String(read(name) ?? ''),
    num: (name) => {
      const value = read(name)
      return typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
    },
    pound: (value) => formatNumber(value, { locale, maxDecimals: 2 }),
  }
  const text = renderNodes(nodes, ctx)
  return missing ? undefined : text
}

/** Construye las ayudas del glosario sobre un diccionario (completo o con idiomas bajo demanda). */
export function createGlossaryHelpers(dict: Dictionary<GlossaryMessages>): GlossaryApi {
  const t = (key: string, params: MessageParams | undefined, locale: Locale) => translate(dict, key as GlossaryKey, params, locale)
  const exists = (key: string) => lookupMessage(dict.es, key) !== undefined
  /** Texto de una clave en el idioma, o en español si ese idioma aún no la trae. */
  const message = (key: string, locale: Locale): string | undefined =>
    lookupMessage(dict[locale] as MessageTree | undefined, key) ?? lookupMessage(dict.es, key)
  /** Término de un grupo por id dinámico; si el id no existe devuelve `fallback` (o el id). */
  const term = (group: string, id: string, locale: Locale, fallback?: string): string => {
    const key = `${group}.${id}`
    return exists(key) ? t(key, undefined, locale) : (fallback ?? id)
  }

  /** Aplica `PARAM_RENDER` y arma los parámetros derivados (paño, perfil con artículo). */
  function prepare(
    params: MessageParams,
    specs: Readonly<Record<string, ParamRender>> | undefined,
    locale: Locale,
    options: WarningTextOptions,
  ): Prepared {
    const out: Prepared = {}
    for (const [name, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      const spec = specs?.[name]
      if (spec === undefined) {
        out[name] = value
      } else if (typeof spec === 'string') {
        const n = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(n)) out[name] = value
        else if (spec === 'mm') out[name] = formatMm(n, { locale, unit: true })
        else if (spec === 'mm0') out[name] = `${formatNumber(n, { locale, maxDecimals: 0 })} mm`
        else if (spec === 'num0') out[name] = formatNumber(n, { locale, maxDecimals: 0 })
        else if (spec === 'area') out[name] = `${formatNumber(n, { locale, maxDecimals: 2 })} m²`
        else if (spec === 'pct') out[name] = formatPct(n, { locale })
        else out[name] = formatMoney(n, { locale, currency: options.currency })
      } else if ('term' in spec) {
        out[spec.as ?? name] = term(spec.term, String(value), locale)
        if (spec.as) out[name] = value
      } else {
        const names = String(value)
          .split(',')
          .filter(Boolean)
          .map((id) => term(spec.terms, id, locale))
        out[name] = formatList(names, { locale })
      }
    }
    if (typeof params.paneKind === 'string') {
      const pane = { kind: params.paneKind, v: params.paneV ?? 'none', h: params.paneH ?? 'none', n: Number(params.paneN) || 0 }
      out.pane = upperFirst(t('pane.label', pane, locale), locale)
      out.paneOf = t('pane.labelOf', pane, locale)
    }
    return out
  }

  function warningText(warning: LocalizableWarning, locale: Locale, options: WarningTextOptions): string {
    const template = message(`warning.${warning.code}`, locale)
    // Código que el glosario no conoce (más nuevo que él): el texto del motor.
    if (template === undefined) return warning.message
    if (warning.params) {
      const specs = (PARAM_RENDER as Record<string, Readonly<Record<string, ParamRender>> | undefined>)[warning.code]
      const text = renderComplete(template, prepare(warning.params, specs, locale, options), locale)
      if (text !== undefined) return text
    }
    return message(`warningGeneric.${warning.code}`, locale) ?? warning.message
  }

  function fixText(warning: Pick<LocalizableWarning, 'fix'>, locale: Locale, options: WarningTextOptions): string | undefined {
    const fix = warning.fix
    if (!fix) return undefined
    if (fix.key && exists(`warningFix.${fix.key}`)) {
      const template = message(`warningFix.${fix.key}`, locale)
      const specs = (FIX_PARAM_RENDER as Record<string, Readonly<Record<string, ParamRender>> | undefined>)[fix.key]
      const text = template === undefined ? undefined : renderComplete(template, prepare(fix.params ?? {}, specs, locale, options), locale)
      if (text !== undefined) return text
    }
    // Correcciones sin clave (otras fuentes u OT antiguas): se reconocen por el texto español del motor.
    const known = FIX_BY_LABEL[fix.label]
    if (known) return t(`warningFix.${known}`, undefined, locale)
    const square = /^Dejar en (.+) × (.+)$/.exec(fix.label)
    if (square) return t('warningFix.square', { width: relocalizeMm(square[1], locale), height: relocalizeMm(square[2], locale) }, locale)
    const use = /^Usar (.+)$/.exec(fix.label)
    if (use) return t('warningFix.use', { name: use[1] }, locale)
    return fix.label
  }

  return {
    term: (key, locale = DEFAULT_LOCALE, params) => t(key, params, locale),
    typologyName: (id, locale = DEFAULT_LOCALE, fallback) => term('typology', id, locale, fallback),
    openingName: (kind, locale = DEFAULT_LOCALE) => term('opening', kind, locale),
    shapeName: (kind, locale = DEFAULT_LOCALE, options = {}) => term('shape', kind === 'arch' && options.segmental ? 'arch_segmental' : kind, locale),
    quoteStatusLabel: (status, locale = DEFAULT_LOCALE) => term('quoteStatus', status, locale),
    workOrderStatusLabel: (status, locale = DEFAULT_LOCALE) => term('workOrderStatus', status, locale),
    stationLabel: (station, locale = DEFAULT_LOCALE) => term('station', station, locale),
    roleName: (role, locale = DEFAULT_LOCALE) => term('role', role, locale),
    roleDescription: (role, locale = DEFAULT_LOCALE) => term('roleDescription', role, locale, ''),
    planName: (code, locale = DEFAULT_LOCALE) => term('plan', code, locale),
    planTagline: (code, locale = DEFAULT_LOCALE) => term('planTagline', code, locale, ''),
    featureCopy: (feature, locale = DEFAULT_LOCALE) => ({
      title: term('feature', `${feature}.title`, locale, feature),
      why: term('feature', `${feature}.why`, locale, ''),
    }),
    profileRoleName: (role, locale = DEFAULT_LOCALE) => term('profileRole', role, locale),
    glassKindName: (kind, locale = DEFAULT_LOCALE) => term('glassKind', kind, locale),
    unitCount: (unit, count, locale = DEFAULT_LOCALE) => t(`unit.${unit}`, { count }, locale),

    warningMessage(warning, locale = DEFAULT_LOCALE, options = {}) {
      // En español, siempre el texto del motor (idéntico al de hoy).
      if (locale === 'es') return warning.message
      return warningText(warning, locale, options)
    },

    warningText: (warning, locale = DEFAULT_LOCALE, options = {}) => warningText(warning, locale, options),

    warningFixLabel(warning, locale = DEFAULT_LOCALE, options = {}) {
      // En español, siempre la etiqueta del motor.
      if (locale === 'es') return warning.fix?.label
      return fixText(warning, locale, options)
    },

    warningFixText: (warning, locale = DEFAULT_LOCALE, options = {}) => fixText(warning, locale, options),
  }
}
