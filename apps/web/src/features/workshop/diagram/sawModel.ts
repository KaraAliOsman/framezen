/**
 * Datos del dibujo de la sierra: piezas reales de una ventana del catálogo (motor real, nunca una
 * muestra escrita a mano), cómo salen de la barra y la geometría de un corte a inglete.
 *
 * Disco y despunte son ajustes del taller: ningún fabricante los publica. La soldadura y los descuentos
 * vienen de la pauta de la línea, con la procedencia que trae el catálogo.
 */
import { computeBom, createDesign, optimizeCuts, type Bar, type Catalog, type CutPiece, type CutSettings, type Id, type Line, type Profile, type WindowDesign } from '@dekopen/engine'
import { cutOrigin, lineProvenance, type DataOrigin } from '@dekopen/catalog'
import { barGeometry, kerfAlongBar, type BarGeometry } from '@dekopen/documents'

export type SawParam = 'barLength' | 'kerf' | 'trimStart' | 'trimEnd' | 'minReusable' | 'weld' | 'miter' | 'steel'

/** Letra de cada parámetro: la misma en el dibujo y en su campo. */
export const SAW_LETTER: Record<SawParam, string> = { barLength: 'A', kerf: 'B', trimStart: 'C', trimEnd: 'D', minReusable: 'E', miter: 'F', weld: 'G', steel: 'H' }

export interface SawPiece {
  label: string
  length: number
  qty: number
  angleStart: number
  angleEnd: number
}

export interface SawSample {
  lineId: Id
  lineName: string
  /** Código y nombre del perfil de marco. */
  code: string
  name: string
  /** Largo propio del perfil en el catálogo, el que manda en las OT. Sin él, manda el de Ajustes. */
  stockLength: number | null
  /** Cara vista real del perfil; sin dato, null y el dibujo lo dice. */
  face: number | null
  /** Sobremedida por extremo según la pauta de la línea. */
  weld: number | null
  weldOrigin?: DataOrigin
  /** Peor origen entre los cortes de la línea. Sin procedencia = línea del taller. */
  cutOrigin?: DataOrigin
  width: number
  height: number
  pieces: SawPiece[]
  /** Refuerzo del marco, si el catálogo lo trae: código, largo y descuento sobre la pieza. */
  steel: { code: string; length: number; pieceLength: number } | null
  miter: number
}

const FRAME_ROLES = new Set<Profile['role']>(['frame', 'sliding_frame'])

function design(line: Line, catalog: Catalog, width: number, height: number): WindowDesign | null {
  const colorId = line.colorIds[0] ?? catalog.colors[0]?.id
  const glassId = catalog.glass[0]?.id
  if (!colorId || !glassId) return null
  const typology = line.kind === 'sliding' ? 'sliding_2' : 'fixed'
  try {
    return createDesign(typology, { lineId: line.id, width, height, colorId, glassId })
  } catch {
    return null
  }
}

/** Marco real de una ventana de 1.200 × 1.200 en la línea indicada, con su acero y su pauta. */
export function sawSampleOf(catalog: Catalog | undefined, lineId: Id | undefined): SawSample | null {
  if (!catalog) return null
  const line = catalog.lines.find((l) => l.id === lineId) ?? catalog.lines.find((l) => l.kind === 'casement') ?? catalog.lines[0]
  if (!line) return null
  const width = 1200
  const height = 1200
  const d = design(line, catalog, width, height)
  if (!d) return null
  let cuts: CutPiece[] = []
  try {
    cuts = computeBom(d, catalog).cuts
  } catch {
    return null
  }
  const frame = cuts.filter((c) => c.kind === 'profile' && FRAME_ROLES.has(c.role))
  const first = frame[0]
  if (!first) return null
  const profile = catalog.profiles.find((p) => p.id === first.profileId)
  const steel = cuts.find((c) => c.kind === 'reinforcement' && c.label === first.label)
  const weld = line.pauta?.weld
  const origin = lineProvenance(line)?.fields['pauta.weld']?.origin
  return {
    lineId: line.id,
    lineName: line.name,
    code: first.code,
    name: first.name,
    stockLength: first.barLength > 0 ? first.barLength : null,
    face: profile?.face && profile.face > 0 ? profile.face : null,
    weld: typeof weld === 'number' && Number.isFinite(weld) ? weld : null,
    ...(origin ? { weldOrigin: origin } : {}),
    ...(cutOrigin(line) ? { cutOrigin: cutOrigin(line)! } : {}),
    width,
    height,
    pieces: frame.map((c) => ({ label: c.label, length: c.length, qty: c.qty, angleStart: c.angleStart, angleEnd: c.angleEnd })),
    steel: steel ? { code: steel.code, length: steel.length, pieceLength: first.length } : null,
    miter: first.angleEnd,
  }
}

export interface SawPlan {
  bars: Bar[]
  bar: Bar | null
  geo: BarGeometry | null
  /** Barras para el marco de muestra. */
  count: number
  yieldPct: number
  /** Lo que ocupa el disco en el eje de la barra a este ángulo. */
  kerfAlong: number
}

/** Corta el marco de muestra con estos ajustes, con el optimizador real. */
export function sawPlan(sample: SawSample, cut: CutSettings): SawPlan {
  const plan = optimizeCuts(
    sample.pieces.map((p) => ({ key: 'muestra', length: p.length, qty: p.qty, label: p.label, angleStart: p.angleStart, angleEnd: p.angleEnd })),
    cut,
  )
  const bars = plan.groups[0]?.bars ?? []
  const bar = bars[0] ?? null
  return {
    bars,
    bar,
    geo: bar ? barGeometry(bar, cut) : null,
    count: bars.length,
    yieldPct: plan.yieldPct,
    kerfAlong: kerfAlongBar(cut.kerf, sample.miter),
  }
}

export interface Pt {
  x: number
  y: number
}

/**
 * Tira de un disco visto de canto cortando un inglete: un paralelogramo que pasa por `at` (punta larga
 * de la pieza) con el ángulo del corte, de `kerf` de espesor, hacia `side`. Medidas en px.
 */
export function bladeStrip(at: Pt, height: number, angle: number, kerf: number, side: 1 | -1, overrun: number): Pt[] {
  const a = (Math.max(1, Math.min(90, angle)) * Math.PI) / 180
  // Dirección del corte hacia la cara corta (arriba). `side` = 1: cara izquierda de una pieza («/»).
  const ux = (side === 1 ? 1 : -1) * Math.cos(a)
  const uy = -Math.sin(a)
  const length = height / Math.sin(a)
  const start = { x: at.x - ux * overrun, y: at.y - uy * overrun }
  const end = { x: at.x + ux * (length + overrun), y: at.y + uy * (length + overrun) }
  // Normal hacia afuera de la pieza.
  const nx = (side === 1 ? -1 : 1) * Math.sin(a)
  const ny = -Math.cos(a)
  return [start, end, { x: end.x + nx * kerf, y: end.y + ny * kerf }, { x: start.x + nx * kerf, y: start.y + ny * kerf }]
}

export function points(pts: readonly Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

/** Cuánto se come un inglete en la cara corta. */
export function miterRun(face: number, angle: number): number {
  if (angle >= 89.95 || angle <= 0.5) return 0
  return face / Math.tan((angle * Math.PI) / 180)
}
