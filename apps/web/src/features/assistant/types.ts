/**
 * Tipos del panel de Marco en el navegador: recibos de acciones, tarjetas (precio, resultados,
 * aprobación) y entradas de la conversación.
 */
import type { PriceExplanationLine } from '@framezen/engine'
import type { QuoteStatus } from '@framezen/shared'

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

export interface ApprovalRequest {
  title: string
  lines: string[]
  confirmLabel: string
}

export interface ApprovalView extends ApprovalRequest {
  id: string
  status: 'pending' | 'approved' | 'declined'
}

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

export interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  at: number
  status?: 'pending' | 'done' | 'error' | 'stopped'
  receipts?: ReceiptView[]
  cards?: AssistantCard[]
  approval?: ApprovalView
  steps?: StepView[]
  /** Supuestos («Tomé 60 × 120 como centímetros»). */
  notes?: string[]
  /** Aviso discreto del modo («Seguí en modo local…»). */
  notice?: string
  mode?: 'ai' | 'local'
}
