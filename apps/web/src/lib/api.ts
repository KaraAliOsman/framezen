/**
 * Cliente HTTP tipado contra el contrato de `@framezen/shared` (todas las rutas cuelgan de /api).
 * - Errores humanos en español (los del servidor ya vienen así; si no, ponemos uno claro).
 * - Reintento suave para lecturas y escrituras idempotentes ante cortes de red o 502/503/504.
 */
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
} from '@framezen/shared'

// Tipos del contrato que antes vivían aquí: se re-exportan para no romper importaciones existentes.
export type { AcceptResult, CheckoutResult, InvitationInfo } from '@framezen/shared'

export const API_BASE = '/api'

export const NETWORK_MESSAGE = 'No pudimos conectar. Tus cambios están a salvo; reintentamos solos.'

const FALLBACK_BY_STATUS: Record<number, string> = {
  400: 'Revisa los datos e inténtalo de nuevo.',
  401: 'Tu sesión terminó. Vuelve a entrar para seguir.',
  403: 'No tienes acceso a esto. Pídele al dueño de la cuenta que te lo habilite.',
  404: 'No encontramos lo que buscas. Puede que se haya borrado o que el enlace esté incompleto.',
  409: 'Esto cambió en otra pestaña o por otra persona. Cargamos la versión más reciente.',
  413: 'El archivo es demasiado grande. Prueba con uno de menos de 1 MB.',
  429: 'Vamos muy rápido. Espera unos segundos y vuelve a intentarlo.',
}
const SERVER_FALLBACK = 'Tuvimos un problema de nuestro lado. Inténtalo de nuevo en un momento.'

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
  if (error instanceof TypeError) return NETWORK_MESSAGE
  return SERVER_FALLBACK
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
  const fallback = FALLBACK_BY_STATUS[res.status] ?? (res.status >= 500 ? SERVER_FALLBACK : FALLBACK_BY_STATUS[400])
  return new ApiRequestError(res.status, err?.code ?? `http_${res.status}`, err?.message?.trim() || fallback, err?.field, payload)
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
  const headers: Record<string, string> = { Accept: 'application/json' }
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
      throw new ApiRequestError(0, 'network', NETWORK_MESSAGE)
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
    accept: (token: string, body: { name: string; rut?: string; revision?: number }) =>
      request<AcceptResult>(`/public/quotes/${enc(token)}/accept`, { method: 'POST', body }),
    requestChanges: (token: string, body: { message: string; name?: string }) =>
      request<{ ok: boolean }>(`/public/quotes/${enc(token)}/request-changes`, { method: 'POST', body }),
  },
} as const
