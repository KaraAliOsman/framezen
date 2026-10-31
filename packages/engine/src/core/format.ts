// Utilidades numéricas internas del núcleo (no se reexportan desde el paquete).

/** Redondea a `decimals` decimales, mitad hacia arriba, tolerando el ruido de coma flotante. */
export function round(n: number, decimals = 1): number {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** decimals
  const scaled = n * f
  return Math.round(scaled + (scaled >= 0 ? 1e-6 : -1e-6)) / f
}

/** Resolución del motor: 0,1 mm. */
export const mm1 = (n: number): number => round(n, 1)

/** Número en formato chileno: miles con punto y decimales con coma, sin ceros de relleno. */
export function formatNumber(n: number, maxDecimals = 1): string {
  const r = round(n, maxDecimals)
  const [int, dec = ''] = Math.abs(r).toFixed(maxDecimals).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const trimmed = dec.replace(/0+$/, '')
  return (r < 0 ? '-' : '') + grouped + (trimmed ? ',' + trimmed : '')
}

export const fmtMm = (n: number): string => `${formatNumber(n, 1)} mm`
export const fmtM2 = (n: number): string => `${formatNumber(n, 2)} m²`

export const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/** Número para paths SVG (punto decimal, 0,1 mm). */
export const svgNum = (n: number): string => String(mm1(n))
