/**
 * Abonos y llaves de cobro de cada taller (migración 0008_send_payments). Se reexporta desde
 * schema.ts. `org_payment_keys` guarda las llaves cifradas (lib/secret-box): nunca salen de
 * services/payments.
 */
import { bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type { PaymentMethod } from '@dekopen/shared'
import { orgs, quotes, users } from './schema'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export type QuotePaymentStatus = 'received' | 'pending' | 'rejected'

export const quotePayments = pgTable(
  'quote_payments',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    quoteId: text('quote_id').notNull().references(() => quotes.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    method: text('method').$type<PaymentMethod>().notNull(),
    status: text('status').$type<QuotePaymentStatus>().notNull().default('received'),
    reference: text('reference'),
    /** `commerceOrder` de Flow (solo pagos en línea). */
    providerOrder: text('provider_order'),
    paidAt: ts('paid_at'),
    recordedBy: text('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('quote_payments_quote_idx').on(t.quoteId), uniqueIndex('quote_payments_provider_order_uq').on(t.orgId, t.providerOrder)],
)

export const orgPaymentKeys = pgTable('org_payment_keys', {
  orgId: text('org_id').primaryKey().references(() => orgs.id, { onDelete: 'cascade' }),
  apiKey: text('api_key').notNull(),
  secretKey: text('secret_key').notNull(),
  sandbox: boolean('sandbox').notNull().default(false),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})
