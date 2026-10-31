/**
 * Geometría de la vista interactiva de cortes: cada barra a escala en píxeles, con sus
 * piezas, despuntes y sobrante, y la decisión de qué texto cabe en cada pieza.
 */
import type { Bar, BarCut, CutSettings, OptimizationGroup } from '@framezen/engine'

/** Ancho aproximado de un texto en px (cifras tabulares ≈ 0,58 em). */
export function textWidth(text: string, size: number): number {
  let em = 0
  for (const ch of text) {
    if (/[0-9]/.test(ch)) em += 0.58
    else if (/[.,·:'\s]/.test(ch)) em += 0.3
    else if (/[A-ZÁÉÍÓÚÑ]/.test(ch)) em += 0.66
    else em += 0.52
  }
  return em * size
}

/** Medida para la barra: 1234.5 → «1.234,5». */
export function mm(value: number): string {
  const r = Math.round(value * 10) / 10
  const [int, dec] = Math.abs(r).toFixed(1).split('.')
  const body = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = r < 0 ? '−' : ''
  return dec && dec !== '0' ? `${sign}${body},${dec}` : `${sign}${body}`
}

/** «V3 · arr/aba» → «arr/aba» (la ref va aparte). */
export function sideOf(cut: Pick<BarCut, 'label' | 'ref'>): string {
  const label = cut.label ?? ''
  if (cut.ref && label.startsWith(cut.ref)) return label.slice(cut.ref.length).replace(/^\s*·\s*/, '').trim()
  return label.trim()
}

export const BAR_HEIGHT = 40
export const MEASURE_SIZE = 15
export const MEASURE_SMALL = 12
export const LABEL_SIZE = 11

export interface PiecePlacement {
  /** Número de la pieza dentro de la barra (1…). */
  n: number
  cut: BarCut
  x: number
  w: number
  /** Desplazamiento de inglete arriba (px) en cada extremo. */
  miterStart: number
  miterEnd: number
  measure: { size: number; vertical: boolean } | null
  /** Texto bajo la pieza: «V3 · arr», solo «V3» o nada. */
  caption: string | null
}

export interface BarPlacement {
  width: number
  scale: number
  pieces: PiecePlacement[]
  trimStart: { x: number; w: number } | null
  trimEnd: { x: number; w: number } | null
  remainder: { x: number; w: number; length: number; reusable: boolean; showText: boolean; showCaption: boolean } | null
  /** Piezas cuya medida no cabe: se listan bajo la barra. */
  hidden: PiecePlacement[]
}

function miterPx(angle: number | undefined, w: number): number {
  if (angle === undefined || !Number.isFinite(angle) || angle >= 89.95 || angle <= 0.5) return 0
  const depth = BAR_HEIGHT * 0.32
  return Math.min(depth / Math.tan((angle * Math.PI) / 180), w * 0.3)
}

/** Coloca una barra en `width` px. */
export function placeBar(bar: Bar, cut: Pick<CutSettings, 'trimStart' | 'trimEnd' | 'minReusable'>, width: number): BarPlacement {
  const safeWidth = Math.max(40, width)
  const scale = bar.barLength > 0 ? safeWidth / bar.barLength : 0
  const pieces: PiecePlacement[] = bar.cuts.map((c, i) => {
    const x = c.offset * scale
    const w = Math.max(1, c.length * scale)
    const text = mm(c.length)
    let measure: PiecePlacement['measure'] = null
    if (textWidth(text, MEASURE_SIZE) <= w - 8) measure = { size: MEASURE_SIZE, vertical: false }
    else if (textWidth(text, MEASURE_SMALL) <= w - 4) measure = { size: MEASURE_SMALL, vertical: false }
    else if (w >= 14 && textWidth(text, 11) <= BAR_HEIGHT - 6) measure = { size: 11, vertical: true }
    const side = sideOf(c)
    const full = c.ref ? (side ? `${c.ref} · ${side}` : c.ref) : side
    let caption: string | null = null
    if (full && textWidth(full, LABEL_SIZE) <= w + 2) caption = full
    else if (c.ref && textWidth(c.ref, LABEL_SIZE) <= w + 2) caption = c.ref
    return { n: i + 1, cut: c, x, w, miterStart: miterPx(c.angleStart, w), miterEnd: miterPx(c.angleEnd, w), measure, caption }
  })
  const trimStart = cut.trimStart > 0 && !bar.fromOffcut ? { x: 0, w: cut.trimStart * scale } : null
  const trimEnd = cut.trimEnd > 0 && !bar.fromOffcut ? { x: safeWidth - cut.trimEnd * scale, w: cut.trimEnd * scale } : null
  const remLength = Math.max(0, bar.remainder)
  const remW = remLength * scale
  const remX = Math.max(0, (bar.barLength - (bar.fromOffcut ? 0 : cut.trimEnd) - remLength) * scale)
  const remainder =
    remW > 0.5
      ? {
          x: remX,
          w: remW,
          length: remLength,
          reusable: remLength >= cut.minReusable,
          showText: textWidth(mm(remLength), 12) + 8 <= remW,
          showCaption: remW >= 96,
        }
      : null
  return {
    width: safeWidth,
    scale,
    pieces,
    trimStart,
    trimEnd,
    remainder,
    hidden: pieces.filter((p) => !p.measure),
  }
}

/** Puntos del polígono de una pieza con sus ingletes (arriba la cara corta). */
export function piecePolygon(p: PiecePlacement, top = 0, height = BAR_HEIGHT): string {
  const bottom = top + height
  const pts: [number, number][] = [
    [p.x + p.miterStart, top],
    [p.x + p.w - p.miterEnd, top],
    [p.x + p.w, bottom],
    [p.x, bottom],
  ]
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

/** Refs de ventana presentes en un grupo, en orden de aparición. */
export function groupRefs(group: OptimizationGroup): string[] {
  const seen = new Set<string>()
  for (const bar of group.bars) for (const c of bar.cuts) if (c.ref && !seen.has(c.ref)) seen.add(c.ref)
  return [...seen]
}

/** Clave estable de una barra para marcarla como cortada. */
export function barKey(group: OptimizationGroup, index: number, bar: Bar): string {
  return `${group.key}#${index}#${bar.cuts.map((c) => c.length).join('+')}`
}

/** Firma del plan: si cambia (otro disco, otra barra, otra cotización) las marcas viejas no aplican. */
export function planSignature(groups: readonly OptimizationGroup[]): string {
  let hash = 2166136261
  const text = groups.map((g) => `${g.key}:${g.bars.map((b) => `${b.barLength}/${b.cuts.map((c) => c.length).join(',')}`).join('|')}`).join(';')
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
