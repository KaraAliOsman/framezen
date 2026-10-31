import { describe, expect, it } from 'vitest'
import type { BillingState } from '@framezen/shared'
import { createHistory, historyReducer, type UndoAction } from '../src/lib/useUndo'
import { describePlan } from '../src/lib/plan'

const set = (value: number | ((n: number) => number), extra: Partial<Extract<UndoAction<number>, { type: 'set' }>> = {}) =>
  ({ type: 'set', value, at: 0, limit: 100, mergeWindowMs: 800, ...extra }) as UndoAction<number>

describe('historial de deshacer', () => {
  it('deshace y rehace en orden', () => {
    let h = createHistory(1)
    h = historyReducer(h, set(2))
    h = historyReducer(h, set((n) => n + 1))
    expect(h.present).toBe(3)
    h = historyReducer(h, { type: 'undo' })
    expect(h.present).toBe(2)
    h = historyReducer(h, { type: 'undo' })
    expect(h.present).toBe(1)
    h = historyReducer(h, { type: 'undo' })
    expect(h.present).toBe(1)
    h = historyReducer(h, { type: 'redo' })
    expect(h.present).toBe(2)
    h = historyReducer(h, set(9))
    expect(h.future).toHaveLength(0)
  })

  it('agrupa cambios seguidos con la misma clave (escribir un título)', () => {
    let h = createHistory(0)
    h = historyReducer(h, set(1, { mergeKey: 'title', at: 0 }))
    h = historyReducer(h, set(2, { mergeKey: 'title', at: 300 }))
    h = historyReducer(h, set(3, { mergeKey: 'title', at: 600 }))
    expect(h.past).toEqual([0])
    h = historyReducer(h, set(4, { mergeKey: 'title', at: 2000 }))
    expect(h.past).toEqual([0, 3])
  })

  it('respeta el límite y no crea pasos sin cambios', () => {
    let h = createHistory(0)
    for (let i = 1; i <= 5; i++) h = historyReducer(h, set(i, { limit: 3 }))
    expect(h.past).toEqual([2, 3, 4])
    const same = historyReducer(h, set(5))
    expect(same).toBe(h)
    const silent = historyReducer(h, set(6, { skipHistory: true }))
    expect(silent.past).toEqual([2, 3, 4])
    expect(silent.present).toBe(6)
  })
})

describe('plan de la cuenta', () => {
  const base: BillingState = {
    plan: 'trial',
    status: 'trialing',
    period: null,
    trialEndsAt: '2026-11-09T12:00:00Z',
    seats: 3,
    seatsUsed: 1,
    aiCredits: { included: 500, used: 120, extra: 0 },
    features: ['assistant', 'client3d', 'purchasing', 'cnc'],
    provider: 'dev',
  }

  it('cuenta los días de prueba y las funciones de Pro', () => {
    const plan = describePlan(base, new Date('2026-10-31T12:00:00Z'))
    expect(plan.name).toBe('Prueba Pro')
    expect(plan.isTrial).toBe(true)
    expect(plan.trialDaysLeft).toBe(9)
    expect(plan.readOnly).toBe(false)
    expect(plan.has('purchasing')).toBe(true)
    expect(plan.has('stations')).toBe(false)
    expect(plan.credits.left).toBe(380)
  })

  it('al vencer queda en solo lectura, nunca bloqueada', () => {
    const plan = describePlan({ ...base, status: 'expired' }, new Date('2026-11-20T12:00:00Z'))
    expect(plan.readOnly).toBe(true)
    expect(plan.trialDaysLeft).toBe(0)
  })

  it('un pago atrasado sigue funcionando con aviso', () => {
    const plan = describePlan({ ...base, plan: 'taller', status: 'past_due', features: [] })
    expect(plan.name).toBe('Taller')
    expect(plan.readOnly).toBe(false)
    expect(plan.pastDue).toBe(true)
  })
})
