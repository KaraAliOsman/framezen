/**
 * Asistente v2 — montado en /api/assistant/v2 (con sesión; ver app.ts).
 *
 * Contrato: @dekopen/shared → ASSISTANT_V2_ROUTES (rutas relativas a este router), cuerpos con sus
 * esquemas zod y el flujo SSE `TurnEvent` (`encodeTurnEvent`):
 *
 *  GET    status                         → AssistantV2Status (estado de la IA sin gastar tokens)
 *  GET    diagnostics                    → AiDiagnostics (quien administra la cuenta)
 *  POST   diagnostics                    → AiDiagnostics con una llamada real mínima (6 por minuto)
 *  GET    assistants                     → AssistantListResponse
 *  POST   assistants                     → 201 AssistantProfile (402 plan_limit)
 *  GET    assistants/:id                 → AssistantProfile
 *  PATCH  assistants/:id                 → AssistantProfile (409 version_conflict)
 *  DELETE assistants/:id                 → AssistantDeleteResponse (archiva)
 *  POST   assistants/:id/restore         → AssistantProfile (402 plan_limit)
 *  GET    conversations?q&assistantId&pinned&cursor&limit → ConversationListResponse
 *  GET    conversations/:id              → ConversationDetailResponse
 *  PATCH  conversations/:id              → Conversation
 *  DELETE conversations/:id              → { ok: true }
 *  POST   conversations/:id/restore      → Conversation
 *  GET    conversations/:id/messages?before&limit → MessagePageResponse
 *  POST   local-turns                    → LocalTurnResponse (0 créditos)
 *  POST   turns                          → text/event-stream de TurnEvent
 *  GET    tool-runs?conversationId&status → ToolRunListResponse
 *  POST   tool-runs/:id/approve          → text/event-stream (409 approval_expired | approval_mismatch)
 *  POST   tool-runs/:id/reject           → text/event-stream (409 approval_expired)
 *  POST   tool-runs/:id/undo             → ToolRunUndoResponse (409 undo_conflict | undo_unavailable)
 *  GET    memories?scope&assistantId&q   → MemoryListResponse
 *  POST   memories                       → 201 Memory
 *  PATCH  memories/:id                   → Memory
 *  DELETE memories/:id                   → { ok: true }
 *
 * Todo se filtra por la organización de la sesión y, en conversaciones, corridas y memoria
 * privada, por la persona dueña. El modo lectura exime /api/assistant/* del 402 global (conversar
 * no cambia datos y cada herramienta pasa por su ruta normal, que sí lo aplica); las escrituras de
 * configuración de este router (asistentes y memoria) usan `requireWritable`.
 *
 * Opciones inyectables para pruebas: `assistantV2Routes(deps, { ai, fetch })`; por defecto la IA
 * se lee del entorno en cada pedido (`aiConfigFromEnv(process.env)`).
 */
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import {
  ASSISTANT_V2_PATHS,
  ASSISTANT_V2_ROUTES,
  MEMORY_SCOPES,
  TOOL_RUN_STATUSES,
  assistantCreateBodySchema,
  assistantPatchBodySchema,
  clampMode,
  isLocale,
  conversationPatchBodySchema,
  localTurnRequestSchema,
  memoryCreateBodySchema,
  memoryPatchBodySchema,
  toolRunApproveBodySchema,
  toolRunRejectBodySchema,
  turnRequestSchema,
  type AssistantDeleteResponse,
  type ConversationDetailResponse,
  type LocalTurnRequest,
  type Locale,
  type ToolRunUndoResponse,
} from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { apiError, notFound } from '../lib/errors'
import { readBody, readQuery } from '../lib/http'
import { rateLimited } from '../lib/keyed-limiter'
import { requireManager, requireWritable } from '../middleware/auth'
import { viewerFor } from '../services/access'
import { aiConfigFromEnv, type AiConfig } from '../services/ai/config'
import { checkProviderNow, providerStatus, toDiagnostics } from '../services/ai/provider'
import { actorFromContext } from '../services/dispatch'
import { archiveAssistant, createAssistant, findAssistant, listAssistants, patchAssistant, resolveAssistant, restoreAssistant, toProfile } from '../services/assistant/assistants'
import {
  listConversations,
  messagePage,
  patchConversation,
  requireConversation,
  restoreConversation,
  softDeleteConversation,
  toConversation,
} from '../services/assistant/conversations'
import { undoToolRun } from '../services/assistant/executor'
import { aiGate, assistantStatusV2, modeCeiling, type AgentAiOptions } from '../services/assistant/loop'
import { createMemoryFromBody, deleteMemory, listMemories, updateMemory } from '../services/assistant/memory'
import { findOwnToolRun, listOwnToolRuns, toToolRun } from '../services/assistant/runs'
import { SSE_HEADERS, sseStream, type TurnRunner } from '../services/assistant/sse'
import { approveAndStream, prepareDecision, prepareTurn, rejectAndStream, runLocalTurn, runPreparedTurn, type RequestPeople } from '../services/assistant/turns'

export interface AssistantV2RouteOptions {
  /** Configuración de IA por pedido (por defecto, variables de entorno AI_*). */
  ai?: () => AiConfig | null
  /** fetch para el proveedor de IA (las pruebas lo simulan). */
  fetch?: typeof fetch
}

/** Topes de frecuencia (además del tope diario del plan, que se cuenta en la base). */
export const ASSISTANT_RATE_LIMITS = {
  turnUser: { limit: 12, windowMs: 60_000 },
  turnOrg: { limit: 60, windowMs: 60_000 },
  localUser: { limit: 120, windowMs: 60_000 },
  actionUser: { limit: 60, windowMs: 60_000 },
  /** Comprobar la conexión gasta tokens reales del proveedor, aunque sean pocos. */
  diagnosticsOrg: { limit: 6, windowMs: 60_000 },
  /** Idempotencia de `clientTurnId` (reintentos de red). */
  turnIdWindowMs: 10 * 60_000,
} as const

const idParam = z.string().min(1).max(64)

const conversationListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  assistantId: idParam.optional(),
  pinned: z
    .enum(['1', 'true', '0', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const messagesQuery = z.object({
  before: z.coerce.number().int().min(1).max(10_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const toolRunsQuery = z.object({
  conversationId: idParam.optional(),
  status: z.enum(TOOL_RUN_STATUSES).optional(),
})

const memoriesQuery = z.object({
  scope: z.enum(MEMORY_SCOPES).optional(),
  assistantId: idParam.optional(),
  q: z.string().trim().max(120).optional(),
})

export function assistantV2Routes(deps: AppDeps, options: AssistantV2RouteOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const writable = requireWritable(deps)
  const aiOptions = (): AgentAiOptions => ({ ai: (options.ai ?? (() => aiConfigFromEnv(process.env)))(), ...(options.fetch ? { fetch: options.fetch } : {}) })

  const people = async (c: Context<AppEnv>): Promise<RequestPeople> => ({ deps, auth: c.get('auth'), viewer: await viewerFor(c, deps), actor: actorFromContext(c) })
  const localeOf = (c: Context<AppEnv>): Locale => {
    const auth = c.get('auth')
    return c.get('locale') ?? [auth.user.locale, auth.org.locale].find((l): l is Locale => isLocale(l)) ?? 'es'
  }
  const throttle = (key: string, policy: { limit: number; windowMs: number }) => {
    const result = deps.limits.keyed.take(key, policy)
    if (!result.ok) throw rateLimited(result)
  }
  const id = (c: Context<AppEnv>) => idParam.parse(c.req.param('id'))

  const sse = (c: Context<AppEnv>, run: TurnRunner) =>
    c.body(
      sseStream(c.req.raw.signal, run, (error) => deps.logger.error('asistente: flujo interrumpido', error)),
      200,
      SSE_HEADERS,
    )

  // ── Estado ────────────────────────────────────────────────────────────────
  app.get(ASSISTANT_V2_ROUTES.status, async (c) => {
    const auth = c.get('auth')
    const list = await listAssistants(deps, auth, await viewerFor(c, deps), localeOf(c))
    const options = aiOptions()
    return c.json(await assistantStatusV2(deps, auth, options.ai, { limit: list.limit, used: list.used }, options.fetch))
  })

  app.get(ASSISTANT_V2_ROUTES.diagnostics, requireManager(deps), async (c) => {
    const options = aiOptions()
    return c.json(toDiagnostics(await providerStatus(deps, options.ai, options.fetch ? { fetch: options.fetch } : {}), options.ai))
  })

  app.post(ASSISTANT_V2_ROUTES.diagnostics, requireManager(deps), async (c) => {
    throttle(`assistant-diagnostics:org:${c.get('auth').org.id}`, ASSISTANT_RATE_LIMITS.diagnosticsOrg)
    const options = aiOptions()
    return c.json(toDiagnostics(await checkProviderNow(deps, options.ai, options.fetch ? { fetch: options.fetch } : {}), options.ai))
  })

  // ── Asistentes ────────────────────────────────────────────────────────────
  app.get(ASSISTANT_V2_ROUTES.assistants, async (c) => c.json(await listAssistants(deps, c.get('auth'), await viewerFor(c, deps), localeOf(c))))

  app.post(ASSISTANT_V2_ROUTES.assistants, writable, async (c) => {
    const body = await readBody(c, assistantCreateBodySchema)
    return c.json(await createAssistant(deps, c.get('auth'), await viewerFor(c, deps), body), 201)
  })

  app.get(ASSISTANT_V2_ROUTES.assistant, async (c) => {
    const auth = c.get('auth')
    const row = await findAssistant(deps, auth, id(c))
    if (!row) throw notFound('No encontramos ese asistente.')
    return c.json(toProfile(row, auth, await viewerFor(c, deps)))
  })

  app.patch(ASSISTANT_V2_ROUTES.assistant, writable, async (c) => {
    const body = await readBody(c, assistantPatchBodySchema)
    return c.json(await patchAssistant(deps, c.get('auth'), await viewerFor(c, deps), id(c), body))
  })

  app.delete(ASSISTANT_V2_ROUTES.assistant, writable, async (c) => {
    const row = await archiveAssistant(deps, c.get('auth'), await viewerFor(c, deps), id(c))
    const response: AssistantDeleteResponse = { ok: true, restorePath: ASSISTANT_V2_PATHS.assistantRestore(row.id) }
    return c.json(response)
  })

  app.post(ASSISTANT_V2_ROUTES.assistantRestore, writable, async (c) => c.json(await restoreAssistant(deps, c.get('auth'), await viewerFor(c, deps), id(c))))

  // ── Conversaciones ────────────────────────────────────────────────────────
  app.get(ASSISTANT_V2_ROUTES.conversations, async (c) => {
    const query = readQuery(c, conversationListQuery)
    return c.json(await listConversations(deps, c.get('auth'), query))
  })

  app.get(ASSISTANT_V2_ROUTES.conversation, async (c) => {
    const auth = c.get('auth')
    const conversation = await requireConversation(deps, auth, id(c))
    const page = await messagePage(deps, conversation, { limit: 50 })
    const runs = await listOwnToolRuns(deps, auth, { conversationId: conversation.id, limit: 300 })
    const response: ConversationDetailResponse = {
      conversation: toConversation(conversation),
      messages: page.messages,
      toolRuns: runs.reverse().map(toToolRun),
      hasMoreBefore: page.hasMoreBefore,
    }
    return c.json(response)
  })

  app.patch(ASSISTANT_V2_ROUTES.conversation, async (c) => {
    const auth = c.get('auth')
    const body = await readBody(c, conversationPatchBodySchema)
    const conversation = await requireConversation(deps, auth, id(c))
    let mode = body.mode
    if (mode) mode = clampMode(mode, modeCeiling(await aiGate(deps, auth, null)))
    const updated = await patchConversation(deps, conversation, { ...body, ...(mode ? { mode } : {}) })
    return c.json(toConversation(updated))
  })

  app.delete(ASSISTANT_V2_ROUTES.conversation, async (c) => {
    const conversation = await requireConversation(deps, c.get('auth'), id(c))
    await softDeleteConversation(deps, conversation)
    return c.json({ ok: true as const })
  })

  app.post(ASSISTANT_V2_ROUTES.conversationRestore, async (c) => c.json(toConversation(await restoreConversation(deps, c.get('auth'), id(c)))))

  app.get(ASSISTANT_V2_ROUTES.messages, async (c) => {
    const conversation = await requireConversation(deps, c.get('auth'), id(c))
    return c.json(await messagePage(deps, conversation, readQuery(c, messagesQuery)))
  })

  // ── Turnos ────────────────────────────────────────────────────────────────
  app.post(ASSISTANT_V2_ROUTES.localTurns, async (c) => {
    const auth = c.get('auth')
    throttle(`assistant-local:user:${auth.org.id}:${auth.user.id}`, ASSISTANT_RATE_LIMITS.localUser)
    const body = (await readBody(c, localTurnRequestSchema)) as LocalTurnRequest
    return c.json(await runLocalTurn(await people(c), body, aiOptions()))
  })

  app.post(ASSISTANT_V2_ROUTES.turns, async (c) => {
    const auth = c.get('auth')
    const body = await readBody(c, turnRequestSchema)
    throttle(`assistant-turn:user:${auth.org.id}:${auth.user.id}`, ASSISTANT_RATE_LIMITS.turnUser)
    throttle(`assistant-turn:org:${auth.org.id}`, ASSISTANT_RATE_LIMITS.turnOrg)
    if (body.clientTurnId) {
      // Un reintento de red con el mismo id no crea un segundo turno.
      const once = deps.limits.keyed.take(`assistant-turn-id:${auth.org.id}:${auth.user.id}:${body.clientTurnId}`, { limit: 1, windowMs: ASSISTANT_RATE_LIMITS.turnIdWindowMs })
      if (!once.ok) throw apiError(409, 'conversation_busy', { extra: { duplicate: true } })
    }
    const options = aiOptions()
    const prepared = await prepareTurn(await people(c), body, options)
    return sse(c, (emit, signal) => runPreparedTurn(prepared, body, options, emit, signal))
  })

  // ── Propuestas y acciones ─────────────────────────────────────────────────
  app.get(ASSISTANT_V2_ROUTES.toolRuns, async (c) => {
    const query = readQuery(c, toolRunsQuery)
    const rows = await listOwnToolRuns(deps, c.get('auth'), query)
    return c.json({ items: rows.map(toToolRun) })
  })

  const ownRun = async (c: Context<AppEnv>) => {
    const auth = c.get('auth')
    throttle(`assistant-action:user:${auth.org.id}:${auth.user.id}`, ASSISTANT_RATE_LIMITS.actionUser)
    const row = await findOwnToolRun(deps, auth, id(c))
    if (!row) throw notFound('No encontramos esa acción del asistente.')
    return row
  }

  app.post(ASSISTANT_V2_ROUTES.toolRunApprove, async (c) => {
    const body = await readBody(c, toolRunApproveBodySchema)
    const row = await ownRun(c)
    const options = aiOptions()
    const prepared = await prepareDecision(await people(c), row, options, localeOf(c))
    const run = await approveAndStream(prepared, body.argsHash, options)
    return sse(c, run)
  })

  app.post(ASSISTANT_V2_ROUTES.toolRunReject, async (c) => {
    const body = await readBody(c, toolRunRejectBodySchema)
    const row = await ownRun(c)
    const options = aiOptions()
    const prepared = await prepareDecision(await people(c), row, options, localeOf(c))
    const run = await rejectAndStream(prepared, body.reason || undefined, options)
    return sse(c, run)
  })

  app.post(ASSISTANT_V2_ROUTES.toolRunUndo, async (c) => {
    const row = await ownRun(c)
    const prepared = await prepareDecision(await people(c), row, aiOptions(), localeOf(c), { includeDeleted: true })
    try {
      const result: ToolRunUndoResponse = await undoToolRun(prepared.session, row)
      return c.json(result)
    } finally {
      prepared.release()
    }
  })

  // ── Memoria ───────────────────────────────────────────────────────────────
  app.get(ASSISTANT_V2_ROUTES.memories, async (c) => {
    const query = readQuery(c, memoriesQuery)
    return c.json(await listMemories(deps, c.get('auth'), await viewerFor(c, deps), query))
  })

  app.post(ASSISTANT_V2_ROUTES.memories, writable, async (c) => {
    const auth = c.get('auth')
    const body = await readBody(c, memoryCreateBodySchema)
    const scope = body.scope ?? 'assistant'
    let assistantId = body.assistantId
    if (scope === 'assistant') {
      // El asistente debe ser visible para esta persona (nunca uno de otra organización).
      assistantId = (await resolveAssistant(deps, auth, assistantId, localeOf(c))).id
    }
    const memory = await createMemoryFromBody(deps, auth, await viewerFor(c, deps), { ...body, scope, ...(assistantId ? { assistantId } : {}) })
    return c.json(memory, 201)
  })

  app.patch(ASSISTANT_V2_ROUTES.memory, writable, async (c) => {
    const body = await readBody(c, memoryPatchBodySchema)
    return c.json(await updateMemory(deps, c.get('auth'), await viewerFor(c, deps), id(c), body))
  })

  app.delete(ASSISTANT_V2_ROUTES.memory, writable, async (c) => {
    await deleteMemory(deps, c.get('auth'), await viewerFor(c, deps), id(c))
    return c.json({ ok: true as const })
  })

  return app
}
