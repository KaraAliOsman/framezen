/**
 * Cliente de Flow.cl (API REST v3).
 *
 * Firma: los parámetros (sin `s`) se ordenan por nombre, se concatenan como
 * nombre+valor sin separadores y se firman con HMAC-SHA256 usando la secretKey; el
 * resultado en hexadecimal viaja en el parámetro `s`. GET en la query, POST como
 * application/x-www-form-urlencoded.
 *
 * Producción: https://www.flow.cl/api · Sandbox: https://sandbox.flow.cl/api
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type FlowParams = Record<string, string | number | undefined | null>

export const FLOW_PRODUCTION_URL = 'https://www.flow.cl/api'
export const FLOW_SANDBOX_URL = 'https://sandbox.flow.cl/api'

/** Parámetros limpios (sin vacíos) y como texto, tal como se firman y se envían. */
export function flowParams(params: FlowParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || key === 's') continue
    out[key] = String(value)
  }
  return out
}

/** Cadena a firmar: claves ordenadas, nombre+valor concatenados. */
export function flowSigningString(params: FlowParams): string {
  const clean = flowParams(params)
  return Object.keys(clean)
    .sort()
    .map((key) => `${key}${clean[key]}`)
    .join('')
}

/** Firma HMAC-SHA256 (hex) del parámetro `s`. */
export function flowSign(params: FlowParams, secretKey: string): string {
  return createHmac('sha256', secretKey).update(flowSigningString(params)).digest('hex')
}

/** Verifica una firma recibida (comparación en tiempo constante). */
export function flowVerify(params: FlowParams & { s?: string }, secretKey: string): boolean {
  const given = typeof params.s === 'string' ? params.s : ''
  const expected = flowSign(params, secretKey)
  if (given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

export class FlowError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | string | undefined,
    message: string,
  ) {
    super(message)
    this.name = 'FlowError'
  }
}

/** Estados de pago de Flow (payment/getStatus). */
export const FLOW_PAYMENT = { pending: 1, paid: 2, rejected: 3, canceled: 4 } as const
/** Estados de suscripción de Flow. */
export const FLOW_SUBSCRIPTION = { inactive: 0, active: 1, trial: 2, canceled: 4 } as const
/** Intervalos de plan de Flow. */
export const FLOW_INTERVAL = { daily: 1, weekly: 2, monthly: 3, yearly: 4 } as const

export interface FlowPaymentStatus {
  flowOrder: number
  commerceOrder: string
  requestDate?: string
  status: number
  subject?: string
  currency?: string
  amount: number | string
  payer?: string
  optional?: unknown
  paymentData?: { date?: string; media?: string; amount?: number | string; fee?: number | string } | null
}

export interface FlowCustomer {
  customerId: string
  email?: string
  name?: string
  externalId?: string
  status?: number | string
  creditCardType?: string
  last4CardDigits?: string
}

export interface FlowRegisterStatus {
  status: number | string
  customerId: string
  creditCardType?: string
  last4CardDigits?: string
}

export interface FlowPlan {
  planId: string
  name?: string
  amount: number | string
  interval: number | string
  status?: number | string
}

export interface FlowSubscription {
  subscriptionId: string
  planId: string
  customerId: string
  subscription_start?: string
  subscription_end?: string | null
  period_start?: string | null
  period_end?: string | null
  next_invoice_date?: string | null
  cancel_at_period_end?: number | string
  cancel_at?: string | null
  status: number | string
  /** 0 = al día, 1 = con facturas vencidas, 2 = pendientes sin vencer. */
  morose?: number | string
}

export interface FlowClientOptions {
  apiKey: string
  secretKey: string
  apiUrl?: string
  /** fetch inyectable (pruebas). */
  fetch?: typeof fetch
  timeoutMs?: number
}

export class FlowClient {
  readonly apiUrl: string
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number

  constructor(private readonly options: FlowClientOptions) {
    this.apiUrl = (options.apiUrl || FLOW_PRODUCTION_URL).replace(/\/+$/, '')
    this.fetchFn = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? 15_000
  }

  get sandbox(): boolean {
    return this.apiUrl.includes('sandbox')
  }

  /** Llamada firmada. Lanza FlowError con el mensaje de Flow si responde con error. */
  async call<T>(method: 'GET' | 'POST', path: string, params: FlowParams = {}): Promise<T> {
    const signed = flowParams({ ...params, apiKey: this.options.apiKey })
    signed.s = flowSign(signed, this.options.secretKey)
    const body = new URLSearchParams(signed)
    const url = `${this.apiUrl}/${path.replace(/^\/+/, '')}`
    let res: Response
    try {
      res =
        method === 'GET'
          ? await this.fetchFn(`${url}?${body.toString()}`, { method: 'GET', signal: AbortSignal.timeout(this.timeoutMs) })
          : await this.fetchFn(url, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
              signal: AbortSignal.timeout(this.timeoutMs),
            })
    } catch (error) {
      throw new FlowError(0, 'network', `Flow no respondió (${error instanceof Error ? error.message : String(error)})`)
    }
    const text = await res.text()
    let json: unknown
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { message: text.slice(0, 200) }
    }
    if (!res.ok) {
      const err = (json ?? {}) as { code?: number | string; message?: string }
      throw new FlowError(res.status, err.code, err.message || `Flow respondió ${res.status}`)
    }
    return json as T
  }

  // ── Pagos ──────────────────────────────────────────────────────────────────
  createPayment(p: {
    commerceOrder: string
    subject: string
    amount: number
    email: string
    urlConfirmation: string
    urlReturn: string
    currency?: string
    optional?: string
    timeout?: number
  }): Promise<{ url: string; token: string; flowOrder: number }> {
    return this.call('POST', 'payment/create', { currency: 'CLP', paymentMethod: 9, ...p })
  }

  getPaymentStatus(token: string): Promise<FlowPaymentStatus> {
    return this.call('GET', 'payment/getStatus', { token })
  }

  // ── Clientes y tarjeta ─────────────────────────────────────────────────────
  createCustomer(p: { name: string; email: string; externalId: string }): Promise<FlowCustomer> {
    return this.call('POST', 'customer/create', p)
  }

  getCustomer(customerId: string): Promise<FlowCustomer> {
    return this.call('GET', 'customer/get', { customerId })
  }

  registerCard(p: { customerId: string; url_return: string }): Promise<{ url: string; token: string }> {
    return this.call('POST', 'customer/register', p)
  }

  getRegisterStatus(token: string): Promise<FlowRegisterStatus> {
    return this.call('GET', 'customer/getRegisterStatus', { token })
  }

  // ── Planes y suscripciones ─────────────────────────────────────────────────
  getPlan(planId: string): Promise<FlowPlan> {
    return this.call('GET', 'plans/get', { planId })
  }

  createPlan(p: { planId: string; name: string; amount: number; interval: number; urlCallback?: string; currency?: string; days_until_due?: number }): Promise<FlowPlan> {
    return this.call('POST', 'plans/create', { currency: 'CLP', interval_count: 1, ...p })
  }

  createSubscription(p: { planId: string; customerId: string; subscription_start?: string }): Promise<FlowSubscription> {
    return this.call('POST', 'subscription/create', p)
  }

  getSubscription(subscriptionId: string): Promise<FlowSubscription> {
    return this.call('GET', 'subscription/get', { subscriptionId })
  }

  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<FlowSubscription> {
    return this.call('POST', 'subscription/cancel', { subscriptionId, at_period_end: atPeriodEnd ? 1 : 0 })
  }
}

/** Fecha de Flow («2026-11-30 13:45:00» o «2026-11-30») → Date (UTC). */
export function parseFlowDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : `${value.replace(' ', 'T')}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? '' : 'Z'}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Date → «yyyy-mm-dd» (subscription_start). */
export function flowDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}
