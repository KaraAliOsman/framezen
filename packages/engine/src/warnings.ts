/**
 * Avisos tipados del motor.
 *
 * Cada aviso lleva `code` (estable) y `message` (texto en español, igual que siempre) y, además,
 * `params`: los datos del aviso en bruto (medidas en mm, importes, ids, nombres del catálogo) para
 * que las interfaces, los documentos y el asistente puedan decir lo mismo en otro idioma con el
 * glosario (`warningMessage` de `@dekopen/shared`). Los parámetros son pequeños y serializables
 * (texto o número); las medidas viajan sin formato y el glosario las formatea según el idioma.
 *
 * - `WarningParamsMap` declara los parámetros de cada código. Los avisos del motor se construyen con
 *   `warning(...)` / `WarningSink.add(...)`, que exigen exactamente esos parámetros.
 * - Una corrección en un clic (`fix`) lleva `key` (acción estable) y `params` (ver `WarningFixParamsMap`).
 * - `Warning` (en `types.ts`) sigue siendo la forma amplia que consumen todos; esto es la forma estricta.
 */
import type { OpeningLimitClass } from './core/defaults'
import type { HardwareTargetKind } from './core/hardware'
import type { PAUTA_LABELS } from './core/pauta'
import type { ExtraKind, Id, Item, ProfileRole, Warning, WarningLevel, WindowDesign } from './types'

// ─── Piezas comunes ──────────────────────────────────────────────────────────

/** Valor de un parámetro: texto o número (serializable). */
export type WarningParamValue = string | number

/** Qué es el paño del que habla el aviso. */
export type PaneKind = 'sash' | 'fixed' | 'door'
export type PaneVertical = 'top' | 'bottom' | 'middle'
export type PaneHorizontal = 'left' | 'right' | 'center'

/** Referencia estructurada a un paño («la hoja superior izquierda 2»). */
export interface PaneRef {
  kind: PaneKind
  v?: PaneVertical
  h?: PaneHorizontal
  /** Número cuando hay varios iguales («hoja izquierda 2», «hoja 4» en una corredera de 6). */
  n?: number
}

/**
 * Un paño dentro de los parámetros de un aviso. Todos los campos van siempre: `'none'` y `0`
 * significan «sin dato». El glosario arma con ellos el nombre del paño en cada idioma (`{pane}` al
 * inicio de la frase y `{paneOf}` dentro de ella).
 */
export type PaneParams = {
  paneKind: PaneKind
  paneV: PaneVertical | 'none'
  paneH: PaneHorizontal | 'none'
  paneN: number
}

/** Claves de `PaneParams` (el glosario no las usa tal cual: usa `{pane}` y `{paneOf}`). */
export type PaneParamKey = keyof PaneParams

export function paneParams(ref: PaneRef): PaneParams {
  return { paneKind: ref.kind, paneV: ref.v ?? 'none', paneH: ref.h ?? 'none', paneN: ref.n ?? 0 }
}

/** Valores posibles de `dir` (orientación de una unión). */
export type JointDir = 'vertical' | 'horizontal'
/** Eje de una medida: ancho o alto. */
export type Dimension = 'width' | 'height'

/** Nombre de cada valor de la pauta que puede faltar (`pauta_incomplete.fields`). */
export type PautaField = keyof typeof PAUTA_LABELS

// ─── Parámetros por código ───────────────────────────────────────────────────

type None = undefined

/**
 * Parámetros de cada aviso, por `code`. Reglas de la casa:
 * - medidas en mm y superficies en m², sin formato; porcentajes 0–100; importes en la moneda del cálculo;
 * - nombres del catálogo (línea, color, perfil, vidrio) tal cual: no se traducen;
 * - ids de apertura, rol, extra… como ids: el glosario los nombra en cada idioma;
 * - un parámetro opcional falta cuando el dato no existe: el glosario cae entonces a la versión genérica.
 * Los códigos con varias frases llevan `variant` (o un campo equivalente) que elige la frase.
 */
export type WarningParamsMap = {
  // ── Diseño y catálogo ──
  /** `design`: el despiece no halló la línea; `pricing`: el precio no la halló (se cotiza sin descuentos de marca). */
  line_missing: { source: 'design' | 'pricing' }
  /** `fields`: ids de `PautaField` separados por coma. */
  pauta_incomplete: { line: string; fields: string }
  size_invalid: None
  threshold_missing: { kind: 'lift_slide' | 'door'; line?: string }
  color_not_in_line: { line: string; color?: string }
  color_missing: None
  /** `target`: el tipo de línea que pide el diseño (`sliding` = la línea es de corredera y la ventana practicable). */
  line_kind_mismatch: { target: 'sliding' | 'casement'; line: string }
  sliding_nested: None
  french_needs_sashes: { dir: JointDir }
  fold_needs_folding_leaves: { dir: JointDir }
  folding_needs_chain: None
  folding_groups: None
  shape_not_fixed: None
  arch_bending: { radius: number }
  shape_bending: { shape: 'round' | 'oval'; radius: number }
  round_not_square: { width: number; height: number }
  profile_missing: { role: ProfileRole; line: string }

  // ── Despiece ──
  reinforcement_deduction_missing: { deduction: number; profile?: string }
  reinforcement_profile_missing: { profile?: string }
  glass_missing: None
  item_missing: { kind: 'hardware' | 'accessory'; line: string; code: string }
  /** `fit`: la medida no alcanza; `outside`: el paño queda fuera de la forma; `sliding`: corredera muy angosta para `panels` hojas. */
  pane_impossible: PaneParams & ({ variant: 'fit' | 'outside' } | { variant: 'sliding'; panels: number })
  sliding_panels: None
  sliding_too_many_panels: { count: number; max: number }
  sliding_no_moving: None
  sliding_mono_estimated: None
  /** `rules`: la línea no tiene reglas de herrajes; `target`: no tiene herrajes para ese tipo de hoja. */
  hardware_missing: { variant: 'rules'; line: string } | { variant: 'target'; line: string; target: HardwareTargetKind }
  /**
   * Hojas de una medida sin herraje. `size` es la medida de la hoja en `dim`; `below`/`above` son los
   * bordes del hueco, ya redondeados a la decena (`upto`: cubre hasta `below`; `from`: cubre desde `above`;
   * `any`: sin bordes claros, no ocurre con rangos válidos).
   */
  hardware_out_of_range: { line: string; size: number; dim: Dimension; count: number } & (
    | { coverage: 'between'; below: number; above: number }
    | { coverage: 'upto'; below: number }
    | { coverage: 'from'; above: number }
    | { coverage: 'any' }
  )
  extra_rules_missing: { line: string; extra: ExtraKind }
  /** Hay paneles ciegos y la línea no tiene ninguna regla de accesorio de paneles. */
  panel_rules_missing: { line: string }
  /** Hay celosías y la línea no tiene ninguna regla de accesorio de celosías. */
  louver_rules_missing: { line: string }
  /** La línea no trae hoja de guillotina. */
  vertical_slide_unsupported: { line: string }
  /** El zócalo pedido no cabe en la hoja: se calculó sin zócalo. */
  zocalo_invalid: { height: number; max: number }
  /** Doble hoja sin `frenchGap` en la pauta: la hoja se calculó hasta el eje. */
  french_gap_missing: { line: string }
  /** Ningún junquillo de la línea calza con el espesor del vidrio. */
  bead_no_fit: { line: string; thickness: number }
  /** El vidrio es más grueso o delgado que lo que admite la línea. */
  glazing_out_of_range: { line: string; thickness: number; min: number; max: number }
  /** Hoja fuera del límite publicado por el fabricante. */
  supplier_limit_exceeded: PaneParams & { line: string; width: number; height: number; minW: number; maxW: number; minH: number; maxH: number }
  /** El perfil no trae largo de barra: el optimizador usa el de los ajustes del taller. */
  bar_length_missing: { profile: string }
  /** Ni el perfil ni los ajustes del taller dan el largo de barra: sus cortes no se optimizan. */
  bar_length_unknown: { profile: string }
  /** La pieza de contorno elegida ya no está en la línea. */
  frame_addon_missing: { line: string }
  /** Conjunto: la línea no trae la pieza de esa unión. `flat` = acople; `corner` = poste para `angle`. */
  assembly_joint_missing: { variant: 'flat'; line: string; joint: string } | { variant: 'corner'; line: string; joint: string; angle: number }
  assembly_post_unverified: { profile: string }
  assembly_post_no_steel: { profile: string }
  assembly_coupler_no_face: { profile: string }
  assembly_mixed_systems: { joint: string; a: string; b: string }
  assembly_no_contact: { joint: string }
  accessory_rule_unknown: { line: string; item?: string }
  /** Hoja fuera del rango típico de su herraje (`limit`); las medidas son de la hoja terminada. */
  opening_too_large: OpeningLimitParams
  opening_too_small: OpeningLimitParams
  element_too_large: { kind: 'lift_slide' | 'folding'; width: number; max: number }
  pane_small: PaneParams & { size: number; dim: Dimension }
  /** `dvh`: termopanel demasiado grande; `mono`: monolítico delgado demasiado grande (`thickness` en mm). */
  glass_too_big: PaneParams & { area: number; max: number } & ({ variant: 'dvh' } | { variant: 'mono'; thickness: number })

  // ── Precio ──
  price_missing_profile: { variant: 'reinforcement'; code: string } | { variant: 'profile'; code: string; color?: string }
  price_missing_glass: { glass: string }
  price_missing_item: { kind: Item['kind']; code: string; name: string }
  /**
   * `many`: más de tres materiales sin precio (`shown` = los dos primeros, `rest` = los demás).
   * `one`: un material; `ref` lo identifica (código, nombre) y `issue` dice qué le pasa (`color` solo con `no_price_color`).
   */
  price_missing:
    | { variant: 'many'; count: number; shown: string; rest: number }
    | {
        variant: 'one'
        kind: 'profile' | 'reinforcement' | 'glass' | 'hardware' | 'accessory' | 'consumable' | 'other'
        issue: 'not_in_catalog' | 'no_price' | 'no_price_color' | 'no_price_m2'
        ref: string
        color?: string
      }
  qty_invalid: None
  /** `low`: margen negativo (se usó 0 %); `high`: sobre 95 % (se usó 95 %). */
  margin_invalid: { variant: 'low' | 'high'; pct: number }
  manual_price_invalid: None
  manual_price: { price: number }
  below_cost: { price: number; cost: number; loss: number }
  /** `labor`: sin materiales pero con mano de obra; `empty`: la ventana no tiene medida. */
  no_materials: { variant: 'empty' | 'labor' }
  /** Queda fuera del total hasta tener precio. `shown`: lo primero que falta; `rest`: cuánto más. */
  price_pending: { scope: 'item' | 'part'; shown: string; rest: number }

  // ── Optimizador de cortes ──
  piece_too_long: { length: number; bar: number; needed: number } & ({ variant: 'plain' } | { variant: 'labeled'; label: string })
  too_many_units: { piece: string; qty: number; max: number }
  invalid_piece: { count: number }
  bom_failed: None
}

/** Parámetros de `opening_too_large` y `opening_too_small` (misma frase, distinto código). */
export type OpeningLimitParams = PaneParams & {
  limit: OpeningLimitClass
  width: number
  height: number
  minW: number
  maxW: number
  minH: number
  maxH: number
}

/** Código de un aviso del motor. */
export type WarningCode = keyof WarningParamsMap

/** Parámetros del código `C` (cualquier variante). */
export type WarningParams<C extends WarningCode = WarningCode> = WarningParamsMap[C]

/** Nombres de las claves de una unión de variantes (`keyof` solo daría las comunes). */
export type AllKeys<T> = T extends unknown ? keyof T & string : never

// ─── Correcciones ────────────────────────────────────────────────────────────

/**
 * Parámetros de cada corrección en un clic (`fix.key`). El texto español de `fix.label` no cambia.
 * `use` nombra algo del catálogo (vidrio, color); `square` deja la ventana cuadrada.
 */
export type WarningFixParamsMap = {
  use: { name: string }
  use_first_color: None
  to_sliding: None
  to_casement: None
  use_mullion: None
  make_fixed: None
  square: { width: number; height: number }
}

export type WarningFixKey = keyof WarningFixParamsMap

type FixOf<K extends WarningFixKey> = WarningFixParamsMap[K] extends undefined
  ? { label: string; key: K; params?: undefined; patch: Partial<WindowDesign> }
  : { label: string; key: K; params: WarningFixParamsMap[K]; patch: Partial<WindowDesign> }

/** Corrección tipada: la acción (`key`) decide los parámetros. */
export type TypedFix = { [K in WarningFixKey]: FixOf<K> }[WarningFixKey]

// ─── Aviso estricto ──────────────────────────────────────────────────────────

type WarningOf<C extends WarningCode> = {
  level: WarningLevel
  code: C
  message: string
  nodeId?: Id
  fix?: TypedFix
} & (WarningParamsMap[C] extends undefined ? { params?: undefined } : { params: WarningParamsMap[C] })

/** Aviso con parámetros exactos para su código: es lo que produce el motor. Asignable a `Warning`. */
export type TypedWarning = { [C in WarningCode]: WarningOf<C> }[WarningCode]

/** Verifica un aviso contra `WarningParamsMap` y lo devuelve como `Warning` (forma amplia). */
export function warning(w: TypedWarning): Warning {
  return w
}

/** Compilación: cada aviso estricto cabe en la forma amplia `Warning`. */
const STRICT_FITS_LOOSE: TypedWarning extends Warning ? true : never = true
void STRICT_FITS_LOOSE

// ─── Registro de códigos ─────────────────────────────────────────────────────

/**
 * Registro de todos los códigos: `true` si el aviso lleva `params`. Tiene que coincidir con
 * `WarningParamsMap` (tsc lo exige en las dos direcciones), así que sirve de lista canónica de
 * códigos para el glosario y las pruebas.
 */
export const WARNING_HAS_PARAMS = {
  line_missing: true,
  pauta_incomplete: true,
  size_invalid: false,
  threshold_missing: true,
  color_not_in_line: true,
  color_missing: false,
  line_kind_mismatch: true,
  sliding_nested: false,
  french_needs_sashes: true,
  fold_needs_folding_leaves: true,
  folding_needs_chain: false,
  folding_groups: false,
  shape_not_fixed: false,
  arch_bending: true,
  shape_bending: true,
  round_not_square: true,
  profile_missing: true,
  reinforcement_deduction_missing: true,
  reinforcement_profile_missing: true,
  glass_missing: false,
  item_missing: true,
  pane_impossible: true,
  sliding_panels: false,
  sliding_too_many_panels: true,
  sliding_no_moving: false,
  sliding_mono_estimated: false,
  hardware_missing: true,
  hardware_out_of_range: true,
  extra_rules_missing: true,
  panel_rules_missing: true,
  louver_rules_missing: true,
  vertical_slide_unsupported: true,
  zocalo_invalid: true,
  frame_addon_missing: true,
  french_gap_missing: true,
  bar_length_missing: true,
  bar_length_unknown: true,
  bead_no_fit: true,
  glazing_out_of_range: true,
  supplier_limit_exceeded: true,
  assembly_joint_missing: true,
  assembly_post_unverified: true,
  assembly_post_no_steel: true,
  assembly_coupler_no_face: true,
  assembly_mixed_systems: true,
  assembly_no_contact: true,
  accessory_rule_unknown: true,
  opening_too_large: true,
  opening_too_small: true,
  element_too_large: true,
  pane_small: true,
  glass_too_big: true,
  price_missing_profile: true,
  price_missing_glass: true,
  price_missing_item: true,
  price_missing: true,
  qty_invalid: false,
  margin_invalid: true,
  manual_price_invalid: false,
  manual_price: true,
  below_cost: true,
  no_materials: true,
  price_pending: true,
  piece_too_long: true,
  too_many_units: true,
  invalid_piece: true,
  bom_failed: false,
} as const satisfies { [C in WarningCode]: WarningParamsMap[C] extends undefined ? false : true }

/** Todos los códigos de aviso del motor. */
export const WARNING_CODES = Object.keys(WARNING_HAS_PARAMS) as WarningCode[]

/** Registro de las correcciones: `true` si la corrección lleva `params` (tsc lo compara con `WarningFixParamsMap`). */
export const WARNING_FIX_HAS_PARAMS = {
  use: true,
  use_first_color: false,
  to_sliding: false,
  to_casement: false,
  use_mullion: false,
  make_fixed: false,
  square: true,
} as const satisfies { [K in WarningFixKey]: WarningFixParamsMap[K] extends undefined ? false : true }

/** Todas las claves de corrección. */
export const WARNING_FIX_KEYS = Object.keys(WARNING_FIX_HAS_PARAMS) as WarningFixKey[]
