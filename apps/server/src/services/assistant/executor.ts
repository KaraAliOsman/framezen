/**
 * Ejecutor de herramientas del agente: una sola tubería para llamadas del modelo y del intérprete
 * local (cero créditos), con la semántica de los modos:
 *
 * - Valida nombre y argumentos (zod estricto del registro compartido). Desconocida o inválida →
 *   falla cerrada, el modelo recibe el motivo.
 * - Política (`agentToolDecision`): Chat = lectura + memoria + interfaz; Supervisado = todo lo que no
 *   es lectura queda como PROPUESTA con tarjeta (vista previa calculada sin escribir, huella de
 *   argumentos, vencimiento); Acceso total = las escrituras se ejecutan con deshacer y lo externo,
 *   producción, borrados y precios piden confirmación explícita.
 * - Cada llamada queda en `tool_runs` (auditoría) y se despacha con la sesión de la persona por
 *   rutas fijas (services/dispatch.ts): mismos permisos, plan, modo lectura y versiones que la web.
 * - Aprobar ejecuta EXACTAMENTE los argumentos y el contexto guardados (nunca se le pide al modelo
 *   que los reconstruya); deshacer usa la ruta fija guardada con chequeo de conflicto.
 */
import { eq } from 'drizzle-orm'
import {
  AGENT_TOOLS,
  TOOL_RUN_APPROVAL_TTL_MS,
  agentToolDecision,
  isAgentTool,
  normalizeAgentCall,
  parseAgentToolArgs,
  parseUiAction,
  type AffectedEntity,
  type AgentToolName,
  type AgentToolSpec,
  type AssistantMode,
  type MessagePart,
  type ToolError,
  type ToolPreview,
  type ToolRun,
  type TurnEvent,
  type TurnUiState,
} from '@dekopen/shared'
import { toolRuns } from '../../db/schema'
import { HttpError, apiError } from '../../lib/errors'
import { DispatchError, dispatch } from '../dispatch'
import { appendMessage, findMessage, searchPastConversations, updateMessageParts, toMessage } from './conversations'
import { deleteMemory, restoreMemory } from './memory'
import { AGENT_ROUTES, isAgentRouteKey } from './routes-map'
import { argsHashOf, boundContextOf, expireIfStale, insertToolRun, listConversationRuns, stableJson, toToolRun, transitionToolRun, type BoundContext, type ToolRunRow } from './runs'
import { toolContext, toolResultForModel, redactForModel, type AgentSession } from './session'
import { TOOL_HANDLERS, ToolFailure, type AgentUndo, type ToolHandler, type ToolOutcome, type TurnMemo } from './tools'
import type { UndoCheck } from './tools/types'

/** Topes por turno (cada continuación tras una aprobación es un turno nuevo con sus topes). */
export const AGENT_TURN_LIMITS = {
  /** Llamadas al modelo por turno. */
  maxSteps: 14,
  /** Herramientas por respuesta del modelo (el resto se informa como no ejecutado). */
  maxCallsPerStep: 12,
  maxCallsPerTurn: 48,
  /** Escrituras ejecutadas por turno. */
  maxWritesPerTurn: 30,
  /** Créditos máximos de un turno (luego se detiene y pregunta). */
  turnCreditCap: 250,
} as const

/** Ventana para deshacer acciones del asistente. */
export const UNDO_WINDOW_MS = 30 * 24 * 60 * 60_000

export type Emit = (event: TurnEvent) => void

export interface TurnState {
  memo: TurnMemo
  calls: number
  writes: number
  creditsUsed: number
  /** Llamadas que ya fallaron en este turno (no se repiten idénticas). */
  failed: Set<string>
}

export function newTurnState(memo: TurnMemo = {}): TurnState {
  return { memo, calls: 0, writes: 0, creditsUsed: 0, failed: new Set() }
}

export interface ToolCallInput {
  /** Id del servidor (único por organización), también el que ve el modelo en el historial. */
  id: string
  name: string
  /** Objeto o texto JSON tal cual llegó. */
  args: unknown
  source: 'ai' | 'local'
}

export interface ToolCallResult {
  status: 'executed' | 'proposed' | 'failed'
  run: ToolRun
  /** Partes para el mensaje del asistente (actividad y tarjeta de aprobación). */
  parts: MessagePart[]
  /** Resultado para el modelo (en propuestas se agrega recién al decidir). */
  modelContent?: string
  summary: string
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const FAILURE_KEYS: Record<string, string> = {
  no_quote: 'no_quote',
  not_found: 'not_found',
  http_404: 'not_found',
  invalid_args: 'invalid_args',
  not_allowed: 'not_allowed',
  dispatch_denied: 'not_allowed',
  dispatch_bad_params: 'invalid_args',
  unknown_tool: 'unknown_tool',
  version_conflict: 'version_conflict',
  forbidden: 'forbidden',
  http_403: 'forbidden',
  read_only: 'read_only',
  plan_required: 'plan_required',
  plan_limit: 'plan_required',
  turn_call_limit: 'limit',
  turn_write_limit: 'limit',
  repeated_failure: 'repeated',
  ambiguous: 'ambiguous',
}

/**
 * Motivo visible de una falla en el idioma de la persona. Los mensajes de las rutas ya vienen
 * traducidos (el despacho manda el idioma de la sesión); los de los manejadores son para el modelo.
 */
function visibleReason(session: AgentSession, error: ToolError, routeError?: ToolError): string {
  const key = FAILURE_KEYS[error.code]
  if (key) return session.text.t(`failure.${key}` as 'failure.default')
  if (routeError && routeError.code === error.code && routeError.message === error.message && error.message) return error.message
  return session.text.t('failure.default')
}

function boundedArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const json = JSON.stringify(raw)
    return json.length <= 8000 ? (raw as Record<string, unknown>) : { raw: json.slice(0, 2000) }
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return boundedArgs(parsed)
    } catch {
      // texto no JSON: se guarda recortado
    }
    return { raw: raw.slice(0, 2000) }
  }
  return {}
}

function previewKey(preview: ToolPreview | null | undefined): string {
  if (!preview) return ''
  return stableJson({ title: preview.title, lines: preview.lines, changes: preview.changes ?? [], totals: preview.totals ?? null })
}

/** ¿El esquema de la herramienta acepta `quoteId`? (para fijar la cotización en la propuesta). */
function acceptsQuoteId(spec: AgentToolSpec): boolean {
  const shape = (spec.args as unknown as { shape?: Record<string, unknown> }).shape
  return Boolean(shape && Object.prototype.hasOwnProperty.call(shape, 'quoteId'))
}

const isBusinessWrite = (spec: AgentToolSpec) => spec.kind === 'server' && spec.risk !== 'read' && !spec.memory

/**
 * Política del modo + una regla contra la inyección persistente: un recuerdo de TODA la empresa
 * pedido por el modelo (que pudo leer instrucciones escondidas en datos de terceros) entraría en el
 * prompt de cada persona del equipo, así que pide aprobación en cualquier modo. Si lo pide la
 * persona con un comando local («recuerda para todos que…»), se guarda directo.
 */
export function toolCallDecision(mode: AssistantMode, spec: AgentToolSpec, args: Record<string, unknown>, source: ToolCallInput['source']) {
  const base = agentToolDecision(mode, spec)
  if (base === 'execute' && source === 'ai' && spec.name === 'remember' && args.scope === 'org') return 'approve'
  return base
}

interface Invocation {
  outcome: ToolOutcome
  /** Último error de una ruta despachada (su mensaje ya viene en el idioma de la persona). */
  routeError?: ToolError
}

async function invoke(
  session: AgentSession,
  name: AgentToolName,
  args: unknown,
  input: { toolCallId: string; toolRunId?: string; memo: TurnMemo; dryRun: boolean; ui?: TurnUiState },
): Promise<Invocation> {
  const handler = TOOL_HANDLERS[name] as ToolHandler
  const base = toolContext(session, { ...input, tool: name })
  let routeError: ToolError | undefined
  const ctx = {
    ...base,
    call: async <T>(route: Parameters<typeof base.call>[0], call?: Parameters<typeof base.call>[1]) => {
      const res = await base.call<T>(route, call)
      if (!res.ok && res.error) routeError = { code: res.error.code, message: res.error.message }
      return res
    },
    undoLast: () => undoLastRun(session),
    searchConversations: (query: string) => searchPastConversations(session.deps, session.auth, query, session.conversation.id),
  }
  try {
    return { outcome: await handler(ctx, args as never), routeError }
  } catch (error) {
    if (error instanceof ToolFailure) return { outcome: { ok: false, summary: error.summary ?? '', error: { code: error.code, message: error.message } }, routeError }
    if (error instanceof HttpError) return { outcome: { ok: false, summary: '', error: { code: error.code, message: error.message } }, routeError }
    if (error instanceof DispatchError) return { outcome: { ok: false, summary: '', error: { code: error.code, message: 'This action is not available to the assistant.' } }, routeError }
    session.deps.logger.error(`asistente: la herramienta ${name} falló`, error)
    return { outcome: { ok: false, summary: '', error: { code: 'internal', message: 'Unexpected error while running the tool.' } }, routeError }
  }
}

function toolCallPart(run: ToolRun, summary: string | undefined): MessagePart {
  return {
    type: 'tool_call',
    toolCallId: run.toolCallId,
    tool: run.tool,
    args: run.args,
    risk: run.risk,
    status: run.status,
    toolRunId: run.id,
    ...(summary ? { summary } : {}),
  }
}

// ── Fallas ───────────────────────────────────────────────────────────────────

async function recordFailure(
  session: AgentSession,
  call: ToolCallInput,
  state: TurnState,
  input: { messageId: string; emit: Emit; spec?: AgentToolSpec; args?: Record<string, unknown>; error: ToolError; routeError?: ToolError; issues?: string[]; status?: 'failed' | 'not_allowed' },
): Promise<ToolCallResult> {
  const { deps, auth } = session
  const tool = input.spec?.name ?? (call.name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown')
  const reason = visibleReason(session, input.error, input.routeError)
  const row = await insertToolRun(deps, {
    auth,
    assistantId: session.assistant.id,
    conversationId: session.conversation.id,
    messageId: input.messageId,
    toolCallId: call.id,
    tool,
    risk: input.spec?.risk ?? 'read',
    mode: session.mode,
    executor: input.spec?.kind === 'ui' ? 'browser' : call.source === 'local' ? 'local' : 'server',
    status: 'failed',
    args: input.args ?? boundedArgs(call.args),
    error: { code: input.error.code, message: input.error.message.slice(0, 500) },
  })
  state.failed.add(`${tool}\n${stableJson(input.args ?? boundedArgs(call.args))}`)
  const run = toToolRun(row)
  const summary = session.text.t('reply.failed', { reason })
  input.emit({ type: 'tool.failed', toolRun: run, error: { code: input.error.code, message: reason } })
  return {
    status: 'failed',
    run,
    parts: [toolCallPart(run, summary)],
    summary,
    modelContent: toolResultForModel(tool, {
      ok: false,
      status: input.status ?? 'failed',
      error: { code: input.error.code, message: input.error.message || reason },
      ...(input.issues?.length ? { issues: input.issues } : {}),
    }),
  }
}

// ── Ejecución ────────────────────────────────────────────────────────────────

/** Cierra una corrida aprobada con el resultado del manejador (ejecutada o fallida). */
async function finish(
  session: AgentSession,
  row: ToolRunRow,
  spec: AgentToolSpec,
  invocation: Invocation,
  state: TurnState,
  emit: Emit,
): Promise<ToolCallResult> {
  const { deps } = session
  const { outcome } = invocation
  if (!outcome.ok) {
    const error: ToolError = { code: outcome.error?.code ?? 'failed', message: (outcome.error?.message ?? '').slice(0, 500) }
    const reason = visibleReason(session, error, invocation.routeError)
    const failed = (await transitionToolRun(deps, row, 'failed', { error })) ?? row
    state.failed.add(`${spec.name}\n${stableJson(row.args)}`)
    const run = toToolRun(failed)
    const summary = session.text.t('reply.failed', { reason })
    emit({ type: 'tool.failed', toolRun: run, error: { code: error.code, message: reason } })
    return {
      status: 'failed',
      run,
      parts: [toolCallPart(run, summary)],
      summary,
      modelContent: toolResultForModel(spec.name, {
        ok: false,
        status: 'failed',
        error,
        ...(outcome.data !== undefined ? { data: outcome.data } : {}),
      }),
    }
  }
  const affected = outcome.affected ?? []
  const executed =
    (await transitionToolRun(deps, row, 'executed', {
      result: { summary: outcome.summary, ...(outcome.data !== undefined ? { data: redactForModel(outcome.data) } : {}) },
      undo: outcome.undo ?? null,
      affected: affected.length ? affected : null,
      executedAt: deps.now(),
    })) ?? row
  if (isBusinessWrite(spec)) state.writes++
  const run = toToolRun(executed)
  emit({ type: 'tool.executed', toolRun: run })
  for (const raw of outcome.ui ?? []) {
    const action = parseUiAction(raw)
    if (action) emit({ type: 'ui', toolCallId: row.toolCallId, action })
  }
  if (affected.length) emit({ type: 'affected', entities: affected })
  return {
    status: 'executed',
    run,
    parts: [toolCallPart(run, outcome.summary)],
    summary: outcome.summary,
    modelContent: toolResultForModel(spec.name, {
      ok: true,
      status: 'executed',
      summary: outcome.summary,
      ...(outcome.data !== undefined ? { data: outcome.data } : {}),
      ...(run.undoable
        ? { note: 'Done. The user can undo it from the activity list.' }
        : spec.kind === 'ui'
          ? { note: 'Sent to the user’s screen (the app may skip it if a form has unsaved changes). Do not claim more than that.' }
          : {}),
    }),
  }
}

/**
 * Una llamada a herramienta de punta a punta: valida, decide según el modo, ejecuta o propone,
 * registra en tool_runs y emite los eventos (tool.*, ui, affected).
 */
export async function runToolCall(session: AgentSession, call: ToolCallInput, state: TurnState, ctx: { messageId: string; emit: Emit }): Promise<ToolCallResult> {
  const { deps, auth } = session
  const normalized = call.source === 'local' ? normalizeAgentCall(call.name, call.args) : isAgentTool(call.name) ? { name: call.name, args: call.args } : null
  if (!normalized) {
    return recordFailure(session, call, state, { ...ctx, error: { code: 'unknown_tool', message: `Unknown tool "${call.name.slice(0, 64)}". Use only the tools provided.` } })
  }
  const spec = AGENT_TOOLS[normalized.name] as AgentToolSpec
  const parsed = parseAgentToolArgs(normalized.name, normalized.args)
  const rawArgs = boundedArgs(normalized.args)
  if (state.failed.has(`${spec.name}\n${stableJson(parsed.ok ? parsed.args : rawArgs)}`)) {
    return recordFailure(session, call, state, {
      ...ctx,
      spec,
      args: parsed.ok ? (parsed.args as Record<string, unknown>) : rawArgs,
      error: { code: 'repeated_failure', message: 'Not executed: this identical call already failed in this turn. Change the approach or ask the user.' },
    })
  }
  if (!parsed.ok) {
    return recordFailure(session, call, state, { ...ctx, spec, args: rawArgs, issues: parsed.issues, error: { code: 'invalid_args', message: 'The arguments do not match the tool schema.' } })
  }
  let args = parsed.args as Record<string, unknown>
  const inScope = spec.scope === 'core' || session.assistant.scopes.includes(spec.scope)
  const decision = toolCallDecision(session.mode, spec, args, call.source)
  if (!inScope || decision === 'deny') {
    return recordFailure(session, call, state, {
      ...ctx,
      spec,
      args,
      status: 'not_allowed',
      error: {
        code: 'not_allowed',
        message: !inScope
          ? `The assistant is not configured to use "${spec.scope}" tools. Tell the user it can be enabled in the assistant settings.`
          : 'Not allowed in Chat mode: no business changes. Explain what you would do and suggest switching to Supervised or Full access.',
      },
    })
  }
  if (state.calls >= AGENT_TURN_LIMITS.maxCallsPerTurn) {
    return recordFailure(session, call, state, { ...ctx, spec, args, error: { code: 'turn_call_limit', message: 'Tool call limit for this turn reached. Summarise what was done and ask whether to continue.' } })
  }
  if (isBusinessWrite(spec) && decision === 'execute' && state.writes >= AGENT_TURN_LIMITS.maxWritesPerTurn) {
    return recordFailure(session, call, state, { ...ctx, spec, args, error: { code: 'turn_write_limit', message: 'Write limit for this turn reached. Summarise and ask whether to continue.' } })
  }
  state.calls++
  const executor = spec.kind === 'ui' ? 'browser' : call.source === 'local' ? 'local' : 'server'

  if (decision === 'execute') {
    const row = await insertToolRun(deps, {
      auth,
      assistantId: session.assistant.id,
      conversationId: session.conversation.id,
      messageId: ctx.messageId,
      toolCallId: call.id,
      tool: spec.name,
      risk: spec.risk,
      mode: session.mode,
      executor,
      status: 'approved',
      args,
    })
    const invocation = await invoke(session, spec.name, args, { toolCallId: call.id, toolRunId: row.id, memo: state.memo, dryRun: false })
    return finish(session, row, spec, invocation, state, ctx.emit)
  }

  // Propuesta: se fija la cotización a la que apunta y se calcula la vista previa sin escribir.
  const bound: BoundContext = {
    ...(state.memo.quoteId ?? session.ui.quoteId ? { quoteId: state.memo.quoteId ?? session.ui.quoteId } : {}),
    ...(state.memo.lastItemId ? { lastItemId: state.memo.lastItemId } : {}),
    ...(session.ui.selectedItemId ? { selectedItemId: session.ui.selectedItemId } : {}),
    route: session.ui.route,
  }
  if (bound.quoteId && args.quoteId === undefined && args.quoteNumber === undefined && acceptsQuoteId(spec)) {
    const rebound = parseAgentToolArgs(spec.name, { ...args, quoteId: bound.quoteId })
    if (rebound.ok) args = rebound.args as Record<string, unknown>
  }
  const ui: TurnUiState = { ...session.ui, ...(bound.quoteId ? { quoteId: bound.quoteId } : {}) }
  const invocation = await invoke(session, spec.name, args, { toolCallId: call.id, memo: { ...state.memo }, dryRun: true, ui })
  if (!invocation.outcome.ok) {
    return recordFailure(session, call, state, {
      ...ctx,
      spec,
      args,
      routeError: invocation.routeError,
      error: { code: invocation.outcome.error?.code ?? 'failed', message: invocation.outcome.error?.message ?? '' },
    })
  }
  const preview: ToolPreview = invocation.outcome.preview ?? { title: invocation.outcome.summary || spec.name, lines: [] }
  const now = deps.now()
  const row = await insertToolRun(deps, {
    auth,
    assistantId: session.assistant.id,
    conversationId: session.conversation.id,
    messageId: ctx.messageId,
    toolCallId: call.id,
    tool: spec.name,
    risk: spec.risk,
    mode: session.mode,
    executor,
    status: 'proposed',
    args,
    preview,
    result: { bound },
    affected: invocation.outcome.affected?.length ? invocation.outcome.affected : null,
    expiresAt: new Date(now.getTime() + TOOL_RUN_APPROVAL_TTL_MS),
  })
  const run = toToolRun(row)
  ctx.emit({ type: 'tool.proposed', toolRun: run })
  return {
    status: 'proposed',
    run,
    summary: preview.title,
    parts: [
      toolCallPart(run, preview.title),
      { type: 'approval', toolRunId: run.id, tool: run.tool, risk: run.risk, preview, argsHash: run.argsHash, expiresAt: run.expiresAt!, status: 'pending' },
    ],
  }
}

// ── Mensajes: estado de las partes ───────────────────────────────────────────

/** Refleja el estado nuevo de una corrida en las partes del mensaje que la contiene. */
export async function syncRunParts(session: Pick<AgentSession, 'deps'>, row: Pick<ToolRunRow, 'messageId' | 'orgId'>, run: ToolRun, summary?: string) {
  if (!row.messageId) return null
  const message = await findMessage(session.deps, row.orgId, row.messageId)
  if (!message) return null
  const approval = run.status === 'proposed' ? 'pending' : run.status === 'rejected' ? 'rejected' : run.status === 'expired' ? 'expired' : 'approved'
  const parts = (message.parts ?? []).map((part): MessagePart => {
    if (part.type === 'tool_call' && part.toolRunId === run.id) return { ...part, status: run.status, ...(summary ? { summary } : {}) }
    if (part.type === 'approval' && part.toolRunId === run.id) {
      return { ...part, status: approval, ...(run.preview ? { preview: run.preview } : {}), ...(run.expiresAt ? { expiresAt: run.expiresAt } : {}) }
    }
    return part
  })
  await updateMessageParts(session.deps, message.id, parts)
  return toMessage({ ...message, parts })
}

// ── Aprobar y rechazar ───────────────────────────────────────────────────────

export interface PreparedApproval {
  row: ToolRunRow
  spec: AgentToolSpec
  args: Record<string, unknown>
  ui: TurnUiState
  memo: TurnMemo
}

/** Vence una propuesta (modo cambiado, herramienta retirada…) y la refleja en su mensaje. */
async function expireProposal(session: AgentSession, row: ToolRunRow): Promise<ToolRunRow> {
  const expired = (await transitionToolRun(session.deps, row, 'expired')) ?? row
  await syncRunParts(session, expired, toToolRun(expired))
  return expired
}

/**
 * Valida una aprobación ANTES de abrir el flujo: vigente, huella exacta, una sola vez, modo y
 * ámbito todavía permitidos, y vista previa vigente (si la cotización cambió, se actualiza la
 * tarjeta y se pide revisar de nuevo). Al final consume la propuesta (proposed → approved).
 */
/** ¿Esta persona ya aprobó y ejecutó otra propuesta del mismo mensaje? */
async function siblingApproved(session: AgentSession, row: ToolRunRow): Promise<boolean> {
  if (!row.messageId) return false
  const runs = await listConversationRuns(session.deps, session.conversation.orgId, [session.conversation.id])
  return runs.some((r) => r.id !== row.id && r.messageId === row.messageId && r.status === 'executed' && r.decidedBy === session.auth.user.id)
}

export async function prepareApproval(session: AgentSession, input: ToolRunRow, argsHash: string): Promise<PreparedApproval> {
  const { deps } = session
  let row = await expireIfStale(deps, input)
  if (row.status === 'expired') {
    await syncRunParts(session, row, toToolRun(row))
    throw apiError(409, 'approval_expired', { extra: { toolRun: toToolRun(row) } })
  }
  if (row.status !== 'proposed') throw apiError(409, 'approval_expired', { extra: { status: row.status, toolRun: toToolRun(row) } })
  if (argsHash !== row.argsHash || argsHashOf(row.tool, row.args) !== row.argsHash) throw apiError(409, 'approval_mismatch', { extra: { toolRun: toToolRun(row) } })
  if (!isAgentTool(row.tool)) {
    row = await expireProposal(session, row)
    throw apiError(409, 'approval_expired', { extra: { toolRun: toToolRun(row) } })
  }
  const spec = AGENT_TOOLS[row.tool] as AgentToolSpec
  const parsed = parseAgentToolArgs(spec.name, row.args)
  const inScope = spec.scope === 'core' || session.assistant.scopes.includes(spec.scope)
  if (!parsed.ok || !inScope || agentToolDecision(session.mode, spec) === 'deny') {
    row = await expireProposal(session, row)
    throw apiError(409, 'approval_expired', { extra: { toolRun: toToolRun(row), reason: 'mode_changed' } })
  }
  const bound = boundContextOf(row)
  const ui: TurnUiState = {
    ...session.ui,
    route: bound.route ?? session.ui.route,
    ...(bound.quoteId ? { quoteId: bound.quoteId } : {}),
    ...(bound.selectedItemId ? { selectedItemId: bound.selectedItemId } : {}),
  }
  if (!bound.quoteId) delete ui.quoteId
  if (!bound.selectedItemId) delete ui.selectedItemId
  const memo: TurnMemo = { ...(bound.quoteId ? { quoteId: bound.quoteId } : {}), ...(bound.lastItemId ? { lastItemId: bound.lastItemId } : {}) }
  const args = parsed.args as Record<string, unknown>

  // ¿Sigue valiendo lo que la persona vio? Si otra persona cambió la cotización, se refresca la tarjeta.
  const fresh = await invoke(session, spec.name, args, { toolCallId: row.toolCallId, toolRunId: row.id, memo: { ...memo }, dryRun: true, ui })
  const previewMoved = fresh.outcome.ok && fresh.outcome.preview && previewKey(fresh.outcome.preview) !== previewKey(row.preview)
  // Una lista de ventanas llega como varias propuestas del mismo mensaje: aprobar una mueve el total
  // de las demás. Eso lo causó la misma persona y es reversible, así que no se le pide revisar.
  if (previewMoved && !(row.risk === 'write' && (await siblingApproved(session, row)))) {
    const refreshed =
      (await transitionToolRun(deps, row, 'proposed', {
        preview: fresh.outcome.preview,
        expiresAt: new Date(deps.now().getTime() + TOOL_RUN_APPROVAL_TTL_MS),
      })) ?? row
    const run = toToolRun(refreshed)
    await syncRunParts(session, refreshed, run)
    throw apiError(409, 'approval_mismatch', { extra: { toolRun: run, refreshed: true } })
  }

  const approved = await transitionToolRun(deps, row, 'approved', { decidedBy: session.auth.user.id, decidedAt: deps.now(), ...(previewMoved ? { preview: fresh.outcome.preview } : {}) })
  if (!approved) {
    const [current] = await deps.db.select().from(toolRuns).where(eq(toolRuns.id, row.id)).limit(1)
    throw apiError(409, 'approval_expired', { extra: { status: current?.status ?? 'decided', ...(current ? { toolRun: toToolRun(current) } : {}) } })
  }
  return { row: approved, spec, args, ui, memo }
}

/** Ejecuta una aprobación ya consumida, guarda el resultado para el modelo y actualiza la tarjeta. */
export async function executeApproval(session: AgentSession, prepared: PreparedApproval, state: TurnState, emit: Emit): Promise<ToolCallResult> {
  state.calls++
  const invocation = await invoke(session, prepared.spec.name, prepared.args, {
    toolCallId: prepared.row.toolCallId,
    toolRunId: prepared.row.id,
    memo: state.memo,
    dryRun: false,
    ui: prepared.ui,
  })
  const result = await finish(session, prepared.row, prepared.spec, invocation, state, emit)
  if (result.modelContent) await appendMessage(session.deps, session.conversation, { role: 'tool', source: 'ai', parts: [], text: result.modelContent, toolCallId: prepared.row.toolCallId })
  const message = await syncRunParts(session, prepared.row, result.run, result.summary)
  if (message) emit({ type: 'message.done', message })
  return result
}

/** Rechazo: se consume una sola vez y el modelo recibe que la persona no quiso hacerlo. */
export async function rejectProposal(session: AgentSession, input: ToolRunRow, reason: string | undefined, emit: Emit | null): Promise<ToolRun> {
  const { deps } = session
  const row = await expireIfStale(deps, input)
  if (row.status !== 'proposed') {
    if (row.status === 'expired') await syncRunParts(session, row, toToolRun(row))
    throw apiError(409, 'approval_expired', { extra: { status: row.status, toolRun: toToolRun(row) } })
  }
  const rejected = await transitionToolRun(deps, row, 'rejected', {
    decidedBy: session.auth.user.id,
    decidedAt: deps.now(),
    ...(reason ? { error: { code: 'rejected', message: reason.slice(0, 500) } } : {}),
  })
  if (!rejected) throw apiError(409, 'approval_expired', { extra: { status: 'decided' } })
  await appendMessage(deps, session.conversation, {
    role: 'tool',
    source: 'ai',
    parts: [],
    text: toolResultForModel(row.tool, { ok: false, status: 'rejected', note: reason ? `The user rejected this action. Their reason: ${reason.slice(0, 500)}` : 'The user rejected this action.' }),
    toolCallId: row.toolCallId,
  })
  const run = toToolRun(rejected)
  const message = await syncRunParts(session, rejected, run)
  if (emit && message) emit({ type: 'message.done', message })
  return run
}

// ── Deshacer ─────────────────────────────────────────────────────────────────

/** Valor en un camino de `UndoCheck` (claves de objeto o criterio para elegir en una lista). */
function valueAt(data: unknown, path: UndoCheck['path']): unknown {
  let node: unknown = data
  for (const step of path) {
    if (node === null || node === undefined) return undefined
    if (typeof step === 'string') {
      node = typeof node === 'object' && !Array.isArray(node) ? (node as Record<string, unknown>)[step] : undefined
    } else {
      if (!Array.isArray(node)) return undefined
      node = node.find((el) => el && typeof el === 'object' && Object.entries(step).every(([k, v]) => ((el as Record<string, unknown>)[k] ?? null) === v))
    }
  }
  return node
}

/** ¿Todos los campos siguen como los dejó la acción? (ausente = null). */
export function undoChecksHold(data: unknown, checks: readonly UndoCheck[] | undefined): boolean {
  if (!Array.isArray(checks)) return false
  return checks.every((check) => Array.isArray(check?.path) && stableJson(valueAt(data, check.path) ?? null) === stableJson(check.value ?? null))
}

/** Deshace lo último que quedó hecho en esta conversación, para el «vuelve como estaba». */
async function undoLastRun(session: AgentSession): Promise<{ summary: string; affected: AffectedEntity[] } | null> {
  const runs = await listConversationRuns(session.deps, session.conversation.orgId, [session.conversation.id], 'executed')
  const last = runs.filter((run) => run.undo).at(-1)
  if (!last) return null
  const { affected } = await undoToolRun(session, last)
  return { summary: (last.result as { summary?: string } | null)?.summary ?? '', affected }
}

/**
 * Deshace una acción ejecutada con la ruta fija guardada (nunca una ruta leída como texto libre).
 * Se reclama primero (executed → undone, una sola vez); si alguien cambió la entidad después, se
 * devuelve 409 undo_conflict y la acción queda como estaba.
 */
export async function undoToolRun(session: AgentSession, row: ToolRunRow): Promise<{ toolRun: ToolRun; affected: AffectedEntity[] }> {
  const { deps, auth } = session
  const undo = row.undo as AgentUndo | null
  if (row.status !== 'executed' || !undo || (!undo.internal && !isAgentRouteKey(undo.route))) throw apiError(409, 'undo_unavailable', { extra: { toolRun: toToolRun(row) } })
  if (row.executedAt && deps.now().getTime() - row.executedAt.getTime() > UNDO_WINDOW_MS) throw apiError(409, 'undo_unavailable', { extra: { toolRun: toToolRun(row) } })
  const claimed = await transitionToolRun(deps, row, 'undone', { undoneAt: deps.now() })
  if (!claimed) throw apiError(409, 'undo_unavailable')
  const restore = async () => {
    await deps.db.update(toolRuns).set({ status: 'executed', undoneAt: null, updatedAt: deps.now() }).where(eq(toolRuns.id, row.id))
  }
  const meta = { assistantId: session.assistant.id, assistantName: session.assistant.name, conversationId: row.conversationId ?? undefined, toolRunId: row.id, toolCallId: row.toolCallId, tool: row.tool }
  try {
    if (undo.internal) {
      try {
        if (undo.internal.kind === 'memory_delete') await deleteMemory(deps, auth, session.viewer, undo.internal.id)
        else await restoreMemory(deps, auth, session.viewer, undo.internal.id)
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) throw apiError(409, 'undo_conflict')
        throw error
      }
    } else {
      const route = undo.route!
      if (undo.guard && isAgentRouteKey(undo.guard.route)) {
        const current = await dispatch<Record<string, unknown>>(deps, session.actor, AGENT_ROUTES[undo.guard.route], { params: undo.guard.params }, meta)
        if (!current.ok || current.data?.[undo.guard.field] !== undo.guard.value) {
          throw apiError(409, 'undo_conflict', { extra: { current: current.ok ? current.data?.[undo.guard.field] : null } })
        }
      }
      if (undo.expect && isAgentRouteKey(undo.expect.route)) {
        const current = await dispatch<unknown>(
          deps,
          session.actor,
          AGENT_ROUTES[undo.expect.route],
          { ...(undo.expect.params ? { params: undo.expect.params } : {}), ...(undo.expect.query ? { query: undo.expect.query } : {}) },
          meta,
        )
        // Si no se puede leer el estado actual, no se arriesga a pisar nada.
        if (!current.ok || !undoChecksHold(current.data, undo.expect.checks)) throw apiError(409, 'undo_conflict')
      }
      const res = await dispatch(deps, session.actor, AGENT_ROUTES[route], { ...(undo.params ? { params: undo.params } : {}), ...(undo.body !== undefined ? { body: undo.body } : {}) }, meta)
      if (!res.ok) {
        if (res.status === 409 || res.error?.code === 'version_conflict' || res.status === 404) throw apiError(409, 'undo_conflict')
        throw new HttpError(res.status === 402 || res.status === 403 ? res.status : 400, res.error?.code ?? 'undo_failed', res.error?.message || 'No se pudo deshacer.')
      }
      for (const step of undo.then ?? []) {
        if (!isAgentRouteKey(step.route)) continue
        if (step.onlyIf) {
          if (!isAgentRouteKey(step.onlyIf.route)) continue
          const state = await dispatch<unknown>(deps, session.actor, AGENT_ROUTES[step.onlyIf.route], step.onlyIf.params ? { params: step.onlyIf.params } : {}, meta)
          if (!state.ok || !undoChecksHold(state.data, step.onlyIf.checks)) continue
        }
        const extra = await dispatch(deps, session.actor, AGENT_ROUTES[step.route], { ...(step.params ? { params: step.params } : {}), ...(step.body !== undefined ? { body: step.body } : {}) }, meta)
        if (!extra.ok) deps.logger.warn(`asistente: paso extra al deshacer ${row.tool} no se completó (${extra.status})`)
      }
    }
  } catch (error) {
    await restore()
    throw error
  }
  const run = toToolRun(claimed)
  const summary = (row.result as { summary?: string } | null)?.summary
  await syncRunParts(session, claimed, run)
  if (summary) {
    await appendMessage(deps, session.conversation, { role: 'system_note', source: 'system', parts: [{ type: 'notice', level: 'info', code: 'undone', text: session.text.t('note.undone', { summary }) }] })
  }
  const affected = (row.affected ?? (undo.entity ? [undo.entity] : [])).map(({ type, id }) => ({ type, ...(id ? { id } : {}) }))
  return { toolRun: run, affected }
}
