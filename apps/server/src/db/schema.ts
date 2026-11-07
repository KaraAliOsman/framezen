/**
 * Esquema de DEKOPEN (Postgres / PGlite). Todo lo privado lleva org_id y se
 * filtra SIEMPRE por la organización de la sesión. Ids de texto generados en la app.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { BrandSettings, Catalog, Item, Glass, Color, QuoteExtra, QuoteTotals, PricingSettings } from '@dekopen/engine'
import type { DocumentPrefs, LineOverride, OrgSettings, PriceOverride, Quote, QuoteDocOverridesV2, QuoteItem, SendFormat, Station, QuoteStatus } from '@dekopen/shared'
import type { PlanCode, Role } from '@dekopen/shared'
import { assistants, conversations } from './schema-assistant'

// Tablas v5 en archivos propios (mismo objeto `schema` de drizzle: Db las conoce).
export * from './schema-assets'
export * from './schema-assistant'
export * from './schema-templates'
export * from './schema-payments'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()
const updatedAt = () => ts('updated_at').notNull().defaultNow()

// ── Personas y organizaciones ────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  /** Idioma de la interfaz elegido por la persona (null = navegador o idioma de la empresa). */
  locale: text('locale'),
  lastOrgId: text('last_org_id'),
  lastLoginAt: ts('last_login_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)])

export const orgs = pgTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  rut: text('rut'),
  address: text('address'),
  city: text('city'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  logo: text('logo'),
  accent: text('accent'),
  /** Idioma por defecto de los documentos (PDF, portal, correos al cliente). */
  locale: text('locale').notNull().default('es'),
  /** Moneda ISO 4217 de los precios. */
  currency: text('currency').notNull().default('CLP'),
  onboardedAt: ts('onboarded_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const memberships = pgTable('memberships', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').$type<Role>().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('memberships_org_user_uq').on(t.orgId, t.userId), index('memberships_user_idx').on(t.userId)])

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: createdAt(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)])

export const invitations = pgTable('invitations', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  email: text('email'),
  role: text('role').$type<Role>().notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  acceptedBy: text('accepted_by').references(() => users.id, { onDelete: 'set null' }),
  revokedAt: ts('revoked_at'),
}, (t) => [uniqueIndex('invitations_token_uq').on(t.tokenHash), index('invitations_org_idx').on(t.orgId)])

export const passwordResets = pgTable('password_resets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
}, (t) => [uniqueIndex('password_resets_token_uq').on(t.tokenHash)])

/** Ajustes guardados (sin los contadores, que viven en columnas para incrementarlos atómicamente). */
export type StoredSettings = Omit<OrgSettings, 'nextQuoteNumber' | 'nextWorkOrderNumber'>

export const orgSettings = pgTable('org_settings', {
  orgId: text('org_id').primaryKey().references(() => orgs.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<StoredSettings>().notNull(),
  nextQuoteNumber: integer('next_quote_number').notNull().default(1),
  nextWorkOrderNumber: integer('next_work_order_number').notNull().default(1),
  updatedAt: updatedAt(),
})

// ── Catálogo ─────────────────────────────────────────────────────────────────
export const catalogBase = pgTable('catalog_base', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  source: text('source').notNull(), // 'file:<ruta>' | 'sample'
  hash: text('hash').notNull(),
  data: jsonb('data').$type<Catalog>().notNull(),
  createdAt: createdAt(),
}, (t) => [index('catalog_base_created_idx').on(t.createdAt)])

/**
 * Lo propio del taller sobre el catálogo base: ítems, vidrios y colores que se suman, ajustes de
 * pauta por línea y área mínima de vidrio por id. Nunca se toca al re-sembrar el catálogo base.
 */
export interface CustomCatalog {
  items?: Item[]
  glass?: Glass[]
  colors?: Color[]
  /** Pauta propia por línea (sólo lo que difiere de la de fábrica). */
  lines?: Record<string, LineOverride>
  /** Área mínima cobrada propia por vidrio (m²; 0 = sin mínimo). */
  glassMinArea?: Record<string, number>
}

export const orgCatalog = pgTable('org_catalog', {
  orgId: text('org_id').primaryKey().references(() => orgs.id, { onDelete: 'cascade' }),
  enabledBrandIds: jsonb('enabled_brand_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  brandSettings: jsonb('brand_settings').$type<BrandSettings[]>().notNull().default(sql`'[]'::jsonb`),
  priceOverrides: jsonb('price_overrides').$type<PriceOverride[]>().notNull().default(sql`'[]'::jsonb`),
  custom: jsonb('custom').$type<CustomCatalog>().notNull().default(sql`'{}'::jsonb`),
  updatedAt: updatedAt(),
})

// ── Clientes ─────────────────────────────────────────────────────────────────
export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  rut: text('rut'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts('deleted_at'),
}, (t) => [index('clients_org_name_idx').on(t.orgId, t.name)])

// ── Cotizaciones ─────────────────────────────────────────────────────────────
/** Documento de la cotización (lo que no necesita columna propia). */
export interface QuoteData {
  items: QuoteItem[]
  extras: QuoteExtra[]
  discountPct: number
  pricing?: Partial<PricingSettings>
  notes?: string
  /** Dirección de instalación, si difiere de la del cliente. */
  siteAddress?: string
  /** v2 desde v5 (services/templates › normalizeIncomingDocOverrides); filas anteriores guardan v1 plano. */
  documentOverrides?: QuoteDocOverridesV2 | Partial<DocumentPrefs>
  validUntil?: string
  totals?: QuoteTotals
}

export const quotes = pgTable('quotes', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
  status: text('status').$type<QuoteStatus>().notNull().default('draft'),
  revision: integer('revision').notNull().default(0),
  shareToken: text('share_token'),
  version: integer('version').notNull().default(1),
  total: bigint('total', { mode: 'number' }).notNull().default(0),
  units: integer('units').notNull().default(0),
  firstItem: jsonb('first_item').$type<QuoteItem | null>(),
  data: jsonb('data').$type<QuoteData>().notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  sentAt: ts('sent_at'),
  acceptedAt: ts('accepted_at'),
  acceptedBy: jsonb('accepted_by').$type<Quote['acceptedBy'] | null>(),
  acceptedRevision: integer('accepted_revision'),
  /** Total de la última revisión enviada (lo que vio el cliente; `total` sigue al documento vivo). */
  sentTotal: bigint('sent_total', { mode: 'number' }),
  /** Total aceptado (el de la revisión aceptada): «vendido del mes» y ficha del cliente. */
  acceptedTotal: bigint('accepted_total', { mode: 'number' }),
  /** Cuándo volver a escribirle al cliente (al enviar o al posponer). Sin fecha: 3 días tras enviar. */
  followUpAt: ts('follow_up_at'),
  /** Motivo corto de «Perdida» (estado rejected). Es interno: nunca va en la foto que ve el cliente. */
  lostReason: text('lost_reason'),
  /** Cómo salió la última versión: con solo PDF no se puede saber si la abrió. */
  sentFormat: text('sent_format').$type<SendFormat>(),
  deletedAt: ts('deleted_at'),
}, (t) => [
  uniqueIndex('quotes_org_number_uq').on(t.orgId, t.number),
  uniqueIndex('quotes_share_token_uq').on(t.shareToken),
  index('quotes_org_status_idx').on(t.orgId, t.status),
  index('quotes_org_updated_idx').on(t.orgId, t.updatedAt),
  index('quotes_org_client_idx').on(t.orgId, t.clientId),
])

export const quoteRevisions = pgTable('quote_revisions', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  quoteId: text('quote_id').notNull().references(() => quotes.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  snapshot: jsonb('snapshot').$type<Quote>().notNull(),
  sentBy: text('sent_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  viewedAt: ts('viewed_at'),
  /** Primera descarga del PDF desde el portal. */
  pdfDownloadedAt: ts('pdf_downloaded_at'),
}, (t) => [uniqueIndex('quote_revisions_quote_rev_uq').on(t.quoteId, t.revision)])

// ── Producción ───────────────────────────────────────────────────────────────
export const workOrders = pgTable('work_orders', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  quoteId: text('quote_id').notNull().references(() => quotes.id, { onDelete: 'cascade' }),
  quoteNumber: integer('quote_number').notNull(),
  title: text('title').notNull(),
  clientName: text('client_name'),
  status: text('status').$type<'open' | 'in_progress' | 'done'>().notNull().default('open'),
  progress: jsonb('progress').$type<Record<string, Station>>().notNull().default(sql`'{}'::jsonb`),
  dueDate: text('due_date'),
  notes: text('notes'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('work_orders_org_number_uq').on(t.orgId, t.number),
  index('work_orders_org_status_idx').on(t.orgId, t.status),
  index('work_orders_quote_idx').on(t.quoteId),
])

// ── Plan, uso y actividad ────────────────────────────────────────────────────
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  plan: text('plan').$type<PlanCode>().notNull(),
  status: text('status').$type<'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'>().notNull(),
  period: text('period').$type<'monthly' | 'yearly'>(),
  trialEndsAt: ts('trial_ends_at'),
  currentPeriodStart: ts('current_period_start'),
  currentPeriodEnd: ts('current_period_end'),
  provider: text('provider').$type<'flow' | 'dev'>(),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  aiCreditsExtra: integer('ai_credits_extra').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('subscriptions_org_uq').on(t.orgId)])

export const aiUsage = pgTable('ai_usage', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  credits: integer('credits').notNull(),
  mode: text('mode').$type<'ai' | 'local'>().notNull().default('ai'),
  model: text('model'),
  /** Conversación y asistente del asistente v2 (costo por conversación). */
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  assistantId: text('assistant_id').references(() => assistants.id, { onDelete: 'set null' }),
  tokensIn: integer('tokens_in'),
  tokensCached: integer('tokens_cached'),
  tokensOut: integer('tokens_out'),
  createdAt: createdAt(),
}, (t) => [
  index('ai_usage_org_created_idx').on(t.orgId, t.createdAt),
  index('ai_usage_org_user_created_idx').on(t.orgId, t.userId, t.createdAt),
  index('ai_usage_org_conversation_idx').on(t.orgId, t.conversationId),
])

export const activity = pgTable('activity', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: text('actor_name'),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  link: text('link'),
  subjectType: text('subject_type'),
  subjectId: text('subject_id'),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  /** Pendiente de atender (p. ej. el cliente pidió cambios). */
  pending: boolean('pending').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  index('activity_org_created_idx').on(t.orgId, t.createdAt),
  index('activity_subject_idx').on(t.orgId, t.subjectId),
])
