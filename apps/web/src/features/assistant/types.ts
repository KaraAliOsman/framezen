/**
 * Tipos del panel del asistente en el navegador. La conversación «de verdad» vive en el servidor
 * (mensajes con partes tipadas y registro de herramientas, ver @dekopen/shared › assistant-v2);
 * aquí está la vista: entradas de la conversación con su línea de actividad, propuestas, recibos de
 * los comandos locales (con deshacer en memoria), tarjetas y avisos.
 */
import type { PriceExplanationLine } from '@dekopen/engine'
import type { QuoteStatus, ToolRisk, ToolRunStatus } from '@dekopen/shared'
import type { AttachmentView } from './attachments/types'

export interface PriceCard {
  kind: 'price'
  ref: string
  title: string
  size: string
  qty: number
  unitNet: number
  totalNet: number
  /** Desglose del motor; vacío si la persona no ve costos. */
  lines: PriceExplanationLine[]
  warnings: string[]
}

export interface ResultsCard {
  kind: 'results'
  query: string
  quotes: { id: string; number: number; title: string; clientName?: string; total: number; status: QuoteStatus }[]
  clients: { id: string; name: string; quotesCount?: number; city?: string }[]
}

export type AssistantCard = PriceCard | ResultsCard

/** Aprobación pedida por el ejecutor local (envío de la cotización desde un comando). */
export interface ApprovalRequest {
  title: string
  lines: string[]
  confirmLabel: string
}

export interface ApprovalView extends ApprovalRequest {
  id: string
  status: 'pending' | 'approved' | 'declined'
}

/** Recibo de una acción hecha en el navegador (comando local), con su deshacer en memoria. */
export interface ReceiptView {
  id: string
  text: string
  /** Hay una función de deshacer registrada (no sobrevive a recargar). */
  undoable: boolean
  undone?: boolean
}

export interface StepView {
  id: string
  label: string
  done: boolean
}

/** Fila de la línea de actividad de una herramienta que corrió en el servidor. */
export interface ActivityView {
  /** toolCallId (o id del registro si no hay llamada). */
  id: string
  toolRunId?: string
  tool: string
  risk?: ToolRisk
  status: 'running' | ToolRunStatus
  /** Frase del servidor («Agregué V3: corredera 1.500 × 1.200»), si vino. */
  summary?: string
  error?: string
  /** Cuántos tramos de texto iban cuando ocurrió: da el orden dentro de la respuesta. */
  at?: number
}

export type NoticeLevel = 'info' | 'warning' | 'error'

export interface NoticeView {
  id: string
  level: NoticeLevel
  code: string
  text: string
}

export type EntryStatus = 'pending' | 'streaming' | 'done' | 'error' | 'stopped'

export interface ChatEntry {
  /** Id del mensaje del servidor, o uno local mientras no llega. */
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Tramos del texto, en orden (`text` es su unión): entre ellos van las herramientas. */
  parts?: string[]
  at: number
  /** Orden del primer mensaje del servidor que forma esta entrada (paginación). */
  seq?: number
  status?: EntryStatus
  /** Archivos que la persona adjuntó. */
  attachments?: AttachmentView[]
  /** Cómo se resolvió: comando local (gratis), IA (créditos) o sistema. */
  source?: 'local' | 'ai' | 'system'
  credits?: number
  /** «Entendí: …» del intérprete local. */
  interpretation?: string
  /** Actividad de herramientas del servidor (en orden). */
  activity?: ActivityView[]
  /** Propuestas pendientes o decididas (ids del registro de herramientas). */
  approvals?: string[]
  /** Tramos de texto que iban cuando llegó cada propuesta. */
  approvalAt?: Record<string, number>
  /** Recibos de comandos locales (deshacer en el navegador). */
  receipts?: ReceiptView[]
  cards?: AssistantCard[]
  /** Aprobación del ejecutor local (envío desde un comando). */
  approval?: ApprovalView
  steps?: StepView[]
  /** Supuestos («Tomé 60 × 120 como centímetros»). */
  notes?: string[]
  notices?: NoticeView[]
  /** Texto que la persona puede reenviar con «Reintentar» (turno con IA que falló). */
  retryText?: string
  /** Opciones para completar un comando al que le faltó un dato: cada una es un comando completo. */
  quickReplies?: QuickReply[]
}

export interface QuickReply {
  label: string
  detail?: string
  /** Comando completo que se ejecuta al elegirla. */
  text: string
}
