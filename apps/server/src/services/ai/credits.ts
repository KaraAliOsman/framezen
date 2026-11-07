/**
 * Créditos de IA con reserva atómica. Antes de llamar a la IA se aparta una estimación del costo
 * (una fila de ai_usage) con la suscripción de la organización bloqueada (SELECT … FOR UPDATE), y al
 * terminar se ajusta al costo real sin pasar del saldo. Así, varios pedidos simultáneos no pueden
 * gastar más créditos de los que quedan ni hacer llamadas pagadas sin saldo que las respalde.
 *
 * Las transacciones son cortas: la llamada a la IA nunca ocurre con el candado tomado.
 */
import { and, eq, gte, sql } from 'drizzle-orm'
import { planLimits, type BillingState, type PlanCode } from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import type { Db } from '../../db/client'
import { aiUsage, conversations, messages, subscriptions } from '../../db/schema'
import { newId } from '../../lib/crypto'
import { dayStartInZone } from '../../lib/dates'
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
async function lockedBudget(tx: Db, deps: AppDeps, orgId: string): Promise<{ left: number; dailyLeft: number }> {
  await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.orgId, orgId)).for('update')
  // Todo dentro de la transacción usa `tx`: en PGlite usar deps.db aquí esperaría al candado propio.
  const billing = await getBillingState(tx, orgId, deps.config.billingProvider, deps.now())
  // Tope diario de la empresa contado con el candado tomado: pedidos simultáneos (varias
  // conversaciones, el endpoint v1, plantillas, texturas) no pueden pasarlo entre todos.
  const [today] = await tx
    .select({ credits: sql<number>`coalesce(sum(${aiUsage.credits}), 0)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.mode, 'ai'), gte(aiUsage.createdAt, dayStartInZone(deps.now()))))
  return { left: creditsLeftOf(billing), dailyLeft: dailyCreditsLeft(billing.plan, { orgCredits: Number(today?.credits ?? 0) }) }
}

async function lockedCreditsLeft(tx: Db, deps: AppDeps, orgId: string): Promise<number> {
  return (await lockedBudget(tx, deps, orgId)).left
}

/**
 * Aparta hasta `estimate` créditos (al menos 1), sin pasar del saldo del mes ni de lo que queda del
 * tope diario de la empresa. null si no queda: el pedido debe resolverse sin llamar a la IA.
 */
export async function reserveCredits(
  deps: AppDeps,
  auth: Pick<AuthContext, 'org' | 'user'>,
  estimate: number,
  /** Asistente v2: a qué conversación y asistente se carga el costo. */
  link: { conversationId?: string; assistantId?: string } = {},
): Promise<CreditReservation | null> {
  return deps.db.transaction(async (raw) => {
    const tx = raw as unknown as Db
    const { left, dailyLeft } = await lockedBudget(tx, deps, auth.org.id)
    const budget = Math.min(left, dailyLeft)
    if (budget <= 0) return null
    const credits = Math.min(Math.max(1, Math.ceil(estimate)), budget)
    const id = newId()
    await tx.insert(aiUsage).values({
      id,
      orgId: auth.org.id,
      userId: auth.user.id,
      credits,
      mode: 'ai',
      model: null,
      conversationId: link.conversationId ?? null,
      assistantId: link.assistantId ?? null,
    })
    return { id, credits, left: left - credits }
  })
}

/**
 * Ajusta la reserva al costo real. Si costó más de lo reservado, cobra la diferencia solo hasta
 * agotar el saldo vigente (nunca lo sobregira). Nunca falla: ante un error deja la reserva tal cual.
 */
export async function settleCredits(
  deps: AppDeps,
  auth: Pick<AuthContext, 'org'>,
  reservation: CreditReservation,
  actual: number,
  model: string,
  /** Tokens reales de la llamada (ChatResult.usage), para el detalle por conversación. */
  usage?: { inputTokens: number; cachedInputTokens?: number; outputTokens: number },
): Promise<{ credits: number; left: number }> {
  try {
    return await deps.db.transaction(async (raw) => {
      const tx = raw as unknown as Db
      // El saldo bloqueado ya descuenta esta reserva.
      const left = await lockedCreditsLeft(tx, deps, auth.org.id)
      const credits = Math.max(0, Math.min(Math.ceil(actual), reservation.credits + left))
      await tx
        .update(aiUsage)
        .set({
          credits,
          model,
          ...(usage ? { tokensIn: usage.inputTokens, tokensCached: usage.cachedInputTokens ?? 0, tokensOut: usage.outputTokens } : {}),
        })
        .where(eq(aiUsage.id, reservation.id))
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

export interface DailyAiUsage {
  /** Créditos gastados hoy por la organización (hora de Chile). */
  orgCredits: number
  /** Llamadas pagadas al modelo hechas hoy por la persona (cada vuelta del bucle cuenta). */
  userCalls: number
  /**
   * Turnos de IA de la persona hoy: mensajes suyos (role 'user') que fueron al modelo
   * (source 'ai'; los comandos locales se guardan con source 'local' y no cuentan).
   */
  userTurns: number
  since: Date
}

/**
 * Uso de IA del día (desde las 00:00 hora de Chile) para los topes diarios del plan
 * (`planLimits(plan).aiCreditsPerOrgDay` y `.aiTurnsPerUserDay`). Cuenta en la base, así que vale
 * aunque haya varias instancias. Los comandos locales (mode 'local') no cuentan.
 */
export async function dailyAiUsage(deps: Pick<AppDeps, 'db' | 'now'>, orgId: string, userId: string): Promise<DailyAiUsage> {
  const since = dayStartInZone(deps.now())
  const [org] = await deps.db
    .select({ credits: sql<number>`coalesce(sum(${aiUsage.credits}), 0)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.mode, 'ai'), gte(aiUsage.createdAt, since)))
  const [user] = await deps.db
    .select({ calls: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.userId, userId), eq(aiUsage.mode, 'ai'), gte(aiUsage.createdAt, since)))
  const [turns] = await deps.db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.orgId, orgId),
        eq(conversations.userId, userId),
        eq(messages.role, 'user'),
        eq(messages.source, 'ai'),
        gte(messages.createdAt, since),
      ),
    )
  return { orgCredits: Number(org?.credits ?? 0), userCalls: Number(user?.calls ?? 0), userTurns: Number(turns?.count ?? 0), since }
}

/** Créditos que la organización aún puede gastar hoy según su plan (nunca negativo). */
export function dailyCreditsLeft(plan: PlanCode, usage: Pick<DailyAiUsage, 'orgCredits'>): number {
  return Math.max(0, planLimits(plan).aiCreditsPerOrgDay - usage.orgCredits)
}
