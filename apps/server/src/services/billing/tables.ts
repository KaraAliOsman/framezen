/**
 * Tablas propias de cobros (migración 0001_billing.sql). La suscripción vigente sigue en
 * `subscriptions` (esquema base); aquí va lo que necesita el cobro con Flow:
 * cambios programados, saldo a favor, tarjeta registrada y cada intento de pago.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type { PlanCode } from '@dekopen/shared'
import { orgs, users } from '../../db/schema'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export type PaidPlan = Exclude<PlanCode, 'trial'>
export type BillingPeriod = 'monthly' | 'yearly'

export const billingAccounts = pgTable('billing_accounts', {
  orgId: text('org_id')
    .primaryKey()
    .references(() => orgs.id, { onDelete: 'cascade' }),
  /** Cambio a un plan más barato, programado para el fin del período. */
  pendingPlan: text('pending_plan').$type<PaidPlan>(),
  pendingPeriod: text('pending_period').$type<BillingPeriod>(),
  /** Suscripción de Flow que parte al terminar el período (cambio programado o reactivación). */
  pendingSubscriptionId: text('pending_subscription_id'),
  /** Saldo a favor en CLP (prorrateo de un cambio de plan que sobró). */
  creditBalance: integer('credit_balance').notNull().default(0),
  cardBrand: text('card_brand'),
  cardLast4: text('card_last4'),
  /** Última consulta del estado de la suscripción en Flow. */
  syncedAt: ts('synced_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export type CheckoutKind = 'subscribe' | 'change' | 'resume'
export type CheckoutMethod = 'register' | 'payment' | 'direct'
export type CheckoutStatus = 'pending' | 'processing' | 'paid' | 'applied' | 'rejected' | 'canceled' | 'failed'

export const billingCheckouts = pgTable(
  'billing_checkouts',
  {
    /** También es el commerceOrder enviado a Flow. */
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').$type<CheckoutKind>().notNull(),
    method: text('method').$type<CheckoutMethod>().notNull(),
    provider: text('provider').$type<'flow' | 'dev'>().notNull(),
    plan: text('plan').$type<PaidPlan>().notNull(),
    period: text('period').$type<BillingPeriod>().notNull(),
    /** Lo que se cobra ahora, con IVA (0 si es sólo registrar la tarjeta). */
    amount: integer('amount').notNull().default(0),
    /** Saldo a favor aplicado (prorrateo del plan anterior y saldo previo). */
    credit: integer('credit').notNull().default(0),
    status: text('status').$type<CheckoutStatus>().notNull().default('pending'),
    token: text('token'),
    flowOrder: text('flow_order'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    appliedAt: ts('applied_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('billing_checkouts_token_uq').on(t.token), index('billing_checkouts_org_idx').on(t.orgId, t.createdAt)],
)

export type BillingAccountRow = typeof billingAccounts.$inferSelect
export type CheckoutRow = typeof billingCheckouts.$inferSelect
