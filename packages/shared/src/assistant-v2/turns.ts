/**
 * Turnos del asistente v2.
 *
 * - POST /api/assistant/v2/turns (TurnRequest) responde un flujo SSE de `TurnEvent`.
 * - POST /api/assistant/v2/local-turns (LocalTurnRequest) registra/ejecuta un comando local
 *   (cero créditos) y responde JSON con los mismos eventos.
 * - POST …/tool-runs/:id/approve y …/reject continúan el turno pausado: también responden SSE.
 *
 * El navegador envía SOLO texto + ids de estado de la interfaz. Nunca historial, prompt,
 * herramientas ni resultados: el servidor es dueño de la conversación y del prompt de sistema.
 */
import { z } from 'zod'
import {
  ATTACHMENT_KINDS,
  uiActionSchema,
  type AffectedEntity,
  type AttachmentKind,
  type Conversation,
  type LocalPlan,
  type Message,
  type ToolError,
  type ToolRun,
  type UiAction,
} from './conversation'
import { assistantLocaleSchema, assistantModeSchema, type AssistantLocale, type AssistantMode } from './policy'

export const TURN_LIMITS = {
  textMax: 4000,
  routeMax: 300,
  /** Argumentos de UNA llamada de un plan local (JSON). El plan se guarda en el historial. */
  localArgsMaxChars: 20_000,
  /** Todos los argumentos de un plan local juntos (JSON). */
  localPlanMaxChars: 64_000,
} as const

/**
 * Archivos de un turno. El navegador los lee y manda lo extraído: texto e imágenes reducidas,
 * nunca el archivo original.
 */
export const ATTACHMENT_LIMITS = {
  files: 8,
  nameMax: 160,
  /** Texto extraído de un archivo y de todos los del turno. */
  fileChars: 80_000,
  turnChars: 120_000,
  /** Imágenes (fotos o páginas) del turno y tamaño de cada una como data URL. */
  images: 12,
  imageChars: 1_600_000,
} as const

export interface TurnAttachment {
  name: string
  kind: AttachmentKind
  text?: string
  /** Data URLs de imagen. */
  images?: string[]
  /** Páginas del documento y cuántas se leyeron. */
  pages?: number
  readPages?: number
  /** No se alcanzó a leer entero. */
  truncated?: boolean
}

const jsonChars = (value: unknown): number => {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/** Cuánto piensa el modelo antes de responder. Más razonamiento, más precisión y más demora. */
export const THINKING_EFFORTS = ['low', 'high', 'xhigh', 'max'] as const
export type ThinkingEffort = (typeof THINKING_EFFORTS)[number]
export const DEFAULT_THINKING_EFFORT: ThinkingEffort = 'high'

/** Vistas del editor de cotización. */
export const QUOTE_VIEWS = ['design', 'document'] as const
export type QuoteView = (typeof QUOTE_VIEWS)[number]

/** Lo que la persona está viendo (ids; el servidor resuelve todo y lo trata como pista). */
export interface TurnUiState {
  route: string
  quoteId?: string
  selectedItemId?: string
  /** Pestaña abierta del editor de cotización. */
  quoteView?: QuoteView
  /** Plantilla abierta en el editor de documentos. */
  templateId?: string
  /** OT abierta en el taller. */
  workOrderId?: string
  locale: AssistantLocale
}

export interface TurnRequest {
  /** Sin id = conversación nueva. */
  conversationId?: string
  /** Sin id = asistente por defecto. */
  assistantId?: string
  /** Puede ir vacío si viene con archivos. */
  text: string
  attachments?: TurnAttachment[]
  /** Modo pedido; el servidor lo acota al máximo permitido (plan, rol, asistente). */
  mode: AssistantMode
  /** Razonamiento pedido para este turno. */
  effort?: ThinkingEffort
  ui: TurnUiState
  /** Idempotencia: el mismo id no crea dos turnos (reintentos de red). */
  clientTurnId?: string
}

const idSchema = z.string().min(1).max(64)

export const turnUiStateSchema = z
  .object({
    route: z.string().max(TURN_LIMITS.routeMax),
    quoteId: idSchema.optional(),
    selectedItemId: idSchema.optional(),
    quoteView: z.enum(QUOTE_VIEWS).optional(),
    templateId: idSchema.optional(),
    workOrderId: idSchema.optional(),
    locale: assistantLocaleSchema,
  })
  .strict()

const attachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(ATTACHMENT_LIMITS.nameMax),
    kind: z.enum(ATTACHMENT_KINDS),
    text: z.string().max(ATTACHMENT_LIMITS.fileChars).optional(),
    images: z.array(z.string().max(ATTACHMENT_LIMITS.imageChars)).max(ATTACHMENT_LIMITS.images).optional(),
    pages: z.number().int().min(0).max(100_000).optional(),
    readPages: z.number().int().min(0).max(100_000).optional(),
    truncated: z.boolean().optional(),
  })
  .strict()
  .refine((a) => Boolean(a.text?.trim()) || Boolean(a.images?.length), 'empty attachment')

const turnBaseSchema = z
  .object({
    conversationId: idSchema.optional(),
    assistantId: idSchema.optional(),
    text: z.string().trim().min(1).max(TURN_LIMITS.textMax),
    mode: assistantModeSchema,
    // El panel lo manda siempre; en un turno local no cambia nada.
    effort: z.enum(THINKING_EFFORTS).optional(),
    ui: turnUiStateSchema,
    clientTurnId: z.string().min(1).max(80).optional(),
  })
  .strict()

export const turnRequestSchema = turnBaseSchema
  .extend({
    text: z.string().trim().max(TURN_LIMITS.textMax),
    attachments: z.array(attachmentSchema).max(ATTACHMENT_LIMITS.files).optional(),
  })
  .refine((turn) => turn.text.length > 0 || Boolean(turn.attachments?.length), 'empty turn')
  .refine((turn) => (turn.attachments ?? []).reduce((n, a) => n + (a.text?.length ?? 0), 0) <= ATTACHMENT_LIMITS.turnChars, 'attachments too long')
  .refine((turn) => (turn.attachments ?? []).reduce((n, a) => n + (a.images?.length ?? 0), 0) <= ATTACHMENT_LIMITS.images, 'too many images')

/** Comando resuelto por el intérprete local (NLU) del navegador: cero créditos. */
export interface LocalTurnRequest extends TurnRequest {
  plan: LocalPlan
  /**
   * Respuesta determinista ya armada en el navegador para comandos sin herramientas (ayuda,
   * estadísticas locales, «no entendí…»). Se guarda tal cual en el historial.
   */
  reply?: string
}

export const localTurnRequestSchema = turnBaseSchema.extend({
  plan: z
    .object({
      interpretation: z.string().max(500),
      calls: z
        .array(
          z
            .object({
              id: z.string().min(1).max(80),
              tool: z.string().min(1).max(64),
              args: z.record(z.string(), z.unknown()).refine((args) => jsonChars(args) <= TURN_LIMITS.localArgsMaxChars, 'arguments too large'),
            })
            .strict(),
        )
        .max(24)
        .refine((calls) => jsonChars(calls) <= TURN_LIMITS.localPlanMaxChars, 'plan too large'),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  reply: z.string().max(4000).optional(),
})

export interface LocalTurnResponse {
  conversation: Conversation
  messages: Message[]
  toolRuns: ToolRun[]
  /** Mismos eventos que el flujo SSE (ui, affected, tool.*, notice…), ya resueltos. */
  events: TurnEvent[]
}

/** POST …/tool-runs/:id/approve — trae la huella de lo que la persona vio. */
export interface ToolRunApproveBody {
  argsHash: string
}
export const toolRunApproveBodySchema = z.object({ argsHash: z.string().min(8).max(128) }).strict()

/** POST …/tool-runs/:id/reject */
export interface ToolRunRejectBody {
  reason?: string
}
export const toolRunRejectBodySchema = z.object({ reason: z.string().trim().max(500).optional() }).strict()

/** POST …/tool-runs/:id/undo → JSON. */
export interface ToolRunUndoResponse {
  toolRun: ToolRun
  affected: AffectedEntity[]
}

// ── Eventos del flujo (SSE) ──────────────────────────────────────────────────

export type TurnDoneReason = 'completed' | 'approval_required' | 'limit' | 'aborted' | 'error'

export type TurnEvent =
  /** Primer evento: la conversación (nueva o existente) y el mensaje de la persona ya guardado. */
  | { type: 'turn.started'; conversation: Conversation; userMessage: Message; assistantMessageId: string }
  /** Texto visible en streaming (nunca el razonamiento interno). */
  | { type: 'message.delta'; messageId: string; text: string }
  | { type: 'message.done'; message: Message }
  /** Propuesta pendiente de aprobación (Supervisado, o riesgo externo/producción/destructivo). */
  | { type: 'tool.proposed'; toolRun: ToolRun }
  | { type: 'tool.executed'; toolRun: ToolRun }
  | { type: 'tool.failed'; toolRun: ToolRun; error: ToolError }
  /** Herramienta de interfaz para el navegador (no bloquea el bucle). */
  | { type: 'ui'; toolCallId: string; action: UiAction }
  /** Entidades que la web debe volver a pedir (el editor guarda antes del turno y recarga después). */
  | { type: 'affected'; entities: AffectedEntity[] }
  | { type: 'credits'; used: number; left: number; turnTotal: number }
  | { type: 'notice'; level: 'info' | 'warning'; code: string; message: string }
  | { type: 'error'; code: string; message: string; retryable: boolean }
  | { type: 'done'; reason: TurnDoneReason; conversationId: string; creditsUsed: number }

export type TurnEventType = TurnEvent['type']

export const TURN_EVENT_TYPES = [
  'turn.started',
  'message.delta',
  'message.done',
  'tool.proposed',
  'tool.executed',
  'tool.failed',
  'ui',
  'affected',
  'credits',
  'notice',
  'error',
  'done',
] as const satisfies readonly TurnEventType[]

/** Valida un evento `ui` recibido (el navegador nunca ejecuta una acción que no calce). */
export function parseUiAction(value: unknown): UiAction | null {
  const parsed = uiActionSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Una línea SSE por evento: `event: <type>`, `id: <n>`, `data: <json>` y línea en blanco. */
export function encodeTurnEvent(event: TurnEvent, id?: number | string): string {
  const data = JSON.stringify(event)
  return `event: ${event.type}\n${id !== undefined ? `id: ${id}\n` : ''}data: ${data}\n\n`
}

/**
 * Lector incremental de un flujo SSE de `TurnEvent` (navegador y pruebas). Acepta trozos
 * arbitrarios (CRLF o LF), ignora comentarios (`: ping`) y eventos con JSON inválido.
 */
export class TurnEventStreamParser {
  private buffer = ''

  /** Agrega un trozo y devuelve los eventos completos que haya. */
  push(chunk: string): TurnEvent[] {
    this.buffer += chunk
    const events: TurnEvent[] = []
    for (;;) {
      const match = /\r?\n\r?\n/.exec(this.buffer)
      if (!match) break
      const block = this.buffer.slice(0, match.index)
      this.buffer = this.buffer.slice(match.index + match[0].length)
      const event = parseBlock(block)
      if (event) events.push(event)
    }
    return events
  }

  /** Cierra el flujo: procesa lo que quedó sin línea en blanco final. */
  end(): TurnEvent[] {
    const rest = this.buffer
    this.buffer = ''
    const event = rest.trim() ? parseBlock(rest) : null
    return event ? [event] : []
  }
}

function parseBlock(block: string): TurnEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
  if (!data) return null
  try {
    const parsed = JSON.parse(data) as { type?: unknown }
    return typeof parsed?.type === 'string' && (TURN_EVENT_TYPES as readonly string[]).includes(parsed.type) ? (parsed as TurnEvent) : null
  } catch {
    return null
  }
}
