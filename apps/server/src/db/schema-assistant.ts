/**
 * Asistente v2 (migración 0005_assistant_v2): asistentes, conversaciones, mensajes, memoria y
 * registro de herramientas. Se reexporta desde schema.ts. Todo lleva org_id y se filtra SIEMPRE
 * por la organización de la sesión; los índices empiezan por org_id.
 *
 * `messages.reasoning` guarda el reasoning_content del modelo para reenviarlo (si falta, la API
 * responde 400). Es interno: nunca se devuelve por la API ni se muestra.
 */
import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type {
  AffectedEntity,
  AssistantLanguage,
  AssistantMode,
  AssistantPersonality,
  AvatarSpec,
  ConversationContext,
  MemoryKind,
  MemoryScope,
  MemorySource,
  MessagePart,
  MessageRole,
  MessageSource,
  ToolError,
  ToolExecutor,
  ToolPreview,
  ToolRisk,
  ToolRunStatus,
  ToolScope,
} from '@dekopen/shared'
import { orgs, users } from './schema'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()
const updatedAt = () => ts('updated_at').notNull().defaultNow()

/** Llamada a herramienta tal como la pidió el modelo (formato del proveedor, para reenviarla). */
export interface StoredToolCall {
  id: string
  name: string
  /** JSON en texto, tal cual lo envió el modelo. */
  arguments: string
}

/** Datos para deshacer una acción: snapshot previo + versión (con verificación de conflicto). */
export interface ToolUndoData {
  /** Ruta fija que deshace (p. ej. PUT /api/quotes/:id con el snapshot anterior). */
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
  /** Versión esperada de la entidad tras la acción (si cambió, hay conflicto). */
  expectedVersion?: number
  entity?: AffectedEntity
  [key: string]: unknown
}

export const assistants = pgTable(
  'assistants',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    /** Dueño de un asistente privado; null = compartido con toda la empresa. */
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    avatar: jsonb('avatar').$type<AvatarSpec>().notNull().default(sql`'{}'::jsonb`),
    personality: jsonb('personality').$type<AssistantPersonality>().notNull().default(sql`'{}'::jsonb`),
    defaultMode: text('default_mode').$type<AssistantMode>().notNull().default('supervised'),
    scopes: jsonb('scopes').$type<ToolScope[]>().notNull().default(sql`'[]'::jsonb`),
    language: text('language').$type<AssistantLanguage>().notNull().default('auto'),
    memoryEnabled: boolean('memory_enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts('archived_at'),
  },
  (t) => [index('assistants_org_owner_idx').on(t.orgId, t.ownerUserId), index('assistants_org_created_idx').on(t.orgId, t.createdAt)],
)

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    /** Las conversaciones son privadas de cada persona. */
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    assistantId: text('assistant_id').references(() => assistants.id, { onDelete: 'set null' }),
    title: text('title').notNull().default(''),
    titleSource: text('title_source').$type<'auto' | 'user'>().notNull().default('auto'),
    mode: text('mode').$type<AssistantMode>().notNull().default('supervised'),
    pinned: boolean('pinned').notNull().default(false),
    context: jsonb('context').$type<ConversationContext>().notNull().default(sql`'{}'::jsonb`),
    /** Resumen de lo conversado, que sobrevive cuando el historial se recorta. */
    summary: text('summary').notNull().default(''),
    /** Último mensaje que ya repasó el aprendizaje automático. */
    learnedSeq: integer('learned_seq').notNull().default(0),
    messageCount: integer('message_count').notNull().default(0),
    lastMessageAt: ts('last_message_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('conversations_org_user_last_idx').on(t.orgId, t.userId, t.lastMessageAt),
    index('conversations_org_assistant_idx').on(t.orgId, t.assistantId),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    /** Orden monotónico dentro de la conversación (único). */
    seq: integer('seq').notNull(),
    role: text('role').$type<MessageRole>().notNull(),
    /**
     * 'local' (intérprete sin costo), 'ai' (modelo) o 'system'. En los mensajes de la persona dice
     * por dónde se resolvió su pedido: los 'user' + 'ai' son los turnos de IA del tope diario.
     */
    source: text('source').$type<MessageSource>().notNull().default('ai'),
    parts: jsonb('parts').$type<MessagePart[]>().notNull().default(sql`'[]'::jsonb`),
    /** Texto plano para búsqueda (accent-insensitive con `folded`). */
    text: text('text').notNull().default(''),
    /** reasoning_content del modelo (interno, nunca expuesto). */
    reasoning: text('reasoning'),
    /** tool_calls del modelo en formato del proveedor (para reenviar el historial tal cual). */
    toolCalls: jsonb('tool_calls').$type<StoredToolCall[] | null>(),
    /** Mensaje role 'tool': id de la llamada que responde. */
    toolCallId: text('tool_call_id'),
    model: text('model'),
    credits: integer('credits').notNull().default(0),
    tokensIn: integer('tokens_in'),
    tokensCached: integer('tokens_cached'),
    tokensOut: integer('tokens_out'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('messages_conversation_seq_uq').on(t.conversationId, t.seq),
    index('messages_org_conversation_seq_idx').on(t.orgId, t.conversationId, t.seq),
    index('messages_org_created_idx').on(t.orgId, t.createdAt),
  ],
)

export const memories = pgTable(
  'memories',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    scope: text('scope').$type<MemoryScope>().notNull(),
    /** Persona dueña (alcances 'assistant' y 'user'). */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Asistente (alcance 'assistant'). */
    assistantId: text('assistant_id').references(() => assistants.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<MemoryKind>().notNull().default('fact'),
    content: text('content').notNull(),
    source: text('source').$type<MemorySource>().notNull().default('explicit'),
    pinned: boolean('pinned').notNull().default(false),
    sourceMessageId: text('source_message_id').references(() => messages.id, { onDelete: 'set null' }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastUsedAt: ts('last_used_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('memories_org_scope_user_idx').on(t.orgId, t.scope, t.userId), index('memories_org_assistant_idx').on(t.orgId, t.assistantId)],
)

export const toolRuns = pgTable(
  'tool_runs',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    /** En nombre de quién (quien conversa; al aprobar, la autoridad es la de quien aprueba). */
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    assistantId: text('assistant_id').references(() => assistants.id, { onDelete: 'set null' }),
    conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
    /** Id de la llamada del modelo (o del intérprete local): único por organización. */
    toolCallId: text('tool_call_id').notNull(),
    tool: text('tool').notNull(),
    risk: text('risk').$type<ToolRisk>().notNull(),
    mode: text('mode').$type<AssistantMode>().notNull(),
    executor: text('executor').$type<ToolExecutor>().notNull().default('server'),
    status: text('status').$type<ToolRunStatus>().notNull().default('proposed'),
    args: jsonb('args').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    argsHash: text('args_hash').notNull(),
    preview: jsonb('preview').$type<ToolPreview | null>(),
    result: jsonb('result').$type<unknown>(),
    error: jsonb('error').$type<ToolError | null>(),
    undo: jsonb('undo').$type<ToolUndoData | null>(),
    affected: jsonb('affected').$type<AffectedEntity[] | null>(),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: ts('decided_at'),
    expiresAt: ts('expires_at'),
    executedAt: ts('executed_at'),
    undoneAt: ts('undone_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('tool_runs_org_tool_call_uq').on(t.orgId, t.toolCallId),
    index('tool_runs_org_conversation_idx').on(t.orgId, t.conversationId, t.createdAt),
    index('tool_runs_org_status_idx').on(t.orgId, t.status, t.createdAt),
  ],
)
