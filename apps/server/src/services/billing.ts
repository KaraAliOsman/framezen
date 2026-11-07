import { and, count, eq, gte, sql } from 'drizzle-orm'
import { PLANS, TRIAL_CREDITS, TRIAL_DAYS, planFeatures, planSeats, type BillingState } from '@dekopen/shared'
import type { Db } from '../db/client'
import { aiUsage, memberships, subscriptions } from '../db/schema'
import { newId } from '../lib/crypto'

type SubscriptionRow = typeof subscriptions.$inferSelect

const DAY = 86_400_000

export function trialSubscription(orgId: string, now: Date, provider: 'flow' | 'dev'): typeof subscriptions.$inferInsert {
  return {
    id: newId(),
    orgId,
    plan: 'trial',
    status: 'trialing',
    period: null,
    trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY),
    currentPeriodStart: now,
    currentPeriodEnd: null,
    provider,
  }
}

/** Estado vigente según fechas (la fila puede quedar atrasada hasta el próximo webhook). */
export function effectiveStatus(sub: SubscriptionRow, now: Date): BillingState['status'] {
  if (sub.status === 'trialing') return sub.trialEndsAt && sub.trialEndsAt < now ? 'expired' : 'trialing'
  if (sub.status === 'active' && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() + 3 * DAY < now.getTime()) return 'past_due'
  if (sub.status === 'canceled' && (!sub.currentPeriodEnd || sub.currentPeriodEnd < now)) return 'expired'
  return sub.status
}

/** Inicio del período de créditos: la prueba completa, o el período pagado actual (o el mes). */
function creditsSince(sub: SubscriptionRow, now: Date): Date {
  if (sub.plan === 'trial') return sub.createdAt
  if (sub.currentPeriodStart) return sub.currentPeriodStart
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export async function getBillingState(db: Db, orgId: string, provider: 'flow' | 'dev', now = new Date()): Promise<BillingState> {
  let [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
  if (!sub) {
    // Organización antigua sin suscripción: se le abre una prueba para no bloquear.
    const row = trialSubscription(orgId, now, provider)
    await db.insert(subscriptions).values(row).onConflictDoNothing()
    ;[sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
  }
  const [{ seatsUsed }] = await db.select({ seatsUsed: count() }).from(memberships).where(eq(memberships.orgId, orgId))
  const [{ used }] = await db
    .select({ used: sql<number>`coalesce(sum(${aiUsage.credits}), 0)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.orgId, orgId), gte(aiUsage.createdAt, creditsSince(sub, now))))
  const plan = sub.plan
  return {
    plan,
    status: effectiveStatus(sub, now),
    period: sub.period ?? null,
    ...(sub.trialEndsAt ? { trialEndsAt: sub.trialEndsAt.toISOString() } : {}),
    ...(sub.currentPeriodEnd ? { currentPeriodEnd: sub.currentPeriodEnd.toISOString() } : {}),
    seats: planSeats(plan),
    seatsUsed: Number(seatsUsed),
    aiCredits: {
      included: plan === 'trial' ? TRIAL_CREDITS : PLANS[plan].aiCredits,
      used: Number(used),
      extra: sub.aiCreditsExtra,
    },
    features: planFeatures(plan),
    provider,
  }
}

/** Modo lectura: la prueba o el plan vencieron. Se puede ver y exportar, no crear. */
export function isReadOnly(billing: Pick<BillingState, 'status'>): boolean {
  return billing.status === 'expired'
}
