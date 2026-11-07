/**
 * Filtro de los cortes por tipo de pieza. La vista, la impresión y el PDF del servidor pasan por aquí,
 * así lo que se ve es lo que sale en el papel.
 *
 * Cada barra lleva un solo perfil: filtrar es elegir grupos del plan, sin volver a optimizar. Las barras
 * no se parten: si un perfil también se usa para otra pieza, la barra sale entera, porque así se corta.
 */
import { pieceKey, summarizePlan, type CutPiece, type Warning } from '@dekopen/engine'
import type { WorkshopDocumentData } from './types'

/** Valores del parámetro `parts`, en el orden en que se muestran. */
export const CUT_PART_KINDS = ['frame', 'sash', 'mullion', 'bead', 'reinforcement', 'other'] as const
export type CutPartKind = (typeof CUT_PART_KINDS)[number]

/** A qué tipo pertenece una pieza del despiece. */
export function cutPartOf(piece: Pick<CutPiece, 'kind' | 'role'>): CutPartKind {
  if (piece.kind === 'reinforcement') return 'reinforcement'
  if (piece.kind === 'bead' || piece.role === 'bead') return 'bead'
  if (piece.role === 'frame' || piece.role === 'sliding_frame') return 'frame'
  if (piece.role === 'sash' || piece.role === 'door_sash' || piece.role === 'sliding_sash' || piece.role === 'interlock') return 'sash'
  if (piece.role === 'mullion' || piece.role === 'french_mullion') return 'mullion'
  return 'other'
}

/**
 * `parts` de una URL («sash,bead»): solo valores conocidos, sin repetir y en orden fijo. Vacío significa
 * todo, y pedir todos los tipos es lo mismo que no filtrar.
 */
export function parseCutParts(value: string | null | undefined): CutPartKind[] {
  const asked = new Set((value ?? '').split(',').map((s) => s.trim()))
  const parts = CUT_PART_KINDS.filter((kind) => asked.has(kind))
  return parts.length === CUT_PART_KINDS.length ? [] : parts
}

type PlanData = Pick<WorkshopDocumentData, 'windows' | 'optimization'>

/** Tipos de pieza de cada grupo del plan (clave de corte → tipos). */
function partsByGroup(data: PlanData): Map<string, Set<CutPartKind>> {
  const out = new Map<string, Set<CutPartKind>>()
  for (const window of data.windows) {
    for (const piece of window.bom.cuts ?? []) {
      const key = pieceKey(piece, window.design)
      const set = out.get(key) ?? new Set<CutPartKind>()
      set.add(cutPartOf(piece))
      out.set(key, set)
    }
  }
  return out
}

/** Tipos que de verdad trae este plan, en orden. */
export function availableCutParts(data: PlanData): CutPartKind[] {
  const groups = partsByGroup(data)
  const present = new Set<CutPartKind>()
  for (const group of data.optimization.groups) for (const part of groups.get(group.key) ?? []) present.add(part)
  return CUT_PART_KINDS.filter((kind) => present.has(kind))
}

/** Los mismos datos con solo los grupos pedidos y sus totales. Sin filtro devuelve el mismo objeto. */
export function filterCutParts<T extends PlanData>(data: T, parts: readonly CutPartKind[] | undefined): T {
  if (!parts?.length) return data
  const wanted = new Set(parts)
  const byGroup = partsByGroup(data)
  const opt = data.optimization
  const groups = opt.groups.filter((group) => [...(byGroup.get(group.key) ?? [])].some((part) => wanted.has(part)))
  if (groups.length === opt.groups.length) return data
  const keep = new Set(groups.map((group) => group.key))
  const warnings = (opt as { warnings?: Warning[] }).warnings ?? []
  return { ...data, optimization: summarizePlan(groups, opt.offcuts.filter((o) => keep.has(o.key)), warnings) }
}
