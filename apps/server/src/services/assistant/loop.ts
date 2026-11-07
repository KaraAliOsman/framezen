/**
 * Bucle del agente (servidor). El navegador solo manda texto + ids de pantalla; aquí se arma TODO:
 * prompt de sistema (idéntico en cada pedido, para la caché) y contexto del turno (ver prompt.ts), historial (con el reasoning_content original de cada
 * respuesta), herramientas permitidas por el modo y los ámbitos del asistente, y el flujo de
 * eventos SSE.
 *
 * Cada vuelta: reserva atómica de créditos → modelo en streaming (tool_choice 'auto',
 * max_completion_tokens de la configuración, nunca menos de 4096) → ajuste al costo real →
 * herramientas por la tubería común (executor.ts) → resultado delimitado como DATOS → siguiente
 * vuelta. Se detiene al responder, al quedar propuestas pendientes, al cancelar o al llegar a un
 * tope (vueltas, llamadas, créditos del turno, tope diario).
 *
 * Sin IA (plan sin asistente, sin clave, sin créditos, tope diario o error) nunca bloquea: avisa con
 * el motivo del vocabulario v2 y los comandos locales siguen funcionando (0 créditos).
 */
import { and, eq } from 'drizzle-orm'
import {
  agentToolDefinitions,
  agentToolsFor,
  creditsForUsage,
  DEFAULT_THINKING_EFFORT,
  planLimits,
  type AssistantMode,
  type AssistantTone,
  type AssistantV2AiReason,
  type AssistantV2Status,
  type BillingState,
  type MessagePart,
  type PlanCode,
  type ThinkingEffort,
  type TurnDoneReason,
  type TurnEvent,
} from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { messages as messageRows, subscriptions } from '../../db/schema'
import { newId } from '../../lib/crypto'
import { getBillingState } from '../billing'
import { accessOf } from '../billing/plans'
import type { AiConfig } from '../ai/config'
import { noteProviderOutcome, providerBlocksTurns, providerStatus } from '../ai/provider'
import { creditsLeftOf, dailyAiUsage, dailyCreditsLeft, releaseCredits, reserveCredits, settleCredits } from '../ai/credits'
import { AiError, assistantMessageOf, createAiClient, estimateTokensOf, type AiClient, type ChatMessageParam, type ChatResult, type ToolDefinition } from '../ai/client'
import { appendMessage, historyForModel, recentConversationNotes, toMessage, updateMessageParts, type MessageRow } from './conversations'
import { AGENT_TURN_LIMITS, runToolCall, type Emit, type TurnState } from './executor'
import { memoriesForPrompt } from './memory'
import { buildAgentSystemPrompt, buildTurnContext } from './prompt'
import { listConversationRuns } from './runs'
import { orgSnapshot, roleLabel, screenSnapshot, todayLabel, toolResultForModel, type AgentSession } from './session'

/** Temperatura del agente con el razonamiento apagado (varios proveedores usan 1,0 por defecto). */
const AGENT_TEMPERATURE = 0.3

/**
 * Salida y duración por nivel de razonamiento: pensar también gasta salida, y con un tope bajo el
 * modelo se quedaría sin espacio para responder.
 */
const EFFORT_BUDGET: Record<ThinkingEffort, { tokens: number; durationMs: number }> = {
  low: { tokens: 8192, durationMs: 240_000 },
  high: { tokens: 16_384, durationMs: 300_000 },
  xhigh: { tokens: 32_768, durationMs: 480_000 },
  max: { tokens: 65_536, durationMs: 840_000 },
}

/** Pensando, el proveedor puede pasar un buen rato sin mandar nada. */
const THINKING_IDLE_MS = 150_000

export interface AgentAiOptions {
  /** Configuración de IA vigente (null = sin clave: modo local). */
  ai: AiConfig | null
  /** fetch para el proveedor (las pruebas lo simulan). */
  fetch?: typeof fetch
}

// ── Disponibilidad de la IA y modos ──────────────────────────────────────────

export interface AiGate {
  /** Motivo por el que no hay IA (ausente = disponible). */
  reason?: AssistantV2AiReason
  billing: BillingState
  plan: PlanCode
  creditsLeft: number
  included: number
  /** Créditos que la organización aún puede gastar hoy. */
  dailyLeft: number
  /** Turnos con IA que esta persona aún puede hacer hoy. */
  turnsLeft: number
  readOnly: boolean
}

export async function aiGate(deps: AppDeps, auth: AuthContext, ai: AiConfig | null): Promise<AiGate> {
  const now = deps.now()
  const [billing, usage, [sub]] = await Promise.all([
    getBillingState(deps.db, auth.org.id, deps.config.billingProvider, now),
    dailyAiUsage(deps, auth.org.id, auth.user.id),
    deps.db.select().from(subscriptions).where(eq(subscriptions.orgId, auth.org.id)).limit(1),
  ])
  const readOnly = sub ? accessOf(sub, now).readOnly : false
  const creditsLeft = creditsLeftOf(billing)
  const limits = planLimits(billing.plan)
  const dailyLeft = dailyCreditsLeft(billing.plan, usage)
  const turnsLeft = Math.max(0, limits.aiTurnsPerUserDay - usage.userTurns)
  const planHasAi = billing.features.includes('assistant') && billing.status !== 'expired'
  const reason: AssistantV2AiReason | undefined = !planHasAi ? 'plan' : !ai ? 'no_key' : creditsLeft <= 0 ? 'no_credits' : dailyLeft <= 0 || turnsLeft <= 0 ? 'daily_limit' : undefined
  return {
    ...(reason ? { reason } : {}),
    billing,
    plan: billing.plan,
    creditsLeft,
    included: billing.aiCredits.included + billing.aiCredits.extra,
    dailyLeft,
    turnsLeft,
    readOnly,
  }
}

/** Modos que la persona puede usar: en modo lectura solo Chat (no hay cambios posibles). */
export function modesFor(gate: Pick<AiGate, 'readOnly'>): AssistantMode[] {
  return gate.readOnly ? ['chat'] : ['chat', 'supervised', 'full']
}

export function modeCeiling(gate: Pick<AiGate, 'readOnly'>): AssistantMode {
  return gate.readOnly ? 'chat' : 'full'
}

export async function assistantStatusV2(deps: AppDeps, auth: AuthContext, ai: AiConfig | null, assistants: { limit: number; used: number }, fetch?: typeof globalThis.fetch): Promise<AssistantV2Status> {
  const gate = await aiGate(deps, auth, ai)
  // El proveedor solo se consulta si es lo único que falta saber (y sin gastar tokens).
  const provider = !gate.reason || gate.reason === 'no_key' ? await providerStatus(deps, ai, fetch ? { fetch } : {}) : undefined
  const blocked = provider ? providerBlocksTurns(provider.state) : false
  const reason: AssistantV2AiReason | undefined = provider && blocked ? (provider.state === 'no_key' ? 'no_key' : 'provider') : gate.reason
  return {
    ai: { available: !reason, ...(reason ? { reason } : {}), ...(provider ? { provider: provider.state } : {}) },
    credits: { left: gate.creditsLeft, included: gate.included, dailyLeft: gate.dailyLeft },
    turnsLeftToday: gate.reason === 'plan' ? 0 : gate.turnsLeft,
    modes: modesFor(gate),
    assistants,
  }
}

export function aiClientFor(deps: AppDeps, options: AgentAiOptions): AiClient | null {
  const ai = options.ai
  if (!ai) return null
  return createAiClient(ai, { ...(options.fetch ? { fetch: options.fetch } : {}), onOutcome: (outcome) => noteProviderOutcome(deps, ai, outcome) })
}

// ── Avisos ───────────────────────────────────────────────────────────────────

type NoticeCode = AssistantV2AiReason | 'ai_timeout' | 'ai_rate_limit' | 'ai_error' | 'ai_unavailable' | 'ai_filtered' | 'incomplete' | 'step_limit' | 'turn_credit_cap' | 'read_only'

const WARNING_CODES = new Set<NoticeCode>(['no_credits', 'daily_limit', 'incomplete', 'step_limit', 'turn_credit_cap', 'read_only', 'provider', 'ai_unavailable', 'ai_filtered'])

export function noticeEvent(session: Pick<AgentSession, 'text'>, code: NoticeCode): Extract<TurnEvent, { type: 'notice' }> {
  return { type: 'notice', level: WARNING_CODES.has(code) ? 'warning' : 'info', code, message: session.text.t(`notice.${code}`) }
}

export function noticePart(session: Pick<AgentSession, 'text'>, code: NoticeCode): MessagePart {
  const event = noticeEvent(session, code)
  return { type: 'notice', level: event.level, code, text: event.message }
}

/** Qué se le dice a la persona. Lo técnico (clave, saldo, modelo) queda en el diagnóstico de Ajustes. */
function errorCodeOf(error: unknown): 'ai_timeout' | 'ai_rate_limit' | 'ai_error' | 'ai_unavailable' | 'ai_filtered' {
  if (error instanceof AiError) {
    if (error.kind === 'timeout') return 'ai_timeout'
    if (error.kind === 'rate_limit') return 'ai_rate_limit'
    if (error.kind === 'moderation') return 'ai_filtered'
    if (error.kind === 'auth' || error.kind === 'forbidden' || error.kind === 'billing' || error.kind === 'model') return 'ai_unavailable'
  }
  return 'ai_error'
}

const RETRYABLE_KINDS = new Set(['timeout', 'rate_limit', 'network', 'server'])

/** Mensaje del asistente con solo un aviso (sin IA, tope, error): visible, no va al modelo. */
export async function appendNotice(session: AgentSession, code: NoticeCode, emit: Emit, id?: string): Promise<MessageRow> {
  emit(noticeEvent(session, code))
  const row = await appendMessage(session.deps, session.conversation, { ...(id ? { id } : {}), role: 'assistant', source: 'system', parts: [noticePart(session, code)] })
  emit({ type: 'message.done', message: toMessage(row) })
  return row
}

// ── Prompt ───────────────────────────────────────────────────────────────────

/** Datos del turno: quién habla, modo, personalidad, empresa, memoria, fecha y pantalla. */
export async function turnContextFor(session: AgentSession, userText: string): Promise<string> {
  const { deps, auth, assistant } = session
  const [snapshot, screen, memories, earlier] = await Promise.all([
    orgSnapshot(session),
    screenSnapshot(session),
    assistant.memoryEnabled ? memoriesForPrompt(deps, auth, assistant.id, userText) : Promise.resolve([]),
    assistant.memoryEnabled ? recentConversationNotes(deps, auth, session.conversation.id) : Promise.resolve([]),
  ])
  const personality = (assistant.personality ?? {}) as { tone?: AssistantTone; instructions?: string }
  return buildTurnContext({
    assistantName: assistant.name,
    orgName: auth.org.name,
    userFirstName: (auth.user.name ?? '').trim().split(/\s+/)[0] ?? '',
    roleName: roleLabel(auth),
    mode: session.mode,
    tone: personality.tone ?? 'friendly',
    instructions: typeof personality.instructions === 'string' ? personality.instructions : '',
    today: todayLabel(deps.now()),
    orgSnapshot: snapshot,
    memories: memories.map((m) => ({ scope: m.scope, kind: m.kind, content: m.content })),
    summary: session.conversation.summary ?? '',
    earlierConversations: earlier,
    screen,
  })
}

/**
 * Antepone el contexto al último mensaje de la persona. No se guarda: el próximo turno lo pone en
 * su propio mensaje y todo lo anterior sigue siendo el mismo prefijo para la caché del proveedor.
 */
export function withTurnContext(history: readonly ChatMessageParam[], context: string): ChatMessageParam[] {
  const messages = [...history]
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role !== 'user') continue
    if (typeof message.content === 'string') {
      messages[i] = { ...message, content: `${context}\n\n${message.content}` }
      return messages
    }
    if (Array.isArray(message.content)) {
      messages[i] = { ...message, content: [{ type: 'text', text: context }, ...message.content] }
      return messages
    }
  }
  return [{ role: 'user', content: context }, ...messages]
}

function hasImage(message: ChatMessageParam): boolean {
  return Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url')
}

/** Herramientas que se le ofrecen al modelo (las del modo y los ámbitos del asistente). */
export function toolsFor(session: Pick<AgentSession, 'mode' | 'assistant'>): ToolDefinition[] {
  const scopes = Array.isArray(session.assistant.scopes) ? session.assistant.scopes : []
  return agentToolDefinitions(agentToolsFor({ mode: session.mode, scopes })) as unknown as ToolDefinition[]
}

// ── Vueltas con el modelo ────────────────────────────────────────────────────

export interface RoundsInput {
  client: AiClient
  /** Créditos que la organización aún puede gastar hoy (al empezar). */
  dailyLeft: number
  /** Texto del pedido (para elegir recuerdos relevantes). */
  userText: string
  /** Id del primer mensaje del asistente (anunciado en turn.started). */
  firstMessageId?: string
  /** Razonamiento pedido para este turno. */
  effort?: ThinkingEffort
}

/**
 * Llama al modelo y ejecuta herramientas hasta una respuesta final, propuestas pendientes,
 * cancelación o un tope. Emite message.delta / tool.* / ui / affected / credits / message.done.
 */
export async function runModelRounds(session: AgentSession, state: TurnState, emit: Emit, input: RoundsInput): Promise<TurnDoneReason> {
  const { deps, auth, text } = session
  const signal = session.signal
  const tools = toolsFor(session)
  const toolsJson = JSON.stringify(tools)
  const context = await turnContextFor(session, input.userText)
  const history = await historyForModel(deps, session.conversation)
  const messages: ChatMessageParam[] = [{ role: 'system', content: buildAgentSystemPrompt(session.locale) }, ...withTurnContext(history, context)]
  const thinking = input.client.config.agentThinking !== false
  const effort = input.effort ?? DEFAULT_THINKING_EFFORT
  const budget = EFFORT_BUDGET[effort]
  const maxTokens = thinking ? Math.max(input.client.config.maxCompletionTokens, budget.tokens) : input.client.config.maxCompletionTokens
  let emptyRetries = 0

  for (let step = 0; step < AGENT_TURN_LIMITS.maxSteps; step++) {
    if (signal?.aborted) return 'aborted'
    if (state.creditsUsed >= AGENT_TURN_LIMITS.turnCreditCap) {
      await appendNotice(session, 'turn_credit_cap', emit)
      return 'limit'
    }
    if (input.dailyLeft - state.creditsUsed <= 0) {
      await appendNotice(session, 'daily_limit', emit)
      return 'limit'
    }
    // La reserva se ajusta al costo real al terminar: para reservar basta un consumo normal.
    const estimate = creditsForUsage({ inputTokens: estimateTokensOf(messages, toolsJson), outputTokens: input.client.config.maxCompletionTokens })
    let reservation
    try {
      reservation = await reserveCredits(deps, auth, estimate, { conversationId: session.conversation.id, assistantId: session.assistant.id })
    } catch (error) {
      deps.logger.warn('asistente: no se pudo reservar créditos', error instanceof Error ? error.message : error)
      emit({ type: 'error', code: 'ai_error', message: text.t('notice.ai_error'), retryable: true })
      await appendNotice(session, 'ai_error', emit)
      return 'error'
    }
    if (!reservation) {
      // Sin reserva: o se acabó el saldo del mes o, con turnos simultáneos, el tope diario.
      const billing = await getBillingState(deps.db, auth.org.id, deps.config.billingProvider, deps.now())
      const daily = dailyCreditsLeft(billing.plan, await dailyAiUsage(deps, auth.org.id, auth.user.id))
      await appendNotice(session, creditsLeftOf(billing) > 0 && daily <= 0 ? 'daily_limit' : 'no_credits', emit)
      return 'limit'
    }

    const messageId = step === 0 && input.firstMessageId ? input.firstMessageId : newId()
    let streamed = ''
    let result: ChatResult
    try {
      result = await input.client.chat({
        messages,
        tools,
        ...(messages.some(hasImage) ? { model: input.client.config.visionModel } : {}),
        ...(thinking ? { thinking: 'enabled' as const, effort, maxDurationMs: Math.max(input.client.config.maxDurationMs, budget.durationMs), idleTimeoutMs: Math.max(input.client.config.timeoutMs, THINKING_IDLE_MS) } : {}),
        maxCompletionTokens: maxTokens,
        // Solo se envía con el razonamiento apagado: un agente que opera datos no debe improvisar.
        temperature: AGENT_TEMPERATURE,
        ...(signal ? { signal } : {}),
        onEvent: (event) => {
          // Solo el texto visible; el razonamiento interno nunca sale del servidor.
          if (event.type === 'content' && event.text) {
            streamed += event.text
            emit({ type: 'message.delta', messageId, text: event.text })
          }
        },
      })
    } catch (error) {
      await releaseCredits(deps, reservation)
      if ((error instanceof AiError && error.kind === 'aborted') || signal?.aborted) {
        if (streamed.trim()) await appendMessage(deps, session.conversation, { id: messageId, role: 'assistant', source: 'ai', parts: [{ type: 'text', text: streamed.trim() }] })
        return 'aborted'
      }
      const code = errorCodeOf(error)
      deps.logger.warn(`asistente: la IA falló (${error instanceof AiError ? error.kind : 'desconocido'})`, error instanceof Error ? error.message : error)
      emit({ type: 'error', code, message: text.t(`notice.${code}`), retryable: error instanceof AiError ? RETRYABLE_KINDS.has(error.kind) : true })
      const row = await appendMessage(deps, session.conversation, {
        id: messageId,
        role: 'assistant',
        source: 'system',
        parts: [...(streamed.trim() ? [{ type: 'text' as const, text: streamed.trim() }] : []), noticePart(session, code)],
      })
      emit({ type: 'message.done', message: toMessage(row) })
      return 'error'
    }

    const settled = await settleCredits(deps, auth, reservation, result.credits, result.model, result.usage)
    state.creditsUsed += settled.credits
    emit({ type: 'credits', used: settled.credits, left: settled.left, turnTotal: state.creditsUsed })

    // Respuesta en blanco (a veces solo traía una marca interna): se vuelve a pedir una vez antes de avisar.
    if (result.complete && !result.toolCalls.length && !result.content && emptyRetries < 1) {
      emptyRetries++
      continue
    }

    // Ids de llamada del servidor: únicos por organización y estables en el historial.
    const calls = result.complete ? result.toolCalls.map((c) => ({ ...c, id: `tc_${newId()}` })) : []
    const textParts: MessagePart[] = result.content ? [{ type: 'text', text: result.content }] : []
    const row = await appendMessage(deps, session.conversation, {
      id: messageId,
      role: 'assistant',
      source: 'ai',
      parts: textParts,
      reasoning: result.reasoning || null,
      toolCalls: calls.length ? calls.map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })) : null,
      model: result.model,
      credits: settled.credits,
      tokens: { in: result.usage.inputTokens, cached: result.usage.cachedInputTokens, out: result.usage.outputTokens },
    })
    // El mensaje vuelve al proveedor con su razonamiento original (con razonamiento activo, varios proveedores responden 400 si falta).
    messages.push(assistantMessageOf({ content: result.content, reasoning: result.reasoning, toolCalls: calls }))

    // Cortada, filtrada o vacía (p. ej. la llamada se filtró dentro del razonamiento y no llegó
    // como herramienta): nunca se muestra un mensaje en blanco.
    const empty = !calls.length && !result.content
    if (!result.complete || empty) {
      const code = result.finishReason === 'content_filter' ? 'ai_filtered' : 'incomplete'
      const parts = [...textParts, noticePart(session, code)]
      await updateMessageParts(deps, row.id, parts)
      emit(noticeEvent(session, code))
      emit({ type: 'message.done', message: toMessage({ ...row, parts }) })
      return 'limit'
    }
    if (!calls.length) {
      emit({ type: 'message.done', message: toMessage(row) })
      return 'completed'
    }

    const toolParts: MessagePart[] = []
    let proposals = 0
    for (const [index, call] of calls.entries()) {
      let content: string | undefined
      if (index >= AGENT_TURN_LIMITS.maxCallsPerStep || signal?.aborted) {
        content = toolResultForModel(call.function.name, {
          ok: false,
          status: 'skipped',
          note: signal?.aborted ? 'Cancelled by the user before running.' : `Not executed: at most ${AGENT_TURN_LIMITS.maxCallsPerStep} tool calls per step. Call it again if still needed.`,
        })
      } else {
        const outcome = await runToolCall(session, { id: call.id, name: call.function.name, args: call.function.arguments, source: 'ai' }, state, { messageId, emit })
        toolParts.push(...outcome.parts)
        if (outcome.status === 'proposed') proposals++
        content = outcome.modelContent
      }
      if (content !== undefined) {
        await appendMessage(deps, session.conversation, { role: 'tool', source: 'ai', parts: [], text: content, toolCallId: call.id })
        messages.push({ role: 'tool', tool_call_id: call.id, content })
      }
    }
    const parts: MessagePart[] = [...(proposals && !result.content ? [{ type: 'text' as const, text: text.t('reply.proposed', { count: proposals }) }] : textParts), ...toolParts]
    await updateMessageParts(deps, row.id, parts)
    emit({ type: 'message.done', message: toMessage({ ...row, parts }) })
    if (proposals) return 'approval_required'
    if (signal?.aborted) return 'aborted'
  }
  await appendNotice(session, 'step_limit', emit)
  return 'limit'
}

// ── Después de decidir una propuesta ─────────────────────────────────────────

/**
 * Tras aprobar o rechazar: si quedan propuestas del mismo mensaje, se espera. Si no, y la propuesta
 * vino del modelo y algo se ejecutó, el modelo continúa (con créditos y topes nuevos). Si todo se
 * rechazó, o vino de un comando local, o no hay IA, se responde sin modelo (0 créditos).
 */
export async function continueAfterDecision(
  session: AgentSession,
  state: TurnState,
  emit: Emit,
  input: { messageId: string | null; options: AgentAiOptions; rejectedReason?: string; effort?: ThinkingEffort },
): Promise<TurnDoneReason> {
  const { deps } = session
  const runs = input.messageId
    ? (await listConversationRuns(deps, session.conversation.orgId, [session.conversation.id])).filter((r) => r.messageId === input.messageId)
    : []
  const now = deps.now()
  const pending = runs.filter((r) => r.status === 'proposed' && (!r.expiresAt || r.expiresAt > now))
  if (pending.length) return 'approval_required'

  const [source] = input.messageId
    ? await deps.db.select({ source: messageRows.source }).from(messageRows).where(and(eq(messageRows.orgId, session.conversation.orgId), eq(messageRows.id, input.messageId))).limit(1)
    : []
  // Solo cuentan las que pasaron por una tarjeta (las lecturas del mismo mensaje ya se hicieron antes).
  const decided = runs.filter((r) => r.decidedAt || r.status === 'expired')
  const executed = decided.filter((r) => r.status === 'executed')
  const fromModel = source?.source === 'ai'
  if (fromModel && executed.length) {
    const gate = await aiGate(deps, session.auth, input.options.ai)
    const client = aiClientFor(deps, input.options)
    // La continuación no es un turno nuevo: no descuenta del tope de turnos diarios.
    const blocked = gate.reason && gate.reason !== 'daily_limit' ? gate.reason : gate.dailyLeft <= 0 ? 'daily_limit' : undefined
    if (client && !blocked) return runModelRounds(session, state, emit, { client, dailyLeft: gate.dailyLeft, userText: '', ...(input.effort ? { effort: input.effort } : {}) })
  }
  // Respuesta determinista (sin modelo).
  const summaries = executed.map((r) => (r.result as { summary?: string } | null)?.summary).filter((s): s is string => Boolean(s))
  const rejectedAll = decided.length > 0 && decided.every((r) => r.status === 'rejected' || r.status === 'expired')
  const reply = summaries.length
    ? summaries.join('\n')
    : rejectedAll
      ? input.rejectedReason
        ? session.text.t('reply.rejectedWithReason', { reason: input.rejectedReason })
        : session.text.t('reply.rejected')
      : decided.some((r) => r.status === 'failed')
        ? session.text.t('reply.failed', { reason: session.text.t('failure.default') })
        : session.text.t('reply.done')
  const row = await appendMessage(deps, session.conversation, { role: 'assistant', source: 'system', parts: [{ type: 'text', text: reply }] })
  emit({ type: 'message.done', message: toMessage(row) })
  return 'completed'
}
