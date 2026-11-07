import { describe, expect, it } from 'vitest'
import { KeyedRateLimiter, rateLimited } from '../src/lib/keyed-limiter'
import { HttpError } from '../src/lib/errors'

function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => void (t += ms) }
}

describe('límite genérico por clave (balde de fichas)', () => {
  it('permite hasta el tope, bloquea con Retry-After y se rellena de forma continua', () => {
    const c = clock()
    const limiter = new KeyedRateLimiter(c.now)
    const policy = { limit: 3, windowMs: 60_000 }
    expect([1, 2, 3].map(() => limiter.take('ai:u1', policy).ok)).toEqual([true, true, true])
    const blocked = limiter.take('ai:u1', policy)
    expect(blocked).toMatchObject({ ok: false, remaining: 0, limit: 3 })
    expect(blocked.retryAfterSec).toBe(20) // una ficha cada 20 s
    c.advance(20_000)
    expect(limiter.take('ai:u1', policy).ok).toBe(true)
    expect(limiter.take('ai:u1', policy).ok).toBe(false)
    // Otra clave no comparte el balde.
    expect(limiter.take('ai:u2', policy).ok).toBe(true)
  })

  it('costo variable (p. ej. créditos), sin consumir si no alcanza; devolver fichas', () => {
    const c = clock()
    const limiter = new KeyedRateLimiter(c.now)
    const policy = { limit: 100, windowMs: 86_400_000 }
    expect(limiter.take('org:credits', policy, 70)).toMatchObject({ ok: true, remaining: 30 })
    expect(limiter.take('org:credits', policy, 40)).toMatchObject({ ok: false, remaining: 30 })
    expect(limiter.take('org:credits', policy, 30)).toMatchObject({ ok: true, remaining: 0 })
    limiter.refund('org:credits', 25)
    expect(limiter.peek('org:credits', policy)).toMatchObject({ ok: true, remaining: 25 })
    // Un costo mayor que el tope espera a tener el balde lleno, no para siempre.
    expect(limiter.take('org:credits', policy, 500).retryAfterSec).toBeGreaterThan(0)
  })

  it('tope 0 bloquea siempre; cambiar la política conserva la proporción usada', () => {
    const c = clock()
    const limiter = new KeyedRateLimiter(c.now)
    expect(limiter.take('taller', { limit: 0, windowMs: 1000 })).toMatchObject({ ok: false })
    limiter.take('plan', { limit: 10, windowMs: 60_000 }, 5) // usó la mitad
    expect(limiter.peek('plan', { limit: 20, windowMs: 60_000 }).remaining).toBe(10)
    limiter.reset('plan')
    expect(limiter.peek('plan', { limit: 20, windowMs: 60_000 }).remaining).toBe(20)
  })

  it('acota la memoria olvidando primero los baldes llenos', () => {
    const c = clock()
    const limiter = new KeyedRateLimiter(c.now, 100)
    for (let i = 0; i < 100; i++) limiter.take(`k${i}`, { limit: 5, windowMs: 1000 })
    c.advance(5000) // todos se rellenaron
    limiter.take('nueva', { limit: 5, windowMs: 1000 })
    expect(limiter.size).toBeLessThanOrEqual(2)
  })

  it('rateLimited → 429 too_many_requests con retryAfter', () => {
    const error = rateLimited({ retryAfterSec: 12 })
    expect(error).toBeInstanceOf(HttpError)
    expect(error.status).toBe(429)
    expect(error.toJSON()).toMatchObject({ error: { code: 'too_many_requests' }, retryAfter: 12 })
  })
})
