/**
 * Puente entre Marco (asistente) y las pantallas que puede operar.
 * El editor de cotizaciones se registra al montarse; el asistente ejecuta sus
 * herramientas a través de este puente, sobre el estado real (con deshacer).
 */
import type { Catalog, Id, WindowDesign } from '@framezen/engine'
import type { Quote, QuoteItem } from '@framezen/shared'

export interface QuoteEditorBridge {
  quoteId: Id
  getQuote(): Quote
  getCatalog(): Catalog
  selectedItemId(): Id | null
  /** Agrega un ítem y devuelve su id. Si la galería «Agregar ventana» estaba abierta, la cierra. */
  addItem(design: WindowDesign, opts?: { qty?: number; location?: string; ref?: string; name?: string }): Id
  updateItem(itemId: Id, patch: Partial<Omit<QuoteItem, 'id' | 'design'>>): void
  updateDesign(itemId: Id, fn: (design: WindowDesign) => WindowDesign): void
  removeItem(itemId: Id): void
  duplicateItem(itemId: Id): Id
  setDiscount(pct: number): void
  setTitle(title: string): void
  setClient(clientId: Id | null): void
  selectItem(itemId: Id): void
  showDocument(): void
  showDesign(): void
}

let current: QuoteEditorBridge | null = null
const listeners = new Set<(bridge: QuoteEditorBridge | null) => void>()

export function registerQuoteEditor(bridge: QuoteEditorBridge): () => void {
  current = bridge
  listeners.forEach((fn) => fn(current))
  return () => {
    if (current === bridge) {
      current = null
      listeners.forEach((fn) => fn(current))
    }
  }
}

export function getQuoteEditor(): QuoteEditorBridge | null {
  return current
}

export function onQuoteEditorChange(fn: (bridge: QuoteEditorBridge | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
