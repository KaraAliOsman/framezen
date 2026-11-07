/**
 * Conversaciones, mensajes (con partes tipadas), memoria y registro de herramientas.
 * El servidor es la fuente de verdad: guarda el historial, decide qué se ejecuta y nunca expone
 * el razonamiento interno del modelo (reasoning_content) ni datos que el rol no puede ver.
 */
import { z } from 'zod'
import { assistantLocaleSchema, assistantModeSchema, type AssistantLocale, type AssistantMode, type ToolRisk } from './policy'

// ── Entidades afectadas e instrucciones de interfaz ──────────────────────────

export const AFFECTED_TYPES = ['quote', 'client', 'work_order', 'catalog', 'settings', 'org', 'template', 'texture', 'assistant', 'memory'] as const
export type AffectedType = (typeof AFFECTED_TYPES)[number]

/** Lo que la web debe volver a pedir tras una acción (y, si viene, la versión nueva). */
export interface AffectedEntity {
  type: AffectedType
  id?: string
  version?: number
}

/** Destinos de navegación (rutas registradas; nunca URLs libres). */
export const UI_NAV_TARGETS = [
  'home',
  'quotes',
  'quote',
  'clients',
  'client',
  'workshop',
  'work_order',
  'catalog',
  'documents',
  'template',
  'settings',
  'company',
  'pricing',
  'plan',
  'team',
  'assistants',
] as const
export type UiNavTarget = (typeof UI_NAV_TARGETS)[number]

export const UI_DIALOGS = ['send_quote', 'new_quote', 'new_client', 'import_prices', 'texture_upload', 'assistant_editor', 'memory_manager'] as const
export type UiDialog = (typeof UI_DIALOGS)[number]

/**
 * Herramientas de interfaz: se envían al navegador como eventos `ui` y no bloquean el bucle.
 * El navegador valida y puede ignorarlas (p. ej. si hay un formulario sin guardar).
 */
export type UiAction =
  | { kind: 'navigate'; to: UiNavTarget; id?: string }
  | { kind: 'open_quote'; quoteId: string; itemId?: string }
  | { kind: 'select_item'; quoteId?: string; itemId: string }
  | { kind: 'highlight'; target: AffectedType; id: string; fields?: string[] }
  | { kind: 'open_document_editor'; quoteId?: string; templateId?: string }
  | { kind: 'open_template_editor'; templateId: string }
  | { kind: 'open_dialog'; dialog: UiDialog; id?: string }
  | { kind: 'set_locale'; locale: AssistantLocale }
  | { kind: 'set_zoom'; percent: number }
  | { kind: 'download_quote_pdf'; quoteId: string; number: number }
  | { kind: 'open_cuts'; quoteId?: string; workOrderId?: string; parts?: string[] }
  | { kind: 'download_cuts'; quoteId?: string; workOrderId?: string; parts?: string[] }
  | { kind: 'set_theme'; theme: 'light' | 'dark' | 'original' | 'system' }
  | { kind: 'open_work_order'; workOrderId: string; tab?: string }
  | { kind: 'download_work_order_doc'; workOrderId: string; doc: string; number: number }
  | { kind: 'download_catalog_pdf'; lineIds?: string[]; title?: string }

const idSchema = z.string().min(1).max(64)

export const uiActionSchema: z.ZodType<UiAction> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('navigate'), to: z.enum(UI_NAV_TARGETS), id: idSchema.optional() }).strict(),
  z.object({ kind: z.literal('open_quote'), quoteId: idSchema, itemId: idSchema.optional() }).strict(),
  z.object({ kind: z.literal('select_item'), quoteId: idSchema.optional(), itemId: idSchema }).strict(),
  z.object({ kind: z.literal('highlight'), target: z.enum(AFFECTED_TYPES), id: idSchema, fields: z.array(z.string().max(64)).max(20).optional() }).strict(),
  z.object({ kind: z.literal('open_document_editor'), quoteId: idSchema.optional(), templateId: idSchema.optional() }).strict(),
  z.object({ kind: z.literal('open_template_editor'), templateId: idSchema }).strict(),
  z.object({ kind: z.literal('open_dialog'), dialog: z.enum(UI_DIALOGS), id: idSchema.optional() }).strict(),
  z.object({ kind: z.literal('set_locale'), locale: assistantLocaleSchema }).strict(),
  z.object({ kind: z.literal('download_quote_pdf'), quoteId: z.string().min(1).max(64), number: z.number().int().min(0) }).strict(),
  z.object({ kind: z.literal('set_zoom'), percent: z.number().int().min(50).max(200) }).strict(),
  z.object({ kind: z.literal('open_cuts'), quoteId: z.string().min(1).max(64).optional(), workOrderId: z.string().min(1).max(64).optional(), parts: z.array(z.string().min(1).max(24)).max(8).optional() }).strict(),
  z.object({ kind: z.literal('download_cuts'), quoteId: z.string().min(1).max(64).optional(), workOrderId: z.string().min(1).max(64).optional(), parts: z.array(z.string().min(1).max(24)).max(8).optional() }).strict(),
  z.object({ kind: z.literal('set_theme'), theme: z.enum(['light', 'dark', 'original', 'system']) }).strict(),
  z.object({ kind: z.literal('open_work_order'), workOrderId: idSchema, tab: z.string().min(1).max(24).optional() }).strict(),
  z.object({ kind: z.literal('download_work_order_doc'), workOrderId: idSchema, doc: z.string().min(1).max(24), number: z.number().int().min(0) }).strict(),
  z.object({ kind: z.literal('download_catalog_pdf'), lineIds: z.array(z.string().min(1).max(64)).max(30).optional(), title: z.string().max(120).optional() }).strict(),
])

// ── Archivos adjuntos ────────────────────────────────────────────────────────

export const ATTACHMENT_KINDS = ['image', 'pdf', 'document', 'spreadsheet', 'text'] as const
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

// ── Registro de herramientas (tool_runs) ─────────────────────────────────────

/**
 * Ciclo de vida: proposed → approved → executed → undone
 *                proposed → rejected | expired;  approved → failed
 * En Acceso total una escritura nace `approved` y pasa directo a `executed`.
 */
export const TOOL_RUN_STATUSES = ['proposed', 'approved', 'rejected', 'executed', 'failed', 'undone', 'expired'] as const
export type ToolRunStatus = (typeof TOOL_RUN_STATUSES)[number]

export const TOOL_RUN_TRANSITIONS: Record<ToolRunStatus, readonly ToolRunStatus[]> = {
  proposed: ['approved', 'rejected', 'expired'],
  approved: ['executed', 'failed'],
  rejected: [],
  executed: ['undone'],
  failed: [],
  undone: [],
  expired: [],
}

export function canTransitionToolRun(from: ToolRunStatus, to: ToolRunStatus): boolean {
  return TOOL_RUN_TRANSITIONS[from].includes(to)
}

/** Vigencia de una propuesta en Supervisado antes de expirar. */
export const TOOL_RUN_APPROVAL_TTL_MS = 10 * 60_000

export type ToolExecutor = 'server' | 'browser' | 'local'

export interface ToolError {
  code: string
  message: string
}

/** Diferencia legible para la tarjeta de aprobación (antes → después), calculada por el servidor. */
export interface ToolPreview {
  title: string
  lines: string[]
  changes?: { field: string; label: string; before?: string; after?: string }[]
  /** Totales antes/después cuando la acción cambia precios (siempre del motor). */
  totals?: { before?: number; after?: number; currency: string }
  /** Qué no se puede deshacer (correo enviado, enlace público…). */
  irreversible?: string
}

export interface ToolRun {
  id: string
  conversationId?: string
  assistantId?: string
  messageId?: string
  toolCallId: string
  tool: string
  risk: ToolRisk
  mode: AssistantMode
  executor: ToolExecutor
  status: ToolRunStatus
  /** Argumentos normalizados (lo que se aprueba es exactamente esto). */
  args: Record<string, unknown>
  /** Huella de `args`: la aprobación debe traerla (protección contra repetición/cambio). */
  argsHash: string
  preview?: ToolPreview
  result?: unknown
  error?: ToolError
  affected?: AffectedEntity[]
  undoable: boolean
  expiresAt?: string
  decidedAt?: string
  executedAt?: string
  undoneAt?: string
  createdAt: string
}

// ── Mensajes ─────────────────────────────────────────────────────────────────

/** Llamada producida por el intérprete local (cero créditos). */
export interface LocalToolCall {
  id: string
  tool: string
  args: Record<string, unknown>
}

export interface LocalPlan {
  /** «Entendí: …» ya localizado. */
  interpretation: string
  calls: LocalToolCall[]
  /** 0..1 */
  confidence: number
}

export type MessagePart =
  | { type: 'text'; text: string }
  | {
      type: 'tool_call'
      toolCallId: string
      tool: string
      args: Record<string, unknown>
      risk: ToolRisk
      status: ToolRunStatus
      toolRunId?: string
      /** Frase corta para la línea de actividad («Agregué V3: corredera 1.500 × 1.200»). */
      summary?: string
    }
  | { type: 'tool_result'; toolCallId: string; tool: string; ok: boolean; summary?: string; data?: unknown; error?: ToolError }
  | {
      type: 'approval'
      toolRunId: string
      tool: string
      risk: ToolRisk
      preview: ToolPreview
      argsHash: string
      expiresAt: string
      status: 'pending' | 'approved' | 'rejected' | 'expired'
    }
  | { type: 'notice'; level: 'info' | 'warning' | 'error'; code: string; text: string }
  | { type: 'local_plan'; plan: LocalPlan }
  | {
      type: 'attachment'
      name: string
      kind: AttachmentKind
      pages?: number
      readPages?: number
      truncated?: boolean
      /** Lo leído del archivo. Solo en el servidor: nunca sale en un `Message`. */
      content?: { text?: string; images?: string[] }
    }

export type MessagePartType = MessagePart['type']

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system_note'
/**
 * De dónde salió: intérprete local (gratis), modelo (créditos) o el sistema. En un mensaje de la
 * persona indica cómo se resolvió su pedido ('ai' = fue al modelo y cuenta para el tope diario).
 */
export type MessageSource = 'local' | 'ai' | 'system'

export interface Message {
  id: string
  conversationId: string
  seq: number
  role: MessageRole
  source: MessageSource
  parts: MessagePart[]
  createdAt: string
  /** Créditos de esta respuesta (0 para local). */
  credits?: number
  model?: string
}

/** Texto plano de un mensaje (para búsqueda, títulos y vistas compactas). */
export function messageText(parts: readonly MessagePart[]): string {
  return parts
    .map((p) => (p.type === 'text' ? p.text : p.type === 'notice' ? p.text : p.type === 'local_plan' ? p.plan.interpretation : p.type === 'tool_result' || p.type === 'tool_call' ? (p.summary ?? '') : ''))
    .filter(Boolean)
    .join('\n')
}

// ── Conversaciones ───────────────────────────────────────────────────────────

export interface ConversationContext {
  route?: string
  quoteId?: string
  clientId?: string
  /** Razonamiento del último turno: una continuación tras aprobar usa el mismo. */
  effort?: 'low' | 'high' | 'xhigh' | 'max'
}

export interface Conversation {
  id: string
  assistantId?: string
  title: string
  /** 'auto' = primer pedido (sin IA, determinista); 'user' = la persona lo renombró. */
  titleSource: 'auto' | 'user'
  mode: AssistantMode
  pinned: boolean
  context: ConversationContext
  messageCount: number
  lastMessageAt: string
  createdAt: string
  updatedAt: string
}

/** Fila de la lista/búsqueda (con un fragmento si coincidió el texto). */
export interface ConversationSummary extends Conversation {
  snippet?: string
}

// ── Memoria ──────────────────────────────────────────────────────────────────

/**
 * Alcances: 'assistant' = esta persona con este asistente (por defecto); 'user' = esta persona con
 * todos sus asistentes; 'org' = toda la empresa (solo quien administra la escribe). Nunca se
 * comparte entre organizaciones.
 */
export const MEMORY_SCOPES = ['assistant', 'user', 'org'] as const
export type MemoryScope = (typeof MEMORY_SCOPES)[number]

/**
 * 'fact' = dato estable; 'preference' = cómo le gusta trabajar; 'instruction' = una regla que dio;
 * 'procedure' = cómo se resuelve un pedido que ya salió bien o que corrigió.
 */
export const MEMORY_KINDS = ['fact', 'preference', 'instruction', 'procedure'] as const
export type MemoryKind = (typeof MEMORY_KINDS)[number]

/** 'explicit' = la persona lo pidió («recuerda que…»); 'auto' = el asistente detectó un dato durable. */
export type MemorySource = 'explicit' | 'auto'

export const MEMORY_LIMITS = { contentMax: 1000 } as const

export interface Memory {
  id: string
  scope: MemoryScope
  kind: MemoryKind
  content: string
  source: MemorySource
  pinned: boolean
  assistantId?: string
  userId?: string
  /** Conversación de origen (para «¿por qué recuerdas esto?»), si la persona puede verla. */
  sourceConversationId?: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  canEdit: boolean
}

// ── Esquemas de entrada ──────────────────────────────────────────────────────

export const memoryCreateBodySchema = z
  .object({
    scope: z.enum(MEMORY_SCOPES).default('assistant'),
    kind: z.enum(MEMORY_KINDS).default('fact'),
    content: z.string().trim().min(1).max(MEMORY_LIMITS.contentMax),
    pinned: z.boolean().default(false),
    assistantId: idSchema.optional(),
  })
  .strict()
export type MemoryCreateBody = z.input<typeof memoryCreateBodySchema>

export const memoryPatchBodySchema = z
  .object({
    content: z.string().trim().min(1).max(MEMORY_LIMITS.contentMax).optional(),
    kind: z.enum(MEMORY_KINDS).optional(),
    pinned: z.boolean().optional(),
  })
  .strict()
export type MemoryPatchBody = z.input<typeof memoryPatchBodySchema>

export const conversationPatchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
    mode: assistantModeSchema.optional(),
  })
  .strict()
export type ConversationPatchBody = z.input<typeof conversationPatchBodySchema>
