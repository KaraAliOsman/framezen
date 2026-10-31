/**
 * Contrato HTTP entre apps/server y apps/web. Todas las rutas cuelgan de /api.
 * JSON en ambos sentidos; fechas en ISO 8601; dinero CLP entero; medidas mm.
 * Errores: { error: { code: string; message: string } } con mensaje humano en español.
 * Sesión: cookie httpOnly "fz_session" (SameSite=Lax). Todo lo privado se filtra por la
 * organización de la sesión en el servidor.
 */
import type {
  Brand,
  BrandSettings,
  Catalog,
  Glass,
  Id,
  Line,
  Pauta,
  PricingSettings,
  CutSettings,
  QuoteExtra,
  QuoteTotals,
  WindowDesign,
} from '@framezen/engine'
import type { Feature, PlanCode, Role } from './plans'

export interface ApiError {
  error: { code: string; message: string; field?: string }
}

// ── Auth y sesión ──────────────────────────────────────────────────────────────
export interface SignupBody {
  name: string
  email: string
  password: string
  company: string
}
export interface LoginBody {
  email: string
  password: string
}

export interface User {
  id: Id
  name: string
  email: string
  createdAt: string
}

export interface Org {
  id: Id
  name: string // nombre de fantasía
  legalName?: string
  rut?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  website?: string
  /** Logo como data URL (PNG/SVG/JPG, máx 1 MB). */
  logo?: string
  /** Color de marca para documentos (#RRGGBB). */
  accent?: string
  createdAt: string
}

export type PaidPlanCode = Exclude<PlanCode, 'trial'>
export type BillingPeriod = 'monthly' | 'yearly'

export interface BillingState {
  plan: PlanCode
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
  period: BillingPeriod | null
  trialEndsAt?: string
  currentPeriodEnd?: string
  seats: number | null
  seatsUsed: number
  /** `resetsAt`: cuándo se renuevan los créditos del mes (o cuándo termina la prueba). */
  aiCredits: { included: number; used: number; extra: number; resetsAt?: string }
  features: Feature[]
  /** Proveedor configurado en el servidor: 'flow' en producción, 'dev' activa al instante. */
  provider: 'flow' | 'dev'
}

/** Por qué la cuenta quedó en modo lectura (se ve y se exporta todo; no se crea ni modifica). */
export type ReadOnlyReason = 'trial_ended' | 'plan_ended' | 'payment_overdue'

/** Lo que el estado detallado agrega a BillingState (GET /api/billing y GET /api/me). */
export interface BillingDetailFields {
  readOnly: boolean
  readOnlyReason?: ReadOnlyReason
  /** Mensaje humano listo para el aviso de modo lectura. */
  readOnlyMessage?: string
  /** Cancelado: sigue activo hasta currentPeriodEnd y no se renueva. */
  cancelAtPeriodEnd: boolean
  /** Cambio a un plan más barato programado para el fin del período. */
  pendingChange?: { plan: PaidPlanCode; period: BillingPeriod; at: string }
  /** Saldo a favor (CLP con IVA) que se descuenta del próximo cambio. */
  creditBalance: number
  card?: { brand?: string; last4: string }
}

/** GET /api/billing: BillingState + modo lectura, cambio programado, saldo y tarjeta. */
export interface BillingStateDetail extends BillingState, BillingDetailFields {}

/** Cambio de plan aplicado o programado (prorrateo simple). */
export interface PlanChangeSummary {
  immediate: boolean
  /** Cobro de hoy (CLP con IVA). */
  chargeNow: number
  /** Saldo a favor aplicado (días no usados del plan anterior + saldo previo). */
  credit: number
  /** Saldo a favor que queda. */
  newBalance: number
  /** Desde cuándo rige el plan nuevo. */
  effectiveAt: string
}

/** POST /api/billing/checkout */
export interface CheckoutBody {
  plan: PaidPlanCode
  period: BillingPeriod
}

/** Respuesta de POST /api/billing/checkout. */
export interface CheckoutResult {
  /** URL de pago (Flow) o null si el plan ya quedó activo (proveedor 'dev' o cambio sin cobro). */
  url: string | null
  billing?: BillingStateDetail
  checkoutId?: string
  /** Mensaje humano para el aviso («Listo: ya tienes el plan Pro»). */
  message?: string
  change?: PlanChangeSummary
}

/** POST /api/billing/cancel y POST /api/billing/resume. */
export interface BillingActionResult {
  billing: BillingStateDetail
  message: string
}

/** GET /api/billing/preview?plan&period: qué pasaría al elegir ese plan (no cobra nada). */
export interface BillingPreview {
  plan: PaidPlanCode
  period: BillingPeriod
  /** Precio del período completo, con IVA. */
  amount: number
  immediate: boolean
  chargeNow: number
  credit: number
  newBalance: number
  effectiveAt: string
  label?: string
}

/** Fila de GET /api/billing/history ({ items, total }): intentos de pago y cambios de plan. */
export interface BillingHistoryRow {
  id: string
  kind: 'subscribe' | 'change' | 'resume'
  plan: PaidPlanCode
  period: BillingPeriod
  amount: number
  credit: number
  status: 'pending' | 'processing' | 'paid' | 'applied' | 'rejected' | 'canceled' | 'failed'
  provider: string
  createdAt: string
  appliedAt?: string
  /** Cambio programado para el fin del período (sin cobro ahora): `at` es cuándo se aplica. */
  meta?: { scheduled?: boolean; at?: string }
}

export interface Me {
  user: User
  org: Org
  role: Role
  /** El servidor envía el estado detallado (BillingStateDetail): readOnly, cancelación, saldo… */
  billing: BillingState & Partial<BillingDetailFields>
  /** Una persona sola: la interfaz oculta roles y equipo. */
  solo: boolean
  onboarded: boolean
}

// ── Ajustes de la organización ────────────────────────────────────────────────
export type QuoteTemplateId = 'esencial' | 'galeria' | 'compacta' | 'editorial'
export type CatalogTemplateId = 'vitrina' | 'ficha' | 'lookbook'

export interface DocumentPrefs {
  quoteTemplate: QuoteTemplateId
  catalogTemplate: CatalogTemplateId
  font: 'instrument' | 'serif' | 'grotesk'
  accent?: string // si no, el de la organización
  showUnitPrice: boolean
  showArea: boolean
  showGlass: boolean
  showLine: boolean
  showColorSwatch: boolean
  showExteriorView: boolean
  paper: 'letter' | 'a4'
  intro: string // texto de saludo/presentación
  conditions: string // condiciones comerciales (markdown simple)
  paymentTerms: string // "50% al aceptar, 50% contra entrega"
  warranty: string
  validityDays: number // 15
  leadTimeText: string // "Fabricación e instalación en 15 días hábiles"
  signatureName?: string
  footer?: string
}

export interface Defaults {
  lineId?: Id
  colorId?: Id
  glassId?: Id
}

export interface OrgSettings {
  pricing: PricingSettings
  cut: CutSettings
  documents: DocumentPrefs
  defaults: Defaults
  /** Próximo número de cotización y de OT (para continuar la numeración anterior). */
  nextQuoteNumber: number
  nextWorkOrderNumber: number
}

// ── Catálogo de la organización ──────────────────────────────────────────────
/** Pauta parcial propia del taller (sólo lo que difiere de la de fábrica). */
export type PautaPatch = Partial<Omit<Pauta, 'reinforcement'>> & { reinforcement?: Partial<NonNullable<Pauta['reinforcement']>> }

/** Pautas de fábrica de una línea (para «Volver a la de fábrica»). */
export interface FactoryPauta {
  pauta: Pauta
  doorPauta?: Partial<Pauta>
  sashInPauta?: Partial<Pauta>
}

/** Ajuste de pauta de una línea guardado por la organización. */
export interface LineOverride {
  pauta?: PautaPatch
  doorPauta?: PautaPatch
  sashInPauta?: PautaPatch
  updatedAt?: string
}

/** Línea del catálogo efectivo: si el taller ajustó su pauta, `factory` trae la original. */
export type EffectiveLine = Line & { factory?: FactoryPauta }

/**
 * GET /api/catalog → catálogo con precios efectivos de la organización (sólo marcas activas).
 * Las líneas con pauta ajustada traen `factory`; los vidrios, el área mínima propia si la hay.
 */
export type CatalogResponse = Omit<Catalog, 'lines'> & { lines: EffectiveLine[]; updatedAt: string }

export interface PriceOverride {
  kind: 'profile' | 'item' | 'glass'
  id: Id
  colorId?: Id // para perfiles
  price: number
}

/** Resumen de una marca para la pantalla de catálogo (GET /api/catalog/brands). */
export interface CatalogBrandSummary {
  brand: Brand
  enabled: boolean
  settings: BrandSettings
  completeness: 'verified' | 'complete' | 'partial' | 'none'
  /** Una de las marcas con datos más completos (las que se activan por defecto). */
  recommended: boolean
  counts: {
    lines: number
    profiles: number
    items: number
    glass: number
    /** Perfiles, ítems y vidrios con precio mayor que cero. */
    priced: number
    unpriced: number
    /** Precios propios cargados por el taller para esta marca. */
    overrides: number
  }
}

/** GET /api/catalog/brands */
export interface CatalogBrandsResponse extends Paged<CatalogBrandSummary> {
  baseVersion: string
}

/** GET y PUT /api/catalog/prices (PUT agrega `ignored`). */
export interface PriceOverridesResponse {
  overrides: PriceOverride[]
  updatedAt: string
  /** Precios enviados cuyo perfil, herraje o vidrio no existe en el catálogo. */
  ignored?: number
}

/**
 * POST /api/catalog/import-csv (texto CSV, o JSON { csv, brandId?, dryRun? }; también ?dryRun=1).
 * Con `dryRun` no se guarda nada: es la vista previa de lo que pasaría.
 */
export interface ImportCsvResult {
  dryRun: boolean
  rows: number
  matched: number
  unmatched: number
  skipped: number
  brands: string[]
  unmatchedSample: { code: string; description: string; brand: string }[]
  /** Precios propios que quedan (o quedarían, en la vista previa) después de importar. */
  overridesTotal: number
  updatedAt: string
  message: string
}

/** PATCH /api/catalog/lines/:id — número = valor propio; null = vuelve al de fábrica. */
export type PautaPatchBody = { [K in Exclude<keyof Pauta, 'reinforcement'>]?: Pauta[K] | null } & {
  reinforcement?: { frame?: number | null; sash?: number | null; mullion?: number | null } | null
}
export interface LinePatchBody {
  pauta?: PautaPatchBody | null
  doorPauta?: PautaPatchBody | null
  sashInPauta?: PautaPatchBody | null
}
export interface LinePatchResponse {
  line: EffectiveLine
  /** Ajuste guardado (null = la línea quedó con la pauta de fábrica). */
  override: LineOverride | null
  factory: FactoryPauta
  updatedAt: string
}

/** PATCH /api/catalog/glass/:id — área mínima cobrada propia (m²); null = vuelve a la de fábrica. */
export interface GlassPatchBody {
  minArea: number | null
}
export interface GlassPatchResponse {
  /** Vidrio tal como lo cotiza la organización (con su área mínima efectiva). */
  glass: Glass
  /** Área mínima propia del taller (null = usa la de fábrica). */
  minArea: number | null
  factoryMinArea: number | null
  updatedAt: string
}

// ── Clientes ─────────────────────────────────────────────────────────────────
export interface Client {
  id: Id
  name: string
  rut?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  notes?: string
  createdAt: string
  updatedAt: string
  /** Agregados para listas. */
  quotesCount?: number
  totalAccepted?: number
  /** Avisos al crear o editar (p. ej. RUT dudoso): nunca bloquean. */
  warnings?: string[]
}

// ── Cotizaciones ─────────────────────────────────────────────────────────────
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'workshop' | 'installed' | 'closed'

export interface QuoteItem {
  id: Id
  ref: string // "V1", "V2"… editable
  name?: string // "Ventana living"
  location?: string // ambiente
  qty: number
  design: WindowDesign
  notes?: string
  /** Precio unitario neto manual (reemplaza al calculado; se marca como manual). */
  manualUnitPrice?: number
}

export interface Quote {
  id: Id
  number: number
  title: string // nombre de la obra: "Casa Pérez · Concepción"
  clientId?: Id
  client?: Client
  status: QuoteStatus
  items: QuoteItem[]
  extras: QuoteExtra[]
  discountPct: number
  /** Ajustes de precio de esta cotización (si no, los de la organización). */
  pricing?: Partial<PricingSettings>
  notes?: string // internas
  /** Textos del documento sobrescritos para esta cotización. */
  documentOverrides?: Partial<DocumentPrefs>
  validUntil?: string
  revision: number // 0 = sin enviar, 1 = primera versión enviada…
  shareToken?: string
  totals?: QuoteTotals // calculado por el servidor al guardar
  version: number // control optimista
  createdAt: string
  updatedAt: string
  sentAt?: string
  acceptedAt?: string
  acceptedBy?: { name: string; rut?: string; at: string }
}

export type QuoteSummary = Pick<
  Quote,
  'id' | 'number' | 'title' | 'status' | 'revision' | 'createdAt' | 'updatedAt' | 'sentAt' | 'acceptedAt'
> & { clientName?: string; total: number; units: number; firstItem?: QuoteItem }

/** PUT /api/quotes/:id — autoguardado del documento completo. 409 si version no coincide. */
export type QuoteSaveBody = Omit<Quote, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'totals' | 'client' | 'shareToken' | 'revision'>

/** Cuerpo del 409 de PUT /api/quotes/:id: la versión vigente, para retomar sin perder nada. */
export interface QuoteConflictBody extends ApiError {
  version: number
  quote: Quote
}

/** POST /api/quotes/:id/send — crea la revisión siguiente y deja el enlace público listo. */
export interface SendQuoteBody {
  channel?: 'link' | 'email' | 'whatsapp'
  /** Correo del destinatario (canal 'email'). */
  to?: string
  message?: string
}
export interface SendQuoteResponse {
  quote: Quote
  /** Enlace del portal: APP_URL/c/:token */
  url: string
  revision: number
  /** «A», «B»… */
  revisionLabel: string
}

/** Precio neto por ítem calculado por el motor (clave: id del ítem). */
export interface ItemPrice {
  unitNet: number
  totalNet: number
}
export type ItemPrices = Record<string, ItemPrice>

/** Cotización enviada sin respuesta, con lo necesario para escribirle al cliente. */
export type QuoteFollowUp = QuoteSummary & { clientPhone?: string; shareToken?: string }

/** GET /api/quotes/stats — embudo por estado, vendido del mes (y del anterior) y seguimientos. */
export interface QuoteStats {
  byStatus: Record<QuoteStatus, { count: number; total: number }>
  /** Aceptadas este mes calendario (hora de Chile); total neto. */
  soldThisMonth: { count: number; total: number }
  soldLastMonth: { count: number; total: number }
  /** Enviadas hace más de 3 días sin respuesta (las más antiguas primero). */
  followUps: QuoteFollowUp[]
}

// ── Portal del cliente (público) ─────────────────────────────────────────────
export interface PublicQuote {
  quote: Quote
  org: Pick<Org, 'name' | 'legalName' | 'rut' | 'address' | 'city' | 'phone' | 'email' | 'website' | 'logo' | 'accent'>
  documents: DocumentPrefs
  catalog: CatalogResponse // sólo lo necesario para dibujar y describir
  features: Feature[] // p. ej. client3d
}

/** GET /api/public/quotes/:token — PublicQuote + precios por ítem de la revisión enviada. */
export type PublicQuoteResponse = PublicQuote & {
  prices: ItemPrices
  /** Letra de la revisión que ve el cliente («A», «B»…). */
  revisionLabel: string
}

/** POST /api/public/quotes/:token/accept */
export interface AcceptResult {
  ok: boolean
  alreadyAccepted: boolean
  status: QuoteStatus
  acceptedBy?: { name: string; rut?: string; at: string }
  /** Avisos que no bloquean (p. ej. RUT con dígito verificador dudoso). */
  warnings: string[]
}

/** 503 de los PDF cuando no hay Chromium: `fallback.html` es la URL del HTML imprimible. */
export interface PdfUnavailableBody extends ApiError {
  fallback: { html: string; fileName: string }
}

// ── Producción ───────────────────────────────────────────────────────────────
export type Station = 'cut' | 'weld' | 'assembly' | 'hardware' | 'glazing' | 'qc' | 'ready' | 'installed'

export interface WorkOrder {
  id: Id
  number: number
  quoteId: Id
  quoteNumber: number
  title: string
  clientName?: string
  status: 'open' | 'in_progress' | 'done'
  /** Avance por ítem de la cotización (ref → estación actual). */
  progress: Record<string, Station>
  dueDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── Equipo ───────────────────────────────────────────────────────────────────
export interface TeamMember {
  userId: string
  name: string
  email: string
  role: Role
  joinedAt: string
  isYou: boolean
}

export interface PendingInvitation {
  id: string
  email?: string
  role: Role
  createdAt: string
  expiresAt: string
}

/** GET /api/team */
export interface TeamResponse {
  members: TeamMember[]
  invitations: PendingInvitation[]
  seats: number | null
  seatsUsed: number
}

/** POST /api/team/invite { email?, role } */
export interface InviteResponse {
  invitation: PendingInvitation
  /** Enlace para compartir: APP_URL/invitacion/:token */
  link: string
}

/** GET /api/invitations/:token (público). */
export interface InvitationInfo {
  orgName: string
  role: Role
  roleName?: string
  /** Si la invitación fue a un correo concreto. */
  email?: string
  /** Nombre de quien invitó. */
  invitedBy?: string
  expiresAt?: string
}

// ── Asistente ────────────────────────────────────────────────────────────────
export interface AssistantMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: { id: string; name: string; arguments: string }[]
  toolCallId?: string
}

export interface AssistantRequest {
  messages: AssistantMessage[]
  /** Lo que el usuario está viendo: ruta, cotización abierta, ítem seleccionado. */
  context: { route: string; quoteId?: Id; itemId?: Id; summary?: string }
}

export interface AssistantResponse {
  message: AssistantMessage
  creditsUsed: number
  creditsLeft: number
  /** 'ai' = modelo real; 'local' = intérprete sin IA (plan Taller o sin clave configurada). */
  mode: 'ai' | 'local'
}

// ── Actividad ────────────────────────────────────────────────────────────────
export interface ActivityEvent {
  id: Id
  at: string
  actor?: string
  kind: string // 'quote.created', 'quote.sent', 'quote.accepted', 'workorder.created'…
  text: string // "Ana envió la cotización N° 412 a Pedro Soto"
  link?: string
}

export interface Paged<T> {
  items: T[]
  total: number
}
