/**
 * Asistente v1 (Marco): conversión del historial del navegador a mensajes OpenAI y una llamada
 * por pedido, sobre el cliente común (client.ts). El asistente v2 (AGENT) usa client.ts
 * directamente y guarda el historial en el servidor.
 */
import {
  isAssistantTool,
  type AssistantMessage,
  type AssistantToolCall,
  type AssistantToolDefinition,
} from '@dekopen/shared'
import type { AiConfig } from './config'
import { AiError, createAiClient, type AiErrorKind, type ChatMessageParam, type ToolDefinition } from './client'

export { AiError, type AiErrorKind }

export type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

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
  /** Créditos según la fórmula del plan (`creditsForUsage`). */
  credits: number
  model: string
}

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

export async function chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
  // El historial de v1 lo arma el navegador y no trae reasoning_content: con el razonamiento
  // activo el proveedor podría responder 400. Por eso v1 llama con el razonamiento apagado.
  const client = createAiClient(input.config, { fetch: input.fetch, retries: 1 })
  const result = await client.chat({
    messages: input.messages as ChatMessageParam[],
    tools: input.tools as unknown as ToolDefinition[],
    thinking: 'disabled',
    temperature: 0.3,
    maxCompletionTokens: input.maxTokens ?? input.config.maxCompletionTokens,
    signal: input.signal,
  })
  // Solo herramientas conocidas: una desconocida nunca llega al navegador.
  const toolCalls: AssistantToolCall[] = result.toolCalls
    .filter((call) => isAssistantTool(call.function.name))
    .map((call) => ({ id: call.id, name: call.function.name as AssistantToolCall['name'], arguments: call.function.arguments }))
  return {
    content: result.content,
    toolCalls,
    totalTokens: result.usage.inputTokens + result.usage.outputTokens,
    credits: result.credits,
    model: result.model,
  }
}
