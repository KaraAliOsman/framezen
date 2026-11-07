/**
 * Orquestación de turnos: preparar (validar, acotar el modo, resolver asistente y conversación,
 * decidir si hay IA), correr el turno con IA en streaming, registrar turnos locales (cero
 * créditos) y continuar tras aprobar o rechazar. Las rutas HTTP solo traducen pedidos/respuestas.
 */
import {
  clampMode,
  type AssistantMode,
  type LocalTurnRequest,
  type LocalTurnResponse,
  type Message,
  type MessagePart,
  type TurnDoneReason,
  type TurnEvent,
  type TurnRequest,
  type TurnUiState,
} from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { newId } from '../../lib/crypto'
import { apiError, notFound } from '../../lib/errors'
import type { Viewer } from '../access'
import type { DispatchActor } from '../dispatch'
import { findAssistant, resolveAssistant, type AssistantRow } from './assistants'
import {
  appendMessage,
  autoTitle,
  createConversation,
  findConversation,
  requireConversation,
  setConversationMode,
  toConversation,
  toMessage,
  touchConversationContext,
  updateMessageParts,
  type ConversationRow,
} from './conversations'
import { attachmentParts } from './attachments'
import { executeApproval, newTurnState, prepareApproval, rejectProposal, runToolCall, type Emit, type ToolCallResult } from './executor'
import { scheduleLearning } from './learning'
import { aiClientFor, aiGate, appendNotice, continueAfterDecision, modeCeiling, runModelRounds, type AgentAiOptions, type AiGate } from './loop'
import type { ToolRunRow } from './runs'
import { replyLocale, sessionText, type AgentSession } from './session'

// ── Una corrida activa por conversación ──────────────────────────────────────

const ACTIVE = new Set<string>()

/** Reserva la conversación para un turno (409 conversation_busy si ya hay uno en curso). */
export function lockConversation(conversation: Pick<ConversationRow, 'id' | 'orgId'>): () => void {
  const key = `${conversation.orgId}:${conversation.id}`
  if (ACTIVE.has(key)) throw apiError(409, 'conversation_busy')
  ACTIVE.add(key)
  let released = false
  return () => {
    if (released) return
    released = true
    ACTIVE.delete(key)
  }
}

// ── Sesión ───────────────────────────────────────────────────────────────────

export interface RequestPeople {
  deps: AppDeps
  auth: AuthContext
  viewer: Viewer
  actor: DispatchActor
}

export function buildSession(
  people: RequestPeople,
  input: { assistant: AssistantRow; conversation: ConversationRow; mode: AssistantMode; ui: TurnUiState; signal?: AbortSignal },
): AgentSession {
  const locale = replyLocale(input.assistant, input.ui.locale)
  return {
    ...people,
    locale,
    text: sessionText(people.auth, locale),
    assistant: input.assistant,
    conversation: input.conversation,
    mode: input.mode,
    ui: input.ui,
    ...(input.signal ? { signal: input.signal } : {}),
  }
}

/** Asistente del turno: el pedido, o el de la conversación si sigue activo, o el por defecto. */
async function assistantFor(people: RequestPeople, requested: string | undefined, conversation: ConversationRow | undefined, locale: TurnUiState['locale']): Promise<AssistantRow> {
  if (requested) return resolveAssistant(people.deps, people.auth, requested, locale)
  if (conversation?.assistantId) {
    const current = await findAssistant(people.deps, people.auth, conversation.assistantId)
    if (current) return current
  }
  return resolveAssistant(people.deps, people.auth, undefined, locale)
}

interface Opened {
  assistant: AssistantRow
  conversation: ConversationRow
  mode: AssistantMode
  /** Suelta el candado de la conversación. */
  release: () => void
}

/**
 * Conversación del turno (existente y propia, o nueva con título determinista) y modo efectivo
 * (el pedido, acotado por el modo lectura). Bajar a Chat invalida propuestas pendientes.
 */
async function openConversation(people: RequestPeople, body: TurnRequest, gate: Pick<AiGate, 'readOnly'>): Promise<Opened> {
  const { deps, auth } = people
  const existing = body.conversationId ? await findConversation(deps, auth, body.conversationId) : undefined
  if (body.conversationId && !existing) throw notFound('No encontramos esa conversación. Puede que la hayas borrado.')
  const assistant = await assistantFor(people, body.assistantId, existing, body.ui.locale)
  const mode = clampMode(body.mode, modeCeiling(gate))
  const { effort } = body
  const context = { route: body.ui.route, ...(body.ui.quoteId ? { quoteId: body.ui.quoteId } : {}), ...(effort ? { effort } : {}) }
  if (existing) {
    // El candado va antes de tocar nada: un turno en curso no ve cambiar su modo a mitad de camino.
    const release = lockConversation(existing)
    try {
      const conversation = await setConversationMode(deps, existing, mode)
      await touchConversationContext(deps, conversation, context)
      return { assistant, conversation, mode, release }
    } catch (error) {
      release()
      throw error
    }
  }
  const conversation = await createConversation(deps, auth, { assistantId: assistant.id, mode, context, title: autoTitle(body.text || (body.attachments?.[0]?.name ?? '')) })
  return { assistant, conversation, mode, release: lockConversation(conversation) }
}

// ── Turno con IA ─────────────────────────────────────────────────────────────

export interface PreparedTurn {
  session: Omit<AgentSession, 'signal'>
  gate: AiGate
  userMessage: Message
  assistantMessageId: string
  release: () => void
}

/**
 * Todo lo que puede fallar con un error HTTP normal (404, 409…) pasa ANTES de abrir el flujo:
 * conversación, asistente, candado y mensaje de la persona. Si la IA no está disponible el mensaje
 * se guarda como local (no cuenta para el tope diario).
 */
export async function prepareTurn(people: RequestPeople, body: TurnRequest, options: AgentAiOptions): Promise<PreparedTurn> {
  const gate = await aiGate(people.deps, people.auth, options.ai)
  const opened = await openConversation(people, body, gate)
  const release = opened.release
  try {
    const parts: MessagePart[] = [...(body.text ? [{ type: 'text' as const, text: body.text }] : []), ...(await attachmentParts(body.attachments ?? []))]
    const userRow = await appendMessage(people.deps, opened.conversation, { role: 'user', source: gate.reason ? 'local' : 'ai', parts })
    const conversation = (await findConversation(people.deps, people.auth, opened.conversation.id)) ?? opened.conversation
    const session = buildSession(people, { ...opened, conversation, ui: body.ui })
    return { session, gate, userMessage: toMessage(userRow), assistantMessageId: newId(), release }
  } catch (error) {
    release()
    throw error
  }
}

/** Falla inesperada dentro del flujo: se registra y la persona recibe un error reintentable. */
function failInStream(session: AgentSession, emit: Emit, error: unknown): TurnDoneReason {
  session.deps.logger.error('asistente: el turno falló', error)
  emit({ type: 'error', code: 'internal', message: session.text.t('reply.failed', { reason: session.text.t('failure.default') }), retryable: true })
  return 'error'
}

/** Corre el turno ya preparado dentro del flujo SSE. */
export async function runPreparedTurn(prepared: PreparedTurn, body: TurnRequest, options: AgentAiOptions, emit: Emit, signal: AbortSignal): Promise<void> {
  const session: AgentSession = { ...prepared.session, signal }
  const state = newTurnState()
  let reason: TurnDoneReason = 'completed'
  try {
    emit({ type: 'turn.started', conversation: toConversation(session.conversation), userMessage: prepared.userMessage, assistantMessageId: prepared.assistantMessageId })
    const client = aiClientFor(session.deps, options)
    if (prepared.gate.readOnly && body.mode !== 'chat') emit({ type: 'notice', level: 'warning', code: 'read_only', message: session.text.t('notice.read_only') })
    if (prepared.gate.reason || !client) {
      await appendNotice(session, prepared.gate.reason ?? 'no_key', emit, prepared.assistantMessageId)
      reason = 'limit'
    } else {
      reason = await runModelRounds(session, state, emit, { client, dailyLeft: prepared.gate.dailyLeft, userText: body.text, firstMessageId: prepared.assistantMessageId, ...(body.effort ? { effort: body.effort } : {}) })
      scheduleLearning(session, client, body.text)
    }
  } catch (error) {
    reason = failInStream(session, emit, error)
  } finally {
    prepared.release()
    emit({ type: 'done', reason: signal.aborted && reason === 'completed' ? 'aborted' : reason, conversationId: session.conversation.id, creditsUsed: state.creditsUsed })
  }
}

// ── Decisiones sobre propuestas ──────────────────────────────────────────────

export interface PreparedDecision {
  session: Omit<AgentSession, 'signal'>
  run: ToolRunRow
  release: () => void
}

/** Conversación, asistente, modo y candado de una corrida propia (antes de abrir el flujo). */
export async function prepareDecision(
  people: RequestPeople,
  run: ToolRunRow,
  options: AgentAiOptions,
  locale: TurnUiState['locale'],
  /** Deshacer sigue disponible aunque la conversación esté en la papelera (los cambios siguen ahí). */
  extra: { includeDeleted?: boolean } = {},
): Promise<PreparedDecision> {
  const { deps, auth } = people
  if (!run.conversationId) throw notFound('No encontramos esa propuesta.')
  const conversation = extra.includeDeleted
    ? await findConversation(deps, auth, run.conversationId, { includeDeleted: true })
    : await requireConversation(deps, auth, run.conversationId)
  if (!conversation) throw notFound('No encontramos esa acción del asistente.')
  const assistant =
    (run.assistantId ? await findAssistant(deps, auth, run.assistantId, { includeArchived: true }) : undefined) ?? (await resolveAssistant(deps, auth, undefined, locale))
  const gate = await aiGate(deps, auth, options.ai)
  const mode = clampMode(conversation.mode, modeCeiling(gate))
  const ui: TurnUiState = {
    route: conversation.context?.route ?? '/',
    ...(conversation.context?.quoteId ? { quoteId: conversation.context.quoteId } : {}),
    locale,
  }
  const release = lockConversation(conversation)
  return { session: buildSession(people, { assistant, conversation, mode, ui }), run, release }
}

export async function approveAndStream(prepared: PreparedDecision, argsHash: string, options: AgentAiOptions) {
  // Validación y consumo de la aprobación antes del flujo: los errores salen como JSON (409).
  let approval
  try {
    approval = await prepareApproval(prepared.session, prepared.run, argsHash)
  } catch (error) {
    prepared.release()
    throw error
  }
  return async (emit: Emit, signal: AbortSignal) => {
    const session: AgentSession = { ...prepared.session, signal }
    const state = newTurnState({ ...approval.memo })
    let reason: TurnDoneReason = 'completed'
    try {
      await executeApproval(session, approval, state, emit)
      reason = await continueAfterDecision(session, state, emit, { messageId: approval.row.messageId, options, ...(session.conversation.context?.effort ? { effort: session.conversation.context.effort } : {}) })
    } catch (error) {
      reason = failInStream(session, emit, error)
    } finally {
      prepared.release()
      emit({ type: 'done', reason, conversationId: session.conversation.id, creditsUsed: state.creditsUsed })
    }
  }
}

export async function rejectAndStream(prepared: PreparedDecision, reason: string | undefined, options: AgentAiOptions) {
  const pending: TurnEvent[] = []
  try {
    await rejectProposal(prepared.session, prepared.run, reason, (event) => pending.push(event))
  } catch (error) {
    prepared.release()
    throw error
  }
  return async (emit: Emit, signal: AbortSignal) => {
    const session: AgentSession = { ...prepared.session, signal }
    const state = newTurnState()
    let done: TurnDoneReason = 'completed'
    try {
      for (const event of pending) emit(event)
      done = await continueAfterDecision(session, state, emit, { messageId: prepared.run.messageId, options, ...(reason ? { rejectedReason: reason } : {}), ...(session.conversation.context?.effort ? { effort: session.conversation.context.effort } : {}) })
    } catch (error) {
      done = failInStream(session, emit, error)
    } finally {
      prepared.release()
      emit({ type: 'done', reason: done, conversationId: session.conversation.id, creditsUsed: state.creditsUsed })
    }
  }
}

// ── Turno local (cero créditos) ──────────────────────────────────────────────

/**
 * Comando resuelto por el intérprete local del navegador: se registra en la misma conversación y
 * sus herramientas pasan por la misma tubería y los mismos modos que las del modelo (0 créditos).
 */
export async function runLocalTurn(people: RequestPeople, body: LocalTurnRequest, options: AgentAiOptions): Promise<LocalTurnResponse> {
  const { deps } = people
  const gate = await aiGate(deps, people.auth, options.ai)
  const opened = await openConversation(people, body, gate)
  const release = opened.release
  try {
    const session = buildSession(people, { ...opened, ui: body.ui })
    const events: TurnEvent[] = []
    const emit: Emit = (event) => events.push(event)
    const userRow = await appendMessage(deps, opened.conversation, { role: 'user', source: 'local', parts: [{ type: 'text', text: body.text }] })
    const messageId = newId()
    const planPart: MessagePart = { type: 'local_plan', plan: body.plan }
    const assistantRow = await appendMessage(deps, opened.conversation, { id: messageId, role: 'assistant', source: 'local', parts: [planPart], credits: 0 })
    if (gate.readOnly && body.mode !== 'chat' && body.plan.calls.length) events.push({ type: 'notice', level: 'warning', code: 'read_only', message: session.text.t('notice.read_only') })
    const state = newTurnState()
    const results: ToolCallResult[] = []
    for (const call of body.plan.calls) {
      results.push(await runToolCall(session, { id: `lc_${newId()}`, name: call.tool, args: call.args, source: 'local' }, state, { messageId, emit }))
    }
    const proposals = results.filter((r) => r.status === 'proposed').length
    const reply = body.reply?.trim() || (proposals ? session.text.t('reply.proposed', { count: proposals }) : '')
    const parts: MessagePart[] = [planPart, ...results.flatMap((r) => r.parts), ...(reply ? [{ type: 'text' as const, text: reply }] : [])]
    await updateMessageParts(deps, assistantRow.id, parts)
    const assistantMessage = toMessage({ ...assistantRow, parts })
    events.push({ type: 'message.done', message: assistantMessage })
    events.push({ type: 'done', reason: proposals ? 'approval_required' : 'completed', conversationId: opened.conversation.id, creditsUsed: 0 })
    const fresh = (await findConversation(deps, people.auth, opened.conversation.id)) ?? opened.conversation
    return {
      conversation: toConversation(fresh),
      messages: [toMessage(userRow), assistantMessage],
      toolRuns: results.map((r) => r.run),
      events,
    }
  } finally {
    release()
  }
}
