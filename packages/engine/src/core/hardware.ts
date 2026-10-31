import type { HardwareRule, OpeningKind } from '../types'
import { formatNumber } from './format'

/** A qué se aplica una regla de herraje: aperturas de hoja, paño fijo o paneles de corredera. */
export type HardwareTargetKind = OpeningKind | 'sliding_moving' | 'sliding_fixed'

/**
 * Convención de `HardwareRule.openings`:
 * - practicables: aplica a las aperturas listadas; lista vacía = toda hoja que abre (no fijos);
 * - corredera: una hoja móvil toma toda regla cuya lista esté vacía o tenga alguna apertura
 *   distinta de 'fixed'; un panel fijo toma solo las reglas que incluyen 'fixed'.
 */
export function ruleApplies(rule: HardwareRule, kind: HardwareTargetKind): boolean {
  const openings = rule.openings ?? []
  if (kind === 'sliding_moving') return openings.length === 0 || openings.some((k) => k !== 'fixed')
  if (kind === 'sliding_fixed' || kind === 'fixed') return openings.includes('fixed')
  return openings.length === 0 || openings.includes(kind)
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

export function evaluateHardware(rules: HardwareRule[], kind: HardwareTargetKind, w: number, h: number): HardwareEvaluation {
  const applicable = rules.filter((r) => ruleApplies(r, kind))
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
  let below: number | undefined
  let above: number | undefined
  for (const [a, b] of ranges) {
    if (has(b) && b < value && (below === undefined || b > below)) below = b
    if (has(a) && a > value && (above === undefined || a < above)) above = a
  }
  if (below !== undefined && above !== undefined) return `cubre hasta ${limit(below)} y desde ${limit(above)}`
  if (below !== undefined) return `cubre hasta ${limit(below)}`
  if (above !== undefined) return `cubre desde ${limit(above)}`
  return `cubre ${rangesText(ranges)}`
}

export const HARDWARE_KIND_NAMES: Record<HardwareTargetKind, string> = {
  fixed: 'paños fijos',
  casement: 'hojas abatibles',
  tilt_turn: 'oscilobatientes',
  tilt: 'oscilantes',
  awning: 'proyectantes',
  door: 'puertas',
  sliding_moving: 'hojas de corredera',
  sliding_fixed: 'paños fijos de corredera',
}
