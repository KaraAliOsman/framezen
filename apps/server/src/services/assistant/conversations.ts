/**
 * Conversaciones y mensajes del asistente (el servidor es la fuente de verdad del historial).
 *
 * - Privadas de cada persona; búsqueda por título y texto (sin tildes), fijadas, renombrar, borrar
 *   con deshacer y retomar.
 * - Cada mensaje lleva un `seq` monotónico (contador atómico de la conversación).
 * - `historyForModel` arma el historial para el proveedor: reenvía el `reasoning_content` de cada
 *   respuesta (con razonamiento activo, varios proveedores responden 400 si falta) y garantiza que toda llamada a herramienta tenga su
 *   resultado justo después (los pendientes de aprobación se describen según su estado).
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import {
  messageText,
  type AssistantMode,
  type Conversation,
  type ConversationContext,
  type ConversationSummary,
  type Message,
  type MessagePart,
  type MessageRole,
  type MessageSource,
} from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { publicParts, recentAttachmentRows, userMessageParam } from './attachments'
import type { Db } from '../../db/client'
import { conversations, messages, toolRuns, type StoredToolCall } from '../../db/schema'
import { newId } from '../../lib/crypto'
import { notFound } from '../../lib/errors'
import { folded } from '../../lib/http'
import type { ChatMessageParam } from '../ai/client'

export type ConversationRow = typeof conversations.$inferSelect
export type MessageRow = typeof messages.$inferSelect

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    ...(row.assistantId ? { assistantId: row.assistantId } : {}),
    title: row.title,
    titleSource: row.titleSource,
    mode: row.mode,
    pinned: row.pinned,
    context: row.context ?? {},
    messageCount: row.messageCount,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    seq: row.seq,
    role: row.role,
    source: row.source,
    parts: publicParts(row.parts ?? []),
    createdAt: row.createdAt.toISOString(),
    ...(row.credits ? { credits: row.credits } : {}),
    ...(row.model ? { model: row.model } : {}),
  }
}

/** Título determinista (sin IA): el primer pedido, recortado. */
export function autoTitle(text: string): string {
  const first = text.replace(/\s+/g, ' ').trim()
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first
}

export async function createConversation(
  deps: Pick<AppDeps, 'db' | 'now'>,
  auth: AuthContext,
  input: { assistantId: string; mode: AssistantMode; context: ConversationContext; title: string },
): Promise<ConversationRow> {
  const now = deps.now()
  const [row] = await deps.db
    .insert(conversations)
    .values({
      id: newId(),
      orgId: auth.org.id,
      userId: auth.user.id,
      assistantId: input.assistantId,
      title: input.title,
      titleSource: 'auto',
      mode: input.mode,
      context: input.context,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    })
    .returning()
  return row!
}

/** Conversación propia (no borrada, salvo que se pida). */
export async function findConversation(deps: Pick<AppDeps, 'db'>, auth: AuthContext, id: string, options: { includeDeleted?: boolean } = {}): Promise<ConversationRow | undefined> {
  const [row] = await deps.db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.orgId, auth.org.id),
        eq(conversations.userId, auth.user.id),
        ...(options.includeDeleted ? [] : [isNull(conversations.deletedAt)]),
      ),
    )
    .limit(1)
  return row
}

export async function requireConversation(deps: Pick<AppDeps, 'db'>, auth: AuthContext, id: string): Promise<ConversationRow> {
  const row = await findConversation(deps, auth, id)
  if (!row) throw notFound('No encontramos esa conversación. Puede que la hayas borrado.')
  return row
}

export interface NewMessage {
  role: MessageRole
  source: MessageSource
  parts: MessagePart[]
  /** Texto plano (búsqueda) o, en mensajes 'tool', el resultado para el modelo. */
  text?: string
  reasoning?: string | null
  toolCalls?: StoredToolCall[] | null
  toolCallId?: string | null
  model?: string | null
  credits?: number
  tokens?: { in?: number; cached?: number; out?: number }
  id?: string
}

/** Agrega un mensaje con el siguiente `seq` (contador atómico; seguro con pedidos simultáneos). */
export async function appendMessage(deps: Pick<AppDeps, 'db' | 'now'>, conversation: Pick<ConversationRow, 'id' | 'orgId'>, input: NewMessage): Promise<MessageRow> {
  return deps.db.transaction(async (raw) => {
    const tx = raw as unknown as Db
    const now = deps.now()
    const [counter] = await tx
      .update(conversations)
      .set({ messageCount: sql`${conversations.messageCount} + 1`, lastMessageAt: now, updatedAt: now })
      .where(eq(conversations.id, conversation.id))
      .returning({ seq: conversations.messageCount })
    const [row] = await tx
      .insert(messages)
      .values({
        id: input.id ?? newId(),
        orgId: conversation.orgId,
        conversationId: conversation.id,
        seq: counter!.seq,
        role: input.role,
        source: input.source,
        parts: input.parts,
        text: (input.text ?? messageText(input.parts)).slice(0, 20_000),
        reasoning: input.reasoning ?? null,
        toolCalls: input.toolCalls ?? null,
        toolCallId: input.toolCallId ?? null,
        model: input.model ?? null,
        credits: input.credits ?? 0,
        tokensIn: input.tokens?.in ?? null,
        tokensCached: input.tokens?.cached ?? null,
        tokensOut: input.tokens?.out ?? null,
        createdAt: now,
      })
      .returning()
    return row!
  })
}

export async function updateMessageParts(deps: Pick<AppDeps, 'db'>, id: string, parts: MessagePart[]): Promise<void> {
  await deps.db.update(messages).set({ parts, text: messageText(parts).slice(0, 20_000) }).where(eq(messages.id, id))
}

// ── Listas ───────────────────────────────────────────────────────────────────

/** Posición en el orden de la lista (fijadas primero, luego la más reciente). */
interface Cursor {
  at: string
  id: string
  pinned?: boolean
}

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')
function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor
    return typeof parsed.at === 'string' && typeof parsed.id === 'string' && !Number.isNaN(Date.parse(parsed.at)) ? parsed : null
  } catch {
    return null
  }
}

export async function listConversations(
  deps: Pick<AppDeps, 'db'>,
  auth: AuthContext,
  query: { q?: string; assistantId?: string; pinned?: boolean; cursor?: string; limit?: number },
): Promise<{ items: ConversationSummary[]; nextCursor?: string }> {
  const limit = Math.min(100, Math.max(1, query.limit ?? 30))
  const conditions: SQL[] = [eq(conversations.orgId, auth.org.id), eq(conversations.userId, auth.user.id), isNull(conversations.deletedAt)]
  if (query.assistantId) conditions.push(eq(conversations.assistantId, query.assistantId))
  if (query.pinned) conditions.push(eq(conversations.pinned, true))
  const cursor = decodeCursor(query.cursor)
  if (cursor) {
    const at = new Date(cursor.at)
    const after = or(lt(conversations.lastMessageAt, at), and(eq(conversations.lastMessageAt, at), lt(conversations.id, cursor.id)))!
    // Orden: pinned desc, lastMessageAt desc, id desc. Después de una fijada vienen el resto de
    // las fijadas (más antiguas) y todas las no fijadas; después de una no fijada, solo no fijadas.
    conditions.push(
      cursor.pinned === undefined
        ? after
        : cursor.pinned
          ? or(eq(conversations.pinned, false), and(eq(conversations.pinned, true), after))!
          : and(eq(conversations.pinned, false), after)!,
    )
  }
  const q = query.q?.trim()
  let snippets = new Map<string, string>()
  if (q) {
    // Coincidencias en el texto de los mensajes (solo de la persona y del asistente).
    const hits = await deps.db
      .select({ conversationId: messages.conversationId, text: messages.text })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(messages.orgId, auth.org.id),
          eq(conversations.userId, auth.user.id),
          isNull(conversations.deletedAt),
          inArray(messages.role, ['user', 'assistant']),
          folded(messages.text, q),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(200)
    snippets = new Map()
    for (const hit of hits) if (!snippets.has(hit.conversationId)) snippets.set(hit.conversationId, snippetOf(hit.text, q))
    const ids = [...snippets.keys()]
    conditions.push(ids.length ? or(folded(conversations.title, q), inArray(conversations.id, ids))! : folded(conversations.title, q))
  }
  const rows = await deps.db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.pinned), desc(conversations.lastMessageAt), desc(conversations.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    items: page.map((r) => ({ ...toConversation(r), ...(snippets.get(r.id) ? { snippet: snippets.get(r.id) } : {}) })),
    ...(rows.length > limit && last ? { nextCursor: encodeCursor({ at: last.lastMessageAt.toISOString(), id: last.id, pinned: last.pinned }) } : {}),
  }
}

function snippetOf(text: string, q: string): string {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const index = fold(text).indexOf(fold(q))
  const start = Math.max(0, index - 40)
  const out = text.slice(start, start + 140).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${out}${start + 140 < text.length ? '…' : ''}`
}

/** Mensajes visibles (persona, asistente, notas), en orden ascendente. Los 'tool' son internos. */
export async function messagePage(deps: Pick<AppDeps, 'db'>, conversation: ConversationRow, query: { before?: number; limit?: number }): Promise<{ messages: Message[]; hasMoreBefore: boolean }> {
  const limit = Math.min(200, Math.max(1, query.limit ?? 50))
  const rows = await deps.db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.orgId, conversation.orgId),
        eq(messages.conversationId, conversation.id),
        inArray(messages.role, ['user', 'assistant', 'system_note']),
        ...(query.before ? [lt(messages.seq, query.before)] : []),
      ),
    )
    .orderBy(desc(messages.seq))
    .limit(limit + 1)
  return { messages: rows.slice(0, limit).reverse().map(toMessage), hasMoreBefore: rows.length > limit }
}

export async function softDeleteConversation(deps: Pick<AppDeps, 'db' | 'now'>, conversation: ConversationRow): Promise<void> {
  const now = deps.now()
  await deps.db.update(conversations).set({ deletedAt: now, updatedAt: now }).where(eq(conversations.id, conversation.id))
  // Las propuestas pendientes de una conversación borrada ya no se pueden aprobar.
  await deps.db
    .update(toolRuns)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(toolRuns.orgId, conversation.orgId), eq(toolRuns.conversationId, conversation.id), eq(toolRuns.status, 'proposed')))
}

export async function restoreConversation(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, id: string): Promise<ConversationRow> {
  const row = await findConversation(deps, auth, id, { includeDeleted: true })
  if (!row || !row.deletedAt) throw notFound('Esa conversación no está borrada.')
  const [restored] = await deps.db.update(conversations).set({ deletedAt: null, updatedAt: deps.now() }).where(eq(conversations.id, row.id)).returning()
  return restored!
}

// ── Historial para el modelo ─────────────────────────────────────────────────

/**
 * Presupuesto del historial en caracteres (≈ 14k tokens). Lo que importa es que el recorte no se
 * mueva en cada turno: cortar lo más antiguo cambia el prefijo y el proveedor vuelve a cobrar el
 * historial entero sin caché. Por eso se corta a saltos (`HISTORY_TRIM_STEP`, `HISTORY_ROW_STEP`).
 */
export const HISTORY_CHAR_BUDGET = 96_000
const HISTORY_TRIM_STEP = 16_000
const HISTORY_ROWS = 240
const HISTORY_ROW_STEP = 60
const TOOL_CONTENT_MAX = 8000
/**
 * Turnos recientes que se envían completos, con herramientas y razonamiento. Los anteriores se
 * resumen en lo que se hizo: pesan mucho menos y así caben muchos más. El borde se mueve a saltos
 * para no romper la caché del proveedor.
 */
const FULL_TURNS = 8
const FULL_TURNS_STEP = 4

/** Frase que cada herramienta dejó para la persona (o el error), sacada de su resultado. */
function toolOutcomeLine(name: string, text: string | undefined): string {
  const summary = text ? /"summary":"((?:[^"\\]|\\.)*)"/.exec(text)?.[1] : undefined
  if (summary) return summary.replace(/\\"/g, '"')
  const failure = text ? /"message":"((?:[^"\\]|\\.)*)"/.exec(text)?.[1] : undefined
  return failure ? `${name} failed: ${failure.replace(/\\"/g, '"')}` : `${name} was not completed`
}

function sizeOf(m: ChatMessageParam): number {
  const content = typeof m.content === 'string' ? m.content.length : Array.isArray(m.content) ? m.content.reduce((n, part) => n + (part.type === 'text' ? part.text.length : 1000), 0) : 0
  if (m.role === 'assistant') return content + (m.reasoning_content?.length ?? 0) + (m.tool_calls ?? []).reduce((n, c) => n + c.function.arguments.length + 40, 0)
  return content
}

/**
 * Historial de la conversación para el proveedor, acotado por presupuesto y empezando siempre en
 * un mensaje de la persona. Los turnos recientes llevan su razonamiento original; los antiguos
 * quedan como texto con lo que se hizo, para que no se pierda el hilo.
 */
export async function historyForModel(deps: Pick<AppDeps, 'db'>, conversation: Pick<ConversationRow, 'id' | 'orgId'>, budget = HISTORY_CHAR_BUDGET): Promise<ChatMessageParam[]> {
  const all = (
    await deps.db
      .select()
      .from(messages)
      .where(and(eq(messages.orgId, conversation.orgId), eq(messages.conversationId, conversation.id)))
      .orderBy(desc(messages.seq))
      .limit(HISTORY_ROWS + HISTORY_ROW_STEP)
  ).reverse()
  const lastSeq = all.at(-1)?.seq ?? 0
  const firstSeq = Math.floor(Math.max(0, lastSeq - HISTORY_ROWS) / HISTORY_ROW_STEP) * HISTORY_ROW_STEP
  const rows = all.filter((r) => r.seq > firstSeq)
  const toolRows = new Map<string, MessageRow>()
  for (const r of rows) if (r.role === 'tool' && r.toolCallId) toolRows.set(r.toolCallId, r)
  const pendingIds = rows.flatMap((r) => (r.role === 'assistant' ? (r.toolCalls ?? []).map((c) => c.id) : [])).filter((id) => !toolRows.has(id))
  const runStatus = new Map<string, string>()
  if (pendingIds.length) {
    const runs = await deps.db
      .select({ toolCallId: toolRuns.toolCallId, status: toolRuns.status })
      .from(toolRuns)
      .where(and(eq(toolRuns.orgId, conversation.orgId), inArray(toolRuns.toolCallId, pendingIds)))
    for (const r of runs) runStatus.set(r.toolCallId, r.status)
  }
  // Grupos que empiezan en un mensaje de la persona (nunca se corta un bucle de herramientas).
  const groups: ChatMessageParam[][] = []
  const keepFiles = recentAttachmentRows(rows)
  const turns = rows.filter((r) => r.role === 'user').length
  const oldTurns = Math.floor(Math.max(0, turns - FULL_TURNS) / FULL_TURNS_STEP) * FULL_TURNS_STEP
  let turn = 0
  for (const r of rows) {
    if (r.role === 'tool') continue
    if (r.role === 'user') turn++
    if (r.role === 'user' || r.role === 'system_note' || !groups.length) groups.push([])
    const group = groups[groups.length - 1]!
    if (r.role === 'user') group.push(userMessageParam(r.text.slice(0, 8000), r.parts ?? [], keepFiles.has(r.id)))
    else if (r.role === 'system_note') group.push({ role: 'user', content: `[DEKOPEN app event, not written by the user] ${r.text.slice(0, 1000)}` })
    else {
      const calls = r.toolCalls ?? []
      // Turnos locales (sin modelo): su texto visible + lo que hicieron, como respuesta simple.
      // Avisos del sistema (sin IA, límites) no van al modelo.
      const visible =
        r.source === 'local'
          ? messageText((r.parts ?? []).filter((p) => p.type !== 'notice' && p.type !== 'approval'))
          : messageText((r.parts ?? []).filter((p) => p.type === 'text'))
      if (!visible && !calls.length) continue
      // Sin su razonamiento una llamada no se puede reenviar con el razonamiento activo: queda como relato.
      if (turn <= oldTurns || (calls.length && !r.reasoning)) {
        const done = calls.map((call) => toolOutcomeLine(call.name, toolRows.get(call.id)?.text))
        const body = [visible, ...(done.length ? [`[Done in the app: ${done.join(' · ')}]`] : [])].filter(Boolean).join('\n')
        group.push({ role: 'assistant', content: body })
        continue
      }
      group.push({
        role: 'assistant',
        content: visible,
        ...(r.reasoning ? { reasoning_content: r.reasoning } : {}),
        ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments || '{}' } })) } : {}),
      })
      for (const call of calls) {
        const result = toolRows.get(call.id)
        group.push({ role: 'tool', tool_call_id: call.id, content: (result?.text || syntheticResult(runStatus.get(call.id))).slice(0, TOOL_CONTENT_MAX) })
      }
    }
  }
  // Lo más antiguo sale a saltos: mientras el exceso no cruce un escalón, el corte no se mueve.
  const sizes = groups.map((group) => group.reduce((n, m) => n + sizeOf(m), 0))
  const total = sizes.reduce((n, size) => n + size, 0)
  const step = Math.min(HISTORY_TRIM_STEP, Math.max(1, Math.round(budget / 3)))
  const excess = total > budget ? Math.ceil((total - budget) / step) * step : 0
  let start = 0
  for (let dropped = 0; dropped < excess && start < groups.length - 1; start++) dropped += sizes[start]!
  const flat = groups.slice(start).flat()
  while (flat.length && flat[0]!.role !== 'user') flat.shift()
  return flat
}

function syntheticResult(status: string | undefined): string {
  switch (status) {
    case 'proposed':
      return JSON.stringify({ ok: false, status: 'pending_approval', note: 'Waiting for the user to approve or reject it on the approval card.' })
    case 'rejected':
      return JSON.stringify({ ok: false, status: 'rejected', note: 'The user rejected this action.' })
    case 'expired':
      return JSON.stringify({ ok: false, status: 'expired', note: 'The proposal expired without approval.' })
    default:
      return JSON.stringify({ ok: false, status: 'not_executed', note: 'This call was not executed.' })
  }
}

/** Lo último conversado con esta persona en otras conversaciones, para retomar sin repetir. */
export async function recentConversationNotes(deps: Pick<AppDeps, 'db'>, auth: AuthContext, currentId: string): Promise<{ title: string; when: string; summary: string }[]> {
  const rows = await deps.db
    .select({ id: conversations.id, title: conversations.title, summary: conversations.summary, lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .where(and(eq(conversations.orgId, auth.org.id), eq(conversations.userId, auth.user.id), isNull(conversations.deletedAt), sql`${conversations.summary} <> ''`))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(5)
  return rows
    .filter((r) => r.id !== currentId)
    .slice(0, 4)
    .map((r) => ({ title: r.title, when: r.lastMessageAt.toISOString().slice(0, 10), summary: r.summary }))
}

/** Búsqueda en conversaciones anteriores de esta persona. */
export async function searchPastConversations(deps: Pick<AppDeps, 'db'>, auth: AuthContext, query: string, currentId: string) {
  const { items } = await listConversations(deps, auth, { q: query, limit: 8 })
  return items
    .filter((c) => c.id !== currentId)
    .map((c) => ({ title: c.title, when: c.lastMessageAt.slice(0, 10), ...(c.snippet ? { excerpt: c.snippet } : {}) }))
}

/** Propuestas pendientes (no vencidas) de una conversación. */
export async function pendingProposals(deps: Pick<AppDeps, 'db'>, conversation: Pick<ConversationRow, 'id' | 'orgId'>, messageId?: string) {
  return deps.db
    .select()
    .from(toolRuns)
    .where(
      and(
        eq(toolRuns.orgId, conversation.orgId),
        eq(toolRuns.conversationId, conversation.id),
        eq(toolRuns.status, 'proposed'),
        ...(messageId ? [eq(toolRuns.messageId, messageId)] : []),
        isNotNull(toolRuns.expiresAt),
      ),
    )
    .orderBy(asc(toolRuns.createdAt))
}

/** Mensaje de una conversación (siempre filtrado por organización). */
export async function findMessage(deps: Pick<AppDeps, 'db'>, orgId: string, id: string): Promise<MessageRow | undefined> {
  const [row] = await deps.db.select().from(messages).where(and(eq(messages.orgId, orgId), eq(messages.id, id))).limit(1)
  return row
}

/**
 * Cambia el modo de la conversación. Bajar a Chat invalida las propuestas pendientes (ya no se
 * pueden aprobar); subir de modo nunca ejecuta propuestas viejas sin un clic nuevo.
 */
export async function setConversationMode(deps: Pick<AppDeps, 'db' | 'now'>, conversation: ConversationRow, mode: AssistantMode): Promise<ConversationRow> {
  if (conversation.mode === mode) return conversation
  const now = deps.now()
  const [row] = await deps.db.update(conversations).set({ mode, updatedAt: now }).where(eq(conversations.id, conversation.id)).returning()
  if (mode === 'chat') {
    await deps.db
      .update(toolRuns)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(toolRuns.orgId, conversation.orgId), eq(toolRuns.conversationId, conversation.id), eq(toolRuns.status, 'proposed')))
  }
  return row ?? conversation
}

/** Renombrar, fijar o cambiar el modo (PATCH conversations/:id). */
export async function patchConversation(
  deps: Pick<AppDeps, 'db' | 'now'>,
  conversation: ConversationRow,
  patch: { title?: string; pinned?: boolean; mode?: AssistantMode },
): Promise<ConversationRow> {
  let row = conversation
  if (patch.mode !== undefined) row = await setConversationMode(deps, row, patch.mode)
  if (patch.title !== undefined || patch.pinned !== undefined) {
    const [updated] = await deps.db
      .update(conversations)
      .set({
        ...(patch.title !== undefined ? { title: patch.title.replace(/\s+/g, ' ').trim().slice(0, 120), titleSource: 'user' as const } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        updatedAt: deps.now(),
      })
      .where(eq(conversations.id, row.id))
      .returning()
    row = updated ?? row
  }
  return row
}

/** Guarda el contexto de pantalla más reciente (ruta y cotización) de la conversación. */
export async function touchConversationContext(deps: Pick<AppDeps, 'db'>, conversation: ConversationRow, context: ConversationContext): Promise<void> {
  const next = { ...conversation.context, ...context }
  if (JSON.stringify(next) === JSON.stringify(conversation.context ?? {})) return
  await deps.db.update(conversations).set({ context: next }).where(eq(conversations.id, conversation.id))
  conversation.context = next
}
