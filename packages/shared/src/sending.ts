/**
 * Cómo envía cada taller sus cotizaciones y cómo le pagan. Tipos y reglas puras que comparten el
 * servidor y la web: el servidor decide, la web solo refleja. DEKOPEN no toca el dinero: aquí solo
 * hay datos que el taller publica para que su cliente le pague directo.
 */
import type { Locale } from './i18n'

// ── Envío ────────────────────────────────────────────────────────────────────
/** PDF es el predeterminado: es la costumbre del rubro. */
export const SEND_FORMATS = ['pdf', 'link', 'both'] as const
export type SendFormat = (typeof SEND_FORMATS)[number]
export type SendChannel = 'whatsapp' | 'email'

/** Plantilla del mensaje por canal e idioma. Vacía = la que trae DEKOPEN. */
export type SendTemplates = Partial<Record<SendChannel, Partial<Record<Locale, string>>>>

export interface SendingPrefs {
  format: SendFormat
  templates: SendTemplates
  /** Vista 3D en el portal (además, el plan debe incluirla). */
  portal3d: boolean
  /** Verla en la pared con la cámara del teléfono. Depende de `portal3d`. */
  portalAr: boolean
}

export const DEFAULT_SENDING: SendingPrefs = { format: 'pdf', templates: {}, portal3d: true, portalAr: true }

/** Variables de la plantilla. El total no existe a propósito: el mensaje nunca lo lleva. */
export const SEND_VARIABLES = ['saludo', 'cliente', 'referencia', 'numero', 'obra', 'taller', 'vendedor', 'enlace'] as const
export type SendVariable = (typeof SEND_VARIABLES)[number]

export function sendFormatIncludesPdf(format: SendFormat): boolean {
  return format !== 'link'
}

export function sendFormatIncludesLink(format: SendFormat): boolean {
  return format !== 'pdf'
}

/** Lo que recibió el cliente si la misma versión también salió por otra vía. */
export function widenSendFormat(current: SendFormat | null | undefined, next: SendFormat): SendFormat {
  if (!current || current === next) return next
  return 'both'
}

// ── Pagos ────────────────────────────────────────────────────────────────────
export const BANK_ACCOUNT_TYPES = ['corriente', 'vista', 'rut', 'ahorro', 'otra'] as const
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number]

export interface PaymentAccount {
  id: string
  holder: string
  rut: string
  bank: string
  type: BankAccountType
  number: string
  /** Correo para el comprobante. */
  email: string
}

export interface PaymentLink {
  id: string
  /** Lo que lee el cliente en el botón («Pagar con Flow»). */
  label: string
  url: string
}

export type DepositMode = 'none' | 'percent' | 'amount' | 'milestones'

/** Hito de pago: una parte del total con su momento, en palabras del taller («Al aceptar»). */
export interface PaymentMilestone {
  id: string
  label: string
  pct: number
}

export interface PaymentDeposit {
  mode: DepositMode
  /** Porcentaje del total, o monto en la moneda de la empresa. */
  value: number
  /** Solo en modo `milestones`: el primero es el abono. */
  milestones?: PaymentMilestone[]
}

/** Cuándo ve el cliente los datos de pago. Por defecto, solo después de aceptar. */
export type PaymentShowWhen = 'after_accept' | 'always'

export interface PaymentSettings {
  accounts: PaymentAccount[]
  instructions: string
  links: PaymentLink[]
  deposit: PaymentDeposit
  showWhen: PaymentShowWhen
  /** Imprimir estos datos en el PDF. Aparte de `showWhen`: un PDF circula y no sabe si lo aceptaron. */
  showInPdf: boolean
}

export const DEFAULT_PAYMENTS: PaymentSettings = {
  accounts: [],
  instructions: '',
  links: [],
  deposit: { mode: 'none', value: 0 },
  showWhen: 'after_accept',
  showInPdf: false,
}

export const PAYMENT_LIMITS = { accounts: 5, links: 6, instructions: 2000, url: 500, label: 60, milestones: 6 } as const

/** Existe en Node y en el navegador; este paquete compila sin la librería DOM. */
declare const URL: new (value: string) => { protocol: string; username: string; password: string; hostname: string; href: string }

/**
 * Enlace de pago que el taller pega: solo https, sin usuario ni contraseña incrustados y con un
 * dominio de verdad. Devuelve la dirección normalizada, o null. Lo aplican el servidor al guardar y
 * al publicar, y la web antes de dibujar el botón.
 */
export function safePaymentUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  // Sin espacios, controles ni barras invertidas: nada que el navegador corrija por su cuenta.
  if (!raw || raw.length > PAYMENT_LIMITS.url || /[\s\\]/.test(raw) || [...raw].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null
  let url: InstanceType<typeof URL>
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || host.endsWith('.') || /^[\d.]+$/.test(host) || host.startsWith('[')) return null
  return url.href
}

export interface PaymentPlanStep {
  label?: string
  pct?: number
  amount: number
}

/**
 * Los pagos que pide el taller sobre un total. Si los hitos suman 100 %, el último absorbe el redondeo:
 * la suma da exactamente el total.
 */
export function paymentPlan(deposit: PaymentDeposit | undefined, total: number): PaymentPlanStep[] {
  if (!deposit || !Number.isFinite(total) || total <= 0) return []
  if (deposit.mode === 'milestones') {
    const list = (deposit.milestones ?? []).filter((m) => Number.isFinite(m.pct) && m.pct > 0)
    const steps = list.map((m): PaymentPlanStep => ({ ...(m.label.trim() ? { label: m.label.trim() } : {}), pct: m.pct, amount: Math.round((total * Math.min(m.pct, 100)) / 100) }))
    if (steps.length && list.reduce((sum, m) => sum + m.pct, 0) === 100) {
      steps[steps.length - 1]!.amount = total - steps.slice(0, -1).reduce((sum, s) => sum + s.amount, 0)
    }
    return steps
  }
  const value = Number.isFinite(deposit.value) ? deposit.value : 0
  if (value <= 0) return []
  if (deposit.mode === 'percent') return [{ pct: Math.min(value, 100), amount: Math.min(total, Math.round((total * Math.min(value, 100)) / 100)) }]
  if (deposit.mode === 'amount') return [{ amount: Math.min(total, Math.round(value)) }]
  return []
}

/** Abono: el primer pago del plan (nunca más que el total). Sin abono o sin total: null. */
export function depositAmount(deposit: PaymentDeposit | undefined, total: number): number | null {
  return paymentPlan(deposit, total)[0]?.amount ?? null
}

/** Lo que falta del primer pago no cubierto con lo recibido. 0 si el plan ya está pagado. */
export function nextDue(plan: readonly PaymentPlanStep[], received: number): number {
  let covered = received
  for (const step of plan) {
    if (covered < step.amount) return step.amount - covered
    covered -= step.amount
  }
  return 0
}

/** Lo que el taller decidió imprimir en el PDF. Sin la opción o sin datos, nada. */
export interface PdfPaymentDetails {
  accounts: PaymentAccount[]
  instructions: string
  links: Pick<PaymentLink, 'id' | 'label' | 'url'>[]
  deposit: PaymentDeposit
}

export function pdfPaymentDetails(payments: PaymentSettings | undefined): PdfPaymentDetails | null {
  if (!payments?.showInPdf) return null
  const accounts = payments.accounts.filter(isUsableAccount)
  const links = payments.links.flatMap((link) => {
    const url = safePaymentUrl(link.url)
    return url && link.label.trim() ? [{ id: link.id, label: link.label.trim(), url }] : []
  })
  const instructions = payments.instructions.trim()
  const hasDeposit = paymentPlan(payments.deposit, 1_000_000).length > 0
  if (!accounts.length && !links.length && !instructions && !hasDeposit) return null
  return { accounts, instructions, links, deposit: payments.deposit }
}

/** Cuenta con lo mínimo para poder transferir. */
export function isUsableAccount(account: Pick<PaymentAccount, 'number' | 'bank'>): boolean {
  return Boolean(account.number.trim() && account.bank.trim())
}

/** ¿El taller configuró algún medio? Sin nada, el portal no muestra la sección. */
export function hasPaymentMethods(payments: PaymentSettings | undefined, flow = false): boolean {
  if (!payments) return flow
  return flow || payments.accounts.some(isUsableAccount) || Boolean(payments.instructions.trim()) || payments.links.some((link) => safePaymentUrl(link.url))
}

/** Sección de pago tal como la recibe el portal. Sin datos del taller, no viene. */
export interface PublicPayment {
  /** false: el taller los muestra solo tras aceptar; aún no llega ningún dato de pago. */
  unlocked: boolean
  /** Abono calculado por el servidor sobre el total vigente. */
  deposit?: { amount: number; mode: Exclude<DepositMode, 'none'>; pct?: number; milestones?: PaymentMilestone[] }
  accounts?: PaymentAccount[]
  instructions?: string
  links?: Pick<PaymentLink, 'id' | 'label' | 'url'>[]
  /** Pago en línea con la cuenta Flow del propio taller. */
  flow?: boolean
  /** Lo que el taller registró como recibido. */
  received?: { amount: number; at: string }
}

/** Experiencia del portal elegida por el taller (y permitida por su plan). */
export interface PublicExperience {
  view3d: boolean
  ar: boolean
}

// ── Abonos recibidos ─────────────────────────────────────────────────────────
export const PAYMENT_METHODS = ['transfer', 'link', 'flow', 'cash', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface QuotePayment {
  id: string
  amount: number
  method: PaymentMethod
  reference?: string
  /** Fecha en que entró el dinero. */
  paidAt: string
  recordedBy?: string
}

/** GET /api/quotes/:id/payments */
export interface QuotePaymentsResponse {
  payments: QuotePayment[]
  received: number
  /** Abono esperado según Ajustes, si el taller lo configuró. */
  deposit: number | null
  /** Lo que corresponde cobrar ahora, según el plan y lo recibido. */
  due: number | null
}

/** POST /api/quotes/:id/payments */
export interface QuotePaymentBody {
  amount: number
  method: PaymentMethod
  reference?: string
  /** Por defecto, ahora. */
  paidAt?: string
}

// ── Flow con las llaves del taller ───────────────────────────────────────────
/** GET /api/settings/payments/flow. Nunca trae las llaves. */
export interface FlowKeysStatus {
  /** El servidor puede guardar llaves cifradas (PAYMENT_KEYS_SECRET). */
  available: boolean
  configured: boolean
  sandbox: boolean
  updatedAt?: string
}

/** PUT /api/settings/payments/flow */
export interface FlowKeysBody {
  apiKey: string
  secretKey: string
  sandbox: boolean
}
