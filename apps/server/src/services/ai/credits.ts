/**
 * Créditos de IA con reserva atómica. Antes de llamar a la IA se aparta una estimación del costo
 * (una fila de ai_usage) con la suscripción de la organización bloqueada (SELECT … FOR UPDATE), y al
 * terminar se ajusta al costo real sin pasar del saldo. Así, varios pedidos simultáneos no pueden
 * gastar más créditos de los que quedan ni hacer llamadas pagadas sin saldo que las respalde.
 *
 * Las transacciones son cortas: la llamada a la IA nunca ocurre con el candado tomado.
 */
import { eq } from 'drizzle-orm'
import type { BillingState } from '@framezen/shared'
import type { AppDeps, AuthContext } from '../../context'
import type { Db } from '../../db/client'
import { aiUsage, subscriptions } from '../../db/schema'
import { newId } from '../../lib/crypto'
import { getBillingState } from '../billing'

export function creditsLeftOf(billing: Pick<BillingState, 'aiCredits'>): number {
  const { included, used, extra } = billing.aiCredits
  return Math.max(0, included + extra - used)
}

export interface CreditReservation {
  /** Fila de ai_usage que guarda la reserva. */
  id: string
  credits: number
  /** Saldo que queda después de la reserva. */
  left: number
}

/** Saldo con la suscripción bloqueada hasta el fin de la transacción (serializa por organización). */
async function lockedCreditsLeft(tx: Db, deps: AppDeps, orgId: string): Promise<number> {
  await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.orgId, orgId)).for('update')
  // Todo dentro de la transacción usa `tx`: en PGlite usar deps.db aquí esperaría al candado propio.
  const billing = await getBillingState(tx, orgId, deps.config.billingProvider, deps.now())
  return creditsLeftOf(billing)
}

/**
 * Aparta hasta `estimate` créditos (al menos 1). null si no queda saldo: el pedido debe resolverse
 * en modo local sin llamar a la IA.
 */
export async function reserveCredits(deps: AppDeps, auth: AuthContext, estimate: number): Promise<CreditReservation | null> {
  return deps.db.transaction(async (raw) => {
    const tx = raw as unknown as Db
    const left = await lockedCreditsLeft(tx, deps, auth.org.id)
    if (left <= 0) return null
    const credits = Math.min(Math.max(1, Math.ceil(estimate)), left)
    const id = newId()
    await tx.insert(aiUsage).values({ id, orgId: auth.org.id, userId: auth.user.id, credits, mode: 'ai', model: null })
    return { id, credits, left: left - credits }
  })
}

/**
 * Ajusta la reserva al costo real. Si costó más de lo reservado, cobra la diferencia solo hasta
 * agotar el saldo vigente (nunca lo sobregira). Nunca falla: ante un error deja la reserva tal cual.
 */
export async function settleCredits(
  deps: AppDeps,
  auth: AuthContext,
  reservation: CreditReservation,
  actual: number,
  model: string,
): Promise<{ credits: number; left: number }> {
  try {
    return await deps.db.transaction(async (raw) => {
      const tx = raw as unknown as Db
      // El saldo bloqueado ya descuenta esta reserva.
      const left = await lockedCreditsLeft(tx, deps, auth.org.id)
      const credits = Math.max(0, Math.min(Math.ceil(actual), reservation.credits + left))
      await tx.update(aiUsage).set({ credits, model }).where(eq(aiUsage.id, reservation.id))
      return { credits, left: Math.max(0, left + reservation.credits - credits) }
    })
  } catch (error) {
    deps.logger.warn('No se pudo ajustar la reserva de créditos del asistente', error)
    return { credits: reservation.credits, left: reservation.left }
  }
}

/** Devuelve la reserva completa (la IA falló o se canceló: no se cobra). */
export async function releaseCredits(deps: AppDeps, reservation: CreditReservation): Promise<void> {
  try {
    await deps.db.delete(aiUsage).where(eq(aiUsage.id, reservation.id))
  } catch (error) {
    deps.logger.warn('No se pudo liberar la reserva de créditos del asistente', error)
  }
}
