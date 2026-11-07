/**
 * Rutas del asistente v2 (montadas en /api/assistant/v2) y sus respuestas. Las rutas son
 * constantes: la web y las pruebas no arman URLs a mano.
 *
 *  GET    assistants                       → AssistantListResponse
 *  POST   assistants          AssistantCreateBody → AssistantProfile (402 plan_limit si se pasa del plan)
 *  GET    assistants/:id                   → AssistantProfile
 *  PATCH  assistants/:id      AssistantPatchBody  → AssistantProfile (409 version_conflict)
 *  DELETE assistants/:id                   → AssistantDeleteResponse (archiva; se puede deshacer)
 *  POST   assistants/:id/restore           → AssistantProfile
 *  GET    conversations?q=&assistantId=&pinned=1&cursor=&limit= → ConversationListResponse
 *  GET    conversations/:id                → ConversationDetailResponse (últimos mensajes)
 *  PATCH  conversations/:id   ConversationPatchBody → Conversation (renombrar, fijar, modo)
 *  DELETE conversations/:id                → { ok: true } (borrado suave; cancela propuestas pendientes)
 *  POST   conversations/:id/restore        → Conversation
 *  GET    conversations/:id/messages?before=<seq>&limit= → MessagePageResponse
 *  POST   local-turns         LocalTurnRequest → LocalTurnResponse (cero créditos)
 *  POST   turns               TurnRequest      → text/event-stream de TurnEvent
 *  GET    tool-runs?conversationId=&status=  → ToolRunListResponse
 *  POST   tool-runs/:id/approve ToolRunApproveBody → text/event-stream (ejecuta y continúa)
 *  POST   tool-runs/:id/reject  ToolRunRejectBody  → text/event-stream (el asistente responde)
 *  POST   tool-runs/:id/undo                → ToolRunUndoResponse (409 undo_conflict)
 *  GET    memories?scope=&assistantId=&q=   → MemoryListResponse
 *  POST   memories            MemoryCreateBody → Memory
 *  PATCH  memories/:id        MemoryPatchBody  → Memory
 *  DELETE memories/:id                      → { ok: true }
 *  GET    status                            → AssistantV2Status
 */
import type { AssistantLocalReason } from '../assistant'
import type { Conversation, ConversationSummary, Memory, Message, ToolRun, ToolRunStatus } from './conversation'
import type { AssistantMode } from './policy'

export const ASSISTANT_V2_BASE = '/api/assistant/v2'

const seg = (id: string) => encodeURIComponent(id)

export const ASSISTANT_V2_PATHS = {
  status: `${ASSISTANT_V2_BASE}/status`,
  diagnostics: `${ASSISTANT_V2_BASE}/diagnostics`,
  assistants: `${ASSISTANT_V2_BASE}/assistants`,
  assistant: (id: string) => `${ASSISTANT_V2_BASE}/assistants/${seg(id)}`,
  assistantRestore: (id: string) => `${ASSISTANT_V2_BASE}/assistants/${seg(id)}/restore`,
  conversations: `${ASSISTANT_V2_BASE}/conversations`,
  conversation: (id: string) => `${ASSISTANT_V2_BASE}/conversations/${seg(id)}`,
  conversationRestore: (id: string) => `${ASSISTANT_V2_BASE}/conversations/${seg(id)}/restore`,
  messages: (conversationId: string) => `${ASSISTANT_V2_BASE}/conversations/${seg(conversationId)}/messages`,
  localTurns: `${ASSISTANT_V2_BASE}/local-turns`,
  turns: `${ASSISTANT_V2_BASE}/turns`,
  toolRuns: `${ASSISTANT_V2_BASE}/tool-runs`,
  toolRunApprove: (id: string) => `${ASSISTANT_V2_BASE}/tool-runs/${seg(id)}/approve`,
  toolRunReject: (id: string) => `${ASSISTANT_V2_BASE}/tool-runs/${seg(id)}/reject`,
  toolRunUndo: (id: string) => `${ASSISTANT_V2_BASE}/tool-runs/${seg(id)}/undo`,
  memories: `${ASSISTANT_V2_BASE}/memories`,
  memory: (id: string) => `${ASSISTANT_V2_BASE}/memories/${seg(id)}`,
} as const

/** Rutas relativas al router (para montar en routes/assistant-v2.ts con Hono). */
export const ASSISTANT_V2_ROUTES = {
  status: '/status',
  diagnostics: '/diagnostics',
  assistants: '/assistants',
  assistant: '/assistants/:id',
  assistantRestore: '/assistants/:id/restore',
  conversations: '/conversations',
  conversation: '/conversations/:id',
  conversationRestore: '/conversations/:id/restore',
  messages: '/conversations/:id/messages',
  localTurns: '/local-turns',
  turns: '/turns',
  toolRuns: '/tool-runs',
  toolRunApprove: '/tool-runs/:id/approve',
  toolRunReject: '/tool-runs/:id/reject',
  toolRunUndo: '/tool-runs/:id/undo',
  memories: '/memories',
  memory: '/memories/:id',
} as const

export interface ConversationListQuery {
  q?: string
  assistantId?: string
  pinned?: boolean
  cursor?: string
  limit?: number
}

export interface ConversationListResponse {
  items: ConversationSummary[]
  /** Cursor opaco para la página siguiente (ausente = no hay más). */
  nextCursor?: string
}

export interface ConversationDetailResponse {
  conversation: Conversation
  /** Últimos mensajes en orden ascendente por `seq`. */
  messages: Message[]
  /** Propuestas y acciones de esta conversación (para tarjetas y deshacer). */
  toolRuns: ToolRun[]
  hasMoreBefore: boolean
}

export interface MessagePageResponse {
  messages: Message[]
  hasMoreBefore: boolean
}

export interface ToolRunListQuery {
  conversationId?: string
  status?: ToolRunStatus
}

export interface ToolRunListResponse {
  items: ToolRun[]
}

export interface MemoryListResponse {
  items: Memory[]
  total: number
}

/**
 * Por qué no hay IA (mismo vocabulario que v1), 'daily_limit' si se alcanzó el tope diario o
 * 'provider' si hay clave pero la conexión con el proveedor falla (detalle en `ai.provider`).
 */
export type AssistantV2AiReason = Exclude<AssistantLocalReason, 'offline' | 'forced' | 'ai_error'> | 'daily_limit' | 'provider'

/** Estado de la conexión con el proveedor de IA (mismo vocabulario en app, API y `npm run ai:check`). */
export const AI_PROVIDER_STATES = ['connected', 'no_key', 'key_rejected', 'no_balance', 'model_unavailable', 'token_plan', 'no_network', 'blocked', 'busy', 'misconfigured', 'unknown'] as const
export type AiProviderState = (typeof AI_PROVIDER_STATES)[number]

/** GET …/diagnostics y POST …/diagnostics (comprueba ahora). Solo quien administra la cuenta. */
export interface AiDiagnostics {
  state: AiProviderState
  available: boolean
  model?: string
  visionModel?: string
  thinking?: 'enabled' | 'disabled'
  /** Milisegundos de la última comprobación. */
  latencyMs?: number
  /** true si fue una llamada real al modelo; false si solo se consultó clave, modelo y saldo. */
  deep: boolean
  /** Motivo técnico breve, sin secretos. */
  detail?: string
  checkedAt: string
}

export interface AssistantV2Status {
  ai: { available: boolean; reason?: AssistantV2AiReason; provider?: AiProviderState }
  credits: {
    left: number
    included: number
    /** Créditos que la organización aún puede gastar hoy (tope diario). */
    dailyLeft: number
  }
  /** Turnos con IA que esta persona puede hacer hoy. */
  turnsLeftToday: number
  /** Modos que esta persona puede usar (según plan y rol). */
  modes: AssistantMode[]
  assistants: { limit: number; used: number }
}
