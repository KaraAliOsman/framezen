/**
 * Cliente mínimo para APIs compatibles con OpenAI (POST {base}/chat/completions con tools).
 * Sin SDK: fetch con tiempo máximo, errores clasificados y conversión de mensajes del contrato.
 */
import {
  isAssistantTool,
  type AssistantMessage,
  type AssistantToolCall,
  type AssistantToolDefinition,
} from '@framezen/shared'
import type { AiConfig } from './config'

export type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type AiErrorKind = 'timeout' | 'auth' | 'rate_limit' | 'network' | 'server' | 'bad_response' | 'aborted'

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export interface ChatCompletionInput {
  config: AiConfig
  messages: OpenAiMessage[]
  tools: readonly AssistantToolDefinition[]
  fetch?: typeof fetch
  /** Se cancela si la persona cierra la conexión. */
  signal?: AbortSignal
  maxTokens?: number
}

export interface ChatCompletionResult {
  content: string
  toolCalls: AssistantToolCall[]
  /** Tokens totales informados por el proveedor (o estimados si no los informa). */
  totalTokens: number
  model: string
}

/** Tope de tokens de respuesta por llamada (también acota la reserva de créditos). */
export const DEFAULT_MAX_TOKENS = 700

const MAX_TOOL_CONTENT = 6000
const HISTORY_LIMIT = 24

/** Estimación gruesa (~4 caracteres por token) cuando el proveedor no informa el uso. */
export function estimateTokens(messages: readonly OpenAiMessage[], output = ''): number {
  let chars = output.length
  for (const m of messages) {
    chars += (m.content ?? '').length
    if (m.role === 'assistant') for (const call of m.tool_calls ?? []) chars += call.function.arguments.length + call.function.name.length
  }
  return Math.ceil(chars / 4)
}

/**
 * Convierte la conversación del contrato a mensajes OpenAI, acotada a los últimos turnos y siempre
 * consistente: cada llamada a herramienta queda seguida de su resultado (si falta, uno neutro) y
 * los resultados huérfanos se descartan (la API los rechaza).
 */
export function toOpenAiMessages(history: readonly AssistantMessage[], limit = HISTORY_LIMIT): OpenAiMessage[] {
  let start = Math.max(0, history.length - limit)
  // Empezar en un mensaje de la persona para no cortar un bucle de herramientas a la mitad.
  while (start > 0 && history[start]?.role !== 'user') start--
  const slice = history.slice(start)
  const out: OpenAiMessage[] = []
  let pending: string[] = []
  const flushPending = () => {
    for (const id of pending) out.push({ role: 'tool', tool_call_id: id, content: JSON.stringify({ ok: false, error: 'No se ejecutó.' }) })
    pending = []
  }
  for (const message of slice) {
    if (message.role === 'tool') {
      const id = message.toolCallId ?? ''
      if (!pending.includes(id)) continue
      pending = pending.filter((p) => p !== id)
      out.push({ role: 'tool', tool_call_id: id, content: (message.content || '{}').slice(0, MAX_TOOL_CONTENT) })
      continue
    }
    flushPending()
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.content.slice(0, 8000) })
      continue
    }
    const calls = (message.toolCalls ?? []).filter((c) => c.id && c.name)
    if (calls.length) {
      out.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
      })
      pending = calls.map((c) => c.id)
    } else if (message.content) {
      out.push({ role: 'assistant', content: message.content.slice(0, 8000) })
    }
  }
  flushPending()
  return out
}

interface RawToolCall {
  id?: unknown
  type?: unknown
  function?: { name?: unknown; arguments?: unknown }
}

function readToolCalls(raw: unknown): AssistantToolCall[] {
  if (!Array.isArray(raw)) return []
  const calls: AssistantToolCall[] = []
  raw.forEach((item: RawToolCall, index) => {
    const name = typeof item?.function?.name === 'string' ? item.function.name : ''
    if (!isAssistantTool(name)) return
    const args = item.function?.arguments
    calls.push({
      id: typeof item.id === 'string' && item.id ? item.id : `call_${Date.now().toString(36)}_${index}`,
      name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
    })
  })
  return calls
}

function classifyStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status === 408 || status === 504) return 'timeout'
  return 'server'
}

export async function chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
  const { config } = input
  const doFetch = input.fetch ?? globalThis.fetch
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, config.timeoutMs)
  const onAbort = () => controller.abort()
  input.signal?.addEventListener('abort', onAbort, { once: true })

  let res: Response
  try {
    res = await doFetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: input.messages,
        tools: input.tools,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timer)
    input.signal?.removeEventListener('abort', onAbort)
    if (timedOut) throw new AiError('timeout', 'La IA tardó demasiado en responder.')
    if (input.signal?.aborted) throw new AiError('aborted', 'Se canceló la respuesta.')
    throw new AiError('network', error instanceof Error ? error.message : 'Sin conexión con la IA.')
  }

  try {
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new AiError(classifyStatus(res.status), `La IA respondió ${res.status}: ${detail.slice(0, 300)}`, res.status)
    }
    let body: {
      model?: string
      choices?: { message?: { content?: unknown; tool_calls?: unknown } }[]
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
    }
    try {
      body = (await res.json()) as typeof body
    } catch {
      throw new AiError('bad_response', 'La IA respondió algo que no pudimos leer.')
    }
    const message = body.choices?.[0]?.message
    if (!message) throw new AiError('bad_response', 'La IA respondió sin mensaje.')
    const content = typeof message.content === 'string' ? message.content.trim() : ''
    const toolCalls = readToolCalls(message.tool_calls)
    const usage = body.usage
    const reported = usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0)
    return {
      content,
      toolCalls,
      totalTokens: reported > 0 ? reported : estimateTokens(input.messages, content + toolCalls.map((c) => c.arguments).join('')),
      model: typeof body.model === 'string' && body.model ? body.model : config.model,
    }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (timedOut) throw new AiError('timeout', 'La IA tardó demasiado en responder.')
    throw new AiError('network', error instanceof Error ? error.message : 'Se cortó la conexión con la IA.')
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener('abort', onAbort)
  }
}
