/**
 * Ejemplo de optimización de cortes para la landing. Las medidas son de una OT
 * real de taller (Proline PRO6004: marco = cota + 6, hoja según pauta), con
 * barras de 5.800 mm y disco de 4 mm. El reparto en barras es el que entrega
 * un acomodo «primero el más largo»; aquí solo se ilustra.
 */

export type DemoRef = 'V1' | 'V2' | 'V3'
export type DemoMode = 'perWindow' | 'optimized'

export interface DemoCut {
  length: number
  ref: DemoRef
  side: string
}

export interface DemoGroup {
  code: string
  name: string
  color: string
  bars: Record<DemoMode, DemoCut[][]>
}

export const BAR_LENGTH = 5800
export const KERF = 4

export const DEMO_WINDOWS: Record<DemoRef, { name: string; size: string }> = {
  V1: { name: 'Abatir 2 hojas con travesaño', size: '1.193 × 1.350 mm' },
  V2: { name: 'Fijo + abatir', size: '1.193 × 1.358 mm' },
  V3: { name: 'Dos paños fijos', size: '2.385 × 900 mm' },
}

const c = (length: number, ref: DemoRef, side: string): DemoCut => ({ length, ref, side })

export const DEMO_GROUPS: DemoGroup[] = [
  {
    code: 'PRO01',
    name: 'Marco',
    color: 'Blanco',
    bars: {
      perWindow: [
        [c(1356, 'V1', 'izq'), c(1356, 'V1', 'der'), c(1199, 'V1', 'arr'), c(1199, 'V1', 'aba')],
        [c(1364, 'V2', 'izq'), c(1364, 'V2', 'der'), c(1199, 'V2', 'arr'), c(1199, 'V2', 'aba')],
        [c(2391, 'V3', 'arr'), c(2391, 'V3', 'aba'), c(906, 'V3', 'izq')],
        [c(906, 'V3', 'der')],
      ],
      optimized: [
        [c(2391, 'V3', 'arr'), c(2391, 'V3', 'aba'), c(906, 'V3', 'izq')],
        [c(1364, 'V2', 'izq'), c(1364, 'V2', 'der'), c(1356, 'V1', 'izq'), c(1356, 'V1', 'der')],
        [c(1199, 'V1', 'arr'), c(1199, 'V1', 'aba'), c(1199, 'V2', 'arr'), c(1199, 'V2', 'aba'), c(906, 'V3', 'der')],
      ],
    },
  },
  {
    code: 'PRO521',
    name: 'Hoja',
    color: 'Blanco',
    bars: {
      perWindow: [
        [c(1284, 'V1', 'izq'), c(1284, 'V1', 'der'), c(1284, 'V1', 'izq'), c(1284, 'V1', 'der'), c(554.5, 'V1', 'arr')],
        [c(554.5, 'V1', 'aba'), c(554.5, 'V1', 'arr'), c(554.5, 'V1', 'aba')],
        [c(1292, 'V2', 'izq'), c(1292, 'V2', 'der'), c(554.5, 'V2', 'arr'), c(554.5, 'V2', 'aba')],
      ],
      optimized: [
        [c(1292, 'V2', 'izq'), c(1292, 'V2', 'der'), c(1284, 'V1', 'izq'), c(1284, 'V1', 'der'), c(554.5, 'V1', 'arr')],
        [
          c(1284, 'V1', 'izq'),
          c(1284, 'V1', 'der'),
          c(554.5, 'V1', 'aba'),
          c(554.5, 'V1', 'arr'),
          c(554.5, 'V1', 'aba'),
          c(554.5, 'V2', 'arr'),
          c(554.5, 'V2', 'aba'),
        ],
      ],
    },
  },
]

export interface PlacedCut extends DemoCut {
  offset: number
}

export interface BarLayout {
  cuts: PlacedCut[]
  used: number
  kerfLoss: number
  remainder: number
}

/** Posiciona los cortes en la barra (un corte de sierra por pieza). */
export function layoutBar(cuts: DemoCut[]): BarLayout {
  let offset = 0
  const placed = cuts.map((cut) => {
    const piece = { ...cut, offset }
    offset += cut.length + KERF
    return piece
  })
  const used = cuts.reduce((sum, cut) => sum + cut.length, 0)
  const kerfLoss = cuts.length * KERF
  return { cuts: placed, used, kerfLoss, remainder: Math.max(0, BAR_LENGTH - used - kerfLoss) }
}

export interface DemoStats {
  bars: number
  pieces: number
  yieldPct: number
  /** Sobrante total en metros. */
  leftoverM: number
}

export function demoStats(mode: DemoMode): DemoStats {
  const bars = DEMO_GROUPS.flatMap((group) => group.bars[mode])
  const used = bars.reduce((sum, bar) => sum + bar.reduce((s, cut) => s + cut.length, 0), 0)
  const pieces = bars.reduce((sum, bar) => sum + bar.length, 0)
  const total = bars.length * BAR_LENGTH
  return {
    bars: bars.length,
    pieces,
    yieldPct: total > 0 ? (used / total) * 100 : 0,
    leftoverM: (total - used) / 1000,
  }
}
