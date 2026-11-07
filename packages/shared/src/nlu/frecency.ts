/**
 * Frecuencia + recencia de lo que la persona acepta (investigación 24 §6.5).
 *
 *   F(ahora) = Σ peso · 2^(−días/14)
 *
 * Se guarda el puntaje y la fecha del último uso; al aceptar se decae una vez y se suma. El
 * impulso en el orden es `log1p(F)` acotado, y solo desempata dentro de una misma banda de
 * relevancia (nunca pasa una corrección por encima de una coincidencia exacta). La persistencia es
 * de quien llama (`snapshot()` → localStorage por usuario/organización).
 */

export interface NluFrecencySnapshot {
  v: 1
  /** clave → [puntaje, ms del último uso] */
  e: Record<string, [number, number]>
}

const HALF_LIFE_DAYS = 14
const DAY_MS = 86_400_000
const MAX_ENTRIES = 400

export interface NluFrecency {
  /** Registra un uso aceptado (`kind:id`, p. ej. «command:item.add», «color:c-nogal»). */
  record(key: string, now?: number, weight?: number): void
  /** Impulso de orden 0..~3 para una clave. */
  boost(key: string, now?: number): number
  snapshot(): NluFrecencySnapshot
  clear(): void
}

export function createFrecency(initial?: NluFrecencySnapshot | null): NluFrecency {
  const entries = new Map<string, [number, number]>()
  if (initial?.v === 1 && initial.e && typeof initial.e === 'object') {
    for (const [k, v] of Object.entries(initial.e)) {
      if (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1])) entries.set(k, [v[0], v[1]])
    }
  }
  const decayed = (score: number, at: number, now: number) => score * 2 ** (-Math.max(0, now - at) / DAY_MS / HALF_LIFE_DAYS)
  return {
    record(key, now = Date.now(), weight = 1) {
      const prev = entries.get(key)
      const score = (prev ? decayed(prev[0], prev[1], now) : 0) + weight
      entries.delete(key)
      entries.set(key, [score, now])
      if (entries.size > MAX_ENTRIES) {
        // Saca los de menor puntaje vigente.
        const ranked = [...entries].sort((a, b) => decayed(a[1][0], a[1][1], now) - decayed(b[1][0], b[1][1], now))
        for (const [k] of ranked.slice(0, entries.size - MAX_ENTRIES)) entries.delete(k)
      }
    },
    boost(key, now = Date.now()) {
      const e = entries.get(key)
      if (!e) return 0
      return Math.min(3, Math.log1p(decayed(e[0], e[1], now)))
    },
    snapshot() {
      return { v: 1, e: Object.fromEntries(entries) }
    },
    clear() {
      entries.clear()
    },
  }
}
