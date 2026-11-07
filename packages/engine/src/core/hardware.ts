import type { HardwareRule, OpeningKind, SlidingSystem } from '../types'
import { formatNumber } from './format'

/** A qué se aplica una regla de herraje: aperturas de hoja, paño fijo o paneles de corredera. */
export type HardwareTargetKind = OpeningKind | 'sliding_moving' | 'sliding_fixed' | 'lift_slide_moving' | 'lift_slide_fixed' | 'vertical_moving' | 'vertical_fixed'

/** Datos de la hoja que filtran reglas más allá de su apertura. */
export interface HardwareTarget {
  /** Hoja pasiva (francesa o plegable). */
  passive?: boolean
  /** Secuencia del oscilobatiente (sin dato = gira primero). */
  sequence?: 'turn_first' | 'tilt_first'
}

const SLIDING_TARGETS: Partial<Record<HardwareTargetKind, { system: SlidingSystem; fixed: boolean }>> = {
  sliding_moving: { system: 'standard', fixed: false },
  sliding_fixed: { system: 'standard', fixed: true },
  lift_slide_moving: { system: 'lift_slide', fixed: false },
  lift_slide_fixed: { system: 'lift_slide', fixed: true },
  vertical_moving: { system: 'vertical', fixed: false },
  vertical_fixed: { system: 'vertical', fixed: true },
}

/**
 * Aperturas de v4 que una regla de corredera estándar podía listar y que, por compatibilidad,
 * siguen tomando las hojas móviles. Las aperturas nuevas (pivotantes, osciloparalela, paralela,
 * plegable) nunca contaminan una corredera.
 */
const LEGACY_MOVING = new Set<OpeningKind>(['casement', 'tilt_turn', 'tilt', 'awning', 'door'])

/**
 * Convención de `HardwareRule.openings`:
 * - practicables: aplica a las aperturas listadas; lista vacía = toda hoja que abre (no fijos);
 * - corredera: una hoja móvil toma toda regla cuya lista esté vacía o tenga alguna apertura de v4
 *   distinta de 'fixed'; un panel fijo toma solo las reglas que incluyen 'fixed';
 * - `systems`: sin dato, la regla es de corredera estándar (nunca aplica a una elevadora); con dato,
 *   solo a paneles de esos sistemas (y nunca a hojas de practicable);
 * - `leaf` y `sequence` filtran por hoja activa/pasiva y por secuencia del oscilobatiente.
 */
export function ruleApplies(rule: HardwareRule, kind: HardwareTargetKind, target: HardwareTarget = {}): boolean {
  const openings = rule.openings ?? []
  const systems = Array.isArray(rule.systems) && rule.systems.length > 0 ? rule.systems : undefined
  if (rule.leaf === 'active' && target.passive) return false
  if (rule.leaf === 'passive' && !target.passive) return false
  if (rule.sequence) {
    const sequence = target.sequence === 'tilt_first' ? 'tilt_first' : 'turn_first'
    if (rule.sequence !== sequence) return false
  }
  const sliding = SLIDING_TARGETS[kind]
  if (sliding) {
    if (systems ? !systems.includes(sliding.system) : sliding.system !== 'standard') return false
    if (sliding.fixed) return openings.includes('fixed')
    return openings.length === 0 || openings.some((k) => LEGACY_MOVING.has(k))
  }
  if (systems) return false
  if (kind === 'fixed') return openings.includes('fixed')
  return openings.length === 0 || openings.includes(kind as OpeningKind)
}

const has = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

export const inWidth = (r: HardwareRule, w: number): boolean =>
  (!has(r.minWidth) || w >= r.minWidth - 1e-9) && (!has(r.maxWidth) || w <= r.maxWidth + 1e-9)

export const inHeight = (r: HardwareRule, h: number): boolean =>
  (!has(r.minHeight) || h >= r.minHeight - 1e-9) && (!has(r.maxHeight) || h <= r.maxHeight + 1e-9)

/**
 * Cantidad de una regla para una hoja terminada de alto `h`: qty + perStep.qty por cada
 * `stepMm` (o fracción) sobre `minHeight` (umbral exacto: 800 → base, 800,1 → base + 1).
 */
export function ruleQty(rule: HardwareRule, h: number): number {
  let qty = has(rule.qty) ? rule.qty : 0
  const step = rule.perStep
  if (step && has(step.stepMm) && step.stepMm > 0 && has(step.qty)) {
    const over = Math.max(0, h - (has(rule.minHeight) ? rule.minHeight : 0))
    qty += Math.ceil(over / step.stepMm - 1e-9) * step.qty
  }
  return Math.max(0, qty)
}

export interface HardwareEvaluation {
  matched: { rule: HardwareRule; qty: number }[]
  /** Ninguna regla con rango de alto/ancho cubre la hoja: rangos que sí existen. */
  heightGap?: HardwareRange[]
  widthGap?: HardwareRange[]
  /** La línea no tiene ninguna regla para esta apertura. */
  noRules: boolean
}

export function evaluateHardware(rules: HardwareRule[], kind: HardwareTargetKind, w: number, h: number, target: HardwareTarget = {}): HardwareEvaluation {
  const applicable = rules.filter((r) => ruleApplies(r, kind, target))
  const out: HardwareEvaluation = { matched: [], noRules: applicable.length === 0 }
  const hRanged = applicable.filter((r) => has(r.minHeight) || has(r.maxHeight))
  if (hRanged.length > 0 && !hRanged.some((r) => inHeight(r, h))) {
    out.heightGap = uniqueRanges(hRanged.map((r) => [r.minHeight, r.maxHeight]))
  }
  const wRanged = applicable.filter((r) => has(r.minWidth) || has(r.maxWidth))
  if (wRanged.length > 0 && !wRanged.some((r) => inWidth(r, w))) {
    out.widthGap = uniqueRanges(wRanged.map((r) => [r.minWidth, r.maxWidth]))
  }
  for (const rule of applicable) {
    if (!inWidth(rule, w) || !inHeight(rule, h)) continue
    const qty = ruleQty(rule, h)
    if (qty > 0) out.matched.push({ rule, qty })
  }
  return out
}

function uniqueRanges(ranges: HardwareRange[]): HardwareRange[] {
  const seen = new Set<string>()
  return ranges
    .filter(([a, b]) => {
      const k = `${a ?? ''}-${b ?? ''}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((x, y) => (x[0] ?? 0) - (y[0] ?? 0))
}

/** Rango de medida de hoja en mm: [mínimo, máximo]; undefined = sin límite. */
export type HardwareRange = [number | undefined, number | undefined]

/**
 * Une rangos contiguos o solapados: si el siguiente parte a 1 mm o menos del máximo anterior
 * (600 → 600,1; 1.200 → 1.201) se leen como uno solo. Sin mínimo = desde 0; sin máximo = sin tope.
 */
export function mergeRanges(ranges: HardwareRange[]): HardwareRange[] {
  const sorted = [...ranges].sort((x, y) => (x[0] ?? -Infinity) - (y[0] ?? -Infinity))
  const out: HardwareRange[] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && (last[1] === undefined || a === undefined || a <= last[1] + 1 + 1e-9)) {
      if (last[1] !== undefined) last[1] = b === undefined ? undefined : Math.max(last[1], b)
      continue
    }
    out.push([a, b])
  }
  return out
}

/** Límite legible para taller: entero y, si queda a 1 mm de una decena, la decena (600,1 → 600; 2.001 → 2.000). */
export function humanLimit(n: number): number {
  const r = Math.round(n)
  const ten = Math.round(r / 10) * 10
  return Math.abs(r - ten) <= 1 ? ten : r
}

const limit = (n: number): string => formatNumber(humanLimit(n), 0)

/** Cobertura de unos rangos, fusionados y redondeados: «de 300 a 1.400 y desde 1.600 mm». */
export function rangesText(ranges: HardwareRange[]): string {
  const parts = mergeRanges(ranges).map(([a, b]) => {
    if (has(a) && has(b)) return `de ${limit(a)} a ${limit(b)}`
    if (has(a)) return `desde ${limit(a)}`
    if (has(b)) return `hasta ${limit(b)}`
    return 'cualquier medida'
  })
  if (parts.length === 1 && parts[0] === 'cualquier medida') return parts[0]
  const joined = parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1]
  return `${joined} mm`
}

/**
 * El hueco donde cae una medida sin herraje, contado por sus bordes: «cubre hasta 1.400 y
 * desde 1.600» (entre dos rangos), «cubre hasta 2.000» (más grande que todo) o «cubre desde
 * 300» (más chica que todo). Sin bordes claros, la cobertura completa.
 */
export function gapText(ranges: HardwareRange[], value: number): string {
  const { below, above } = gapBounds(ranges, value)
  if (below !== undefined && above !== undefined) return `cubre hasta ${limit(below)} y desde ${limit(above)}`
  if (below !== undefined) return `cubre hasta ${limit(below)}`
  if (above !== undefined) return `cubre desde ${limit(above)}`
  return `cubre ${rangesText(ranges)}`
}

/** Los bordes del hueco donde cae `value`: el máximo más cercano por debajo y el mínimo más cercano por encima. */
export function gapBounds(ranges: HardwareRange[], value: number): { below?: number; above?: number } {
  let below: number | undefined
  let above: number | undefined
  for (const [a, b] of ranges) {
    if (has(b) && b < value && (below === undefined || b > below)) below = b
    if (has(a) && a > value && (above === undefined || a < above)) above = a
  }
  return { below, above }
}

/** El mismo hueco como datos de aviso (`hardware_out_of_range`): bordes redondeados a la decena, como `gapText`. */
export type GapCoverage =
  | { coverage: 'between'; below: number; above: number }
  | { coverage: 'upto'; below: number }
  | { coverage: 'from'; above: number }
  /** Sin bordes claros (no ocurre con rangos válidos): el aviso lo dice sin cifras. */
  | { coverage: 'any' }

export function gapCoverage(ranges: HardwareRange[], value: number): GapCoverage {
  const { below, above } = gapBounds(ranges, value)
  if (below !== undefined && above !== undefined) return { coverage: 'between', below: humanLimit(below), above: humanLimit(above) }
  if (below !== undefined) return { coverage: 'upto', below: humanLimit(below) }
  if (above !== undefined) return { coverage: 'from', above: humanLimit(above) }
  return { coverage: 'any' }
}

export const HARDWARE_KIND_NAMES: Record<HardwareTargetKind, string> = {
  fixed: 'paños fijos',
  casement: 'hojas abatibles',
  tilt_turn: 'oscilobatientes',
  tilt: 'oscilantes',
  awning: 'proyectantes',
  door: 'puertas',
  pivot_v: 'pivotantes verticales',
  pivot_h: 'pivotantes horizontales',
  tilt_slide: 'osciloparalelas',
  parallel_slide: 'correderas paralelas',
  folding: 'hojas plegables',
  sliding_moving: 'hojas de corredera',
  sliding_fixed: 'paños fijos de corredera',
  lift_slide_moving: 'hojas de corredera elevadora',
  lift_slide_fixed: 'paños fijos de corredera elevadora',
  vertical_moving: 'hojas de guillotina',
  vertical_fixed: 'paños fijos de guillotina',
}
