/**
 * Lectura exacta de un plan de corte: qué disco y despunte usó de verdad cada barra, qué pieza física
 * es cada corte (código V2-M03, igual que en la OT y en las etiquetas) y la auditoría que comprueba
 * que ninguna barra se sobrepasa ni sale una pieza imposible. Lo usan las hojas y la pantalla.
 *
 * Disco y despunte se leen de la barra, no de los ajustes: `planCuts` usa el mayor entre el taller y
 * la marca, y cada perfil puede salir con valores distintos a los de `data.cut`.
 */
import { assemblyUnits, pieceKey, type Bar, type BarCut, type Catalog, type CutPiece, type CutSettings, type OptimizationGroup, type Profile, type Warning, type WorkshopWindow } from '@dekopen/engine'
import { workshopPieceCodes } from './helpers'
import type { WorkshopDocumentData } from './types'

const EPS = 0.051

const round1 = (n: number) => Math.round(n * 10) / 10

export interface BarGeometry {
  barLength: number
  /** Despunte real: dónde parte la primera pieza. */
  trimStart: number
  trimEnd: number
  /** Disco real de esta barra (mm por corte). */
  kerf: number
  /** Fin de la última pieza. */
  piecesEnd: number
  remainder: number
  /** Dónde parte el sobrante. */
  remainderStart: number
  /** El sobrante alcanza el mínimo para guardarlo como retazo. */
  reusable: boolean
}

/**
 * Espesor real del disco de una barra. El optimizador cobra `disco / sen(ángulo)` por pieza,
 * redondeado hacia arriba a la décima: se deshace esa cuenta y se baja a la décima.
 */
function discOf(bar: Bar): number {
  const factor = bar.cuts.reduce((sum, c) => {
    const a = c.angleEnd
    return sum + (a === undefined || !Number.isFinite(a) || a <= 0.5 || a >= 89.95 ? 1 : 1 / Math.sin((a * Math.PI) / 180))
  }, 0)
  return Math.floor((bar.kerfLoss / factor) * 10 + 1e-6) / 10
}

/** Disco y despuntes que usó de verdad una barra, y dónde queda su sobrante. */
export function barGeometry(bar: Bar, cut: Pick<CutSettings, 'trimStart' | 'trimEnd' | 'kerf' | 'minReusable'>): BarGeometry {
  const first = bar.cuts[0]
  const last = bar.cuts[bar.cuts.length - 1]
  const trimStart = first ? first.offset : cut.trimStart
  const kerf = bar.cuts.length > 0 ? discOf(bar) : cut.kerf
  const trimEnd = cut.trimEnd
  const piecesEnd = last ? last.offset + last.length : trimStart
  const remainder = Math.max(0, bar.remainder)
  const remainderStart = Math.max(piecesEnd, bar.barLength - trimEnd - remainder)
  return { barLength: bar.barLength, trimStart, trimEnd, kerf, piecesEnd, remainder, remainderStart, reusable: remainder > 0 && remainder >= cut.minReusable }
}

/** Disco y despunte con que se cortó un perfil (los de su primera barra). */
export function groupSaw(group: OptimizationGroup, cut: CutSettings): { kerf: number; trimStart: number; trimEnd: number } {
  const bar = group.bars.find((b) => !b.fromOffcut) ?? group.bars[0]
  if (!bar) return { kerf: cut.kerf, trimStart: cut.trimStart, trimEnd: cut.trimEnd }
  const g = barGeometry(bar, cut)
  return { kerf: g.kerf, trimStart: g.trimStart, trimEnd: g.trimEnd }
}

/**
 * Lo que ocupa el disco a lo largo de la barra con un corte a `angle` grados. A 90° es el espesor del
 * disco; a 45° el mismo disco abre 1,41 veces ese espesor en el eje del perfil (4 mm → 5,66 mm).
 */
export function kerfAlongBar(kerf: number, angle: number | undefined): number {
  if (angle === undefined || !Number.isFinite(angle) || angle <= 0.5 || angle >= 89.95) return kerf
  return kerf / Math.sin((angle * Math.PI) / 180)
}

/** Largo de la cara corta de una pieza: la larga menos lo que se comen los dos ingletes. Sin cara vista, null. */
export function shortFace(length: number, face: number | undefined, angleStart: number | undefined, angleEnd: number | undefined): number | null {
  if (!(typeof face === 'number' && face > 0)) return null
  const eat = (a: number | undefined) => (a === undefined || !Number.isFinite(a) || a >= 89.95 || a <= 0.5 ? 0 : face / Math.tan((a * Math.PI) / 180))
  return length - eat(angleStart) - eat(angleEnd)
}

// ─────────────────────────────────────────────────────────────────────────────
// Perfil y pauta de un grupo
// ─────────────────────────────────────────────────────────────────────────────

/** Perfil del catálogo detrás de un grupo del plan (la clave parte con su id). */
export function groupProfile(catalog: Catalog | undefined, group: Pick<OptimizationGroup, 'key' | 'code'>): Profile | undefined {
  if (!catalog) return undefined
  const id = group.key.split('|')[0]
  return catalog.profiles.find((p) => p.id === id) ?? catalog.profiles.find((p) => p.code === group.code)
}

const WELDED_ROLES = new Set<Profile['role']>(['frame', 'sash', 'door_sash', 'sliding_frame', 'sliding_sash'])

/**
 * Sobremedida de soldadura por extremo que trae la medida de corte de este perfil, según la pauta de
 * su línea. Null si el perfil no se suelda o si no hay dato (nunca se supone).
 */
export function groupWeld(catalog: Catalog | undefined, group: OptimizationGroup): number | null {
  const profile = groupProfile(catalog, group)
  if (!profile || !WELDED_ROLES.has(profile.role)) return null
  const mitred = group.bars.some((b) => b.cuts.some((c) => (c.angleStart ?? 90) < 89.95 || (c.angleEnd ?? 90) < 89.95))
  if (!mitred) return null
  const weld = catalog?.lines.find((l) => l.id === profile.lineId)?.pauta?.weld
  return typeof weld === 'number' && Number.isFinite(weld) && weld > 0 ? weld : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedencia de los cortes
// ─────────────────────────────────────────────────────────────────────────────

export type CutOrigin = 'lista_taller' | 'sin_verificar'

export interface UnbackedLine {
  name: string
  origin: CutOrigin
}

/** Lo que este paquete necesita de `Line.provenance` (lo escribe el catálogo; aquí solo se lee). */
interface ProvenanceView {
  automatic?: boolean
  fields?: Record<string, { origin?: string } | undefined>
}

/**
 * Líneas de estas ventanas cuyos cortes no tienen respaldo del fabricante: un caso numérico o una
 * fuente que permita cortar sin revisar. Las líneas propias del taller no traen procedencia y no
 * se marcan.
 */
export function unbackedLines(catalog: Catalog | undefined, windows: readonly Pick<WorkshopWindow, 'design'>[]): UnbackedLine[] {
  if (!catalog) return []
  const ids = new Set<string>()
  for (const { design } of windows) {
    const units = assemblyUnits(design)
    if (units.length > 0) for (const unit of units) ids.add(unit.design.lineId)
    else ids.add(design.lineId)
  }
  const out: UnbackedLine[] = []
  for (const id of ids) {
    const line = catalog.lines.find((l) => l.id === id)
    const provenance = (line as { provenance?: ProvenanceView } | undefined)?.provenance
    if (!line || !provenance || provenance.automatic !== false) continue
    const origins = Object.entries(provenance.fields ?? {})
      .filter(([field]) => field.startsWith('pauta.'))
      .map(([, value]) => value?.origin)
    out.push({ name: line.name, origin: origins.length === 0 || origins.includes('sin_verificar') ? 'sin_verificar' : 'lista_taller' })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Identidad de cada pieza en las barras
// ─────────────────────────────────────────────────────────────────────────────

export interface BarPieceId {
  /** «V2-M03» o «V2-M03-R»: el mismo código de la OT y de la etiqueta. */
  code: string
  ref: string
  /** Lado de esa pieza: «arr», «izq»… */
  side: string
  /** Unidad de la ventana (1…units). */
  unit: number
  units: number
}

/** Identidad de un corte dentro del plan: perfil + color, ventana y largo. */
function cutId(ref: string | undefined, length: number, key: string): string {
  return `${key}|${ref ?? ''}|${length}`
}

/** Etiqueta con que la pieza llega a la barra: «V1 · arr/aba». */
function barLabelOf(ref: string, label: string): string {
  if (!ref) return label
  return label ? `${ref} · ${label}` : ref
}

/**
 * Código de pieza de cada corte de cada barra: `result.get(group.key)[barIndex][cutIndex]`. Reparte
 * las piezas físicas de la OT entre las barras en orden; si una no se puede identificar (datos de
 * otra versión del plan), queda `undefined` y la hoja imprime su etiqueta sin código.
 */
export function barPieceIds(data: Pick<WorkshopDocumentData, 'windows' | 'optimization'>): Map<string, (BarPieceId | undefined)[][]> {
  const pool = new Map<string, (BarPieceId & { label: string })[]>()
  for (const window of data.windows) {
    const units = Math.max(1, Math.round(window.qty) || 1)
    const pieces = workshopPieceCodes(window)
    for (let unit = 1; unit <= units; unit++) {
      for (const p of pieces) {
        const id = cutId(window.ref, p.piece.length, pieceKey(p.piece, window.design))
        const list = pool.get(id) ?? []
        list.push({ code: p.code, ref: window.ref, side: p.side, unit, units, label: barLabelOf(window.ref, p.piece.label) })
        pool.set(id, list)
      }
    }
  }
  const out = new Map<string, (BarPieceId | undefined)[][]>()
  for (const group of data.optimization.groups) {
    out.set(
      group.key,
      group.bars.map((bar) =>
        bar.cuts.map((cut) => {
          const list = pool.get(cutId(cut.ref, cut.length, group.key))
          if (!list?.length) return undefined
          // A igual largo manda la etiqueta: «arr/aba» y «izq/der» de un marco cuadrado son piezas distintas.
          const at = list.findIndex((p) => p.label === cut.label || barLabelOf(p.ref, p.side) === cut.label)
          const [hit] = list.splice(Math.max(0, at), 1)
          if (!hit) return undefined
          const { label: _label, ...id } = hit
          return id
        }),
      ),
    )
  }
  return out
}

/** Pieza de una barra para una lista: posición, código y lado. */
export interface BarPieceRow {
  n: number
  cut: BarCut
  id?: BarPieceId
}

export function barPieceRows(bar: Bar, ids: readonly (BarPieceId | undefined)[] | undefined): BarPieceRow[] {
  return bar.cuts.map((cut, i) => ({ n: i + 1, cut, id: ids?.[i] }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría del plan
// ─────────────────────────────────────────────────────────────────────────────

export type CutIssueCode =
  /** Las piezas se pasan del final útil de la barra. */
  | 'overflow'
  /** Dos piezas de una barra se pisan. */
  | 'overlap'
  /** Con el disco medido en inglete, las piezas de la barra no alcanzan. */
  | 'miter_kerf'
  /** Inglete imposible: la pieza es más corta que lo que se comen sus dos cortes. */
  | 'collapsed_miter'
  /** La pieza no cabe en la barra del perfil: el plan pide una barra que no existe en bodega. */
  | 'special_bar'
  /** Una pieza de la OT no quedó en ninguna barra. */
  | 'missing_piece'
  /** Una barra trae una pieza que la OT no pide. */
  | 'extra_piece'

export interface CutIssue {
  code: CutIssueCode
  /** Grupo (perfil + color). */
  key: string
  profile: string
  /** Número de barra (1…) dentro del grupo. */
  bar?: number
  /** Pieza: etiqueta y medida. */
  label?: string
  length?: number
  /** mm que faltan. */
  short?: number
}

/** ¿Esta barra es una «barra especial» que el optimizador inventó para una pieza que no cabe? */
export function isSpecialBar(bar: Bar, warnings: readonly Warning[] | undefined): boolean {
  if (bar.fromOffcut || bar.cuts.length !== 1) return false
  return (warnings ?? []).some((w) => w.code === 'piece_too_long' && Number(w.params?.needed) === bar.barLength && Number(w.params?.length) === bar.cuts[0]?.length)
}

function expectedPieces(windows: readonly WorkshopWindow[]): Map<string, number> {
  const expected = new Map<string, number>()
  for (const window of windows) {
    const qty = Math.max(0, Number.isFinite(window.qty) ? window.qty : 1)
    for (const piece of window.bom.cuts as CutPiece[]) {
      if (!piece || !(piece.qty > 0)) continue
      const id = cutId(window.ref, piece.length, pieceKey(piece, window.design))
      expected.set(id, (expected.get(id) ?? 0) + piece.qty * qty)
    }
  }
  return expected
}

/**
 * Comprueba el plan contra la geometría de una sierra de doble cabezal. Devuelve lista vacía si todo
 * es fabricable:
 * - ninguna barra se pasa (con despuntes y disco);
 * - ninguna pieza se pisa con la anterior;
 * - contando el disco como lo que ocupa de verdad en inglete (4 mm a 45° son 5,66 mm), las piezas alcanzan;
 * - ningún inglete colapsa (pieza más corta que lo que se comen sus dos cortes);
 * - ninguna pieza necesita una barra que no existe;
 * - sale exactamente lo que pide la OT: ni una pieza de más ni de menos.
 */
export function auditCutPlan(data: Pick<WorkshopDocumentData, 'windows' | 'cut' | 'catalog'> & { optimization: WorkshopDocumentData['optimization'] & { warnings?: readonly Warning[] } }): CutIssue[] {
  const issues: CutIssue[] = []
  const expected = expectedPieces(data.windows)
  const warnings = data.optimization.warnings
  for (const group of data.optimization.groups) {
    const profile = groupProfile(data.catalog, group)
    const base = { key: group.key, profile: group.code }
    group.bars.forEach((bar, b) => {
      const n = b + 1
      const geo = barGeometry(bar, data.cut)
      if (isSpecialBar(bar, warnings)) {
        const c = bar.cuts[0]
        issues.push({ ...base, code: 'special_bar', bar: n, label: c?.label, length: c?.length })
      }
      let needed = geo.trimStart
      bar.cuts.forEach((c, i) => {
        const prev = bar.cuts[i - 1]
        if (prev && c.offset + EPS < prev.offset + prev.length + kerfAlongBar(geo.kerf, prev.angleEnd)) issues.push({ ...base, code: 'overlap', bar: n, label: c.label, length: c.length })
        const face = shortFace(c.length, profile?.face, c.angleStart, c.angleEnd)
        if (face !== null && face <= 0) issues.push({ ...base, code: 'collapsed_miter', bar: n, label: c.label, length: c.length, short: round1(-face) })
        else if (!(c.length > 0)) issues.push({ ...base, code: 'collapsed_miter', bar: n, label: c.label, length: c.length })
        needed += c.length
        if (i < bar.cuts.length - 1) needed += kerfAlongBar(geo.kerf, c.angleEnd)
        const id = cutId(c.ref, c.length, group.key)
        const left = expected.get(id)
        if (left === undefined || left <= 0) issues.push({ ...base, code: 'extra_piece', bar: n, label: c.label, length: c.length })
        else if (left === 1) expected.delete(id)
        else expected.set(id, left - 1)
      })
      if (geo.piecesEnd + geo.trimEnd > bar.barLength + EPS) issues.push({ ...base, code: 'overflow', bar: n, short: round1(geo.piecesEnd + geo.trimEnd - bar.barLength) })
      else if (needed + geo.trimEnd > bar.barLength + EPS) issues.push({ ...base, code: 'miter_kerf', bar: n, short: round1(needed + geo.trimEnd - bar.barLength) })
    })
  }
  for (const [id, left] of expected) {
    if (left <= 0) continue
    const parts = id.split('|')
    const key = parts.slice(0, 2).join('|')
    const group = data.optimization.groups.find((g) => g.key === key)
    issues.push({ code: 'missing_piece', key, profile: group?.code ?? key, label: parts[parts.length - 2], length: Number(parts[parts.length - 1]) })
  }
  return issues
}
