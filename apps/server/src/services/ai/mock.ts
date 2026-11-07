/**
 * Proveedor de IA simulado y programable (pruebas y desarrollo sin clave). Es un `fetch`
 * compatible: se pasa a `createAiClient(config, { fetch: mock.fetch })` o se instala como fetch
 * global, así se prueba el cliente real de punta a punta (SSE, fragmentos, reintentos, errores).
 *
 *   const mock = createMockAi([
 *     { reasoning: 'Necesito agregar…', toolCalls: [{ name: 'add_window', arguments: { width: 1500 } }] },
 *     { content: 'Listo, agregué la V3.' },
 *   ])
 *
 * Cada pedido consume el siguiente turno del guion. Un turno puede ser una respuesta (texto,
 * razonamiento, herramientas, uso, motivo de término), un error HTTP, una caída de red, una
 * respuesta que nunca llega, o una función que mira el pedido y decide.
 *
 * Las consultas sin costo (GET /models y /platform/balance) no consumen turnos del guion ni quedan
 * en `requests`. Los fragmentos usan la forma real documentada: campos en null, no ausentes.
 */
import type { AiConfig } from './config'

/** Modelo del proveedor simulado. */
export const MOCK_AI_MODEL = 'modelo-simulado'

export interface MockToolCall {
  id?: string
  name: string
  /** Objeto (se serializa) o texto JSON tal cual (sirve para probar JSON inválido). */
  arguments: string | Record<string, unknown>
}

export interface MockReply {
  content?: string
  reasoning?: string
  toolCalls?: MockToolCall[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cached_tokens?: number; reasoning_tokens?: number; cost?: number } | null
  finishReason?: string
  /** Tamaño de cada fragmento de texto/argumentos (por defecto 7 caracteres). */
  chunkSize?: number
  /** Parte el flujo de bytes cada N bytes (incluso a mitad de un carácter UTF-8). */
  byteSplit?: number
  /** Espera antes de responder (ms). */
  delayMs?: number
  /** No envía `data: [DONE]` al final. */
  omitDone?: boolean
  /** Responde JSON (sin streaming) aunque se pida stream. */
  json?: boolean
  /** Usa \r\n como separador SSE. */
  crlf?: boolean
  model?: string
  /** Error en medio del flujo (después del primer fragmento). */
  midStreamError?: string
}

export type MockTurn =
  | MockReply
  | { status: number; body?: string; headers?: Record<string, string> }
  | { networkError: string }
  /** Nunca responde (hasta que el pedido se cancela): sirve para probar plazos. */
  | { hang: true }
  | ((request: MockRequest) => MockTurn | Promise<MockTurn>)

export interface MockRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, any>
}

export interface MockAi {
  fetch: typeof fetch
  requests: MockRequest[]
  /** Turnos que quedan sin usar. */
  remaining(): number
  /** Agrega turnos al guion. */
  push(...turns: MockTurn[]): void
}

export const MOCK_AI_CONFIG: AiConfig = {
  apiKey: 'sk-mock-clave-de-prueba',
  baseUrl: 'https://proveedor.mock/v1',
  model: MOCK_AI_MODEL,
  visionModel: MOCK_AI_MODEL,
  timeoutMs: 5000,
  maxDurationMs: 20_000,
  maxCompletionTokens: 8192,
  thinking: 'enabled',
}

function pieces(text: string, size: number): string[] {
  if (!text) return []
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

/** Cuerpo SSE (texto) de una respuesta simulada. */
export function mockSseBody(reply: MockReply, model = MOCK_AI_MODEL): string {
  const size = Math.max(1, reply.chunkSize ?? 7)
  const nl = reply.crlf ? '\r\n' : '\n'
  const id = 'chatcmpl-mock'
  const events: string[] = []
  const emit = (choices: unknown[], extra: Record<string, unknown> = {}) =>
    events.push(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: reply.model ?? model, choices, ...extra })}${nl}${nl}`)
  const delta = (fields: Record<string, unknown>) => ({ content: null, role: null, tool_calls: null, reasoning_content: null, ...fields })
  emit([{ index: 0, delta: delta({ content: '', role: 'assistant' }), finish_reason: null }])
  for (const part of pieces(reply.reasoning ?? '', size)) emit([{ index: 0, delta: delta({ reasoning_content: part }), finish_reason: null }])
  let first = true
  for (const part of pieces(reply.content ?? '', size)) {
    emit([{ index: 0, delta: delta({ content: part }), finish_reason: null }])
    if (first && reply.midStreamError) {
      events.push(`data: ${JSON.stringify({ error: { message: reply.midStreamError, code: 'server_error' } })}${nl}${nl}`)
      return events.join('')
    }
    first = false
  }
  ;(reply.toolCalls ?? []).forEach((call, index) => {
    const args = typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments)
    const argParts = pieces(args, size)
    const nameParts = pieces(call.name, Math.max(1, Math.ceil(call.name.length / 2)))
    emit([
      {
        index: 0,
        delta: delta({ tool_calls: [{ index, id: call.id ?? `call_mock_${index}`, type: 'function', function: { name: nameParts[0] ?? '', arguments: '' } }] }),
        finish_reason: null,
      },
    ])
    for (const rest of nameParts.slice(1)) emit([{ index: 0, delta: delta({ tool_calls: [{ index, function: { name: rest } }] }), finish_reason: null }])
    for (const part of argParts) emit([{ index: 0, delta: delta({ tool_calls: [{ index, function: { arguments: part } }] }), finish_reason: null }])
  })
  const finish = reply.finishReason ?? (reply.toolCalls?.length ? 'tool_calls' : 'stop')
  emit([{ index: 0, delta: delta({}), finish_reason: finish }], { usage: null })
  if (reply.usage !== null) {
    const u = reply.usage ?? {}
    const prompt = u.prompt_tokens ?? 1200
    const completion = u.completion_tokens ?? 300
    emit([], {
      usage: {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: u.total_tokens ?? prompt + completion,
        ...(u.cached_tokens !== undefined ? { prompt_tokens_details: { cached_tokens: u.cached_tokens } } : {}),
        ...(u.reasoning_tokens !== undefined ? { completion_tokens_details: { reasoning_tokens: u.reasoning_tokens } } : {}),
        ...(u.cost !== undefined ? { cost: u.cost } : {}),
      },
    })
  }
  if (!reply.omitDone) events.push(`data: [DONE]${nl}${nl}`)
  return events.join('')
}

function jsonBody(reply: MockReply, model: string): string {
  const u = reply.usage ?? {}
  return JSON.stringify({
    id: 'chatcmpl-mock',
    object: 'chat.completion',
    model: reply.model ?? model,
    choices: [
      {
        index: 0,
        finish_reason: reply.finishReason ?? (reply.toolCalls?.length ? 'tool_calls' : 'stop'),
        message: {
          role: 'assistant',
          content: reply.content ?? '',
          ...(reply.reasoning ? { reasoning_content: reply.reasoning } : {}),
          ...(reply.toolCalls?.length
            ? {
                tool_calls: reply.toolCalls.map((c, i) => ({
                  id: c.id ?? `call_mock_${i}`,
                  type: 'function',
                  function: { name: c.name, arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments) },
                })),
              }
            : {}),
        },
      },
    ],
    ...(reply.usage === null ? {} : { usage: { prompt_tokens: u.prompt_tokens ?? 1200, completion_tokens: u.completion_tokens ?? 300, total_tokens: u.total_tokens ?? (u.prompt_tokens ?? 1200) + (u.completion_tokens ?? 300) } }),
  })
}

function streamOf(text: string, byteSplit: number | undefined): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  const size = byteSplit && byteSplit > 0 ? byteSplit : 64
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + size))
      offset += size
    },
  })
}

function waitOrAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

export function createMockAi(turns: MockTurn[] = []): MockAi {
  const queue = [...turns]
  const requests: MockRequest[] = []

  const mockFetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.endsWith('/models')) return Response.json({ object: 'list', data: [{ id: MOCK_AI_MODEL, object: 'model', owned_by: 'mock' }] })
    if (url.endsWith('/platform/balance')) return Response.json({ object: 'balance', is_available: true, balance_infos: [] })
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((value, key) => (headers[key] = value))
    const body = JSON.parse(String(init.body ?? '{}')) as Record<string, any>
    const request: MockRequest = { url, headers, body }
    requests.push(request)
    let turn = queue.shift()
    if (!turn) throw new Error('mock-ai: no quedan turnos en el guion')
    while (typeof turn === 'function') turn = await turn(request)
    const signal = init.signal
    if ('hang' in turn) {
      await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
      throw new DOMException('Aborted', 'AbortError')
    }
    if ('networkError' in turn) throw new TypeError(turn.networkError)
    if ('status' in turn) return new Response(turn.body ?? '', { status: turn.status, headers: turn.headers })
    const reply = turn
    if (reply.delayMs) await waitOrAbort(reply.delayMs, signal)
    const model = typeof body.model === 'string' ? body.model : MOCK_AI_MODEL
    if (reply.json || body.stream === false) {
      return new Response(jsonBody(reply, model), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(streamOf(mockSseBody(reply, model), reply.byteSplit), {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'x-request-id': `req-mock-${requests.length}` },
    })
  }

  return {
    fetch: mockFetch as typeof fetch,
    requests,
    remaining: () => queue.length,
    push: (...more) => void queue.push(...more),
  }
}
