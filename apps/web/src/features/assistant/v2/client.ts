/**
 * Cliente del asistente v2 (rutas de @dekopen/shared › ASSISTANT_V2_PATHS). JSON por `request()` y
 * flujos SSE de `TurnEvent` por `fetch` (el navegador solo envía texto + ids de la interfaz).
 */
import {
  acceptLanguage,
  ASSISTANT_V2_PATHS,
  matchLocale,
  TurnEventStreamParser,
  type AssistantCreateBody,
  type AssistantDeleteResponse,
  type AssistantListResponse,
  type AssistantPatchBody,
  type AssistantProfile,
  type AssistantV2Status,
  type Conversation,
  type ConversationDetailResponse,
  type ConversationListQuery,
  type ConversationListResponse,
  type ConversationPatchBody,
  type LocalTurnRequest,
  type LocalTurnResponse,
  type Memory,
  type MemoryCreateBody,
  type MemoryListResponse,
  type MemoryPatchBody,
  type MemoryScope,
  type MessagePageResponse,
  type ToolRunApproveBody,
  type ToolRunRejectBody,
  type ToolRunUndoResponse,
  type TurnEvent,
  type TurnRequest,
} from '@dekopen/shared'
import { ApiRequestError, networkMessage, request } from '../../../lib/api'
import { getLocale, translate } from '../../../lib/i18n'
import es from '../i18n/es'

/** `request()` antepone /api: las rutas del contrato ya lo traen. */
const rel = (path: string) => path.replace(/^\/api(?=\/)/, '')

export interface MemoryListQuery {
  scope?: MemoryScope
  assistantId?: string
  q?: string
}

export const assistantApi = {
  status: (signal?: AbortSignal) => request<AssistantV2Status>(rel(ASSISTANT_V2_PATHS.status), { signal, retry: 1 }),

  assistants: {
    list: () => request<AssistantListResponse>(rel(ASSISTANT_V2_PATHS.assistants)),
    get: (id: string) => request<AssistantProfile>(rel(ASSISTANT_V2_PATHS.assistant(id))),
    create: (body: AssistantCreateBody) => request<AssistantProfile>(rel(ASSISTANT_V2_PATHS.assistants), { method: 'POST', body }),
    patch: (id: string, body: AssistantPatchBody) => request<AssistantProfile>(rel(ASSISTANT_V2_PATHS.assistant(id)), { method: 'PATCH', body }),
    remove: (id: string) => request<AssistantDeleteResponse>(rel(ASSISTANT_V2_PATHS.assistant(id)), { method: 'DELETE' }),
    restore: (id: string) => request<AssistantProfile>(rel(ASSISTANT_V2_PATHS.assistantRestore(id)), { method: 'POST' }),
  },

  conversations: {
    list: (query: ConversationListQuery = {}, signal?: AbortSignal) =>
      request<ConversationListResponse>(rel(ASSISTANT_V2_PATHS.conversations), {
        signal,
        query: { q: query.q, assistantId: query.assistantId, pinned: query.pinned ? 1 : undefined, cursor: query.cursor, limit: query.limit },
      }),
    get: (id: string, signal?: AbortSignal) => request<ConversationDetailResponse>(rel(ASSISTANT_V2_PATHS.conversation(id)), { signal }),
    patch: (id: string, body: ConversationPatchBody) => request<Conversation>(rel(ASSISTANT_V2_PATHS.conversation(id)), { method: 'PATCH', body }),
    remove: (id: string) => request<{ ok: true }>(rel(ASSISTANT_V2_PATHS.conversation(id)), { method: 'DELETE' }),
    restore: (id: string) => request<Conversation>(rel(ASSISTANT_V2_PATHS.conversationRestore(id)), { method: 'POST' }),
    messages: (id: string, before?: number, limit = 40) =>
      request<MessagePageResponse>(rel(ASSISTANT_V2_PATHS.messages(id)), { query: { before, limit } }),
  },

  memories: {
    list: (query: MemoryListQuery = {}) => request<MemoryListResponse>(rel(ASSISTANT_V2_PATHS.memories), { query: { ...query } }),
    create: (body: MemoryCreateBody) => request<Memory>(rel(ASSISTANT_V2_PATHS.memories), { method: 'POST', body }),
    patch: (id: string, body: MemoryPatchBody) => request<Memory>(rel(ASSISTANT_V2_PATHS.memory(id)), { method: 'PATCH', body }),
    remove: (id: string) => request<{ ok: true }>(rel(ASSISTANT_V2_PATHS.memory(id)), { method: 'DELETE' }),
  },

  toolRuns: {
    undo: (id: string) => request<ToolRunUndoResponse>(rel(ASSISTANT_V2_PATHS.toolRunUndo(id)), { method: 'POST' }),
  },

  localTurn: (body: LocalTurnRequest, signal?: AbortSignal) =>
    request<LocalTurnResponse>(rel(ASSISTANT_V2_PATHS.localTurns), { method: 'POST', body, signal, retry: 1 }),

  turn: (body: TurnRequest, onEvent: (event: TurnEvent) => void, signal?: AbortSignal) => streamEvents(ASSISTANT_V2_PATHS.turns, body, onEvent, signal),
  approve: (id: string, body: ToolRunApproveBody, onEvent: (event: TurnEvent) => void, signal?: AbortSignal) =>
    streamEvents(ASSISTANT_V2_PATHS.toolRunApprove(id), body, onEvent, signal),
  reject: (id: string, body: ToolRunRejectBody, onEvent: (event: TurnEvent) => void, signal?: AbortSignal) =>
    streamEvents(ASSISTANT_V2_PATHS.toolRunReject(id), body, onEvent, signal),
}

export type AssistantApi = typeof assistantApi

/** Códigos que el panel explica con su propio texto (el resto usa el mensaje del servidor). */
const KNOWN_CODES: Record<string, keyof typeof es.notices> = {
  no_credits: 'no_credits',
  daily_limit: 'daily_limit',
  plan: 'plan',
  plan_required: 'plan',
  no_key: 'no_key',
  ai_unavailable: 'unavailable',
  rate_limited: 'rateLimited',
}

async function errorFrom(res: Response): Promise<ApiRequestError> {
  let payload: { error?: { code?: string; message?: string; field?: string } } | undefined
  try {
    const text = await res.text()
    payload = text ? (JSON.parse(text) as typeof payload) : undefined
  } catch {
    payload = undefined
  }
  const code = payload?.error?.code ?? (res.status === 429 ? 'rate_limited' : res.status === 404 ? 'ai_unavailable' : `http_${res.status}`)
  const serverMessage = payload?.error?.message?.trim()
  const contentLanguage = res.headers.get('Content-Language')
  const sameLanguage = (contentLanguage ? matchLocale(contentLanguage, 'es') : 'es') === getLocale()
  const known = KNOWN_CODES[code]
  const message = known ? translate(es, `notices.${known}`) : serverMessage && sameLanguage ? serverMessage : translate(es, 'notices.aiError')
  return new ApiRequestError(res.status, code, message, payload?.error?.field, payload)
}

/**
 * POST que responde `text/event-stream` con `TurnEvent`. Tolera un servidor que responda JSON con
 * `{ events: [...] }` (mismo contrato que local-turns). Lanza `ApiRequestError` antes de recibir datos.
 */
export async function streamEvents(path: string, body: unknown, onEvent: (event: TurnEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', 'Accept-Language': acceptLanguage(getLocale()) },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiRequestError(0, 'network', networkMessage())
  }
  if (!res.ok) throw await errorFrom(res)

  const type = res.headers.get('Content-Type') ?? ''
  if (type.includes('application/json')) {
    const data = (await res.json().catch(() => null)) as { events?: TurnEvent[] } | null
    for (const event of data?.events ?? []) onEvent(event)
    return
  }

  const parser = new TurnEventStreamParser()
  const reader = res.body?.getReader?.()
  if (!reader) {
    for (const event of parser.push(await res.text())) onEvent(event)
    for (const event of parser.end()) onEvent(event)
    return
  }
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const event of parser.push(decoder.decode(value, { stream: true }))) onEvent(event)
    }
    for (const event of parser.push(decoder.decode())) onEvent(event)
    for (const event of parser.end()) onEvent(event)
  } finally {
    reader.releaseLock?.()
  }
}
