import type {
  Bar,
  BarCut,
  CutSettings,
  Id,
  OptimizationGroup,
  OptimizationResult,
  OptimizerPiece,
  Warning,
} from '../types'
import { warning } from '../warnings'
import { sanitizeCut } from './defaults'
import { formatMM, roundHalfUp } from './format'

/** Pieza para el optimizador con datos opcionales del grupo (perfil, color, barra propia). */
export interface CutPieceInput extends OptimizerPiece {
  code?: string
  name?: string
  colorId?: Id
  /** Largo de barra de este perfil (si no, el de los ajustes). */
  barLength?: number
}

/** Retazo disponible en bodega para una clave (perfil + color). */
export interface Offcut {
  key: string
  length: number
}

/** Resultado del optimizador con avisos (piezas más largas que la barra, datos inválidos). */
export interface CutPlan extends OptimizationResult {
  warnings: Warning[]
}

/** Grupos con hasta este número de piezas se resuelven con búsqueda exacta. */
const EXACT_MAX_PIECES = 12
/** Tope de pasos de la búsqueda exacta: si se supera, queda Best-Fit Decreasing. */
const EXACT_BUDGET = 150_000
/** Tope de unidades por pieza para no congelar la interfaz con cantidades absurdas. */
const MAX_UNITS_PER_PIECE = 10_000

interface Unit {
  length: number
  /** Largo en décimas de mm, redondeado hacia arriba (nunca falta material). */
  tenths: number
  label: string
  ref?: string
  angleStart?: number
  angleEnd?: number
  seq: number
}

interface WorkBar {
  barLength: number
  fromOffcut: boolean
  units: Unit[]
}

interface GroupDraft {
  key: string
  code?: string
  name?: string
  colorId?: Id
  barLength?: number
  units: Unit[]
}

const toTenths = (mm: number) => Math.round(mm * 10)

/**
 * Décimas de mm que ocupa el disco en el eje de la barra después de una pieza: a 90° su espesor y
 * en inglete `kerf / sen(ángulo)` (4 mm a 45° son 5,66 mm), hacia arriba para que nunca falte material.
 */
function kerfTenths(kerf: number, angle: number | undefined): number {
  if (angle === undefined || !Number.isFinite(angle) || angle <= 0.5 || angle >= 89.95) return toTenths(kerf)
  return Math.ceil((kerf * 10) / Math.sin((angle * Math.PI) / 180) - 1e-6)
}
const ceilTenths = (mm: number) => Math.ceil(mm * 10 - 1e-6)
const round1 = (n: number) => roundHalfUp(n, 1)
const round2 = (n: number) => roundHalfUp(n, 2)

function compareText(a: string | undefined, b: string | undefined): number {
  const x = a ?? ''
  const y = b ?? ''
  return x < y ? -1 : x > y ? 1 : 0
}

/** Orden determinista: más largas primero; empate por etiqueta, referencia y orden de entrada. */
function compareUnits(a: Unit, b: Unit): number {
  return b.tenths - a.tenths || compareText(a.label, b.label) || compareText(a.ref, b.ref) || a.seq - b.seq
}

/** Clave por defecto «código|color» → código y color para mostrar si no vienen en la pieza. */
function splitKey(key: string): { code: string; colorId?: string } {
  const at = key.indexOf('|')
  if (at < 0) return { code: key }
  const colorId = key.slice(at + 1)
  return { code: key.slice(0, at), colorId: colorId || undefined }
}

/** Best-Fit Decreasing: cada pieza a la barra abierta con menor sobrante ≥ 0 (empate: la primera). */
function bestFitDecreasing(sizes: number[], capacity: number): number[] {
  const free: number[] = []
  const assign: number[] = []
  for (let i = 0; i < sizes.length; i++) {
    let best = -1
    let bestRest = Infinity
    for (let b = 0; b < free.length; b++) {
      const rest = free[b] - sizes[i]
      if (rest >= 0 && rest < bestRest) {
        best = b
        bestRest = rest
      }
    }
    if (best < 0) {
      free.push(capacity - sizes[i])
      assign.push(free.length - 1)
    } else {
      free[best] -= sizes[i]
      assign.push(best)
    }
  }
  return assign
}

/**
 * Búsqueda exacta (ramificación y poda) del mínimo de barras. Devuelve una asignación con
 * menos barras que `upper`, o null si no existe o se agota el presupuesto.
 */
function exactPack(sizes: number[], capacity: number, upper: number): number[] | null {
  const n = sizes.length
  const total = sizes.reduce((a, b) => a + b, 0)
  const lowerBound = Math.ceil(total / capacity)
  if (lowerBound >= upper) return null
  const suffix = new Array<number>(n + 1).fill(0)
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + sizes[i]
  const free: number[] = []
  const assign = new Array<number>(n).fill(0)
  let freeTotal = 0
  let best = upper
  let bestAssign: number[] | null = null
  let steps = 0

  const search = (i: number): boolean => {
    if (++steps > EXACT_BUDGET) return true
    if (i === n) {
      if (free.length < best) {
        best = free.length
        bestAssign = assign.slice()
      }
      return best <= lowerBound
    }
    const extraBars = Math.max(0, Math.ceil((suffix[i] - freeTotal) / capacity))
    if (free.length + extraBars >= best) return false
    const size = sizes[i]
    const tried = new Set<number>()
    for (let b = 0; b < free.length; b++) {
      const room = free[b]
      if (room < size || tried.has(room)) continue
      tried.add(room)
      free[b] = room - size
      freeTotal -= size
      assign[i] = b
      if (search(i + 1)) return true
      free[b] = room
      freeTotal += size
    }
    if (free.length + 1 < best) {
      free.push(capacity - size)
      freeTotal += capacity - size
      assign[i] = free.length - 1
      if (search(i + 1)) return true
      free.pop()
      freeTotal -= capacity - size
    }
    return false
  }

  search(0)
  return bestAssign
}

function finishBar(key: string, bar: WorkBar, cut: CutSettings): Bar {
  const units = [...bar.units].sort(compareUnits)
  let cursor = cut.trimStart
  const cuts: BarCut[] = units.map((u) => {
    const piece: BarCut = { length: u.length, label: u.label, offset: round1(cursor) }
    if (u.ref !== undefined) piece.ref = u.ref
    if (u.angleStart !== undefined) piece.angleStart = u.angleStart
    if (u.angleEnd !== undefined) piece.angleEnd = u.angleEnd
    cursor += u.length + kerfTenths(cut.kerf, u.angleEnd) / 10
    return piece
  })
  const used = units.reduce((sum, u) => sum + u.length, 0)
  const kerfLoss = units.reduce((sum, u) => sum + kerfTenths(cut.kerf, u.angleEnd) / 10, 0)
  const remainder = Math.max(0, bar.barLength - cut.trimStart - cut.trimEnd - used - kerfLoss)
  return {
    key,
    barLength: bar.barLength,
    fromOffcut: bar.fromOffcut,
    cuts,
    used: round1(used),
    kerfLoss: round1(kerfLoss),
    remainder: round1(remainder),
    yieldPct: bar.barLength > 0 ? round2((used / bar.barLength) * 100) : 0,
  }
}

function optimizeGroup(
  group: GroupDraft,
  baseCut: CutSettings,
  offcuts: readonly Offcut[],
  warnings: Warning[],
): OptimizationGroup {
  const cut: CutSettings = { ...baseCut, barLength: group.barLength && group.barLength > 0 ? group.barLength : baseCut.barLength }
  const trims10 = toTenths(cut.trimStart) + toTenths(cut.trimEnd)
  const usable10 = toTenths(cut.barLength) - trims10
  const size = (u: Unit) => u.tenths + kerfTenths(cut.kerf, u.angleEnd)

  let pending = [...group.units].sort(compareUnits)
  const bars: WorkBar[] = []

  // 1) Retazos primero, del más corto al más largo, llenados con las piezas más largas que caben.
  const mine = offcuts
    .map((o, i) => ({ ...o, i }))
    .filter((o) => o.key === group.key && Number.isFinite(o.length) && o.length > 0)
    .sort((a, b) => a.length - b.length || a.i - b.i)
  for (const offcut of mine) {
    if (pending.length === 0) break
    let room = toTenths(offcut.length) - trims10
    const placed: Unit[] = []
    const rest: Unit[] = []
    for (const unit of pending) {
      if (size(unit) <= room) {
        placed.push(unit)
        room -= size(unit)
      } else rest.push(unit)
    }
    if (placed.length > 0) {
      bars.push({ barLength: offcut.length, fromOffcut: true, units: placed })
      pending = rest
    }
  }

  // Sin largo de barra del perfil ni de Ajustes no hay barra que calcular: se avisa, no se supone una.
  if (!(cut.barLength > 0)) {
    if (pending.length > 0) {
      const profile = group.code || group.key
      warnings.push(
        warning({
          level: 'warn',
          code: 'bar_length_unknown',
          message: `${profile} no tiene largo de barra ni en el catálogo ni en Ajustes › Taller: sus cortes no se optimizaron.`,
          params: { profile },
        }),
      )
    }
    pending = []
  }

  // 2) Piezas más largas que la barra: barra especial y aviso (nunca excepción).
  const oversize = pending.filter((u) => size(u) > usable10)
  pending = pending.filter((u) => size(u) <= usable10)
  for (const unit of oversize) {
    const needed = Math.ceil(unit.length + kerfTenths(cut.kerf, unit.angleEnd) / 10 + cut.trimStart + cut.trimEnd - 1e-6)
    bars.push({ barLength: needed, fromOffcut: false, units: [unit] })
    const who = unit.label ? ` (${unit.label})` : ''
    warnings.push(
      warning({
        level: 'warn',
        code: 'piece_too_long',
        message: `La pieza de ${formatMM(unit.length)} mm${who} no cabe en una barra de ${formatMM(cut.barLength)} mm: necesitas una barra especial de al menos ${formatMM(needed)} mm.`,
        params: { length: unit.length, bar: cut.barLength, needed, ...(unit.label ? { variant: 'labeled' as const, label: unit.label } : { variant: 'plain' as const }) },
      }),
    )
  }

  // 3) Barras nuevas: Best-Fit Decreasing y, en grupos chicos, búsqueda exacta si mejora.
  if (pending.length > 0) {
    const sizes = pending.map(size)
    let assign = bestFitDecreasing(sizes, usable10)
    let count = Math.max(...assign) + 1
    let exact = false
    if (pending.length <= EXACT_MAX_PIECES && count > 1) {
      const better = exactPack(sizes, usable10, count)
      if (better) {
        assign = better
        count = Math.max(...better) + 1
        exact = true
      }
    }
    const fresh: WorkBar[] = Array.from({ length: count }, () => ({ barLength: cut.barLength, fromOffcut: false, units: [] }))
    pending.forEach((unit, i) => fresh[assign[i]].units.push(unit))
    if (exact) {
      // Barras más llenas primero para que el plan se lea igual que el voraz.
      const usedOf = (b: WorkBar) => b.units.reduce((s, u) => s + u.tenths, 0)
      fresh.sort((a, b) => usedOf(b) - usedOf(a) || compareUnits(a.units[0], b.units[0]))
    }
    bars.push(...fresh)
  }

  const finished = bars.map((bar) => finishBar(group.key, bar, cut))
  const totalUsed = finished.reduce((s, b) => s + b.used, 0)
  const totalLength = finished.reduce((s, b) => s + b.barLength, 0)
  const fallback = splitKey(group.key)
  const result: OptimizationGroup = {
    key: group.key,
    code: group.code ?? fallback.code,
    name: group.name ?? group.code ?? fallback.code,
    bars: finished,
    pieces: group.units.length,
    yieldPct: totalLength > 0 ? round2((totalUsed / totalLength) * 100) : 0,
    barsNeeded: finished.filter((b) => !b.fromOffcut).length,
  }
  const colorId = group.colorId ?? fallback.colorId
  if (colorId !== undefined) result.colorId = colorId
  return result
}

/** Suma totales de grupos ya optimizados (sirve para unir planes con ajustes distintos). */
export function summarizePlan(groups: OptimizationGroup[], offcuts: Offcut[], warnings: Warning[]): CutPlan {
  let used = 0
  let length = 0
  for (const g of groups) for (const b of g.bars) {
    used += b.used
    length += b.barLength
  }
  return {
    groups,
    totalBars: groups.reduce((s, g) => s + g.barsNeeded, 0),
    totalPieces: groups.reduce((s, g) => s + g.pieces, 0),
    yieldPct: length > 0 ? round2((used / length) * 100) : 0,
    offcuts,
    warnings,
  }
}

/** Retazos reutilizables (≥ mínimo) que deja un conjunto de grupos. */
export function reusableOffcuts(groups: OptimizationGroup[], minReusable: number): Offcut[] {
  const out: Offcut[] = []
  for (const g of groups) for (const b of g.bars) {
    if (b.remainder > 0 && b.remainder >= minReusable) out.push({ key: g.key, length: b.remainder })
  }
  return out
}

/**
 * Optimizador 1D de barras. Agrupa por `key` (perfil + color), usa primero los retazos,
 * aplica despunte de inicio y fin y cobra el disco a cada pieza (también a la última), con lo que
 * ocupa de verdad en el eje de la barra según el ángulo de su corte final.
 * Best-Fit Decreasing determinista; con ≤ 12 piezas busca el mínimo exacto de barras.
 *
 * `totalBars` cuenta las barras nuevas a comprar (sin retazos); `offcuts` son los sobrantes
 * reutilizables que genera este plan (los retazos de entrada no usados siguen en bodega).
 */
export function optimizeCuts(
  pieces: readonly CutPieceInput[],
  settings: Partial<CutSettings>,
  offcuts: readonly Offcut[] = [],
): CutPlan {
  const cut = sanitizeCut(settings)
  const warnings: Warning[] = []
  const groups = new Map<string, GroupDraft>()
  let seq = 0
  let invalid = 0

  for (const piece of pieces ?? []) {
    if (!piece || !(piece.length > 0) || !Number.isFinite(piece.length)) {
      invalid++
      continue
    }
    const rawQty = Number.isFinite(piece.qty) ? Math.round(piece.qty) : 1
    if (rawQty <= 0) continue
    const qty = Math.min(rawQty, MAX_UNITS_PER_PIECE)
    if (qty < rawQty) {
      warnings.push(
        warning({
          level: 'warn',
          code: 'too_many_units',
          message: `La pieza ${piece.label || piece.key} pide ${rawQty} unidades: se optimizaron las primeras ${MAX_UNITS_PER_PIECE}.`,
          params: { piece: piece.label || piece.key, qty: rawQty, max: MAX_UNITS_PER_PIECE },
        }),
      )
    }
    const key = String(piece.key ?? '')
    let group = groups.get(key)
    if (!group) {
      group = { key, units: [] }
      groups.set(key, group)
    }
    if (group.code === undefined && piece.code) group.code = piece.code
    if (group.name === undefined && piece.name) group.name = piece.name
    if (group.colorId === undefined && piece.colorId) group.colorId = piece.colorId
    if (group.barLength === undefined && piece.barLength && piece.barLength > 0) group.barLength = piece.barLength
    const tenths = ceilTenths(piece.length)
    for (let q = 0; q < qty; q++) {
      const unit: Unit = { length: piece.length, tenths, label: piece.label ?? '', seq: seq++ }
      if (piece.ref !== undefined) unit.ref = piece.ref
      if (piece.angleStart !== undefined) unit.angleStart = piece.angleStart
      if (piece.angleEnd !== undefined) unit.angleEnd = piece.angleEnd
      group.units.push(unit)
    }
  }

  if (invalid > 0) {
    warnings.push(
      warning({
        level: 'warn',
        code: 'invalid_piece',
        message: invalid === 1 ? 'Una pieza sin largo válido quedó fuera de la optimización.' : `${invalid} piezas sin largo válido quedaron fuera de la optimización.`,
        params: { count: invalid },
      }),
    )
  }

  const result = [...groups.values()].map((g) => optimizeGroup(g, cut, offcuts, warnings))
  return summarizePlan(result, reusableOffcuts(result, cut.minReusable), warnings)
}
