/**
 * Cliente HTTP tipado contra el contrato de `@dekopen/shared` (todas las rutas cuelgan de /api).
 * - Cada petición lleva `Accept-Language` con el idioma de la interfaz: el servidor responde sus
 *   mensajes en ese idioma (y lo declara con `Content-Language`).
 * - Errores humanos en el idioma de la interfaz: el mensaje del servidor si viene en ese idioma;
 *   si no, uno propio según el `code` estable o el estado HTTP (en español, exactamente los de hoy).
 * - Reintento suave para lecturas y escrituras idempotentes ante cortes de red o 502/503/504.
 */
import { acceptLanguage, matchLocale } from '@dekopen/shared'
import libMessages from './i18n/es'
import { getLocale, hasMessage, translate } from './i18n/runtime'
import type { QuoteSelection } from '@dekopen/engine'
import type {
  AcceptResult,
  ActivityEvent,
  ApiError,
  BillingActionResult,
  BillingHistoryRow,
  BillingPeriod,
  BillingPreview,
  BillingStateDetail,
  CatalogBrandsResponse,
  CatalogResponse,
  CheckoutResult,
  Client,
  GlassPatchResponse,
  ImportCsvResult,
  InvitationInfo,
  InviteResponse,
  LinePatchBody,
  LinePatchResponse,
  LoginBody,
  Me,
  Org,
  OrgSettings,
  PaidPlanCode,
  PdfUnavailableBody,
  Paged,
  PriceOverride,
  PriceOverridesResponse,
  PublicQuoteResponse,
  Quote,
  QuoteConflictBody,
  QuoteSaveBody,
  QuoteStats,
  QuoteStatus,
  QuoteSummary,
  Role,
  SendQuoteBody,
  SendQuoteResponse,
  SignupBody,
  TeamResponse,
  WorkOrder,
} from '@dekopen/shared'

// Tipos del contrato que antes vivían aquí: se re-exportan para no romper importaciones existentes.
export type { AcceptResult, CheckoutResult, InvitationInfo } from '@dekopen/shared'

export const API_BASE = '/api'

/** Mensaje sin conexión en español (compatibilidad); `networkMessage()` lo da en el idioma actual. */
export const NETWORK_MESSAGE: string = libMessages.api.network

/** Mensaje sin conexión en el idioma de la interfaz. */
export function networkMessage(): string {
  return translate(libMessages, 'api.network')
}

type StatusKey = keyof typeof libMessages.api.status
const STATUS_KEY: Record<number, StatusKey> = {
  400: 'badRequest',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  413: 'tooLarge',
  429: 'tooMany',
}

/** Mensaje propio para un estado HTTP (5xx → «problema de nuestro lado»; otros 4xx → «revisa los datos»). */
function statusMessage(status: number): string {
  const key = STATUS_KEY[status]
  if (key) return translate(libMessages, `api.status.${key}`)
  return status >= 500 ? translate(libMessages, 'api.server') : translate(libMessages, 'api.status.badRequest')
}

/**
 * Error de la API con mensaje listo para mostrar. `status` 0 = sin conexión.
 * `body` conserva el cuerpo completo de la respuesta: un 409 al autoguardar trae
 * `{ version, quote }` (ver `conflictBody`) y un 503 de PDF trae `fallback`.
 */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string
  readonly body?: unknown

  constructor(status: number, code: string, message: string, field?: string, body?: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.field = field
    this.body = body
  }

  get isNetwork(): boolean {
    return this.status === 0
  }
  get isUnauthorized(): boolean {
    return this.status === 401
  }
  get isConflict(): boolean {
    return this.status === 409
  }
}

/** Versión vigente que trae un 409 de PUT /api/quotes/:id (o undefined si no viene). */
export function conflictBody(error: unknown): QuoteConflictBody | undefined {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return undefined
  const body = error.body as Partial<QuoteConflictBody> | undefined
  return body && typeof body.version === 'number' && body.quote ? (body as QuoteConflictBody) : undefined
}

/** 503 de un PDF sin Chromium: URL del HTML imprimible y nombre del archivo (o undefined). */
export function pdfFallback(error: unknown): PdfUnavailableBody['fallback'] | undefined {
  if (!(error instanceof ApiRequestError) || error.status !== 503) return undefined
  const fallback = (error.body as Partial<PdfUnavailableBody> | undefined)?.fallback
  return fallback && typeof fallback.html === 'string' ? fallback : undefined
}

/** Mensaje humano para cualquier error (API, red o inesperado). */
export function humanError(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof TypeError) return networkMessage()
  return translate(libMessages, 'api.server')
}

const RETRYABLE_STATUS = new Set([408, 502, 503, 504])

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  /** Reintentos ante red/502/503/504. Por defecto 2 en GET/PUT/DELETE y 0 en POST/PATCH. */
  retry?: number
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/** Espera creciente con algo de azar: ~400 ms, ~1,2 s, ~2,8 s. */
export function backoffDelay(attempt: number): number {
  const base = 400 * (2 ** (attempt + 1) - 1)
  return Math.round(base * (0.85 + Math.random() * 0.3))
}

async function toApiError(res: Response): Promise<ApiRequestError> {
  let payload: Partial<ApiError> | undefined
  try {
    const text = await res.text()
    payload = text ? (JSON.parse(text) as Partial<ApiError>) : undefined
  } catch {
    payload = undefined
  }
  const err = payload?.error
  const code = err?.code ?? `http_${res.status}`
  return new ApiRequestError(res.status, code, localizedMessage(res, code, err?.message?.trim()), err?.field, payload)
}

/**
 * Mensaje en el idioma de la interfaz. El del servidor se usa tal cual si viene en ese idioma
 * (`Content-Language`; sin encabezado se asume español, como hasta v4). Si no, uno propio por
 * `code` conocido o por estado HTTP.
 */
function localizedMessage(res: Response, code: string, serverMessage: string | undefined): string {
  const locale = getLocale()
  const contentLanguage = res.headers.get('Content-Language')
  const serverLocale = contentLanguage ? matchLocale(contentLanguage, 'es') : 'es'
  if (serverMessage && serverLocale === locale) return serverMessage
  if (serverMessage && hasMessage(libMessages, `api.code.${code}`)) {
    return translate(libMessages, `api.code.${code}` as `api.code.${keyof typeof libMessages.api.code}`)
  }
  return statusMessage(res.status)
}

async function parseBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

/** Petición tipada. Lanza `ApiRequestError` con mensaje humano. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const idempotent = method === 'GET' || method === 'PUT' || method === 'DELETE'
  const retries = options.retry ?? (idempotent ? 2 : 0)
  const url = buildUrl(path, options.query)
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': acceptLanguage(getLocale()) }
  let body: string | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { method, headers, body, credentials: 'same-origin', signal: options.signal })
    } catch (error) {
      if (isAbort(error)) throw error
      if (attempt < retries) {
        await wait(backoffDelay(attempt), options.signal)
        continue
      }
      throw new ApiRequestError(0, 'network', networkMessage())
    }
    if (res.ok) return parseBody<T>(res)
    if (attempt < retries && RETRYABLE_STATUS.has(res.status)) {
      await wait(backoffDelay(attempt), options.signal)
      continue
    }
    throw await toApiError(res)
  }
}

/** Acepta listas planas o paginadas (`Paged<T>`). */
export function toItems<T>(data: T[] | Paged<T> | undefined | null): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : data.items
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export interface AcceptInvitationBody {
  name: string
  email: string
  password: string
}

export interface QuoteListParams {
  /** Uno o varios estados separados por coma (draft,sent). */
  status?: QuoteStatus | string
  q?: string
  clientId?: string
  limit?: number
  offset?: number
}

export interface WorkOrderListParams {
  /** open | in_progress | done (o varios separados por coma). */
  status?: WorkOrder['status'] | string
  limit?: number
  offset?: number
}

export type ClientInput = Partial<Omit<Client, 'id' | 'createdAt' | 'updatedAt'>> & { name: string }

/** PATCH /api/work-orders/:id — null borra la fecha comprometida o las notas. */
export type WorkOrderPatch = Partial<Pick<WorkOrder, 'status' | 'progress'>> & {
  dueDate?: string | null
  notes?: string | null
}

export interface ImportCsvOptions {
  brandId?: string
  /** Vista previa: calcula lo que pasaría sin guardar nada. */
  dryRun?: boolean
}

const enc = encodeURIComponent

async function uploadArModel(token: string, glb: Blob): Promise<{ url: string }> {
  const res = await fetch(`/api/public/quotes/${encodeURIComponent(token)}/ar-model`, { method: 'POST', headers: { 'Content-Type': 'model/gltf-binary' }, body: glb })
  if (!res.ok) throw new ApiRequestError(res.status, 'ar_model', 'No pudimos preparar la ventana.')
  return (await res.json()) as { url: string }
}

export const api = {
  auth: {
    login: (body: LoginBody) => request<Me>('/auth/login', { method: 'POST', body }),
    signup: (body: SignupBody) => request<Me>('/auth/signup', { method: 'POST', body }),
    logout: () => request<void>('/auth/logout', { method: 'POST', retry: 1 }),
    forgot: (email: string) => request<void>('/auth/forgot', { method: 'POST', body: { email } }),
    reset: (token: string, password: string) =>
      request<Me>('/auth/reset', { method: 'POST', body: { token, password } }),
    invitation: (token: string) => request<InvitationInfo>(`/invitations/${enc(token)}`),
    acceptInvitation: (token: string, body: AcceptInvitationBody) =>
      request<Me>(`/invitations/${enc(token)}/accept`, { method: 'POST', body }),
  },
  me: () => request<Me>('/me'),
  org: {
    update: (patch: Partial<Omit<Org, 'id' | 'createdAt'>>) => request<Org>('/org', { method: 'PATCH', body: patch }),
  },
  settings: {
    get: () => request<OrgSettings>('/settings'),
    update: (patch: Partial<OrgSettings>) => request<OrgSettings>('/settings', { method: 'PATCH', body: patch }),
  },
  catalog: {
    get: () => request<CatalogResponse>('/catalog'),
    brands: () => request<CatalogBrandsResponse>('/catalog/brands'),
    prices: () => request<PriceOverridesResponse>('/catalog/prices'),
    savePrices: (body: { overrides: PriceOverride[]; remove?: Omit<PriceOverride, 'price'>[]; replace?: boolean }) =>
      request<PriceOverridesResponse>('/catalog/prices', { method: 'PUT', body }),
    /** Importa «MisPrecios». Con `dryRun` devuelve la vista previa sin guardar nada. */
    importCsv: (csv: string, options: ImportCsvOptions = {}) =>
      request<ImportCsvResult>('/catalog/import-csv', {
        method: 'POST',
        body: { csv, ...(options.brandId ? { brandId: options.brandId } : {}), ...(options.dryRun ? { dryRun: true } : {}) },
      }),
    patchLine: (id: string, patch: LinePatchBody) =>
      request<LinePatchResponse>(`/catalog/lines/${enc(id)}`, { method: 'PATCH', body: patch }),
    /** Área mínima cobrada propia (m²); null vuelve a la de fábrica. */
    patchGlass: (id: string, minArea: number | null) =>
      request<GlassPatchResponse>(`/catalog/glass/${enc(id)}`, { method: 'PATCH', body: { minArea } }),
  },
  clients: {
    list: (q?: string) => request<Client[] | Paged<Client>>('/clients', { query: { q } }).then(toItems),
    get: (id: string) => request<Client>(`/clients/${enc(id)}`),
    create: (body: ClientInput) => request<Client>('/clients', { method: 'POST', body }),
    update: (id: string, patch: Partial<Client>) => request<Client>(`/clients/${enc(id)}`, { method: 'PATCH', body: patch }),
    remove: (id: string) => request<void>(`/clients/${enc(id)}`, { method: 'DELETE' }),
    restore: (id: string) => request<Client>(`/clients/${enc(id)}/restore`, { method: 'POST' }),
  },
  quotes: {
    list: (params: QuoteListParams = {}) =>
      request<QuoteSummary[] | Paged<QuoteSummary>>('/quotes', { query: { ...params } }).then(toItems),
    stats: () => request<QuoteStats>('/quotes/stats'),
    get: (id: string) => request<Quote>(`/quotes/${enc(id)}`),
    create: (body: Partial<QuoteSaveBody> = {}) => request<Quote>('/quotes', { method: 'POST', body }),
    /** Autoguardado. Ante un 409, `conflictBody(error)` trae la versión vigente. */
    save: (id: string, body: QuoteSaveBody) => request<Quote>(`/quotes/${enc(id)}`, { method: 'PUT', body }),
    duplicate: (id: string) => request<Quote>(`/quotes/${enc(id)}/duplicate`, { method: 'POST' }),
    remove: (id: string) => request<void>(`/quotes/${enc(id)}`, { method: 'DELETE' }),
    restore: (id: string) => request<Quote>(`/quotes/${enc(id)}/restore`, { method: 'POST' }),
    setStatus: (id: string, status: QuoteStatus) =>
      request<Quote>(`/quotes/${enc(id)}/status`, { method: 'POST', body: { status } }),
    /** Crea la revisión siguiente (A, B…) y devuelve el enlace del portal. */
    send: (id: string, body: SendQuoteBody = {}) =>
      request<SendQuoteResponse>(`/quotes/${enc(id)}/send`, { method: 'POST', body: { channel: 'link', ...body } }),
  },
  workOrders: {
    list: (params: WorkOrderListParams = {}) =>
      request<WorkOrder[] | Paged<WorkOrder>>('/work-orders', { query: { ...params } }).then(toItems),
    get: (id: string) => request<WorkOrder>(`/work-orders/${enc(id)}`),
    createFromQuote: (quoteId: string, extra: { dueDate?: string; notes?: string } = {}) =>
      request<WorkOrder & { existing?: boolean }>('/work-orders', { method: 'POST', body: { quoteId, ...extra } }),
    update: (id: string, patch: WorkOrderPatch) =>
      request<WorkOrder>(`/work-orders/${enc(id)}`, { method: 'PATCH', body: patch }),
  },
  activity: {
    list: () => request<ActivityEvent[] | Paged<ActivityEvent>>('/activity').then(toItems),
  },
  team: {
    get: () => request<TeamResponse>('/team'),
    invite: (body: { email?: string; role: Role }) => request<InviteResponse>('/team/invite', { method: 'POST', body }),
  },
  billing: {
    get: () => request<BillingStateDetail>('/billing'),
    checkout: (plan: PaidPlanCode, period: BillingPeriod) =>
      request<CheckoutResult>('/billing/checkout', { method: 'POST', body: { plan, period } }),
    /** Qué pasaría al elegir ese plan (cobro de hoy, saldo a favor, desde cuándo rige). No cobra. */
    preview: (plan: PaidPlanCode, period: BillingPeriod) =>
      request<BillingPreview>('/billing/preview', { query: { plan, period } }),
    /** Cancela al fin del período (se deshace con `resume`). */
    cancel: () => request<BillingActionResult>('/billing/cancel', { method: 'POST' }),
    resume: () => request<BillingActionResult>('/billing/resume', { method: 'POST' }),
    history: () => request<BillingHistoryRow[] | Paged<BillingHistoryRow>>('/billing/history').then(toItems),
  },
  portal: {
    get: (token: string) => request<PublicQuoteResponse>(`/public/quotes/${enc(token)}`),
    /** `revision`: la versión que el cliente tiene en pantalla (si hay una más nueva, 409 revision_changed). */
    accept: (token: string, body: { name: string; rut?: string; revision?: number; declared?: boolean; selection?: QuoteSelection }) =>
      request<AcceptResult>(`/public/quotes/${enc(token)}/accept`, { method: 'POST', body }),
    /** Deja el modelo de la ventana en una dirección https para Scene Viewer (Android). */
    hostArModel: (token: string, glb: Blob) => uploadArModel(token, glb),
    requestChanges: (token: string, body: { message: string; name?: string }) =>
      request<{ ok: boolean }>(`/public/quotes/${enc(token)}/request-changes`, { method: 'POST', body }),
  },
} as const
