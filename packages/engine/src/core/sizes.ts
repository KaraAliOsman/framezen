import { mm1 } from './format'

/**
 * Convierte `sizes` (medidas a eje; null = reparte el resto en partes iguales) en medidas
 * concretas que suman exactamente `total − gaps`. Resolución 0,1 mm: el último reparto
 * absorbe el resto. Si las medidas fijas no cuadran con el total (por ejemplo tras cambiar
 * el ancho), se reescalan proporcionalmente. Nunca lanza.
 */
export function resolveSizes(sizes: readonly (number | null | undefined)[], total: number, gaps = 0): number[] {
  const n = sizes.length
  if (n === 0) return []
  const target = Math.max(0, (Number.isFinite(total) ? total : 0) - (Number.isFinite(gaps) ? gaps : 0))
  const clean = sizes.map((s) => (typeof s === 'number' && Number.isFinite(s) && s >= 0 ? s : null))
  const fixedSum = clean.reduce<number>((acc, s) => acc + (s ?? 0), 0)
  const nulls = clean.filter((s) => s === null).length

  let raw: number[]
  if (nulls > 0 && fixedSum <= target) {
    const share = (target - fixedSum) / nulls
    raw = clean.map((s) => (s === null ? share : s))
  } else if (nulls > 0) {
    // Las fijas ya exceden el total: todo se reparte en proporción, los vacíos con la media.
    const mean = fixedSum / (n - nulls)
    const filled = clean.map((s) => (s === null ? mean : s))
    raw = scaleTo(filled, target)
  } else {
    raw = fixedSum > 0 ? scaleTo(clean as number[], target) : clean.map(() => target / n)
  }
  return closeSum(raw, target)
}

function scaleTo(values: number[], target: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum <= 0) return values.map(() => target / values.length)
  if (Math.abs(sum - target) < 1e-9) return values
  return values.map((v) => (v * target) / sum)
}

/** Redondea a 0,1 mm y ajusta la última medida para que la suma sea exacta. */
export function closeSum(values: number[], target: number): number[] {
  const out = values.map(mm1)
  if (out.length === 0) return out
  const rest = out.slice(0, -1).reduce((a, b) => a + b, 0)
  out[out.length - 1] = mm1(target - rest)
  return out
}

/** Divide `total` en `parts` partes iguales a 0,1 mm (la última absorbe el resto). */
export function equalShares(total: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts))
  const share = Math.floor((total / n) * 10) / 10
  return closeSum(Array.from({ length: n }, () => share), total)
}
