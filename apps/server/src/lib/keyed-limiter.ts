/**
 * Límite genérico por clave (balde de fichas, en memoria del proceso). Cada clave lleva su propia
 * política (tope y ventana), así un mismo limitador sirve para «turnos de IA por persona por
 * minuto», «subidas por organización por hora» o «plantillas generadas por día», con costo
 * variable por intento (p. ej. créditos).
 *
 *   const r = limiter.take(`ai-turn:${userId}`, { limit: 10, windowMs: 60_000 })
 *   if (!r.ok) throw rateLimited(r)   // 429 too_many_requests + Retry-After
 *
 * El balde se rellena de forma continua (limit / windowMs fichas por ms): no hay «ráfaga doble»
 * en el borde de la ventana como con una ventana fija. Supone una sola instancia (igual que el
 * resto de los límites en memoria); los topes diarios de dinero se cuentan en la base (ai_usage).
 */
import { HttpError } from './errors'

export interface KeyedPolicy {
  /** Fichas del balde (intentos permitidos en una ventana completa). */
  limit: number
  windowMs: number
}

export interface TakeResult {
  ok: boolean
  /** Fichas que quedan tras este intento (0 si se bloqueó). */
  remaining: number
  /** Segundos hasta poder intentar de nuevo con el mismo costo (0 si ok). */
  retryAfterSec: number
  limit: number
}

interface Bucket {
  tokens: number
  updatedAt: number
  /** Política con la que se creó (si cambia, el balde se reescala). */
  limit: number
  windowMs: number
}

export class KeyedRateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  constructor(
    private readonly now: () => number = Date.now,
    /** Tope de claves en memoria antes de olvidar las llenas más antiguas. */
    private readonly maxKeys = 50_000,
  ) {}

  /** Consume `cost` fichas (por defecto 1). No consume nada si no alcanza. */
  take(key: string, policy: KeyedPolicy, cost = 1): TakeResult {
    const limit = Math.max(0, Math.floor(policy.limit))
    const windowMs = Math.max(1, policy.windowMs)
    if (limit === 0) return { ok: false, remaining: 0, retryAfterSec: Math.ceil(windowMs / 1000), limit }
    const t = this.now()
    const bucket = this.refill(key, limit, windowMs, t)
    const need = Math.max(0, cost)
    if (bucket.tokens + 1e-9 >= need) {
      bucket.tokens -= need
      return { ok: true, remaining: Math.floor(bucket.tokens), retryAfterSec: 0, limit }
    }
    const rate = limit / windowMs
    const missing = Math.min(need, limit) - bucket.tokens
    return { ok: false, remaining: Math.floor(bucket.tokens), retryAfterSec: Math.max(1, Math.ceil(missing / rate / 1000)), limit }
  }

  /** Mira sin consumir. */
  peek(key: string, policy: KeyedPolicy): TakeResult {
    const limit = Math.max(0, Math.floor(policy.limit))
    if (limit === 0) return { ok: false, remaining: 0, retryAfterSec: Math.ceil(policy.windowMs / 1000), limit }
    const bucket = this.refill(key, limit, Math.max(1, policy.windowMs), this.now())
    return { ok: bucket.tokens >= 1, remaining: Math.floor(bucket.tokens), retryAfterSec: 0, limit }
  }

  /** Devuelve fichas (p. ej. un turno que falló antes de llamar a la IA). */
  refund(key: string, cost = 1): void {
    const bucket = this.buckets.get(key)
    if (bucket) bucket.tokens = Math.min(bucket.limit, bucket.tokens + Math.max(0, cost))
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  /** Claves en memoria (diagnóstico y pruebas). */
  get size(): number {
    return this.buckets.size
  }

  private refill(key: string, limit: number, windowMs: number, t: number): Bucket {
    let bucket = this.buckets.get(key)
    if (!bucket) {
      this.sweep(t)
      bucket = { tokens: limit, updatedAt: t, limit, windowMs }
      this.buckets.set(key, bucket)
      return bucket
    }
    if (bucket.limit !== limit || bucket.windowMs !== windowMs) {
      // Cambió la política (p. ej. otro plan): se conserva la proporción usada.
      bucket.tokens = (bucket.tokens / bucket.limit) * limit
      bucket.limit = limit
      bucket.windowMs = windowMs
    }
    const elapsed = Math.max(0, t - bucket.updatedAt)
    bucket.tokens = Math.min(limit, bucket.tokens + (elapsed * limit) / windowMs)
    bucket.updatedAt = t
    return bucket
  }

  private sweep(t: number): void {
    if (this.buckets.size < this.maxKeys) return
    // Primero las que ya se rellenaron por completo (no guardan información útil).
    for (const [key, b] of this.buckets) {
      if (b.tokens + ((t - b.updatedAt) * b.limit) / b.windowMs >= b.limit) this.buckets.delete(key)
    }
    if (this.buckets.size < this.maxKeys) return
    const drop = Math.ceil(this.maxKeys * 0.1)
    let n = 0
    for (const key of this.buckets.keys()) {
      if (n++ >= drop) break
      this.buckets.delete(key)
    }
  }
}

/** 429 `too_many_requests` con Retry-After (en `extra.retryAfter`, la web lo muestra). */
export function rateLimited(result: Pick<TakeResult, 'retryAfterSec'>, message = 'Vamos muy rápido. Espera un momento y vuelve a intentarlo.'): HttpError {
  return new HttpError(429, 'too_many_requests', message, undefined, { retryAfter: result.retryAfterSec })
}
