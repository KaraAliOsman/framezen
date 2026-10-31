/**
 * Totales y avisos de una OT a partir de los datos de taller del motor.
 */
import type { Warning, WorkshopData } from '@framezen/engine'

export interface WorkshopTotals {
  /** Ventanas distintas (ítems) y unidades a fabricar. */
  windows: number
  units: number
  /** Barras nuevas a sacar de bodega, piezas a cortar y aprovechamiento. */
  bars: number
  pieces: number
  yieldPct: number
  /** Retazos reutilizables que deja el plan. */
  offcuts: number
  /** Vidrios: piezas y m². */
  glassPieces: number
  glassArea: number
  /** m² de carpintería (cota × unidades). */
  frameArea: number
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

export function workshopTotals(data: Pick<WorkshopData, 'windows' | 'optimization' | 'glass'>): WorkshopTotals {
  const units = data.windows.reduce((s, w) => s + Math.max(0, w.qty), 0)
  return {
    windows: data.windows.length,
    units,
    bars: data.optimization.totalBars,
    pieces: data.optimization.totalPieces,
    yieldPct: data.optimization.yieldPct,
    offcuts: data.optimization.offcuts.length,
    glassPieces: data.glass.reduce((s, g) => s + g.qty, 0),
    glassArea: round(data.glass.reduce((s, g) => s + g.area * g.qty, 0)),
    frameArea: round(data.windows.reduce((s, w) => s + (w.bom.area || 0) * Math.max(0, w.qty), 0)),
  }
}

export interface WorkshopNotice {
  level: Warning['level']
  message: string
  /** Ventana a la que se refiere (si aplica). */
  ref?: string
}

/** Avisos de precio: son de la oficina, no del taller. */
const COMMERCIAL = /^(price_|manual_price|below_cost|margin_)/

/**
 * Avisos útiles para fabricar: los del despiece de cada ventana y los del optimizador
 * (barra especial), sin repetir y sin los de precio. Primero los que impiden fabricar.
 */
export function workshopNotices(data: Pick<WorkshopData, 'windows' | 'optimization'> & { optimization: { warnings?: Warning[] } }): WorkshopNotice[] {
  const out: WorkshopNotice[] = []
  const seen = new Set<string>()
  const push = (w: Warning, ref?: string) => {
    if (!w || w.level === 'info' || COMMERCIAL.test(w.code)) return
    const key = `${ref ?? ''}|${w.message}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ level: w.level, message: w.message, ...(ref ? { ref } : {}) })
  }
  for (const window of data.windows) for (const w of window.bom.warnings ?? []) push(w, window.ref)
  for (const w of data.optimization.warnings ?? []) push(w)
  const rank = { error: 0, warn: 1, info: 2 } as const
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}
