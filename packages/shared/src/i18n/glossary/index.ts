/**
 * Glosario de dominio en 7 idiomas + ayudas para nombrar ids del motor y de la app.
 *
 * El motor sigue siendo español por dentro (nombres, avisos); las interfaces y los documentos
 * traducen **por id o código** con estas funciones. En español todas devuelven exactamente el
 * texto de hoy (los avisos, el `message` del motor tal cual).
 */
import type {
  AccessoryPer,
  AllKeys,
  ColorFinish,
  ExtraKind,
  GlassKind,
  HardwareTargetKind,
  HardwareUnit,
  InsectScreenType,
  Item,
  LeafUse,
  LineKind,
  OpeningKind,
  OpeningLimitClass,
  PaneParamKey,
  PautaField,
  ProfileRole,
  RollerShutterOperation,
  RollerShutterType,
  ShapeKind,
  SlidingSystem,
  TypologyId,
  WarningCode,
  WarningFixKey,
  WarningFixParamsMap,
  WarningLevel,
  WarningParamsMap,
} from '@dekopen/engine'
import type { QuoteStatus, Station, WorkOrder } from '../../api'
import type { Feature, PlanCode, Role } from '../../plans'
import { DEFAULT_LOCALE, type Locale } from '../locales'
import { defineDictionary, type MessageParams } from '../translator'
import { createGlossaryHelpers, type GlossaryKey, type GlossaryMessages, type LocalizableWarning, type WarningTextOptions } from './helpers'
import de from './de'
import en from './en'
import es from './es'
import fr from './fr'
import it from './it'
import pt from './pt'
import tr from './tr'

/**
 * Glosario completo y estático (7 idiomas en memoria): servidor, documentos, comandos. En la web usa
 * `useGlossary()` / `getGlossary()` de `lib/i18n`, que descargan solo el idioma en uso.
 */
export const glossary = /* @__PURE__ */ defineDictionary({ es, en, pt, fr, de, it, tr })

export {
  createGlossaryHelpers,
  DERIVED_PARAMS,
  FIX_PARAM_RENDER,
  PARAM_RENDER,
  relocalizeMm,
  type GlossaryApi,
  type GlossaryKey,
  type GlossaryMessages,
  type LocalizableWarning,
  type ParamRender,
  type WarningTextOptions,
} from './helpers'

export { glossarySource } from './source'

/** Tipologías de la galería v4 (26, mismo texto que el `name` del motor). */
export const LEGACY_TYPOLOGY_IDS = [
  'fixed',
  'casement',
  'casement_out',
  'tilt_turn',
  'tilt',
  'awning',
  'casement_double',
  'fixed_casement',
  'fixed_tilt_turn',
  'casement_transom',
  'fixed_awning_bottom',
  'fixed_3',
  'casement_fixed_casement',
  'door',
  'door_double',
  'door_sidelight',
  'door_transom',
  'arch',
  'trapezoid',
  'triangle',
  'sliding_2',
  'sliding_2_fixed',
  'sliding_3',
  'sliding_3_rail',
  'sliding_4',
  'sliding_mono',
] as const

/** Tipologías nuevas de v5 (plan §4.C, ids exactos). */
export const V5_TYPOLOGY_IDS = [
  'sliding_6',
  'sliding_3_center_fixed',
  'sliding_4_center_fixed',
  'lift_slide_2',
  'lift_slide_3',
  'lift_slide_4',
  'tilt_slide',
  'tilt_slide_2',
  'parallel_slide',
  'folding_3',
  'folding_4',
  'folding_5',
  'folding_6',
  'folding_7',
  'pivot_v',
  'pivot_h',
  'french_casement',
  'french_tilt_turn',
  'balcony_door',
  'balcony_door_double',
  'entrance_door',
  'entrance_door_sidelights',
  'door_double_sidelights',
  'fixed_tilt_turn_fixed',
  'tilt_turn_double_transom',
  'round',
  'oval',
  'pentagon',
  'octagon',
  'gable',
  'arch_segmental',
  'arch_casement',
] as const

export type GlossaryTypologyId = TypologyId | (typeof LEGACY_TYPOLOGY_IDS)[number] | (typeof V5_TYPOLOGY_IDS)[number]
/** Funciones de plan, incluidas las nuevas de v5 aunque `Feature` todavía no las tenga. */
export type GlossaryFeature = Feature | 'custom_templates' | 'texture_upload'
/** Forma para nombrar: las del motor + `arch_segmental` (arco rebajado, variante de `arch`). */
export type GlossaryShape = ShapeKind | 'arch_segmental'

// ── Completitud verificada por tsc: cada grupo tiene exactamente las claves del contrato ──
type Exactly<A extends PropertyKey, B extends PropertyKey> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const complete = {
  typology: true satisfies Exactly<keyof GlossaryMessages['typology'], GlossaryTypologyId>,
  opening: true satisfies Exactly<keyof GlossaryMessages['opening'], OpeningKind>,
  openingHint: true satisfies Exactly<keyof GlossaryMessages['openingHint'], OpeningKind>,
  shape: true satisfies Exactly<keyof GlossaryMessages['shape'], GlossaryShape>,
  slidingSystem: true satisfies Exactly<keyof GlossaryMessages['sliding']['system'], SlidingSystem>,
  rollerShutter: true satisfies Exactly<keyof GlossaryMessages['accessory']['rollerShutterType'], RollerShutterType>,
  rollerOperation: true satisfies Exactly<keyof GlossaryMessages['accessory']['rollerShutterOperation'], RollerShutterOperation>,
  insectScreen: true satisfies Exactly<keyof GlossaryMessages['accessory']['insectScreenType'], InsectScreenType>,
  leafUse: true satisfies Exactly<keyof GlossaryMessages['leafUse'], LeafUse>,
  finish: true satisfies Exactly<keyof GlossaryMessages['finish'], ColorFinish>,
  hardwareTarget: true satisfies Exactly<keyof GlossaryMessages['hardwareTarget'], HardwareTargetKind>,
  extraPlural: true satisfies Exactly<keyof GlossaryMessages['extraPlural'], ExtraKind>,
  quoteStatus: true satisfies Exactly<keyof GlossaryMessages['quoteStatus'], QuoteStatus>,
  workOrderStatus: true satisfies Exactly<keyof GlossaryMessages['workOrderStatus'], WorkOrder['status']>,
  station: true satisfies Exactly<keyof GlossaryMessages['station'], Station>,
  role: true satisfies Exactly<keyof GlossaryMessages['role'], Role>,
  roleDescription: true satisfies Exactly<keyof GlossaryMessages['roleDescription'], Role>,
  plan: true satisfies Exactly<keyof GlossaryMessages['plan'], PlanCode>,
  feature: true satisfies Exactly<keyof GlossaryMessages['feature'], GlossaryFeature>,
  profileRole: true satisfies Exactly<keyof GlossaryMessages['profileRole'], ProfileRole>,
  lineKind: true satisfies Exactly<keyof GlossaryMessages['lineKind'], LineKind>,
  glassKind: true satisfies Exactly<keyof GlossaryMessages['glassKind'], GlassKind>,
  itemKind: true satisfies Exactly<keyof GlossaryMessages['itemKind'], Item['kind']>,
  hardwareUnit: true satisfies Exactly<keyof GlossaryMessages['hardwareUnit'], HardwareUnit>,
  warningLevel: true satisfies Exactly<keyof GlossaryMessages['warningLevel'], WarningLevel>,
  warning: true satisfies Exactly<keyof GlossaryMessages['warning'], WarningCode>,
  warningGeneric: true satisfies Exactly<keyof GlossaryMessages['warningGeneric'], WarningCode>,
  warningFix: true satisfies Exactly<keyof GlossaryMessages['warningFix'], WarningFixKey>,
  profileSubject: true satisfies Exactly<keyof GlossaryMessages['profileSubject'], ProfileRole>,
  openingLimit: true satisfies Exactly<keyof GlossaryMessages['openingLimit'], OpeningLimitClass>,
  pautaField: true satisfies Exactly<keyof GlossaryMessages['pautaField'], PautaField>,
  accessoryPer: true satisfies Exactly<keyof GlossaryMessages['accessoryPer'], AccessoryPer>,
} as const
void complete

// ── Cada dato del aviso aparece en la frase en español (verificado por tsc) ──
// Los parámetros del motor son `WarningParamsMap`/`WarningFixParamsMap`; la frase española los nombra
// todos (`{nombre}` o `{nombre, select|plural, …}`). Los del paño (`paneKind`…) entran como `{pane}`
// o `{paneOf}`. Las traducciones se comparan con el español en las pruebas.
type Mentions<S extends string, P extends string> = S extends `${string}{${P}${'}' | ','}${string}` ? never : P
type Unmentioned<S extends string, P extends string> = P extends unknown ? Mentions<S, P> : never
type PaneMentioned<S extends string> = S extends `${string}{pane${'}' | 'Of}'}${string}` ? never : 'pane'
type WarningGaps = {
  [C in WarningCode]:
    | Unmentioned<GlossaryMessages['warning'][C], Exclude<AllKeys<WarningParamsMap[C]>, PaneParamKey>>
    | (PaneParamKey extends AllKeys<WarningParamsMap[C]> ? PaneMentioned<GlossaryMessages['warning'][C]> : never)
}[WarningCode]
type FixGaps = { [K in WarningFixKey]: Unmentioned<GlossaryMessages['warningFix'][K], keyof WarningFixParamsMap[K] & string> }[WarningFixKey]
const everyParamIsMentioned: [WarningGaps | FixGaps] extends [never] ? true : never = true
void everyParamIsMentioned

// ── Ayudas sobre el glosario completo (servidor, documentos, comandos) ───────
// En la web usa `useGlossary()` / `getGlossary()` de `lib/i18n`: bajan solo el idioma en uso.

const helpers = /* @__PURE__ */ createGlossaryHelpers(glossary)

/** Término del glosario por clave tipada: `glossaryTerm('business.quote', 'fr')` → «Devis». */
export function glossaryTerm(key: GlossaryKey, locale: Locale = DEFAULT_LOCALE, params?: MessageParams): string {
  return helpers.term(key, locale, params)
}

/** Nombre de una tipología (`'tilt_turn'` → «Oscilobatiente» / «Tilt and turn» / «Dreh-Kipp-Fenster»). */
export function typologyName(id: GlossaryTypologyId | string, locale: Locale = DEFAULT_LOCALE, fallback?: string): string {
  return helpers.typologyName(id, locale, fallback)
}

/** Nombre de una apertura de hoja (`'awning'` → «Proyectante»). */
export function openingName(kind: OpeningKind | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.openingName(kind, locale)
}

/** Nombre de una forma. Un arco con flecha menor que medio ancho se nombra «Arco rebajado». */
export function shapeName(kind: GlossaryShape | string, locale: Locale = DEFAULT_LOCALE, options: { segmental?: boolean } = {}): string {
  return helpers.shapeName(kind, locale, options)
}

export function quoteStatusLabel(status: QuoteStatus | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.quoteStatusLabel(status, locale)
}

export function workOrderStatusLabel(status: WorkOrder['status'] | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.workOrderStatusLabel(status, locale)
}

export function stationLabel(station: Station | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.stationLabel(station, locale)
}

export function roleName(role: Role | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.roleName(role, locale)
}

export function roleDescription(role: Role | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.roleDescription(role, locale)
}

/** Nombre visible del plan (`trial` → «Prueba Pro»). */
export function planName(code: PlanCode | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.planName(code, locale)
}

export function planTagline(code: PlanCode | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.planTagline(code, locale)
}

/** Copia de una función de plan para PlanGate, landing y facturación. */
export function featureCopy(feature: GlossaryFeature | string, locale: Locale = DEFAULT_LOCALE): { title: string; why: string } {
  return helpers.featureCopy(feature, locale)
}

export function profileRoleName(role: ProfileRole | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.profileRoleName(role, locale)
}

export function glassKindName(kind: GlassKind | string, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.glassKindName(kind, locale)
}

/** Cantidad con su unidad y plural del idioma: `unitCount('windows', 3, 'de')` → «3 Fenster». */
export function unitCount(unit: keyof GlossaryMessages['unit'], count: number, locale: Locale = DEFAULT_LOCALE): string {
  return helpers.unitCount(unit, count, locale)
}

/**
 * Texto del aviso en el idioma pedido. En español es siempre `warning.message` (el texto del motor,
 * idéntico al de hoy). En otros idiomas: el mensaje con parámetros si vienen todos, si no la versión
 * genérica del código, y si el código es desconocido, el texto del motor.
 */
export function warningMessage(warning: LocalizableWarning, locale: Locale = DEFAULT_LOCALE, options?: WarningTextOptions): string {
  return helpers.warningMessage(warning, locale, options)
}

/**
 * Como `warningMessage`, pero también en español el texto sale de la frase del glosario (no del
 * `message` del motor): sirve para verificar que ambos dicen lo mismo.
 */
export function warningText(warning: LocalizableWarning, locale: Locale = DEFAULT_LOCALE, options?: WarningTextOptions): string {
  return helpers.warningText(warning, locale, options)
}

/**
 * Etiqueta del botón de corrección de un aviso. En español, la del motor. En otros idiomas se
 * reconoce por clave (`fix.key`) o por el texto español del motor («Usar <nombre>» conserva el
 * nombre del catálogo, que no se traduce).
 */
export function warningFixLabel(warning: Pick<LocalizableWarning, 'fix'>, locale: Locale = DEFAULT_LOCALE, options?: WarningTextOptions): string | undefined {
  return helpers.warningFixLabel(warning, locale, options)
}

/** Como `warningFixLabel`, pero también en español sale del glosario (pruebas). */
export function warningFixText(warning: Pick<LocalizableWarning, 'fix'>, locale: Locale = DEFAULT_LOCALE, options?: WarningTextOptions): string | undefined {
  return helpers.warningFixText(warning, locale, options)
}
