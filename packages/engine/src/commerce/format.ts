/**
 * Formato chileno determinista (no depende del ICU del entorno): miles con punto, decimales
 * con coma, peso pegado al número ($1.234.567) y signo menos tipográfico.
 */

const MINUS = '−'

/** Tolerancia para errores de coma flotante al redondear (unos pocos ulp del valor). */
function epsilonFor(value: number): number {
  return Math.max(1e-9, Math.abs(value) * 8 * Number.EPSILON)
}

/** Redondeo HALF_UP (0,5 se aleja del cero) a `decimals` decimales. */
export function roundHalfUp(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** decimals
  const scaled = Math.abs(value) * factor
  const rounded = Math.floor(scaled + 0.5 + epsilonFor(scaled)) / factor
  return value < 0 && rounded !== 0 ? -rounded : rounded
}

/**
 * Redondea hacia arriba al múltiplo de `step` (precio de venta: nunca baja el margen).
 * `roundUpTo(107650.3, 1000)` → 108000. Un paso ≤ 0 deja el valor igual.
 */
export function roundUpTo(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0
  if (!Number.isFinite(step) || step <= 0) return value
  const ratio = value / step
  const result = Math.ceil(ratio - epsilonFor(ratio)) * step
  return result === 0 ? 0 : result
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Número con punto de miles y coma decimal. Muestra hasta `maxDecimals` decimales sin
 * ceros sobrantes y al menos `minDecimals`.
 */
export function formatNumber(value: number, maxDecimals = 0, minDecimals = 0): string {
  const rounded = roundHalfUp(Number.isFinite(value) ? value : 0, maxDecimals)
  const [int, frac = ''] = Math.abs(rounded).toFixed(maxDecimals).split('.')
  let decimals = frac.replace(/0+$/, '')
  while (decimals.length < minDecimals) decimals += '0'
  const body = decimals ? `${groupThousands(int)},${decimals}` : groupThousands(int)
  return rounded < 0 ? `${MINUS}${body}` : body
}

/** Pesos chilenos enteros: `$1.234.567`, `−$12.000`. */
export function formatCLP(value: number): string {
  const rounded = roundHalfUp(Number.isFinite(value) ? value : 0)
  const body = groupThousands(String(Math.abs(rounded)))
  return rounded < 0 ? `${MINUS}$${body}` : `$${body}`
}

/** Milímetros con resolución 0,1 y decimales solo si existen: `1.200`, `554,5`. */
export function formatMM(value: number): string {
  return formatNumber(value, 1)
}

/** Ancho × alto: `1.200 × 1.500 mm`. */
export function formatSize(width: number, height: number): string {
  return `${formatMM(width)} × ${formatMM(height)} mm`
}

/** Superficie con dos decimales: `1,95 m²`. */
export function formatArea(m2: number): string {
  return `${formatNumber(m2, 2, 2)} m²`
}

/** Porcentaje con decimales solo si existen (hasta `maxDecimals`): `35 %`, `97,2 %`. */
export function formatPct(value: number, maxDecimals = 1): string {
  return `${formatNumber(value, maxDecimals)} %`
}

/** Largo en metros desde milímetros, dos decimales: 4392 → `4,39 m`. */
export function formatMeters(mm: number): string {
  return `${formatNumber(mm / 1000, 2, 2)} m`
}
