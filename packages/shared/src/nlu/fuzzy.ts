/**
 * Tolerancia a errores de tipeo (investigación 24 §5.2).
 *
 * - Distancia OSA (Damerau–Levenshtein restringida: inserción, borrado, sustitución y transposición
 *   de vecinos) con banda y corte temprano: nunca calcula más de lo necesario.
 * - Umbral por largo: 1–3 letras → 0 (solo alias explícitos), 4–9 → 1, 10+ → 2.
 * - Candidatos por índice de borrados (distancia 1) y por trigramas con Dice (distancia 2, palabras
 *   largas). Nunca se corrigen números, códigos, correos ni teléfonos (no llegan aquí).
 */

/** Distancia OSA acotada: devuelve `max + 1` si la distancia supera `max`. */
export function osaDistance(a: string, b: string, max: number): number {
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > max) return max + 1
  if (a === b) return 0
  if (!la) return lb
  if (!lb) return la
  // Tres filas reutilizables (anterior a la anterior, anterior y actual).
  let prev2 = new Array<number>(lb + 1)
  let prev = new Array<number>(lb + 1)
  let cur = new Array<number>(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    cur[0] = i
    let rowMin = cur[0]
    const from = Math.max(1, i - max)
    const to = Math.min(lb, i + max)
    for (let j = 1; j < from; j++) cur[j] = max + 1
    for (let j = from; j <= to; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    for (let j = to + 1; j <= lb; j++) cur[j] = max + 1
    if (rowMin > max) return max + 1
    const t = prev2
    prev2 = prev
    prev = cur
    cur = t
  }
  return prev[lb] > max ? max + 1 : prev[lb]
}

/** Edición máxima tolerada según el largo de la palabra. */
export function fuzzyBudget(length: number): number {
  if (length <= 3) return 0
  if (length <= 9) return 1
  return 2
}

/** Trigramas con relleno de bordes («␣␣a», «␣ab», …). */
export function trigrams(word: string): string[] {
  const padded = `  ${word} `
  const out: string[] = []
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3))
  return out
}

/** Coeficiente de Dice entre dos conjuntos de trigramas. */
export function dice(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0
  const set = new Map<string, number>()
  for (const g of a) set.set(g, (set.get(g) ?? 0) + 1)
  let common = 0
  for (const g of b) {
    const n = set.get(g)
    if (n) {
      common++
      set.set(g, n - 1)
    }
  }
  return (2 * common) / (a.length + b.length)
}

export interface FuzzyCandidate<T> {
  item: T
  distance: number
}

/**
 * Candidatos de una palabra en un índice de borrados (`deletions` mapea cada palabra y sus borrados
 * de un carácter a índices en `words`). Verifica con OSA y respeta el umbral por largo.
 */
export function lookupFuzzy<T extends { fold: string }>(
  query: string,
  words: readonly T[],
  deletions: ReadonlyMap<string, readonly number[]>,
  long?: readonly number[],
  limit = 8,
): FuzzyCandidate<T>[] {
  const budget = fuzzyBudget(query.length)
  if (budget === 0) return []
  const seen = new Set<number>()
  const out: FuzzyCandidate<T>[] = []
  const consider = (idx: number) => {
    if (seen.has(idx)) return
    seen.add(idx)
    const w = words[idx]
    const d = osaDistance(query, w.fold, budget)
    if (d > 0 && d <= budget) out.push({ item: w, distance: d })
  }
  const keys = [query]
  for (let i = 0; i < query.length; i++) keys.push(query.slice(0, i) + query.slice(i + 1))
  for (const key of keys) for (const idx of deletions.get(key) ?? []) consider(idx)
  if (budget >= 2 && long && out.length < limit) {
    const qg = trigrams(query)
    for (const idx of long) {
      const w = words[idx]
      if (Math.abs(w.fold.length - query.length) > 2 || seen.has(idx)) continue
      if (dice(qg, trigrams(w.fold)) < 0.45) continue
      consider(idx)
    }
  }
  out.sort((a, b) => a.distance - b.distance || a.item.fold.length - b.item.fold.length)
  return out.slice(0, limit)
}
