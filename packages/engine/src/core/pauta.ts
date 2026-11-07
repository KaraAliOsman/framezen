import type { Line, Opening, OpeningKind, Pauta } from '../types'
import { DEFAULT_PAUTA } from './defaults'

/**
 * Extensión opcional de `Line` que el núcleo entiende: pauta propia de la hoja de apertura
 * interior (`sashInProfileId`) cuando difiere de la exterior. Proline PRO02:
 * `{ beadDeduction: 107, reinforcement: { sash: 64.8 } }` (junquillo = nominal − 107,
 * refuerzo = corte − 64,8), mientras PRO521 usa nominal − 120 y corte − 146.
 */
export interface LinePautaOverrides {
  sashInPauta?: Partial<Pauta>
}

export type LineWithOverrides = Line & LinePautaOverrides

/**
 * Compatibilidad v4: `WindowDesign.extras.threshold: true` pide umbral bajo en las puertas que
 * llegan al piso (si la línea tiene perfil de umbral). Por defecto la puerta lleva marco completo,
 * como la puerta balconera de la OT 385 (V1: marco 2 × 862 + 2 × 2246). Hoy es parte de
 * `WindowExtras`; el alias queda para quien lo importaba.
 */
export interface DesignExtrasOverrides {
  threshold?: boolean
}

type BaseKey = 'weld' | 'frameDeduction' | 'sashWidth' | 'sashDeduction' | 'sashOverlap' | 'glassGap' | 'mullionDeduction'

const BASE_KEYS: BaseKey[] = ['weld', 'frameDeduction', 'sashWidth', 'sashDeduction', 'sashOverlap', 'glassGap', 'mullionDeduction']

/** Nombre de taller de cada valor de la pauta (para avisos y catálogo). */
export const PAUTA_LABELS: Record<BaseKey, string> = {
  weld: 'soldadura',
  frameDeduction: 'descuento de marco',
  sashWidth: 'ancho de hoja',
  sashDeduction: 'descuento de hoja',
  sashOverlap: 'traslapo de hoja',
  glassGap: 'holgura de vidrio',
  mullionDeduction: 'descuento de travesaño',
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Completa una pauta con valores típicos y devuelve qué faltaba. La soldadura puede ser negativa (aluminio). */
export function sanitizePauta(p?: Partial<Pauta> | null): { pauta: Pauta; missing: BaseKey[] } {
  const pauta: Pauta = { ...DEFAULT_PAUTA }
  const missing: BaseKey[] = []
  for (const key of BASE_KEYS) {
    const v = p?.[key]
    if (finite(v) && (key === 'weld' || v >= 0)) pauta[key] = v
    else missing.push(key)
  }
  if (finite(p?.beadDeduction) && p.beadDeduction >= 0) pauta.beadDeduction = p.beadDeduction
  if (finite(p?.slidingHeightAdd)) pauta.slidingHeightAdd = p.slidingHeightAdd
  if (finite(p?.frenchGap) && p.frenchGap >= 0) pauta.frenchGap = p.frenchGap
  if (finite(p?.frenchMullionDeduction) && p.frenchMullionDeduction >= 0) pauta.frenchMullionDeduction = p.frenchMullionDeduction
  if (finite(p?.thresholdGap) && p.thresholdGap >= 0) pauta.thresholdGap = p.thresholdGap
  const r = p?.reinforcement
  if (r) {
    const reinforcement: NonNullable<Pauta['reinforcement']> = {}
    if (finite(r.frame)) reinforcement.frame = r.frame
    if (finite(r.sash)) reinforcement.sash = r.sash
    if (finite(r.mullion)) reinforcement.mullion = r.mullion
    pauta.reinforcement = reinforcement
  }
  return { pauta, missing }
}

/** Superpone valores parciales (puerta, hoja interior) sobre una pauta completa. */
export function mergePauta(base: Pauta, over?: Partial<Pauta>): Pauta {
  if (!over) return base
  const out: Pauta = { ...base }
  for (const key of BASE_KEYS) {
    const v = over[key]
    if (finite(v) && (key === 'weld' || v >= 0)) out[key] = v
  }
  if (finite(over.beadDeduction) && over.beadDeduction >= 0) out.beadDeduction = over.beadDeduction
  if (finite(over.slidingHeightAdd)) out.slidingHeightAdd = over.slidingHeightAdd
  if (finite(over.frenchGap) && over.frenchGap >= 0) out.frenchGap = over.frenchGap
  if (finite(over.frenchMullionDeduction) && over.frenchMullionDeduction >= 0) out.frenchMullionDeduction = over.frenchMullionDeduction
  if (finite(over.thresholdGap) && over.thresholdGap >= 0) out.thresholdGap = over.thresholdGap
  if (over.reinforcement) {
    const r = { ...(base.reinforcement ?? {}) }
    if (finite(over.reinforcement.frame)) r.frame = over.reinforcement.frame
    if (finite(over.reinforcement.sash)) r.sash = over.reinforcement.sash
    if (finite(over.reinforcement.mullion)) r.mullion = over.reinforcement.mullion
    out.reinforcement = r
  }
  return out
}

/** Hacia dónde abre la hoja (si no se indica: proyectante hacia fuera, el resto hacia dentro). */
export function openingDirection(opening: Opening): 'in' | 'out' {
  if (opening?.direction === 'in' || opening?.direction === 'out') return opening.direction
  return opening?.kind === 'awning' ? 'out' : 'in'
}

export type SashVariant = 'window' | 'window_in' | 'door' | 'door_out'

/** Hoja de puerta: la puerta de abatir y toda hoja declarada balconera o de acceso. */
export function isDoorLeaf(opening: Opening | undefined): boolean {
  return opening?.kind === 'door' || opening?.use === 'balcony' || opening?.use === 'entrance'
}

/**
 * Hojas que suelen llegar al piso y pueden llevar umbral bajo: puertas (incluidas balconeras y de
 * acceso), plegables, osciloparalelas y correderas paralelas (productos de terraza).
 */
const FLOOR_KINDS = new Set<OpeningKind>(['door', 'folding', 'tilt_slide', 'parallel_slide'])
export function isFloorLeaf(opening: Opening | undefined): boolean {
  return !!opening && (FLOOR_KINDS.has(opening.kind) || isDoorLeaf(opening))
}

/** Qué pauta y perfil de hoja corresponde a una apertura en una línea. */
export function sashVariant(opening: Opening, line?: Line): SashVariant {
  if (isDoorLeaf(opening)) return openingDirection(opening) === 'out' && line?.doorOutProfileId ? 'door_out' : 'door'
  if (openingDirection(opening) === 'in' && line?.sashInProfileId) return 'window_in'
  return 'window'
}

/**
 * Pauta efectiva de una hoja según su variante y, si la línea los trae, sus ajustes por apertura
 * (`openingPautas`: osciloparalela, plegable, pivotante…).
 */
export function variantPauta(base: Pauta, line: Line | undefined, variant: SashVariant, kind?: OpeningKind): Pauta {
  let pauta = base
  if (variant === 'door') pauta = mergePauta(base, line?.doorPauta)
  else if (variant === 'door_out') pauta = mergePauta(mergePauta(base, line?.doorPauta), line?.doorOutPauta)
  else if (variant === 'window_in') pauta = mergePauta(base, (line as LineWithOverrides | undefined)?.sashInPauta)
  const byKind = kind ? line?.openingPautas?.[kind] : undefined
  return byKind ? mergePauta(pauta, byKind) : pauta
}

export const missingPautaLabels = (missing: BaseKey[]): string[] => missing.map((k) => PAUTA_LABELS[k])
