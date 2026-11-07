/**
 * Frecuencia + recencia de sugerencias aceptadas (por persona, en este navegador). Puntaje decaído
 * F(now) = Σ peso · 2^(−días/14); el orden usa log1p(F) acotado, nunca por encima de una coincidencia
 * exacta. Solo se actualiza al aceptar o ejecutar algo, y se puede borrar.
 */
const KEY = 'fz-assistant-frecency'
const HALF_LIFE_DAYS = 14
const MAX_ENTRIES = 200
const DAY = 86_400_000

interface Score {
  s: number
  t: number
}

type Table = Record<string, Score>

let cache: Table | null = null

function read(): Table {
  if (cache) return cache
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    cache = parsed && typeof parsed === 'object' ? (parsed as Table) : {}
  } catch {
    cache = {}
  }
  return cache
}

function write(table: Table): void {
  cache = table
  try {
    localStorage.setItem(KEY, JSON.stringify(table))
  } catch {
    // Sin almacenamiento (modo privado): se queda en memoria.
  }
}

function decayed(score: Score, now: number): number {
  return score.s * 2 ** (-(now - score.t) / DAY / HALF_LIFE_DAYS)
}

/** Registra un uso aceptado de `id` (comando, cliente, color…). */
export function recordUse(id: string, weight = 1, now = Date.now()): void {
  const table = { ...read() }
  const prev = table[id]
  table[id] = { s: (prev ? decayed(prev, now) : 0) + weight, t: now }
  const keys = Object.keys(table)
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => decayed(table[a], now) - decayed(table[b], now))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete table[k])
  }
  write(table)
}

/** Impulso de orden (0–1,5) para `id`. */
export function frecencyBoost(id: string, now = Date.now()): number {
  const score = read()[id]
  return score ? Math.min(1.5, Math.log1p(decayed(score, now))) : 0
}

/** Los ids más usados (para las sugerencias con la entrada vacía). */
export function topUsed(prefix: string, limit: number, now = Date.now()): string[] {
  const table = read()
  return Object.keys(table)
    .filter((k) => k.startsWith(prefix))
    .sort((a, b) => decayed(table[b], now) - decayed(table[a], now))
    .slice(0, limit)
}

export function clearFrecency(): void {
  cache = {}
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nada que borrar
  }
}

/** Solo pruebas. */
export function resetFrecencyCache(): void {
  cache = null
}
