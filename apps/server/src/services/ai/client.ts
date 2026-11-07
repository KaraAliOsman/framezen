/**
 * Cliente de IA para cualquier API compatible con OpenAI (POST {base}/chat/completions), sin SDK.
 *
 * - Streaming SSE con `stream: true`: arma el texto, el razonamiento (reasoning_content) y las
 *   llamadas a herramientas que llegan en fragmentos por `index`. Si el proveedor responde JSON
 *   (sin streaming), también lo entiende.
 * - `stream_options.include_usage`: varios compatibles no informan tokens en streaming si no se
 *   pide. Si aun así no llega, se estima (`usage.reported === false`) y se cobra por esa estimación,
 *   sin descuento de caché: se prefiere cobrar de más a regalar saldo que no se puede medir.
 * - `tool_choice: 'auto'`: el único valor que admiten todos; para prohibir herramientas no se envían.
 * - Razonamiento apagado: se pide de las dos formas que existen (`thinking.type` y
 *   `reasoning_effort: 'none'`), porque cada proveedor obedece una distinta y el resto la ignora.
 *   Los modelos que razonan sin que se les pida gastan salida en cada vuelta.
 * - Parámetros que un compatible rechaza con 400/422: se quitan y se reintenta al tiro sin costo, y
 *   queda recordado para ese proveedor y modelo mientras dure el proceso (`ADAPTABLE_PARAMS`).
 * - Plazos: primer byte y silencio entre trozos (`timeoutMs`) y duración total (`maxDurationMs`).
 *   Cancelable con `signal` (la persona cerró la conexión).
 * - Reintentos con espera exponencial SOLO antes de recibir datos y solo ante 429/5xx o caída de
 *   red; nunca a mitad de una respuesta (no se duplica salida ni costo). Respeta Retry-After.
 * - Uso: tokens de entrada (con los de caché aparte), salida y razonamiento → créditos con la
 *   fórmula del plan (`creditsForUsage`). Si el proveedor informa el costo, queda en `usage.costUsd`.
 * - La clave jamás aparece en errores ni logs.
 *
 * Reenviar el historial: con el razonamiento activo, varios proveedores responden 400 si una
 * respuesta anterior vuelve sin su `reasoning_content`: usa `assistantMessageOf(result)`. Si el
 * historial trae herramientas sin razonamiento (turnos hechos con él apagado), este pedido sale con
 * el razonamiento apagado. Con él apagado no se reenvía: son tokens de entrada que no aportan nada.
 *
 * Errores habituales: 400 formato o modelo, 401 clave, 402 saldo, 403 región o clave restringida,
 * 404 modelo o ruta, 421 moderación, 429 límite, 500 y 503. Un 429 o 400 que habla de saldo o cuota
 * también es saldo (`insufficient_quota`).
 */
import { createContentFilter, stripProviderMarkup } from './sanitize'
import { creditsForUsage, type TokenUsage } from '@dekopen/shared'
import { MAX_COMPLETION_TOKENS, MIN_COMPLETION_TOKENS, redactSecret, type AiConfig } from './config'

// ── Tipos del protocolo ──────────────────────────────────────────────────────

export interface ProviderToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export type ChatMessageParam =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; reasoning_content?: string; tool_calls?: ProviderToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolDefinition {
  type: 'function'
  function: { name: string; description?: string; parameters: Record<string, unknown>; strict?: boolean }
}

export type AiErrorKind =
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'bad_response'
  | 'aborted'
  | 'bad_request'
  | 'billing'
  | 'moderation'
  | 'forbidden'
  | 'model'

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'repetition_truncation' | (string & {})

export interface ChatUsage extends TokenUsage {
  cachedInputTokens: number
  reasoningTokens?: number
  /** false = el proveedor no informó uso y se estimó (`estimateTokensOf`). */
  reported: boolean
  /** Costo real de la llamada en dólares, si el proveedor lo informa. */
  costUsd?: number
}

/** Fragmentos mientras llega la respuesta (para reenviarlos al navegador). */
export type ChatStreamEvent =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; index: number; id?: string; name?: string; argumentsDelta?: string }

export interface ChatRequest {
  messages: ChatMessageParam[]
  /** Sin herramientas (o lista vacía) el modelo no puede llamar ninguna. */
  tools?: readonly ToolDefinition[]
  /** Otro modelo para este pedido (p. ej. visión). */
  model?: string
  maxCompletionTokens?: number
  thinking?: 'enabled' | 'disabled'
  /** Cuánto razona el modelo cuando el razonamiento está activo. */
  effort?: 'low' | 'high' | 'xhigh' | 'max'
  /** Duración máxima de esta llamada, si necesita más que la configurada. */
  maxDurationMs?: number
  /** Espera máxima sin recibir datos, si necesita más que la configurada (razonar demora el primer byte). */
  idleTimeoutMs?: number
  responseFormat?: 'json_object'
  /** Solo se envía con el razonamiento apagado (con razonamiento los proveedores la fijan). */
  temperature?: number
  /** Permite un tope menor al mínimo normal (solo la comprobación de conexión). */
  tinyOutput?: boolean
  signal?: AbortSignal
  onEvent?: (event: ChatStreamEvent) => void
  /** false = respuesta JSON única (sin SSE). Por defecto true. */
  stream?: boolean
}

export interface ChatResult {
  content: string
  /** reasoning_content completo (interno: guardarlo para reenviarlo, nunca mostrarlo). */
  reasoning: string
  toolCalls: ProviderToolCall[]
  finishReason: FinishReason
  /** true si terminó con 'stop' o 'tool_calls' (no truncada ni filtrada). */
  complete: boolean
  usage: ChatUsage
  credits: number
  model: string
  requestId?: string
  attempts: number
  durationMs: number
}

export interface AiClient {
  readonly config: AiConfig
  chat(request: ChatRequest): Promise<ChatResult>
}

export interface AiClientOptions {
  fetch?: typeof fetch
  /** Avisa el resultado real de cada llamada (el estado de la conexión aprende de aquí). */
  onOutcome?: (outcome: { ok: true; durationMs: number; model: string } | { ok: false; error: AiError }) => void
  /** Reintentos ante 429/5xx/red antes de recibir datos. Por defecto 2. */
  retries?: number
  retryBaseMs?: number
  retryMaxMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  now?: () => number
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529])

// ── Utilidades ───────────────────────────────────────────────────────────────

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AiError('aborted', 'Se canceló la respuesta.'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new AiError('aborted', 'Se canceló la respuesta.'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Un 400 también es «modelo desconocido o retirado»: no hay un código estándar para eso. */
const MODEL_PROBLEM = /\bmodel\b.*\b(not|invalid|unknown|exist|support|found|unavailable|retired|offline|deprecat)|\b(invalid|unknown|unsupported)\b.*\bmodel\b/i

/** Sin saldo se informa de muchas formas: 402, pero también 429 `insufficient_quota` o un 400. */
const NO_BALANCE = /insufficient[_ ](quota|balance|funds|credit)|out of credits?|balance (is )?(too low|insufficient)|exceeded your current quota/i

function classifyStatus(status: number, detail = ''): AiErrorKind {
  if ((status === 400 || status === 403 || status === 429) && NO_BALANCE.test(detail)) return 'billing'
  if (status === 400 && MODEL_PROBLEM.test(detail)) return 'model'
  if (status === 404) return 'model'
  if (status === 400 || status === 413 || status === 422) return 'bad_request'
  if (status === 401) return 'auth'
  if (status === 403) return 'forbidden'
  if (status === 402) return 'billing'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 421) return 'moderation'
  if (status === 429) return 'rate_limit'
  return 'server'
}

/** Retry-After en segundos o fecha HTTP → ms (acotado). */
export function retryAfterMs(header: string | null, now = Date.now(), cap = 30_000): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(cap, Math.round(seconds * 1000))
  const at = Date.parse(header)
  if (Number.isFinite(at)) return Math.min(cap, Math.max(0, at - now))
  return undefined
}

/**
 * Caracteres por token para estimar cuando el proveedor no informa el uso. Medido con uso real:
 * sistema en inglés + JSON de herramientas da 3,3 (no los 4 de la regla general, que subestima un
 * 20 %), y estimar de menos es regalar saldo.
 */
const CHARS_PER_TOKEN = 3.3

/** Estimación de tokens cuando el proveedor no informa el uso. */
export function estimateTokensOf(messages: readonly ChatMessageParam[], extra = ''): number {
  let chars = extra.length
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length
    else if (Array.isArray(m.content)) for (const part of m.content) chars += part.type === 'text' ? part.text.length : 1000
    if (m.role === 'assistant') {
      chars += m.reasoning_content?.length ?? 0
      for (const call of m.tool_calls ?? []) chars += call.function.name.length + call.function.arguments.length
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

interface RawUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
  /** Costo en dólares (lo informan algunos proveedores y pasarelas). */
  cost?: number
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined)

function usageFrom(raw: RawUsage | undefined): Omit<ChatUsage, 'reported'> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const prompt = num(raw.prompt_tokens)
  const completion = num(raw.completion_tokens)
  const total = num(raw.total_tokens)
  if (prompt === undefined && completion === undefined && total === undefined) return undefined
  // Solo total (algunos compatibles): se cobra como entrada para no subestimar.
  const inputTokens = prompt ?? (completion === undefined ? (total ?? 0) : Math.max(0, (total ?? 0) - completion))
  const outputTokens = completion ?? 0
  const cachedInputTokens = Math.min(inputTokens, num(raw.prompt_tokens_details?.cached_tokens) ?? 0)
  const reasoningTokens = num(raw.completion_tokens_details?.reasoning_tokens)
  const costUsd = typeof raw.cost === 'number' && Number.isFinite(raw.cost) && raw.cost >= 0 ? raw.cost : undefined
  return { inputTokens, outputTokens, cachedInputTokens, ...(reasoningTokens !== undefined ? { reasoningTokens } : {}), ...(costUsd !== undefined ? { costUsd } : {}) }
}

/** Lee un cuerpo SSE completo por eventos (líneas `data:` unidas), tolerando CRLF y trozos partidos. */
export async function* sseData(body: ReadableStream<Uint8Array>, onChunk?: () => void): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (!done) onChunk?.()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      for (;;) {
        const match = /\r?\n\r?\n/.exec(buffer)
        if (!match) break
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n')
        if (data) yield data
      }
      if (done) {
        const rest = buffer.trim()
        if (rest.startsWith('data:')) yield rest.slice(5).trim()
        return
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    try {
      reader.releaseLock()
    } catch {
      // ya liberado
    }
  }
}

interface ToolCallDraft {
  id: string
  name: string
  arguments: string
}

/** Acumula los fragmentos de herramientas por `index` (nombre y argumentos llegan partidos). */
class ToolCallAssembler {
  private readonly drafts = new Map<number, ToolCallDraft>()

  add(part: { index?: unknown; id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown } }, onEvent?: ChatRequest['onEvent']): void {
    if (part.type !== undefined && part.type !== null && part.type !== 'function') throw new AiError('bad_response', 'Tipo de herramienta no soportado.')
    let index = typeof part.index === 'number' && Number.isInteger(part.index) && part.index >= 0 ? part.index : -1
    const id = typeof part.id === 'string' ? part.id : ''
    if (index < 0) {
      // Sin índice: por id, o la última abierta, o una nueva.
      const byId = id ? [...this.drafts.entries()].find(([, d]) => d.id === id)?.[0] : undefined
      index = byId ?? (id || this.drafts.size === 0 ? this.drafts.size : this.drafts.size - 1)
    }
    const draft = this.drafts.get(index) ?? { id: '', name: '', arguments: '' }
    if (id) {
      if (draft.id && draft.id !== id) throw new AiError('bad_response', 'La IA mezcló dos llamadas a herramientas.')
      draft.id = id
    }
    const name = typeof part.function?.name === 'string' ? part.function.name : ''
    if (name) draft.name = !draft.name || name.startsWith(draft.name) ? name : draft.name + name
    const rawArgs = part.function?.arguments
    const args = typeof rawArgs === 'string' ? rawArgs : rawArgs !== undefined && rawArgs !== null ? JSON.stringify(rawArgs) : ''
    draft.arguments += args
    this.drafts.set(index, draft)
    onEvent?.({ type: 'tool_call', index, ...(id ? { id } : {}), ...(name ? { name } : {}), ...(args ? { argumentsDelta: args } : {}) })
  }

  result(): ProviderToolCall[] {
    return [...this.drafts.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, d]) => d.name)
      .map(([index, d]) => ({
        id: d.id || `call_${index}_${Math.random().toString(36).slice(2, 10)}`,
        type: 'function' as const,
        function: { name: d.name, arguments: d.arguments.trim() ? d.arguments : '{}' },
      }))
  }
}

/** Argumentos de una llamada como objeto (las llamadas pueden traer JSON inválido o truncado). */
export function parseToolArguments(call: Pick<ProviderToolCall, 'function'>): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const value: unknown = JSON.parse(call.function.arguments || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'arguments_not_object' }
    return { ok: true, value: value as Record<string, unknown> }
  } catch {
    return { ok: false, error: 'arguments_invalid_json' }
  }
}

function withoutReasoning(message: ChatMessageParam): ChatMessageParam {
  if (message.role !== 'assistant' || !message.reasoning_content) return message
  const { reasoning_content: _dropped, ...rest } = message
  return rest
}

/** Mensaje del asistente para reenviar en el historial (con su razonamiento original). */
export function assistantMessageOf(result: Pick<ChatResult, 'content' | 'reasoning' | 'toolCalls'>): Extract<ChatMessageParam, { role: 'assistant' }> {
  return {
    role: 'assistant',
    // Vacío, no null: algunos proveedores rechazan null junto a tool_calls.
    content: result.content,
    ...(result.reasoning ? { reasoning_content: result.reasoning } : {}),
    ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}),
  }
}

// ── Compatibilidad entre proveedores ─────────────────────────────────────────

/**
 * Parámetros opcionales que un compatible puede no conocer. Todos tienen salida: quitarlos deja el
 * pedido válido. `max_completion_tokens` se cambia por el nombre antiguo, `max_tokens`.
 */
const ADAPTABLE_PARAMS = ['stream_options', 'reasoning_effort', 'thinking', 'max_completion_tokens', 'response_format', 'temperature'] as const
type AdaptableParam = (typeof ADAPTABLE_PARAMS)[number]

/** Por proveedor y modelo: lo que ya rechazó y si exige recibir de vuelta el razonamiento. */
interface ProviderCompat {
  rejected: Set<AdaptableParam>
  replayReasoning: boolean
}

const compatByProvider = new Map<string, ProviderCompat>()

function compatOf(baseUrl: string, model: string): ProviderCompat {
  const key = `${baseUrl}|${model}`
  let compat = compatByProvider.get(key)
  if (!compat) compatByProvider.set(key, (compat = { rejected: new Set(), replayReasoning: false }))
  return compat
}

/** Para pruebas: olvida lo aprendido de los proveedores. */
export function resetProviderCompat(): void {
  compatByProvider.clear()
}

const mentions = (detail: string, param: string) => new RegExp(`(^|[^a-z_])${param}([^a-z_]|$)`, 'i').test(detail)

/** Ajusta el pedido según un 400/422. false si el error no habla de nada adaptable. */
function adaptTo(detail: string, compat: ProviderCompat, strippedReasoning: boolean): boolean {
  if (strippedReasoning && !compat.replayReasoning && mentions(detail, 'reasoning_content')) {
    compat.replayReasoning = true
    return true
  }
  const param = ADAPTABLE_PARAMS.find((p) => !compat.rejected.has(p) && mentions(detail, p))
  if (!param) return false
  compat.rejected.add(param)
  return true
}

// ── Cliente ──────────────────────────────────────────────────────────────────

export function createAiClient(config: AiConfig, options: AiClientOptions = {}): AiClient {
  const retries = Math.max(0, Math.min(5, options.retries ?? 2))
  const baseMs = options.retryBaseMs ?? 500
  const maxMs = options.retryMaxMs ?? 8000
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now

  async function chat(request: ChatRequest): Promise<ChatResult> {
    try {
      const result = await attemptChat(request)
      options.onOutcome?.({ ok: true, durationMs: result.durationMs, model: result.model })
      return result
    } catch (error) {
      if (error instanceof AiError && error.kind !== 'aborted') options.onOutcome?.({ ok: false, error })
      throw error
    }
  }

  async function attemptChat(request: ChatRequest): Promise<ChatResult> {
    const doFetch = options.fetch ?? globalThis.fetch
    const started = now()
    const model = request.model ?? config.model
    const wanted = request.thinking ?? config.thinking
    const unreplayable = request.messages.some((m) => m.role === 'assistant' && m.tool_calls?.length && !m.reasoning_content)
    const thinking = wanted === 'enabled' && unreplayable ? 'disabled' : wanted
    // Nunca topes diminutos: el razonamiento también gasta salida y dejaría la respuesta vacía.
    const floor = request.tinyOutput ? 1 : MIN_COMPLETION_TOKENS
    const maxTokens = Math.max(floor, Math.min(request.maxCompletionTokens ?? config.maxCompletionTokens, MAX_COMPLETION_TOKENS))
    const streaming = request.stream !== false
    const compat = compatOf(config.baseUrl, model)
    const buildPayload = () => {
      const skip = compat.rejected
      // Con el razonamiento apagado no se reenvía: son tokens de entrada que no aportan nada.
      const messages = thinking === 'disabled' && !compat.replayReasoning ? request.messages.map(withoutReasoning) : request.messages
      return JSON.stringify({
        model,
        messages,
        stream: streaming,
        ...(streaming && !skip.has('stream_options') ? { stream_options: { include_usage: true } } : {}),
        ...(skip.has('max_completion_tokens') ? { max_tokens: maxTokens } : { max_completion_tokens: maxTokens }),
        ...(skip.has('thinking') ? {} : { thinking: { type: thinking } }),
        ...(thinking === 'disabled' && !skip.has('reasoning_effort') ? { reasoning_effort: 'none' } : {}),
        ...(thinking === 'enabled' && request.effort && !skip.has('reasoning_effort') ? { reasoning_effort: request.effort } : {}),
        ...(request.tools?.length ? { tools: request.tools, tool_choice: 'auto' } : {}),
        ...(request.responseFormat && !skip.has('response_format') ? { response_format: { type: request.responseFormat } } : {}),
        ...(thinking === 'disabled' && request.temperature !== undefined && !skip.has('temperature') ? { temperature: request.temperature } : {}),
      })
    }
    let adaptations = 0

    for (let attempt = 0; ; attempt++) {
      if (request.signal?.aborted) throw new AiError('aborted', 'Se canceló la respuesta.')
      const controller = new AbortController()
      let cause: 'timeout' | 'aborted' | undefined
      const abort = (why: 'timeout' | 'aborted') => {
        cause ??= why
        controller.abort()
      }
      const onExternalAbort = () => abort('aborted')
      request.signal?.addEventListener('abort', onExternalAbort, { once: true })
      let idle: ReturnType<typeof setTimeout> | undefined
      const armIdle = () => {
        if (idle) clearTimeout(idle)
        idle = setTimeout(() => abort('timeout'), request.idleTimeoutMs ?? config.timeoutMs)
      }
      const remaining = Math.max(1000, (request.maxDurationMs ?? config.maxDurationMs) - (now() - started))
      const total = setTimeout(() => abort('timeout'), remaining)
      const cleanup = () => {
        if (idle) clearTimeout(idle)
        clearTimeout(total)
        request.signal?.removeEventListener('abort', onExternalAbort)
      }
      const failFor = (error: unknown): AiError => {
        if (error instanceof AiError) return error
        if (cause === 'timeout') return new AiError('timeout', 'La IA tardó demasiado en responder.')
        if (cause === 'aborted' || request.signal?.aborted) return new AiError('aborted', 'Se canceló la respuesta.')
        return new AiError('network', redactSecret(error instanceof Error ? error.message : 'Sin conexión con la IA.', config.apiKey))
      }

      armIdle()
      let response: Response
      try {
        response = await doFetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            Accept: streaming ? 'text/event-stream' : 'application/json',
          },
          body: buildPayload(),
          signal: controller.signal,
        })
      } catch (error) {
        cleanup()
        const failure = failFor(error)
        if (failure.kind === 'network' && attempt < retries) {
          await sleep(backoff(attempt), request.signal)
          continue
        }
        throw failure
      }

      if (!response.ok) {
        const detail = redactSecret(await response.text().catch(() => ''), config.apiKey).slice(0, 300)
        cleanup()
        const kind = classifyStatus(response.status, detail)
        const wait = retryAfterMs(response.headers.get('retry-after'), now())
        // Un parámetro que este proveedor no conoce: se quita y se reintenta. No gasta reintentos
        // ni cobra nada (el proveedor ni siquiera llamó al modelo).
        if ((response.status === 400 || response.status === 422) && adaptations < ADAPTABLE_PARAMS.length + 1 && adaptTo(detail, compat, thinking === 'disabled')) {
          adaptations++
          attempt--
          continue
        }
        if (RETRYABLE_STATUS.has(response.status) && kind !== 'billing' && attempt < retries) {
          await sleep(wait ?? backoff(attempt), request.signal)
          continue
        }
        throw new AiError(kind, `La IA respondió ${response.status}${detail ? `: ${detail}` : ''}`, response.status, wait)
      }

      // Desde aquí no hay reintentos: ya hay una respuesta en curso (y posiblemente cobrada).
      try {
        const headerId = response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? undefined
        const type = response.headers.get('content-type') ?? ''
        const parsed = type.includes('text/event-stream') && response.body ? await readStream(response.body, request, armIdle) : await readJson(response)
        const usage: ChatUsage = parsed.usage
          ? { ...parsed.usage, reported: true }
          : {
              inputTokens: estimateTokensOf(request.messages, JSON.stringify(request.tools ?? [])),
              cachedInputTokens: 0,
              outputTokens: Math.ceil((parsed.content.length + parsed.reasoning.length + parsed.toolCalls.reduce((n, c) => n + c.function.arguments.length, 0)) / CHARS_PER_TOKEN),
              reported: false,
            }
        const finishReason: FinishReason = parsed.finishReason ?? (parsed.toolCalls.length ? 'tool_calls' : 'stop')
        const requestId = headerId ?? parsed.id
        return {
          content: parsed.content,
          reasoning: parsed.reasoning,
          toolCalls: parsed.toolCalls,
          finishReason,
          complete: finishReason === 'stop' || finishReason === 'tool_calls',
          usage,
          credits: creditsForUsage(usage),
          model: parsed.model || model,
          ...(requestId ? { requestId } : {}),
          attempts: attempt + 1,
          durationMs: now() - started,
        }
      } catch (error) {
        const failure = failFor(error)
        // La respuesta ya había empezado: hay red, y lo que falló fue el proveedor a mitad de camino.
        if (failure.kind === 'network') throw new AiError('server', 'La respuesta de la IA se cortó antes de terminar.')
        throw failure
      } finally {
        cleanup()
      }
    }
  }

  function backoff(attempt: number): number {
    const exp = Math.min(maxMs, baseMs * 2 ** attempt)
    return Math.round(exp / 2 + Math.random() * (exp / 2))
  }

  return { config, chat }
}

interface Parsed {
  content: string
  reasoning: string
  toolCalls: ProviderToolCall[]
  finishReason?: FinishReason
  usage?: Omit<ChatUsage, 'reported'>
  model?: string
  id?: string
}

interface RawChunk {
  id?: string
  model?: string
  error?: { message?: string; code?: string | number; type?: string } | string
  usage?: RawUsage
  choices?: {
    index?: number
    finish_reason?: string | null
    delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; tool_calls?: unknown }
    message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; tool_calls?: unknown }
  }[]
}

function chunkError(error: RawChunk['error']): AiError {
  const message = typeof error === 'string' ? error : (error?.message ?? 'error')
  const code = typeof error === 'object' && error ? `${String(error.code ?? '')} ${String(error.type ?? '')}`.trim() : ''
  const status = /^\d{3}\b/.test(code) ? Number(code.slice(0, 3)) : undefined
  const kind: AiErrorKind = status ? classifyStatus(status, message) : /rate/i.test(code) ? 'rate_limit' : /invalid_key|invalid_api_key|auth/i.test(code) ? 'auth' : /balance|billing/i.test(code) ? 'billing' : 'server'
  return new AiError(kind, `La IA informó un error: ${message.slice(0, 200)}`, status)
}

async function readStream(body: ReadableStream<Uint8Array>, request: ChatRequest, onChunk: () => void): Promise<Parsed> {
  const tools = new ToolCallAssembler()
  let content = ''
  let reasoning = ''
  // Las marcas internas de algunos modelos nunca llegan a la persona.
  const visible = createContentFilter((text) => request.onEvent?.({ type: 'content', text }))
  let finishReason: FinishReason | undefined
  let usage: Omit<ChatUsage, 'reported'> | undefined
  let model: string | undefined
  let id: string | undefined
  let done = false
  for await (const data of sseData(body, onChunk)) {
    if (data.trim() === '[DONE]') {
      done = true
      break
    }
    let chunk: RawChunk
    try {
      chunk = JSON.parse(data) as RawChunk
    } catch {
      throw new AiError('bad_response', 'La IA envió un fragmento que no pudimos leer.')
    }
    if (chunk.error) throw chunkError(chunk.error)
    if (typeof chunk.model === 'string' && chunk.model) model = chunk.model
    if (typeof chunk.id === 'string' && chunk.id) id = chunk.id
    const u = usageFrom(chunk.usage)
    if (u) usage = u
    for (const choice of chunk.choices ?? []) {
      if (choice.index !== undefined && choice.index !== 0) continue
      if (choice.finish_reason) finishReason = choice.finish_reason
      const delta = choice.delta ?? choice.message
      if (!delta) continue
      const r = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : typeof delta.reasoning === 'string' ? delta.reasoning : ''
      if (r) {
        reasoning += r
        request.onEvent?.({ type: 'reasoning', text: r })
      }
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content
        visible.push(delta.content)
      }
      if (Array.isArray(delta.tool_calls)) for (const part of delta.tool_calls) tools.add(part ?? {}, request.onEvent)
    }
  }
  // Algunos compatibles cierran sin [DONE]: vale si al menos informaron cómo terminó.
  if (!done && !finishReason) throw new AiError('bad_response', 'La respuesta de la IA se cortó antes de terminar.')
  visible.flush()
  return { content: stripProviderMarkup(content).trim(), reasoning, toolCalls: tools.result(), finishReason, usage, model, id }
}

async function readJson(response: Response): Promise<Parsed> {
  let body: RawChunk
  try {
    body = (await response.json()) as RawChunk
  } catch {
    throw new AiError('bad_response', 'La IA respondió algo que no pudimos leer.')
  }
  if (body.error) throw chunkError(body.error)
  const choice = body.choices?.[0]
  const message = choice?.message
  if (!message) throw new AiError('bad_response', 'La IA respondió sin mensaje.')
  const tools = new ToolCallAssembler()
  if (Array.isArray(message.tool_calls)) message.tool_calls.forEach((part: Record<string, unknown>, index: number) => tools.add({ index, ...(part ?? {}) }))
  const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content : typeof message.reasoning === 'string' ? message.reasoning : ''
  return {
    content: typeof message.content === 'string' ? message.content.trim() : '',
    reasoning,
    toolCalls: tools.result(),
    finishReason: choice?.finish_reason ?? undefined,
    usage: usageFrom(body.usage),
    model: typeof body.model === 'string' ? body.model : undefined,
    id: typeof body.id === 'string' ? body.id : undefined,
  }
}

// ── Modo JSON y visión ───────────────────────────────────────────────────────

/** Cualquier validador con `safeParse` (zod). */
export interface JsonValidator<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown }
}

/** Extrae el objeto JSON de una respuesta (tolera ```json … ``` alrededor). */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  const raw = fenced ? fenced[1]! : trimmed
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1))
    throw new SyntaxError('json_invalid')
  }
}

/**
 * Pide un objeto JSON (`response_format: json_object`) y lo valida. Varios proveedores exigen que
 * el prompt mencione JSON: si ningún mensaje lo hace, se agrega la instrucción. Truncado o inválido →
 * AiError 'bad_response' (nunca se devuelve un objeto a medias).
 */
export async function chatJson<T>(
  client: AiClient,
  request: Omit<ChatRequest, 'responseFormat' | 'tools'> & { schema?: JsonValidator<T> },
): Promise<{ value: T; result: ChatResult }> {
  const { schema, ...rest } = request
  const mentionsJson = rest.messages.some((m) => typeof m.content === 'string' && /json/i.test(m.content))
  const messages: ChatMessageParam[] = mentionsJson
    ? rest.messages
    : [{ role: 'system', content: 'Responde únicamente con un objeto JSON válido, sin texto adicional.' }, ...rest.messages]
  const result = await client.chat({ ...rest, messages, responseFormat: 'json_object' })
  if (!result.complete) throw new AiError('bad_response', `La respuesta JSON quedó incompleta (${result.finishReason}).`)
  let value: unknown
  try {
    value = extractJsonObject(result.content)
  } catch {
    throw new AiError('bad_response', 'La IA no devolvió un JSON válido.')
  }
  if (!schema) return { value: value as T, result }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new AiError('bad_response', 'El JSON de la IA no calza con el formato esperado.')
  return { value: parsed.data, result }
}

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/]+=*$/
/** Tope propio para imágenes en línea. */
export const MAX_IMAGE_DATA_URL_CHARS = 20 * 1024 * 1024

/** Mensaje de la persona con texto + una imagen (data URL validada; nunca URLs remotas). */
export function imageMessage(text: string, dataUrl: string): Extract<ChatMessageParam, { role: 'user' }> {
  if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS || !IMAGE_DATA_URL.test(dataUrl)) throw new AiError('bad_request', 'La imagen no es válida para la IA (PNG, JPG, WEBP, GIF o BMP en base64).')
  return { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: dataUrl } }] }
}

/**
 * Analiza una imagen con el modelo de visión. Con `schema` responde un JSON validado (p. ej. la
 * clasificación de una textura); sin él, texto.
 */
export async function describeImage<T = string>(
  client: AiClient,
  input: { prompt: string; dataUrl: string; system?: string; schema?: JsonValidator<T>; signal?: AbortSignal; maxCompletionTokens?: number },
): Promise<{ value: T; result: ChatResult }> {
  const messages: ChatMessageParam[] = [...(input.system ? [{ role: 'system' as const, content: input.system }] : []), imageMessage(input.prompt, input.dataUrl)]
  const base = { messages, model: client.config.visionModel, signal: input.signal, maxCompletionTokens: input.maxCompletionTokens }
  if (input.schema) return chatJson(client, { ...base, schema: input.schema })
  const result = await client.chat(base)
  return { value: result.content as T, result }
}
