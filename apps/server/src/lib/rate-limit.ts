/** Límite de intentos simple en memoria (ventana fija por clave). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Registra un intento. Devuelve los segundos de espera si se pasó del límite, o 0.
   * `limit` reemplaza el tope por defecto para esta clave (p. ej. topes por plan).
   */
  hit(key: string, limit = this.limit): number {
    const t = this.now()
    this.sweep(t)
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs })
      return limit < 1 ? Math.ceil(this.windowMs / 1000) : 0
    }
    entry.count++
    return entry.count > limit ? Math.ceil((entry.resetAt - t) / 1000) : 0
  }

  /** ¿Está bloqueada la clave? (sin contar un intento nuevo). */
  blocked(key: string, limit = this.limit): number {
    const t = this.now()
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= t) return 0
    return entry.count >= limit ? Math.ceil((entry.resetAt - t) / 1000) : 0
  }

  reset(key: string): void {
    this.hits.delete(key)
  }

  private sweep(t: number): void {
    if (this.hits.size < 5000) return
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key)
  }
}

/**
 * Espera creciente por clave (p. ej. por cuenta, sin mirar la IP): los primeros `free` fallos
 * no bloquean; desde ahí cada fallo bloquea `baseMs × 2^(n−1)` hasta `maxMs`. Rotar de IP no
 * sirve porque la clave es la cuenta. Un acierto (reset) o `forgetMs` sin fallos lo borran.
 */
export class BackoffLimiter {
  private entries = new Map<string, { failures: number; lockedUntil: number; lastAt: number }>()

  constructor(
    private readonly free: number,
    private readonly baseMs: number,
    private readonly maxMs: number,
    private readonly forgetMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Segundos que faltan si la clave está bloqueada; 0 si se puede intentar. */
  blocked(key: string): number {
    const t = this.now()
    const entry = this.current(key, t)
    if (!entry || entry.lockedUntil <= t) return 0
    return Math.ceil((entry.lockedUntil - t) / 1000)
  }

  /** Registra un fallo. Devuelve los segundos de bloqueo que deja (0 si aún no bloquea). */
  fail(key: string): number {
    const t = this.now()
    this.sweep(t)
    const entry = this.current(key, t) ?? { failures: 0, lockedUntil: 0, lastAt: t }
    entry.failures++
    entry.lastAt = t
    const over = entry.failures - this.free
    if (over > 0) entry.lockedUntil = t + Math.min(this.maxMs, this.baseMs * 2 ** Math.min(over - 1, 30))
    this.entries.set(key, entry)
    return entry.lockedUntil > t ? Math.ceil((entry.lockedUntil - t) / 1000) : 0
  }

  reset(key: string): void {
    this.entries.delete(key)
  }

  private current(key: string, t: number) {
    const entry = this.entries.get(key)
    if (entry && t - entry.lastAt > this.forgetMs && entry.lockedUntil <= t) {
      this.entries.delete(key)
      return undefined
    }
    return entry
  }

  private sweep(t: number): void {
    if (this.entries.size < 5000) return
    for (const [key, entry] of this.entries) if (t - entry.lastAt > this.forgetMs && entry.lockedUntil <= t) this.entries.delete(key)
    // Tope duro de memoria (p. ej. alguien probando miles de correos inventados): se olvidan
    // primero las claves más antiguas sin bloqueo vigente.
    if (this.entries.size <= 50_000) return
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= 40_000) break
      if (entry.lockedUntil <= t) this.entries.delete(key)
    }
  }
}
