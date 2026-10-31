/**
 * Estaciones de producción y avance de una OT.
 *
 * Cada ventana (ref de la cotización) está en una estación: Corte → Soldadura → Armado →
 * Herrajes → Vidriado → Control → Listo → Instalado. «Listo» = fabricada (100 % de
 * avance de taller); «Instalado» es el paso en obra.
 */
import type { LucideIcon } from 'lucide-react'
import { ClipboardCheck, Flame, Frame, House, PackageCheck, Scissors, SquareDashed, Wrench } from 'lucide-react'
import type { Station, WorkOrder } from '@framezen/shared'

export interface StationInfo {
  id: Station
  label: string
  /** Verbo para avisos: «V2 pasó a Soldadura». */
  short: string
  icon: LucideIcon
}

export const STATIONS: readonly StationInfo[] = [
  { id: 'cut', label: 'Corte', short: 'Corte', icon: Scissors },
  { id: 'weld', label: 'Soldadura', short: 'Soldadura', icon: Flame },
  { id: 'assembly', label: 'Armado', short: 'Armado', icon: Frame },
  { id: 'hardware', label: 'Herrajes', short: 'Herrajes', icon: Wrench },
  { id: 'glazing', label: 'Vidriado', short: 'Vidriado', icon: SquareDashed },
  { id: 'qc', label: 'Control', short: 'Control', icon: ClipboardCheck },
  { id: 'ready', label: 'Listo', short: 'Listo', icon: PackageCheck },
  { id: 'installed', label: 'Instalado', short: 'Instalado', icon: House },
]

export const STATION_IDS: readonly Station[] = STATIONS.map((s) => s.id)
const READY_INDEX = STATION_IDS.indexOf('ready')

export function isStation(value: unknown): value is Station {
  return typeof value === 'string' && (STATION_IDS as readonly string[]).includes(value)
}

export function stationInfo(station: Station): StationInfo {
  return STATIONS.find((s) => s.id === station) ?? STATIONS[0]!
}

export function stationIndex(station: Station | undefined): number {
  const i = station ? STATION_IDS.indexOf(station) : 0
  return i < 0 ? 0 : i
}

/** Estación siguiente (Instalado es la última). */
export function nextStation(station: Station): Station | null {
  const i = stationIndex(station)
  return i < STATION_IDS.length - 1 ? STATION_IDS[i + 1]! : null
}

export function previousStation(station: Station): Station | null {
  const i = stationIndex(station)
  return i > 0 ? STATION_IDS[i - 1]! : null
}

/** Estación de una ventana en la OT; si no figura (ref nueva), está en Corte. */
export function stationOf(progress: WorkOrder['progress'] | undefined, ref: string): Station {
  const value = progress?.[ref]
  return isStation(value) ? value : 'cut'
}

/** 0–1: avance de taller de una ventana (Corte = 0, Listo e Instalado = 1). */
export function itemProgress(station: Station): number {
  return Math.min(1, stationIndex(station) / READY_INDEX)
}

export interface OrderProgress {
  /** 0–1, promedio por ventana (ponderado por unidades si se conocen). */
  ratio: number
  /** Ventanas en total, listas (o instaladas) e instaladas. */
  total: number
  ready: number
  installed: number
  /** Cuántas ventanas hay en cada estación. */
  byStation: Record<Station, number>
}

/**
 * Avance de la OT. `refs` = ventanas de la cotización (si se conocen); si no, las del
 * avance guardado. `weights` = unidades por ref para ponderar (opcional).
 */
export function orderProgress(
  progress: WorkOrder['progress'] | undefined,
  refs?: readonly string[],
  weights?: Readonly<Record<string, number>>,
): OrderProgress {
  const list = refs && refs.length ? refs : Object.keys(progress ?? {})
  const byStation = Object.fromEntries(STATION_IDS.map((s) => [s, 0])) as Record<Station, number>
  let sum = 0
  let weightSum = 0
  let ready = 0
  let installed = 0
  for (const ref of list) {
    const station = stationOf(progress, ref)
    const w = weights?.[ref] !== undefined && weights[ref]! > 0 ? weights[ref]! : 1
    byStation[station] += 1
    sum += itemProgress(station) * w
    weightSum += w
    if (stationIndex(station) >= READY_INDEX) ready += 1
    if (station === 'installed') installed += 1
  }
  return { ratio: weightSum > 0 ? sum / weightSum : 0, total: list.length, ready, installed, byStation }
}

/** Estación «típica» de la OT (la más atrasada), para resumir en una palabra. */
export function slowestStation(progress: WorkOrder['progress'] | undefined, refs?: readonly string[]): Station {
  const list = refs && refs.length ? refs : Object.keys(progress ?? {})
  if (list.length === 0) return 'cut'
  return list.map((ref) => stationOf(progress, ref)).reduce((a, b) => (stationIndex(b) < stationIndex(a) ? b : a))
}

/** Avance en palabras: «3 de 5 listas · 1 instalada». */
export function progressText(p: OrderProgress): string {
  if (p.total === 0) return 'Sin ventanas'
  if (p.installed === p.total) return p.total === 1 ? 'Instalada' : 'Todas instaladas'
  if (p.ready === p.total) return p.total === 1 ? 'Lista para instalar' : 'Todas listas para instalar'
  const base = `${p.ready} de ${p.total} ${p.total === 1 ? 'lista' : 'listas'}`
  return p.installed > 0 ? `${base} · ${p.installed} ${p.installed === 1 ? 'instalada' : 'instaladas'}` : base
}

export const ORDER_STATUS_COPY: Record<WorkOrder['status'], { label: string; tone: 'neutral' | 'warn' | 'ok' }> = {
  open: { label: 'Por empezar', tone: 'neutral' },
  in_progress: { label: 'En fabricación', tone: 'warn' },
  done: { label: 'Lista', tone: 'ok' },
}

/** Mismo criterio que el servidor: todo listo = terminada; algo avanzado = en curso. */
export function statusFromProgress(progress: WorkOrder['progress']): WorkOrder['status'] {
  const values = Object.values(progress)
  if (values.length && values.every((s) => s === 'ready' || s === 'installed')) return 'done'
  if (values.some((s) => s !== 'cut')) return 'in_progress'
  return 'open'
}
