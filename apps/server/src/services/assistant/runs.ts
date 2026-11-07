/**
 * Registro de herramientas (`tool_runs`): auditoría de cada llamada (propuesta, aprobada,
 * rechazada, ejecutada, fallida, deshecha, vencida), huella de argumentos contra cambios y
 * repeticiones, y datos para deshacer. Todo filtrado por organización; las acciones sobre una
 * corrida exigen que la conversación sea de quien pide.
 */
import { createHash } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  canTransitionToolRun,
  type AffectedEntity,
  type AssistantMode,
  type ToolError,
  type ToolExecutor,
  type ToolPreview,
  type ToolRisk,
  type ToolRun,
  type ToolRunStatus,
} from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { conversations, toolRuns } from '../../db/schema'
import { newId } from '../../lib/crypto'
import type { AgentUndo } from './tools/types'

export type ToolRunRow = typeof toolRuns.$inferSelect

/** JSON estable (claves ordenadas) para que la huella no dependa del orden. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** Huella de herramienta + argumentos normalizados (lo que la persona aprueba). */
export function argsHashOf(tool: string, args: unknown): string {
  return createHash('sha256').update(`${tool}\n${stableJson(args)}`).digest('hex').slice(0, 40)
}

const RESULT_VISIBLE = new Set<ToolRunStatus>(['executed', 'failed', 'undone'])

/**
 * Contexto que una propuesta deja fijado al crearse (cotización e ítem a los que apuntaba). Al
 * aprobar se usa ESTE contexto, no lo que la persona tenga abierto en ese momento: lo que se
 * ejecuta es exactamente lo que se previsualizó.
 */
export interface BoundContext {
  quoteId?: string
  lastItemId?: string
  selectedItemId?: string
  route?: string
}

export function boundContextOf(row: Pick<ToolRunRow, 'result' | 'status'>): BoundContext {
  if (row.status !== 'proposed' && row.status !== 'approved') return {}
  const bound = (row.result as { bound?: BoundContext } | null)?.bound
  if (!bound || typeof bound !== 'object') return {}
  const pick = (v: unknown) => (typeof v === 'string' && v.length <= 300 ? v : undefined)
  return {
    ...(pick(bound.quoteId) ? { quoteId: pick(bound.quoteId) } : {}),
    ...(pick(bound.lastItemId) ? { lastItemId: pick(bound.lastItemId) } : {}),
    ...(pick(bound.selectedItemId) ? { selectedItemId: pick(bound.selectedItemId) } : {}),
    ...(pick(bound.route) ? { route: pick(bound.route) } : {}),
  }
}

export function toToolRun(row: ToolRunRow): ToolRun {
  const undo = row.undo as AgentUndo | null
  return {
    id: row.id,
    ...(row.conversationId ? { conversationId: row.conversationId } : {}),
    ...(row.assistantId ? { assistantId: row.assistantId } : {}),
    ...(row.messageId ? { messageId: row.messageId } : {}),
    toolCallId: row.toolCallId,
    tool: row.tool,
    risk: row.risk,
    mode: row.mode,
    executor: row.executor,
    status: row.status,
    args: row.args ?? {},
    argsHash: row.argsHash,
    ...(row.preview ? { preview: row.preview } : {}),
    // Mientras está propuesta (o si no se ejecutó), `result` guarda el contexto ligado (interno).
    ...(row.result !== null && row.result !== undefined && RESULT_VISIBLE.has(row.status) ? { result: row.result } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.affected ? { affected: row.affected } : {}),
    undoable: row.status === 'executed' && Boolean(undo && (undo.route || undo.internal)),
    ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
    ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
    ...(row.executedAt ? { executedAt: row.executedAt.toISOString() } : {}),
    ...(row.undoneAt ? { undoneAt: row.undoneAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
  }
}

export interface NewToolRun {
  id?: string
  auth: Pick<AuthContext, 'org' | 'user'>
  assistantId: string
  conversationId: string
  messageId?: string | null
  toolCallId: string
  tool: string
  risk: ToolRisk
  mode: AssistantMode
  executor: ToolExecutor
  status: ToolRunStatus
  args: Record<string, unknown>
  preview?: ToolPreview | null
  result?: unknown
  error?: ToolError | null
  undo?: AgentUndo | null
  affected?: AffectedEntity[] | null
  expiresAt?: Date | null
  executedAt?: Date | null
}

export async function insertToolRun(deps: Pick<AppDeps, 'db' | 'now'>, input: NewToolRun): Promise<ToolRunRow> {
  const now = deps.now()
  const [row] = await deps.db
    .insert(toolRuns)
    .values({
      id: input.id ?? newId(),
      orgId: input.auth.org.id,
      userId: input.auth.user.id,
      assistantId: input.assistantId,
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      toolCallId: input.toolCallId,
      tool: input.tool,
      risk: input.risk,
      mode: input.mode,
      executor: input.executor,
      status: input.status,
      args: input.args,
      argsHash: argsHashOf(input.tool, input.args),
      preview: input.preview ?? null,
      result: input.result ?? null,
      error: input.error ?? null,
      undo: input.undo ?? null,
      affected: input.affected ?? null,
      expiresAt: input.expiresAt ?? null,
      executedAt: input.executedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row!
}

/**
 * Cambia el estado solo si la transición es válida y el estado actual es el esperado (una
 * aprobación se consume una sola vez aunque lleguen dos pedidos a la vez).
 */
export async function transitionToolRun(
  deps: Pick<AppDeps, 'db' | 'now'>,
  row: ToolRunRow,
  to: ToolRunStatus,
  patch: Partial<Pick<ToolRunRow, 'result' | 'error' | 'undo' | 'affected' | 'preview' | 'decidedBy' | 'decidedAt' | 'executedAt' | 'undoneAt' | 'expiresAt'>> = {},
): Promise<ToolRunRow | null> {
  if (!canTransitionToolRun(row.status, to) && !(row.status === to && to === 'proposed')) return null
  const [updated] = await deps.db
    .update(toolRuns)
    .set({ status: to, ...patch, updatedAt: deps.now() })
    .where(and(eq(toolRuns.id, row.id), eq(toolRuns.orgId, row.orgId), eq(toolRuns.status, row.status)))
    .returning()
  return updated ?? null
}

/** Corrida de una conversación de quien pide (otra persona u organización → no existe). */
export async function findOwnToolRun(deps: Pick<AppDeps, 'db'>, auth: Pick<AuthContext, 'org' | 'user'>, id: string): Promise<ToolRunRow | undefined> {
  const [row] = await deps.db
    .select({ run: toolRuns })
    .from(toolRuns)
    .innerJoin(conversations, eq(conversations.id, toolRuns.conversationId))
    .where(and(eq(toolRuns.id, id), eq(toolRuns.orgId, auth.org.id), eq(conversations.userId, auth.user.id), eq(conversations.orgId, auth.org.id)))
    .limit(1)
  return row?.run
}

export async function listConversationRuns(deps: Pick<AppDeps, 'db'>, orgId: string, conversationIds: string[], status?: ToolRunStatus): Promise<ToolRunRow[]> {
  if (!conversationIds.length) return []
  return deps.db
    .select()
    .from(toolRuns)
    .where(and(eq(toolRuns.orgId, orgId), inArray(toolRuns.conversationId, conversationIds), ...(status ? [eq(toolRuns.status, status)] : [])))
    .orderBy(toolRuns.createdAt)
    .limit(500)
}

/** Vence una propuesta si pasó su plazo (perezoso: al leerla o al intentar aprobarla). */
export async function expireIfStale(deps: Pick<AppDeps, 'db' | 'now'>, row: ToolRunRow): Promise<ToolRunRow> {
  if (row.status !== 'proposed' || !row.expiresAt || row.expiresAt > deps.now()) return row
  return (await transitionToolRun(deps, row, 'expired')) ?? row
}

/** Corridas de las conversaciones de quien pide (todas o de una), más recientes primero. */
export async function listOwnToolRuns(
  deps: Pick<AppDeps, 'db' | 'now'>,
  auth: Pick<AuthContext, 'org' | 'user'>,
  query: { conversationId?: string; status?: ToolRunStatus; limit?: number } = {},
): Promise<ToolRunRow[]> {
  const rows = await deps.db
    .select({ run: toolRuns })
    .from(toolRuns)
    .innerJoin(conversations, eq(conversations.id, toolRuns.conversationId))
    .where(
      and(
        eq(toolRuns.orgId, auth.org.id),
        eq(conversations.orgId, auth.org.id),
        eq(conversations.userId, auth.user.id),
        ...(query.conversationId ? [eq(toolRuns.conversationId, query.conversationId)] : []),
        ...(query.status && query.status !== 'expired' && query.status !== 'proposed' ? [eq(toolRuns.status, query.status)] : []),
        ...(query.status === 'proposed' || query.status === 'expired' ? [inArray(toolRuns.status, ['proposed', 'expired'])] : []),
      ),
    )
    .orderBy(desc(toolRuns.createdAt))
    .limit(Math.min(500, Math.max(1, query.limit ?? 200)))
  // Las propuestas vencidas se marcan al leerlas (perezoso) y luego se filtra por el estado pedido.
  const fresh = await Promise.all(rows.map((r) => expireIfStale(deps, r.run)))
  return query.status ? fresh.filter((r) => r.status === query.status) : fresh
}
